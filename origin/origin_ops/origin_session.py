import subprocess
import time
import os
import traceback


def parse_bool_env(name: str, default: bool) -> bool:
    raw = os.environ.get(name)
    if raw is None:
        return default

    normalized = str(raw).strip().lower()
    if not normalized:
        return default
    if normalized in ("1", "true", "yes", "on"):
        return True
    if normalized in ("0", "false", "no", "off"):
        return False
    return default


def count_origin_processes() -> int:
    names = ("Origin64.exe", "Origin.exe")
    total = 0
    for name in names:
        try:
            result = subprocess.run(
                ["tasklist", "/fi", f"imagename eq {name}", "/fo", "csv", "/nh"],
                capture_output=True,
                text=True,
                check=False,
            )
        except Exception:
            continue

        if result.returncode != 0:
            continue

        lines = [line.strip() for line in str(result.stdout or "").splitlines() if line.strip()]
        for line in lines:
            if line.lower().startswith("info:"):
                continue
            total += 1
    return total


def extract_hresult(exc: Exception):
    value = getattr(exc, "hresult", None)
    if isinstance(value, int):
        return f"0x{value & 0xFFFFFFFF:08X}"

    args = getattr(exc, "args", ())
    if args and isinstance(args[0], int):
        return f"0x{args[0] & 0xFFFFFFFF:08X}"
    return None


def format_exception_trace(exc: Exception) -> str:
    if exc is None:
        return ""
    try:
        return "".join(traceback.format_exception(type(exc), exc, exc.__traceback__)).strip()
    except Exception:
        return repr(exc)


def summarize_exception(exc: Exception) -> dict:
    if exc is None:
        return {}
    return {
        "exceptionType": type(exc).__name__,
        "exceptionRepr": repr(exc),
        "traceback": format_exception_trace(exc),
    }


def get_originpro_state(op_module) -> dict:
    try:
        po = getattr(op_module, "po", None)
    except Exception:
        po = None
    app = getattr(po, "_app", None) if po is not None else None
    return {
        "oext": bool(getattr(op_module, "oext", False)),
        "poType": type(po).__name__ if po is not None else None,
        "appType": type(app).__name__ if app is not None else None,
        "appInitialized": app is not None,
    }


def log_exception(ctx, label: str, exc: Exception):
    ctx.log(f"{label}: {type(exc).__name__}: {exc!r}")
    trace = format_exception_trace(exc)
    if trace:
        for line in trace.splitlines():
            ctx.log(f"{label} traceback: {line}")


def ensure_lt_terminated(command: str) -> str:
    text = str(command or "").strip()
    if not text:
        return ""
    return text if text.endswith(";") else f"{text};"


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


def run_command_list(op_module, commands, label: str):
    if not isinstance(commands, list):
        return
    for idx, command in enumerate(commands, start=1):
        if not isinstance(command, str):
            continue
        text = command.strip()
        if not text:
            continue
        run_labtalk_or_raise(
            op_module,
            ensure_lt_terminated(text),
            f"{label} #{idx} failed",
        )


def try_launch_origin(ctx, origin_exe: str):
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


def get_originpro_module(ctx, import_error_message: str):
    try:
        import originpro as op  # type: ignore
    except Exception as exc:
        ctx.write_error(
            code="ORIGIN_ORIGINPRO_IMPORT_FAILED",
            stage="ORIGINPRO_INIT",
            message=import_error_message,
            exc=exc,
        )
    return op


def ensure_originpro_session_ready(ctx, op_module):
    ctx.log("originpro connection mode: direct-session")
    ctx.log(f"originpro state before health check: {get_originpro_state(op_module)}")
    health = lt_exec(op_module, "sec -p 0;")
    ctx.log(f"originpro LT health command succeeded: {health}")

    set_show = getattr(op_module, "set_show", None)
    if callable(set_show):
        set_show(True)
        ctx.log("originpro set_show(True) succeeded.")

    ctx.log(f"originpro state after health check: {get_originpro_state(op_module)}")
    return health


def connect_originpro(ctx, op_module, max_attempts: int, origin_exe: str):
    origin_process_count = None
    try:
        origin_process_count = count_origin_processes()
        ctx.log(f"Origin process count before attach: {origin_process_count}")
    except Exception:
        # Diagnostic only; never fail attach flow because of process counting.
        pass

    if isinstance(origin_process_count, int) and origin_process_count > 1:
        strict_single_process = parse_bool_env(
            "ORIGIN_STRICT_SINGLE_PROCESS",
            default=False,
        )
        message = (
            f"Detected {origin_process_count} Origin processes. "
            "This may attach to a different instance with different runtime UI state."
        )
        if strict_single_process:
            ctx.write_error(
                code="ORIGIN_MULTI_PROCESS_DETECTED",
                stage="PRECHECK",
                message=(
                    "Multiple Origin processes are running. "
                    "Please close extra Origin windows/processes and retry."
                ),
                extra={"originProcessCount": origin_process_count},
            )
        else:
            ctx.log(f"WARNING: {message} Continue with direct originpro session.")

    detach = getattr(op_module, "detach", None)
    last_exc = None

    for attempt in range(1, max_attempts + 1):
        try:
            ctx.log(f"originpro connect attempt {attempt} starting.")
            health = ensure_originpro_session_ready(ctx, op_module)
            ctx.log(
                f"originpro session ready on attempt {attempt}. "
                f"mode=direct-session Health={health}"
            )
            return
        except Exception as exc:
            last_exc = exc
            log_exception(ctx, f"originpro connect attempt {attempt} failed", exc)

            if attempt < max_attempts:
                if callable(detach):
                    try:
                        detach()
                        ctx.log("originpro detach() after failed attempt succeeded.")
                    except Exception as detach_exc:
                        log_exception(
                            ctx,
                            "originpro detach() after failed attempt failed",
                            detach_exc,
                        )
                time.sleep(min(2.0, 0.5 * attempt))
                continue

            ctx.write_error(
                code="ORIGIN_ORIGINPRO_ATTACH_FAILED",
                stage="ORIGINPRO_ATTACH",
                message=f"Failed to initialize Origin session via originpro: {last_exc}",
                exc=last_exc if isinstance(last_exc, Exception) else None,
                extra={
                    "originProcessCount": origin_process_count,
                    "originproState": get_originpro_state(op_module),
                    **summarize_exception(last_exc),
                },
            )
