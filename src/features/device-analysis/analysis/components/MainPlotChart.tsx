import {
  Fragment,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  CartesianGrid,
  Customized,
  Legend,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  usePlotArea,
} from "recharts";
import { formatNumber } from "../lib/analysisMath";
import { COLORS } from "../lib/chartColors";
import {
  computeLabelInterval,
  inferTickDigitsFromTicks,
} from "../lib/analysisChartsUtils";
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
  xLabelInterval: number;
  effectiveYScale: "linear" | "log" | "logAbs";
  yDomain: [number, number];
  yTicks?: number[] | null;
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
  legendWidth?: number;
  legendContent?: any;
};

type CanvasTooltipState = {
  color?: string;
  label: string;
  pointX?: number;
  pointY?: number;
  seriesName: string;
  visible: boolean;
  x: number;
  y: number;
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

const LOG_CHART_Y_DATA_KEY = "__chartY";
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

const toLogChartValue = (value: unknown): number | null => {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return null;
  return Math.log10(num);
};

const getCachedLogChartSeriesData = (
  data: PlotPoint[],
  plotYKey: "y" | "yPositive" | "yAbsPositive",
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
  }));
  cacheBucket.set(plotYKey, computed);
  return computed;
};

const getCachedLogChartSeriesList = (
  seriesList: PlotSeries[],
  plotYKey: "y" | "yPositive" | "yAbsPositive",
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

const CHART_MARGIN = { top: 25, right: 15, left: 45, bottom: 28 } as const;
const CURRENT_BIAS_DRAG_TOLERANCE_PX = 22;
const CURRENT_BIAS_HIT_WIDTH_PX = 28;
const SS_HANDLE_TOLERANCE_PX = 14;
const SS_HANDLE_WIDTH_PX = 18;
const SS_MOVE_BAND_HEIGHT_PX = 24;

type PlotRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

type ChartPlotArea = {
  x: number;
  y: number;
  width: number;
  height: number;
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

const normalizePlotArea = (
  plotArea: ChartPlotArea | null | undefined,
): PlotRect | null => {
  const left = Number(plotArea?.x);
  const top = Number(plotArea?.y);
  const width = Number(plotArea?.width);
  const height = Number(plotArea?.height);
  if (
    !Number.isFinite(left) ||
    !Number.isFinite(top) ||
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  ) {
    return null;
  }
  return { left, top, width, height };
};

const samePlotRect = (a: PlotRect | null, b: PlotRect | null): boolean => {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.left === b.left &&
    a.top === b.top &&
    a.width === b.width &&
    a.height === b.height
  );
};

const plotRectHasArea = (plotRect: PlotRect | null): plotRect is PlotRect =>
  Boolean(plotRect && plotRect.width > 0 && plotRect.height > 0);

const isCanvasMainPlotEnabled = (): boolean => {
  if (typeof window === "undefined") return false;
  if ((window as any).__CONDUCTOR_DA_CANVAS_MAIN_PLOT__ === false) return false;
  if ((window as any).__CONDUCTOR_DA_CANVAS_MAIN_PLOT__ === true) return true;
  try {
    const stored = window.localStorage?.getItem("CONDUCTOR_DA_CANVAS_MAIN_PLOT");
    if (stored === "0") return false;
    if (stored === "1") return true;
  } catch {
    // Keep the optimized default when storage is unavailable.
  }
  return true;
};

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
  plotYKey: "y" | "yPositive" | "yAbsPositive",
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
    const rawY = toFiniteCanvasNumber(point?.[plotYKey]);
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
  plotType,
  plotXFactor,
  plotXUnitLabel,
  plotYFactor,
  plotYKey,
  plotYUnitLabel,
  ssInteraction,
  ssOverlayStyle,
  xAxisLabel,
  xTickDigits,
  xTicks,
  xTooltipDigits,
  yAxisLabel,
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
  plotType?: string;
  plotXFactor: number;
  plotXUnitLabel: string;
  plotYFactor: number;
  plotYKey: "y" | "yPositive" | "yAbsPositive";
  plotYUnitLabel: string;
  ssInteraction?: SsInteractionConfig | null;
  ssOverlayStyle: SsOverlayStyle;
  xAxisLabel: string;
  xTickDigits: number;
  xTicks?: number[] | null;
  xTooltipDigits?: number;
  yAxisLabel: string;
  yAxisNearZeroEpsilon: number;
  yTickDigits: number;
}) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [size, setSize] = useState({ height: 0, width: 0 });
  const [tooltip, setTooltip] = useState<CanvasTooltipState>({
    label: "",
    seriesName: "",
    visible: false,
    x: 0,
    y: 0,
  });

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
    const plotWidth = width - CHART_MARGIN.left - CHART_MARGIN.right;
    const plotHeight = size.height - CHART_MARGIN.top - CHART_MARGIN.bottom;
    if (plotWidth <= 0 || plotHeight <= 0) return null;
    return {
      left: CHART_MARGIN.left,
      top: CHART_MARGIN.top,
      width: plotWidth,
      height: plotHeight,
    };
  }, [legendWidth, size.height, size.width]);

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

  const tooltipLookups = useMemo(
    () =>
      chartSeriesList.map((series, index) => ({
        color: String(series.color || COLORS[index % COLORS.length] || "#8884d8"),
        lookup: getCanvasTooltipLookup(series.data ?? [], chartYDataKey, plotYKey),
        series,
      })),
    [chartSeriesList, chartYDataKey, plotYKey],
  );

  const renderedLegendContent = useMemo(
    () =>
      typeof legendContent === "function"
        ? legendContent({})
        : legendContent,
    [legendContent],
  );

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

    const visibleXTicks = Array.isArray(xTicks) && xTicks.length >= 2
      ? xTicks
      : [scale.xMin, (scale.xMin + scale.xMax) / 2, scale.xMax];
    const visibleYTicks = Array.isArray(chartYTicks) && chartYTicks.length >= 2
      ? chartYTicks
      : [scale.yMin, (scale.yMin + scale.yMax) / 2, scale.yMax];

    const drawGridAndAxes = () => {
      ctx.save();
      ctx.strokeStyle = "rgba(51,51,51,0.45)";
      ctx.lineWidth = 1;
      ctx.strokeRect(plotRect.left, plotRect.top, plotRect.width, plotRect.height);
      ctx.font = "11px sans-serif";
      for (const tick of visibleXTicks) {
        const x = scale.xToPx(tick);
        ctx.strokeStyle = "rgba(51,51,51,0.25)";
        ctx.beginPath();
        ctx.moveTo(x, plotRect.top);
        ctx.lineTo(x, plotRect.top + plotRect.height);
        ctx.stroke();
        ctx.fillStyle = "rgba(120,120,120,0.92)";
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillText(
          formatNumber(tick * plotXFactor, { digits: xTickDigits }),
          x,
          plotRect.top + plotRect.height + 6,
        );
      }
      for (const tick of visibleYTicks) {
        const y = scale.yToPx(tick);
        ctx.strokeStyle = "rgba(51,51,51,0.25)";
        ctx.beginPath();
        ctx.moveTo(plotRect.left, y);
        ctx.lineTo(plotRect.left + plotRect.width, y);
        ctx.stroke();
        const label = effectiveYScale !== "linear"
          ? formatLogTickLabel(Math.pow(10, tick) * plotYFactor)
          : formatNumber(
              Math.abs(tick * plotYFactor) <= yAxisNearZeroEpsilon
                ? 0
                : tick * plotYFactor,
              { digits: yTickDigits },
            );
        ctx.fillStyle = "rgba(120,120,120,0.92)";
        ctx.textAlign = "right";
        ctx.textBaseline = "middle";
        ctx.fillText(label, plotRect.left - 8, y);
      }
      ctx.fillStyle = "rgba(80,80,80,0.95)";
      ctx.font = "16px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      if (xAxisLabel) {
        ctx.fillText(xAxisLabel, plotRect.left + plotRect.width / 2, size.height - 2);
      }
      if (yAxisLabel) {
        ctx.save();
        ctx.translate(13, plotRect.top + plotRect.height / 2);
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

    const drawSeries = (
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
      drawSeries(
        series.data,
        String(series.color || COLORS[index % COLORS.length] || "#8884d8"),
        isFocused ? 2.5 : 2,
        dimmed ? 0.35 : 1,
      );
    });
    if (isSsPlot && chartFocusedFitLine) {
      drawSeries(chartFocusedFitLine, focusedSeriesColor, 2, 0.7, [6, 4]);
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
    currentBiasMarkers,
    effectiveYScale,
    focusedSeriesColor,
    focusedSeriesId,
    focusedSsOverlay,
    highlightOverlays,
    isSsPlot,
    plotRect,
    plotType,
    plotXFactor,
    plotYFactor,
    scale,
    size.height,
    size.width,
    ssOverlayStyle,
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
      let best:
        | {
            color: string;
            distance: number;
            label: string;
            pointX: number;
            pointY: number;
            seriesName: string;
          }
        | null = null;
      for (const { color, lookup, series } of tooltipLookups) {
        const point = getNearestCanvasTooltipPoint(lookup, rawX);
        if (!point) continue;
        if (
          point.rawX < scale.xMin ||
          point.rawX > scale.xMax ||
          point.chartY < scale.yMin ||
          point.chartY > scale.yMax
        ) {
          continue;
        }
        const distance = Math.abs(point.rawX - rawX);
        if (best && distance >= best.distance) continue;
        best = {
          color,
          distance,
          label: `#${point.index + 1}  x=${formatNumber(point.rawX * plotXFactor, {
              digits: xTooltipDigits ?? xTickDigits,
            })} ${plotXUnitLabel}  y=${formatNumber(point.rawY * plotYFactor, {
            digits: yTickDigits,
          })} ${plotYUnitLabel}`,
          pointX: scale.xToPx(point.rawX),
          pointY: scale.yToPx(point.chartY),
          seriesName: decodeTooltipSeriesName(series.tooltipName ?? series.name).label,
        };
      }
      if (!best) {
        setTooltip((prev) => ({ ...prev, visible: false }));
        return;
      }
      setTooltip({
        color: best.color,
        label: best.label,
        pointX: best.pointX,
        pointY: best.pointY,
        seriesName: best.seriesName,
        visible: true,
        x: clamp(mx + 12, 8, Math.max(8, size.width - 240)),
        y: clamp(my + 12, 8, Math.max(8, size.height - 78)),
      });
    },
    [
      plotRect,
      plotXFactor,
      plotXUnitLabel,
      plotYFactor,
      plotYUnitLabel,
      scale,
      size.height,
      size.width,
      tooltipLookups,
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
      {renderedLegendContent ? (
        <div className="absolute right-0 top-0 bottom-0 z-[5] flex items-center" style={{ width: legendWidth }}>
          {renderedLegendContent}
        </div>
      ) : null}
      {tooltip.visible &&
      typeof tooltip.pointX === "number" &&
      typeof tooltip.pointY === "number" &&
      plotRect ? (
        <div className="absolute inset-0 pointer-events-none z-[3]">
          <div
            className="absolute top-0 bottom-0 border-l border-dashed border-[#111827]/25"
            style={{ left: tooltip.pointX }}
          />
          <div
            className="absolute left-0 right-0 border-t border-dashed border-[#111827]/18"
            style={{ top: tooltip.pointY }}
          />
          <div
            className="absolute h-2.5 w-2.5 rounded-full border-2 border-white shadow"
            style={{
              backgroundColor: tooltip.color ?? "#111827",
              left: tooltip.pointX,
              top: tooltip.pointY,
              transform: "translate(-50%, -50%)",
            }}
          />
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
          <div className="bg-[#1e1e1e] border border-[#333] rounded-lg px-2 py-1.5 shadow-xl text-white">
            <div className="text-xs text-white font-medium truncate max-w-[220px]">
              {tooltip.seriesName}
            </div>
            <div className="text-[11px] text-[#ccc] font-mono mt-1 whitespace-nowrap">
              {tooltip.label}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
});

const ChartPlotAreaReporter = memo(function ChartPlotAreaReporter({
  onChange,
}: {
  onChange: (plotRect: PlotRect | null) => void;
}) {
  const plotArea = usePlotArea() as ChartPlotArea | undefined;
  const normalizedPlotRect = useMemo(
    () => normalizePlotArea(plotArea ?? null),
    [plotArea?.height, plotArea?.width, plotArea?.x, plotArea?.y],
  );

  useEffect(() => {
    onChange(normalizedPlotRect);
  }, [
    normalizedPlotRect?.height,
    normalizedPlotRect?.left,
    normalizedPlotRect?.top,
    normalizedPlotRect?.width,
    onChange,
  ]);

  return null;
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
  activeFile,
  seriesList,
  xDomain,
  xTicks,
  plotXFactor,
  plotXUnitLabel,
  xTickDigits,
  xTooltipDigits,
  xLabelInterval,
  effectiveYScale,
  yDomain,
  yTicks,
  yScaleMode,
  plotYFactor,
  plotYUnitLabel,
  focusedSeriesId,
  focusedFitLine,
  focusedSeriesColor = "#8884d8",
  highlightOverlays = [],
  currentBiasMarkers = [],
  focusedSsOverlay,
  ssOverlayStyle,
  interactiveSeriesXs = [],
  currentBiasInteraction = null,
  ssInteraction = null,
  legendWidth = 120,
  legendContent = undefined,
}: MainPlotChartProps) {
  const renderStartedAt = isDeviceAnalysisPerfEnabled()
    ? getDeviceAnalysisPerfNow()
    : 0;
  const [chartPlotArea, setChartPlotArea] = useState<PlotRect | null>(null);
  const plotYKey = useMemo<"y" | "yPositive" | "yAbsPositive">(() => {
    if (yScaleMode === "logAbs") return "yAbsPositive";
    if (yScaleMode === "log") return "yPositive";
    return "y";
  }, [yScaleMode]);

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

  const tooltipSeriesOrder = useMemo(() => {
    const order = new Map<string, number>();
    chartSeriesList.forEach((series, index) => {
      order.set(String(series?.tooltipName ?? series?.name ?? ""), index);
    });
    return order;
  }, [chartSeriesList]);

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
      return yTicks ? [yTicks[0], yTicks[yTicks.length - 1]] : yDomain;
    }

    if (Array.isArray(chartYTicks) && chartYTicks.length >= 2) {
      return [chartYTicks[0], chartYTicks[chartYTicks.length - 1]];
    }

    const lo = Math.min(Number(yDomain?.[0]), Number(yDomain?.[1]));
    const hi = Math.max(Number(yDomain?.[0]), Number(yDomain?.[1]));
    const logLo = toLogChartValue(lo);
    const logHi = toLogChartValue(hi);
    if (logLo === null || logHi === null) return [0, 1];
    return [logLo, logHi];
  }, [chartYTicks, effectiveYScale, yDomain, yTicks]);

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

  const yLabelInterval = useMemo(
    () =>
      effectiveYScale === "linear"
        ? computeLabelInterval(yTicks, 7)
        : computeLabelInterval(chartYTicks, 7),
    [chartYTicks, effectiveYScale, yTicks],
  );

  const isSsPlot = plotType === "ss";

  const yAxisLabel = useMemo(
    () =>
      isSsPlot
        ? withYAxisUnit("|Id|", plotYUnitLabel)
        : withYAxisUnit(activeFile?.yLabel, plotYUnitLabel),
    [activeFile?.yLabel, isSsPlot, plotYUnitLabel],
  );
  const xAxisLabel = useMemo(
    () => withYAxisUnit(activeFile?.xLabel, plotXUnitLabel),
    [activeFile?.xLabel, plotXUnitLabel],
  );

  const interactiveXDomain = useMemo<[number, number]>(
    () =>
      xTicks && xTicks.length >= 2
        ? [Number(xTicks[0]), Number(xTicks[xTicks.length - 1])]
        : xDomain,
    [xDomain, xTicks],
  );

  const handlePlotAreaChange = useCallback((nextPlotRect: PlotRect | null) => {
    setChartPlotArea((previousPlotRect) =>
      samePlotRect(previousPlotRect, nextPlotRect)
        ? previousPlotRect
        : nextPlotRect,
    );
  }, []);

  const shouldUseCanvasMainPlot = isCanvasMainPlotEnabled();

  if (shouldUseCanvasMainPlot) {
    return (
      <CanvasMainPlotChart
        activeFile={activeFile}
        chartFocusedFitLine={chartFocusedFitLine}
        chartPointCount={chartPointCount}
        chartSeriesList={chartSeriesList}
        chartYDataKey={chartYDataKey}
        chartYDomain={chartYDomain}
        chartYTicks={chartYTicks}
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
        plotType={plotType}
        plotXFactor={plotXFactor}
        plotXUnitLabel={plotXUnitLabel}
        plotYFactor={plotYFactor}
        plotYKey={plotYKey}
        plotYUnitLabel={plotYUnitLabel}
        ssInteraction={ssInteraction}
        ssOverlayStyle={ssOverlayStyle}
        xAxisLabel={xAxisLabel}
        xTickDigits={xTickDigits}
        xTicks={xTicks}
        xTooltipDigits={xTooltipDigits}
        yAxisLabel={yAxisLabel}
        yAxisNearZeroEpsilon={yAxisNearZeroEpsilon}
        yTickDigits={yTickDigits}
      />
    );
  }

  return (
    <div className="relative h-full w-full">
      <ResponsiveContainer
        width="100%"
        height="100%"
        minWidth={1}
        minHeight={1}
        className="!outline-none"
      >
        <LineChart
          data={[]}
          margin={CHART_MARGIN}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#333" opacity={0.2} />
          <XAxis
            dataKey="x"
            type="number"
            domain={interactiveXDomain}
            ticks={xTicks ?? undefined}
            interval={xLabelInterval}
            label={
              xAxisLabel
                ? {
                    value: xAxisLabel,
                    position: "insideBottom",
                    offset: -15,
                    fill: "currentColor",
                    opacity: 0.9,
                    fontSize: 16,
                    fontWeight: 500,
                  }
                : undefined
            }
            tickFormatter={(v) => formatNumber(Number(v) * plotXFactor, { digits: xTickDigits })}
            stroke="currentColor"
            className="text-text-secondary text-xs"
            tick={{ fill: "currentColor", opacity: 0.6 }}
            allowDataOverflow
          />
          <YAxis
            label={
              yAxisLabel
                ? {
                    value: yAxisLabel,
                    angle: -90,
                    position: "insideLeft",
                    offset: -15,
                    style: { textAnchor: "middle" },
                    fill: "currentColor",
                    opacity: 0.9,
                    fontSize: 16,
                    fontWeight: 500,
                  }
                : undefined
            }
            type="number"
            scale="linear"
            domain={chartYDomain}
            ticks={chartYTicks ?? undefined}
            interval={yLabelInterval}
            tickFormatter={(v) => {
              if (effectiveYScale !== "linear") {
                const raw = Number.isFinite(Number(v)) ? Math.pow(10, Number(v)) : Number.NaN;
                return formatLogTickLabel(raw * plotYFactor);
              }
              const scaled = Number(v) * plotYFactor;
              const normalized =
                Math.abs(scaled) <= yAxisNearZeroEpsilon ? 0 : scaled;
              return formatNumber(normalized, { digits: yTickDigits });
            }}
            stroke="currentColor"
            className="text-text-secondary text-xs"
            tick={{ fill: "currentColor", opacity: 0.6 }}
            allowDataOverflow
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "#1e1e1e",
              borderColor: "#333",
              color: "#fff",
            }}
            itemStyle={{ color: "#ccc" }}
            labelFormatter={(label) =>
              `x=${formatNumber(Number(label) * plotXFactor, {
                digits: xTooltipDigits ?? xTickDigits,
              })} ${plotXUnitLabel}`
            }
            itemSorter={(entry: any) =>
              tooltipSeriesOrder.get(String(entry?.name ?? "")) ?? Number.MAX_SAFE_INTEGER
            }
            formatter={(value, name, item: any) => {
              const rawFromPrimary = toFiniteCanvasNumber(item?.payload?.[plotYKey]);
              const rawFromY = toFiniteCanvasNumber(item?.payload?.y);
              const strictValue = toFiniteCanvasNumber(value);
              const rawFromValue =
                effectiveYScale === "linear"
                  ? strictValue
                  : strictValue !== null
                    ? Math.pow(10, strictValue)
                    : null;
              const num = rawFromPrimary !== null
                ? rawFromPrimary
                : rawFromY !== null
                  ? rawFromY
                  : rawFromValue;
              const decodedName = decodeTooltipSeriesName(name);
              return [
                num !== null
                  ? `${formatNumber(num * plotYFactor, { digits: yTickDigits })} ${plotYUnitLabel}`
                  : `- ${plotYUnitLabel}`,
                decodedName.label,
              ];
            }}
          />
          <Customized
            component={<ChartPlotAreaReporter onChange={handlePlotAreaChange} />}
          />

          {highlightOverlays.map((overlay) => (<Fragment key={overlay.key}>
              <ReferenceArea
                x1={Math.min(overlay.x1, overlay.x2)}
                x2={Math.max(overlay.x1, overlay.x2)}
                fill={overlay.fill}
                fillOpacity={overlay.fillOpacity}
                ifOverflow="hidden"
              />
              {!overlay.hideStartLine ? (
                <ReferenceLine
                  x={Math.min(overlay.x1, overlay.x2)}
                  stroke={overlay.stroke}
                  strokeOpacity={overlay.strokeOpacity}
                  strokeWidth={overlay.strokeWidth ?? 1.5}
                  strokeDasharray={overlay.strokeDasharray}
                  ifOverflow="hidden"
                />
              ) : null}
              {!overlay.hideEndLine ? (
                <ReferenceLine
                  x={Math.max(overlay.x1, overlay.x2)}
                  stroke={overlay.stroke}
                  strokeOpacity={overlay.strokeOpacity}
                  strokeWidth={overlay.strokeWidth ?? 1.5}
                  strokeDasharray={overlay.strokeDasharray}
                  ifOverflow="hidden"
                />
              ) : null}
            </Fragment>))}

          {currentBiasMarkers.map((marker) => (
            <ReferenceLine
              key={marker.key}
              x={marker.x}
              stroke={marker.stroke}
              strokeOpacity={marker.strokeOpacity}
              strokeWidth={marker.strokeWidth ?? 2}
              strokeDasharray={marker.strokeDasharray}
              ifOverflow="hidden"
            />
          ))}

          {isSsPlot && focusedSsOverlay ? (
            <>
              <ReferenceArea
                x1={Math.min(focusedSsOverlay.x1, focusedSsOverlay.x2)}
                x2={Math.max(focusedSsOverlay.x1, focusedSsOverlay.x2)}
                fill={ssOverlayStyle.fill}
                fillOpacity={ssOverlayStyle.fillOpacity}
                ifOverflow="hidden"
              />
              <ReferenceLine
                x={Math.min(focusedSsOverlay.x1, focusedSsOverlay.x2)}
                stroke={ssOverlayStyle.stroke}
                strokeOpacity={ssOverlayStyle.strokeOpacity}
                strokeWidth={2}
                ifOverflow="hidden"
              />
              <ReferenceLine
                x={Math.max(focusedSsOverlay.x1, focusedSsOverlay.x2)}
                stroke={ssOverlayStyle.stroke}
                strokeOpacity={ssOverlayStyle.strokeOpacity}
                strokeWidth={2}
                ifOverflow="hidden"
              />
            </>
          ) : null}

          <Legend
            layout="vertical"
            verticalAlign="middle"
            align="right"
            width={legendWidth}
            wrapperStyle={{ right: 0, top: 0 }}
            content={legendContent}
          />

          {isSsPlot && focusedFitLine ? (
            <Line
              data={chartFocusedFitLine ?? undefined}
              dataKey={chartYDataKey}
              name="Fit"
              stroke={focusedSeriesColor}
              dot={false}
              isAnimationActive={false}
              strokeWidth={2}
              strokeDasharray="6 4"
              strokeOpacity={0.7}
            />
          ) : null}

          {chartSeriesList.map((series, idx) => (
            <Line
              key={series.id}
              data={series.data}
              dataKey={chartYDataKey}
              name={series.tooltipName ?? series.name}
              stroke={String(series.color || COLORS[idx % COLORS.length] || "#8884d8")}
              dot={false}
              isAnimationActive={false}
              strokeWidth={
                isSsPlot && focusedSeriesId && series.id === focusedSeriesId ? 2.5 : 2
              }
              strokeOpacity={
                isSsPlot && focusedSeriesId && series.id !== focusedSeriesId ? 0.35 : 1
              }
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
      <ChartInteractionOverlay
        key={`${plotType ?? "plot"}:${focusedSeriesId ?? "series"}:${currentBiasInteraction?.enabled ? "currentBias" : ssInteraction?.enabled ? "ss" : "off"}`}
        xDomain={interactiveXDomain}
        plotArea={chartPlotArea}
        interactiveSeriesXs={interactiveSeriesXs}
        currentBiasInteraction={currentBiasInteraction}
        ssInteraction={ssInteraction}
        ssOverlayStyle={ssOverlayStyle}
      />
    </div>
  );
});

MainPlotChart.displayName = "MainPlotChart";

export default MainPlotChart;
