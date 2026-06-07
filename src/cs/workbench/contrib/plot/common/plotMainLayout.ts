// Computes the main plot chart layout, scale functions, and axis tick positions.
export type PlotRect = {
  readonly bottom: number;
  readonly height: number;
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly width: number;
};

export type ChartScale = {
  readonly xToPixel: (value: number) => number;
  readonly yToPixel: (value: number) => number;
  readonly pixelToX: (value: number) => number;
};

export type PlotMainLayout = {
  readonly plotRect: PlotRect;
  readonly scale: ChartScale;
  readonly xMinorTicks: readonly number[];
  readonly xTicks: readonly number[];
  readonly yMinorTicks: readonly number[];
  readonly yTicks: readonly number[];
};

export type PlotMainLayoutOptions = {
  readonly minorTickCount?: number | "" | null;
  readonly showAxes?: boolean;
  readonly showMinorTicks?: boolean;
  readonly xDomain: [number, number];
  readonly xTicks?: readonly number[] | null;
  readonly yDomain: [number, number];
  readonly yTicks?: readonly number[] | null;
};

const DEFAULT_MARGIN = { top: 20, right: 20, bottom: 46, left: 64 };
const PREVIEW_MARGIN = { top: 10, right: 10, bottom: 10, left: 10 };

export const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

export const normalizeDomain = (domain: readonly number[]): [number, number] => {
  const left = Number(domain[0]);
  const right = Number(domain[1]);
  if (!Number.isFinite(left) || !Number.isFinite(right)) return [0, 1];
  if (left === right) return [left - 0.5, right + 0.5];
  return [Math.min(left, right), Math.max(left, right)];
};

export const createTicks = (
  domain: [number, number],
  requested?: readonly number[] | null,
): number[] => {
  if (Array.isArray(requested) && requested.length) {
    return requested.map(Number).filter(Number.isFinite);
  }

  const [min, max] = domain;
  const step = (max - min) / 4;
  if (!Number.isFinite(step) || step <= 0) return [min, max];
  return [0, 1, 2, 3, 4].map((index) => min + step * index);
};

export const createMinorTicks = (
  majorTicks: readonly number[],
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

export const createScale = (
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

export const createPlotMainLayout = (
  width: number,
  height: number,
  options: PlotMainLayoutOptions,
): PlotMainLayout => {
  const showAxes = options.showAxes !== false;
  const margin = showAxes ? DEFAULT_MARGIN : PREVIEW_MARGIN;
  const plotRect: PlotRect = {
    left: margin.left,
    top: margin.top,
    right: width - margin.right,
    bottom: height - margin.bottom,
    width: Math.max(1, width - margin.left - margin.right),
    height: Math.max(1, height - margin.top - margin.bottom),
  };
  const scale = createScale(plotRect, options.xDomain, options.yDomain);
  const xTicks = showAxes ? createTicks(options.xDomain, options.xTicks) : [];
  const yTicks = showAxes ? createTicks(options.yDomain, options.yTicks) : [];
  const xMinorTicks = !showAxes || options.showMinorTicks === false
    ? []
    : createMinorTicks(xTicks, options.xDomain, options.minorTickCount);
  const yMinorTicks = !showAxes || options.showMinorTicks === false
    ? []
    : createMinorTicks(yTicks, options.yDomain, options.minorTickCount);

  return {
    plotRect,
    scale,
    xMinorTicks,
    xTicks,
    yMinorTicks,
    yTicks,
  };
};
