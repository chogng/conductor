import subprocess
import time


def extract_hresult(exc: Exception):
    value = getattr(exc, "hresult", None)
    if isinstance(value, int):
        return f"0x{value & 0xFFFFFFFF:08X}"

    args = getattr(exc, "args", ())
    if args and isinstance(args[0], int):
        return f"0x{args[0] & 0xFFFFFFFF:08X}"
    return None


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


def connect_originpro(ctx, op_module, max_attempts: int, origin_exe: str):
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

