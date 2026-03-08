export const ORIGIN_BRIDGE_ERROR_PREFIX = "__ORIGIN_ERROR__:";

const toTrimmedString = (value) =>
  typeof value === "string" && value.trim() ? value.trim() : "";

const parseStructuredOriginErrorMessage = (message) => {
  const raw = toTrimmedString(message);
  if (!raw.startsWith(ORIGIN_BRIDGE_ERROR_PREFIX)) return null;

  const jsonText = raw.slice(ORIGIN_BRIDGE_ERROR_PREFIX.length).trim();
  if (!jsonText) return null;

  try {
    const parsed = JSON.parse(jsonText);
    if (parsed && typeof parsed === "object") return parsed;
  } catch {
    // Keep fallback behavior below.
  }

  return null;
};

export const parseOriginBridgeError = (errorLike) => {
  const messageFromError =
    errorLike && typeof errorLike === "object" && typeof errorLike.message === "string"
      ? errorLike.message
      : "";
  const messageText = toTrimmedString(messageFromError || String(errorLike ?? ""));

  if (messageText === "__ORIGIN_EXE_REQUIRED__") {
    return {
      code: "ORIGIN_EXE_REQUIRED",
      stage: null,
      hresult: null,
      logPath: null,
      message: "__ORIGIN_EXE_REQUIRED__",
      rawMessage: messageText,
    };
  }

  if (messageText === "__ORIGIN_BATCH_INPUT_DIR_REQUIRED__") {
    return {
      code: "ORIGIN_BATCH_INPUT_DIR_REQUIRED",
      stage: null,
      hresult: null,
      logPath: null,
      message: "__ORIGIN_BATCH_INPUT_DIR_REQUIRED__",
      rawMessage: messageText,
    };
  }

  const payload = parseStructuredOriginErrorMessage(messageText);
  if (!payload) {
    return {
      code: null,
      stage: null,
      hresult: null,
      logPath: null,
      message: messageText || "Unknown error",
      rawMessage: messageText,
    };
  }

  return {
    code: toTrimmedString(payload.code) || null,
    stage: toTrimmedString(payload.stage) || null,
    hresult: toTrimmedString(payload.hresult) || null,
    logPath: toTrimmedString(payload.logPath) || null,
    message: toTrimmedString(payload.message) || "Origin worker failed.",
    rawMessage: messageText,
  };
};

export const inferOriginSuggestionKey = (detail) => {
  const code = String(detail?.code || "").trim().toUpperCase();
  const stage = String(detail?.stage || "").trim().toUpperCase();
  const hresult = String(detail?.hresult || "").trim().toUpperCase();

  if (code === "ORIGIN_EXE_REQUIRED") return "da_origin_pick_exe_required";
  if (code === "ORIGIN_BATCH_INPUT_DIR_REQUIRED") return null;
  if (code === "ORIGIN_BATCH_RUNNER_NOT_FOUND") {
    return "da_origin_error_tip_batch_runner_missing";
  }
  if (code === "ORIGIN_ZIP_RUNNER_NOT_FOUND" || code === "ORIGIN_CSV_RUNNER_NOT_FOUND") {
    return "da_origin_error_tip_zip_runner_missing";
  }
  if (stage === "NATIVE_RUNNER" || code === "ORIGIN_BATCH_RUNNER_FAILED") {
    return "da_origin_error_tip_batch_runner_check";
  }
  if (
    code === "ORIGIN_ZIP_RUNNER_FAILED" ||
    code === "ORIGIN_CSV_RUNNER_FAILED" ||
    code === "ORIGIN_CSV_FAILED" ||
    code === "ORIGIN_CSV_IMPORT_FAILED" ||
    stage === "ZIP_NATIVE_RUNNER" ||
    stage === "CSV_PYTHON_RUNNER" ||
    code === "ORIGIN_ORIGINPRO_ATTACH_FAILED"
  ) {
    return "da_origin_error_tip_zip_runner_check";
  }
  if (code === "ORIGIN_ORIGINPRO_IMPORT_FAILED") {
    return "da_origin_error_tip_install_python";
  }
  if (code === "ORIGIN_BATCH_INPUT_DIR_INVALID" || code === "ORIGIN_BATCH_INPUT_DIR_NOT_FOUND") {
    return "da_origin_error_tip_choose_csv_folder";
  }
  if (code === "ORIGIN_EXE_NOT_FOUND") return "da_origin_error_tip_reselect_exe";
  if (code === "ORIGIN_BATCH_NO_CSV_FILES") return "da_origin_error_tip_choose_csv_folder";
  if (code === "ORIGIN_PYTHON_NOT_FOUND" || code === "ORIGIN_PYWIN32_MISSING") {
    return "da_origin_error_tip_install_python";
  }
  if (hresult === "0X8000FFFF") return "da_origin_error_tip_register_com";
  if (stage === "COM_CREATE" || code === "ORIGIN_COM_CREATE_FAILED") {
    return "da_origin_error_tip_register_com";
  }
  if (stage === "SESSION_BEGIN" || code === "ORIGIN_SESSION_BEGIN_FAILED") {
    return "da_origin_error_tip_launch_once";
  }
  return "da_origin_error_tip_manual_zip";
};

export const formatOriginBridgeError = (t, errorLike) => {
  const detail = parseOriginBridgeError(errorLike);
  const suggestionKey = inferOriginSuggestionKey(detail);
  const suggestionText = suggestionKey ? t(suggestionKey) : "";

  const message =
    detail.code === "ORIGIN_EXE_REQUIRED"
      ? t("da_origin_pick_exe_required")
      : detail.code === "ORIGIN_BATCH_INPUT_DIR_REQUIRED"
        ? t("da_origin_batch_pick_dir_required")
        : detail.message || t("unknownError");

  const chunks = [message];
  if (detail.stage) {
    chunks.push(t("da_origin_error_stage", { stage: detail.stage }));
  }
  if (detail.hresult) {
    chunks.push(t("da_origin_error_hresult", { hresult: detail.hresult }));
  }
  if (detail.logPath) {
    chunks.push(t("da_origin_error_log_path", { path: detail.logPath }));
  }
  if (suggestionText && suggestionText !== suggestionKey) {
    chunks.push(suggestionText);
  }

  return {
    ...detail,
    suggestionKey,
    messageText: chunks.join(" | "),
  };
};
