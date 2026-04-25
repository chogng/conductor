import {
  Fragment,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Input from "../../../../components/ui/Input";
import { formatNumber, splitBidirectionalCurvePoints } from "../lib/analysisMath";
import { getChartColor, resolveSeriesChartColor } from "../lib/chartColors";
import { inferTickDigitsFromTicks } from "../lib/analysisChartsUtils";
import {
  collectCanvasLineRuns,
  toFiniteCanvasNumber,
  valueToCanvasY,
} from "../lib/canvasPlotUtils";
import {
  getDeviceAnalysisPerfNow,
  isDeviceAnalysisPerfEnabled,
  logDeviceAnalysisPerf,
} from "../../shared/lib/deviceAnalysisPerf";

type PlotPoint = {
  x?: number;
  y?: number;
  yPositive?: number;
  yAbsPositive?: number;
  [key: string]: number | string | null | undefined;
};

type PlotSeries = {
  id: string;
  name: string;
  tooltipName?: string;
  color?: string;
  data: PlotPoint[];
};

type PlotYKey = "y" | "yPositive" | "yAbsPositive" | "ySignedLogPositive";

type SsOverlay = {
  x1: number;
  x2: number;
};

type SsOverlayStyle = {
  fill: string;
  fillOpacity: number;
  stroke: string;
  strokeOpacity: number;
};

type HighlightOverlay = {
  key: string;
  fill: string;
  fillOpacity: number;
  hideEndLine?: boolean;
  hideStartLine?: boolean;
  stroke: string;
  strokeDasharray?: string;
  strokeOpacity: number;
  strokeWidth?: number;
  x1: number;
  x2: number;
};

type CurrentBiasMarker = {
  key: string;
  label?: string;
  role?: "ion" | "ioff";
  stroke: string;
  strokeDasharray?: string;
  strokeOpacity: number;
  strokeWidth?: number;
  x: number;
};

type CurrentBiasInteractionConfig = {
  enabled: boolean;
  markers: CurrentBiasMarker[];
  onCommit?: (role: "ion" | "ioff", x: number) => void;
};

type SsInteractionConfig = {
  enabled: boolean;
  range: SsOverlay | null;
  onCommit?: (range: SsOverlay) => void;
};

type MainPlotChartProps = {
  plotType?: string;
  curveLineWidth?: number;
  curvePlotType?: number;
  activeFile?: Partial<{
    fileId: string;
    fileName: string;
    xLabel: string;
    yLabel: string;
  }> | null;
  seriesList: PlotSeries[];
  xDomain: [number, number];
  xTicks?: number[] | null;
  plotXFactor: number;
  plotXUnitLabel: string;
  xTickDigits: number;
  xTooltipDigits?: number;
  curveProbeX?: number | null;
  xLabelInterval: number;
  effectiveYScale: "linear" | "log" | "logAbs";
  yDomain: [number, number];
  yTicks?: number[] | null;
  yLogCurrentMode?: "all" | "positive";
  yScaleMode: "linear" | "log" | "logAbs";
  plotYFactor: number;
  plotYUnitLabel: string;
  focusedSeriesId?: string | null;
  focusedFitLine?: PlotPoint[] | null;
  focusedSeriesColor?: string;
  highlightOverlays?: HighlightOverlay[];
  currentBiasMarkers?: CurrentBiasMarker[];
  focusedSsOverlay?: SsOverlay | null;
  ssOverlayStyle: SsOverlayStyle;
  interactiveSeriesXs?: number[];
  currentBiasInteraction?: CurrentBiasInteractionConfig | null;
  ssInteraction?: SsInteractionConfig | null;
  showGrid?: boolean;
  showMajorTicks?: boolean;
  showMinorTicks?: boolean;
  minorTickCount?: number;
  tickLabelFontSize?: number;
  axisTitleFontSize?: number;
  originTickLabelOffset?: unknown;
  originAxisTitleGap?: unknown;
  legendWidth?: number;
  legendContent?: any;
  xAxisLabelOverride?: string;
  yAxisLabelOverride?: string;
  onXAxisLabelChange?: (nextLabel: string) => void;
  onYAxisLabelChange?: (nextLabel: string) => void;
};

type CurveRenderMode = "line" | "scatter" | "lineSymbol";

type CanvasTooltipState = {
  cursorX?: number;
  entries?: CanvasTooltipEntry[];
  label: string;
  seriesName: string;
  visible: boolean;
  x: number;
  y: number;
};

type CanvasTooltipEntry = {
  color: string;
  pointY: number;
  pointX: number;
  seriesName: string;
  valueLabel: string;
};

type CanvasTooltipPoint = {
  chartY: number;
  index: number;
  point: PlotPoint;
  rawX: number;
  rawY: number;
};

type CanvasTooltipLookup = {
  monotonic: "asc" | "desc" | null;
  points: CanvasTooltipPoint[];
};

type CanvasTooltipLookupEntry = {
  color: string;
  lookup: CanvasTooltipLookup;
  series: PlotSeries;
};

const LOG_CHART_Y_DATA_KEY = "__chartY";
const LOG_CHART_SIGN_DATA_KEY = "__chartSign";
const SIGNED_LOG_Y_DATA_KEY = "ySignedLogPositive";
const TOOLTIP_SERIES_NAME_SEPARATOR = "\u0000";
const logChartSeriesListCache = new WeakMap<object, Map<string, PlotSeries[]>>();
const logChartSeriesDataCache = new WeakMap<object, Map<string, PlotPoint[]>>();
const canvasTooltipLookupCache = new WeakMap<
  PlotPoint[],
  Map<string, CanvasTooltipLookup>
>();

const decodeTooltipSeriesName = (
  value: unknown,
): { label: string; token: string } => {
  const token = String(value ?? "");
  const separatorIndex = token.lastIndexOf(TOOLTIP_SERIES_NAME_SEPARATOR);
  if (separatorIndex < 0) {
    return { label: token, token };
  }
  return {
    label: token.slice(0, separatorIndex),
    token,
  };
};

const formatTooltipBranchSuffix = (branchRaw: unknown): string => {
  const branch = String(branchRaw ?? "");
  if (branch === "forward") return " (forward)";
  if (branch === "reverse") return " (reverse)";
  return "";
};

const toLogChartValue = (value: unknown): number | null => {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return null;
  return Math.log10(num);
};

const getCachedLogChartSeriesData = (
  data: PlotPoint[],
  plotYKey: PlotYKey,
): PlotPoint[] => {
  const cacheKey = data as unknown as object;
  let cacheBucket = logChartSeriesDataCache.get(cacheKey);
  if (!cacheBucket) {
    cacheBucket = new Map<string, PlotPoint[]>();
    logChartSeriesDataCache.set(cacheKey, cacheBucket);
  }

  const cached = cacheBucket.get(plotYKey);
  if (cached) return cached;

  const computed = data.map((point) => ({
    ...point,
    [LOG_CHART_Y_DATA_KEY]: toLogChartValue(point?.[plotYKey]),
    [LOG_CHART_SIGN_DATA_KEY]:
      plotYKey === SIGNED_LOG_Y_DATA_KEY
        ? toFiniteCanvasNumber(point?.ySignedLogSign)
        : null,
  }));
  cacheBucket.set(plotYKey, computed);
  return computed;
};

const getCachedLogChartSeriesList = (
  seriesList: PlotSeries[],
  plotYKey: PlotYKey,
): PlotSeries[] => {
  const cacheKey = seriesList as unknown as object;
  let cacheBucket = logChartSeriesListCache.get(cacheKey);
  if (!cacheBucket) {
    cacheBucket = new Map<string, PlotSeries[]>();
    logChartSeriesListCache.set(cacheKey, cacheBucket);
  }

  const cached = cacheBucket.get(plotYKey);
  if (cached) return cached;

  // Cache per rendered series array so repeated plot switches reuse the converted points.
  const computed = seriesList.map((series) => ({
    ...series,
    data: Array.isArray(series?.data)
      ? getCachedLogChartSeriesData(series.data, plotYKey)
      : [],
  }));
  cacheBucket.set(plotYKey, computed);
  return computed;
};

const formatLogTickLabel = (value: unknown): string => {
  const num = Number(value);
  if (!Number.isFinite(num) || num === 0) return "0";
  const text = num.toExponential(2);
  return text.replace(/(?:\.0+|(\.\d*?[1-9])0+)e/, "$1e");
};

const withYAxisUnit = (
  labelRaw: string | null | undefined,
  unitRaw: string | null | undefined,
): string => {
  const label = String(labelRaw ?? "").trim();
  const unit = String(unitRaw ?? "").trim();
  if (!unit) return label;
  if (!label) return unit;
  if (/\([^()]+\)\s*$/.test(label)) {
    return label.replace(/\([^()]+\)\s*$/, `(${unit})`);
  }
  return `${label} (${unit})`;
};

const stripAxisUnitSuffix = (labelRaw: string | null | undefined): string => {
  return String(labelRaw ?? "").trim().replace(/\s*\([^()]+\)\s*$/, "").trim();
};

const DEFAULT_CHART_MARGIN = { top: 25, right: 15, left: 112, bottom: 46 } as const;
const GRID_STROKE = "rgba(15,23,42,0.14)";
const GRID_DASH: [number, number] = [4, 4];
const PLOT_BORDER_STROKE = "#000000";
const MAJOR_TICK_LENGTH_PX = 6;
const MAJOR_TICK_STROKE = "#000000";
const MINOR_TICK_LENGTH_PX = 3.5;
const MINOR_TICK_STROKE = "rgba(0,0,0,0.8)";
const TICK_LABEL_COLOR = "#000000";
const AXIS_FONT_FAMILY = "Arial, sans-serif";
const DEFAULT_TICK_LABEL_FONT_SIZE = 18;
const DEFAULT_AXIS_TITLE_FONT_SIZE = 22;
const DEFAULT_AXIS_TITLE_GAP_PX = 10;
const PREVIEW_TICK_LABEL_OFFSET_SCALE = 5;
const PREVIEW_AXIS_TITLE_GAP_SCALE = 4;
const AXIS_TITLE_EDGE_PADDING_PX = 14;
const AXIS_LABEL_COLOR = "#000000";
const AXIS_TITLE_EDIT_MIN_WIDTH_PX = 64;
const AXIS_TITLE_EDIT_MAX_WIDTH_PX = 260;
const Y_AXIS_TITLE_EDIT_X_OFFSET_PX = -12;
const CURRENT_BIAS_DRAG_TOLERANCE_PX = 22;
const CURRENT_BIAS_HIT_WIDTH_PX = 28;
const SS_HANDLE_TOLERANCE_PX = 14;
const SS_HANDLE_WIDTH_PX = 18;
const SS_MOVE_BAND_HEIGHT_PX = 24;
const CANVAS_TOOLTIP_EDGE_BUFFER_PX = 18;
const CANVAS_TOOLTIP_PROBE_SNAP_PX = 8;

type PlotRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

type ChartMargin = {
  top: number;
  right: number;
  left: number;
  bottom: number;
};

const normalizeAxisSpacingValue = (value: unknown): number | null => {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const num = Number(text);
  return Number.isFinite(num) ? num : null;
};

type OverlayDraftState =
  | {
      kind: "currentBias";
      activeRole: "ion" | "ioff";
      markers: CurrentBiasMarker[];
    }
  | {
      kind: "ss";
      range: SsOverlay;
    };

type OverlayDragState =
  | {
      kind: "currentBias";
      pointerId: number;
      activeRole: "ion" | "ioff";
    }
  | {
      kind: "ss";
      pointerId: number;
      mode: "new" | "left" | "right" | "move";
      startX: number;
      startRange: SsOverlay | null;
    };

type OverlayHoverTarget =
  | {
      kind: "currentBias";
      role: "ion" | "ioff";
    }
  | {
      kind: "ss";
      mode: "left" | "right" | "move" | "new";
    };

type CurrentBiasHoverTarget = Extract<
  OverlayHoverTarget,
  { kind: "currentBias" }
>;
type SsHoverTarget = Extract<OverlayHoverTarget, { kind: "ss" }>;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const isFiniteNumber = (value: unknown): value is number =>
  Number.isFinite(Number(value));

const normalizeMinorTickCount = (value: unknown): number => {
  const count = Number(value);
  if (!Number.isFinite(count)) return 1;
  return Math.min(20, Math.max(1, Math.round(count)));
};

const buildLinearMinorTicks = (
  ticks: number[] | null | undefined,
  minorTickCount: number,
): number[] => {
  if (!Array.isArray(ticks) || ticks.length < 2) return [];
  const count = normalizeMinorTickCount(minorTickCount);
  const result: number[] = [];
  for (let index = 1; index < ticks.length; index += 1) {
    const start = Number(ticks[index - 1]);
    const end = Number(ticks[index]);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end === start) continue;
    const step = (end - start) / (count + 1);
    for (let offset = 1; offset <= count; offset += 1) {
      result.push(start + step * offset);
    }
  }
  return result;
};

