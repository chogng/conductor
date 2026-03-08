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
from origin_ops.import_ops import escape_labtalk_path, run_csv_import
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


class ZipContext:
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
        description="Run Device Analysis ZIP import job in Origin via originpro.",
    )
    parser.add_argument("--work-dir", required=True)
    parser.add_argument("--extract-dir", required=True)
    parser.add_argument("--origin-exe", required=True)
    parser.add_argument("--log-path", default="")
    parser.add_argument("--error-path", default="")
    parser.add_argument("--plot-type", type=int, default=202)
    parser.add_argument("--xy-pairs", default="((1,2))")
    parser.add_argument("--plot-command", default="")
    parser.add_argument("--post-plot-command", action="append", default=[])
    parser.add_argument("--capabilities-json", default="")
    parser.add_argument("--max-com-attempts", type=int, default=8)
    return parser.parse_args()


def discover_primary_files(extract_dir: Path):
    ogs_files = sorted(
        (item for item in extract_dir.rglob("*") if item.is_file() and item.suffix.lower() == ".ogs"),
        key=lambda item: str(item).lower(),
    )
    csv_files = sorted(
        (item for item in extract_dir.rglob("*") if item.is_file() and item.suffix.lower() == ".csv"),
        key=lambda item: str(item).lower(),
    )
    return (
        ogs_files[0] if ogs_files else None,
        csv_files[0] if csv_files else None,
    )


def main():
    args = parse_args()

    work_dir = Path(args.work_dir).resolve()
    extract_dir = Path(args.extract_dir).resolve()
    origin_exe_path = Path(args.origin_exe).resolve()
    log_path = Path(args.log_path).resolve() if args.log_path else work_dir / "originbridge.log"
    error_path = Path(args.error_path).resolve() if args.error_path else work_dir / "error.txt"

    ensure_dir(work_dir)
    ensure_dir(log_path.parent)
    ensure_dir(error_path.parent)
    error_path.write_text("", encoding="utf-8")

    ctx = ZipContext(
        work_dir=work_dir,
        log_path=log_path,
        error_path=error_path,
        origin_exe=str(origin_exe_path),
    )

    ctx.log(f"WorkDir: {work_dir}")
    ctx.log(f"ExtractDir: {extract_dir}")
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
    if not extract_dir.exists():
        ctx.write_error(
            code="ORIGIN_EXTRACT_DIR_NOT_FOUND",
            stage="PRECHECK",
            message=f"Extract directory not found: {extract_dir}",
        )
    if not extract_dir.is_dir():
        ctx.write_error(
            code="ORIGIN_EXTRACT_DIR_NOT_FOUND",
            stage="PRECHECK",
            message=f"Extract path is not a directory: {extract_dir}",
        )

    ogs_file, csv_file = discover_primary_files(extract_dir)
    if not ogs_file and not csv_file:
        ctx.write_error(
            code="ORIGIN_PACKAGE_EMPTY",
            stage="PACKAGE_DISCOVERY",
            message="No .ogs or .csv found in extracted package.",
        )

    op_module = get_originpro_module(
        ctx,
        "Failed to import originpro. Ensure originpro is installed in the ZIP runner environment.",
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
            code="ORIGIN_WORKER_FAILED",
            stage="CAPABILITIES_PARSE",
            message=f"Failed to parse capabilities JSON: {exc}",
            exc=exc if isinstance(exc, Exception) else None,
        )

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

    ctx.log(f"Plot command: {plot_command}")
    if capabilities:
        ctx.log("Capabilities v1 detected.")
    if all_post_plot_commands:
        ctx.log(f"Post-plot commands: {len(all_post_plot_commands)}")

    try:
        run_command_list(op_module, capability_plan.global_pre_commands, "Global pre-command")
    except Exception as exc:
        ctx.write_error(
            code="ORIGIN_WORKER_FAILED",
            stage="GLOBAL_PRE",
            message=f"Global pre-commands failed: {exc}",
            exc=exc,
        )

    ran_ogs = False
    ogs_error = None
    if ogs_file:
        try:
            run_command_list(op_module, capability_plan.import_pre_commands, "Import pre-command")
            ogs_lt = escape_labtalk_path(str(ogs_file))
            if csv_file:
                csv_lt = escape_labtalk_path(str(csv_file))
                ogs_cmd = f'run.section("{ogs_lt}", Main, "{csv_lt}");'
            else:
                ogs_cmd = f'run.section("{ogs_lt}", Main);'
            ctx.log(f"Executing OGS via originpro: {ogs_file}")
            run_labtalk_or_raise(op_module, ogs_cmd, "OGS execution failed")
            run_command_list(op_module, capability_plan.import_post_commands, "Import post-command")
            ran_ogs = True
            ctx.log("OGS executed successfully.")
        except Exception as exc:
            ogs_error = exc
            ctx.log(f"OGS execution failed: {exc}")

    if not ran_ogs:
        if not csv_file:
            ctx.write_error(
                code="ORIGIN_OGS_FALLBACK_UNAVAILABLE",
                stage="CSV_FALLBACK",
                message="OGS execution failed and no CSV file is available for fallback plot.",
                exc=ogs_error if isinstance(ogs_error, Exception) else None,
            )

        try:
            ctx.log(f"Running CSV fallback plot via originpro: {csv_file}")
            run_csv_import(
                op_module,
                csv_file,
                workbook_long_name=capability_plan.workbook_long_name,
                import_pre_commands=capability_plan.import_pre_commands,
                import_post_commands=capability_plan.import_post_commands,
                label_prefix="CSV fallback",
            )
            run_plot_pipeline(
                op_module,
                plot_command,
                graph_pre_commands=capability_plan.graph_pre_commands,
                plot_pre_commands=capability_plan.plot_pre_commands,
                post_plot_commands=all_post_plot_commands,
                plot_error_message="CSV fallback failed at plotxy",
            )
            ctx.log("CSV fallback plot succeeded.")
        except Exception as exc:
            ctx.write_error(
                code="ORIGIN_CSV_FALLBACK_FAILED",
                stage="CSV_FALLBACK",
                message=f"CSV fallback plot failed: {exc}",
                exc=exc,
            )
    else:
        try:
            run_command_list(op_module, capability_plan.graph_pre_commands, "Graph pre-command")
            run_command_list(op_module, capability_plan.plot_pre_commands, "Plot pre-command")
            run_command_list(op_module, all_post_plot_commands, "Post-plot command")
        except Exception as exc:
            ctx.write_error(
                code="ORIGIN_WORKER_FAILED",
                stage="OGS_POST_PROCESS",
                message=f"Post-OGS commands failed: {exc}",
                exc=exc,
            )

    try:
        apply_style_commands(op_module, capability_plan.style_commands)
        apply_axis_commands(op_module, capability_plan.axis_commands)
        run_command_list(op_module, capability_plan.graph_post_commands, "Graph post-command")
        run_command_list(op_module, capability_plan.global_post_commands, "Global post-command")
    except Exception as exc:
        ctx.write_error(
            code="ORIGIN_WORKER_FAILED",
            stage="POST_PROCESS",
            message=f"Post-processing commands failed: {exc}",
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

    ctx.log("Origin ZIP job completed successfully.")
    error_path.write_text("", encoding="utf-8")
    print(json.dumps({"ok": True, "logPath": str(log_path)}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

