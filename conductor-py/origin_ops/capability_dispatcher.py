import json
from dataclasses import dataclass, field


@dataclass
class CapabilityPlan:
    workbook_long_name: str = ""
    import_column_long_names: list[str] = field(default_factory=list)
    import_column_units: list[str] = field(default_factory=list)
    import_column_comments: list[str] = field(default_factory=list)
    import_column_designations: list[str] = field(default_factory=list)
    axis_appearance: dict = field(default_factory=dict)
    axis_range: dict = field(default_factory=dict)
    axis_scale: dict = field(default_factory=dict)
    axis_title: dict = field(default_factory=dict)
    axis_spacing: dict = field(default_factory=dict)
    axis_frame: dict = field(default_factory=dict)
    axis_advanced_commands: list[str] = field(default_factory=list)
    axis_limits: dict = field(default_factory=dict)
    plot_command_override: str = ""
    import_pre_commands: list[str] = field(default_factory=list)
    import_post_commands: list[str] = field(default_factory=list)
    plot_pre_commands: list[str] = field(default_factory=list)
    plot_post_commands: list[str] = field(default_factory=list)
    graph_pre_commands: list[str] = field(default_factory=list)
    graph_post_commands: list[str] = field(default_factory=list)
    style_legend: dict = field(default_factory=dict)
    style_commands: list[str] = field(default_factory=list)
    axis_commands: list[str] = field(default_factory=list)
    global_pre_commands: list[str] = field(default_factory=list)
    global_post_commands: list[str] = field(default_factory=list)


def _assert_dict(value, field_path: str) -> dict:
    if value is None:
        return {}
    if not isinstance(value, dict):
        raise RuntimeError(f"Invalid Origin capabilities at '{field_path}': expected object.")
    return value


def _assert_allowed_keys(value, allowed_keys, field_path: str) -> dict:
    section = _assert_dict(value, field_path)
    allowed = set(allowed_keys)
    for key in section.keys():
        if key not in allowed:
            raise RuntimeError(f"Invalid Origin capabilities field '{field_path}.{key}'.")
    return section


def _assert_string(value, field_path: str) -> None:
    if value is None:
        return
    if not isinstance(value, str):
        raise RuntimeError(f"Invalid Origin capabilities at '{field_path}': expected string.")


def _assert_command_list_shape(value, field_path: str) -> None:
    if value is None:
        return
    if isinstance(value, str):
        return
    if not isinstance(value, list):
        raise RuntimeError(
            f"Invalid Origin capabilities at '{field_path}': expected string or string array."
        )
    for idx, item in enumerate(value):
        if not isinstance(item, str):
            raise RuntimeError(
                f"Invalid Origin capabilities at '{field_path}[{idx}]': expected string."
            )


def _assert_string_list_shape(value, field_path: str) -> None:
    if value is None:
        return
    if not isinstance(value, list):
        raise RuntimeError(
            f"Invalid Origin capabilities at '{field_path}': expected string array."
        )
    for idx, item in enumerate(value):
        if not isinstance(item, str):
            raise RuntimeError(
                f"Invalid Origin capabilities at '{field_path}[{idx}]': expected string."
            )


def _assert_number(value, field_path: str) -> None:
    if value is None:
        return
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise RuntimeError(
            f"Invalid Origin capabilities at '{field_path}': expected finite number."
        )
    if value != value or value in (float("inf"), float("-inf")):
        raise RuntimeError(
            f"Invalid Origin capabilities at '{field_path}': expected finite number."
        )


def _assert_boolean(value, field_path: str) -> None:
    if value is None:
        return
    if not isinstance(value, bool):
        raise RuntimeError(
            f"Invalid Origin capabilities at '{field_path}': expected boolean."
        )


