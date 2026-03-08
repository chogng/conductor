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
    parser.add_argument("--max-com-attempts", type=int, default=8)
    return parser.parse_args()


def escape_labtalk_path(path_value: str) -> str:
    return str(path_value).replace("\\", "\\\\").replace('"', '\\"')


def escape_labtalk_text(text_value: str) -> str:
    return str(text_value).replace("\\", "\\\\").replace('"', '\\"')


def try_launch_origin(ctx: CsvContext, origin_exe: str):
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


def get_originpro_module(ctx: CsvContext):
    try:
        import originpro as op  # type: ignore
    except Exception as exc:
        ctx.write_error(
            code="ORIGIN_ORIGINPRO_IMPORT_FAILED",
            stage="ORIGINPRO_INIT",
            message="Failed to import originpro. Ensure originpro is installed in the worker environment.",
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


def run_labtalk_or_raise(op_module, command: str, message_prefix: str):
    result = lt_exec(op_module, command)
    if not is_lt_success(result):
        raise RuntimeError(f"{message_prefix} (LabTalk returned {result})")
    return result


def connect_originpro(ctx: CsvContext, op_module, max_attempts: int, origin_exe: str):
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

    op_module = get_originpro_module(ctx)
    connect_originpro(
        ctx,
        op_module,
        max(1, int(args.max_com_attempts)),
        str(origin_exe_path),
    )

    try:
        csv_lt = escape_labtalk_path(str(csv_path))
        ctx.log(f"Running CSV import via originpro: {csv_path}")
        run_labtalk_or_raise(op_module, "newbook;", "CSV import failed at newbook")
        run_labtalk_or_raise(
            op_module,
            f'impCSV fname:="{csv_lt}";',
            "CSV import failed at impCSV",
        )
        if args.series_name and args.series_name.strip():
            title = escape_labtalk_text(args.series_name.strip())
            run_labtalk_or_raise(
                op_module,
                f'page.longname$="{title}";',
                "CSV import failed at setting workbook title",
            )
        run_labtalk_or_raise(
            op_module,
            "plotxy iy:=((1,2)) plot:=202;",
            "CSV plot failed at plotxy",
        )
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
