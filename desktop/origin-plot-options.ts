export type OriginPlotOptions = {
  plotType: number;
  xyPairs: string;
  plotCommand: string;
  postPlotCommands: string[];
  lineWidth: number;
};

export const DEFAULT_ORIGIN_PLOT_OPTIONS = Object.freeze<OriginPlotOptions>({
  plotType: 202,
  xyPairs: "((1,2))",
  plotCommand: "",
  postPlotCommands: [],
  lineWidth: 2,
});

export function normalizeNonEmptyString(value: unknown, fallback = ""): string {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return trimmed || fallback;
}

function normalizeBoundedInt(value: unknown, fallback: number, min: number, max: number): number {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(num)));
}

function normalizeBoundedFloat(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): number {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, Math.round(num * 100) / 100));
}

function normalizeOriginPostPlotCommands(value: unknown): string[] {
  if (Array.isArray(value)) {
    const normalized: string[] = [];
    for (const item of value) {
      if (typeof item !== "string") continue;
      const trimmed = item.trim();
      if (!trimmed) continue;
      normalized.push(trimmed);
    }
    return normalized;
  }

  if (typeof value === "string") {
    return value
      .split(/\r?\n/g)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}

export function normalizeOriginCommandList(value: unknown): string[] {
  return normalizeOriginPostPlotCommands(value);
}

export function normalizeOriginPlotOptions(
  rawOptions: unknown,
  fallbackOptions: OriginPlotOptions | undefined = undefined,
): OriginPlotOptions {
  const raw = rawOptions && typeof rawOptions === "object" ? rawOptions : {};
  const fallbackBase = fallbackOptions ?? DEFAULT_ORIGIN_PLOT_OPTIONS;
  const fallback =
    fallbackBase && typeof fallbackBase === "object"
      ? {
          ...DEFAULT_ORIGIN_PLOT_OPTIONS,
          ...fallbackBase,
        }
      : DEFAULT_ORIGIN_PLOT_OPTIONS;

  const plotType = normalizeBoundedInt(
    (raw as { plotType?: unknown; type?: unknown }).plotType ??
      (raw as { type?: unknown }).type,
    fallback.plotType,
    0,
    9999,
  );
  const xyPairs = normalizeNonEmptyString(
    (raw as { xyPairs?: unknown }).xyPairs,
    fallback.xyPairs,
  );
  const plotCommand = normalizeNonEmptyString(
    (raw as { plotCommand?: unknown; command?: unknown }).plotCommand ??
      (raw as { command?: unknown }).command,
    fallback.plotCommand,
  );
  const postPlotCommands = normalizeOriginPostPlotCommands(
    Object.prototype.hasOwnProperty.call(raw, "postPlotCommands")
      ? (raw as { postPlotCommands?: unknown }).postPlotCommands
      : Object.prototype.hasOwnProperty.call(raw, "postCommands")
        ? (raw as { postCommands?: unknown }).postCommands
        : fallback.postPlotCommands,
  );
  const fallbackLineWidth = normalizeBoundedFloat(
    fallback.lineWidth,
    DEFAULT_ORIGIN_PLOT_OPTIONS.lineWidth,
    0.5,
    20,
  );
  const lineWidth = normalizeBoundedFloat(
    (raw as { lineWidth?: unknown; linewidth?: unknown; line_width?: unknown }).lineWidth ??
      (raw as { linewidth?: unknown }).linewidth ??
      (raw as { line_width?: unknown }).line_width,
    fallbackLineWidth,
    0.5,
    20,
  );

  return {
    plotType,
    xyPairs,
    plotCommand,
    postPlotCommands,
    lineWidth,
  };
}