def validate_capabilities_payload(raw_capabilities) -> dict:
    root = _assert_allowed_keys(
        raw_capabilities,
        [
            "import",
            "plot",
            "graph",
            "style",
            "axis",
            "commands",
            "preCommands",
            "postCommands",
        ],
        "capabilities",
    )

    import_section = _assert_allowed_keys(
        root.get("import"),
        ["workbookLongName", "longName", "columnLabels", "preCommands", "beforeCommands", "postCommands", "afterCommands"],
        "capabilities.import",
    )
    plot_section = _assert_allowed_keys(
        root.get("plot"),
        ["command", "plotCommand", "preCommands", "beforeCommands", "postCommands", "afterCommands", "postPlotCommands"],
        "capabilities.plot",
    )
    graph_section = _assert_allowed_keys(
        root.get("graph"),
        ["preCommands", "beforeCommands", "postCommands", "afterCommands"],
        "capabilities.graph",
    )
    style_section = _assert_allowed_keys(
        root.get("style"),
        ["legend", "advancedCommands", "commands", "postCommands"],
        "capabilities.style",
    )
    style_legend = _assert_allowed_keys(
        style_section.get("legend"),
        ["fontSize"],
        "capabilities.style.legend",
    )
    axis_section = _assert_allowed_keys(
        root.get("axis"),
        [
            "appearance",
            "range",
            "scale",
            "title",
            "spacing",
            "frame",
            "advancedCommands",
            "commands",
            "postCommands",
            "limits",
        ],
        "capabilities.axis",
    )
    commands_section = _assert_allowed_keys(
        root.get("commands"),
        ["preCommands", "beforeCommands", "postCommands", "afterCommands"],
        "capabilities.commands",
    )
    import_column_labels = _assert_allowed_keys(
        import_section.get("columnLabels"),
        ["longNames", "units", "comments", "designations"],
        "capabilities.import.columnLabels",
    )
    axis_limits = _assert_allowed_keys(
        axis_section.get("limits"),
        ["x", "y"],
        "capabilities.axis.limits",
    )
    axis_range = _assert_allowed_keys(
        axis_section.get("range"),
        ["x", "y"],
        "capabilities.axis.range",
    )
    axis_scale = _assert_allowed_keys(
        axis_section.get("scale"),
        ["x", "y"],
        "capabilities.axis.scale",
    )
    axis_title = _assert_allowed_keys(
        axis_section.get("title"),
        ["x", "y"],
        "capabilities.axis.title",
    )
    axis_spacing = _assert_allowed_keys(
        axis_section.get("spacing"),
        ["tickLabelOffset", "axisTitleGap"],
        "capabilities.axis.spacing",
    )
    axis_frame = _assert_allowed_keys(
        axis_section.get("frame"),
        ["xOpposite", "yOpposite"],
        "capabilities.axis.frame",
    )
    axis_appearance = _assert_allowed_keys(
        axis_section.get("appearance"),
        ["x", "y"],
        "capabilities.axis.appearance",
    )
    axis_appearance_x = _assert_allowed_keys(
        axis_appearance.get("x"),
        ["showGrid", "showMajorTicks", "showMinorTicks"],
        "capabilities.axis.appearance.x",
    )
    axis_appearance_y = _assert_allowed_keys(
        axis_appearance.get("y"),
        ["showGrid", "showMajorTicks", "showMinorTicks"],
        "capabilities.axis.appearance.y",
    )
    axis_x_limits = _assert_allowed_keys(
        axis_limits.get("x"),
        ["from", "to", "step", "scale"],
        "capabilities.axis.limits.x",
    )
    axis_y_limits = _assert_allowed_keys(
        axis_limits.get("y"),
        ["from", "to", "step", "scale"],
        "capabilities.axis.limits.y",
    )
    axis_x_range = _assert_allowed_keys(
        axis_range.get("x"),
        ["from", "to", "step"],
        "capabilities.axis.range.x",
    )
    axis_y_range = _assert_allowed_keys(
        axis_range.get("y"),
        ["from", "to", "step"],
        "capabilities.axis.range.y",
    )
    axis_x_scale = _assert_allowed_keys(
        axis_scale.get("x"),
        ["mode"],
        "capabilities.axis.scale.x",
    )
    axis_y_scale = _assert_allowed_keys(
        axis_scale.get("y"),
        ["mode"],
        "capabilities.axis.scale.y",
    )
    axis_x_title = _assert_allowed_keys(
        axis_title.get("x"),
        ["text", "fontSize"],
        "capabilities.axis.title.x",
    )
    axis_y_title = _assert_allowed_keys(
        axis_title.get("y"),
        ["text", "fontSize"],
        "capabilities.axis.title.y",
    )

    _assert_string(import_section.get("workbookLongName"), "capabilities.import.workbookLongName")
    _assert_string(import_section.get("longName"), "capabilities.import.longName")
    _assert_string(plot_section.get("command"), "capabilities.plot.command")
    _assert_string(plot_section.get("plotCommand"), "capabilities.plot.plotCommand")
    _assert_string_list_shape(
        import_column_labels.get("longNames"),
        "capabilities.import.columnLabels.longNames",
    )
    _assert_string_list_shape(
        import_column_labels.get("units"),
        "capabilities.import.columnLabels.units",
    )
    _assert_string_list_shape(
        import_column_labels.get("comments"),
        "capabilities.import.columnLabels.comments",
    )
    _assert_string_list_shape(
        import_column_labels.get("designations"),
        "capabilities.import.columnLabels.designations",
    )
    _assert_number(axis_x_limits.get("from"), "capabilities.axis.limits.x.from")
    _assert_number(axis_x_limits.get("to"), "capabilities.axis.limits.x.to")
    _assert_number(axis_x_limits.get("step"), "capabilities.axis.limits.x.step")
    _assert_string(axis_x_limits.get("scale"), "capabilities.axis.limits.x.scale")
    _assert_number(axis_y_limits.get("from"), "capabilities.axis.limits.y.from")
    _assert_number(axis_y_limits.get("to"), "capabilities.axis.limits.y.to")
    _assert_number(axis_y_limits.get("step"), "capabilities.axis.limits.y.step")
    _assert_string(axis_y_limits.get("scale"), "capabilities.axis.limits.y.scale")
    for axis_range_value, field_path in (
        (axis_x_range, "capabilities.axis.range.x"),
        (axis_y_range, "capabilities.axis.range.y"),
    ):
        _assert_number(axis_range_value.get("from"), f"{field_path}.from")
        _assert_number(axis_range_value.get("to"), f"{field_path}.to")
        _assert_number(axis_range_value.get("step"), f"{field_path}.step")
    _assert_string(axis_x_scale.get("mode"), "capabilities.axis.scale.x.mode")
    _assert_string(axis_y_scale.get("mode"), "capabilities.axis.scale.y.mode")
    _assert_string(axis_x_title.get("text"), "capabilities.axis.title.x.text")
    _assert_number(axis_x_title.get("fontSize"), "capabilities.axis.title.x.fontSize")
    _assert_string(axis_y_title.get("text"), "capabilities.axis.title.y.text")
    _assert_number(axis_y_title.get("fontSize"), "capabilities.axis.title.y.fontSize")
    _assert_number(style_legend.get("fontSize"), "capabilities.style.legend.fontSize")
    _assert_number(axis_spacing.get("tickLabelOffset"), "capabilities.axis.spacing.tickLabelOffset")
    _assert_number(axis_spacing.get("axisTitleGap"), "capabilities.axis.spacing.axisTitleGap")
    _assert_boolean(axis_frame.get("xOpposite"), "capabilities.axis.frame.xOpposite")
    _assert_boolean(axis_frame.get("yOpposite"), "capabilities.axis.frame.yOpposite")
    for appearance, field_path in (
        (axis_appearance_x, "capabilities.axis.appearance.x"),
        (axis_appearance_y, "capabilities.axis.appearance.y"),
    ):
        _assert_boolean(appearance.get("showGrid"), f"{field_path}.showGrid")
        _assert_boolean(appearance.get("showMajorTicks"), f"{field_path}.showMajorTicks")
        _assert_boolean(appearance.get("showMinorTicks"), f"{field_path}.showMinorTicks")

    _assert_command_list_shape(root.get("preCommands"), "capabilities.preCommands")
    _assert_command_list_shape(root.get("postCommands"), "capabilities.postCommands")
    _assert_command_list_shape(import_section.get("preCommands"), "capabilities.import.preCommands")
    _assert_command_list_shape(import_section.get("beforeCommands"), "capabilities.import.beforeCommands")
    _assert_command_list_shape(import_section.get("postCommands"), "capabilities.import.postCommands")
    _assert_command_list_shape(import_section.get("afterCommands"), "capabilities.import.afterCommands")
    _assert_command_list_shape(plot_section.get("preCommands"), "capabilities.plot.preCommands")
    _assert_command_list_shape(plot_section.get("beforeCommands"), "capabilities.plot.beforeCommands")
    _assert_command_list_shape(plot_section.get("postCommands"), "capabilities.plot.postCommands")
    _assert_command_list_shape(plot_section.get("afterCommands"), "capabilities.plot.afterCommands")
    _assert_command_list_shape(plot_section.get("postPlotCommands"), "capabilities.plot.postPlotCommands")
    _assert_command_list_shape(graph_section.get("preCommands"), "capabilities.graph.preCommands")
    _assert_command_list_shape(graph_section.get("beforeCommands"), "capabilities.graph.beforeCommands")
    _assert_command_list_shape(graph_section.get("postCommands"), "capabilities.graph.postCommands")
    _assert_command_list_shape(graph_section.get("afterCommands"), "capabilities.graph.afterCommands")
    _assert_command_list_shape(style_section.get("advancedCommands"), "capabilities.style.advancedCommands")
    _assert_command_list_shape(style_section.get("commands"), "capabilities.style.commands")
    _assert_command_list_shape(style_section.get("postCommands"), "capabilities.style.postCommands")
    _assert_command_list_shape(axis_section.get("advancedCommands"), "capabilities.axis.advancedCommands")
    _assert_command_list_shape(axis_section.get("commands"), "capabilities.axis.commands")
    _assert_command_list_shape(axis_section.get("postCommands"), "capabilities.axis.postCommands")
    _assert_command_list_shape(commands_section.get("preCommands"), "capabilities.commands.preCommands")
    _assert_command_list_shape(commands_section.get("beforeCommands"), "capabilities.commands.beforeCommands")
    _assert_command_list_shape(commands_section.get("postCommands"), "capabilities.commands.postCommands")
    _assert_command_list_shape(commands_section.get("afterCommands"), "capabilities.commands.afterCommands")

    return root


