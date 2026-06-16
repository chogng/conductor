from .origin_session import run_command_list
from .origin_actions import apply_style_capabilities_action


def apply_style_commands(op_module, commands):
    run_command_list(op_module, commands or [], "Style command")


def apply_style_capabilities(op_module, legend, advanced_commands):
    return apply_style_capabilities_action(op_module, legend, advanced_commands)
