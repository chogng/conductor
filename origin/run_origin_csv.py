#!/usr/bin/env python3
import argparse
import csv
import json
import math
import os
import platform
import sys
import traceback
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
from worker_build_info import (
    format_worker_build_info_text,
    get_worker_build_info_json,
)


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

    def log_exception(self, label: str, exc: Exception) -> None:
        self.log(f"{label}: {type(exc).__name__}: {exc!r}")
        try:
            trace = "".join(
                traceback.format_exception(type(exc), exc, exc.__traceback__)
            ).strip()
        except Exception:
            trace = repr(exc)
        if trace:
            for line in trace.splitlines():
                self.log(f"{label} traceback: {line}")

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
            "workDir": str(self.work_dir),
            "cwd": os.getcwd(),
            "pythonExecutable": sys.executable,
            "pythonVersion": sys.version,
            "platform": platform.platform(),
            "timestamp": to_iso_now(),
        }
        if exc is not None:
            payload.update(
                {
                    "exceptionType": type(exc).__name__,
                    "exceptionRepr": repr(exc),
                    "traceback": "".join(
                        traceback.format_exception(type(exc), exc, exc.__traceback__)
                    ).strip(),
                }
            )
        if isinstance(extra, dict):
            payload.update(extra)
        self.error_path.write_text(
            json.dumps(payload, ensure_ascii=False),
            encoding="utf-8",
        )
        self.log(f"ERROR [{payload['stage']}] {payload['code']}: {payload['message']}")
        if payload.get("hresult"):
            self.log(f"HRESULT: {payload['hresult']}")
        if exc is not None:
            self.log_exception(f"ERROR [{payload['stage']}]", exc)
        raise SystemExit(1)


def _coerce_text(value, default: str = "") -> str:
    if isinstance(value, str):
        text = value.strip()
        return text if text else default
    return default


def _coerce_int(value, default: int) -> int:
    try:
        return int(value)
    except Exception:
        return default


def _coerce_float(value, default: float) -> float:
    try:
        return float(value)
    except Exception:
        return default


def _normalize_command_list(value) -> list[str]:
    if isinstance(value, str):
        return [line.strip() for line in value.splitlines() if line and line.strip()]
    if isinstance(value, list):
        return [item.strip() for item in value if isinstance(item, str) and item.strip()]
    return []


def load_batch_jobs(batch_jobs_path: Path) -> list[dict]:
    try:
        raw_text = batch_jobs_path.read_text(encoding="utf-8-sig")
    except Exception as exc:
        raise RuntimeError(f"Failed to read batch jobs file: {exc}") from exc

    try:
        payload = json.loads(raw_text or "{}")
    except Exception as exc:
        raise RuntimeError(f"Invalid batch jobs JSON: {exc}") from exc

    if not isinstance(payload, dict):
        raise RuntimeError("Batch jobs payload must be an object.")

    jobs = payload.get("jobs")
    if not isinstance(jobs, list) or not jobs:
        raise RuntimeError("Batch jobs payload must contain a non-empty 'jobs' array.")

    normalized_jobs: list[dict] = []
    for idx, item in enumerate(jobs, start=1):
        if not isinstance(item, dict):
            raise RuntimeError(f"Batch job #{idx} must be an object.")

        csv_path_value = _coerce_text(item.get("csvPath"))
        if not csv_path_value:
            raise RuntimeError(f"Batch job #{idx} is missing csvPath.")

        raw_capabilities = item.get("capabilities")
        if raw_capabilities is None:
            capabilities = {}
        elif isinstance(raw_capabilities, dict):
            capabilities = raw_capabilities
        else:
            raise RuntimeError(f"Batch job #{idx} has invalid capabilities payload.")

        normalized_jobs.append(
            {
                "csv_path": Path(csv_path_value).resolve(),
                "import_mode": _coerce_text(item.get("importMode"), "new-book"),
                "workbook_key": _coerce_text(item.get("workbookKey")),
                "workbook_name": _coerce_text(item.get("workbookName")),
                "sheet_name": _coerce_text(item.get("sheetName")),
                "plot_type": _coerce_int(item.get("plotType"), 202),
                "xy_pairs": _coerce_text(item.get("xyPairs"), "((1,2))"),
                "plot_command": _coerce_text(item.get("plotCommand")),
                "post_plot_commands": _normalize_command_list(item.get("postPlotCommands")),
                "line_width": _coerce_float(item.get("lineWidth"), 2.0),
                "capabilities": capabilities,
            }
        )

    return normalized_jobs


