from dataclasses import dataclass

from .origin_session import run_command_list


@dataclass(frozen=True)
class OriginCommand:
    text: str
    label: str = "Origin command"
    kind: str = "labtalk"


def _format_origin_number(value) -> str:
    try:
        num = float(value)
    except Exception:
        return ""
    if not (num == num) or num in (float("inf"), float("-inf")):
        return ""
    if num == 0:
        return "0"
    return format(num, ".16g")


def _normalize_origin_text(value, max_length: int = 160) -> str:
    text = str(value or "").replace("\\", " ").replace("_", " ")
    text = " ".join(text.split()).strip()
    if not text:
        return ""
    return text[:max_length].strip()


def _escape_labtalk_text(value) -> str:
    return _normalize_origin_text(value).replace("\\", "\\\\").replace('"', '\\"')


def _coerce_optional_bool(value):
    return value if isinstance(value, bool) else None


def _origin_bool(value: bool) -> int:
    return 1 if value else 0


def _labtalk_commands(commands, label: str):
    return [
        OriginCommand(text=command, label=label, kind="labtalk")
        for command in commands
        if isinstance(command, str) and command.strip()
    ]


def run_origin_commands(op_module, commands, label: str):
    unsupported = [
        command.kind
        for command in commands
        if isinstance(command, OriginCommand) and command.kind != "labtalk"
    ]
    normalized = [
        command
        for command in commands
        if isinstance(command, OriginCommand) and command.kind == "labtalk" and command.text.strip()
    ]
    if not normalized:
        return {
            "applied": False,
            "unsupported": unsupported,
            "warnings": [],
            "error": None,
        }

    try:
        for command in normalized:
            run_command_list(op_module, [command.text], command.label or label)
        return {
            "applied": True,
            "unsupported": unsupported,
            "warnings": [],
            "error": None,
        }
    except Exception as exc:
        return {
            "applied": False,
            "unsupported": unsupported,
            "warnings": [],
            "error": {
                "code": "origin-command-failed",
                "message": str(exc),
            },
        }


def _normalize_axis_appearance_patch(value):
    if not isinstance(value, dict):
        return {}
    patch = {}
    for key in ("showGrid", "showMajorTicks", "showMinorTicks"):
        flag = _coerce_optional_bool(value.get(key))
        if flag is not None:
            patch[key] = flag
    return patch


def normalize_axis_appearance_patch(appearance):
    if not isinstance(appearance, dict):
        return {}

    normalized = {}
    for axis_name in ("x", "y"):
        axis_patch = _normalize_axis_appearance_patch(appearance.get(axis_name))
        if axis_patch:
            normalized[axis_name] = axis_patch
    return normalized


def _grid_show_value(axis_patch):
    show_grid = _coerce_optional_bool(axis_patch.get("showGrid"))
    if show_grid is None:
        return None
    # Current chart UI exposes major grid lines only. Keep the state numeric so
    # this command builder can later expand to minor/both grid states without
    # changing the TypeScript semantic DTO.
    return 1 if show_grid else 0


def axis_appearance_commands(appearance):
    normalized = normalize_axis_appearance_patch(appearance)
    commands = []
    for axis_name, axis_patch in normalized.items():
        grid_show = _grid_show_value(axis_patch)
        if grid_show is not None:
            commands.append(f"layer.{axis_name}.grid.show={grid_show}")
            commands.append(f"layer.{axis_name}.showGrids={grid_show}")

        show_major_ticks = _coerce_optional_bool(axis_patch.get("showMajorTicks"))
        if show_major_ticks is not None:
            commands.append(f"layer.{axis_name}.majorTicks={_origin_bool(show_major_ticks)}")

        show_minor_ticks = _coerce_optional_bool(axis_patch.get("showMinorTicks"))
        if show_minor_ticks is not None:
            commands.append(f"layer.{axis_name}.minorTicks={_origin_bool(show_minor_ticks)}")
    return _labtalk_commands(commands, "Axis appearance command")


def axis_frame_commands(frame):
    if not isinstance(frame, dict):
        return []
    commands = []
    x_opposite = _coerce_optional_bool(frame.get("xOpposite"))
    y_opposite = _coerce_optional_bool(frame.get("yOpposite"))
    if x_opposite is not None:
        commands.append(f"layer.x.opposite={_origin_bool(x_opposite)}")
    if y_opposite is not None:
        commands.append(f"layer.y.opposite={_origin_bool(y_opposite)}")
    return _labtalk_commands(commands, "Axis frame command")


def axis_scale_commands(scale):
    if not isinstance(scale, dict):
        return []
    commands = []
    for axis_name in ("x", "y"):
        axis_scale = scale.get(axis_name)
        if not isinstance(axis_scale, dict):
            continue
        mode = str(axis_scale.get("mode") or "").strip().lower()
        if mode not in ("linear", "log"):
            continue
        commands.append(f"layer.{axis_name}.type={2 if mode == 'log' else 1}")
    return _labtalk_commands(commands, "Axis scale command")


def axis_range_commands(range_patch):
    if not isinstance(range_patch, dict):
        return []
    commands = []
    for axis_name in ("x", "y"):
        axis_range = range_patch.get(axis_name)
        if not isinstance(axis_range, dict):
            continue
        from_text = _format_origin_number(axis_range.get("from"))
        to_text = _format_origin_number(axis_range.get("to"))
        step_text = _format_origin_number(axis_range.get("step"))
        if from_text:
            commands.append(f"layer.{axis_name}.from={from_text}")
        if to_text:
            commands.append(f"layer.{axis_name}.to={to_text}")
        if step_text:
            commands.append(f"layer.{axis_name}.inc={step_text}")
        if from_text or to_text or step_text:
            commands.append(f"layer.{axis_name}.rescale=1")
    return _labtalk_commands(commands, "Axis range command")


def axis_title_commands(title):
    if not isinstance(title, dict):
        return []
    commands = []
    for axis_name, label_command, font_command in (
        ("x", "label -xb", "xb.fsize"),
        ("y", "label -yl", "yl.fsize"),
    ):
        axis_title = title.get(axis_name)
        if not isinstance(axis_title, dict):
            continue
        text = _escape_labtalk_text(axis_title.get("text"))
        if text:
            commands.append(f'{label_command} "{text}";')
        font_size = _format_origin_number(axis_title.get("fontSize"))
        if font_size:
            commands.append(f"{font_command}={font_size};")
    return _labtalk_commands(commands, "Axis title command")


def axis_spacing_commands(spacing):
    if not isinstance(spacing, dict):
        return []
    commands = []
    tick_label_offset = _format_origin_number(spacing.get("tickLabelOffset"))
    if tick_label_offset:
        commands.append(f"layer.x.label.offsetV={tick_label_offset}")
        commands.append(f"layer.y.label.offsetH={tick_label_offset}")
    axis_title_gap = _format_origin_number(spacing.get("axisTitleGap"))
    if axis_title_gap:
        commands.append(f"system.tick.gapAxTitle={axis_title_gap}")
    return _labtalk_commands(commands, "Axis spacing command")


def advanced_labtalk_commands(commands, label: str):
    return _labtalk_commands(commands or [], label)


def legend_style_commands(legend):
    if not isinstance(legend, dict):
        return []
    font_size = _format_origin_number(legend.get("fontSize"))
    return _labtalk_commands([f"legend.fsize={font_size}"] if font_size else [], "Legend style command")
