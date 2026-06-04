import { formatNumber } from "src/cs/workbench/contrib/calculation/common/numberFormat";
import { getPlotColor, resolveSeriesPlotColor } from "src/cs/workbench/contrib/plot/browser/plotColors";

import "src/cs/workbench/contrib/plot/browser/media/plot.css";

export type MainPlotPoint = {
  x?: number | null;
  y?: number | null;
  yPositive?: number | null;
  yAbsPositive?: number | null;
  ySignedLogPositive?: number | null;
  [key: string]: number | string | null | undefined;
};

export type MainPlotSeries = {
  id: string;
  name: string;
  tooltipName?: string;
  color?: string;
  data: MainPlotPoint[];
  [key: string]: unknown;
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

type VthFitOverlay = {
  color: string;
  intercept?: number;
  label: string;
  r2?: number;
  slope?: number;
  vth: number;
  x1: number;
  x2: number;
  y1: number;
  y2: number;
};

export type MainPlotCanvasProps = {
  plotType?: string;
  curveLineWidth?: number;
  curvePlotType?: number;
  activeFile?: Partial<{
    fileId: string;
    fileName: string;
    xLabel: string;
    yLabel: string;
  }> | null;
  seriesList: MainPlotSeries[];
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
  focusedFitLine?: MainPlotPoint[] | null;
  vthFitOverlays?: VthFitOverlay[];
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
  legendFontSize?: number;
  originTickLabelOffset?: unknown;
  originAxisTitleGap?: unknown;
  legendWidth?: number;
  legendContent?: unknown;
  xAxisLabelOverride?: string;
  yAxisLabelOverride?: string;
  onXAxisLabelChange?: (nextLabel: string) => void;
  onYAxisLabelChange?: (nextLabel: string) => void;
};

type PlotRect = {
  bottom: number;
  height: number;
  left: number;
  right: number;
  top: number;
  width: number;
};

type ChartScale = {
  xToPixel: (value: number) => number;
  yToPixel: (value: number) => number;
  pixelToX: (value: number) => number;
};

type TooltipEntry = {
  color: string;
  label: string;
  x: number;
  y: number;
};

const DEFAULT_TICK_LABEL_FONT_SIZE = 11;
const DEFAULT_AXIS_TITLE_FONT_SIZE = 12;
const DEFAULT_MARGIN = { top: 20, right: 20, bottom: 46, left: 64 };

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const normalizeDomain = (domain: readonly number[]): [number, number] => {
  const left = Number(domain[0]);
  const right = Number(domain[1]);
  if (!Number.isFinite(left) || !Number.isFinite(right)) return [0, 1];
  if (left === right) return [left - 0.5, right + 0.5];
  return [Math.min(left, right), Math.max(left, right)];
};

const resolvePlotYKey = (
  effectiveYScale: MainPlotCanvasProps["effectiveYScale"],
  yScaleMode: MainPlotCanvasProps["yScaleMode"],
  yLogCurrentMode: MainPlotCanvasProps["yLogCurrentMode"],
): PlotYKey => {
  if (effectiveYScale === "logAbs" || yScaleMode === "logAbs") return "yAbsPositive";
  if (effectiveYScale === "log" || yScaleMode === "log") {
    return yLogCurrentMode === "positive" ? "yPositive" : "yAbsPositive";
  }
  return "y";
};

const resolvePointY = (point: MainPlotPoint, key: PlotYKey): number | null => {
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

const resolveLabelWithUnit = (label: unknown, unit: unknown, fallback: string): string => {
  const text = String(label ?? "").trim() || fallback;
  const unitText = String(unit ?? "").trim();
  if (!unitText || text.includes("(")) return text;
  return `${text} (${unitText})`;
};

const createTicks = (domain: [number, number], requested?: number[] | null): number[] => {
  if (Array.isArray(requested) && requested.length) {
    return requested.map(Number).filter(Number.isFinite);
  }

  const [min, max] = domain;
  const step = (max - min) / 4;
  if (!Number.isFinite(step) || step <= 0) return [min, max];
  return [0, 1, 2, 3, 4].map((index) => min + step * index);
};

const createMinorTicks = (
  majorTicks: number[],
  domain: [number, number],
  countRaw: unknown,
): number[] => {
  const count = Math.max(1, Math.min(20, Math.round(Number(countRaw) || 1)));
  if (majorTicks.length < 2) return [];

  const ticks: number[] = [];
  const [min, max] = normalizeDomain(domain);
  for (let index = 0; index < majorTicks.length - 1; index++) {
    const left = majorTicks[index]!;
    const right = majorTicks[index + 1]!;
    const step = (right - left) / (count + 1);
    if (!Number.isFinite(step) || step <= 0) continue;
    for (let minorIndex = 1; minorIndex <= count; minorIndex++) {
      const tick = left + step * minorIndex;
      if (tick > min && tick < max) {
        ticks.push(tick);
      }
    }
  }
  return ticks;
};

const createScale = (
  plotRect: PlotRect,
  xDomainRaw: [number, number],
  yDomainRaw: [number, number],
): ChartScale => {
  const xDomain = normalizeDomain(xDomainRaw);
  const yDomain = normalizeDomain(yDomainRaw);
  const xSpan = xDomain[1] - xDomain[0] || 1;
  const ySpan = yDomain[1] - yDomain[0] || 1;

  return {
    xToPixel: (value) => plotRect.left + ((value - xDomain[0]) / xSpan) * plotRect.width,
    yToPixel: (value) => plotRect.bottom - ((value - yDomain[0]) / ySpan) * plotRect.height,
    pixelToX: (value) => xDomain[0] + ((value - plotRect.left) / plotRect.width) * xSpan,
  };
};

const applyCanvasSize = (canvas: HTMLCanvasElement, width: number, height: number): CanvasRenderingContext2D | null => {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.round(width * dpr));
  canvas.height = Math.max(1, Math.round(height * dpr));
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;

  const context = canvas.getContext("2d");
  if (!context) return null;
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  context.clearRect(0, 0, width, height);
  return context;
};

const drawLine = (
  context: CanvasRenderingContext2D,
  points: Array<{ x: number; y: number }>,
  color: string,
  lineWidth: number,
): void => {
  if (points.length < 2) return;
  context.beginPath();
  points.forEach((point, index) => {
    if (index === 0) {
      context.moveTo(point.x, point.y);
    } else {
      context.lineTo(point.x, point.y);
    }
  });
  context.strokeStyle = color;
  context.lineWidth = lineWidth;
  context.stroke();
};

const drawVerticalMarker = (
  context: CanvasRenderingContext2D,
  plotRect: PlotRect,
  scale: ChartScale,
  x: number,
  stroke: string,
  opacity = 1,
  width = 1.5,
): void => {
  const pixelX = scale.xToPixel(x);
  if (!Number.isFinite(pixelX)) return;
  context.save();
  context.globalAlpha = opacity;
  context.strokeStyle = stroke;
  context.lineWidth = width;
  context.beginPath();
  context.moveTo(pixelX, plotRect.top);
  context.lineTo(pixelX, plotRect.bottom);
  context.stroke();
  context.restore();
};

const drawRangeOverlay = (
  context: CanvasRenderingContext2D,
  plotRect: PlotRect,
  scale: ChartScale,
  x1: number,
  x2: number,
  fill: string,
  fillOpacity: number,
): void => {
  const left = clamp(scale.xToPixel(Math.min(x1, x2)), plotRect.left, plotRect.right);
  const right = clamp(scale.xToPixel(Math.max(x1, x2)), plotRect.left, plotRect.right);
  if (!Number.isFinite(left) || !Number.isFinite(right) || right <= left) return;
  context.save();
  context.globalAlpha = fillOpacity;
  context.fillStyle = fill;
  context.fillRect(left, plotRect.top, right - left, plotRect.height);
  context.restore();
};

const drawMainPlotCanvas = (
  canvas: HTMLCanvasElement,
  props: MainPlotCanvasProps,
): {
  plotRect: PlotRect;
  scale: ChartScale;
  yKey: PlotYKey;
} | null => {
  const width = Math.max(320, canvas.clientWidth || 720);
  const height = Math.max(220, canvas.clientHeight || 420);
  const context = applyCanvasSize(canvas, width, height);
  if (!context) return null;

  const plotRect: PlotRect = {
    left: DEFAULT_MARGIN.left,
    top: DEFAULT_MARGIN.top,
    right: width - DEFAULT_MARGIN.right,
    bottom: height - DEFAULT_MARGIN.bottom,
    width: Math.max(1, width - DEFAULT_MARGIN.left - DEFAULT_MARGIN.right),
    height: Math.max(1, height - DEFAULT_MARGIN.top - DEFAULT_MARGIN.bottom),
  };
  const scale = createScale(plotRect, props.xDomain, props.yDomain);
  const xTicks = createTicks(props.xDomain, props.xTicks);
  const yTicks = createTicks(props.yDomain, props.yTicks);
  const xMinorTicks = props.showMinorTicks === false
    ? []
    : createMinorTicks(xTicks, props.xDomain, props.minorTickCount);
  const yMinorTicks = props.showMinorTicks === false
    ? []
    : createMinorTicks(yTicks, props.yDomain, props.minorTickCount);
  const yKey = resolvePlotYKey(props.effectiveYScale, props.yScaleMode, props.yLogCurrentMode);
  const tickFontSize = props.tickLabelFontSize ?? DEFAULT_TICK_LABEL_FONT_SIZE;
  const axisFontSize = props.axisTitleFontSize ?? DEFAULT_AXIS_TITLE_FONT_SIZE;
  const xAxisLabel = resolveLabelWithUnit(props.xAxisLabelOverride ?? props.activeFile?.xLabel, props.plotXUnitLabel, "X");
  const yAxisLabel = resolveLabelWithUnit(props.yAxisLabelOverride ?? props.activeFile?.yLabel, props.plotYUnitLabel, "Y");

  context.fillStyle = "rgba(255,255,255,0)";
  context.fillRect(0, 0, width, height);

  if (props.showGrid !== false) {
    context.save();
    context.strokeStyle = "rgba(148, 163, 184, 0.28)";
    context.lineWidth = 1;
    for (const tick of xTicks) {
      const x = scale.xToPixel(tick);
      context.beginPath();
      context.moveTo(x, plotRect.top);
      context.lineTo(x, plotRect.bottom);
      context.stroke();
    }
    for (const tick of yTicks) {
      const y = scale.yToPixel(tick);
      context.beginPath();
      context.moveTo(plotRect.left, y);
      context.lineTo(plotRect.right, y);
      context.stroke();
    }
    context.restore();
  }

  for (const overlay of props.highlightOverlays ?? []) {
    drawRangeOverlay(context, plotRect, scale, overlay.x1, overlay.x2, overlay.fill, overlay.fillOpacity);
    if (!overlay.hideStartLine) {
      drawVerticalMarker(context, plotRect, scale, overlay.x1, overlay.stroke, overlay.strokeOpacity, overlay.strokeWidth ?? 1.5);
    }
    if (!overlay.hideEndLine) {
      drawVerticalMarker(context, plotRect, scale, overlay.x2, overlay.stroke, overlay.strokeOpacity, overlay.strokeWidth ?? 1.5);
    }
  }

  context.save();
  context.strokeStyle = "rgba(100, 116, 139, 0.8)";
  context.lineWidth = 1;
  context.strokeRect(plotRect.left, plotRect.top, plotRect.width, plotRect.height);
  if (props.showMinorTicks !== false) {
    context.beginPath();
    for (const tick of xMinorTicks) {
      const x = scale.xToPixel(tick);
      context.moveTo(x, plotRect.bottom);
      context.lineTo(x, plotRect.bottom + 4);
    }
    for (const tick of yMinorTicks) {
      const y = scale.yToPixel(tick);
      context.moveTo(plotRect.left - 4, y);
      context.lineTo(plotRect.left, y);
    }
    context.stroke();
  }
  if (props.showMajorTicks !== false) {
    context.beginPath();
    for (const tick of xTicks) {
      const x = scale.xToPixel(tick);
      context.moveTo(x, plotRect.bottom);
      context.lineTo(x, plotRect.bottom + 6);
    }
    for (const tick of yTicks) {
      const y = scale.yToPixel(tick);
      context.moveTo(plotRect.left - 6, y);
      context.lineTo(plotRect.left, y);
    }
    context.stroke();
  }
  context.fillStyle = "rgba(71, 85, 105, 0.95)";
  context.font = `${tickFontSize}px sans-serif`;
  context.textAlign = "center";
  context.textBaseline = "top";
  for (const tick of xTicks) {
    context.fillText(formatNumber(tick * props.plotXFactor, { digits: props.xTickDigits }), scale.xToPixel(tick), plotRect.bottom + 8);
  }
  context.textAlign = "right";
  context.textBaseline = "middle";
  const yDigits = Math.max(2, Math.min(6, props.xTickDigits));
  for (const tick of yTicks) {
    context.fillText(formatNumber(tick * props.plotYFactor, { digits: yDigits }), plotRect.left - 8, scale.yToPixel(tick));
  }

  context.font = `${axisFontSize}px sans-serif`;
  context.textAlign = "center";
  context.textBaseline = "bottom";
  context.fillText(xAxisLabel, plotRect.left + plotRect.width / 2, height - 8);
  context.save();
  context.translate(14, plotRect.top + plotRect.height / 2);
  context.rotate(-Math.PI / 2);
  context.fillText(yAxisLabel, 0, 0);
  context.restore();
  context.restore();

  const lineWidth = Math.max(1, Number(props.curveLineWidth) || 2);
  for (const [seriesIndex, series] of (props.seriesList ?? []).entries()) {
    const color = series.color || resolveSeriesPlotColor(series, seriesIndex) || getPlotColor(seriesIndex);
    const points = (Array.isArray(series.data) ? series.data : [])
      .map((point) => {
        const x = Number(point?.x);
        const y = resolvePointY(point, yKey);
        if (!Number.isFinite(x) || y === null) return null;
        return {
          x: scale.xToPixel(x),
          y: scale.yToPixel(y),
        };
      })
      .filter((point): point is { x: number; y: number } => Boolean(point));
    drawLine(context, points, color, props.focusedSeriesId === series.id ? lineWidth + 1 : lineWidth);
  }

  if (props.focusedFitLine?.length) {
    const fitPoints = props.focusedFitLine
      .map((point) => {
        const x = Number(point.x);
        const y = resolvePointY(point, yKey);
        if (!Number.isFinite(x) || y === null) return null;
        return {
          x: scale.xToPixel(x),
          y: scale.yToPixel(y),
        };
      })
      .filter((point): point is { x: number; y: number } => Boolean(point));
    drawLine(context, fitPoints, props.focusedSeriesColor ?? getPlotColor(0), lineWidth + 1);
  }

  for (const overlay of props.vthFitOverlays ?? []) {
    drawLine(context, [
      { x: scale.xToPixel(overlay.x1), y: scale.yToPixel(overlay.y1) },
      { x: scale.xToPixel(overlay.x2), y: scale.yToPixel(overlay.y2) },
    ], overlay.color, 1.5);
    drawVerticalMarker(context, plotRect, scale, overlay.vth, overlay.color, 0.85, 1.25);
  }

  if (props.focusedSsOverlay) {
    drawRangeOverlay(
      context,
      plotRect,
      scale,
      props.focusedSsOverlay.x1,
      props.focusedSsOverlay.x2,
      props.ssOverlayStyle.fill,
      props.ssOverlayStyle.fillOpacity,
    );
    drawVerticalMarker(context, plotRect, scale, props.focusedSsOverlay.x1, props.ssOverlayStyle.stroke, props.ssOverlayStyle.strokeOpacity, 2);
    drawVerticalMarker(context, plotRect, scale, props.focusedSsOverlay.x2, props.ssOverlayStyle.stroke, props.ssOverlayStyle.strokeOpacity, 2);
  }

  for (const marker of props.currentBiasMarkers ?? []) {
    drawVerticalMarker(context, plotRect, scale, marker.x, marker.stroke, marker.strokeOpacity ?? 1, marker.strokeWidth ?? 2);
  }

  return { plotRect, scale, yKey };
};

const findNearestTooltipEntries = (
  props: MainPlotCanvasProps,
  xRaw: number,
  yKey: PlotYKey,
): TooltipEntry[] => {
  const entries: TooltipEntry[] = [];
  for (const [seriesIndex, series] of (props.seriesList ?? []).entries()) {
    let nearest: MainPlotPoint | null = null;
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
    const y = resolvePointY(nearest, yKey);
    const x = Number(nearest.x);
    if (y === null || !Number.isFinite(x)) continue;
    entries.push({
      color: series.color || resolveSeriesPlotColor(series, seriesIndex) || getPlotColor(seriesIndex),
      label: String(series.tooltipName ?? series.name ?? `Series ${seriesIndex + 1}`),
      x,
      y,
    });
  }
  return entries.slice(0, 8);
};

const renderLegend = (
  container: HTMLElement,
  seriesList: MainPlotSeries[],
  legendContent: unknown,
): void => {
  container.replaceChildren();
  if (legendContent instanceof Node) {
    container.appendChild(legendContent);
    return;
  }

  const list = document.createElement("div");
  list.className = "main_plot_canvas_legend_list";
  for (const [index, series] of seriesList.entries()) {
    const row = document.createElement("div");
    row.className = "main_plot_canvas_legend_row";
    const swatch = document.createElement("span");
    swatch.className = "main_plot_canvas_legend_swatch";
    swatch.style.backgroundColor = series.color || resolveSeriesPlotColor(series, index) || getPlotColor(index);
    const label = document.createElement("span");
    label.className = "main_plot_canvas_legend_label";
    label.textContent = String(series.name ?? `Series ${index + 1}`);
    row.append(swatch, label);
    list.appendChild(row);
  }
  container.appendChild(list);
};

export const createMainPlotLegend = (props: Pick<MainPlotCanvasProps,
  "legendContent" | "legendFontSize" | "legendWidth" | "seriesList"
>): HTMLElement => {
  const legend = document.createElement("div");
  legend.className = "main_plot_canvas_legend";
  legend.style.width = `${Math.max(80, Number(props.legendWidth) || 120)}px`;
  if (props.legendFontSize) {
    legend.style.fontSize = `${props.legendFontSize}px`;
  }
  renderLegend(legend, props.seriesList ?? [], props.legendContent);
  return legend;
};

export const createMainPlotCanvas = (props: MainPlotCanvasProps): HTMLElement => {
  const root = document.createElement("div");
  root.className = "main_plot_canvas";

  const canvas = document.createElement("canvas");
  canvas.className = "main_plot_canvas_canvas";
  root.appendChild(canvas);

  const tooltip = document.createElement("div");
  tooltip.className = "main_plot_canvas_tooltip main_plot_canvas_tooltip--hidden";
  root.appendChild(tooltip);

  let rendered = drawMainPlotCanvas(canvas, props);
  queueMicrotask(() => {
    rendered = drawMainPlotCanvas(canvas, props);
  });

  canvas.addEventListener("mousemove", (event) => {
    rendered ??= drawMainPlotCanvas(canvas, props);
    if (!rendered) return;

    const rect = canvas.getBoundingClientRect();
    const localX = event.clientX - rect.left;
    const localY = event.clientY - rect.top;
    const { plotRect, scale, yKey } = rendered;
    if (
      localX < plotRect.left ||
      localX > plotRect.right ||
      localY < plotRect.top ||
      localY > plotRect.bottom
    ) {
      tooltip.classList.add("main_plot_canvas_tooltip--hidden");
      return;
    }

    const xRaw = scale.pixelToX(localX);
    const entries = findNearestTooltipEntries(props, xRaw, yKey);
    if (!entries.length) {
      tooltip.classList.add("main_plot_canvas_tooltip--hidden");
      return;
    }

    tooltip.replaceChildren();
    const title = document.createElement("div");
    title.className = "main_plot_canvas_tooltip_title";
    title.textContent = formatNumber(entries[0]!.x * props.plotXFactor, {
      digits: props.xTooltipDigits ?? props.xTickDigits,
    });
    tooltip.appendChild(title);
    for (const entry of entries) {
      const row = document.createElement("div");
      row.className = "main_plot_canvas_tooltip_row";
      const swatch = document.createElement("span");
      swatch.className = "main_plot_canvas_tooltip_swatch";
      swatch.style.backgroundColor = entry.color;
      const label = document.createElement("span");
      label.textContent = `${entry.label}: ${formatNumber(entry.y * props.plotYFactor, { digits: 4 })}`;
      row.append(swatch, label);
      tooltip.appendChild(row);
    }
    tooltip.style.left = `${clamp(localX + 12, 8, rect.width - 220)}px`;
    tooltip.style.top = `${clamp(localY + 12, 8, rect.height - 120)}px`;
    tooltip.classList.remove("main_plot_canvas_tooltip--hidden");
  });
  canvas.addEventListener("mouseleave", () => {
    tooltip.classList.add("main_plot_canvas_tooltip--hidden");
  });

  return root;
};

const MainPlotCanvas = (props: MainPlotCanvasProps): HTMLElement => createMainPlotCanvas(props);

export default MainPlotCanvas;
