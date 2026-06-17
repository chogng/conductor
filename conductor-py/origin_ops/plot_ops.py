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


def normalize_plot_line_width(value, min_width: float = 0.5, max_width: float = 20.0):
    try:
        width = float(value)
    except Exception:
        return None
    if width <= 0:
        return None
    return max(min_width, min(max_width, width))


def normalize_plot_symbol_shape(value):
    try:
        shape = int(value)
    except Exception:
        return None
    if shape < 0 or shape > 58:
        return None
    return shape


def _iter_graph_layers(graph_page):
    if graph_page is None:
        return []

    layers = []
    try:
        for layer in graph_page:
            layers.append(layer)
    except Exception:
        pass

    if layers:
        return layers

    try:
        first_layer = graph_page[0]
    except Exception:
        first_layer = None
    return [first_layer] if first_layer is not None else []


def apply_plot_line_width(op_module, line_width):
    normalized_line_width = normalize_plot_line_width(line_width)
    if normalized_line_width is None:
        return

    find_graph = getattr(op_module, "find_graph", None)
    if not callable(find_graph):
        return

    try:
        graph_page = find_graph()
    except Exception:
        return

    # LabTalk `set -w` uses units of pt*500. Use `-wp` so UI pt values map directly.
    width_cmd_pt = f"-wp {normalized_line_width:g}"
    width_cmd_scaled = f"-w {int(round(normalized_line_width * 500))}"
    for layer in _iter_graph_layers(graph_page):
        plot_list_fn = getattr(layer, "plot_list", None)
        if not callable(plot_list_fn):
            continue

        try:
            plots = plot_list_fn()
        except Exception:
            continue

        for plot in plots or []:
            set_cmd = getattr(plot, "set_cmd", None)
            if callable(set_cmd):
                try:
                    set_cmd(width_cmd_pt)
                    continue
                except Exception:
                    try:
                        set_cmd(width_cmd_scaled)
                        continue
                    except Exception:
                        pass

            set_float = getattr(plot, "set_float", None)
            if callable(set_float):
                try:
                    set_float("line.width", normalized_line_width)
                except Exception:
                    continue


def apply_plot_symbol_shape(op_module, symbol_shape):
    normalized_symbol_shape = normalize_plot_symbol_shape(symbol_shape)
    if normalized_symbol_shape is None:
        return

    find_graph = getattr(op_module, "find_graph", None)
    if not callable(find_graph):
        return

    try:
        graph_page = find_graph()
    except Exception:
        return

    shape_cmd = f"-k {normalized_symbol_shape}"
    for layer in _iter_graph_layers(graph_page):
        plot_list_fn = getattr(layer, "plot_list", None)
        if not callable(plot_list_fn):
            continue

        try:
            plots = plot_list_fn()
        except Exception:
            continue

        for plot in plots or []:
            set_cmd = getattr(plot, "set_cmd", None)
            if callable(set_cmd):
                try:
                    set_cmd(shape_cmd)
                    continue
                except Exception:
                    pass

            set_int = getattr(plot, "set_int", None)
            if callable(set_int):
                try:
                    set_int("symbol.shape", normalized_symbol_shape)
                except Exception:
                    continue


def run_plot_pipeline(
    op_module,
    plot_command: str,
    graph_pre_commands=None,
    plot_pre_commands=None,
    post_plot_commands=None,
    plot_error_message: str = "Plot failed at plotxy",
    line_width=None,
    symbol_shape=None,
):
    run_command_list(op_module, graph_pre_commands or [], "Graph pre-command")
    run_command_list(op_module, plot_pre_commands or [], "Plot pre-command")
    run_labtalk_or_raise(op_module, plot_command, plot_error_message)
    apply_plot_line_width(op_module, line_width)
    apply_plot_symbol_shape(op_module, symbol_shape)
    run_command_list(op_module, post_plot_commands or [], "Post-plot command")
