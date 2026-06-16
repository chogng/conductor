from dataclasses import dataclass, field

from .origin_commands import (
    advanced_labtalk_commands,
    axis_appearance_commands,
    axis_frame_commands,
    axis_range_commands,
    axis_scale_commands,
    axis_spacing_commands,
    axis_title_commands,
    legend_style_commands,
    run_origin_commands,
)


@dataclass(frozen=True)
class OriginAction:
    id: str
    label: str
    commands: list = field(default_factory=list)


def origin_action(action_id: str, label: str, commands) -> OriginAction:
    return OriginAction(
        id=action_id,
        label=label,
        commands=list(commands or []),
    )


def _log_action_result(warning_logger, label: str, result):
    error = result.get("error") if isinstance(result, dict) else None
    if isinstance(error, dict) and callable(warning_logger):
        warning_logger(f"Origin action warning: failed to apply {label}: {error.get('message')}")


def _run_origin_action(op_module, action: OriginAction, warning_logger=None):
    result = run_origin_commands(op_module, action.commands, action.label)
    _log_action_result(warning_logger, action.id, result)
    return result


def run_origin_actions(op_module, actions, warning_logger=None):
    results = {}
    for action in actions:
        if not isinstance(action, OriginAction):
            continue
        results[action.id] = _run_origin_action(op_module, action, warning_logger)
    return results


def axis_capability_actions(axis_plan):
    return [
        origin_action(
            "origin.axis.frame",
            "Axis frame command",
            axis_frame_commands(getattr(axis_plan, "axis_frame", {})),
        ),
        origin_action(
            "origin.axis.scale",
            "Axis scale command",
            axis_scale_commands(getattr(axis_plan, "axis_scale", {})),
        ),
        origin_action(
            "origin.axis.range",
            "Axis range command",
            axis_range_commands(getattr(axis_plan, "axis_range", {})),
        ),
        origin_action(
            "origin.axis.title",
            "Axis title command",
            axis_title_commands(getattr(axis_plan, "axis_title", {})),
        ),
        origin_action(
            "origin.axis.spacing",
            "Axis spacing command",
            axis_spacing_commands(getattr(axis_plan, "axis_spacing", {})),
        ),
        origin_action(
            "origin.axis.appearance",
            "Axis appearance command",
            axis_appearance_commands(getattr(axis_plan, "axis_appearance", {})),
        ),
        origin_action(
            "origin.axis.advancedCommands",
            "Axis advanced command",
            advanced_labtalk_commands(
                getattr(axis_plan, "axis_advanced_commands", []),
                "Axis advanced command",
            ),
        ),
    ]


def apply_axis_capabilities_action(op_module, axis_plan, warning_logger=None):
    return run_origin_actions(op_module, axis_capability_actions(axis_plan), warning_logger)


def apply_axis_appearance_action(op_module, appearance, warning_logger=None):
    return _run_origin_action(
        op_module,
        origin_action(
            "origin.axis.appearance",
            "Axis appearance command",
            axis_appearance_commands(appearance),
        ),
        warning_logger,
    )


def apply_axis_advanced_commands_action(op_module, commands, warning_logger=None):
    return _run_origin_action(
        op_module,
        origin_action(
            "origin.axis.advancedCommands",
            "Axis advanced command",
            advanced_labtalk_commands(commands, "Axis advanced command"),
        ),
        warning_logger,
    )


def style_capability_actions(legend, advanced_commands):
    return [
        origin_action(
            "origin.style.legend",
            "Legend style command",
            legend_style_commands(legend),
        ),
        origin_action(
            "origin.style.advancedCommands",
            "Style command",
            advanced_labtalk_commands(advanced_commands, "Style command"),
        ),
    ]


def apply_style_capabilities_action(op_module, legend, advanced_commands, warning_logger=None):
    return run_origin_actions(
        op_module,
        style_capability_actions(legend, advanced_commands),
        warning_logger,
    )
