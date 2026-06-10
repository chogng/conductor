/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/
import {
  computeCentralDerivative,
  computeSubthresholdSwing,
} from "./curveCalculation.ts";
import { createVthSqrtPoints } from "./vthCalculation.ts";

export type CalculationPoint = {
  readonly x: number;
  readonly y: number;
};

export {
  classifySsFit,
  computeCentralDerivative,
  computeDomain,
  computeLegendDerivativeSeries,
  computeSubthresholdSwing,
  computeSubthresholdSwingFitAuto,
  computeSubthresholdSwingFitInRange,
  interpolateCurveAtX,
  resolveAutoSsSelection,
  splitBidirectionalCurvePoints,
  SS_CONF,
} from "./curveCalculation.ts";
export {
  computeBaseCurrentMetrics,
  isOutputLikeFile,
  isTransferLikeFile,
  type BaseCurrentMetrics,
  type CurrentWindowKind,
  type CurrentWindowMeta,
  type IonIoffManualTargets,
  type IonIoffMethod,
} from "./metricCalculation.ts";
export {
  computeVthSqrtFits,
  createVthSqrtPoints,
  type VthBranch,
  type VthFitResult,
} from "./vthCalculation.ts";

// First-pass calculation output can be drawn directly or committed to session.
export const calculateIvPoints = (
  points: readonly CalculationPoint[],
): CalculationPoint[] => points.map(({ x, y }) => ({ x, y }));

export const calculateGmPoints = (
  points: readonly CalculationPoint[],
): CalculationPoint[] => toCalculationPoints(computeCentralDerivative(points));

export const calculateSsPoints = (
  points: readonly CalculationPoint[],
): CalculationPoint[] => toCalculationPoints(computeSubthresholdSwing(points));

export const calculateVthPoints = (
  points: readonly CalculationPoint[],
): CalculationPoint[] => createVthSqrtPoints(points);

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
