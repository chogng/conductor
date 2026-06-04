import { withSignedLogPositivePoints } from "./plotViewModel.ts";
import type { PlotYScale, LogCurrentMode } from "./plotModel.ts";

export type PlotAxisTitleChangeEvent = {
  axis: "x" | "y";
  title: string;
};

export type PlotSeries = {
  data?: Array<{ y?: unknown; [key: string]: unknown }>;
  id?: unknown;
  [key: string]: unknown;
};

export type PlotSeriesByType<T extends PlotSeries> = Partial<{
  gm: T[];
  iv: T[];
  j: T[];
  ss: T[];
  vth: T[];
}>;

export const getPlotLegendSeries = <T extends PlotSeries>({
  effectivePlotType,
  plotSeriesByType,
}: {
  effectivePlotType: string;
  plotSeriesByType?: PlotSeriesByType<T> | null;
}): T[] => {
  const byType = plotSeriesByType ?? {};
  if (effectivePlotType === "gm") return byType.gm ?? [];
  if (effectivePlotType === "vth") return byType.vth ?? [];
  if (effectivePlotType === "j") return byType.j ?? [];
  if (effectivePlotType === "ss") return byType.ss ?? byType.iv ?? [];
  return byType.iv ?? [];
};

export const getDisplayPlotSeries = <T extends PlotSeries>({
  plotLegendSeries,
  visibleSeriesKeySet,
  yLogCurrentMode,
  yScaleMode,
}: {
  plotLegendSeries: readonly T[];
  visibleSeriesKeySet: Set<string>;
  yLogCurrentMode: LogCurrentMode;
  yScaleMode: PlotYScale;
}): T[] => {
  const visible = plotLegendSeries.filter((series) => {
    const seriesId = String(series?.id ?? "").trim();
    return !seriesId || visibleSeriesKeySet.has(seriesId);
  });

  if (yScaleMode !== "log" || yLogCurrentMode === "positive") {
    return visible;
  }

  return visible.map((series) => ({
    ...series,
    data: withSignedLogPositivePoints(series?.data),
  })) as T[];
};

export const getRenderPointBudget = ({
  defaultBudget,
  effectivePlotType,
  gmBudget,
}: {
  defaultBudget: number;
  effectivePlotType: string;
  gmBudget: number;
}): number => effectivePlotType === "gm" ? gmBudget : defaultBudget;

export const getRenderMaxPointsPerSeries = ({
  maxPoints,
  minPoints,
  renderPointBudget,
  seriesCount,
}: {
  maxPoints: number;
  minPoints: number;
  renderPointBudget: number;
  seriesCount: number;
}): number => {
  const adaptive = Math.floor(renderPointBudget / Math.max(1, seriesCount));
  return Math.max(minPoints, Math.min(maxPoints, adaptive));
};

export const createPlotAxisTitleChangeEvent = (
  axis: "x" | "y",
  title: unknown,
): PlotAxisTitleChangeEvent => ({
  axis,
  title: String(title ?? "").trim(),
});
