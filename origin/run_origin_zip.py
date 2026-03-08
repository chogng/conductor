#!/usr/bin/env python3
import argparse
import json
import subprocess
import time
from datetime import datetime
from pathlib import Path


def ensure_dir(path_value: Path) -> None:
    path_value.mkdir(parents=True, exist_ok=True)


def to_iso_now() -> str:
    return datetime.now().astimezone().isoformat()


def extract_hresult(exc: Exception):
    value = getattr(exc, "hresult", None)
    if isinstance(value, int):
        return f"0x{value & 0xFFFFFFFF:08X}"

    args = getattr(exc, "args", ())
    if args and isinstance(args[0], int):
        return f"0x{args[0] & 0xFFFFFFFF:08X}"
    return None


class ZipContext:
    def __init__(self, work_dir: Path, log_path: Path, error_path: Path, origin_exe: str):
        self.work_dir = work_dir
        self.log_path = log_path
        self.error_path = error_path
        self.origin_exe = origin_exe

    def log(self, message: str) -> None:
        line = f"{datetime.now().strftime('%Y-%m-%d %H:%M:%S.%f')[:-3]} {message}"
        with self.log_path.open("a", encoding="utf-8") as f:
            f.write(line + "\n")

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
    parser.add_argument("--max-com-attempts", type=int, default=8)
    return parser.parse_args()


def escape_labtalk_path(path_value: str) -> str:
    return str(path_value).replace("\\", "\\\\").replace('"', '\\"')


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


def try_launch_origin(ctx: ZipContext, origin_exe: str):
    try:
        proc = subprocess.Popen(
            [origin_exe],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        ctx.log(f"Origin process started. PID={proc.pid}")
        time.sleep(1.4)
        return proc
    except Exception as exc:
        ctx.log(f"Origin launch failed; continue with originpro attach: {exc}")
        hresult = extract_hresult(exc)
        if hresult:
            ctx.log(f"Launch HRESULT: {hresult}")
        return None


def get_originpro_module(ctx: ZipContext):
    try:
        import originpro as op  # type: ignore
    except Exception as exc:
        ctx.write_error(
            code="ORIGIN_ORIGINPRO_IMPORT_FAILED",
            stage="ORIGINPRO_INIT",
            message=(
                "Failed to import originpro. Ensure originpro is installed in the ZIP runner environment."
            ),
            exc=exc,
        )
    return op


def lt_exec(op_module, command: str):
    direct = getattr(op_module, "lt_exec", None)
    if callable(direct):
        return direct(command)

    origin_ext = getattr(op_module, "oext", None)
    execute_method = getattr(origin_ext, "LT_execute", None) if origin_ext is not None else None
    if callable(execute_method):
        return execute_method(command)

    raise RuntimeError("originpro.lt_exec/LT_execute is not available.")


def is_lt_success(result) -> bool:
    if result is None:
        return True
    if isinstance(result, bool):
        return result
    if isinstance(result, int):
        return result in (0, 1)
    return True


def connect_originpro(ctx: ZipContext, op_module, max_attempts: int, origin_exe: str):
    set_show = getattr(op_module, "set_show", None)
    launch_triggered = False
    last_exc = None

    for attempt in range(1, max_attempts + 1):
        try:
            if callable(set_show):
                set_show(True)
            health = lt_exec(op_module, "sec -p 0;")
            ctx.log(f"originpro attach succeeded on attempt {attempt}. Health={health}")
            return
        except Exception as exc:
            last_exc = exc
            ctx.log(f"originpro attach attempt {attempt} failed: {exc}")

            if not launch_triggered:
                try_launch_origin(ctx, origin_exe)
                launch_triggered = True

            if attempt < max_attempts:
                time.sleep(min(2.0, 0.5 * attempt))
                continue

            ctx.write_error(
                code="ORIGIN_ORIGINPRO_ATTACH_FAILED",
                stage="ORIGINPRO_ATTACH",
                message=f"Failed to attach Origin via originpro: {last_exc}",
                exc=last_exc if isinstance(last_exc, Exception) else None,
            )


def run_labtalk_or_raise(op_module, command: str, message_prefix: str):
    result = lt_exec(op_module, command)
    if not is_lt_success(result):
        raise RuntimeError(f"{message_prefix} (LabTalk returned {result})")
    return result


def ensure_lt_terminated(command: str) -> str:
    text = str(command or "").strip()
    if not text:
        return ""
    return text if text.endswith(";") else f"{text};"


def build_plot_command(args) -> str:
    custom_command = ensure_lt_terminated(args.plot_command)
    if custom_command:
        return custom_command

    xy_pairs = str(args.xy_pairs or "").strip() or "((1,2))"
    try:
        plot_type = max(0, int(args.plot_type))
    except Exception:
        plot_type = 202
    return f"plotxy iy:={xy_pairs} plot:={plot_type};"


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

    op_module = get_originpro_module(ctx)
    connect_originpro(
        ctx,
        op_module,
        max(1, int(args.max_com_attempts)),
        str(origin_exe_path),
    )
    plot_command = build_plot_command(args)
    post_plot_commands = args.post_plot_command if isinstance(args.post_plot_command, list) else []
    ctx.log(f"Plot command: {plot_command}")
    if post_plot_commands:
        ctx.log(f"Post-plot commands: {len(post_plot_commands)}")

    ran_ogs = False
    ogs_error = None
    if ogs_file:
        try:
            ogs_lt = escape_labtalk_path(str(ogs_file))
            if csv_file:
                csv_lt = escape_labtalk_path(str(csv_file))
                ogs_cmd = f'run.section("{ogs_lt}", Main, "{csv_lt}");'
            else:
                ogs_cmd = f'run.section("{ogs_lt}", Main);'
            ctx.log(f"Executing OGS via originpro: {ogs_file}")
            run_labtalk_or_raise(op_module, ogs_cmd, "OGS execution failed")
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
            csv_lt = escape_labtalk_path(str(csv_file))
            ctx.log(f"Running CSV fallback plot via originpro: {csv_file}")
            run_labtalk_or_raise(op_module, "newbook;", "CSV fallback failed at newbook")
            run_labtalk_or_raise(
                op_module,
                f'impCSV fname:="{csv_lt}";',
                "CSV fallback failed at impCSV",
            )
            run_labtalk_or_raise(
                op_module,
                plot_command,
                "CSV fallback failed at plotxy",
            )
            if post_plot_commands:
                for idx, command in enumerate(post_plot_commands, start=1):
                    next_command = ensure_lt_terminated(command)
                    if not next_command:
                        continue
                    run_labtalk_or_raise(
                        op_module,
                        next_command,
                        f"CSV fallback post-plot command #{idx} failed",
                    )
            ctx.log("CSV fallback plot succeeded.")
        except Exception as exc:
            ctx.write_error(
                code="ORIGIN_CSV_FALLBACK_FAILED",
                stage="CSV_FALLBACK",
                message=f"CSV fallback plot failed: {exc}",
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
