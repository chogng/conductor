#!/usr/bin/env python3
import argparse
import csv
import json
import math
from datetime import datetime
from pathlib import Path

from origin_ops.axis_ops import apply_axis_commands
from origin_ops.capability_dispatcher import (
    parse_capabilities_json,
    resolve_capability_plan,
)
from origin_ops.import_ops import run_csv_import
from origin_ops.origin_session import (
    connect_originpro,
    extract_hresult,
    get_originpro_module,
    run_command_list,
    run_labtalk_or_raise,
)
from origin_ops.plot_ops import build_plot_command, run_plot_pipeline
from origin_ops.style_ops import apply_style_commands


LOG_RANGE_ROBUST_MIN_SAMPLE_COUNT = 50
LOG_RANGE_ROBUST_LOW_QUANTILE = 0.05
LOG_RANGE_PADDING_RATIO = 0.05
LOG_RANGE_PADDING_DECADES_MIN = 0.2
LOG_RANGE_SINGLE_VALUE_PADDING_DECADES = 0.3


def _normalize_axis_command(command: str) -> str:
    text = str(command or "").strip().lower()
    if text.endswith(";"):
        text = text[:-1].strip()
    return text


def _parse_axis_assignment_value(command_text: str, prefix: str):
    if not command_text.startswith(prefix):
        return None
    _, value = command_text.split("=", 1)
    return value.strip()


def _is_log_y_axis_enabled(commands) -> bool:
    if not isinstance(commands, list):
        return False
    for command in commands:
        if not isinstance(command, str):
            continue
        text = _normalize_axis_command(command)
        value = _parse_axis_assignment_value(text, "layer.y.type=")
        if value is None:
            continue
        if value == "2":
            return True
    return False


def _scan_y_axis_command_flags(commands) -> tuple[bool, bool, bool]:
    has_from = False
    has_to = False
    has_rescale = False
    if not isinstance(commands, list):
        return (has_from, has_to, has_rescale)
    for command in commands:
        if not isinstance(command, str):
            continue
        text = _normalize_axis_command(command)
        if text.startswith("layer.y.from="):
            has_from = True
        elif text.startswith("layer.y.to="):
            has_to = True
        elif text.startswith("layer.y.rescale="):
            has_rescale = True
    return (has_from, has_to, has_rescale)


def _compute_csv_positive_y_bounds(csv_path: Path):
    positive_values = []
    with csv_path.open("r", encoding="utf-8-sig", newline="") as file_obj:
        reader = csv.reader(file_obj)
        for row in reader:
            if not isinstance(row, list) or len(row) <= 1:
                continue
            for item in row[1:]:
                text = str(item or "").strip()
                if not text:
                    continue
                try:
                    value = float(text)
                except Exception:
                    continue
                if not (value > 0):
                    continue
                positive_values.append(value)
    if not positive_values:
        return None
    positive_values.sort()
    min_positive = positive_values[0]
    max_positive = positive_values[-1]
    robust_min = min_positive
    if len(positive_values) >= LOG_RANGE_ROBUST_MIN_SAMPLE_COUNT:
        idx = int((len(positive_values) - 1) * LOG_RANGE_ROBUST_LOW_QUANTILE)
        idx = max(0, min(len(positive_values) - 1, idx))
        candidate = positive_values[idx]
        if candidate > 0:
            robust_min = max(min_positive, candidate)
    return (robust_min, max_positive, min_positive, len(positive_values))


def _build_padded_log_bounds(min_positive: float, max_positive: float):
    lo = min(min_positive, max_positive)
    hi = max(min_positive, max_positive)
    if not (lo > 0) or not (hi > 0):
        return None
    log_lo = math.log10(lo)
    log_hi = math.log10(hi)
    if not math.isfinite(log_lo) or not math.isfinite(log_hi):
        return None
    is_single_value = not (log_hi > log_lo)
    pad_decades = (
        LOG_RANGE_SINGLE_VALUE_PADDING_DECADES
        if is_single_value
        else max(LOG_RANGE_PADDING_DECADES_MIN, (log_hi - log_lo) * LOG_RANGE_PADDING_RATIO)
    )
    out_min = math.pow(10.0, log_lo - pad_decades)
    out_max = math.pow(10.0, log_hi + pad_decades)
    if not (out_min > 0) or not (out_max > out_min):
        return None
    return (out_min, out_max)


def _format_lt_number(value: float) -> str:
    if value == 0:
        return "0"
    return format(value, ".16g")


def _format_lt_log_number(value: float) -> str:
    if not (value > 0):
        return _format_lt_number(value)
    mantissa, exponent = f"{value:.16e}".split("e")
    mantissa = mantissa.rstrip("0").rstrip(".")
    if not mantissa:
        mantissa = "0"
    return f"{mantissa}e{int(exponent)}"


