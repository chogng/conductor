from .origin_session import run_command_list


def _format_origin_number(value) -> str:
    try:
        num = float(value)
    except Exception:
        return ""
    if not (num == num) or num in (float("inf"), float("-inf")):
        return ""
    return format(num, ".16g")


def _build_legend_style_commands(legend):
    if not isinstance(legend, dict):
        return []
    font_size = _format_origin_number(legend.get("fontSize"))
    return [f"legend.fsize={font_size}"] if font_size else []


def apply_style_commands(op_module, commands):
    run_command_list(op_module, commands or [], "Style command")


def apply_style_capabilities(op_module, legend, advanced_commands):
    run_command_list(op_module, _build_legend_style_commands(legend), "Legend style command")
    apply_style_commands(op_module, advanced_commands)
