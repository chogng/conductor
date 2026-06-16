from .origin_session import run_command_list


def _coerce_optional_bool(value):
    return value if isinstance(value, bool) else None


def _origin_bool(value: bool) -> int:
    return 1 if value else 0


def _normalize_axis_patch(value):
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
        axis_patch = _normalize_axis_patch(appearance.get(axis_name))
        if axis_patch:
            normalized[axis_name] = axis_patch
    return normalized


def _grid_show_value(axis_patch):
    show_grid = _coerce_optional_bool(axis_patch.get("showGrid"))
    if show_grid is None:
        return None
    # Current chart UI exposes major grid lines only. Keep the state numeric so
    # the adapter can later expand to minor/both grid states without changing TS.
    return 1 if show_grid else 0


def _build_axis_appearance_commands(appearance):
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
    return commands


def apply_axis_appearance_patch(op_module, appearance):
    commands = _build_axis_appearance_commands(appearance)
    if not commands:
        return {
            "applied": False,
            "unsupported": [],
            "warnings": [],
            "error": None,
        }

    try:
        run_command_list(op_module, commands, "Axis appearance command")
        return {
            "applied": True,
            "unsupported": [],
            "warnings": [],
            "error": None,
        }
    except Exception as exc:
        return {
            "applied": False,
            "unsupported": [],
            "warnings": [],
            "error": {
                "code": "axis-op-failed",
                "message": str(exc),
            },
        }
