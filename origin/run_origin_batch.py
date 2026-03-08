#!/usr/bin/env python3
import argparse
import json
import subprocess
import sys
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


class BatchContext:
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
            "code": code or "ORIGIN_BATCH_FAILED",
            "stage": stage or "UNKNOWN",
            "message": message or "Origin batch failed.",
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


def escape_labtalk_path(path_value: str) -> str:
    return str(path_value).replace("\\", "\\\\").replace('"', '\\"')


def discover_csv_files(input_dir: Path):
    csv_files = []
    for path_value in input_dir.rglob("*"):
        if not path_value.is_file():
            continue
        if path_value.suffix.lower() != ".csv":
            continue
        csv_files.append(path_value)
    csv_files.sort(key=lambda item: str(item).lower())
    return csv_files


def parse_args():
    parser = argparse.ArgumentParser(description="Batch import CSV files to Origin.")
    parser.add_argument("--work-dir", required=True)
    parser.add_argument("--input-dir", required=True)
    parser.add_argument("--origin-exe", required=True)
    parser.add_argument("--summary-path", default="")
    parser.add_argument("--log-path", default="")
    parser.add_argument("--error-path", default="")
    parser.add_argument("--plot-type", type=int, default=202)
    parser.add_argument("--xy-pairs", default="((1,2))")
    parser.add_argument("--plot-command", default="")
    parser.add_argument("--post-plot-command", action="append", default=[])
    parser.add_argument("--max-com-attempts", type=int, default=4)
    return parser.parse_args()


def try_launch_origin(ctx: BatchContext, origin_exe: str):
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
        ctx.log(f"Origin launch failed; continue with COM activation: {exc}")
        hresult = extract_hresult(exc)
        if hresult:
            ctx.log(f"Launch HRESULT: {hresult}")
        return None


def connect_origin_com(ctx: BatchContext, max_attempts: int):
    try:
        import win32com.client  # type: ignore
    except Exception as exc:
        ctx.write_error(
            code="ORIGIN_PYWIN32_MISSING",
            stage="PY_INIT",
            message=(
                "Python win32com is not available. "
                "Install pywin32 and rerun batch."
            ),
            exc=exc,
        )

    last_exc = None
    for attempt in range(1, max_attempts + 1):
        try:
            origin = win32com.client.Dispatch("Origin.ApplicationSI")
            ctx.log(f"Connected to Origin COM (attempt {attempt}).")
            return origin
        except Exception as exc:
            last_exc = exc
            ctx.log(f"COM connect attempt {attempt} failed: {exc}")
            if attempt < max_attempts:
                time.sleep(0.6 * attempt)

    message = "Failed to create Origin COM object."
    if last_exc:
        message += f" {last_exc}"
    ctx.write_error(
        code="ORIGIN_COM_CREATE_FAILED",
        stage="COM_CREATE",
        message=message,
        exc=last_exc,
    )
    return None


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


def process_csv_file(
    ctx: BatchContext,
    origin,
    csv_path: Path,
    plot_command: str,
    post_plot_commands,
):
    file_result = {
        "file": str(csv_path),
        "status": "success",
        "message": "",
        "hresult": None,
    }
    csv_lt = escape_labtalk_path(str(csv_path))
    try:
        origin.Execute("newbook;")
        origin.Execute(f'impCSV fname:="{csv_lt}";')
        origin.Execute(plot_command)
        for command in post_plot_commands or []:
            next_command = ensure_lt_terminated(command)
            if not next_command:
                continue
            origin.Execute(next_command)
        return file_result
    except Exception as exc:
        file_result["status"] = "failed"
        file_result["message"] = str(exc)
        file_result["hresult"] = extract_hresult(exc)
        return file_result


