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

const CanvasDiagnosticsChart = (props: CanvasDiagnosticsChartProps): any =>
  createCanvasDiagnosticsChart(props);

export const createCanvasDiagnosticsChart = ({
  ariaLabel,
  referenceLines = [],
  series,
  xDomain,
  yAxisLabel,
  yDomain,
}: CanvasDiagnosticsChartProps): HTMLElement => {
  const root = document.createElement("div");
  root.className = "diagnostics_canvas_root";

  const canvas = document.createElement("canvas");
  canvas.className = "diagnostics_canvas";
  canvas.setAttribute("aria-label", ariaLabel);
  root.append(canvas);

  root.dataset.seriesCount = String(series.length);
  root.dataset.referenceLineCount = String(referenceLines.length);
  root.dataset.xDomain = xDomain.join(",");
  root.dataset.yDomain = yDomain.join(",");
  root.dataset.yAxisLabel = yAxisLabel;

  queueMicrotask(() => drawChart(canvas, series, xDomain, yDomain));
  return root;
};

const drawChart = (
  canvas: HTMLCanvasElement,
  series: DiagnosticsSeries[],
  xDomain: number[],
  yDomain: number[],
): void => {
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(1, Math.round(rect.width || canvas.clientWidth || 320));
  const height = Math.max(1, Math.round(rect.height || canvas.clientHeight || 180));
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;

  const context = canvas.getContext("2d");
  if (!context) {
    return;
  }
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  context.clearRect(0, 0, width, height);
  context.strokeStyle = "rgba(148, 163, 184, 0.35)";
  context.lineWidth = 1;
  context.strokeRect(0.5, 0.5, width - 1, height - 1);

  const [xMin, xMax] = getDomain(xDomain);
  const [yMin, yMax] = getDomain(yDomain);
  const plotLeft = 42;
  const plotTop = 18;
  const plotWidth = Math.max(1, width - 58);
  const plotHeight = Math.max(1, height - 42);

  for (const [index, item] of series.entries()) {
    const points = item.data
      .map((point) => ({
        x: Number(point.x),
        y: Number(point.y),
      }))
      .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
    if (points.length < 2) {
      continue;
    }

    context.beginPath();
    context.strokeStyle = item.color || getFallbackColor(index);
    context.lineWidth = 1.5;
    points.forEach((point, pointIndex) => {
      const x = plotLeft + ((point.x - xMin) / (xMax - xMin || 1)) * plotWidth;
      const y =
        plotTop + (1 - (point.y - yMin) / (yMax - yMin || 1)) * plotHeight;
      if (pointIndex === 0) {
        context.moveTo(x, y);
      } else {
        context.lineTo(x, y);
      }
    });
    context.stroke();
  }
};

const getDomain = (domain: number[]): [number, number] => {
  const start = Number(domain[0]);
  const end = Number(domain[1]);
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return [0, 1];
  }
  if (start === end) {
    return [start - 0.5, end + 0.5];
  }
  return [Math.min(start, end), Math.max(start, end)];
};

const getFallbackColor = (index: number): string =>
  ["#60a5fa", "#f97316", "#22c55e", "#e879f9", "#f43f5e"][index % 5];

export default CanvasDiagnosticsChart;
