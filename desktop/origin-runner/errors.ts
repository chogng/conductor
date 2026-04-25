export const ORIGIN_ERROR_PREFIX = "__ORIGIN_ERROR__:";

export type OriginErrorPayload = {
  code?: string | null;
  stage?: string | null;
  message?: string | null;
  hresult?: string | null;
  logPath?: string | null;
  originExe?: string | null;
};

export type NormalizedOriginErrorPayload = {
  code: string;
  stage: string;
  message: string;
  hresult: string | null;
  logPath: string | null;
  originExe: string | null;
};

function readTrimmedString(source: unknown, key: string): string | null {
  if (!source || typeof source !== "object") return null;
  const value = Reflect.get(source, key);
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

export function normalizeOriginErrorPayload(
  rawPayload: unknown,
  fallback: OriginErrorPayload = {},
): NormalizedOriginErrorPayload {
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

export function toStructuredOriginError(
  rawPayload: unknown,
  fallback: OriginErrorPayload = {},
): Error {
  const normalized = normalizeOriginErrorPayload(rawPayload, fallback);
  const error = new Error(`${ORIGIN_ERROR_PREFIX}${JSON.stringify(normalized)}`);
  error.name = "OriginBridgeError";
  Reflect.set(error, "origin", normalized);
  return error;
}

export function parseWorkerErrorPayload(rawText: unknown): OriginErrorPayload | null {
  const raw = String(rawText || "").trim();
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as OriginErrorPayload;
    }
  } catch {
    // Fall through to plain text payload.
  }
  return { message: raw };
}


