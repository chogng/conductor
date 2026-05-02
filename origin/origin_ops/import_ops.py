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


def get_origin_book(
    op_module,
    short_name: str = "",
):
    finder = getattr(op_module, "find_book", None)
    if not callable(finder):
        return None
    try:
        if short_name:
            return finder("w", short_name)
        return finder("w")
    except TypeError:
        try:
            return finder(short_name or "w")
        except Exception:
            return None
    except Exception:
        return None


def get_origin_book_short_name(book) -> str:
    if book is None:
        return ""

    try:
        value = getattr(book, "name", "")
        if isinstance(value, str) and value.strip():
            return value.strip()
    except Exception:
        pass

    obj = getattr(book, "obj", None)
    get_name = getattr(obj, "GetName", None) if obj is not None else None
    if callable(get_name):
        try:
            value = get_name()
            if isinstance(value, str) and value.strip():
                return value.strip()
        except Exception:
            pass

    return ""


def get_origin_sheet(op_module):
    finder = getattr(op_module, "find_sheet", None)
    if not callable(finder):
        return None
    try:
        return finder("w")
    except TypeError:
        try:
            return finder()
        except Exception:
            return None
    except Exception:
        return None


def normalize_origin_sheet_short_name(name_value: str, fallback_prefix: str = "S") -> str:
    return normalize_origin_short_name(name_value, fallback_prefix=fallback_prefix)


def get_origin_sheet_short_name(sheet) -> str:
    if sheet is None:
        return ""

    try:
        value = getattr(sheet, "name", "")
        if isinstance(value, str) and value.strip():
            return value.strip()
    except Exception:
        pass

    obj = getattr(sheet, "obj", None)
    get_name = getattr(obj, "GetName", None) if obj is not None else None
    if callable(get_name):
        try:
            value = get_name()
            if isinstance(value, str) and value.strip():
                return value.strip()
        except Exception:
            pass

    return ""


def resolve_active_origin_book_short_name(op_module) -> str:
    return get_origin_book_short_name(get_origin_book(op_module))


def try_activate_origin_book(
    op_module,
    workbook_short_name: str,
    warning_logger=None,
    label_prefix: str = "CSV import",
) -> str:
    normalized_name = normalize_origin_short_name(workbook_short_name)
    if not normalized_name:
        return ""

    book = get_origin_book(op_module, normalized_name)
    if book is not None:
        activate = getattr(book, "activate", None)
        if callable(activate):
            try:
                activate()
                return get_origin_book_short_name(book) or normalized_name
            except Exception as exc:
                log_origin_warning(
                    warning_logger,
                    f"{label_prefix} warning: object activation for workbook '{normalized_name}' failed: {exc!r}",
                )

    run_labtalk_or_raise(
        op_module,
        f"win -a {normalized_name};",
        f"{label_prefix} failed at activating workbook",
    )
    return resolve_active_origin_book_short_name(op_module) or normalized_name


def try_set_origin_book_short_name(
    op_module,
    workbook_short_name: str,
    warning_logger=None,
    label_prefix: str = "CSV import",
) -> str:
    normalized_name = normalize_origin_short_name(workbook_short_name)
    if not normalized_name:
        return ""

    book = get_origin_book(op_module)
    if book is not None:
        try:
            book.name = normalized_name
            actual_name = get_origin_book_short_name(book) or normalized_name
            if actual_name != normalized_name:
                log_origin_warning(
                    warning_logger,
                    f"{label_prefix} warning: workbook short name '{normalized_name}' was adjusted to '{actual_name}'.",
                )
            return actual_name
        except Exception as exc:
            log_origin_warning(
                warning_logger,
                f"{label_prefix} warning: failed to set workbook short name via originpro object API: {exc!r}",
            )

    short_name = escape_labtalk_text(normalized_name)
    run_labtalk_or_raise(
        op_module,
        f'page.name$="{short_name}";',
        f"{label_prefix} failed at setting workbook short name",
    )
    actual_name = resolve_active_origin_book_short_name(op_module) or normalized_name
    if actual_name != normalized_name:
        log_origin_warning(
            warning_logger,
            f"{label_prefix} warning: workbook short name '{normalized_name}' was adjusted to '{actual_name}'.",
        )
    return actual_name


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


def try_set_origin_sheet_short_name(
    op_module,
    sheet_short_name: str,
    warning_logger=None,
    label_prefix: str = "CSV import",
) -> str:
    normalized_name = normalize_origin_sheet_short_name(sheet_short_name)
    if not normalized_name:
        return ""

    sheet = get_origin_sheet(op_module)
    if sheet is not None:
        try:
            sheet.name = normalized_name
            actual_name = get_origin_sheet_short_name(sheet) or normalized_name
            if actual_name != normalized_name:
                log_origin_warning(
                    warning_logger,
                    f"{label_prefix} warning: worksheet short name '{normalized_name}' was adjusted to '{actual_name}'.",
                )
            return actual_name
        except Exception as exc:
            log_origin_warning(
                warning_logger,
                f"{label_prefix} warning: failed to set worksheet short name via originpro object API: {exc!r}",
            )

    short_name = escape_labtalk_text(normalized_name)
    try:
        result = lt_exec(op_module, f'wks.name$="{short_name}";')
        if result is False:
            log_origin_warning(
                warning_logger,
                f"{label_prefix} warning: LabTalk returned False while setting worksheet short name to '{normalized_name}'.",
            )
    except Exception as exc:
        log_origin_warning(
            warning_logger,
            f"{label_prefix} warning: failed to set worksheet short name via LabTalk fallback: {exc!r}",
        )
    return get_origin_sheet_short_name(get_origin_sheet(op_module)) or normalized_name