def ensure_log_y_axis_range_commands(commands, csv_path: Path, ctx) -> list[str]:
    normalized = []
    if isinstance(commands, list):
        for item in commands:
            if not isinstance(item, str):
                continue
            text = item.strip()
            if text:
                normalized.append(text)

    if not _is_log_y_axis_enabled(normalized):
        return normalized

    has_from, has_to, has_rescale = _scan_y_axis_command_flags(normalized)
    if has_from and has_to:
        if not has_rescale:
            normalized.append("layer.y.rescale=1")
            ctx.log("Axis fallback: appended layer.y.rescale=1.")
        return normalized

    bounds = _compute_csv_positive_y_bounds(csv_path)
    if bounds is None:
        ctx.log("Axis fallback skipped: no positive Y values found for log axis.")
        return normalized

    robust_min_positive, max_positive, raw_min_positive, positive_count = bounds
    padded = _build_padded_log_bounds(robust_min_positive, max_positive)
    if padded is None:
        ctx.log("Axis fallback skipped: invalid positive Y bounds for log axis.")
        return normalized

    y_from = _format_lt_log_number(padded[0])
    y_to = _format_lt_log_number(padded[1])
    normalized.append(f"layer.y.from={y_from}")
    normalized.append(f"layer.y.to={y_to}")
    if not has_rescale:
        normalized.append("layer.y.rescale=1")
    raw_min_text = _format_lt_number(raw_min_positive)
    robust_min_text = _format_lt_number(robust_min_positive)
    max_text = _format_lt_number(max_positive)
    ctx.log(
        "Axis fallback source: "
        f"positiveCount={positive_count}, "
        f"rawMin={raw_min_text}, robustMin={robust_min_text}, max={max_text}."
    )
    ctx.log(f"Axis fallback applied: layer.y.from={y_from}, layer.y.to={y_to}.")
    return normalized


def ensure_dir(path_value: Path) -> None:
    path_value.mkdir(parents=True, exist_ok=True)


def to_iso_now() -> str:
    return datetime.now().astimezone().isoformat()


class CsvContext:
    def __init__(self, work_dir: Path, log_path: Path, error_path: Path, origin_exe: str):
        self.work_dir = work_dir
        self.log_path = log_path
        self.error_path = error_path
        self.origin_exe = origin_exe

    def log(self, message: str) -> None:
        line = f"{datetime.now().strftime('%Y-%m-%d %H:%M:%S.%f')[:-3]} {message}"
        with self.log_path.open("a", encoding="utf-8") as file_obj:
            file_obj.write(line + "\n")

    def write_error(
        self,
        code: str,
        stage: str,
        message: str,
        exc: Exception = None,
        extra: dict = None,
    ) -> None:
        payload = {
            "code": code or "ORIGIN_WORKER_FAILED",
            "stage": stage or "UNKNOWN",
            "message": message or "Origin worker failed.",
            "hresult": extract_hresult(exc) if exc else None,
            "originExe": self.origin_exe,
            "logPath": str(self.log_path),
            "timestamp": to_iso_now(),
        }
        if isinstance(extra, dict):
            payload.update(extra)
        self.error_path.write_text(
            json.dumps(payload, ensure_ascii=False),
            encoding="utf-8",
        )
        self.log(f"ERROR [{payload['stage']}] {payload['code']}: {payload['message']}")
        if payload.get("hresult"):
            self.log(f"HRESULT: {payload['hresult']}")
        raise SystemExit(1)


def parse_args():
    parser = argparse.ArgumentParser(
        description="Run Device Analysis CSV import job in Origin via originpro.",
    )
    parser.add_argument("--work-dir", required=True)
    parser.add_argument("--csv-path", required=True)
    parser.add_argument("--origin-exe", required=True)
    parser.add_argument("--log-path", default="")
    parser.add_argument("--error-path", default="")
    parser.add_argument("--series-name", default="")
    parser.add_argument("--plot-type", type=int, default=202)
    parser.add_argument("--xy-pairs", default="((1,2))")
    parser.add_argument("--plot-command", default="")
    parser.add_argument("--post-plot-command", action="append", default=[])
    parser.add_argument("--line-width", type=float, default=2.0)
    parser.add_argument("--capabilities-json", default="")
    parser.add_argument("--max-com-attempts", type=int, default=8)
    return parser.parse_args()


