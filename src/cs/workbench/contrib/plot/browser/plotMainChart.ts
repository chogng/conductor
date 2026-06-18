/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

// Owns the interactive main plot chart, canvas drawing, hover handling, and axis title editing.
import { addDisposableListener, EventType } from "src/cs/base/browser/dom";
import { DisposableStore } from "src/cs/base/common/lifecycle";
import { logPerf } from "src/cs/workbench/common/perf";
import { getPlotColor, resolveSeriesPlotColor } from "src/cs/workbench/services/plot/common/plotColors";
import { resolveAxisTitleLabel } from "src/cs/workbench/services/plot/common/plotAxisLabels";
import { drawPlotAxis } from "src/cs/workbench/contrib/plot/browser/plotAxis";
import { PlotAxisTitleView } from "src/cs/workbench/contrib/plot/browser/plotAxisTitleView";
import { drawPlotFrame } from "src/cs/workbench/contrib/plot/browser/plotFrame";
import { drawPlotGrid } from "src/cs/workbench/contrib/plot/browser/plotGrid";
import {
  getPlotReadoutAtX,
  resolvePlotPointY,
  type PlotReadoutEntry,
  type PlotYKey,
} from "src/cs/workbench/contrib/plot/browser/plotReadoutModel";
import { PlotHoverWidget } from "src/cs/workbench/contrib/plot/browser/plotHoverWidget";
import {
  clamp,
  createPlotMainLayout,
  type ChartScale,
  type PlotRect,
} from "src/cs/workbench/services/plot/common/plotMainLayout";
import { downsamplePointsForDisplay } from "src/cs/workbench/services/plot/browser/plotViewModel";
import type {
  PlotMainPoint,
  PlotMainSeries,
} from "src/cs/workbench/services/plot/common/plotModel";

import "src/cs/workbench/contrib/plot/browser/media/plot.css";

