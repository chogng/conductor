import { withSignedLogPositivePoints } from "./chartViewModel.ts";
import type { ChartYScale, LogCurrentMode } from "./chartModel.ts";

export type ChartAxisTitleChangeEvent = {
  axis: "x" | "y";
  title: string;
};

export type ChartPlotSeries = {
  data?: Array<{ y?: unknown; [key: string]: unknown }>;
  id?: unknown;
  [key: string]: unknown;
};

export type ChartPlotSeriesByType<T extends ChartPlotSeries> = Partial<{
  gm: T[];
  iv: T[];
  j: T[];
  ss: T[];
  vth: T[];
}>;

export const getPlotLegendSeries = <T extends ChartPlotSeries>({
  effectivePlotType,
  plotSeriesByType,
}: {
  effectivePlotType: string;
  plotSeriesByType?: ChartPlotSeriesByType<T> | null;
}): T[] => {
  const byType = plotSeriesByType ?? {};
  if (effectivePlotType === "gm") return byType.gm ?? [];
  if (effectivePlotType === "vth") return byType.vth ?? [];
  if (effectivePlotType === "j") return byType.j ?? [];
  if (effectivePlotType === "ss") return byType.ss ?? byType.iv ?? [];
  return byType.iv ?? [];
};

export const getDisplayPlotSeries = <T extends ChartPlotSeries>({
  plotLegendSeries,
  visibleSeriesKeySet,
  yLogCurrentMode,
  yScaleMode,
}: {
  plotLegendSeries: readonly T[];
  visibleSeriesKeySet: Set<string>;
  yLogCurrentMode: LogCurrentMode;
  yScaleMode: ChartYScale;
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

export const createChartAxisTitleChangeEvent = (
  axis: "x" | "y",
  title: unknown,
): ChartAxisTitleChangeEvent => ({
  axis,
  title: String(title ?? "").trim(),
});