def parse_capabilities_json(raw_value: str) -> dict:
    text = str(raw_value or "").strip()
    if not text:
        return {}
    try:
        parsed = json.loads(text)
    except Exception as exc:
        raise RuntimeError(f"Invalid capabilities JSON: {exc}") from exc
    if not isinstance(parsed, dict):
        raise RuntimeError("Capabilities JSON must be an object.")
    return validate_capabilities_payload(parsed)


def normalize_commands(value):
    if isinstance(value, str):
        return [line.strip() for line in value.splitlines() if line and line.strip()]
    if isinstance(value, list):
        commands = []
        for item in value:
            if not isinstance(item, str):
                continue
            trimmed = item.strip()
            if trimmed:
                commands.append(trimmed)
        return commands
    return []


def normalize_string_list(value):
    if not isinstance(value, list):
        return []
    items = []
    for item in value:
        if not isinstance(item, str):
            continue
        items.append(item.strip())
    return items


def normalize_axis_limit_settings(value):
    if not isinstance(value, dict):
        return {}

    def _normalize_axis(axis_value):
        if not isinstance(axis_value, dict):
            return None
        normalized = {}
        for key in ("from", "to", "step"):
            raw = axis_value.get(key)
            if isinstance(raw, bool):
                continue
            if isinstance(raw, (int, float)) and raw == raw and raw not in (float("inf"), float("-inf")):
                normalized[key] = float(raw)
        scale_raw = axis_value.get("scale")
        if isinstance(scale_raw, str) and scale_raw.strip():
            normalized["scale"] = scale_raw.strip()
        return normalized or None

    normalized_limits = {}
    x_value = _normalize_axis(value.get("x"))
    y_value = _normalize_axis(value.get("y"))
    if x_value:
        normalized_limits["x"] = x_value
    if y_value:
        normalized_limits["y"] = y_value
    return normalized_limits


