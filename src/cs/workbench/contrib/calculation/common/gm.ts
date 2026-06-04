import { computeCentralDerivative } from "src/cs/workbench/contrib/diagnostics/common/analysisMath";
import type { SourcePoint } from "src/cs/workbench/contrib/calculation/common/calculatedData";

export const calculateGmPoints = (points: readonly SourcePoint[]): SourcePoint[] =>
  toSourcePoints(computeCentralDerivative(points));

const toSourcePoints = (points: unknown): SourcePoint[] => {
  if (!Array.isArray(points)) {
    return [];
  }

  const sourcePoints: SourcePoint[] = [];
  for (const point of points) {
    if (!point || typeof point !== "object") {
      continue;
    }

    const value = point as Record<string, unknown>;
    const x = Number(value.x);
    const y = Number(value.y);
    if (Number.isFinite(x) && Number.isFinite(y)) {
      sourcePoints.push({ x, y });
    }
  }
  return sourcePoints;
};
