import React, { memo, useEffect, useMemo, useRef, useState } from "react";
import { formatNumber } from "../lib/analysisMath";
import { getChartColor } from "../lib/chartColors";
import { inferTickDigitsFromTicks } from "../lib/analysisChartsUtils";
import {
  getDeviceAnalysisPerfNow,
  logDeviceAnalysisPerf,
} from "../../shared/lib/deviceAnalysisPerf";

type DiagnosticsPoint = {
  x?: number | null;
  y?: number | null;
  [key: string]: number | string | null | undefined;
};

type DiagnosticsSeries = {
  color?: string;
  data: DiagnosticsPoint[];
  id: string;
  lineName: string;
};

type DiagnosticsReferenceLine = {
  axis: "x" | "y";
  dash?: number[];
  opacity?: number;
  stroke: string;
  strokeWidth?: number;
  value: number;
};

type ChartMargin = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

type PlotRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

type Scale = {
  xMax: number;
  xMin: number;
  xToPx: (value: number) => number;
  yMax: number;
  yMin: number;
  yToPx: (value: number) => number;
  pxToX: (value: number) => number;
};

type TooltipState = {
  color: string;
  cursorX: number;
  label: string;
  markers: MarkerPoint[];
  visible: boolean;
  x: number;
  xValue: number;
  y: number;
  yValue: number;
};

type PreparedSeries = DiagnosticsSeries & {
  color: string;
  monotonic: "asc" | "desc" | null;
  points: Array<{ x: number; y: number }>;
};

type MarkerPoint = {
  color: string;
  x: number;
  y: number;
};

type CanvasDiagnosticsChartProps = {
  ariaLabel: string;
  axisTitleFontSize?: number;
  locatorX?: number | null;
  referenceLines?: DiagnosticsReferenceLine[];
  rightReservedWidth?: number;
  series: DiagnosticsSeries[];
  tickLabelFontSize?: number;
  valueUnitLabel?: string;
  xDomain: number[];
  xFactor?: number;
  xLabelInterval: number;
  xTickDigits: number;
  xTicks?: number[] | null;
  xTooltipDigits: number;
  xUnitLabel?: string;
  yAxisLabel: string;
  yDomain: number[];
  yTicks?: number[] | null;
  yTooltipMinDigits?: number;
};

const DEFAULT_CHART_MARGIN: ChartMargin = { top: 25, right: 15, bottom: 46, left: 112 };
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
const AXIS_TITLE_GAP_PX = 10;
const TICK_LABEL_OFFSET_PX = MAJOR_TICK_LENGTH_PX + 4;
const AXIS_TITLE_EDGE_PADDING_PX = 14;
const AXIS_LABEL_COLOR = "#000000";
const LOCATOR_LINE_STROKE = "rgba(17,24,39,0.25)";
const LOCATOR_LINE_DASH: [number, number] = [4, 4];
const LOCATOR_LINE_SNAP_PX = 8;
const TOOLTIP_WIDTH = 220;
const TOOLTIP_HEIGHT = 84;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

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

const getDomain = (domain: number[] | null | undefined): [number, number] => {
  const rawStart = Number(domain?.[0]);
  const rawEnd = Number(domain?.[1]);
  if (!Number.isFinite(rawStart) || !Number.isFinite(rawEnd)) return [0, 1];
  if (rawStart === rawEnd) return [rawStart - 0.5, rawEnd + 0.5];
  return [Math.min(rawStart, rawEnd), Math.max(rawStart, rawEnd)];
};

const getYDomain = (domain: number[] | null | undefined): [number, number] => {
  const rawStart = Number(domain?.[0]);
  const rawEnd = Number(domain?.[1]);
  if (!Number.isFinite(rawStart) || !Number.isFinite(rawEnd)) return [0, 1];
  if (rawStart === rawEnd) return [rawStart - 0.5, rawEnd + 0.5];
  return [Math.min(rawStart, rawEnd), Math.max(rawStart, rawEnd)];
};

