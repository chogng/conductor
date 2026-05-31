import {
  padLinearDomain,
  padLogDomain,
} from "src/cs/workbench/contrib/chart/browser/chartViewModel";

type Padding = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

type ChartDomain = {
  x?: [number, number] | number[];
  y?: [number, number] | number[];
};

type ChartSeries = {
  name?: string;
  groupIndex?: number;
  y?: ArrayLike<unknown> | null;
  [key: string]: unknown;
};

export type CanvasMultiLineChartProps = {
  xGroups?: number[][];
  series?: ChartSeries[];
  domain?: ChartDomain | null;
  xScaleFactor?: number;
  xUnitLabel?: string;
  yScaleFactor?: number;
  yScaleType?: "linear" | "log";
  yLogCurrentMode?: "all" | "positive";
  yUnitLabel?: string;
  padding?: Padding;
  title?: string;
  className?: string;
};

const DEFAULT_PADDING: Padding = { top: 20, right: 10, bottom: 10, left: 10 };

type ResolvedPreviewDomain = {
  x: [number, number];
  y: [number, number];
  effectiveYScaleType: "linear" | "log";
};

type ResolvedPreviewYDataRange = {
  min: number | null;
  max: number | null;
};

const normalizeDomainTuple = (
  raw: ChartDomain[keyof ChartDomain] | null | undefined,
): [number, number] | null => {
  const start = Number(raw?.[0]);
  const end = Number(raw?.[1]);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  const lo = Math.min(start, end);
  const hi = Math.max(start, end);
  if (lo === hi) return padLinearDomain(lo, hi);
  return [lo, hi];
};

const resolvePreviewYForScale = (
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

export const resolvePreviewChartYDataRange = ({
  series,
  yScaleType,
  yLogCurrentMode = "all",
}: Pick<
  CanvasMultiLineChartProps,
  "series" | "yScaleType" | "yLogCurrentMode"
>): ResolvedPreviewYDataRange => {
  const resolvedYScaleType = String(yScaleType ?? "linear") === "log" ? "log" : "linear";
  let minY = Infinity;
  let maxY = -Infinity;
  for (const chartSeries of series ?? []) {
    const yArr = chartSeries?.y;
    if (!yArr) continue;
    for (let index = 0; index < (yArr.length ?? 0); index++) {
      const yVal = resolvePreviewYForScale(
        yArr[index],
        resolvedYScaleType,
        yLogCurrentMode,
      );
      if (yVal === null) continue;
      minY = Math.min(minY, yVal);
      maxY = Math.max(maxY, yVal);
    }
  }
  return {
    min: Number.isFinite(minY) ? minY : null,
    max: Number.isFinite(maxY) ? maxY : null,
  };
};

export const resolvePreviewChartDomain = ({
  xGroups,
  series,
  domain,
  yScaleType,
  yLogCurrentMode = "all",
}: Pick<
  CanvasMultiLineChartProps,
  "xGroups" | "series" | "domain" | "yScaleType" | "yLogCurrentMode"
>): ResolvedPreviewDomain => {
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
  for (const chartSeries of series ?? []) {
    const yArr = chartSeries?.y;
    if (!yArr) continue;
    for (let index = 0; index < (yArr.length ?? 0); index++) {
      const yVal = resolvePreviewYForScale(
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
    effectiveYScaleType: wantsLogScale ? "log" : "linear",
  };
};

const CanvasMultiLineChart = (props: CanvasMultiLineChartProps): any =>
  createCanvasMultiLineChart(props);

export const createCanvasMultiLineChart = ({
  className = "",
  domain,
  padding = DEFAULT_PADDING,
  series = [],
  title,
  xGroups = [],
  yLogCurrentMode = "all",
  yScaleType = "linear",
}: CanvasMultiLineChartProps): HTMLElement => {
  const root = document.createElement("div");
  root.className = `relative h-full w-full ${className}`.trim();
  if (title) {
    root.title = title;
  }

  const canvas = document.createElement("canvas");
  canvas.className = "absolute inset-0";
  root.append(canvas);

  const resolvedDomain = resolvePreviewChartDomain({
    domain,
    series,
    xGroups,
    yLogCurrentMode,
    yScaleType,
  });
  queueMicrotask(() =>
    drawPreviewChart(canvas, {
      padding,
      resolvedDomain,
      series,
      xGroups,
    }),
  );
  return root;
};

const drawPreviewChart = (
  canvas: HTMLCanvasElement,
  {
    padding,
    resolvedDomain,
    series,
    xGroups,
  }: {
    readonly padding: Padding;
    readonly resolvedDomain: ResolvedPreviewDomain;
    readonly series: ChartSeries[];
    readonly xGroups: number[][];
  },
): void => {
  const width = Math.max(1, canvas.clientWidth || 320);
  const height = Math.max(1, canvas.clientHeight || 160);
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;

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

  context.strokeStyle = "rgba(148, 163, 184, 0.35)";
  context.strokeRect(plotLeft + 0.5, plotTop + 0.5, plotWidth - 1, plotHeight - 1);

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

const getColor = (index: number): string =>
  ["#60a5fa", "#f97316", "#22c55e", "#e879f9", "#f43f5e"][index % 5];

export default CanvasMultiLineChart;
