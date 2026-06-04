export type LegacyExtractionErrorDetails = {
  fileName: string | null;
  messageKey: string;
  messageParams: Record<string, number | string>;
};

export type ExtractionErrorDetails = {
  fileName: string | null;
  message: string;
  messageKey: string | null;
  messageParams: Record<string, unknown> | null;
};

const isObjectRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

// Compatibility fallback for older workers that returned English messages
// without structured messageKey/messageParams fields.
export const parseOlderExtractionError = (
  rawMessage: unknown,
): LegacyExtractionErrorDetails | null => {
  const message = String(rawMessage ?? "").trim();
  if (!message) return null;

  const patterns: Array<{
    regex: RegExp;
    map: (matched: RegExpMatchArray) => LegacyExtractionErrorDetails;
  }> = [
    {
      regex:
        /^(?:(.+?):\s*)?X range has (\d+) points, which is not divisible by points=(\d+) \(from ([A-Z]+[0-9]+)\)\.$/i,
      map: (matched) => ({
        fileName: matched[1] || null,
        messageKey: "extractXNotDivisibleByPointsFromCell",
        messageParams: {
          total: Number(matched[2]),
          points: Number(matched[3]),
          cell: String(matched[4]).toUpperCase(),
        },
      }),
    },
    {
      regex:
        /^(?:(.+?):\s*)?X range has (\d+) points, which is not divisible by points=(\d+)\.$/i,
      map: (matched) => ({
        fileName: matched[1] || null,
        messageKey: "extractXNotDivisibleByPoints",
        messageParams: {
          total: Number(matched[2]),
          points: Number(matched[3]),
        },
      }),
    },
    {
      regex:
        /^(?:(.+?):\s*)?Points cell ([A-Z]+[0-9]+) must contain a positive integer\.$/i,
      map: (matched) => ({
        fileName: matched[1] || null,
        messageKey: "extractPointsCellPositiveInt",
        messageParams: { cell: String(matched[2]).toUpperCase() },
      }),
    },
    {
      regex:
        /^(?:(.+?):\s*)?Points from ([A-Z]+[0-9]+) \((\d+)\) cannot be larger than the X range length \((\d+)\)\.$/i,
      map: (matched) => ({
        fileName: matched[1] || null,
        messageKey: "extractPointsCellTooLarge",
        messageParams: {
          cell: String(matched[2]).toUpperCase(),
          points: Number(matched[3]),
          total: Number(matched[4]),
        },
      }),
    },
    {
      regex:
        /^(?:(.+?):\s*)?Unable to determine curve type from Var1\/Var2 or nearby headers\. Please check the template, or use file-name keywords\.$/i,
      map: (matched) => ({
        fileName: matched[1] || null,
        messageKey: "extractCurveTypeUndeterminedFromVarHints",
        messageParams: {},
      }),
    },
  ];

  for (const pattern of patterns) {
    const matched = message.match(pattern.regex);
    if (!matched) continue;
    return pattern.map(matched);
  }

  return null;
};

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
  const legacyDetails =
    messageKey && messageParams ? null : parseOlderExtractionError(message);

  return {
    fileName:
      (typeof rawPayload?.fileName === "string" && rawPayload.fileName) ||
      legacyDetails?.fileName ||
      null,
    message,
    messageKey: messageKey || legacyDetails?.messageKey || null,
    messageParams: messageParams || legacyDetails?.messageParams || null,
  };
};
