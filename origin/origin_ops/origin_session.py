import subprocess
import time
import os


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
            ctx.log(f"WARNING: {message} Continue with originpro attach.")

    attach = getattr(op_module, "attach", None)
    set_show = getattr(op_module, "set_show", None)
    launch_triggered = False
    last_exc = None

    for attempt in range(1, max_attempts + 1):
        try:
            attached = False
            if callable(attach):
                try:
                    attach()
                    attached = True
                    ctx.log(f"originpro attach() succeeded on attempt {attempt}.")
                except Exception as attach_exc:
                    ctx.log(f"originpro attach() failed on attempt {attempt}: {attach_exc}")

            if callable(set_show):
                set_show(True)
            health = lt_exec(op_module, "sec -p 0;")
            ctx.log(
                f"originpro session ready on attempt {attempt}. "
                f"attachUsed={attached} Health={health}"
            )
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