def build_single_job_from_args(args, csv_path: Path) -> dict:
    return {
        "csv_path": csv_path,
        "import_mode": _coerce_text(args.import_mode, "new-book"),
        "workbook_key": _coerce_text(args.workbook_key),
        "workbook_name": _coerce_text(args.workbook_name),
        "sheet_name": _coerce_text(args.sheet_name),
        "plot_type": _coerce_int(args.plot_type, 202),
        "xy_pairs": _coerce_text(args.xy_pairs, "((1,2))"),
        "plot_command": _coerce_text(args.plot_command),
        "post_plot_commands": _normalize_command_list(args.post_plot_command),
        "line_width": _coerce_float(args.line_width, 2.0),
        "capabilities": _coerce_text(args.capabilities_json),
    }


def resolve_job_capabilities(ctx, raw_capabilities, source_label: str):
    try:
        if isinstance(raw_capabilities, str):
            capabilities = parse_capabilities_json(raw_capabilities)
        elif raw_capabilities is None:
            capabilities = {}
        elif isinstance(raw_capabilities, dict):
            capabilities = raw_capabilities
        else:
            raise RuntimeError("Capabilities must be a JSON string or object.")
        capability_plan = resolve_capability_plan(capabilities)
        return capabilities, capability_plan
    except Exception as exc:
        ctx.write_error(
            code="ORIGIN_CSV_IMPORT_FAILED",
            stage="CAPABILITIES_PARSE",
            message=f"Failed to parse capabilities for {source_label}: {exc}",
            exc=exc if isinstance(exc, Exception) else None,
        )


def run_csv_job(ctx, op_module, job: dict, job_index: int, job_count: int) -> str:
    csv_path = job["csv_path"]
    label_suffix = f" #{job_index}/{job_count}" if job_count > 1 else ""
    source_label = f"batch job #{job_index}" if job_count > 1 else "single job"
    log_prefix = f"CSV job{label_suffix}"
    import_label_prefix = f"CSV import{label_suffix}"
    capabilities, capability_plan = resolve_job_capabilities(
        ctx,
        job.get("capabilities"),
        source_label,
    )

    requested_workbook_name = _coerce_text(job.get("workbook_name"))
    requested_sheet_name = _coerce_text(job.get("sheet_name"))
    effective_workbook_name = capability_plan.workbook_long_name or requested_workbook_name
    plot_command = build_plot_command(
        capability_plan.plot_command_override or _coerce_text(job.get("plot_command")),
        _coerce_text(job.get("xy_pairs"), "((1,2))"),
        _coerce_int(job.get("plot_type"), 202),
    )
    extra_post_plot_commands = _normalize_command_list(job.get("post_plot_commands"))
    all_post_plot_commands = extra_post_plot_commands + capability_plan.plot_post_commands

    ctx.log(f"{log_prefix} plot command: {plot_command}")
    ctx.log(
        f"{log_prefix} import target: "
        f"mode={_coerce_text(job.get('import_mode'), 'new-book')}, "
        f"workbookKey={_coerce_text(job.get('workbook_key'))!r}, "
        f"workbookName={effective_workbook_name!r}, "
        f"sheetName={requested_sheet_name!r}"
    )
    if capabilities:
        ctx.log(f"{log_prefix} capabilities v1 detected.")
    ctx.log(f"{log_prefix} running CSV import via originpro: {csv_path}")

    run_command_list(
        op_module,
        capability_plan.global_pre_commands,
        f"Global pre-command{label_suffix}",
    )
    actual_workbook_key = run_csv_import(
        op_module,
        csv_path,
        import_mode=_coerce_text(job.get("import_mode"), "new-book"),
        workbook_short_name=_coerce_text(job.get("workbook_key")),
        workbook_long_name=effective_workbook_name,
        sheet_long_name=requested_sheet_name,
        import_pre_commands=capability_plan.import_pre_commands,
        import_post_commands=capability_plan.import_post_commands,
        label_prefix=import_label_prefix,
        warning_logger=ctx.log,
    )
    if actual_workbook_key:
        ctx.log(f"{log_prefix} actual workbook key: {actual_workbook_key!r}")
    run_plot_pipeline(
        op_module,
        plot_command,
        graph_pre_commands=capability_plan.graph_pre_commands,
        plot_pre_commands=capability_plan.plot_pre_commands,
        post_plot_commands=all_post_plot_commands,
        plot_error_message=f"CSV plot{label_suffix} failed at plotxy",
        line_width=_coerce_float(job.get("line_width"), 2.0),
    )
    axis_commands = ensure_log_y_axis_range_commands(
        capability_plan.axis_commands,
        csv_path,
        ctx,
    )
    if axis_commands:
        ctx.log(f"{log_prefix} axis commands: {axis_commands}")
    apply_style_commands(op_module, capability_plan.style_commands)
    apply_axis_commands(op_module, axis_commands)
    run_command_list(
        op_module,
        capability_plan.graph_post_commands,
        f"Graph post-command{label_suffix}",
    )
    run_command_list(
        op_module,
        capability_plan.global_post_commands,
        f"Global post-command{label_suffix}",
    )
    ctx.log(f"{log_prefix} completed.")
    return actual_workbook_key