const buildScale = (
  plotRect: PlotRect,
  xDomain: [number, number],
  yDomain: [number, number],
): Scale => {
  const [xMin, xMax] = xDomain;
  const [yMin, yMax] = yDomain;
  const xSpan = xMax - xMin || 1;
  const ySpan = yMax - yMin || 1;
  return {
    xMax,
    xMin,
    yMax,
    yMin,
    xToPx: (value) => plotRect.left + ((value - xMin) / xSpan) * plotRect.width,
    yToPx: (value) =>
      plotRect.top + (1 - (value - yMin) / ySpan) * plotRect.height,
    pxToX: (value) => xMin + ((value - plotRect.left) / plotRect.width) * xSpan,
  };
};

const getPreparedSeries = (series: DiagnosticsSeries[]): PreparedSeries[] =>
  series.map((item, index) => {
    const points = Array.isArray(item.data)
      ? item.data
          .map((point) => {
            const x = Number(point?.x);
            const y = Number(point?.y);
            return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
          })
          .filter((point): point is { x: number; y: number } => point !== null)
      : [];

    let ascending = true;
    let descending = true;
    for (let pointIndex = 1; pointIndex < points.length; pointIndex += 1) {
      if (points[pointIndex].x < points[pointIndex - 1].x) ascending = false;
      if (points[pointIndex].x > points[pointIndex - 1].x) descending = false;
      if (!ascending && !descending) break;
    }

    return {
      ...item,
      color: item.color || getChartColor(index),
      monotonic: ascending ? "asc" : descending ? "desc" : null,
      points,
    };
  });

const findNearestPoint = (
  series: PreparedSeries,
  xValue: number,
): { x: number; y: number } | null => {
  const { points } = series;
  if (!points.length) return null;

  const pickNearest = (
    best: { x: number; y: number } | null,
    candidate: { x: number; y: number } | undefined,
  ) => {
    if (!candidate) return best;
    if (!best) return candidate;
    return Math.abs(candidate.x - xValue) < Math.abs(best.x - xValue)
      ? candidate
      : best;
  };

  if (!series.monotonic) {
    let best: { x: number; y: number } | null = null;
    for (const point of points) best = pickNearest(best, point);
    return best;
  }

  let lo = 0;
  let hi = points.length - 1;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    const midX = points[mid].x;
    if (series.monotonic === "asc") {
      if (midX < xValue) lo = mid + 1;
      else hi = mid;
    } else if (midX > xValue) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }

  let best: { x: number; y: number } | null = null;
  best = pickNearest(best, points[lo]);
  best = pickNearest(best, points[lo - 1]);
  best = pickNearest(best, points[lo + 1]);
  return best;
};

const getCurvePointAtX = (
  series: PreparedSeries,
  xValue: number,
): { x: number; y: number } | null => {
  const { points } = series;
  if (!points.length) return null;
  if (!series.monotonic || points.length < 2) {
    return findNearestPoint(series, xValue);
  }

  let lo = 0;
  let hi = points.length - 1;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    const midX = points[mid].x;
    if (series.monotonic === "asc") {
      if (midX < xValue) lo = mid + 1;
      else hi = mid;
    } else if (midX > xValue) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }

  const upper = points[lo];
  const lower = points[lo - 1];
  if (!lower || !upper) return findNearestPoint(series, xValue);
  const minX = Math.min(lower.x, upper.x);
  const maxX = Math.max(lower.x, upper.x);
  if (xValue < minX || xValue > maxX) return findNearestPoint(series, xValue);
  if (upper.x === xValue) return upper;
  if (lower.x === xValue) return lower;
  const dx = upper.x - lower.x;
  if (!Number.isFinite(dx) || dx === 0) return findNearestPoint(series, xValue);
  const t = (xValue - lower.x) / dx;
  if (!Number.isFinite(t)) return findNearestPoint(series, xValue);
  return {
    x: xValue,
    y: lower.y + Math.max(0, Math.min(1, t)) * (upper.y - lower.y),
  };
};

const setLineDash = (ctx: CanvasRenderingContext2D, dash?: number[]) => {
  ctx.setLineDash(Array.isArray(dash) ? dash : []);
};

