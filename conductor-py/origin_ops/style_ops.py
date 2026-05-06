from .origin_session import run_command_list


def apply_style_commands(op_module, commands):
    run_command_list(op_module, commands or [], "Style command")

