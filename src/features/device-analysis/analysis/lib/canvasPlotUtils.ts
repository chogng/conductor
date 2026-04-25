import { splitBidirectionalCurvePoints } from "./analysisMath.ts";

export type CanvasPlotPoint = {
  x?: unknown;
  [key: string]: unknown;
};

export type CanvasLineRun = Array<{ x: number; y: number }>;

export const toFiniteCanvasNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};

export const valueToCanvasY = (
  point: CanvasPlotPoint | null | undefined,
  chartYDataKey: string,
): number | null => toFiniteCanvasNumber(point?.[chartYDataKey]);

export const collectCanvasLineRuns = ({
  chartYDataKey,
  data,
  effectiveYScale,
  xMax,
  xMin,
}: {
  chartYDataKey: string;
  data: CanvasPlotPoint[] | null | undefined;
  effectiveYScale: "linear" | "log" | "logAbs";
  xMax: number;
  xMin: number;
}): CanvasLineRun[] => {
  if (!Array.isArray(data) || data.length < 2) return [];

  const segments =
    effectiveYScale !== "linear"
      ? splitBidirectionalCurvePoints(data).map((segment: any) => segment.points)
      : [data];
  const runs: CanvasLineRun[] = [];

  const pushRun = (run: CanvasLineRun) => {
    if (run.length >= 2) runs.push(run);
  };

  for (const segment of segments) {
    if (!Array.isArray(segment) || segment.length < 2) continue;
    let run: CanvasLineRun = [];
    for (const point of segment) {
      const xVal = toFiniteCanvasNumber(point?.x);
      const yVal = valueToCanvasY(point, chartYDataKey);
      if (xVal === null || yVal === null) {
        pushRun(run);
        run = [];
        continue;
      }
      if (effectiveYScale !== "linear" && xVal < xMin) {
        pushRun(run);
        run = [];
        continue;
      }
      if (effectiveYScale !== "linear" && xVal > xMax) {
        pushRun(run);
        run = [];
        continue;
      }
      run.push({ x: xVal, y: yVal });
    }
    pushRun(run);
  }

  return runs;
};
