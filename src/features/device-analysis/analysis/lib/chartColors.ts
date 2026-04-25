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

const DEFAULT_CHART_COLOR = "#8884d8";

type ChartColorSeries = Record<string, unknown> & {
  color?: unknown;
};

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

export const applyAlphaToChartColor = (
  color: unknown,
  alpha: unknown,
): string => {
  const rgb = hexToRgb(color);
  if (!rgb) return String(color ?? "");
  const normalizedAlpha = clampAlpha(alpha);
  if (normalizedAlpha >= 1) return `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${normalizedAlpha})`;
};

export const getChartColor = (seriesIndex: unknown): string => {
  const index = Math.floor(Number(seriesIndex) || 0);
  const paletteIndex = ((index % COLORS.length) + COLORS.length) % COLORS.length;
  return COLORS[paletteIndex] ?? DEFAULT_CHART_COLOR;
};

export const resolveSeriesChartColor = (
  series: ChartColorSeries | null | undefined,
  seriesIndex: unknown,
): string => {
  const ownColor = String(series?.color ?? "").trim();
  return ownColor || getChartColor(seriesIndex);
};

