from .origin_session import run_command_list


def apply_axis_commands(op_module, commands):
    run_command_list(op_module, commands or [], "Axis command")

