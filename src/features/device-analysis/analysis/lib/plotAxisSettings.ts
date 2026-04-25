export type PlotAxisSettings = {
  xMin: string;
  xMax: string;
  xTicks: "auto" | "nice" | "step";
  xTickCount: number;
  xStep: string;
  xTooltipDigits: string;
  yMin: string;
  yMax: string;
  yScale: "linear" | "log" | "logAbs";
  yLogCurrentMode: "all" | "positive";
  yTicks: "auto" | "nice" | "step" | "decades";
  yTickCount: number;
  yStep: string;
  yDecadeStep: number;
  showGrid: boolean;
  showMajorTicks: boolean;
  tickLabelFontSize: number | "";
  axisTitleFontSize: number | "";
  originTickLabelOffset: string;
  originAxisTitleGap: string;
};

export const DEFAULT_PLOT_AXIS_SETTINGS: PlotAxisSettings = Object.freeze({
  xMin: "",
  xMax: "",
  xTicks: "auto",
  xTickCount: 6,
  xStep: "",
  xTooltipDigits: "",
  yMin: "",
  yMax: "",
  yScale: "linear",
  yLogCurrentMode: "all",
  yTicks: "nice",
  yTickCount: 6,
  yStep: "",
  yDecadeStep: 1,
  showGrid: true,
  showMajorTicks: true,
  tickLabelFontSize: "",
  axisTitleFontSize: "",
  originTickLabelOffset: "",
  originAxisTitleGap: "",
}) as PlotAxisSettings;

const CHART_FONT_SIZE_MIN = 1;
const CHART_FONT_SIZE_MAX = 96;

const normalizeFiniteNumberText = (value: unknown): string => {
  if (value === null || value === undefined) return "";
  const text = String(value).trim();
  if (!text) return "";
  const num = Number(text);
  return Number.isFinite(num) ? text : "";
};

const normalizeIntegerText = (
  value: unknown,
  min: number,
  max: number,
): string => {
  const text = normalizeFiniteNumberText(value);
  if (!text) return "";
  const rounded = Math.round(Number(text));
  return String(Math.min(max, Math.max(min, rounded)));
};

const normalizeBoundedInt = (
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): number => {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, Math.round(num)));
};

const normalizeOptionalBoundedInt = (
  value: unknown,
  fallback: number | "",
  min: number,
  max: number,
): number | "" => {
  if (value === null || value === undefined) return fallback;
  const text = String(value).trim();
  if (!text) return "";
  const num = Number(text);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, Math.round(num)));
};

const normalizeBoolean = (value: unknown, fallback: boolean): boolean =>
  typeof value === "boolean" ? value : fallback;

const normalizeXTickMode = (value: unknown): PlotAxisSettings["xTicks"] => {
  const mode = String(value ?? "");
  return mode === "nice" || mode === "step" ? mode : "auto";
};

const normalizeYScale = (value: unknown): PlotAxisSettings["yScale"] => {
  const mode = String(value ?? "");
  if (mode === "log" || mode === "logAbs") return mode;
  return "linear";
};

const normalizeYTickMode = (
  value: unknown,
  yScale: PlotAxisSettings["yScale"],
): PlotAxisSettings["yTicks"] => {
  const mode = String(value ?? "");
  if (yScale !== "linear") {
    return mode === "auto" ? "auto" : "decades";
  }
  if (mode === "auto" || mode === "step") return mode;
  return "nice";
};

const normalizeLogCurrentMode = (
  value: unknown,
): PlotAxisSettings["yLogCurrentMode"] =>
  String(value ?? "") === "positive" ? "positive" : "all";

export const normalizePlotAxisSettings = (
  value: unknown,
  fallback: PlotAxisSettings = DEFAULT_PLOT_AXIS_SETTINGS,
): PlotAxisSettings => {
  const raw = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const yScale = normalizeYScale(raw.yScale ?? fallback.yScale);

  return {
    xMin: normalizeFiniteNumberText(raw.xMin ?? fallback.xMin),
    xMax: normalizeFiniteNumberText(raw.xMax ?? fallback.xMax),
    xTicks: normalizeXTickMode(raw.xTicks ?? fallback.xTicks),
    xTickCount: normalizeBoundedInt(raw.xTickCount, fallback.xTickCount, 2, 20),
    xStep: normalizeFiniteNumberText(raw.xStep ?? fallback.xStep),
    xTooltipDigits: normalizeIntegerText(raw.xTooltipDigits ?? fallback.xTooltipDigits, 0, 20),
    yMin: normalizeFiniteNumberText(raw.yMin ?? fallback.yMin),
    yMax: normalizeFiniteNumberText(raw.yMax ?? fallback.yMax),
    yScale,
    yLogCurrentMode: normalizeLogCurrentMode(raw.yLogCurrentMode ?? fallback.yLogCurrentMode),
    yTicks: normalizeYTickMode(raw.yTicks ?? fallback.yTicks, yScale),
    yTickCount: normalizeBoundedInt(raw.yTickCount, fallback.yTickCount, 2, 20),
    yStep: normalizeFiniteNumberText(raw.yStep ?? fallback.yStep),
    yDecadeStep: normalizeBoundedInt(raw.yDecadeStep, fallback.yDecadeStep, 1, 10),
    showGrid: normalizeBoolean(raw.showGrid, fallback.showGrid),
    showMajorTicks: normalizeBoolean(raw.showMajorTicks, fallback.showMajorTicks),
    tickLabelFontSize: normalizeOptionalBoundedInt(
      raw.tickLabelFontSize,
      fallback.tickLabelFontSize,
      CHART_FONT_SIZE_MIN,
      CHART_FONT_SIZE_MAX,
    ),
    axisTitleFontSize: normalizeOptionalBoundedInt(
      raw.axisTitleFontSize,
      fallback.axisTitleFontSize,
      CHART_FONT_SIZE_MIN,
      CHART_FONT_SIZE_MAX,
    ),
    originTickLabelOffset: normalizeFiniteNumberText(
      raw.originTickLabelOffset ?? fallback.originTickLabelOffset,
    ),
    originAxisTitleGap: normalizeFiniteNumberText(
      raw.originAxisTitleGap ?? fallback.originAxisTitleGap,
    ),
  };
};
