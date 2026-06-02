import type { LooseTranslateFn as TranslateFn } from "src/cs/workbench/common/translation";

type JsonLike =
  | string
  | number
  | boolean
  | null
  | JsonLike[]
  | { [key: string]: JsonLike };

type OlderExtractionError = {
  fileName: string | null;
  messageKey: string;
  messageParams: Record<string, number | string>;
};

type ExtractionErrorLike = Partial<{
  messageKey: string;
  messageParams: Record<string, unknown>;
  message: string;
}>;

export const stableStringify = (value: unknown): string => {
  const seen = new WeakSet<object>();

  const normalize = (input: unknown): JsonLike => {
    if (!input || typeof input !== "object") return input as JsonLike;
    if (seen.has(input)) return null;
    seen.add(input);

    if (Array.isArray(input)) return input.map((item) => normalize(item));

    const out: Record<string, JsonLike> = {};
    for (const key of Object.keys(input).sort()) {
      const record = input as Record<string, unknown>;
      out[key] = normalize(record[key]);
    }
    return out;
  };

  return JSON.stringify(normalize(value));
};

export const parseOlderExtractionError = (
  rawMessage: unknown,
): OlderExtractionError | null => {
  const message = String(rawMessage ?? "").trim();
  if (!message) return null;

  const patterns: Array<{
    regex: RegExp;
    map: (matched: RegExpMatchArray) => OlderExtractionError;
  }> = [
    {
      regex:
        /^(?:(.+?):\s*)?X range has (\d+) points, which is not divisible by points=(\d+) \(from ([A-Z]+[0-9]+)\)\.$/i,
      map: (matched) => ({
        fileName: matched[1] || null,
        messageKey: "da_extractXNotDivisibleByPointsFromCell",
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
        messageKey: "da_extractXNotDivisibleByPoints",
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
        messageKey: "da_extractPointsCellPositiveInt",
        messageParams: { cell: String(matched[2]).toUpperCase() },
      }),
    },
    {
      regex:
        /^(?:(.+?):\s*)?Points from ([A-Z]+[0-9]+) \((\d+)\) cannot be larger than the X range length \((\d+)\)\.$/i,
      map: (matched) => ({
        fileName: matched[1] || null,
        messageKey: "da_extractPointsCellTooLarge",
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
        messageKey: "da_extractCurveTypeUndeterminedFromVarHints",
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

export const getExtractionErrorMessage = (
  t: TranslateFn,
  err: ExtractionErrorLike | null | undefined,
): string => {
  const messageKey =
    err && typeof err === "object" && typeof err.messageKey === "string"
      ? err.messageKey
      : "";
  const messageParams =
    err &&
    typeof err === "object" &&
    err.messageParams &&
    typeof err.messageParams === "object"
      ? err.messageParams
      : {};

  if (messageKey) {
    const translated = t(messageKey, messageParams);
    if (typeof translated === "string" && translated !== messageKey) {
      return translated;
    }
  }

  const fallback = err?.message;
  return typeof fallback === "string" && fallback.trim()
    ? fallback
    : t("unknownError");
};