const filterTicksToDomain = (
  ticks: number[] | null | undefined,
  min: number,
  max: number,
): number[] => {
  if (!Array.isArray(ticks)) return [];
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  const span = Math.max(1, Math.abs(hi - lo));
  const epsilon = span * 1e-9;
  return ticks.filter((tick) => {
    const value = Number(tick);
    return Number.isFinite(value) && value >= lo - epsilon && value <= hi + epsilon;
  });
};

const getSortedDomain = (domain: [number, number]): [number, number] => {
  const a = Number(domain?.[0] ?? 0);
  const b = Number(domain?.[1] ?? 0);
  return a <= b ? [a, b] : [b, a];
};

const findNearestSnapX = (
  rawX: number,
  snapXs: number[],
  disableSnap: boolean,
): number => {
  if (disableSnap || !snapXs.length) return rawX;

  let lo = 0;
  let hi = snapXs.length - 1;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (snapXs[mid] < rawX) lo = mid + 1;
    else hi = mid;
  }

  const right = snapXs[lo];
  const left = lo > 0 ? snapXs[lo - 1] : right;
  return Math.abs(right - rawX) < Math.abs(rawX - left) ? right : left;
};

const plotRectHasArea = (plotRect: PlotRect | null): plotRect is PlotRect =>
  Boolean(plotRect && plotRect.width > 0 && plotRect.height > 0);

const setupCanvas = (
  canvas: HTMLCanvasElement,
  width: number,
  height: number,
): CanvasRenderingContext2D | null => {
  const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
  canvas.width = Math.max(1, Math.floor(width * dpr));
  canvas.height = Math.max(1, Math.floor(height * dpr));
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
};

const getCanvasTooltipLookup = (
  data: PlotPoint[],
  chartYDataKey: string,
  plotYKey: PlotYKey,
): CanvasTooltipLookup => {
  const cacheKey = `${chartYDataKey}:${plotYKey}`;
  let cacheBucket = canvasTooltipLookupCache.get(data);
  if (!cacheBucket) {
    cacheBucket = new Map<string, CanvasTooltipLookup>();
    canvasTooltipLookupCache.set(data, cacheBucket);
  }
  const cached = cacheBucket.get(cacheKey);
  if (cached) return cached;

  const points: CanvasTooltipPoint[] = [];
  for (let index = 0; index < data.length; index += 1) {
    const point = data[index];
    const rawX = toFiniteCanvasNumber(point?.x);
    const chartY = valueToCanvasY(point, chartYDataKey);
    const rawYKey = plotYKey === SIGNED_LOG_Y_DATA_KEY ? "y" : plotYKey;
    const rawY = toFiniteCanvasNumber(point?.[rawYKey]);
    if (
      rawX !== null &&
      chartY !== null &&
      rawY !== null
    ) {
      points.push({ chartY, index, point, rawX, rawY });
    }
  }

  let ascending = true;
  let descending = true;
  for (let index = 1; index < points.length; index += 1) {
    const prev = points[index - 1].rawX;
    const next = points[index].rawX;
    if (next < prev) ascending = false;
    if (next > prev) descending = false;
    if (!ascending && !descending) break;
  }

  const lookup = {
    monotonic: ascending ? "asc" : descending ? "desc" : null,
    points,
  } satisfies CanvasTooltipLookup;
  cacheBucket.set(cacheKey, lookup);
  return lookup;
};

const getNearestCanvasTooltipPoint = (
  lookup: CanvasTooltipLookup,
  rawX: number,
): CanvasTooltipPoint | null => {
  const { points } = lookup;
  if (!points.length) return null;

  const pickNearest = (
    best: CanvasTooltipPoint | null,
    candidate: CanvasTooltipPoint | undefined,
  ): CanvasTooltipPoint | null => {
    if (!candidate) return best;
    if (!best) return candidate;
    const candidateDistance = Math.abs(candidate.rawX - rawX);
    const bestDistance = Math.abs(best.rawX - rawX);
    if (candidateDistance < bestDistance) return candidate;
    return best;
  };

  if (!lookup.monotonic) {
    let best: CanvasTooltipPoint | null = null;
    for (const point of points) {
      best = pickNearest(best, point);
    }
    return best;
  }

  let lo = 0;
  let hi = points.length - 1;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    const midX = points[mid].rawX;
    if (lookup.monotonic === "asc") {
      if (midX < rawX) lo = mid + 1;
      else hi = mid;
    } else if (midX > rawX) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }

  let best: CanvasTooltipPoint | null = null;
  best = pickNearest(best, points[lo]);
  best = pickNearest(best, points[lo - 1]);
  best = pickNearest(best, points[lo + 1]);
  return best;
};

const interpolateCanvasTooltipPoint = (
  lookup: CanvasTooltipLookup,
  rawX: number,
): CanvasTooltipPoint | null => {
  const { points } = lookup;
  if (!points.length) return null;
  if (!lookup.monotonic || points.length < 2) {
    return getNearestCanvasTooltipPoint(lookup, rawX);
  }

  let lo = 0;
  let hi = points.length - 1;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    const midX = points[mid].rawX;
    if (lookup.monotonic === "asc") {
      if (midX < rawX) lo = mid + 1;
      else hi = mid;
    } else if (midX > rawX) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }

  const upper = points[lo];
  const lower = points[lo - 1];
  if (!lower || !upper) {
    return getNearestCanvasTooltipPoint(lookup, rawX);
  }
  if (upper.rawX === rawX) return upper;
  if (lower.rawX === rawX) return lower;

  const dx = upper.rawX - lower.rawX;
  if (!Number.isFinite(dx) || dx === 0) {
    return getNearestCanvasTooltipPoint(lookup, rawX);
  }
  const t = (rawX - lower.rawX) / dx;
  if (!Number.isFinite(t)) {
    return getNearestCanvasTooltipPoint(lookup, rawX);
  }
  const tc = Math.max(0, Math.min(1, t));
  return {
    chartY: lower.chartY + tc * (upper.chartY - lower.chartY),
    index: lower.index,
    point: lower.point,
    rawX,
    rawY: lower.rawY + tc * (upper.rawY - lower.rawY),
  };
};

const sameHoverTarget = (
  a: OverlayHoverTarget | null,
  b: OverlayHoverTarget | null,
): boolean => {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.kind !== b.kind) return false;
  if (a.kind === "currentBias" && b.kind === "currentBias") {
    return a.role === b.role;
  }
  if (a.kind === "ss" && b.kind === "ss") {
    return a.mode === b.mode;
  }
  return false;
};

