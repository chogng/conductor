import type { SourcePoint } from "src/cs/workbench/contrib/calculation/common/calculatedData";

export const calculateVthPoints = (points: readonly SourcePoint[]): SourcePoint[] =>
  points.map((point) => ({
    x: point.x,
    y: Math.sqrt(Math.abs(point.y)),
  }));