def normalize_axis_appearance_settings(value):
    if not isinstance(value, dict):
        return {}
    normalized = {}
    for axis_name in ("x", "y"):
        axis_value = value.get(axis_name)
        if not isinstance(axis_value, dict):
            continue
        axis_settings = {}
        for key in ("showGrid", "showMajorTicks", "showMinorTicks"):
            raw = axis_value.get(key)
            if isinstance(raw, bool):
                axis_settings[key] = raw
        if axis_settings:
            normalized[axis_name] = axis_settings
    return normalized


def normalize_axis_range_settings(value):
    if not isinstance(value, dict):
        return {}
    normalized = {}
    for axis_name in ("x", "y"):
        axis_value = value.get(axis_name)
        if not isinstance(axis_value, dict):
            continue
        axis_settings = {}
        for key in ("from", "to", "step"):
            raw = axis_value.get(key)
            if isinstance(raw, bool):
                continue
            if isinstance(raw, (int, float)) and raw == raw and raw not in (float("inf"), float("-inf")):
                axis_settings[key] = float(raw)
        if axis_settings:
            normalized[axis_name] = axis_settings
    return normalized


def normalize_axis_scale_settings(value):
    if not isinstance(value, dict):
        return {}
    normalized = {}
    for axis_name in ("x", "y"):
        axis_value = value.get(axis_name)
        if not isinstance(axis_value, dict):
            continue
        mode = axis_value.get("mode")
        normalized_mode = mode.strip().lower() if isinstance(mode, str) else ""
        if normalized_mode in ("linear", "log"):
            normalized[axis_name] = {"mode": normalized_mode}
    return normalized


