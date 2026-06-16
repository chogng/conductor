from .origin_session import run_command_list
from .origin_adapter import apply_axis_appearance_patch


def apply_axis_commands(op_module, commands):
    run_command_list(op_module, commands or [], "Axis command")


def apply_axis_appearance(op_module, appearance, warning_logger=None):
    result = apply_axis_appearance_patch(op_module, appearance)
    error = result.get("error") if isinstance(result, dict) else None
    if isinstance(error, dict) and callable(warning_logger):
        warning_logger(f"Axis warning: failed to apply axis appearance: {error.get('message')}")
    return result


def _get_active_graph_layer(op_module):
    find_graph = getattr(op_module, "find_graph", None)
    if not callable(find_graph):
        return None
    try:
        graph = find_graph()
    except Exception:
        return None
    if graph is None:
        return None
    try:
        return graph[0]
    except Exception:
        return None


def apply_axis_limits(op_module, limits, warning_logger=None):
    if not isinstance(limits, dict) or not limits:
        return

    layer = _get_active_graph_layer(op_module)
    if layer is None:
        if callable(warning_logger):
            warning_logger("Axis warning: active graph layer is unavailable for originpro axis limits.")
        return

    axis_getter = getattr(layer, "axis", None)
    if not callable(axis_getter):
        if callable(warning_logger):
            warning_logger("Axis warning: layer.axis() is unavailable for originpro axis limits.")
        return

    for axis_name in ("x", "y"):
        axis_limits = limits.get(axis_name)
        if not isinstance(axis_limits, dict) or not axis_limits:
            continue
        try:
            axis = axis_getter(axis_name)
        except Exception as exc:
            if callable(warning_logger):
                warning_logger(f"Axis warning: failed to access {axis_name}-axis via originpro API: {exc!r}")
            continue

        try:
            scale = axis_limits.get("scale")
            if isinstance(scale, str) and scale.strip():
                axis.scale = "log10" if scale.strip().lower() == "log" else scale.strip().lower()
            begin = axis_limits.get("from")
            end = axis_limits.get("to")
            step = axis_limits.get("step")
            if begin is not None or end is not None or step is not None:
                axis.set_limits(begin=begin, end=end, step=step)
        except Exception as exc:
            if callable(warning_logger):
                warning_logger(f"Axis warning: failed to apply {axis_name}-axis limits via originpro API: {exc!r}")
