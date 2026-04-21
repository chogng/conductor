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


def normalize_origin_short_name(name_value: str, fallback_prefix: str = "CDX") -> str:
    text = "".join(
        char for char in str(name_value or "") if char.isalnum() or char == "_"
    )
    if not text:
        text = fallback_prefix
    if not text[0].isalpha():
        text = f"{fallback_prefix}{text}"
    return text[:21]


def run_csv_import(
    op_module,
    csv_path,
    import_mode: str = "new-book",
    workbook_short_name: str = "",
    workbook_long_name: str = "",
    sheet_long_name: str = "",
    import_pre_commands=None,
    import_post_commands=None,
    label_prefix: str = "CSV import",
):
    csv_lt = escape_labtalk_path(str(csv_path))
    normalized_import_mode = str(import_mode or "new-book").strip().lower()
    normalized_workbook_short_name = normalize_origin_short_name(workbook_short_name)

    if normalized_import_mode == "existing-book-new-sheet":
        run_labtalk_or_raise(
            op_module,
            f"win -a {normalized_workbook_short_name};",
            f"{label_prefix} failed at activating workbook",
        )
        run_labtalk_or_raise(
            op_module,
            "newsheet;",
            f"{label_prefix} failed at newsheet",
        )
    else:
        run_labtalk_or_raise(
            op_module,
            "newbook;",
            f"{label_prefix} failed at newbook",
        )
        if workbook_short_name:
            short_name = escape_labtalk_text(normalized_workbook_short_name)
            run_labtalk_or_raise(
                op_module,
                f'page.name$="{short_name}";',
                f"{label_prefix} failed at setting workbook short name",
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
    if sheet_long_name:
        sheet_title = escape_labtalk_text(sheet_long_name)
        run_labtalk_or_raise(
            op_module,
            f'wks.lname$="{sheet_title}";',
            f"{label_prefix} failed at setting worksheet title",
        )
    run_command_list(op_module, import_post_commands or [], "Import post-command")
