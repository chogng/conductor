const ORIGIN_ERROR_PREFIX = "__ORIGIN_ERROR__:";

function normalizeOriginErrorPayload(rawPayload, fallback = {}) {
  const payload = rawPayload && typeof rawPayload === "object" ? rawPayload : {};

  const normalizedMessage =
    typeof payload.message === "string" && payload.message.trim()
      ? payload.message.trim()
      : typeof fallback.message === "string" && fallback.message.trim()
        ? fallback.message.trim()
        : "Origin worker failed.";

  const normalizedCode =
    typeof payload.code === "string" && payload.code.trim()
      ? payload.code.trim()
      : typeof fallback.code === "string" && fallback.code.trim()
        ? fallback.code.trim()
        : "ORIGIN_WORKER_FAILED";

  const normalizedStage =
    typeof payload.stage === "string" && payload.stage.trim()
      ? payload.stage.trim()
      : typeof fallback.stage === "string" && fallback.stage.trim()
        ? fallback.stage.trim()
        : "UNKNOWN";

  const normalizedHResult =
    typeof payload.hresult === "string" && payload.hresult.trim()
      ? payload.hresult.trim()
      : typeof fallback.hresult === "string" && fallback.hresult.trim()
        ? fallback.hresult.trim()
        : null;

  const normalizedLogPath =
    typeof payload.logPath === "string" && payload.logPath.trim()
      ? payload.logPath.trim()
      : typeof fallback.logPath === "string" && fallback.logPath.trim()
        ? fallback.logPath.trim()
        : null;

  const normalizedOriginExe =
    typeof payload.originExe === "string" && payload.originExe.trim()
      ? payload.originExe.trim()
      : typeof fallback.originExe === "string" && fallback.originExe.trim()
        ? fallback.originExe.trim()
        : null;

  return {
    code: normalizedCode,
    stage: normalizedStage,
    message: normalizedMessage,
    hresult: normalizedHResult,
    logPath: normalizedLogPath,
    originExe: normalizedOriginExe,
  };
}

function toStructuredOriginError(rawPayload, fallback = {}) {
  const normalized = normalizeOriginErrorPayload(rawPayload, fallback);
  const error = new Error(`${ORIGIN_ERROR_PREFIX}${JSON.stringify(normalized)}`);
  error.name = "OriginBridgeError";
  error.origin = normalized;
  return error;
}

function parseWorkerErrorPayload(rawText) {
  const raw = String(rawText || "").trim();
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") return parsed;
  } catch {
    // Fall through to plain text payload.
  }
  return { message: raw };
}

module.exports = {
  ORIGIN_ERROR_PREFIX,
  normalizeOriginErrorPayload,
  toStructuredOriginError,
  parseWorkerErrorPayload,
};