def main():
    args = parse_args()

    work_dir = Path(args.work_dir).resolve()
    ensure_dir(work_dir)

    log_path = Path(args.log_path).resolve() if args.log_path else work_dir / "originbridge.log"
    error_path = Path(args.error_path).resolve() if args.error_path else work_dir / "error.txt"
    summary_path = (
        Path(args.summary_path).resolve() if args.summary_path else work_dir / "summary.json"
    )

    ensure_dir(log_path.parent)
    ensure_dir(error_path.parent)
    ensure_dir(summary_path.parent)
    error_path.write_text("", encoding="utf-8")

    input_dir = Path(args.input_dir).resolve()
    origin_exe = str(Path(args.origin_exe).resolve())

    ctx = BatchContext(work_dir=work_dir, log_path=log_path, error_path=error_path, origin_exe=origin_exe)
    ctx.log(f"WorkDir: {work_dir}")
    ctx.log(f"InputDir: {input_dir}")
    ctx.log(f"OriginExe: {origin_exe}")

    if not Path(origin_exe).exists():
        ctx.write_error(
            code="ORIGIN_EXE_NOT_FOUND",
            stage="PRECHECK",
            message=f"Origin executable not found: {origin_exe}",
        )
    if not input_dir.exists():
        ctx.write_error(
            code="ORIGIN_BATCH_INPUT_DIR_NOT_FOUND",
            stage="PRECHECK",
            message=f"Input directory not found: {input_dir}",
        )
    if not input_dir.is_dir():
        ctx.write_error(
            code="ORIGIN_BATCH_INPUT_DIR_INVALID",
            stage="PRECHECK",
            message=f"Input path is not a directory: {input_dir}",
        )

    csv_files = discover_csv_files(input_dir)
    ctx.log(f"Discovered CSV files: {len(csv_files)}")
    if not csv_files:
        ctx.write_error(
            code="ORIGIN_BATCH_NO_CSV_FILES",
            stage="DISCOVER",
            message=f"No CSV files found under: {input_dir}",
            extra={"inputDir": str(input_dir)},
        )

    _proc = try_launch_origin(ctx, origin_exe)
    origin = connect_origin_com(ctx, max(1, int(args.max_com_attempts)))
    plot_command = build_plot_command(args)
    post_plot_commands = args.post_plot_command if isinstance(args.post_plot_command, list) else []
    ctx.log(f"Plot command: {plot_command}")
    if post_plot_commands:
        ctx.log(f"Post-plot commands: {len(post_plot_commands)}")

    session_started = False
    started_at = to_iso_now()
    results = []
    try:
        try:
            origin.Visible = 2
        except Exception:
            pass

        origin.BeginSession()
        session_started = True
        ctx.log("Origin BeginSession succeeded.")

        for idx, csv_path in enumerate(csv_files, start=1):
            ctx.log(f"[{idx}/{len(csv_files)}] Processing {csv_path}")
            result = process_csv_file(
                ctx,
                origin,
                csv_path,
                plot_command,
                post_plot_commands,
            )
            results.append(result)
            if result["status"] == "failed":
                ctx.log(f"[{idx}/{len(csv_files)}] FAILED {csv_path}: {result['message']}")
            else:
                ctx.log(f"[{idx}/{len(csv_files)}] OK {csv_path}")
    except Exception as exc:
        ctx.write_error(
            code="ORIGIN_BATCH_RUNTIME_FAILED",
            stage="BATCH_RUN",
            message=str(exc),
            exc=exc,
            extra={"summaryPath": str(summary_path)},
        )
    finally:
        if origin is not None:
            try:
                origin.Visible = 3
            except Exception:
                pass
            try:
                origin.Execute("win -a;")
            except Exception:
                pass
            if session_started:
                try:
                    origin.EndSession()
                except Exception:
                    pass

    succeeded = sum(1 for item in results if item.get("status") == "success")
    failed = len(results) - succeeded

    summary = {
        "ok": succeeded > 0,
        "inputDir": str(input_dir),
        "originExe": origin_exe,
        "total": len(results),
        "succeeded": succeeded,
        "failed": failed,
        "items": results,
        "startedAt": started_at,
        "finishedAt": to_iso_now(),
        "logPath": str(log_path),
    }
    summary_path.write_text(
        json.dumps(summary, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    if succeeded <= 0:
        ctx.write_error(
            code="ORIGIN_BATCH_ALL_FAILED",
            stage="BATCH_RUN",
            message="Batch completed but all files failed.",
            extra={"summaryPath": str(summary_path)},
        )

    ctx.log(
        f"Batch completed. total={summary['total']} succeeded={summary['succeeded']} failed={summary['failed']}"
    )
    print(json.dumps({"ok": True, "summaryPath": str(summary_path)}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
