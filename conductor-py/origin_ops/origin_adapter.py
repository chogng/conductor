from .origin_actions import (
    apply_axis_advanced_commands_action,
    apply_axis_appearance_action,
)
from .origin_commands import (
    axis_frame_commands,
    axis_range_commands,
    axis_scale_commands,
    axis_spacing_commands,
    axis_title_commands,
    normalize_axis_appearance_patch,
    run_origin_commands,
)


def _run_adapter_commands(op_module, commands, label: str):
    return run_origin_commands(op_module, commands, label)


def apply_axis_appearance_patch(op_module, appearance):
    return apply_axis_appearance_action(op_module, appearance)


def apply_axis_frame_patch(op_module, frame):
    return _run_adapter_commands(op_module, axis_frame_commands(frame), "Axis frame command")


def apply_axis_scale_patch(op_module, scale):
    return _run_adapter_commands(op_module, axis_scale_commands(scale), "Axis scale command")


def apply_axis_range_patch(op_module, range_patch):
    return _run_adapter_commands(op_module, axis_range_commands(range_patch), "Axis range command")


def apply_axis_title_patch(op_module, title):
    return _run_adapter_commands(op_module, axis_title_commands(title), "Axis title command")


def apply_axis_spacing_patch(op_module, spacing):
    return _run_adapter_commands(op_module, axis_spacing_commands(spacing), "Axis spacing command")


def apply_axis_advanced_commands(op_module, commands):
    return apply_axis_advanced_commands_action(op_module, commands)
