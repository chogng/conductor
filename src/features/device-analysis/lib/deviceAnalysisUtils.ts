// @ts-nocheck
export const stableStringify = (value) => {
  const seen = new WeakSet();

  const normalize = (input) => {
    if (!input || typeof input !== "object") return input;
    if (seen.has(input)) return null;
    seen.add(input);

    if (Array.isArray(input)) return input.map(normalize);

    const out = {};
    for (const key of Object.keys(input).sort()) {
      out[key] = normalize(input[key]);
    }
    return out;
  };

  return JSON.stringify(normalize(value));
};

export const parseLegacyExtractionError = (rawMessage) => {
  const message = String(rawMessage ?? "").trim();
  if (!message) return null;

  const patterns = [
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
  ];

  for (const pattern of patterns) {
    const matched = message.match(pattern.regex);
    if (!matched) continue;
    return pattern.map(matched);
  }

  return null;
};

export const getExcelColumnLabel = (index) => {
  let label = "";
  let nextIndex = index;

  while (nextIndex >= 0) {
    label = String.fromCharCode(65 + (nextIndex % 26)) + label;
    nextIndex = Math.floor(nextIndex / 26) - 1;
  }

  return label;
};

export const getDeviceAnalysisExtractionErrorMessage = (t, err) => {
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
    : t("da_extract_unknown_error");
};
