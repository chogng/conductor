export type AxisTitleOverridesByFileId = Record<string, Partial<Record<"x" | "y", string>>>;
export type PlotYScale = "linear" | "log" | "logAbs";
export type LinearLogScale = "linear" | "log";
export type LogCurrentMode = "all" | "positive";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object";

const normalizeByFileIdRecord = <T>(
  value: unknown,
  normalizeEntry: (entry: unknown) => T | null | undefined,
): Record<string, T> => {
  const raw = isRecord(value) ? value : {};
  const next: Record<string, T> = {};

  for (const [fileId, entry] of Object.entries(raw)) {
    const normalizedFileId = String(fileId ?? "").trim();
    if (!normalizedFileId) continue;

    const normalizedEntry = normalizeEntry(entry);
    if (normalizedEntry == null) continue;

    next[normalizedFileId] = normalizedEntry;
  }

  return next;
};

export const normalizeVisibleSeriesByFileId = (value: unknown): Record<string, string[]> =>
  normalizeByFileIdRecord(value, (seriesIds) => {
    if (!Array.isArray(seriesIds)) return null;

    return Array.from(
      new Set(
        seriesIds
          .map((seriesId) => String(seriesId ?? "").trim())
          .filter(Boolean),
      ),
    );
  });

export const normalizeSeriesLegendLabelsByFileId = (
  value: unknown,
): Record<string, Record<string, string>> =>
  normalizeByFileIdRecord(value, (labels) => {
    if (!isRecord(labels)) return null;

    const nextLabels: Record<string, string> = {};
    for (const [seriesId, label] of Object.entries(labels)) {
      const normalizedSeriesId = String(seriesId ?? "").trim();
      const normalizedLabel = String(label ?? "").trim();
      if (!normalizedSeriesId || !normalizedLabel) continue;

      nextLabels[normalizedSeriesId] = normalizedLabel;
    }

    return Object.keys(nextLabels).length ? nextLabels : null;
  });

export const normalizeAxisTitleOverridesByFileId = (
  value: unknown,
): AxisTitleOverridesByFileId =>
  normalizeByFileIdRecord(value, (labels) => {
    if (!isRecord(labels)) return null;

    const nextLabels: Partial<Record<"x" | "y", string>> = {};
    for (const axisKey of ["x", "y"] as const) {
      const normalizedLabel = String(labels[axisKey] ?? "").trim();
      if (normalizedLabel) {
        nextLabels[axisKey] = normalizedLabel;
      }
    }

    return Object.keys(nextLabels).length ? nextLabels : null;
  });

export const normalizeLinearLogScale = (value: unknown): LinearLogScale =>
  String(value ?? "").trim().toLowerCase() === "log" ? "log" : "linear";

export const normalizePlotYScale = (value: unknown): PlotYScale => {
  const normalized = String(value ?? "").trim();
  if (normalized === "logAbs") return "logAbs";
  return normalizeLinearLogScale(normalized);
};

export const normalizeLogCurrentMode = (value: unknown): LogCurrentMode =>
  String(value ?? "").trim() === "positive" ? "positive" : "all";

export const normalizeYScaleByFileIdRecord = (value: unknown): Record<string, LinearLogScale> =>
  normalizeByFileIdRecord(value, normalizeLinearLogScale);

export const normalizeYLogCurrentModeByFileIdRecord = (
  value: unknown,
): Record<string, LogCurrentMode> =>
  normalizeByFileIdRecord(value, normalizeLogCurrentMode);
