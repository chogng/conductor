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

const toCalculationPoint = (x: unknown, y: unknown): CalculationPoint | null => {
  const xValue = Number(x);
  const yValue = Number(y);
  return Number.isFinite(xValue) && Number.isFinite(yValue)
    ? { x: xValue, y: yValue }
    : null;
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

const calculateGmPointSegment = (
  points: readonly CalculationPoint[],
): CalculationPoint[] => {
  if (!Array.isArray(points) || points.length < 2) {
    return [];
  }

  const out: CalculationPoint[] = [];
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const x = current?.x;
    const y = current?.y;
    if (!isFiniteNumber(x) || !isFiniteNumber(y)) {
      continue;
    }

    const previous = index > 0 ? points[index - 1] : null;
    const next = index < points.length - 1 ? points[index + 1] : null;
    if (previous && next) {
      const dx = next.x - previous.x;
      const point = isFiniteNumber(dx) && dx !== 0
        ? toCalculationPoint(x, (next.y - previous.y) / dx)
        : null;
      if (point) {
        out.push(point);
      }
      continue;
    }

    if (next) {
      const dx = next.x - x;
      const point = isFiniteNumber(dx) && dx !== 0
        ? toCalculationPoint(x, (next.y - y) / dx)
        : null;
      if (point) {
        out.push(point);
      }
      continue;
    }

    if (previous) {
      const dx = x - previous.x;
      const point = isFiniteNumber(dx) && dx !== 0
        ? toCalculationPoint(x, (y - previous.y) / dx)
        : null;
      if (point) {
        out.push(point);
      }
    }
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
): CalculationPoint[] => {
  const segments = splitBidirectionalCurvePoints(points);
  if (!segments.length) {
    return [];
  }
  if (segments.length === 1) {
    return calculateGmPointSegment(segments[0].points);
  }
  return segments.flatMap((segment: any, index: number) => {
    const computed = calculateGmPointSegment(segment.points);
    return index === 0 ? computed : computed.slice(1);
  });
};

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
