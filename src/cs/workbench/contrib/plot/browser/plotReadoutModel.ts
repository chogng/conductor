import type { PlotMainPoint, PlotMainSeries } from "src/cs/workbench/contrib/plot/browser/plotMainChart";
import { getPlotColor, resolveSeriesPlotColor } from "src/cs/workbench/contrib/plot/browser/plotColors";

export type PlotYKey = "y" | "yPositive" | "yAbsPositive" | "ySignedLogPositive";

export type PlotReadoutEntry = {
  readonly color: string;
  readonly label: string;
  readonly x: number;
  readonly y: number;
};

export const resolvePlotPointY = (point: PlotMainPoint, key: PlotYKey): number | null => {
  const value = Number(point[key]);
  if (Number.isFinite(value)) return value;
  if (key === "yAbsPositive") {
    const raw = Number(point.y);
    return Number.isFinite(raw) && raw !== 0 ? Math.abs(raw) : null;
  }
  if (key === "yPositive") {
    const raw = Number(point.y);
    return Number.isFinite(raw) && raw > 0 ? raw : null;
  }
  return null;
};

export const getPlotReadoutAtX = (
  seriesList: readonly PlotMainSeries[] | null | undefined,
  xRaw: number,
  yKey: PlotYKey,
): PlotReadoutEntry[] => {
  const entries: PlotReadoutEntry[] = [];
  for (const [seriesIndex, series] of (seriesList ?? []).entries()) {
    let nearest: PlotMainPoint | null = null;
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (const point of series.data ?? []) {
      const x = Number(point?.x);
      if (!Number.isFinite(x)) continue;
      const distance = Math.abs(x - xRaw);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearest = point;
      }
    }
    if (!nearest) continue;
    const y = resolvePlotPointY(nearest, yKey);
    const x = Number(nearest.x);
    if (y === null || !Number.isFinite(x)) continue;
    entries.push({
      color: series.color || resolveSeriesPlotColor(series, seriesIndex) || getPlotColor(seriesIndex),
      label: String(series.tooltipName ?? series.name ?? `Series ${seriesIndex + 1}`),
      x,
      y,
    });
  }
  return entries;
};