def normalize_axis_title_settings(value):
    if not isinstance(value, dict):
        return {}
    normalized = {}
    for axis_name in ("x", "y"):
        axis_value = value.get(axis_name)
        if not isinstance(axis_value, dict):
            continue
        axis_settings = {}
        text = axis_value.get("text")
        if isinstance(text, str) and text.strip():
            axis_settings["text"] = text.strip()
        font_size = axis_value.get("fontSize")
        if not isinstance(font_size, bool) and isinstance(font_size, (int, float)):
            if font_size == font_size and font_size not in (float("inf"), float("-inf")):
                axis_settings["fontSize"] = float(font_size)
        if axis_settings:
            normalized[axis_name] = axis_settings
    return normalized


def normalize_axis_spacing_settings(value):
    if not isinstance(value, dict):
        return {}
    normalized = {}
    for key in ("tickLabelOffset", "axisTitleGap"):
        raw = value.get(key)
        if isinstance(raw, bool):
            continue
        if isinstance(raw, (int, float)) and raw == raw and raw not in (float("inf"), float("-inf")):
            normalized[key] = float(raw)
    return normalized


def normalize_axis_frame_settings(value):
    if not isinstance(value, dict):
        return {}
    normalized = {}
    for key in ("xOpposite", "yOpposite"):
        raw = value.get(key)
        if isinstance(raw, bool):
            normalized[key] = raw
    return normalized


def normalize_style_legend_settings(value):
    if not isinstance(value, dict):
        return {}
    font_size = value.get("fontSize")
    if isinstance(font_size, bool) or not isinstance(font_size, (int, float)):
        return {}
    if font_size != font_size or font_size in (float("inf"), float("-inf")):
        return {}
    return {"fontSize": float(font_size)}


def _as_dict(value):
    return value if isinstance(value, dict) else {}


def _pick_commands(section: dict, *keys):
    if not isinstance(section, dict):
        return []
    for key in keys:
        if key in section:
            return normalize_commands(section.get(key))
    return []


