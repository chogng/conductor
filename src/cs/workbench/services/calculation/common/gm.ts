/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type { CalculationPoint } from "./calculationTypes.ts";
import { splitBidirectionalCurvePoints } from "./sweepSegmentation.ts";

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const toPoint = (x: unknown, y: unknown) => {
  const yVal = isFiniteNumber(y) ? y : null;
  const yAbs = yVal === null ? null : Math.abs(yVal);
  return {
    x,
    y: yVal,
    yPositive: yVal !== null && yVal > 0 ? yVal : null,
    yAbsPositive: yAbs !== null && yAbs > 0 ? yAbs : null,
  };
};

const toCalculationPoints = (points: unknown): CalculationPoint[] => {
  if (!Array.isArray(points)) {
    return [];
  }

  const calculatedPoints: CalculationPoint[] = [];
  for (const point of points) {
    if (!point || typeof point !== "object") {
      continue;
    }

    const value = point as Record<string, unknown>;
    const x = Number(value.x);
    const y = Number(value.y);
    if (Number.isFinite(x) && Number.isFinite(y)) {
      calculatedPoints.push({ x, y });
    }
  }
  return calculatedPoints;
};

const computeCentralDerivativeSegment = (points: any) => {
  if (!Array.isArray(points) || points.length < 2) {
    return [];
  }
  const out = new Array(points.length);
  for (let i = 0; i < points.length; i++) {
    const curr = points[i];
    const x = curr?.x;
    const y = curr?.y;
    if (!isFiniteNumber(x) || !isFiniteNumber(y)) {
      out[i] = toPoint(x, null);
      continue;
    }
    const prev = i > 0 ? points[i - 1] : null;
    const next = i < points.length - 1 ? points[i + 1] : null;
    if (prev && next) {
      const dx = next.x - prev.x;
      if (!isFiniteNumber(dx) || dx === 0) {
        out[i] = toPoint(x, null);
        continue;
      }
      out[i] = toPoint(x, (next.y - prev.y) / dx);
      continue;
    }
    if (next) {
      const dx = next.x - x;
      if (!isFiniteNumber(dx) || dx === 0) {
        out[i] = toPoint(x, null);
        continue;
      }
      out[i] = toPoint(x, (next.y - y) / dx);
      continue;
    }
    if (prev) {
      const dx = x - prev.x;
      if (!isFiniteNumber(dx) || dx === 0) {
        out[i] = toPoint(x, null);
        continue;
      }
      out[i] = toPoint(x, (y - prev.y) / dx);
      continue;
    }
    out[i] = toPoint(x, null);
  }
  return out;
};

export const computeCentralDerivative = (points: any) => {
  const segments = splitBidirectionalCurvePoints(points);
  if (!segments.length) {
    return [];
  }
  if (segments.length === 1) {
    return computeCentralDerivativeSegment(segments[0].points);
  }
  return segments.flatMap((segment: any, index: number) => {
    const computed = computeCentralDerivativeSegment(segment.points);
    return index === 0 ? computed : computed.slice(1);
  });
};

export const calculateGmPoints = (
  points: readonly CalculationPoint[],
): CalculationPoint[] => toCalculationPoints(computeCentralDerivative(points));

export type SecondDerivativeSourceKind = "gm" | "ss" | "vth" | "iv";

export type SecondDerivativeSource = {
  readonly fileId: string | null;
  readonly inputKind: SecondDerivativeSourceKind;
};

export type SecondDerivativeResult = {
  readonly kind: "secondDerivative";
  readonly source: SecondDerivativeSource;
  readonly points: CalculationPoint[];
};

export const calculateSecondDerivativePoints = (
  points: readonly CalculationPoint[],
): CalculationPoint[] => calculateGmPoints(points);

export const createSecondDerivativeResult = ({
  fileId,
  inputKind,
  points,
}: {
  readonly fileId?: string | null;
  readonly inputKind: SecondDerivativeSourceKind;
  readonly points: readonly CalculationPoint[];
}): SecondDerivativeResult => ({
  kind: "secondDerivative",
  points: calculateSecondDerivativePoints(points),
  source: {
    fileId: fileId ?? null,
    inputKind,
  },
});
