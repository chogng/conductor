/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

// Provides the default plot color palette and series color resolution.
export const COLORS = [
  "#515151",
  "#F14040",
  "#1A6FDF",
  "#37AD6B",
  "#B177DE",
  "#CC9900",
  "#00CBCC",
  "#7D4E4E",
  "#8E8E00",
  "#FB6501",
  "#6699CC",
  "#6FB802",
] as const;

const DEFAULT_PLOT_COLOR = "#8884d8";

type PlotColorSeries = {
  readonly color?: unknown;
};

type PlotColorIdentitySeries = PlotColorSeries & {
  readonly id: string;
};

export type PlotSeriesColorMap = ReadonlyMap<string, string>;

const clampAlpha = (alpha: unknown): number => {
  const value = Number(alpha);
  if (!Number.isFinite(value)) return 1;
  return Math.min(1, Math.max(0, value));
};

const hexToRgb = (hex: unknown): { r: number; g: number; b: number } | null => {
  const normalized = String(hex || "").trim();
  const match = /^#?([0-9a-fA-F]{6})$/.exec(normalized);
  if (!match) return null;
  const value = Number.parseInt(match[1], 16);
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
  };
};

export const applyAlphaToPlotColor = (
  color: unknown,
  alpha: unknown,
): string => {
  const rgb = hexToRgb(color);
  if (!rgb) return String(color ?? "");
  const normalizedAlpha = clampAlpha(alpha);
  if (normalizedAlpha >= 1) return `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${normalizedAlpha})`;
};

export const getPlotColor = (seriesIndex: unknown): string => {
  const index = Math.floor(Number(seriesIndex) || 0);
  const paletteIndex = ((index % COLORS.length) + COLORS.length) % COLORS.length;
  return COLORS[paletteIndex] ?? DEFAULT_PLOT_COLOR;
};

export const resolveSeriesPlotColor = (
  series: PlotColorSeries | null | undefined,
  seriesIndex: unknown,
): string => {
  const ownColor = String(series?.color ?? "").trim();
  return ownColor || getPlotColor(seriesIndex);
};

export const createPlotSeriesColorMap = (
  seriesList: readonly PlotColorIdentitySeries[],
): PlotSeriesColorMap => new Map(
  seriesList.map((series, seriesIndex) => [
    series.id,
    resolveSeriesPlotColor(series, seriesIndex),
  ]),
);

export const getPlotSeriesColor = (
  seriesColors: PlotSeriesColorMap,
  series: PlotColorIdentitySeries,
): string | undefined => seriesColors.get(series.id);