def try_apply_origin_column_labels(
    op_module,
    long_names,
    units,
    comments=None,
    designations=None,
    warning_logger=None,
    label_prefix: str = "CSV import",
) -> None:
    normalized_long_names = [str(item or "").strip() for item in (long_names or [])]
    normalized_units = [str(item or "").strip() for item in (units or [])]
    normalized_comments = [str(item or "").strip() for item in (comments or [])]
    normalized_designations = [
        str(item or "").strip().lower()[:1] for item in (designations or [])
    ]
    if (
        not normalized_long_names
        and not normalized_units
        and not normalized_comments
        and not normalized_designations
    ):
        return

    sheet = get_origin_sheet(op_module)
    if sheet is None:
        log_origin_warning(
            warning_logger,
            f"{label_prefix} warning: active worksheet object is unavailable for originpro label update.",
        )
        return

    header_rows = getattr(sheet, "header_rows", None)
    if callable(header_rows):
        try:
            header_rows("luc")
        except Exception as exc:
            log_origin_warning(
                warning_logger,
                f"{label_prefix} warning: failed to show worksheet label rows via originpro API: {exc!r}",
            )

    valid_axis_tokens = {"x", "y", "z", "e", "l", "n"}
    designation_spec = "".join(
        token if token in valid_axis_tokens else "n"
        for token in normalized_designations
    )
    cols_axis = getattr(sheet, "cols_axis", None)
    if designation_spec and callable(cols_axis):
        try:
            cols_axis(designation_spec)
        except Exception as exc:
            log_origin_warning(
                warning_logger,
                f"{label_prefix} warning: failed to set worksheet column designations via originpro API: {exc!r}",
            )

    set_labels = getattr(sheet, "set_labels", None)
    if callable(set_labels):
        try:
            if normalized_long_names:
                set_labels(normalized_long_names, "L")
            if normalized_units:
                set_labels(normalized_units, "U")
            if normalized_comments:
                set_labels(normalized_comments, "C")
            return
        except Exception as exc:
            log_origin_warning(
                warning_logger,
                f"{label_prefix} warning: failed to set worksheet column labels via originpro API: {exc!r}",
            )

    set_label = getattr(sheet, "set_label", None)
    if callable(set_label):
        try:
            for idx, value in enumerate(normalized_long_names):
                if value:
                    set_label(idx, value, "L")
            for idx, value in enumerate(normalized_units):
                if value:
                    set_label(idx, value, "U")
            for idx, value in enumerate(normalized_comments):
                if value:
                    set_label(idx, value, "C")
            return
        except Exception as exc:
            log_origin_warning(
                warning_logger,
                f"{label_prefix} warning: failed to set worksheet labels one-by-one via originpro API: {exc!r}",
            )

    log_origin_warning(
        warning_logger,
        f"{label_prefix} warning: worksheet label update skipped because originpro label APIs are unavailable.",
    )


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
    sheet_short_name: str = "",
    sheet_long_name: str = "",
    import_column_long_names=None,
    import_column_units=None,
    import_column_comments=None,
    import_column_designations=None,
    import_pre_commands=None,
    import_post_commands=None,
    label_prefix: str = "CSV import",
    warning_logger=None,
):
    csv_lt = escape_labtalk_path(str(csv_path))
    normalized_import_mode = str(import_mode or "new-book").strip().lower()
    normalized_workbook_short_name = normalize_origin_short_name(workbook_short_name)
    actual_workbook_short_name = ""

    if normalized_import_mode == "existing-book-new-sheet":
        actual_workbook_short_name = try_activate_origin_book(
            op_module,
            normalized_workbook_short_name,
            warning_logger=warning_logger,
            label_prefix=label_prefix,
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
            actual_workbook_short_name = try_set_origin_book_short_name(
                op_module,
                normalized_workbook_short_name,
                warning_logger=warning_logger,
                label_prefix=label_prefix,
            )
        else:
            actual_workbook_short_name = resolve_active_origin_book_short_name(op_module)
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
    if sheet_short_name:
        try_set_origin_sheet_short_name(
            op_module,
            sheet_short_name,
            warning_logger=warning_logger,
            label_prefix=label_prefix,
        )
    try_apply_origin_column_labels(
        op_module,
        import_column_long_names,
        import_column_units,
        import_column_comments,
        import_column_designations,
        warning_logger=warning_logger,
        label_prefix=label_prefix,
    )
    run_command_list(op_module, import_post_commands or [], "Import post-command")
    return resolve_active_origin_book_short_name(op_module) or actual_workbook_short_name