const CanvasMainPlotChart = memo(function CanvasMainPlotChart({
  activeFile,
  chartFocusedFitLine,
  chartPointCount,
  chartSeriesList,
  chartYDataKey,
  chartYDomain,
  chartYTicks,
  curveLineWidth,
  curveRenderMode,
  currentBiasMarkers,
  currentBiasInteraction,
  effectiveYScale,
  focusedSeriesColor,
  focusedSeriesId,
  focusedSsOverlay,
  highlightOverlays,
  interactiveSeriesXs,
  interactiveXDomain,
  isSsPlot,
  legendContent,
  legendWidth,
  chartMargin,
  curveProbeX,
  plotType,
  plotXFactor,
  plotXUnitLabel,
  plotYFactor,
  plotYKey,
  plotYUnitLabel,
  showGrid,
  showMajorTicks,
  showMinorTicks,
  minorTickCount,
  ssInteraction,
  ssOverlayStyle,
  tickLabelFontSize,
  tickLabelOffsetPx,
  xAxisLabel,
  xAxisEditableLabel,
  onXAxisLabelChange,
  xTickDigits,
  xTicks,
  xTooltipDigits,
  axisTitleFontSize,
  axisTitleGapPx,
  yAxisLabel,
  yAxisEditableLabel,
  onYAxisLabelChange,
  yAxisNearZeroEpsilon,
  yTickDigits,
}: {
  activeFile: MainPlotChartProps["activeFile"];
  chartFocusedFitLine: PlotPoint[] | null;
  chartPointCount: number;
  chartSeriesList: PlotSeries[];
  chartYDataKey: string;
  chartYDomain: [number, number];
  chartYTicks?: number[] | null;
  curveLineWidth: number;
  curveRenderMode: CurveRenderMode;
  currentBiasMarkers: CurrentBiasMarker[];
  currentBiasInteraction?: CurrentBiasInteractionConfig | null;
  effectiveYScale: MainPlotChartProps["effectiveYScale"];
  focusedSeriesColor: string;
  focusedSeriesId?: string | null;
  focusedSsOverlay?: SsOverlay | null;
  highlightOverlays: HighlightOverlay[];
  interactiveSeriesXs?: number[];
  interactiveXDomain: [number, number];
  isSsPlot: boolean;
  legendContent?: any;
  legendWidth: number;
  chartMargin: ChartMargin;
  plotType?: string;
  plotXFactor: number;
  plotXUnitLabel: string;
  plotYFactor: number;
  plotYKey: PlotYKey;
  plotYUnitLabel: string;
  showGrid: boolean;
  showMajorTicks: boolean;
  showMinorTicks: boolean;
  minorTickCount: number;
  ssInteraction?: SsInteractionConfig | null;
  ssOverlayStyle: SsOverlayStyle;
  tickLabelFontSize: number;
  tickLabelOffsetPx: number;
  xAxisLabel: string;
  xAxisEditableLabel: string;
  onXAxisLabelChange?: (nextLabel: string) => void;
  xTickDigits: number;
  xTicks?: number[] | null;
  xTooltipDigits?: number;
  curveProbeX?: number | null;
  axisTitleFontSize: number;
  axisTitleGapPx: number;
  yAxisLabel: string;
  yAxisEditableLabel: string;
  onYAxisLabelChange?: (nextLabel: string) => void;
  yAxisNearZeroEpsilon: number;
  yTickDigits: number;
}) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const axisTitleInputRef = useRef<HTMLInputElement | null>(null);
  const [size, setSize] = useState({ height: 0, width: 0 });
  const [tooltip, setTooltip] = useState<CanvasTooltipState>({
    label: "",
    seriesName: "",
    visible: false,
    x: 0,
    y: 0,
  });
  const [editingAxisTitle, setEditingAxisTitle] = useState<"x" | "y" | null>(null);
  const [editingAxisTitleDraft, setEditingAxisTitleDraft] = useState("");

  useEffect(() => {
    if (!wrapperRef.current) return;
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (!rect) return;
      const width = Math.floor(rect.width);
      const height = Math.floor(rect.height);
      setSize((prev) =>
        prev.width === width && prev.height === height
          ? prev
          : { width, height },
      );
    });
    observer.observe(wrapperRef.current);
    return () => observer.disconnect();
  }, []);

  const plotRect = useMemo<PlotRect | null>(() => {
    const legendSpace = Math.max(0, Number(legendWidth) || 0);
    const width = size.width - legendSpace;
    const plotWidth = width - chartMargin.left - chartMargin.right;
    const plotHeight = size.height - chartMargin.top - chartMargin.bottom;
    if (plotWidth <= 0 || plotHeight <= 0) return null;
    return {
      left: chartMargin.left,
      top: chartMargin.top,
      width: plotWidth,
      height: plotHeight,
    };
  }, [chartMargin, legendWidth, size.height, size.width]);

  const scale = useMemo(() => {
    if (!plotRect) return null;
    const [x0, x1] = getSortedDomain(interactiveXDomain);
    const [y0, y1] = getSortedDomain(chartYDomain);
    const xMin = x0;
    const xMax = x1 > x0 ? x1 : x0 + 1;
    const yMin = y0;
    const yMax = y1 > y0 ? y1 : y0 + 1;
    const xSpan = xMax - xMin || 1;
    const ySpan = yMax - yMin || 1;
    return {
      xMax,
      xMin,
      yMax,
      yMin,
      pxToX: (px: number) => xMin + ((px - plotRect.left) / plotRect.width) * xSpan,
      xToPx: (x: number) => plotRect.left + ((x - xMin) / xSpan) * plotRect.width,
      yToPx: (y: number) => plotRect.top + (1 - (y - yMin) / ySpan) * plotRect.height,
    };
  }, [chartYDomain, interactiveXDomain, plotRect]);

  const tooltipLookups = useMemo<CanvasTooltipLookupEntry[]>(() => {
    const entries: CanvasTooltipLookupEntry[] = [];
    chartSeriesList.forEach((series, index) => {
      const color = resolveSeriesChartColor(series, index);
      const segments = splitBidirectionalCurvePoints(series.data);
      if (segments.length <= 1) {
        entries.push({
          color,
          lookup: getCanvasTooltipLookup(series.data ?? [], chartYDataKey, plotYKey),
          series,
        });
        return;
      }
      for (const segment of segments) {
        const suffix = formatTooltipBranchSuffix(segment?.branch);
        entries.push({
          color,
          lookup: getCanvasTooltipLookup(segment?.points ?? [], chartYDataKey, plotYKey),
          series: {
            ...series,
            data: segment?.points ?? [],
            name: `${decodeTooltipSeriesName(series.tooltipName ?? series.name).label}${suffix}`,
            tooltipName: `${decodeTooltipSeriesName(series.tooltipName ?? series.name).token}${suffix}`,
          },
        });
      }
    });
    return entries;
  }, [chartSeriesList, chartYDataKey, plotYKey]);

  const tooltipXDomain = useMemo<[number, number] | null>(() => {
    let minX = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    for (const { lookup } of tooltipLookups) {
      for (const point of lookup.points) {
        if (point.rawX < minX) minX = point.rawX;
        if (point.rawX > maxX) maxX = point.rawX;
      }
    }
    return Number.isFinite(minX) && Number.isFinite(maxX) ? [minX, maxX] : null;
  }, [tooltipLookups]);

  const renderedLegendContent = useMemo(
    () =>
      typeof legendContent === "function"
        ? legendContent({})
        : legendContent,
    [legendContent],
  );

  useEffect(() => {
    if (!editingAxisTitle) return;
    axisTitleInputRef.current?.focus();
    axisTitleInputRef.current?.select();
  }, [editingAxisTitle]);

  const titleTextWidth = useCallback(
    (label: string): number => {
      const textWidth = Math.ceil(label.length * axisTitleFontSize * 0.62);
      return Math.min(
        AXIS_TITLE_EDIT_MAX_WIDTH_PX,
        Math.max(AXIS_TITLE_EDIT_MIN_WIDTH_PX, textWidth + 18),
      );
    },
    [axisTitleFontSize],
  );

  const axisTitleLayout = useMemo(() => {
    if (!plotRect) return null;
    const plotBottom = plotRect.top + plotRect.height;
    const xTitleBottom =
      plotBottom +
      tickLabelOffsetPx +
      tickLabelFontSize +
      axisTitleGapPx +
      axisTitleFontSize;
    const yTitleX =
      plotRect.left -
      tickLabelOffsetPx -
      tickLabelFontSize * 2.6 -
      axisTitleGapPx -
      axisTitleFontSize * 0.5;
    return {
      x: {
        centerX: plotRect.left + plotRect.width / 2,
        centerY: xTitleBottom - axisTitleFontSize / 2,
        height: axisTitleFontSize + 10,
        width: titleTextWidth(xAxisLabel),
      },
      y: {
        centerX: yTitleX + Y_AXIS_TITLE_EDIT_X_OFFSET_PX,
        centerY: plotRect.top + plotRect.height / 2,
        height: axisTitleFontSize + 10,
        width: titleTextWidth(yAxisLabel),
      },
    };
  }, [
    axisTitleFontSize,
    axisTitleGapPx,
    plotRect,
    tickLabelFontSize,
    tickLabelOffsetPx,
    titleTextWidth,
    xAxisLabel,
    yAxisLabel,
  ]);

  const beginAxisTitleEdit = useCallback(
    (axis: "x" | "y") => {
      const canEdit =
        axis === "x"
          ? typeof onXAxisLabelChange === "function"
          : typeof onYAxisLabelChange === "function";
      if (!canEdit) return;
      setEditingAxisTitle(axis);
      setEditingAxisTitleDraft(
        axis === "x" ? xAxisEditableLabel : yAxisEditableLabel,
      );
    },
    [
      onXAxisLabelChange,
      onYAxisLabelChange,
      xAxisEditableLabel,
      yAxisEditableLabel,
    ],
  );

  const cancelAxisTitleEdit = useCallback(() => {
    setEditingAxisTitle(null);
    setEditingAxisTitleDraft("");
  }, []);

  const commitAxisTitleEdit = useCallback(() => {
    if (!editingAxisTitle) return;
    const nextLabel = stripAxisUnitSuffix(editingAxisTitleDraft);
    if (editingAxisTitle === "x") {
      onXAxisLabelChange?.(nextLabel);
    } else {
      onYAxisLabelChange?.(nextLabel);
    }
    setEditingAxisTitle(null);
    setEditingAxisTitleDraft("");
  }, [
    editingAxisTitle,
    editingAxisTitleDraft,
    onXAxisLabelChange,
    onYAxisLabelChange,
  ]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !plotRect || !scale || size.width <= 0 || size.height <= 0) return;
    const ctx = setupCanvas(canvas, size.width, size.height);
    if (!ctx) return;
    const startedAt = isDeviceAnalysisPerfEnabled() ? getDeviceAnalysisPerfNow() : 0;
    ctx.clearRect(0, 0, size.width, size.height);

    const drawVerticalBand = (x1Raw: number, x2Raw: number, fill: string, opacity: number) => {
      const x1 = clamp(
        scale.xToPx(Math.min(x1Raw, x2Raw)),
        plotRect.left,
        plotRect.left + plotRect.width,
      );
      const x2 = clamp(
        scale.xToPx(Math.max(x1Raw, x2Raw)),
        plotRect.left,
        plotRect.left + plotRect.width,
      );
      if (x2 <= x1) return;
      ctx.save();
      ctx.fillStyle = fill;
      ctx.globalAlpha = opacity;
      ctx.fillRect(x1, plotRect.top, x2 - x1, plotRect.height);
      ctx.restore();
    };
    const drawVerticalLine = (
      xRaw: number,
      stroke: string,
      opacity = 1,
      lineWidth = 1.5,
    ) => {
      const x = scale.xToPx(xRaw);
      if (x < plotRect.left || x > plotRect.left + plotRect.width) return;
      ctx.save();
      ctx.strokeStyle = stroke;
      ctx.globalAlpha = opacity;
      ctx.lineWidth = lineWidth;
      ctx.beginPath();
      ctx.moveTo(x, plotRect.top);
      ctx.lineTo(x, plotRect.top + plotRect.height);
      ctx.stroke();
      ctx.restore();
    };

    const xTicksInDomain = filterTicksToDomain(xTicks, scale.xMin, scale.xMax);
    const yTicksInDomain = filterTicksToDomain(chartYTicks, scale.yMin, scale.yMax);
    const visibleXTicks = xTicksInDomain.length >= 2
      ? xTicksInDomain
      : [scale.xMin, (scale.xMin + scale.xMax) / 2, scale.xMax];
    const visibleYTicks = yTicksInDomain.length >= 2
      ? yTicksInDomain
      : [scale.yMin, (scale.yMin + scale.yMax) / 2, scale.yMax];
    const visibleXMinorTicks = showMinorTicks
      ? buildLinearMinorTicks(visibleXTicks, minorTickCount)
      : [];
    const visibleYMinorTicks = showMinorTicks
      ? buildLinearMinorTicks(visibleYTicks, minorTickCount)
      : [];

    const drawGridAndAxes = () => {
      ctx.save();
      ctx.lineWidth = 1;
      ctx.font = `${tickLabelFontSize}px ${AXIS_FONT_FAMILY}`;
      if (showGrid) {
        const plotRight = plotRect.left + plotRect.width;
        const plotBottom = plotRect.top + plotRect.height;
        const isInternalXGridLine = (x: number) =>
          x > plotRect.left + 0.5 && x < plotRight - 0.5;
        const isInternalYGridLine = (y: number) =>
          y > plotRect.top + 0.5 && y < plotBottom - 0.5;
        ctx.setLineDash(GRID_DASH);
        ctx.strokeStyle = GRID_STROKE;
        for (const tick of visibleXTicks) {
          const x = scale.xToPx(tick);
          if (!isInternalXGridLine(x)) continue;
          ctx.beginPath();
          ctx.moveTo(x, plotRect.top);
          ctx.lineTo(x, plotBottom);
          ctx.stroke();
        }
        for (const tick of visibleYTicks) {
          const y = scale.yToPx(tick);
          if (!isInternalYGridLine(y)) continue;
          ctx.beginPath();
          ctx.moveTo(plotRect.left, y);
          ctx.lineTo(plotRight, y);
          ctx.stroke();
        }
        ctx.setLineDash([]);
      }
      const plotRight = plotRect.left + plotRect.width;
      const plotBottom = plotRect.top + plotRect.height;
      ctx.strokeStyle = PLOT_BORDER_STROKE;
      ctx.strokeRect(plotRect.left, plotRect.top, plotRect.width, plotRect.height);
      if (showMinorTicks) {
        ctx.strokeStyle = MINOR_TICK_STROKE;
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (const tick of visibleXMinorTicks) {
          const x = scale.xToPx(tick);
          if (x < plotRect.left - 0.5 || x > plotRight + 0.5) continue;
          ctx.moveTo(x, plotBottom);
          ctx.lineTo(x, plotBottom + MINOR_TICK_LENGTH_PX);
        }
        for (const tick of visibleYMinorTicks) {
          const y = scale.yToPx(tick);
          if (y < plotRect.top - 0.5 || y > plotBottom + 0.5) continue;
          ctx.moveTo(plotRect.left, y);
          ctx.lineTo(plotRect.left - MINOR_TICK_LENGTH_PX, y);
        }
        ctx.stroke();
      }
      if (showMajorTicks) {
        ctx.strokeStyle = MAJOR_TICK_STROKE;
        ctx.lineWidth = 1.25;
        ctx.beginPath();
        for (const tick of visibleXTicks) {
          const x = scale.xToPx(tick);
          if (x < plotRect.left - 0.5 || x > plotRight + 0.5) continue;
          ctx.moveTo(x, plotBottom);
          ctx.lineTo(x, plotBottom + MAJOR_TICK_LENGTH_PX);
        }
        for (const tick of visibleYTicks) {
          const y = scale.yToPx(tick);
          if (y < plotRect.top - 0.5 || y > plotBottom + 0.5) continue;
          ctx.moveTo(plotRect.left, y);
          ctx.lineTo(plotRect.left - MAJOR_TICK_LENGTH_PX, y);
        }
        ctx.stroke();
      }
      for (const tick of visibleXTicks) {
        const x = scale.xToPx(tick);
        ctx.fillStyle = TICK_LABEL_COLOR;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillText(
          formatNumber(tick * plotXFactor, { digits: xTickDigits }),
          x,
          plotBottom + tickLabelOffsetPx,
        );
      }
      for (const tick of visibleYTicks) {
        const y = scale.yToPx(tick);
        const label = effectiveYScale !== "linear"
          ? formatLogTickLabel(Math.pow(10, tick) * plotYFactor)
          : formatNumber(
              Math.abs(tick * plotYFactor) <= yAxisNearZeroEpsilon
                ? 0
                : tick * plotYFactor,
              { digits: yTickDigits },
            );
        ctx.fillStyle = TICK_LABEL_COLOR;
        ctx.textAlign = "right";
        ctx.textBaseline = "middle";
        ctx.fillText(label, plotRect.left - tickLabelOffsetPx, y);
      }
      ctx.fillStyle = AXIS_LABEL_COLOR;
      ctx.font = `${axisTitleFontSize}px ${AXIS_FONT_FAMILY}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      if (xAxisLabel && editingAxisTitle !== "x") {
        const xTitleBottom =
          plotBottom +
          tickLabelOffsetPx +
          tickLabelFontSize +
          axisTitleGapPx +
          axisTitleFontSize;
        ctx.fillText(xAxisLabel, plotRect.left + plotRect.width / 2, xTitleBottom);
      }
      if (yAxisLabel && editingAxisTitle !== "y") {
        ctx.save();
        const yTitleX =
          plotRect.left -
          tickLabelOffsetPx -
          tickLabelFontSize * 2.6 -
          axisTitleGapPx -
          axisTitleFontSize * 0.5;
        ctx.translate(yTitleX, plotRect.top + plotRect.height / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.fillText(yAxisLabel, 0, 0);
        ctx.restore();
      }
      ctx.restore();
    };

    for (const overlay of highlightOverlays) {
      drawVerticalBand(overlay.x1, overlay.x2, overlay.fill, overlay.fillOpacity);
    }
    if (isSsPlot && focusedSsOverlay) {
      drawVerticalBand(
        focusedSsOverlay.x1,
        focusedSsOverlay.x2,
        ssOverlayStyle.fill,
        ssOverlayStyle.fillOpacity,
      );
    }

    drawGridAndAxes();

    ctx.save();
    ctx.beginPath();
    ctx.rect(plotRect.left, plotRect.top, plotRect.width, plotRect.height);
    ctx.clip();

    const drawSeriesSymbols = (
      data: PlotPoint[] | null | undefined,
      color: string,
      radius: number,
      alpha = 1,
    ) => {
      if (!Array.isArray(data) || !data.length) return;
      ctx.save();
      ctx.fillStyle = color;
      ctx.globalAlpha = alpha;
      const runs = collectCanvasLineRuns({
        chartYDataKey,
        data,
        effectiveYScale,
        xMax: scale.xMax,
        xMin: scale.xMin,
      });
      for (const run of runs) {
        for (const point of run) {
          ctx.beginPath();
          ctx.arc(scale.xToPx(point.x), scale.yToPx(point.y), radius, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();
    };

    const drawSeriesLine = (
      data: PlotPoint[] | null | undefined,
      color: string,
      width: number,
      alpha = 1,
      dash: number[] = [],
    ) => {
      if (!Array.isArray(data) || data.length < 2) return;
      ctx.save();
      ctx.strokeStyle = color;
      ctx.globalAlpha = alpha;
      ctx.lineWidth = width;
      ctx.setLineDash(dash);
      const runs = collectCanvasLineRuns({
        chartYDataKey,
        data,
        effectiveYScale,
        xMax: scale.xMax,
        xMin: scale.xMin,
      });

      const strokeRun = (run: Array<{ x: number; y: number }>) => {
        if (run.length < 2) return;
        ctx.beginPath();
        run.forEach((point, index) => {
          if (index === 0) ctx.moveTo(point.x, point.y);
          else ctx.lineTo(point.x, point.y);
        });
        ctx.stroke();
      };

      for (const run of runs) {
        strokeRun(run.map((point) => ({
          x: scale.xToPx(point.x),
          y: scale.yToPx(point.y),
        })));
      }
      ctx.restore();
    };
    chartSeriesList.forEach((series, index) => {
      const isFocused = isSsPlot && focusedSeriesId && series.id === focusedSeriesId;
      const dimmed = isSsPlot && focusedSeriesId && series.id !== focusedSeriesId;
      const color = resolveSeriesChartColor(series, index);
      const alpha = dimmed ? 0.35 : 1;
      const width = Math.max(0.5, isFocused ? curveLineWidth + 0.5 : curveLineWidth);
      if (curveRenderMode === "line" || curveRenderMode === "lineSymbol") {
        drawSeriesLine(series.data, color, width, alpha);
      }
      if (curveRenderMode === "scatter" || curveRenderMode === "lineSymbol") {
        drawSeriesSymbols(series.data, color, curveRenderMode === "scatter" ? 3 : 2.6, alpha);
      }
    });
    if (isSsPlot && chartFocusedFitLine) {
      drawSeriesLine(chartFocusedFitLine, focusedSeriesColor, 2, 0.7, [6, 4]);
    }
    ctx.restore();

    for (const overlay of highlightOverlays) {
      if (!overlay.hideStartLine) {
        drawVerticalLine(
          Math.min(overlay.x1, overlay.x2),
          overlay.stroke,
          overlay.strokeOpacity,
          overlay.strokeWidth ?? 1.5,
        );
      }
      if (!overlay.hideEndLine) {
        drawVerticalLine(
          Math.max(overlay.x1, overlay.x2),
          overlay.stroke,
          overlay.strokeOpacity,
          overlay.strokeWidth ?? 1.5,
        );
      }
    }
    if (isSsPlot && focusedSsOverlay) {
      drawVerticalLine(
        Math.min(focusedSsOverlay.x1, focusedSsOverlay.x2),
        ssOverlayStyle.stroke,
        ssOverlayStyle.strokeOpacity,
        2,
      );
      drawVerticalLine(
        Math.max(focusedSsOverlay.x1, focusedSsOverlay.x2),
        ssOverlayStyle.stroke,
        ssOverlayStyle.strokeOpacity,
        2,
      );
    }
    for (const marker of currentBiasMarkers) {
      drawVerticalLine(
        marker.x,
        marker.stroke,
        marker.strokeOpacity ?? 1,
        marker.strokeWidth ?? 2,
      );
    }

    if (startedAt) {
      const durationMs = getDeviceAnalysisPerfNow() - startedAt;
      if (durationMs >= 8 || chartSeriesList.length >= 8 || chartPointCount >= 3000) {
        logDeviceAnalysisPerf("render:main-plot-canvas", {
          chartPointCount,
          durationMs,
          effectiveYScale,
          fileId: activeFile?.fileId ?? null,
          fileName: activeFile?.fileName ?? null,
          plotType: plotType ?? null,
          seriesCount: chartSeriesList.length,
        });
      }
    }
  }, [
    activeFile?.fileId,
    activeFile?.fileName,
    chartFocusedFitLine,
    chartPointCount,
    chartSeriesList,
    chartYDataKey,
    chartYTicks,
    curveLineWidth,
    curveRenderMode,
    currentBiasMarkers,
    effectiveYScale,
    editingAxisTitle,
    focusedSeriesColor,
    focusedSeriesId,
    focusedSsOverlay,
    highlightOverlays,
    isSsPlot,
    axisTitleFontSize,
    axisTitleGapPx,
    minorTickCount,
    plotRect,
    plotType,
    plotXFactor,
    plotYFactor,
    scale,
    size.height,
    size.width,
    showGrid,
    showMajorTicks,
    showMinorTicks,
    ssOverlayStyle,
    tickLabelFontSize,
    tickLabelOffsetPx,
    xAxisLabel,
    xTickDigits,
    xTicks,
    yAxisLabel,
    yAxisNearZeroEpsilon,
    yTickDigits,
  ]);

  const handleMouseMove = useCallback(
    (event: React.MouseEvent<HTMLCanvasElement>) => {
      if (!plotRect || !scale || !chartSeriesList.length) return;
      const rect = event.currentTarget.getBoundingClientRect();
      const mx = event.clientX - rect.left;
      const my = event.clientY - rect.top;
      if (
        mx < plotRect.left ||
        mx > plotRect.left + plotRect.width ||
        my < plotRect.top ||
        my > plotRect.top + plotRect.height
      ) {
        setTooltip((prev) => ({ ...prev, visible: false }));
        return;
      }

      const rawX = scale.pxToX(mx);
      if (
        !tooltipXDomain ||
        mx < scale.xToPx(tooltipXDomain[0]) - CANVAS_TOOLTIP_EDGE_BUFFER_PX ||
        mx > scale.xToPx(tooltipXDomain[1]) + CANVAS_TOOLTIP_EDGE_BUFFER_PX
      ) {
        setTooltip((prev) => ({ ...prev, visible: false }));
        return;
      }
      let lookupX = clamp(rawX, tooltipXDomain[0], tooltipXDomain[1]);
      let cursorX = mx;
      const probeX = Number(curveProbeX);
      if (
        Number.isFinite(probeX) &&
        probeX >= tooltipXDomain[0] &&
        probeX <= tooltipXDomain[1]
      ) {
        const probePx = scale.xToPx(probeX);
        if (Math.abs(mx - probePx) <= CANVAS_TOOLTIP_PROBE_SNAP_PX) {
          lookupX = probeX;
          cursorX = probePx;
        }
      }

      const entries: CanvasTooltipEntry[] = [];
      for (const { color, lookup, series } of tooltipLookups) {
        const point = interpolateCanvasTooltipPoint(lookup, lookupX);
        if (!point) continue;
        if (
          point.rawX < scale.xMin ||
          point.rawX > scale.xMax ||
          point.chartY < scale.yMin ||
          point.chartY > scale.yMax
        ) {
          continue;
        }

        entries.push({
          color,
          pointX: scale.xToPx(point.rawX),
          pointY: scale.yToPx(point.chartY),
          seriesName: decodeTooltipSeriesName(series.tooltipName ?? series.name).label,
          valueLabel: `${formatNumber(point.rawY * plotYFactor, {
            digits: yTickDigits,
          })} ${plotYUnitLabel}`,
        });
      }

      if (!entries.length) {
        setTooltip((prev) => ({ ...prev, visible: false }));
        return;
      }

      setTooltip({
        cursorX,
        entries,
        label: `x=${formatNumber(lookupX * plotXFactor, {
          digits: xTooltipDigits ?? xTickDigits,
        })} ${plotXUnitLabel}`,
        seriesName: "",
        visible: true,
        x: clamp(
          cursorX + 12,
          plotRect.left + 4,
          Math.max(plotRect.left + 4, plotRect.left + plotRect.width - 280),
        ),
        y: clamp(
          my + 12,
          plotRect.top + 4,
          Math.max(plotRect.top + 4, plotRect.top + plotRect.height - 110),
        ),
      });
    },
    [
      chartSeriesList.length,
      curveProbeX,
      plotRect,
      plotXFactor,
      plotXUnitLabel,
      plotYFactor,
      plotYUnitLabel,
      scale,
      tooltipLookups,
      tooltipXDomain,
      xTickDigits,
      xTooltipDigits,
      yTickDigits,
    ],
  );

  return (
    <div ref={wrapperRef} className="relative h-full w-full">
      <canvas
        ref={canvasRef}
        className="absolute inset-0"
        aria-label="main plot chart"
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setTooltip((prev) => ({ ...prev, visible: false }))}
      />
      {axisTitleLayout?.x && xAxisLabel ? (
        <div
          className="absolute z-[6]"
          style={{
            height: axisTitleLayout.x.height,
            left: axisTitleLayout.x.centerX - axisTitleLayout.x.width / 2,
            top: axisTitleLayout.x.centerY - axisTitleLayout.x.height / 2,
            width: axisTitleLayout.x.width,
          }}
          title={`${xAxisLabel}\n双击可编辑`}
          onDoubleClick={() => beginAxisTitleEdit("x")}
        >
          {editingAxisTitle === "x" ? (
            <Input
              ref={axisTitleInputRef}
              size="sm"
              className="h-full w-full"
              fieldClassName="!h-full !rounded-md !border-border !bg-bg-page !px-2"
              inputClassName="!text-center"
              style={{
                color: AXIS_LABEL_COLOR,
                fontFamily: AXIS_FONT_FAMILY,
                fontSize: axisTitleFontSize,
              }}
              value={editingAxisTitleDraft}
              onChange={setEditingAxisTitleDraft}
              onBlur={commitAxisTitleEdit}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  event.currentTarget.blur();
                }
                if (event.key === "Escape") {
                  event.preventDefault();
                  cancelAxisTitleEdit();
                }
              }}
            />
          ) : (
            <button
              type="button"
              aria-label={`Edit ${xAxisLabel}`}
              className="h-full w-full cursor-text border-0 bg-transparent p-0 outline-none"
            />
          )}
        </div>
      ) : null}
      {axisTitleLayout?.y && yAxisLabel ? (
        <div
          className="absolute z-[6]"
          style={{
            height: axisTitleLayout.y.height,
            left: axisTitleLayout.y.centerX - axisTitleLayout.y.width / 2,
            top: axisTitleLayout.y.centerY - axisTitleLayout.y.height / 2,
            transform: "rotate(-90deg)",
            width: axisTitleLayout.y.width,
          }}
          title={`${yAxisLabel}\n双击可编辑`}
          onDoubleClick={() => beginAxisTitleEdit("y")}
        >
          {editingAxisTitle === "y" ? (
            <Input
              ref={axisTitleInputRef}
              size="sm"
              className="h-full w-full"
              fieldClassName="!h-full !rounded-md !border-border !bg-bg-page !px-2"
              inputClassName="!text-center"
              style={{
                color: AXIS_LABEL_COLOR,
                fontFamily: AXIS_FONT_FAMILY,
                fontSize: axisTitleFontSize,
              }}
              value={editingAxisTitleDraft}
              onChange={setEditingAxisTitleDraft}
              onBlur={commitAxisTitleEdit}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  event.currentTarget.blur();
                }
                if (event.key === "Escape") {
                  event.preventDefault();
                  cancelAxisTitleEdit();
                }
              }}
            />
          ) : (
            <button
              type="button"
              aria-label={`Edit ${yAxisLabel}`}
              className="h-full w-full cursor-text border-0 bg-transparent p-0 outline-none"
            />
          )}
        </div>
      ) : null}
      {renderedLegendContent ? (
        <div className="absolute right-0 top-0 bottom-0 z-[5] flex items-center" style={{ width: legendWidth }}>
          {renderedLegendContent}
        </div>
      ) : null}
      {tooltip.visible &&
      typeof tooltip.cursorX === "number" &&
      tooltip.entries?.length &&
      plotRect ? (
        <div
          className="absolute pointer-events-none z-[3] overflow-hidden"
          style={{
            height: plotRect.height,
            left: plotRect.left,
            top: plotRect.top,
            width: plotRect.width,
          }}
        >
          <div
            className="absolute top-0 bottom-0 border-l border-dashed border-[#111827]/25"
            style={{ left: tooltip.cursorX - plotRect.left }}
          />
          {tooltip.entries.map((entry, index) => (
            <div
              key={`${entry.seriesName}-${index}`}
              className="absolute h-2.5 w-2.5 rounded-full border-2 border-white shadow"
              style={{
                backgroundColor: entry.color,
                left: entry.pointX - plotRect.left,
                top: entry.pointY - plotRect.top,
                transform: "translate(-50%, -50%)",
              }}
            />
          ))}
        </div>
      ) : null}
      <ChartInteractionOverlay
        key={`${plotType ?? "plot"}:${focusedSeriesId ?? "series"}:${currentBiasInteraction?.enabled ? "currentBias" : ssInteraction?.enabled ? "ss" : "off"}`}
        xDomain={interactiveXDomain}
        plotArea={plotRect}
        interactiveSeriesXs={interactiveSeriesXs}
        currentBiasInteraction={currentBiasInteraction}
        ssInteraction={ssInteraction}
        ssOverlayStyle={ssOverlayStyle}
      />
      {tooltip.visible ? (
        <div className="absolute z-10 pointer-events-none" style={{ left: tooltip.x, top: tooltip.y }}>
          <div
            className="bg-[#1e1e1e] border border-[#333] rounded-lg px-2 py-1.5 shadow-xl text-white"
            style={{ width: 252 }}
          >
            <div className="border-b border-white/10 pb-1 text-xs font-mono text-[#d7d7d7]">
              {tooltip.label}
            </div>
            {tooltip.entries?.map((entry, index) => (
              <div key={`${entry.seriesName}-${index}`} className="mt-1.5">
                <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-1.5 text-xs text-white">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-sm"
                    style={{ backgroundColor: entry.color }}
                  />
                  <span className="truncate font-medium">{entry.seriesName}</span>
                  <span className="font-mono text-xs text-[#ddd]">
                    {entry.valueLabel}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
});

const ChartInteractionOverlay = memo(function ChartInteractionOverlay({
  xDomain,
  plotArea,
  interactiveSeriesXs = [],
  currentBiasInteraction = null,
  ssInteraction = null,
  ssOverlayStyle,
}: {
  xDomain: [number, number];
  plotArea: PlotRect | null;
  interactiveSeriesXs?: number[];
  currentBiasInteraction?: CurrentBiasInteractionConfig | null;
  ssInteraction?: SsInteractionConfig | null;
  ssOverlayStyle: SsOverlayStyle;
}) {
  const dragStateRef = useRef<OverlayDragState | null>(null);
  const draftRef = useRef<OverlayDraftState | null>(null);
  const [draft, setDraft] = useState<OverlayDraftState | null>(null);
  const [hoverTarget, setHoverTarget] = useState<OverlayHoverTarget | null>(null);

  const interactiveMode = currentBiasInteraction?.enabled
    ? "currentBias"
    : ssInteraction?.enabled
      ? "ss"
      : null;

  const sortedDomain = useMemo(() => getSortedDomain(xDomain), [xDomain]);
  const plotRect = plotArea;

  const normalizedSnapXs = useMemo(
    () =>
      interactiveSeriesXs
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value))
        .sort((a, b) => a - b)
        .filter((value, index, arr) => index === 0 || value !== arr[index - 1]),
    [interactiveSeriesXs],
  );

  useEffect(() => {
    dragStateRef.current = null;
    draftRef.current = null;
    setDraft(null);
    setHoverTarget(null);
  }, [
    currentBiasInteraction?.enabled,
    currentBiasInteraction?.markers,
    ssInteraction?.enabled,
    ssInteraction?.range?.x1,
    ssInteraction?.range?.x2,
    interactiveMode,
  ]);

  const xToPixel = useCallback(
    (x: number): number => {
      const [domainMin, domainMax] = sortedDomain;
      if (!plotRectHasArea(plotRect) || !(domainMax > domainMin)) return 0;
      const plotWidth = plotRect.width;
      const ratio = (x - domainMin) / (domainMax - domainMin);
      return clamp(ratio, 0, 1) * plotWidth;
    },
    [plotRect, sortedDomain],
  );

  const currentBiasDisplayMarkers = useMemo(
    () =>
      draft?.kind === "currentBias"
        ? draft.markers
        : currentBiasInteraction?.markers ?? [],
    [currentBiasInteraction?.markers, draft],
  );

  const ssDisplayRange = useMemo(
    () => (draft?.kind === "ss" ? draft.range : ssInteraction?.range ?? null),
    [draft, ssInteraction?.range],
  );

  const resolveCurrentBiasHover = useCallback(
    (plotLocalX: number): CurrentBiasHoverTarget | null => {
      if (!plotRectHasArea(plotRect)) return null;
      let nearest: { role: "ion" | "ioff"; distance: number } | null = null;
      for (const marker of currentBiasDisplayMarkers) {
        if (!marker.role || !Number.isFinite(marker.x)) continue;
        const distance = Math.abs(xToPixel(marker.x) - plotLocalX);
        if (!nearest || distance < nearest.distance) {
          nearest = { role: marker.role, distance };
        }
      }
      if (!nearest || nearest.distance > CURRENT_BIAS_DRAG_TOLERANCE_PX) {
        return null;
      }
      return { kind: "currentBias", role: nearest.role };
    },
    [currentBiasDisplayMarkers, plotRect, xToPixel],
  );

  const resolveSsHover = useCallback(
    (plotLocalX: number, shiftKey: boolean): SsHoverTarget => {
      const baseRange = ssDisplayRange;
      const hasRange =
        !shiftKey &&
        isFiniteNumber(baseRange?.x1) &&
        isFiniteNumber(baseRange?.x2);
      if (!hasRange) return { kind: "ss", mode: "new" };

      const loPixel = xToPixel(
        Math.min(Number(baseRange?.x1), Number(baseRange?.x2)),
      );
      const hiPixel = xToPixel(
        Math.max(Number(baseRange?.x1), Number(baseRange?.x2)),
      );

      if (Math.abs(plotLocalX - loPixel) <= SS_HANDLE_TOLERANCE_PX) {
        return { kind: "ss", mode: "left" };
      }
      if (Math.abs(plotLocalX - hiPixel) <= SS_HANDLE_TOLERANCE_PX) {
        return { kind: "ss", mode: "right" };
      }
      if (plotLocalX >= loPixel && plotLocalX <= hiPixel) {
        return { kind: "ss", mode: "move" };
      }
      return { kind: "ss", mode: "new" };
    },
    [ssDisplayRange, xToPixel],
  );

  const deriveHoverTarget = useCallback(
    (plotLocalX: number, shiftKey: boolean): OverlayHoverTarget | null => {
      if (interactiveMode === "currentBias") {
        return resolveCurrentBiasHover(plotLocalX);
      }
      if (interactiveMode === "ss") {
        return resolveSsHover(plotLocalX, shiftKey);
      }
      return null;
    },
    [interactiveMode, resolveCurrentBiasHover, resolveSsHover],
  );

  const clientXToRawDomainX = useCallback(
    (clientX: number, element: HTMLDivElement | null): number | null => {
      if (!element || !plotRectHasArea(plotRect)) return null;
      const rect = element.getBoundingClientRect();
      const plotWidth = plotRect.width;
      const relativeX = clamp(
        clientX - rect.left,
        0,
        plotWidth,
      );
      const [domainMin, domainMax] = sortedDomain;
      if (!(domainMax > domainMin)) return null;
      return domainMin + (relativeX / plotWidth) * (domainMax - domainMin);
    },
    [plotRect, sortedDomain],
  );

  const commitAndReset = useCallback(() => {
    const drag = dragStateRef.current;
    const draftValue = draftRef.current;
    dragStateRef.current = null;
    draftRef.current = null;
    setDraft(null);
    setHoverTarget(null);

    if (!drag || !draftValue) return;

    if (
      drag.kind === "currentBias" &&
      draftValue.kind === "currentBias" &&
      typeof currentBiasInteraction?.onCommit === "function"
    ) {
      const marker = draftValue.markers.find(
        (item) => item.role === drag.activeRole,
      );
      if (marker && Number.isFinite(marker.x)) {
        currentBiasInteraction.onCommit(drag.activeRole, marker.x);
      }
      return;
    }

    if (
      drag.kind === "ss" &&
      draftValue.kind === "ss" &&
      typeof ssInteraction?.onCommit === "function"
    ) {
      const x1 = Number(draftValue.range?.x1);
      const x2 = Number(draftValue.range?.x2);
      if (Number.isFinite(x1) && Number.isFinite(x2)) {
        ssInteraction.onCommit({ x1, x2 });
      }
    }
  }, [currentBiasInteraction, ssInteraction]);

  const cancelAndReset = useCallback(() => {
    dragStateRef.current = null;
    draftRef.current = null;
    setDraft(null);
    setHoverTarget(null);
  }, []);

  useEffect(() => {
    if (!dragStateRef.current) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        cancelAndReset();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [cancelAndReset, draft !== null]);

  const handlePointerDown = useCallback(
    (event: any) => {
      if (!interactiveMode || !plotRectHasArea(plotRect)) return;

      if (interactiveMode === "currentBias") {
        const markers = currentBiasDisplayMarkers;
        if (!markers.length) return;
        const localX =
          event.clientX - event.currentTarget.getBoundingClientRect().left;
        const hover = resolveCurrentBiasHover(localX);
        if (!hover || hover.kind !== "currentBias") {
          return;
        }
        const nearest = markers.find((marker) => marker.role === hover.role);
        if (!nearest?.role) return;

        dragStateRef.current = {
          kind: "currentBias",
          pointerId: event.pointerId,
          activeRole: nearest.role,
        };
        const nextDraft = {
          kind: "currentBias",
          activeRole: nearest.role,
          markers,
        } satisfies OverlayDraftState;
        draftRef.current = nextDraft;
        setDraft(nextDraft);
        setHoverTarget({ kind: "currentBias", role: nearest.role });
        event.currentTarget.setPointerCapture(event.pointerId);
        event.preventDefault();
        return;
      }

      const localPlotX =
        event.clientX - event.currentTarget.getBoundingClientRect().left;
      const baseRange = ssInteraction?.range ?? null;
      const rawX = clientXToRawDomainX(
        event.clientX,
        event.currentTarget as HTMLDivElement,
      );
      if (rawX === null) return;
      const snappedX = findNearestSnapX(rawX, normalizedSnapXs, event.altKey);
      if (!Number.isFinite(snappedX)) return;

      const hover = resolveSsHover(localPlotX, Boolean(event.shiftKey));
      const mode = hover.mode;
      const hasRange =
        mode !== "new" &&
        isFiniteNumber(baseRange?.x1) &&
        isFiniteNumber(baseRange?.x2);

      const initialRange =
        mode === "new" || !hasRange
          ? { x1: snappedX, x2: snappedX }
          : {
              x1: Number(baseRange?.x1),
              x2: Number(baseRange?.x2),
            };

      dragStateRef.current = {
        kind: "ss",
        pointerId: event.pointerId,
        mode,
        startX: snappedX,
        startRange: hasRange
          ? {
              x1: Number(baseRange?.x1),
              x2: Number(baseRange?.x2),
            }
          : null,
      };
      const nextDraft = {
        kind: "ss",
        range: initialRange,
      } satisfies OverlayDraftState;
      draftRef.current = nextDraft;
      setDraft(nextDraft);
      setHoverTarget(hover);
      event.currentTarget.setPointerCapture(event.pointerId);
      event.preventDefault();
    },
    [
      clientXToRawDomainX,
      currentBiasDisplayMarkers,
      interactiveMode,
      normalizedSnapXs,
      plotRect,
      resolveCurrentBiasHover,
      resolveSsHover,
      ssInteraction?.range,
    ],
  );

  const handlePointerMove = useCallback(
    (event: any) => {
      const localPlotX =
        event.clientX - event.currentTarget.getBoundingClientRect().left;
      const drag = dragStateRef.current;
      if (!drag) {
        const nextHover = deriveHoverTarget(localPlotX, Boolean(event.shiftKey));
        setHoverTarget((prev) =>
          sameHoverTarget(prev, nextHover) ? prev : nextHover,
        );
        return;
      }

      const rawX = clientXToRawDomainX(
        event.clientX,
        event.currentTarget as HTMLDivElement,
      );
      if (rawX === null) return;
      const snappedX = findNearestSnapX(rawX, normalizedSnapXs, event.altKey);
      if (!Number.isFinite(snappedX)) return;

      if (drag.kind === "currentBias") {
        const markers =
          draft?.kind === "currentBias"
            ? draft.markers
            : currentBiasInteraction?.markers ?? [];
        const nextMarkers = markers.map((marker) =>
          marker.role === drag.activeRole ? { ...marker, x: snappedX } : marker,
        );
        const nextDraft = {
          kind: "currentBias",
          activeRole: drag.activeRole,
          markers: nextMarkers,
        } satisfies OverlayDraftState;
        draftRef.current = nextDraft;
        setDraft(nextDraft);
        event.preventDefault();
        return;
      }

      let nextRange: SsOverlay | null = null;
      if (drag.mode === "new") {
        nextRange = { x1: drag.startX, x2: snappedX };
      } else if (drag.mode === "left") {
        nextRange = {
          x1: snappedX,
          x2: Number(drag.startRange?.x2 ?? snappedX),
        };
      } else if (drag.mode === "right") {
        nextRange = {
          x1: Number(drag.startRange?.x1 ?? snappedX),
          x2: snappedX,
        };
      } else if (drag.mode === "move" && drag.startRange) {
        const dx = snappedX - drag.startX;
        let x1 = Number(drag.startRange.x1) + dx;
        let x2 = Number(drag.startRange.x2) + dx;
        const [domainMin, domainMax] = sortedDomain;
        const lo = Math.min(x1, x2);
        const hi = Math.max(x1, x2);
        if (lo < domainMin) {
          const delta = domainMin - lo;
          x1 += delta;
          x2 += delta;
        }
        if (hi > domainMax) {
          const delta = hi - domainMax;
          x1 -= delta;
          x2 -= delta;
        }
        nextRange = { x1, x2 };
      }

      if (nextRange) {
        const nextDraft = {
          kind: "ss",
          range: nextRange,
        } satisfies OverlayDraftState;
        draftRef.current = nextDraft;
        setDraft(nextDraft);
        event.preventDefault();
      }
    },
    [
      clientXToRawDomainX,
      currentBiasInteraction?.markers,
      deriveHoverTarget,
      draft,
      normalizedSnapXs,
      sortedDomain,
    ],
  );

  const handlePointerUp = useCallback(
    (event: any) => {
      const drag = dragStateRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {
        // Ignore capture-release errors when the browser already released it.
      }
      commitAndReset();
    },
    [commitAndReset],
  );

  const handlePointerCancel = useCallback(
    (event: any) => {
      const drag = dragStateRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {
        // Ignore capture-release errors when the browser already released it.
      }
      cancelAndReset();
    },
    [cancelAndReset],
  );

  const handlePointerLeave = useCallback(() => {
    if (dragStateRef.current) return;
    setHoverTarget(null);
  }, []);
  const isCurrentBiasDraftActive = draft?.kind === "currentBias";
  const isSsDraftActive = draft?.kind === "ss";

  const dragCursor = useMemo(() => {
    const drag = dragStateRef.current;
    if (!drag) return null;
    if (drag.kind === "currentBias") return "ew-resize";
    if (drag.mode === "move") return "grabbing";
    if (drag.mode === "new") return "crosshair";
    return "ew-resize";
  }, [draft]);

  const hoverCursor = useMemo(() => {
    if (!hoverTarget) {
      return interactiveMode === "currentBias" ? "default" : "crosshair";
    }
    if (hoverTarget.kind === "currentBias") return "ew-resize";
    if (hoverTarget.kind === "ss" && hoverTarget.mode === "move") return "grab";
    if (hoverTarget.kind === "ss" && hoverTarget.mode === "new") return "crosshair";
    return "ew-resize";
  }, [hoverTarget, interactiveMode]);

  const overlayPlotRect = plotRect;
  if (
    !interactiveMode ||
    !overlayPlotRect ||
    overlayPlotRect.width <= 0 ||
    overlayPlotRect.height <= 0
  ) {
    return null;
  }

  return (
    <div
      className="absolute"
      style={{
        left: overlayPlotRect.left,
        top: overlayPlotRect.top,
        width: overlayPlotRect.width,
        height: overlayPlotRect.height,
        zIndex: 4,
        touchAction: "none",
        cursor: dragCursor ?? hoverCursor,
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onPointerLeave={handlePointerLeave}
    >
        {currentBiasDisplayMarkers.map((marker) => {
          const isActive =
            (draft?.kind === "currentBias" &&
              draft.activeRole === marker.role) ||
            (hoverTarget?.kind === "currentBias" &&
              hoverTarget.role === marker.role);
          return (
            <Fragment key={`preview-${marker.key}`}>
              <div
                className="absolute top-0 bottom-0"
                style={{
                  left: xToPixel(marker.x),
                  width: CURRENT_BIAS_HIT_WIDTH_PX,
                  transform: "translateX(-50%)",
                  backgroundColor: isActive ? `${marker.stroke}1A` : "transparent",
                  pointerEvents: "none",
                }}
              />
              <div
                className="absolute top-0 bottom-0"
                style={{
                  left: xToPixel(marker.x),
                  borderLeft: `${marker.strokeWidth ?? 2}px ${marker.strokeDasharray ? "dashed" : "solid"} ${marker.stroke}`,
                  display: isCurrentBiasDraftActive ? "block" : "none",
                  opacity: isActive ? 1 : marker.strokeOpacity,
                  pointerEvents: "none",
                  transform: "translateX(-50%)",
                }}
              />
              <div
                className="absolute top-2"
                style={{
                  left: xToPixel(marker.x),
                  transform: "translateX(-50%)",
                  padding: "2px 8px",
                  borderRadius: 999,
                  border: `1px solid ${marker.stroke}`,
                  backgroundColor: isActive ? marker.stroke : "rgba(255,255,255,0.92)",
                  color: isActive ? "#ffffff" : marker.stroke,
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: "0.01em",
                  boxShadow: "0 2px 8px rgba(15,23,42,0.12)",
                  display: isActive ? "block" : "none",
                  pointerEvents: "none",
                  userSelect: "none",
                  whiteSpace: "nowrap",
                }}
              >
                {marker.label ?? (marker.role === "ion" ? "Ion" : "Ioff")}
              </div>
            </Fragment>
          );
        })}

        {ssDisplayRange ? (
          <>
            {isSsDraftActive ? (
              <div
                className="absolute top-0 bottom-0"
                style={{
                  left: Math.min(
                    xToPixel(ssDisplayRange.x1),
                    xToPixel(ssDisplayRange.x2),
                  ),
                  width: Math.abs(
                    xToPixel(ssDisplayRange.x2) - xToPixel(ssDisplayRange.x1),
                  ),
                  backgroundColor: ssOverlayStyle.fill,
                  opacity: ssOverlayStyle.fillOpacity,
                  pointerEvents: "none",
                }}
              />
            ) : null}
            {hoverTarget?.kind === "ss" && hoverTarget.mode === "move" ? (
              <div
                className="absolute"
                style={{
                  left: Math.min(
                    xToPixel(ssDisplayRange.x1),
                    xToPixel(ssDisplayRange.x2),
                  ),
                  top: 0,
                  width: Math.abs(
                    xToPixel(ssDisplayRange.x2) - xToPixel(ssDisplayRange.x1),
                  ),
                  height: SS_MOVE_BAND_HEIGHT_PX,
                  backgroundColor: "rgba(255,255,255,0.12)",
                  borderRadius: 8,
                  pointerEvents: "none",
                }}
              />
            ) : null}
            <div
              className="absolute top-2"
              style={{
                left:
                  (xToPixel(ssDisplayRange.x1) + xToPixel(ssDisplayRange.x2)) / 2,
                transform: "translateX(-50%)",
                padding: "2px 8px",
                borderRadius: 999,
                border: `1px solid ${ssOverlayStyle.stroke}`,
                backgroundColor:
                  hoverTarget?.kind === "ss" && hoverTarget.mode === "move"
                    ? ssOverlayStyle.stroke
                    : "rgba(255,255,255,0.92)",
                color:
                  hoverTarget?.kind === "ss" && hoverTarget.mode === "move"
                    ? "#ffffff"
                    : ssOverlayStyle.stroke,
                fontSize: 11,
                fontWeight: 700,
                boxShadow: "0 2px 8px rgba(15,23,42,0.12)",
                display:
                  hoverTarget?.kind === "ss" && hoverTarget.mode === "move"
                    ? "block"
                    : "none",
                pointerEvents: "none",
                userSelect: "none",
                whiteSpace: "nowrap",
              }}
            >
              SS window
            </div>
            {[
              { x: ssDisplayRange.x1, mode: "left" as const },
              { x: ssDisplayRange.x2, mode: "right" as const },
            ].map(({ x, mode }, index) => {
              const isActive =
                hoverTarget?.kind === "ss" && hoverTarget.mode === mode;
              return (
                <Fragment key={`ss-preview-edge-${index}`}>
                  <div
                    className="absolute top-0 bottom-0"
                    style={{
                      left: xToPixel(x),
                      borderLeft: `2px solid ${ssOverlayStyle.stroke}`,
                      display: isSsDraftActive ? "block" : "none",
                      opacity: ssOverlayStyle.strokeOpacity,
                      pointerEvents: "none",
                      transform: "translateX(-50%)",
                    }}
                  />
                  <div
                    className="absolute top-1"
                    style={{
                      left: xToPixel(x),
                      width: SS_HANDLE_WIDTH_PX,
                      height: 28,
                      transform: "translateX(-50%)",
                      borderRadius: 999,
                      border: `1px solid ${ssOverlayStyle.stroke}`,
                      backgroundColor: isActive
                        ? ssOverlayStyle.stroke
                        : "rgba(255,255,255,0.94)",
                      color: isActive ? "#ffffff" : ssOverlayStyle.stroke,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 11,
                      fontWeight: 700,
                      boxShadow: "0 2px 8px rgba(15,23,42,0.12)",
                      pointerEvents: "none",
                    }}
                  >
                    {mode === "left" ? "[" : "]"}
                  </div>
                </Fragment>
              );
            })}
          </>
        ) : interactiveMode === "ss" ? (
          <div
            className="absolute top-2 left-2"
            style={{
              padding: "2px 8px",
              borderRadius: 999,
              backgroundColor: "rgba(255,255,255,0.9)",
              color: ssOverlayStyle.stroke,
              border: `1px solid ${ssOverlayStyle.stroke}`,
              fontSize: 11,
              fontWeight: 700,
              pointerEvents: "none",
              userSelect: "none",
            }}
          >
            Drag to create SS window
          </div>
        ) : null}

        {hoverTarget?.kind === "ss" && hoverTarget.mode === "new" ? (
          <div
            className="absolute inset-0"
            style={{
              outline: "1px dashed rgba(15,23,42,0.14)",
              outlineOffset: -1,
              pointerEvents: "none",
            }}
          />
        ) : null}
    </div>
  );
});

const MainPlotChart = memo(function MainPlotChart({
  plotType,
  curveLineWidth = 2,
  curvePlotType = 202,
  activeFile,
  seriesList,
  xDomain,
  xTicks,
  plotXFactor,
  plotXUnitLabel,
  xTickDigits,
  xTooltipDigits,
  curveProbeX,
  effectiveYScale,
  yDomain,
  yTicks,
  yLogCurrentMode = "all",
  yScaleMode,
  plotYFactor,
  plotYUnitLabel,
  focusedSeriesId,
  focusedFitLine,
  focusedSeriesColor = getChartColor(0),
  highlightOverlays = [],
  currentBiasMarkers = [],
  focusedSsOverlay,
  ssOverlayStyle,
  interactiveSeriesXs = [],
  currentBiasInteraction = null,
  ssInteraction = null,
  showGrid = true,
  showMajorTicks = true,
  showMinorTicks = true,
  minorTickCount = 1,
  tickLabelFontSize = DEFAULT_TICK_LABEL_FONT_SIZE,
  axisTitleFontSize = DEFAULT_AXIS_TITLE_FONT_SIZE,
  originTickLabelOffset,
  originAxisTitleGap,
  legendWidth = 120,
  legendContent = undefined,
  xAxisLabelOverride,
  yAxisLabelOverride,
  onXAxisLabelChange,
  onYAxisLabelChange,
}: MainPlotChartProps) {
  const renderStartedAt = isDeviceAnalysisPerfEnabled()
    ? getDeviceAnalysisPerfNow()
    : 0;
  const tickLabelOffsetPx = useMemo(() => {
    const axisTickLength = showMajorTicks
      ? MAJOR_TICK_LENGTH_PX
      : showMinorTicks
        ? MINOR_TICK_LENGTH_PX
        : 0;
    const baseOffset = axisTickLength > 0 ? axisTickLength + 4 : 8;
    const originOffset = normalizeAxisSpacingValue(originTickLabelOffset);
    if (originOffset === null) return baseOffset;
    return Math.max(
      0,
      baseOffset +
        (originOffset / 100) *
          tickLabelFontSize *
          PREVIEW_TICK_LABEL_OFFSET_SCALE,
    );
  }, [originTickLabelOffset, showMajorTicks, showMinorTicks, tickLabelFontSize]);
  const axisTitleGapPx = useMemo(() => {
    const originGap = normalizeAxisSpacingValue(originAxisTitleGap);
    if (originGap === null) return DEFAULT_AXIS_TITLE_GAP_PX;
    return Math.max(
      0,
      (originGap / 100) * axisTitleFontSize * PREVIEW_AXIS_TITLE_GAP_SCALE,
    );
  }, [axisTitleFontSize, originAxisTitleGap]);
  const chartMargin = useMemo(
    () => ({
      ...DEFAULT_CHART_MARGIN,
      left: Math.max(
        DEFAULT_CHART_MARGIN.left,
        Math.ceil(
          AXIS_TITLE_EDGE_PADDING_PX +
            axisTitleFontSize +
            tickLabelFontSize * 3.2,
        ),
      ),
      bottom: Math.max(
        DEFAULT_CHART_MARGIN.bottom,
        Math.ceil(
          AXIS_TITLE_EDGE_PADDING_PX +
            axisTitleFontSize +
            tickLabelFontSize * 1.35,
        ),
      ),
    }),
    [axisTitleFontSize, tickLabelFontSize],
  );
  const normalizedCurveLineWidth = useMemo(() => {
    const value = Number(curveLineWidth);
    if (!Number.isFinite(value) || value <= 0) return 2;
    return Math.min(20, Math.max(0.5, value));
  }, [curveLineWidth]);
  const curveRenderMode = useMemo<CurveRenderMode>(() => {
    if (Number(curvePlotType) === 201) return "scatter";
    if (Number(curvePlotType) === 202) return "lineSymbol";
    return "line";
  }, [curvePlotType]);
  const plotYKey = useMemo<PlotYKey>(() => {
    if (yScaleMode === "logAbs") return "yAbsPositive";
    if (yScaleMode === "log") {
      return yLogCurrentMode === "positive" ? "yPositive" : SIGNED_LOG_Y_DATA_KEY;
    }
    return "y";
  }, [yLogCurrentMode, yScaleMode]);

  const chartYDataKey = useMemo(
    () => (effectiveYScale === "linear" ? plotYKey : LOG_CHART_Y_DATA_KEY),
    [effectiveYScale, plotYKey],
  );

  const chartSeriesList = useMemo<PlotSeries[]>(() => {
    if (effectiveYScale === "linear") return seriesList;
    return getCachedLogChartSeriesList(seriesList, plotYKey);
  }, [effectiveYScale, plotYKey, seriesList]);
  const chartPointCount = useMemo(
    () =>
      chartSeriesList.reduce(
        (sum, series) => sum + (Array.isArray(series?.data) ? series.data.length : 0),
        0,
      ),
    [chartSeriesList],
  );

  useEffect(() => {
    if (!renderStartedAt) return;
    const durationMs = getDeviceAnalysisPerfNow() - renderStartedAt;
    if (durationMs < 12 && chartSeriesList.length < 8 && chartPointCount < 3000) {
      return;
    }
    logDeviceAnalysisPerf("render:main-plot-commit", {
      chartPointCount,
      durationMs,
      effectiveYScale,
      fileId: activeFile?.fileId ?? null,
      fileName: activeFile?.fileName ?? null,
      plotType: plotType ?? null,
      seriesCount: chartSeriesList.length,
    });
  });

  const chartFocusedFitLine = useMemo<PlotPoint[] | null>(() => {
    if (!Array.isArray(focusedFitLine)) return null;
    if (effectiveYScale === "linear") return focusedFitLine;
    return focusedFitLine.map((point) => ({
      ...point,
      [LOG_CHART_Y_DATA_KEY]: toLogChartValue(point?.y),
    }));
  }, [effectiveYScale, focusedFitLine]);

  const chartYTicks = useMemo<number[] | null>(() => {
    if (effectiveYScale === "linear") return Array.isArray(yTicks) ? yTicks : null;
    if (!Array.isArray(yTicks)) return null;
    const nextTicks = yTicks
      .map((tick) => toLogChartValue(tick))
      .filter((tick): tick is number => tick !== null);
    return nextTicks.length >= 2 ? nextTicks : null;
  }, [effectiveYScale, yTicks]);

  const chartYDomain = useMemo<[number, number]>(() => {
    if (effectiveYScale === "linear") {
      if (Array.isArray(yTicks) && yTicks.length >= 2) {
        const tickMin = Number(yTicks[0]);
        const tickMax = Number(yTicks[yTicks.length - 1]);
        if (Number.isFinite(tickMin) && Number.isFinite(tickMax)) {
          return [tickMin, tickMax];
        }
      }
      return yDomain;
    }

    const lo = Math.min(Number(yDomain?.[0]), Number(yDomain?.[1]));
    const hi = Math.max(Number(yDomain?.[0]), Number(yDomain?.[1]));
    const logLo = toLogChartValue(lo);
    const logHi = toLogChartValue(hi);
    if (logLo === null || logHi === null) return [0, 1];
    return [logLo, logHi];
  }, [effectiveYScale, yDomain]);

  const yTickDigits = useMemo(() => {
    if (effectiveYScale !== "linear") return 4;
    const scaledTicks = Array.isArray(chartYTicks)
      ? chartYTicks.map((v) => v * plotYFactor)
      : null;
    return inferTickDigitsFromTicks(scaledTicks);
  }, [chartYTicks, effectiveYScale, plotYFactor]);

  const yAxisNearZeroEpsilon = useMemo(() => {
    if (effectiveYScale !== "linear") return 0;
    const scaledTickStep =
      Array.isArray(yTicks) && yTicks.length >= 2
        ? Math.abs((Number(yTicks[1]) - Number(yTicks[0])) * plotYFactor)
        : 0;
    if (!Number.isFinite(scaledTickStep) || scaledTickStep <= 0) return 1e-18;
    // Keep only tiny floating-point residue around axis zero; do not alter meaningful small ticks.
    return Math.max(1e-18, scaledTickStep * 1e-9);
  }, [effectiveYScale, plotYFactor, yTicks]);

  const isSsPlot = plotType === "ss";

  const defaultYAxisLabel = useMemo(
    () =>
      isSsPlot
        ? withYAxisUnit("|Id|", plotYUnitLabel)
        : withYAxisUnit(activeFile?.yLabel, plotYUnitLabel),
    [activeFile?.yLabel, isSsPlot, plotYUnitLabel],
  );
  const defaultXAxisLabel = useMemo(
    () => withYAxisUnit(activeFile?.xLabel, plotXUnitLabel),
    [activeFile?.xLabel, plotXUnitLabel],
  );
  const xAxisLabel = useMemo(() => {
    const override = String(xAxisLabelOverride ?? "").trim();
    if (override) return withYAxisUnit(override, plotXUnitLabel);
    return defaultXAxisLabel;
  }, [defaultXAxisLabel, plotXUnitLabel, xAxisLabelOverride]);
  const yAxisLabel = useMemo(() => {
    const override = String(yAxisLabelOverride ?? "").trim();
    if (override) return withYAxisUnit(override, plotYUnitLabel);
    return defaultYAxisLabel;
  }, [defaultYAxisLabel, plotYUnitLabel, yAxisLabelOverride]);

  const interactiveXDomain = useMemo<[number, number]>(() => xDomain, [xDomain]);

  return (
    <CanvasMainPlotChart
      activeFile={activeFile}
      chartFocusedFitLine={chartFocusedFitLine}
      chartPointCount={chartPointCount}
      chartSeriesList={chartSeriesList}
      chartYDataKey={chartYDataKey}
      chartYDomain={chartYDomain}
      chartYTicks={chartYTicks}
      curveLineWidth={normalizedCurveLineWidth}
      curveRenderMode={curveRenderMode}
      currentBiasMarkers={currentBiasMarkers}
      currentBiasInteraction={currentBiasInteraction}
      effectiveYScale={effectiveYScale}
      focusedSeriesColor={focusedSeriesColor}
      focusedSeriesId={focusedSeriesId}
      focusedSsOverlay={focusedSsOverlay}
      highlightOverlays={highlightOverlays}
      interactiveSeriesXs={interactiveSeriesXs}
      interactiveXDomain={interactiveXDomain}
      isSsPlot={isSsPlot}
      legendContent={legendContent}
      legendWidth={legendWidth}
      chartMargin={chartMargin}
      curveProbeX={curveProbeX}
      plotType={plotType}
      plotXFactor={plotXFactor}
      plotXUnitLabel={plotXUnitLabel}
      plotYFactor={plotYFactor}
      plotYKey={plotYKey}
      plotYUnitLabel={plotYUnitLabel}
      showGrid={showGrid}
      showMajorTicks={showMajorTicks}
      showMinorTicks={showMinorTicks}
      minorTickCount={normalizeMinorTickCount(minorTickCount)}
      ssInteraction={ssInteraction}
      ssOverlayStyle={ssOverlayStyle}
      tickLabelFontSize={tickLabelFontSize}
      tickLabelOffsetPx={tickLabelOffsetPx}
      xAxisLabel={xAxisLabel}
      xAxisEditableLabel={stripAxisUnitSuffix(xAxisLabel)}
      onXAxisLabelChange={onXAxisLabelChange}
      xTickDigits={xTickDigits}
      xTicks={xTicks}
      xTooltipDigits={xTooltipDigits}
      axisTitleFontSize={axisTitleFontSize}
      axisTitleGapPx={axisTitleGapPx}
      yAxisLabel={yAxisLabel}
      yAxisEditableLabel={stripAxisUnitSuffix(yAxisLabel)}
      onYAxisLabelChange={onYAxisLabelChange}
      yAxisNearZeroEpsilon={yAxisNearZeroEpsilon}
      yTickDigits={yTickDigits}
    />
  );
});

MainPlotChart.displayName = "MainPlotChart";

export default MainPlotChart;
