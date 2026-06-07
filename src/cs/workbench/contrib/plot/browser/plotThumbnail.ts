import {
  padLinearDomain,
  padLogDomain,
} from "src/cs/workbench/contrib/plot/browser/plotViewModel";

// Plot thumbnail owns the lightweight plot rendering used in compact previews.
// Callers own file metadata, selection state, badges, labels, and lifecycle.
import "src/cs/workbench/contrib/plot/browser/media/plot.css";

type Padding = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

type PlotThumbnailDomain = {
  x?: [number, number] | number[];
  y?: [number, number] | number[];
};

type PlotThumbnailSeries = {
  name?: string;
  groupIndex?: number;
  y?: ArrayLike<unknown> | null;
  [key: string]: unknown;
};

export type PlotThumbnailData = {
  xGroups?: number[][];
  series?: PlotThumbnailSeries[];
  domain?: PlotThumbnailDomain | null;
};

export type PlotThumbnailProps = PlotThumbnailData & {
  yScaleType?: "linear" | "log";
  yLogCurrentMode?: "all" | "positive";
  padding?: Padding;
  title?: string;
  className?: string;
};

const DEFAULT_PADDING: Padding = { top: 20, right: 10, bottom: 10, left: 10 };

type ResolvedPlotThumbnailDomain = {
  x: [number, number];
  y: [number, number];
};

const normalizeDomainTuple = (
  raw: PlotThumbnailDomain[keyof PlotThumbnailDomain] | null | undefined,
): [number, number] | null => {
  const start = Number(raw?.[0]);
  const end = Number(raw?.[1]);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  const lo = Math.min(start, end);
  const hi = Math.max(start, end);
  if (lo === hi) return padLinearDomain(lo, hi);
  return [lo, hi];
};

const resolvePlotThumbnailYForScale = (
  value: unknown,
  yScaleType: "linear" | "log",
  yLogCurrentMode: "all" | "positive" = "all",
): number | null => {
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  if (yScaleType !== "log") return num;
  if (yLogCurrentMode === "positive") return num > 0 ? num : null;
  const abs = Math.abs(num);
  return abs > 0 ? abs : null;
};

export const resolvePlotThumbnailDomain = ({
  xGroups,
  series,
  domain,
  yScaleType,
  yLogCurrentMode = "all",
}: Pick<
  PlotThumbnailProps,
  "xGroups" | "series" | "domain" | "yScaleType" | "yLogCurrentMode"
>): ResolvedPlotThumbnailDomain => {
  const explicitXDomain = normalizeDomainTuple(domain?.x);
  const explicitYDomain = normalizeDomainTuple(domain?.y);
  let minX = Infinity;
  let maxX = -Infinity;
  for (const xArr of xGroups ?? []) {
    for (const xRaw of xArr ?? []) {
      const xVal = Number(xRaw);
      if (!Number.isFinite(xVal)) continue;
      minX = Math.min(minX, xVal);
      maxX = Math.max(maxX, xVal);
    }
  }

  const wantsLogScale = String(yScaleType ?? "linear") === "log";
  let minY = Infinity;
  let maxY = -Infinity;
  for (const plotSeries of series ?? []) {
    const yArr = plotSeries?.y;
    if (!yArr) continue;
    for (let index = 0; index < (yArr.length ?? 0); index++) {
      const yVal = resolvePlotThumbnailYForScale(
        yArr[index],
        wantsLogScale ? "log" : "linear",
        yLogCurrentMode,
      );
      if (yVal === null) continue;
      minY = Math.min(minY, yVal);
      maxY = Math.max(maxY, yVal);
    }
  }

  const yDomainResolved =
    explicitYDomain ??
    (Number.isFinite(minY) && Number.isFinite(maxY)
      ? wantsLogScale
        ? padLogDomain(minY, maxY)
        : padLinearDomain(minY, maxY)
      : [0, 1]);

  return {
    x:
      explicitXDomain ??
      (Number.isFinite(minX) && Number.isFinite(maxX)
        ? padLinearDomain(minX, maxX)
        : [0, 1]),
    y: yDomainResolved,
  };
};