const toLocatorValue = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};

const buildLinearMinorTicks = (
  ticks: number[] | null | undefined,
  minorTickCount = 1,
): number[] => {
  if (!Array.isArray(ticks) || ticks.length < 2) return [];
  const count = Math.max(1, Math.min(20, Math.round(minorTickCount)));
  const result: number[] = [];
  for (let index = 1; index < ticks.length; index += 1) {
    const start = Number(ticks[index - 1]);
    const end = Number(ticks[index]);
    if (!Number.isFinite(start) || !Number.isFinite(end) || start === end) continue;
    const step = (end - start) / (count + 1);
    for (let offset = 1; offset <= count; offset += 1) {
      result.push(start + step * offset);
    }
  }
  return result;
};

const CanvasDiagnosticsChart = memo(function CanvasDiagnosticsChart({
  ariaLabel,
  axisTitleFontSize = DEFAULT_AXIS_TITLE_FONT_SIZE,
  locatorX,
  referenceLines = [],
  rightReservedWidth = 135,
  series,
  tickLabelFontSize = DEFAULT_TICK_LABEL_FONT_SIZE,
  valueUnitLabel = "",
  xDomain,
  xFactor = 1,
  xLabelInterval,
  xTickDigits,
  xTicks,
  xTooltipDigits,
  xUnitLabel = "V",
  yAxisLabel,
  yDomain,
  yTicks,
  yTooltipMinDigits = 2,
}: CanvasDiagnosticsChartProps) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [size, setSize] = useState({ height: 0, width: 0 });
  const [tooltip, setTooltip] = useState<TooltipState>({
    color: getChartColor(0),
    cursorX: 0,
    label: "",
    markers: [],
    visible: false,
    x: 0,
    xValue: 0,
    y: 0,
    yValue: 0,
  });

  const preparedSeries = useMemo(() => getPreparedSeries(series), [series]);
  const resolvedXDomain = useMemo(() => getDomain(xDomain), [xDomain]);
  const resolvedYDomain = useMemo(() => getYDomain(yDomain), [yDomain]);
  const yTickDigits = inferTickDigitsFromTicks(yTicks);
  const yTooltipDigits = Math.max(yTooltipMinDigits, yTickDigits);

  const legendSpace = useMemo(
    () => Math.max(0, Number(rightReservedWidth) || 0),
    [rightReservedWidth],
  );
  const chartMargin = useMemo<ChartMargin>(
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

  const plotRect = useMemo<PlotRect | null>(() => {
    if (size.width <= 0 || size.height <= 0) return null;
    const availableWidth = size.width - legendSpace;
    const width = availableWidth - chartMargin.left - chartMargin.right;
    const height = size.height - chartMargin.top - chartMargin.bottom;
    if (width <= 0 || height <= 0) return null;
    return {
      left: chartMargin.left,
      top: chartMargin.top,
      width,
      height,
    };
  }, [chartMargin, legendSpace, size.height, size.width]);

  const scale = useMemo(
    () => (plotRect ? buildScale(plotRect, resolvedXDomain, resolvedYDomain) : null),
    [plotRect, resolvedXDomain, resolvedYDomain],
  );

  const locatorMarkers = useMemo<MarkerPoint[]>(() => {
    const locatorValue = toLocatorValue(locatorX);
    if (
      !plotRect ||
      !scale ||
      locatorValue === null ||
      locatorValue < scale.xMin ||
      locatorValue > scale.xMax
    ) {
      return [];
    }
    const markers: MarkerPoint[] = [];
    for (const item of preparedSeries) {
      const point = getCurvePointAtX(item, locatorValue);
      if (!point || point.y < scale.yMin || point.y > scale.yMax) continue;
      markers.push({
        color: item.color,
        x: scale.xToPx(locatorValue),
        y: scale.yToPx(point.y),
      });
    }
    return markers;
  }, [locatorX, plotRect, preparedSeries, scale]);

  useEffect(() => {
    const element = wrapperRef.current;
    if (!element) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const width = Math.floor(entry.contentRect.width);
      const height = Math.floor(entry.contentRect.height);
      setSize((prev) =>
        prev.width === width && prev.height === height ? prev : { width, height },
      );
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !plotRect || !scale || size.width <= 0 || size.height <= 0) return;
    const ctx = setupCanvas(canvas, size.width, size.height);
    if (!ctx) return;

    const startedAt = getDeviceAnalysisPerfNow();
    let pointCount = 0;
    ctx.clearRect(0, 0, size.width, size.height);

    const xTicksInDomain = (Array.isArray(xTicks) ? xTicks : [])
      .map((tick) => Number(tick))
      .filter((tick) => Number.isFinite(tick) && tick >= scale.xMin && tick <= scale.xMax);
    const yTicksInDomain = (Array.isArray(yTicks) ? yTicks : [])
      .map((tick) => Number(tick))
      .filter((tick) => Number.isFinite(tick) && tick >= scale.yMin && tick <= scale.yMax);
    const visibleXTicks =
      xTicksInDomain.length >= 2
        ? xTicksInDomain
        : [scale.xMin, (scale.xMin + scale.xMax) / 2, scale.xMax];
    const visibleYTicks =
      yTicksInDomain.length >= 2
        ? yTicksInDomain
        : [scale.yMin, (scale.yMin + scale.yMax) / 2, scale.yMax];
    const visibleXMinorTicks = buildLinearMinorTicks(visibleXTicks, 1);
    const visibleYMinorTicks = buildLinearMinorTicks(visibleYTicks, 1);
    const plotRight = plotRect.left + plotRect.width;
    const plotBottom = plotRect.top + plotRect.height;

    ctx.save();
    ctx.lineWidth = 1;
    ctx.font = `${tickLabelFontSize}px ${AXIS_FONT_FAMILY}`;
    setLineDash(ctx, GRID_DASH);
    ctx.strokeStyle = GRID_STROKE;
    for (const tick of visibleXTicks) {
      const x = scale.xToPx(Number(tick));
      if (x <= plotRect.left + 0.5 || x >= plotRight - 0.5) continue;
      ctx.beginPath();
      ctx.moveTo(x, plotRect.top);
      ctx.lineTo(x, plotBottom);
      ctx.stroke();
    }
    for (const tick of visibleYTicks) {
      const y = scale.yToPx(Number(tick));
      if (y <= plotRect.top + 0.5 || y >= plotBottom - 0.5) continue;
      ctx.beginPath();
      ctx.moveTo(plotRect.left, y);
      ctx.lineTo(plotRight, y);
      ctx.stroke();
    }
    setLineDash(ctx);

    ctx.strokeStyle = PLOT_BORDER_STROKE;
    ctx.strokeRect(plotRect.left, plotRect.top, plotRect.width, plotRect.height);

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

    ctx.fillStyle = TICK_LABEL_COLOR;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    visibleXTicks.forEach((tick) => {
      const x = scale.xToPx(Number(tick));
      if (x < plotRect.left - 1 || x > plotRight + 1) return;
      ctx.fillText(
        formatNumber(Number(tick) * xFactor, { digits: xTickDigits }),
        x,
        plotBottom + TICK_LABEL_OFFSET_PX,
      );
    });

    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    for (const tick of visibleYTicks) {
      const y = scale.yToPx(Number(tick));
      if (y < plotRect.top - 1 || y > plotBottom + 1) continue;
      ctx.fillText(
        formatNumber(Number(tick), { digits: yTickDigits }),
        plotRect.left - TICK_LABEL_OFFSET_PX,
        y,
      );
    }

    ctx.fillStyle = AXIS_LABEL_COLOR;
    ctx.font = `${axisTitleFontSize}px ${AXIS_FONT_FAMILY}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.save();
    const yTitleX =
      plotRect.left -
      TICK_LABEL_OFFSET_PX -
      tickLabelFontSize * 2.6 -
      AXIS_TITLE_GAP_PX -
      axisTitleFontSize * 0.5;
    ctx.translate(yTitleX, plotRect.top + plotRect.height / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(yAxisLabel, 0, 0);
    ctx.restore();
    ctx.restore();

    ctx.save();
    ctx.rect(plotRect.left, plotRect.top, plotRect.width, plotRect.height);
    ctx.clip();

    for (const line of referenceLines) {
      const rawValue = Number(line.value);
      if (!Number.isFinite(rawValue)) continue;
      const isX = line.axis === "x";
      const pixel = isX ? scale.xToPx(rawValue) : scale.yToPx(rawValue);
      ctx.save();
      ctx.globalAlpha = line.opacity ?? 1;
      ctx.strokeStyle = line.stroke;
      ctx.lineWidth = line.strokeWidth ?? 1;
      setLineDash(ctx, line.dash);
      ctx.beginPath();
      if (isX) {
        ctx.moveTo(pixel, plotRect.top);
        ctx.lineTo(pixel, plotRect.top + plotRect.height);
      } else {
        ctx.moveTo(plotRect.left, pixel);
        ctx.lineTo(plotRect.left + plotRect.width, pixel);
      }
      ctx.stroke();
      ctx.restore();
    }

    const locatorValue = toLocatorValue(locatorX);
    if (
      locatorValue !== null &&
      locatorValue >= scale.xMin &&
      locatorValue <= scale.xMax
    ) {
      const x = scale.xToPx(locatorValue);
      ctx.save();
      ctx.strokeStyle = LOCATOR_LINE_STROKE;
      ctx.lineWidth = 1;
      setLineDash(ctx, LOCATOR_LINE_DASH);
      ctx.beginPath();
      ctx.moveTo(x, plotRect.top);
      ctx.lineTo(x, plotRect.top + plotRect.height);
      ctx.stroke();
      ctx.restore();
    }

    for (const item of preparedSeries) {
      if (item.points.length < 2) continue;
      pointCount += item.points.length;
      ctx.save();
      ctx.strokeStyle = item.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      let started = false;
      for (const point of item.points) {
        const x = scale.xToPx(point.x);
        const y = scale.yToPx(point.y);
        if (!started) {
          ctx.moveTo(x, y);
          started = true;
        } else {
          ctx.lineTo(x, y);
        }
      }
      if (started) ctx.stroke();
      ctx.restore();
    }
    ctx.restore();

    const durationMs = getDeviceAnalysisPerfNow() - startedAt;
    if (durationMs >= 8 || preparedSeries.length >= 8 || pointCount >= 3000) {
      logDeviceAnalysisPerf("render:diagnostics-canvas", {
        durationMs,
        height: size.height,
        pointCount,
        seriesCount: preparedSeries.length,
        width: size.width,
      });
    }
  }, [
    plotRect,
    preparedSeries,
    locatorX,
    referenceLines,
    scale,
    size.height,
    size.width,
    axisTitleFontSize,
    tickLabelFontSize,
    xFactor,
    xLabelInterval,
    xTickDigits,
    xTicks,
    yAxisLabel,
    yTickDigits,
    yTicks,
  ]);

  const handleMouseMove = (event: React.MouseEvent<HTMLDivElement>) => {
    const element = wrapperRef.current;
    if (!element || !plotRect || !scale || !preparedSeries.length) return;
    const rect = element.getBoundingClientRect();
    const mx = event.clientX - rect.left;
    const my = event.clientY - rect.top;
    if (
      mx < plotRect.left ||
      mx > plotRect.left + plotRect.width ||
      my < plotRect.top ||
      my > plotRect.top + plotRect.height
    ) {
      setTooltip((prev) => (prev.visible ? { ...prev, visible: false } : prev));
      return;
    }

    const locatorValue = toLocatorValue(locatorX);
    const locatorPx =
      locatorValue !== null &&
      locatorValue >= scale.xMin &&
      locatorValue <= scale.xMax
        ? scale.xToPx(locatorValue)
        : null;
    let rawX = scale.pxToX(mx);
    let cursorX = mx;
    if (
      locatorValue !== null &&
      locatorPx !== null &&
      Math.abs(mx - locatorPx) <= LOCATOR_LINE_SNAP_PX
    ) {
      rawX = locatorValue;
      cursorX = locatorPx;
    }
    let best:
      | {
          color: string;
          label: string;
          point: { x: number; y: number };
          score: number;
        }
      | null = null;
    for (const item of preparedSeries) {
      const point = getCurvePointAtX(item, rawX);
      if (!point) continue;
      if (
        point.x < scale.xMin ||
        point.x > scale.xMax ||
        point.y < scale.yMin ||
        point.y > scale.yMax
      ) {
        continue;
      }
      const px = scale.xToPx(point.x);
      const py = scale.yToPx(point.y);
      const score = Math.abs(px - mx) * 0.35 + Math.abs(py - my);
      if (!best || score < best.score) {
        best = { color: item.color, label: item.lineName, point, score };
      }
    }

    if (!best) {
      setTooltip((prev) => (prev.visible ? { ...prev, visible: false } : prev));
      return;
    }

    const markers: MarkerPoint[] = [];
    for (const item of preparedSeries) {
      const point = getCurvePointAtX(item, rawX);
      if (!point || point.y < scale.yMin || point.y > scale.yMax) continue;
      markers.push({
        color: item.color,
        x: scale.xToPx(rawX),
        y: scale.yToPx(point.y),
      });
    }

    setTooltip({
      color: best.color,
      cursorX,
      label: best.label,
      markers,
      visible: true,
      x: clamp(cursorX + 12, 8, Math.max(8, size.width - TOOLTIP_WIDTH)),
      xValue: best.point.x,
      y: clamp(my + 12, 8, Math.max(8, size.height - TOOLTIP_HEIGHT)),
      yValue: best.point.y,
    });
  };

  const handleMouseLeave = () => {
    setTooltip((prev) => (prev.visible ? { ...prev, visible: false } : prev));
  };

  const xSuffix = xUnitLabel ? ` ${xUnitLabel}` : "";
  const ySuffix = valueUnitLabel ? ` ${valueUnitLabel}` : "";

  return (
    <div
      ref={wrapperRef}
      className="relative h-full w-full"
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      <canvas ref={canvasRef} className="absolute inset-0" aria-label={ariaLabel} />
      {locatorMarkers.map((marker, index) => (
        <div
          key={`locator-marker-${index}`}
          className="pointer-events-none absolute z-[2] h-2.5 w-2.5 rounded-full border-2 border-white shadow"
          style={{
            backgroundColor: marker.color,
            left: marker.x - 5,
            top: marker.y - 5,
          }}
        />
      ))}
      {tooltip.visible && plotRect ? (
        <div
          className="pointer-events-none absolute z-[3] overflow-hidden"
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
          {tooltip.markers.map((marker, index) => (
            <div
              key={`tooltip-marker-${index}`}
              className="absolute h-2.5 w-2.5 rounded-full border-2 border-white shadow"
              style={{
                backgroundColor: marker.color,
                left: marker.x - plotRect.left - 5,
                top: marker.y - plotRect.top - 5,
              }}
            />
          ))}
        </div>
      ) : null}
      {tooltip.visible ? (
        <div
          className="pointer-events-none absolute z-10"
          style={{ left: tooltip.x, top: tooltip.y }}
        >
          <div className="rounded-lg border border-[#333] bg-[#1e1e1e] px-2 py-1.5 text-white shadow-xl">
            <div className="flex max-w-[200px] items-center gap-2 truncate text-xs font-medium">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-sm"
                style={{ backgroundColor: tooltip.color }}
              />
              <span className="truncate">{tooltip.label}</span>
            </div>
            <div className="mt-1 font-mono text-[11px] text-[#ccc]">
              x=
              {formatNumber(tooltip.xValue * xFactor, {
                digits: xTooltipDigits,
              })}
              {xSuffix}
            </div>
            <div className="font-mono text-[11px] text-[#ccc]">
              y=
              {formatNumber(tooltip.yValue, {
                digits: yTooltipDigits,
              })}
              {ySuffix}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
});

CanvasDiagnosticsChart.displayName = "CanvasDiagnosticsChart";

export default CanvasDiagnosticsChart;
