export type ExtractionErrorDetails = {
  fileName: string | null;
  message: string;
  messageKey: string | null;
  messageParams: Record<string, unknown> | null;
};

const isObjectRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

export const normalizeExtractionErrorDetails = (
  payload: unknown,
): ExtractionErrorDetails => {
  const rawPayload = isObjectRecord(payload) ? payload : null;
  const message =
    typeof rawPayload?.message === "string" && rawPayload.message.trim()
      ? rawPayload.message
      : "Unknown error";
  const messageKey =
    typeof rawPayload?.messageKey === "string" && rawPayload.messageKey.trim()
      ? rawPayload.messageKey
      : null;
  const messageParams = isObjectRecord(rawPayload?.messageParams)
    ? rawPayload.messageParams
    : null;

  return {
    fileName:
      (typeof rawPayload?.fileName === "string" && rawPayload.fileName) || null,
    message,
    messageKey,
    messageParams,
  };
};
