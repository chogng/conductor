import json
from dataclasses import dataclass, field


@dataclass
class CapabilityPlan:
    workbook_long_name: str = ""
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
        ["workbookLongName", "longName", "preCommands", "beforeCommands", "postCommands", "afterCommands"],
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
        ["commands", "postCommands"],
        "capabilities.axis",
    )
    commands_section = _assert_allowed_keys(
        root.get("commands"),
        ["preCommands", "beforeCommands", "postCommands", "afterCommands"],
        "capabilities.commands",
    )

    _assert_string(import_section.get("workbookLongName"), "capabilities.import.workbookLongName")
    _assert_string(import_section.get("longName"), "capabilities.import.longName")
    _assert_string(plot_section.get("command"), "capabilities.plot.command")
    _assert_string(plot_section.get("plotCommand"), "capabilities.plot.plotCommand")

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
    plot_command_override_raw = plot_capabilities.get("command")
    plot_command_override = (
        plot_command_override_raw.strip()
        if isinstance(plot_command_override_raw, str)
        else ""
    )

    return CapabilityPlan(
        workbook_long_name=workbook_long_name,
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
