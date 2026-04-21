from .origin_session import lt_exec, run_command_list, run_labtalk_or_raise


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


def log_origin_warning(warning_logger, message: str) -> None:
    if callable(warning_logger):
        try:
            warning_logger(message)
        except Exception:
            pass


def try_set_origin_long_name_via_object(op_module, target: str, value: str) -> bool:
    finder_name = "find_book" if target == "book" else "find_sheet"
    finder = getattr(op_module, finder_name, None)
    if not callable(finder):
        return False
    obj = finder("w")
    if obj is None:
        return False
    obj.lname = value
    return True


def try_set_origin_long_name(
    op_module,
    target: str,
    value: str,
    warning_logger=None,
    label_prefix: str = "CSV import",
) -> None:
    normalized_value = normalize_origin_display_text(value)
    if not normalized_value:
        return

    try:
        if try_set_origin_long_name_via_object(op_module, target, normalized_value):
            return
    except Exception as exc:
        log_origin_warning(
            warning_logger,
            f"{label_prefix} warning: failed to set {target} long name via originpro object API: {exc!r}",
        )

    command_prefix = "page.longname$" if target == "book" else "wks.lname$"
    escaped_value = escape_labtalk_text(normalized_value)
    try:
        result = lt_exec(op_module, f'{command_prefix}="{escaped_value}";')
        if result is False:
            log_origin_warning(
                warning_logger,
                f"{label_prefix} warning: LabTalk returned False while setting {target} long name to '{normalized_value}'.",
            )
    except Exception as exc:
        log_origin_warning(
            warning_logger,
            f"{label_prefix} warning: failed to set {target} long name via LabTalk fallback: {exc!r}",
        )


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
    warning_logger=None,
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
        try_set_origin_long_name(
            op_module,
            "book",
            workbook_long_name,
            warning_logger=warning_logger,
            label_prefix=label_prefix,
        )
    if sheet_long_name:
        try_set_origin_long_name(
            op_module,
            "sheet",
            sheet_long_name,
            warning_logger=warning_logger,
            label_prefix=label_prefix,
        )
    run_command_list(op_module, import_post_commands or [], "Import post-command")
