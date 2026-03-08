#!/usr/bin/env python3
import argparse
import json
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
        )
        apply_style_commands(op_module, capability_plan.style_commands)
        apply_axis_commands(op_module, capability_plan.axis_commands)
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

