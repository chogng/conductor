import { splitBidirectionalCurvePoints } from "../../diagnostics/common/analysisMath.ts";

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

const valueToCanvasSign = (point: CanvasPlotPoint | null | undefined): number | null => {
  const sign = toFiniteCanvasNumber(point?.__chartSign);
  if (sign === null || sign === 0) return null;
  return sign > 0 ? 1 : -1;
};

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
    let previousSign: number | null = null;
    for (const point of segment) {
      const xVal = toFiniteCanvasNumber(point?.x);
      const yVal = valueToCanvasY(point, chartYDataKey);
      const sign = effectiveYScale !== "linear" ? valueToCanvasSign(point) : null;
      if (xVal === null || yVal === null) {
        pushRun(run);
        run = [];
        previousSign = null;
        continue;
      }
      if (
        effectiveYScale !== "linear" &&
        previousSign !== null &&
        sign !== null &&
        sign !== previousSign
      ) {
        pushRun(run);
        run = [];
      }
      if (effectiveYScale !== "linear" && xVal < xMin) {
        pushRun(run);
        run = [];
        previousSign = null;
        continue;
      }
      if (effectiveYScale !== "linear" && xVal > xMax) {
        pushRun(run);
        run = [];
        previousSign = null;
        continue;
      }
      run.push({ x: xVal, y: yVal });
      previousSign = sign;
    }
    pushRun(run);
  }

  return runs;
};