export type {
  PlotMainPoint,
  PlotMainSeries,
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

export type PlotMainChartProps = {
  drawStrategy?: PlotMainChartDrawStrategy;
  renderSignature?: string;
  plotType?: string;
  curveLineWidth?: number;
  curvePlotType?: number;
  curveSymbolShape?: number;
  axisLabels?: Partial<{
    xLabel: unknown;
    yLabel: unknown;
  }> | null;
  seriesList: readonly PlotMainSeries[];
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
  focusedFitLine?: readonly PlotMainPoint[] | null;
  vthFitOverlays?: VthFitOverlay[];
  focusedSeriesColor?: string;
  highlightOverlays?: HighlightOverlay[];
  currentBiasMarkers?: CurrentBiasMarker[];
  focusedSsOverlay?: SsOverlay | null;
  ssOverlayStyle: SsOverlayStyle;
  interactiveSeriesXs?: number[];
  currentBiasInteraction?: CurrentBiasInteractionConfig | null;
  ssInteraction?: SsInteractionConfig | null;
  showAxes?: boolean;
  showGrid?: boolean;
  showMajorTicks?: boolean;
  showMinorTicks?: boolean;
  minorTickCount?: number;
  tickLabelFontSize?: number;
  axisTitleFontSize?: number;
  originTickLabelOffset?: unknown;
  originAxisTitleGap?: unknown;
  legendWidth?: number;
  legendContent?: unknown;
  hiddenLegendKeys?: readonly string[];
  legendLabels?: Readonly<Record<string, string>>;
  onToggleLegendItem?: (legendKey: string) => void;
  onEditLegendItem?: (legendKey: string, currentLabel: string) => void;
  xAxisLabelOverride?: string;
  yAxisLabelOverride?: string;
  onXAxisLabelChange?: (nextLabel: string) => void;
  onYAxisLabelChange?: (nextLabel: string) => void;
};

export type PlotMainChartDrawStrategy = "eager" | "stable";

export type PlotMainChartElement = HTMLElement & {
  readonly dispose: () => void;
  readonly editAxisTitle: (axis: "x" | "y") => boolean;
};

export type PlotMainChartSize = {
  readonly height: number;
  readonly width: number;
};

const MIN_CHART_HEIGHT = 220;
const MIN_CHART_WIDTH = 320;
const MAX_CHART_LAYOUT_WAIT_FRAMES = 120;
const MIN_DRAW_POINTS_PER_SERIES = 600;
const DRAW_POINTS_PER_PIXEL = 2;

const resolvePlotYKey = (
  effectiveYScale: PlotMainChartProps["effectiveYScale"],
  yScaleMode: PlotMainChartProps["yScaleMode"],
  yLogCurrentMode: PlotMainChartProps["yLogCurrentMode"],
): PlotYKey => {
  if (effectiveYScale === "logAbs" || yScaleMode === "logAbs") return "yAbsPositive";
  if (effectiveYScale === "log" || yScaleMode === "log") {
    return yLogCurrentMode === "positive" ? "yPositive" : "yAbsPositive";
  }
  return "y";
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

const drawSymbol = (
  context: CanvasRenderingContext2D,
  shape: number,
  x: number,
  y: number,
  color: string,
  size: number,
  lineWidth: number,
): void => {
  if (shape <= 0 || !Number.isFinite(x) || !Number.isFinite(y)) {
    return;
  }

  const radius = size / 2;
  context.save();
  context.strokeStyle = color;
  context.fillStyle = color;
  context.lineWidth = Math.max(1, lineWidth);
  context.beginPath();

  switch (shape) {
    case 1:
      context.rect(x - radius, y - radius, size, size);
      context.fill();
      break;
    case 2:
    case 20:
      context.arc(x, y, radius, 0, Math.PI * 2);
      context.fill();
      break;
    case 3:
      drawPolygon(context, x, y, radius, [-90, 30, 150]);
      context.fill();
      break;
    case 4:
      drawPolygon(context, x, y, radius, [90, 210, 330]);
      context.fill();
      break;
    case 5:
      drawPolygon(context, x, y, radius, [-90, 0, 90, 180]);
      context.fill();
      break;
    case 6:
      context.moveTo(x - radius, y);
      context.lineTo(x + radius, y);
      context.moveTo(x, y - radius);
      context.lineTo(x, y + radius);
      context.stroke();
      break;
    case 7:
      context.moveTo(x - radius, y - radius);
      context.lineTo(x + radius, y + radius);
      context.moveTo(x + radius, y - radius);
      context.lineTo(x - radius, y + radius);
      context.stroke();
      break;
    case 8:
    case 18:
      drawStar(context, x, y, radius, radius * 0.42);
      context.fill();
      break;
    case 9:
      context.moveTo(x - radius, y);
      context.lineTo(x + radius, y);
      context.stroke();
      break;
    case 10:
      context.moveTo(x, y - radius);
      context.lineTo(x, y + radius);
      context.stroke();
      break;
    case 11:
    case 12:
    case 13:
      context.font = `${Math.max(9, size + 2)}px sans-serif`;
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText(shape === 11 ? "1" : shape === 12 ? "A" : "a", x, y);
      break;
    case 14:
      drawArrow(context, x, y, radius, "right");
      context.fill();
      break;
    case 15:
      drawPolygon(context, x, y, radius, [180, 300, 60]);
      context.fill();
      break;
    case 16:
      drawPolygon(context, x, y, radius, [0, 120, 240]);
      context.fill();
      break;
    case 17:
      drawRegularPolygon(context, x, y, radius, 6, -30);
      context.fill();
      break;
    case 19:
      drawRegularPolygon(context, x, y, radius, 5, -90);
      context.fill();
      break;
    default:
      context.arc(x, y, radius, 0, Math.PI * 2);
      context.fill();
      break;
  }

  context.restore();
};

const drawPolygon = (
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  degrees: readonly number[],
): void => {
  degrees.forEach((degree, index) => {
    const angle = degree * Math.PI / 180;
    const px = x + Math.cos(angle) * radius;
    const py = y + Math.sin(angle) * radius;
    if (index === 0) {
      context.moveTo(px, py);
    } else {
      context.lineTo(px, py);
    }
  });
  context.closePath();
};

const drawRegularPolygon = (
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  sides: number,
  startDegree: number,
): void => {
  const degrees = Array.from({ length: sides }, (_, index) => startDegree + index * 360 / sides);
  drawPolygon(context, x, y, radius, degrees);
};

const drawStar = (
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  outerRadius: number,
  innerRadius: number,
): void => {
  const points: number[] = [];
  for (let index = 0; index < 10; index++) {
    points.push(-90 + index * 36);
  }
  points.forEach((degree, index) => {
    const radius = index % 2 === 0 ? outerRadius : innerRadius;
    const angle = degree * Math.PI / 180;
    const px = x + Math.cos(angle) * radius;
    const py = y + Math.sin(angle) * radius;
    if (index === 0) {
      context.moveTo(px, py);
    } else {
      context.lineTo(px, py);
    }
  });
  context.closePath();
};

const drawArrow = (
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  direction: "right",
): void => {
  if (direction === "right") {
    drawPolygon(context, x, y, radius, [0, 145, 180, 215]);
  }
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

const clearHoverOverlay = (canvas: HTMLCanvasElement): void => {
  const context = applyCanvasSize(
    canvas,
    Math.max(MIN_CHART_WIDTH, canvas.parentElement?.clientWidth || canvas.clientWidth || 720),
    Math.max(MIN_CHART_HEIGHT, canvas.parentElement?.clientHeight || canvas.clientHeight || 420),
  );
  context?.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
};

const drawHoverOverlay = (
  canvas: HTMLCanvasElement,
  plotRect: PlotRect,
  scale: ChartScale,
  entries: readonly PlotReadoutEntry[],
): void => {
  const width = Math.max(320, canvas.parentElement?.clientWidth || canvas.clientWidth || 720);
  const height = Math.max(220, canvas.parentElement?.clientHeight || canvas.clientHeight || 420);
  const context = applyCanvasSize(canvas, width, height);
  if (!context || !entries.length) return;

  const x = scale.xToPixel(entries[0]!.x);
  if (!Number.isFinite(x)) return;

  context.save();
  context.beginPath();
  context.rect(plotRect.left, plotRect.top, plotRect.width, plotRect.height);
  context.clip();
  context.setLineDash([3, 2]);
  context.strokeStyle = "rgba(71, 85, 105, 0.52)";
  context.lineWidth = 0.75;
  context.beginPath();
  context.moveTo(x, plotRect.top);
  context.lineTo(x, plotRect.bottom);
  context.stroke();
  context.setLineDash([]);

  for (const entry of entries) {
    const pointX = scale.xToPixel(entry.x);
    const pointY = scale.yToPixel(entry.y);
    if (!Number.isFinite(pointX) || !Number.isFinite(pointY)) continue;
    context.beginPath();
    context.arc(pointX, pointY, 3, 0, Math.PI * 2);
    context.fillStyle = "#ffffff";
    context.fill();
    context.lineWidth = 1.75;
    context.strokeStyle = entry.color;
    context.stroke();
  }
  context.restore();
};

const resolvePlotYDomain = (
  props: PlotMainChartProps,
  yKey: PlotYKey,
): [number, number] => {
  if (props.effectiveYScale !== "log" && props.effectiveYScale !== "logAbs" && props.yScaleMode !== "log" && props.yScaleMode !== "logAbs") {
    return props.yDomain;
  }

  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const series of props.seriesList ?? []) {
    for (const point of series.data ?? []) {
      const y = resolvePlotPointY(point, yKey);
      if (y !== null && Number.isFinite(y) && y > 0) {
        min = Math.min(min, y);
        max = Math.max(max, y);
      }
    }
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    return [1e-12, 1];
  }

  return min === max ? [min / 10, max * 10] : [min, max];
};

export const drawPlotMainChart = (
  canvas: HTMLCanvasElement,
  props: PlotMainChartProps,
  size?: PlotMainChartSize,
): {
  plotRect: PlotRect;
  scale: ChartScale;
  yKey: PlotYKey;
} | null => {
  const container = canvas.parentElement;
  const width = size
    ? Math.max(1, Number(size.width) || 0)
    : Math.max(MIN_CHART_WIDTH, container?.clientWidth || canvas.clientWidth || 720);
  const height = size
    ? Math.max(1, Number(size.height) || 0)
    : Math.max(MIN_CHART_HEIGHT, container?.clientHeight || canvas.clientHeight || 420);
  const context = applyCanvasSize(canvas, width, height);
  if (!context) return null;

  const yKey = resolvePlotYKey(props.effectiveYScale, props.yScaleMode, props.yLogCurrentMode);
  const showAxes = props.showAxes !== false;
  const layout = createPlotMainLayout(width, height, {
    ...props,
    yDomain: resolvePlotYDomain(props, yKey),
  });
  const { plotRect, scale } = layout;

  context.fillStyle = "rgba(255,255,255,0)";
  context.fillRect(0, 0, width, height);

  if (showAxes && props.showGrid !== false) {
    drawPlotGrid(context, layout);
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

  if (showAxes) {
    drawPlotFrame(context, plotRect);
    drawPlotAxis(context, layout, props);
  }

  const lineWidth = Math.max(1, Number(props.curveLineWidth) || 2);
  const curvePlotType = Math.trunc(Number(props.curvePlotType) || 0);
  const symbolShape = Math.trunc(Number(props.curveSymbolShape) || 0);
  const shouldDrawLine = curvePlotType !== 201;
  const shouldDrawSymbols = curvePlotType === 201 || curvePlotType === 202;
  const symbolSize = Math.max(5, Math.min(10, lineWidth + 4));
  const maxDrawPoints = Math.max(
    MIN_DRAW_POINTS_PER_SERIES,
    Math.ceil(plotRect.width * DRAW_POINTS_PER_PIXEL),
  );
  for (const [seriesIndex, series] of (props.seriesList ?? []).entries()) {
    const color = series.color || resolveSeriesPlotColor(series, seriesIndex) || getPlotColor(seriesIndex);
    const sourcePoints = Array.isArray(series.data) ? series.data : [];
    const points = downsamplePointsForDisplay(sourcePoints, maxDrawPoints)
      .map((point) => {
        const x = Number(point?.x);
        const y = resolvePlotPointY(point, yKey);
        if (!Number.isFinite(x) || y === null) return null;
        return {
          x: scale.xToPixel(x),
          y: scale.yToPixel(y),
        };
      })
      .filter((point): point is { x: number; y: number } => Boolean(point));
    const effectiveLineWidth = props.focusedSeriesId === series.id ? lineWidth + 1 : lineWidth;
    if (shouldDrawLine) {
      drawLine(context, points, color, effectiveLineWidth);
    }
    if (shouldDrawSymbols) {
      for (const point of points) {
        drawSymbol(context, symbolShape, point.x, point.y, color, symbolSize, effectiveLineWidth);
      }
    }
  }

  if (props.focusedFitLine?.length) {
    const fitPoints = props.focusedFitLine
      .map((point) => {
        const x = Number(point.x);
        const y = resolvePlotPointY(point, yKey);
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

  if (props.renderSignature) {
    canvas.dataset.plotRenderSignature = props.renderSignature;
  } else {
    delete canvas.dataset.plotRenderSignature;
  }

  return { plotRect, scale, yKey };
};

const readChartLayoutSize = (element: HTMLElement): PlotMainChartSize | null => {
  if (!element.isConnected) {
    return null;
  }

  const rect = element.getBoundingClientRect();
  const width = Math.floor(element.clientWidth || rect.width || 0);
  const height = Math.floor(element.clientHeight || rect.height || 0);
  if (width <= 0 || height <= 0) {
    return null;
  }

  return {
    height: Math.max(MIN_CHART_HEIGHT, height),
    width: Math.max(MIN_CHART_WIDTH, width),
  };
};

const isSameChartSize = (
  a: PlotMainChartSize | null,
  b: PlotMainChartSize | null,
): boolean =>
  Boolean(a && b && a.width === b.width && a.height === b.height);

export const createPlotMainChart = (props: PlotMainChartProps): PlotMainChartElement => {
  const root = document.createElement("div") as unknown as PlotMainChartElement;
  root.className = "plot_main_chart";
  const store = new DisposableStore();

  const canvas = document.createElement("canvas");
  canvas.className = "plot_main_chart_canvas";
  root.appendChild(canvas);

  const hoverCanvas = document.createElement("canvas");
  hoverCanvas.className = "plot_main_chart_hover_canvas";
  root.appendChild(hoverCanvas);

  const axisTitleView = props.showAxes === false
    ? null
    : new PlotAxisTitleView({
      fontSize: props.axisTitleFontSize,
      onXTitleChange: props.onXAxisLabelChange,
      onYTitleChange: props.onYAxisLabelChange,
      xTitle: resolveAxisTitleLabel(
        props.xAxisLabelOverride ?? props.axisLabels?.xLabel,
        "X",
      ),
      yTitle: resolveAxisTitleLabel(
        props.yAxisLabelOverride ?? props.axisLabels?.yLabel,
        "Y",
      ),
    });
  if (axisTitleView) {
    root.append(axisTitleView.element);
  }

  const hoverWidget = new PlotHoverWidget(root);

  let disposed = false;
  let animationFrame = 0;
  let pendingSize: PlotMainChartSize | null = null;
  let waitFrames = 0;
  let lastLoggedRenderSignature = "";
  let rendered: ReturnType<typeof drawPlotMainChart> = null;
  const recordRendered = (
    result: ReturnType<typeof drawPlotMainChart>,
    nextSize: PlotMainChartSize,
  ): ReturnType<typeof drawPlotMainChart> => {
    if (result && props.renderSignature && props.renderSignature !== lastLoggedRenderSignature) {
      lastLoggedRenderSignature = props.renderSignature;
      logPerf("plotMainChart.draw", {
        height: nextSize.height,
        renderSignature: props.renderSignature,
        seriesCount: props.seriesList.length,
        totalPoints: props.seriesList.reduce((total, series) => total + series.data.length, 0),
        width: nextSize.width,
      });
    }

    return result;
  };
  const render = (): void => {
    animationFrame = 0;
    if (disposed) {
      return;
    }

    const nextSize = readChartLayoutSize(root);
    if (!nextSize) {
      waitFrames += 1;
      if (waitFrames < MAX_CHART_LAYOUT_WAIT_FRAMES) {
        requestRender();
      }
      pendingSize = null;
      return;
    }
    waitFrames = 0;

    if (props.drawStrategy === "eager") {
      rendered = recordRendered(drawPlotMainChart(canvas, props, nextSize), nextSize);
      clearHoverOverlay(hoverCanvas);
      return;
    }

    if (!isSameChartSize(pendingSize, nextSize)) {
      pendingSize = nextSize;
      requestRender();
      return;
    }

    rendered = recordRendered(drawPlotMainChart(canvas, props, nextSize), nextSize);
    clearHoverOverlay(hoverCanvas);
  };
  const requestRender = (): void => {
    if (disposed || animationFrame) {
      return;
    }
    animationFrame = window.requestAnimationFrame(render);
  };
  const resizeObserver = new ResizeObserver(requestRender);
  resizeObserver.observe(root);
  queueMicrotask(requestRender);

  store.add(addDisposableListener(canvas, EventType.MOUSE_MOVE, (event) => {
    if (!rendered) {
      requestRender();
      return;
    }

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
      clearHoverOverlay(hoverCanvas);
      hoverWidget.hide();
      return;
    }

    const xRaw = scale.pixelToX(localX);
    const entries = getPlotReadoutAtX(props.seriesList, xRaw, yKey);
    if (!entries.length) {
      clearHoverOverlay(hoverCanvas);
      hoverWidget.hide();
      return;
    }

    drawHoverOverlay(hoverCanvas, plotRect, scale, entries);
    hoverWidget.show(entries, localX, localY, rect, {
      plotXFactor: props.plotXFactor,
      plotYFactor: props.plotYFactor,
      xDigits: props.xTooltipDigits ?? props.xTickDigits,
    });
  }));
  store.add(addDisposableListener(canvas, EventType.MOUSE_LEAVE, () => {
    clearHoverOverlay(hoverCanvas);
    hoverWidget.hide();
  }));

  Object.defineProperty(root, "dispose", {
    value: (): void => {
      disposed = true;
      if (animationFrame) {
        window.cancelAnimationFrame(animationFrame);
        animationFrame = 0;
      }
      resizeObserver.disconnect();
      store.dispose();
      axisTitleView?.dispose();
      hoverWidget.dispose();
      root.replaceChildren();
    },
  });
  Object.defineProperty(root, "editAxisTitle", {
    value: (axis: "x" | "y"): boolean => axisTitleView?.editAxisTitle(axis) ?? false,
  });

  return root;
};

const PlotMainChart = (props: PlotMainChartProps): HTMLElement => createPlotMainChart(props);

export default PlotMainChart;
