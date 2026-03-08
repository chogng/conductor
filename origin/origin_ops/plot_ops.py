from .origin_session import ensure_lt_terminated, run_command_list, run_labtalk_or_raise


def build_plot_command(custom_command: str, xy_pairs: str, plot_type_value) -> str:
    custom = ensure_lt_terminated(custom_command)
    if custom:
        return custom

    normalized_xy_pairs = str(xy_pairs or "").strip() or "((1,2))"
    try:
        normalized_plot_type = max(0, int(plot_type_value))
    except Exception:
        normalized_plot_type = 202
    return f"plotxy iy:={normalized_xy_pairs} plot:={normalized_plot_type};"


def run_plot_pipeline(
    op_module,
    plot_command: str,
    graph_pre_commands=None,
    plot_pre_commands=None,
    post_plot_commands=None,
    plot_error_message: str = "Plot failed at plotxy",
):
    run_command_list(op_module, graph_pre_commands or [], "Graph pre-command")
    run_command_list(op_module, plot_pre_commands or [], "Plot pre-command")
    run_labtalk_or_raise(op_module, plot_command, plot_error_message)
    run_command_list(op_module, post_plot_commands or [], "Post-plot command")

