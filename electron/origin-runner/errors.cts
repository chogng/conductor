const ORIGIN_ERROR_PREFIX = "__ORIGIN_ERROR__:";

function readTrimmedString(source, key) {
  if (!source || typeof source !== "object") return null;
  const value = Reflect.get(source, key);
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function normalizeOriginErrorPayload(rawPayload, fallback = {}) {
  const normalizedMessage =
    readTrimmedString(rawPayload, "message") ||
    readTrimmedString(fallback, "message") ||
    "Origin worker failed.";

  const normalizedCode =
    readTrimmedString(rawPayload, "code") ||
    readTrimmedString(fallback, "code") ||
    "ORIGIN_WORKER_FAILED";

  const normalizedStage =
    readTrimmedString(rawPayload, "stage") ||
    readTrimmedString(fallback, "stage") ||
    "UNKNOWN";

  const normalizedHResult =
    readTrimmedString(rawPayload, "hresult") ||
    readTrimmedString(fallback, "hresult");

  const normalizedLogPath =
    readTrimmedString(rawPayload, "logPath") ||
    readTrimmedString(fallback, "logPath");

  const normalizedOriginExe =
    readTrimmedString(rawPayload, "originExe") ||
    readTrimmedString(fallback, "originExe");

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
  Reflect.set(error, "origin", normalized);
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



