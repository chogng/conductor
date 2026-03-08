export type OriginPlotOptions = {
  type: number;
  xyPairs: string;
  command: string;
  postCommands: string[];
};

export const DEFAULT_ORIGIN_PLOT_OPTIONS: OriginPlotOptions = Object.freeze({
  type: 202,
  xyPairs: "((1,2))",
  command: "",
  postCommands: [],
}) as OriginPlotOptions;

const clampInt = (
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): number => {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  const rounded = Math.floor(num);
  if (rounded < min) return min;
  if (rounded > max) return max;
  return rounded;
};

export const normalizeOriginPostCommands = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split(/\r?\n/g)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
};

export const normalizeOriginPlotOptions = (
  value: unknown,
  fallback: OriginPlotOptions = DEFAULT_ORIGIN_PLOT_OPTIONS,
): OriginPlotOptions => {
  const raw = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const fallbackValue = fallback || DEFAULT_ORIGIN_PLOT_OPTIONS;

  const type = clampInt(raw.type, fallbackValue.type, 0, 9999);
  const xyPairs =
    typeof raw.xyPairs === "string" && raw.xyPairs.trim()
      ? raw.xyPairs.trim()
      : fallbackValue.xyPairs;
  const command = typeof raw.command === "string" ? raw.command.trim() : fallbackValue.command;
  const postCommandsRaw = Object.prototype.hasOwnProperty.call(raw, "postCommands")
    ? raw.postCommands
    : fallbackValue.postCommands;
  const postCommands = normalizeOriginPostCommands(postCommandsRaw);

  return {
    type,
    xyPairs,
    command,
    postCommands,
  };
};

export const originPostCommandsToMultiline = (value: unknown): string =>
  normalizeOriginPostCommands(value).join("\n");