const PlotThumbnail = (props: PlotThumbnailProps): HTMLElement =>
  createPlotThumbnail(props);

export const createPlotThumbnail = ({
  className = "",
  domain,
  padding = DEFAULT_PADDING,
  series = [],
  title,
  xGroups = [],
  yLogCurrentMode = "all",
  yScaleType = "linear",
}: PlotThumbnailProps): HTMLElement => {
  const root = document.createElement("div");
  root.className = `plot_thumbnail ${className}`.trim();
  if (title) {
    root.title = title;
  }

  const canvas = document.createElement("canvas");
  canvas.className = "plot_thumbnail_canvas";
  root.append(canvas);

  const resolvedDomain = resolvePlotThumbnailDomain({
    domain,
    series,
    xGroups,
    yLogCurrentMode,
    yScaleType,
  });
  requestAnimationFrame(() =>
    drawPlotThumbnail(canvas, {
      padding,
      resolvedDomain,
      series,
      xGroups,
    }),
  );
  return root;
};

const drawPlotThumbnail = (
  canvas: HTMLCanvasElement,
  {
    padding,
    resolvedDomain,
    series,
    xGroups,
  }: {
    readonly padding: Padding;
    readonly resolvedDomain: ResolvedPlotThumbnailDomain;
    readonly series: PlotThumbnailSeries[];
    readonly xGroups: number[][];
  },
): void => {
  const { width, height } = resolveCanvasSize(canvas, 320, 160);
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);

  const context = canvas.getContext("2d");
  if (!context) return;
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  context.clearRect(0, 0, width, height);

  const plotLeft = padding.left;
  const plotTop = padding.top;
  const plotWidth = Math.max(1, width - padding.left - padding.right);
  const plotHeight = Math.max(1, height - padding.top - padding.bottom);
  const [xMin, xMax] = resolvedDomain.x;
  const [yMin, yMax] = resolvedDomain.y;

  series.forEach((item, seriesIndex) => {
    const yArr = item.y;
    const xArr = xGroups[item.groupIndex ?? seriesIndex] ?? xGroups[0] ?? [];
    if (!yArr || !xArr.length) return;

    context.beginPath();
    context.strokeStyle = getColor(seriesIndex);
    context.lineWidth = 1.4;
    let started = false;
    for (let index = 0; index < Math.min(xArr.length, yArr.length); index++) {
      const xValue = Number(xArr[index]);
      const yValue = Number(yArr[index]);
      if (!Number.isFinite(xValue) || !Number.isFinite(yValue)) continue;
      const x = plotLeft + ((xValue - xMin) / (xMax - xMin || 1)) * plotWidth;
      const y = plotTop + (1 - (yValue - yMin) / (yMax - yMin || 1)) * plotHeight;
      if (!started) {
        context.moveTo(x, y);
        started = true;
      } else {
        context.lineTo(x, y);
      }
    }
    if (started) {
      context.stroke();
    }
  });
};

const resolveCanvasSize = (
  canvas: HTMLCanvasElement,
  fallbackWidth: number,
  fallbackHeight: number,
): { height: number; width: number } => {
  const rect = canvas.getBoundingClientRect();
  const parentRect = canvas.parentElement?.getBoundingClientRect();
  return {
    height: Math.max(1, rect.height || parentRect?.height || canvas.clientHeight || fallbackHeight),
    width: Math.max(1, rect.width || parentRect?.width || canvas.clientWidth || fallbackWidth),
  };
};

const getColor = (index: number): string =>
  ["#60a5fa", "#f97316", "#22c55e", "#e879f9", "#f43f5e"][index % 5];

export default PlotThumbnail;
