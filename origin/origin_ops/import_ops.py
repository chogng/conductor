from .origin_session import run_command_list, run_labtalk_or_raise


def escape_labtalk_path(path_value: str) -> str:
    return str(path_value).replace("\\", "\\\\").replace('"', '\\"')


def normalize_origin_display_text(text_value: str) -> str:
    text = str(text_value or "")
    # Origin text objects may interpret "\" and "_" as rich-text markers.
    text = text.replace("\\", " ").replace("_", " ")
    return " ".join(text.split())


def escape_labtalk_text(text_value: str) -> str:
    normalized = normalize_origin_display_text(text_value)
    return normalized.replace("\\", "\\\\").replace('"', '\\"')


def run_csv_import(
    op_module,
    csv_path,
    workbook_long_name: str = "",
    import_pre_commands=None,
    import_post_commands=None,
    label_prefix: str = "CSV import",
):
    csv_lt = escape_labtalk_path(str(csv_path))
    run_labtalk_or_raise(
        op_module,
        "newbook;",
        f"{label_prefix} failed at newbook",
    )
    run_command_list(op_module, import_pre_commands or [], "Import pre-command")
    run_labtalk_or_raise(
        op_module,
        f'impCSV fname:="{csv_lt}";',
        f"{label_prefix} failed at impCSV",
    )
    if workbook_long_name:
        title = escape_labtalk_text(workbook_long_name)
        run_labtalk_or_raise(
            op_module,
            f'page.longname$="{title}";',
            f"{label_prefix} failed at setting workbook title",
        )
    run_command_list(op_module, import_post_commands or [], "Import post-command")