def resolve_capability_plan(raw_capabilities) -> CapabilityPlan:
    capabilities = validate_capabilities_payload(raw_capabilities or {})

    import_capabilities = _as_dict(capabilities.get("import"))
    plot_capabilities = _as_dict(capabilities.get("plot"))
    graph_capabilities = _as_dict(capabilities.get("graph"))
    style_capabilities = _as_dict(capabilities.get("style"))
    axis_capabilities = _as_dict(capabilities.get("axis"))
    global_capabilities = _as_dict(capabilities.get("commands"))

    workbook_long_name_raw = import_capabilities.get("workbookLongName")
    workbook_long_name = (
        workbook_long_name_raw.strip()
        if isinstance(workbook_long_name_raw, str)
        else ""
    )
    import_column_labels = _as_dict(import_capabilities.get("columnLabels"))
    import_column_long_names = normalize_string_list(import_column_labels.get("longNames"))
    import_column_units = normalize_string_list(import_column_labels.get("units"))
    import_column_comments = normalize_string_list(import_column_labels.get("comments"))
    import_column_designations = normalize_string_list(import_column_labels.get("designations"))
    axis_appearance = normalize_axis_appearance_settings(axis_capabilities.get("appearance"))
    axis_range = normalize_axis_range_settings(axis_capabilities.get("range"))
    axis_scale = normalize_axis_scale_settings(axis_capabilities.get("scale"))
    axis_title = normalize_axis_title_settings(axis_capabilities.get("title"))
    axis_spacing = normalize_axis_spacing_settings(axis_capabilities.get("spacing"))
    axis_frame = normalize_axis_frame_settings(axis_capabilities.get("frame"))
    style_legend = normalize_style_legend_settings(style_capabilities.get("legend"))
    axis_limits = normalize_axis_limit_settings(axis_capabilities.get("limits"))
    for axis_name, axis_limit in axis_limits.items():
        if not isinstance(axis_limit, dict):
            continue
        axis_limit_range = {
            key: axis_limit[key]
            for key in ("from", "to", "step")
            if key in axis_limit
        }
        if axis_limit_range and axis_name not in axis_range:
            axis_range[axis_name] = axis_limit_range
        axis_limit_scale = axis_limit.get("scale")
        normalized_axis_limit_scale = axis_limit_scale.strip().lower() if isinstance(axis_limit_scale, str) else ""
        if normalized_axis_limit_scale in ("linear", "log") and axis_name not in axis_scale:
            axis_scale[axis_name] = {"mode": normalized_axis_limit_scale}
    plot_command_override_raw = plot_capabilities.get("command")
    plot_command_override = (
        plot_command_override_raw.strip()
        if isinstance(plot_command_override_raw, str)
        else ""
    )

    return CapabilityPlan(
        workbook_long_name=workbook_long_name,
        import_column_long_names=import_column_long_names,
        import_column_units=import_column_units,
        import_column_comments=import_column_comments,
        import_column_designations=import_column_designations,
        axis_appearance=axis_appearance,
        axis_range=axis_range,
        axis_scale=axis_scale,
        axis_title=axis_title,
        axis_spacing=axis_spacing,
        axis_frame=axis_frame,
        axis_advanced_commands=_pick_commands(
            axis_capabilities,
            "advancedCommands",
            "commands",
            "postCommands",
        ),
        axis_limits=axis_limits,
        plot_command_override=plot_command_override,
        import_pre_commands=_pick_commands(import_capabilities, "preCommands", "beforeCommands"),
        import_post_commands=_pick_commands(import_capabilities, "postCommands", "afterCommands"),
        plot_pre_commands=_pick_commands(plot_capabilities, "preCommands", "beforeCommands"),
        plot_post_commands=_pick_commands(
            plot_capabilities,
            "postCommands",
            "afterCommands",
            "postPlotCommands",
        ),
        graph_pre_commands=_pick_commands(graph_capabilities, "preCommands", "beforeCommands"),
        graph_post_commands=_pick_commands(graph_capabilities, "postCommands", "afterCommands"),
        style_legend=style_legend,
        style_commands=_pick_commands(style_capabilities, "advancedCommands", "commands", "postCommands"),
        axis_commands=_pick_commands(axis_capabilities, "commands", "postCommands"),
        global_pre_commands=_pick_commands(global_capabilities, "preCommands", "beforeCommands"),
        global_post_commands=_pick_commands(global_capabilities, "postCommands", "afterCommands"),
    )