def main():
    args = parse_args()

    work_dir = Path(args.work_dir).resolve()
    csv_path = Path(args.csv_path).resolve()
    origin_exe_path = Path(args.origin_exe).resolve()
    log_path = Path(args.log_path).resolve() if args.log_path else work_dir / "originbridge.log"
    error_path = Path(args.error_path).resolve() if args.error_path else work_dir / "error.txt"

    ensure_dir(work_dir)
    ensure_dir(log_path.parent)
    ensure_dir(error_path.parent)
    error_path.write_text("", encoding="utf-8")

    ctx = CsvContext(
        work_dir=work_dir,
        log_path=log_path,
        error_path=error_path,
        origin_exe=str(origin_exe_path),
    )

    ctx.log(f"WorkDir: {work_dir}")
    ctx.log(f"CsvPath: {csv_path}")
    ctx.log(f"OriginExe: {origin_exe_path}")

    if not origin_exe_path.exists():
        ctx.write_error(
            code="ORIGIN_EXE_NOT_FOUND",
            stage="PRECHECK",
            message=f"Origin executable not found: {origin_exe_path}",
        )
    if not origin_exe_path.is_file():
        ctx.write_error(
            code="ORIGIN_EXE_NOT_FOUND",
            stage="PRECHECK",
            message=f"Origin executable path is not a file: {origin_exe_path}",
        )
    if not csv_path.exists():
        ctx.write_error(
            code="ORIGIN_CSV_NOT_FOUND",
            stage="PRECHECK",
            message=f"CSV file not found: {csv_path}",
        )
    if not csv_path.is_file():
        ctx.write_error(
            code="ORIGIN_CSV_NOT_FOUND",
            stage="PRECHECK",
            message=f"CSV path is not a file: {csv_path}",
        )

    op_module = get_originpro_module(
        ctx,
        "Failed to import originpro. Ensure originpro is installed in the worker environment.",
    )
    connect_originpro(
        ctx,
        op_module,
        max(1, int(args.max_com_attempts)),
        str(origin_exe_path),
    )

    try:
        capabilities = parse_capabilities_json(args.capabilities_json)
        capability_plan = resolve_capability_plan(capabilities)
    except Exception as exc:
        ctx.write_error(
            code="ORIGIN_CSV_IMPORT_FAILED",
            stage="CAPABILITIES_PARSE",
            message=f"Failed to parse capabilities JSON: {exc}",
            exc=exc if isinstance(exc, Exception) else None,
        )

    requested_series_name = args.series_name.strip() if isinstance(args.series_name, str) else ""
    effective_series_name = capability_plan.workbook_long_name or requested_series_name
    plot_command = build_plot_command(
        capability_plan.plot_command_override or args.plot_command,
        args.xy_pairs,
        args.plot_type,
    )
    legacy_post_plot_commands = [
        item.strip()
        for item in (args.post_plot_command if isinstance(args.post_plot_command, list) else [])
        if isinstance(item, str) and item.strip()
    ]
    all_post_plot_commands = legacy_post_plot_commands + capability_plan.plot_post_commands

    try:
        ctx.log(f"Plot command: {plot_command}")
        if capabilities:
            ctx.log("Capabilities v1 detected.")
        ctx.log(f"Running CSV import via originpro: {csv_path}")

        run_command_list(op_module, capability_plan.global_pre_commands, "Global pre-command")
        run_csv_import(
            op_module,
            csv_path,
            workbook_long_name=effective_series_name,
            import_pre_commands=capability_plan.import_pre_commands,
            import_post_commands=capability_plan.import_post_commands,
            label_prefix="CSV import",
        )
        run_plot_pipeline(
            op_module,
            plot_command,
            graph_pre_commands=capability_plan.graph_pre_commands,
            plot_pre_commands=capability_plan.plot_pre_commands,
            post_plot_commands=all_post_plot_commands,
            plot_error_message="CSV plot failed at plotxy",
            line_width=args.line_width,
        )
        axis_commands = ensure_log_y_axis_range_commands(
            capability_plan.axis_commands,
            csv_path,
            ctx,
        )
        if axis_commands:
            ctx.log(f"Axis commands: {axis_commands}")
        apply_style_commands(op_module, capability_plan.style_commands)
        apply_axis_commands(op_module, axis_commands)
        run_command_list(op_module, capability_plan.graph_post_commands, "Graph post-command")
        run_command_list(op_module, capability_plan.global_post_commands, "Global post-command")
        ctx.log("CSV plot completed.")
    except Exception as exc:
        ctx.write_error(
            code="ORIGIN_CSV_IMPORT_FAILED",
            stage="CSV_IMPORT",
            message=f"CSV import/plot failed: {exc}",
            exc=exc,
        )

    try:
        run_labtalk_or_raise(op_module, "win -a;", "Failed to activate Origin window")
    except Exception as exc:
        ctx.log(f"Window activation warning: {exc}")

    detach = getattr(op_module, "detach", None)
    if callable(detach):
        try:
            detach()
        except Exception as exc:
            ctx.log(f"originpro detach warning: {exc}")

    ctx.log("Origin CSV job completed successfully.")
    error_path.write_text("", encoding="utf-8")
    print(json.dumps({"ok": True, "logPath": str(log_path)}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
