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
    axis_limits: dict = field(default_factory=dict)
    plot_command_override: str = ""
    import_pre_commands: list[str] = field(default_factory=list)
    import_post_commands: list[str] = field(default_factory=list)
    plot_pre_commands: list[str] = field(default_factory=list)
    plot_post_commands: list[str] = field(default_factory=list)
    graph_pre_commands: list[str] = field(default_factory=list)
    graph_post_commands: list[str] = field(default_factory=list)
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
        ["commands", "postCommands"],
        "capabilities.style",
    )
    axis_section = _assert_allowed_keys(
        root.get("axis"),
        ["commands", "postCommands", "limits", "appearance"],
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
    _assert_command_list_shape(style_section.get("commands"), "capabilities.style.commands")
    _assert_command_list_shape(style_section.get("postCommands"), "capabilities.style.postCommands")
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
    axis_limits = normalize_axis_limit_settings(axis_capabilities.get("limits"))
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
        style_commands=_pick_commands(style_capabilities, "commands", "postCommands"),
        axis_commands=_pick_commands(axis_capabilities, "commands", "postCommands"),
        global_pre_commands=_pick_commands(global_capabilities, "preCommands", "beforeCommands"),
        global_post_commands=_pick_commands(global_capabilities, "postCommands", "afterCommands"),
    )