def parse_args():
    parser = argparse.ArgumentParser(
        description="Run Device Analysis CSV import job in Origin via originpro.",
    )
    parser.add_argument("--work-dir", default="")
    parser.add_argument("--csv-path", default="")
    parser.add_argument("--batch-jobs-path", default="")
    parser.add_argument("--origin-exe", default="")
    parser.add_argument("--log-path", default="")
    parser.add_argument("--error-path", default="")
    parser.add_argument("--import-mode", default="new-book")
    parser.add_argument("--workbook-key", default="")
    parser.add_argument("--workbook-name", default="")
    parser.add_argument("--sheet-name", default="")
    parser.add_argument("--plot-type", type=int, default=202)
    parser.add_argument("--xy-pairs", default="((1,2))")
    parser.add_argument("--plot-command", default="")
    parser.add_argument("--post-plot-command", action="append", default=[])
    parser.add_argument("--line-width", type=float, default=2.0)
    parser.add_argument("--capabilities-json", default="")
    parser.add_argument("--max-com-attempts", type=int, default=8)
    parser.add_argument("--health-check-only", action="store_true")
    parser.add_argument("--worker-version", action="store_true")
    parser.add_argument("--worker-version-json", action="store_true")
    return parser.parse_args()


def main():
    args = parse_args()

    if args.worker_version_json:
        print(get_worker_build_info_json())
        return 0

    if args.worker_version:
        print(format_worker_build_info_text())
        return 0

    if not _coerce_text(args.work_dir):
        raise SystemExit("--work-dir is required unless --worker-version or --worker-version-json is used.")
    if not _coerce_text(args.origin_exe):
        raise SystemExit("--origin-exe is required unless --worker-version or --worker-version-json is used.")

    work_dir = Path(args.work_dir).resolve()
    csv_path = Path(args.csv_path).resolve() if args.csv_path else None
    batch_jobs_path = Path(args.batch_jobs_path).resolve() if args.batch_jobs_path else None
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
    if batch_jobs_path is not None:
        ctx.log(f"BatchJobsPath: {batch_jobs_path}")
    elif csv_path is not None:
        ctx.log(f"CsvPath: {csv_path}")
    else:
        ctx.log("CsvPath: (health-check mode)")
    ctx.log(f"OriginExe: {origin_exe_path}")
    ctx.log(f"HealthCheckOnly: {bool(args.health_check_only)}")

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
    batch_jobs: list[dict] = []
    if not args.health_check_only:
        if batch_jobs_path is not None:
            if not batch_jobs_path.exists():
                ctx.write_error(
                    code="ORIGIN_CSV_NOT_FOUND",
                    stage="PRECHECK",
                    message=f"Batch jobs file not found: {batch_jobs_path}",
                )
            if not batch_jobs_path.is_file():
                ctx.write_error(
                    code="ORIGIN_CSV_NOT_FOUND",
                    stage="PRECHECK",
                    message=f"Batch jobs path is not a file: {batch_jobs_path}",
                )
            try:
                batch_jobs = load_batch_jobs(batch_jobs_path)
            except Exception as exc:
                ctx.write_error(
                    code="ORIGIN_CSV_IMPORT_FAILED",
                    stage="BATCH_PARSE",
                    message=f"Failed to parse batch jobs file: {exc}",
                    exc=exc if isinstance(exc, Exception) else None,
                )
            ctx.log(f"BatchJobCount: {len(batch_jobs)}")
            for idx, job in enumerate(batch_jobs, start=1):
                job_csv_path = job["csv_path"]
                if not job_csv_path.exists():
                    ctx.write_error(
                        code="ORIGIN_CSV_NOT_FOUND",
                        stage="PRECHECK",
                        message=f"Batch CSV file #{idx} not found: {job_csv_path}",
                    )
                if not job_csv_path.is_file():
                    ctx.write_error(
                        code="ORIGIN_CSV_NOT_FOUND",
                        stage="PRECHECK",
                        message=f"Batch CSV path #{idx} is not a file: {job_csv_path}",
                    )
        else:
            if csv_path is None:
                ctx.write_error(
                    code="ORIGIN_CSV_NOT_FOUND",
                    stage="PRECHECK",
                    message="CSV path is required.",
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

    if args.health_check_only:
        try:
            run_labtalk_or_raise(
                op_module,
                "sec -p 0;",
                "Origin health-check execute failed",
            )
            ctx.log("Origin health check completed successfully.")
        except Exception as exc:
            ctx.write_error(
                code="ORIGIN_HEALTH_EXEC_FAILED",
                stage="HEALTH_CHECK",
                message=f"Origin health-check execute failed: {exc}",
                exc=exc,
            )

        detach = getattr(op_module, "detach", None)
        if callable(detach):
            try:
                detach()
            except Exception as exc:
                ctx.log(f"originpro detach warning: {exc}")

        error_path.write_text("", encoding="utf-8")
        print(
            json.dumps(
                {"ok": True, "healthCheck": True, "logPath": str(log_path)},
                ensure_ascii=False,
            )
        )
        return 0

    jobs = (
        batch_jobs
        if batch_jobs
        else [build_single_job_from_args(args, csv_path)]
    )

    try:
        if len(jobs) > 1:
            ctx.log(f"Running Origin CSV batch with {len(jobs)} jobs.")
        resolved_workbook_key = ""
        for idx, job in enumerate(jobs, start=1):
            effective_job = dict(job)
            if (
                len(jobs) > 1
                and _coerce_text(effective_job.get("import_mode"), "new-book").lower()
                == "existing-book-new-sheet"
                and resolved_workbook_key
            ):
                effective_job["workbook_key"] = resolved_workbook_key
                ctx.log(
                    f"CSV job #{idx}/{len(jobs)} using resolved workbook key override: "
                    f"{resolved_workbook_key!r}"
                )
            actual_workbook_key = run_csv_job(
                ctx,
                op_module,
                effective_job,
                idx,
                len(jobs),
            )
            if actual_workbook_key:
                resolved_workbook_key = actual_workbook_key
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

    if len(jobs) > 1:
        ctx.log(f"Origin CSV batch completed successfully. jobCount={len(jobs)}")
    else:
        ctx.log("Origin CSV job completed successfully.")
    error_path.write_text("", encoding="utf-8")
    print(
        json.dumps(
            {"ok": True, "logPath": str(log_path), "jobCount": len(jobs)},
            ensure_ascii=False,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
