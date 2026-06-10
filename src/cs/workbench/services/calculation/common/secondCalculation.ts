/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/
import {
  calculateGmPoints,
  type CalculationPoint,
} from "./firstCalculation.ts";

export type SecondCalculationKind = "secondDerivative";

export type SecondCalculationSourceKind = "gm" | "ss" | "vth" | "iv";

export type SecondCalculationSource = {
  readonly fileId: string | null;
  readonly inputKind: SecondCalculationSourceKind;
};

export type SecondCalculationResult = {
  readonly kind: SecondCalculationKind;
  readonly source: SecondCalculationSource;
  readonly points: CalculationPoint[];
};

// Second-pass calculation consumes first-pass points, not cleaned source data.
export const calculateSecondDerivativePoints = (
  points: readonly CalculationPoint[],
): CalculationPoint[] => calculateGmPoints(points);

export const createSecondDerivativeResult = ({
  fileId,
  inputKind,
  points,
}: {
  readonly fileId?: string | null;
  readonly inputKind: SecondCalculationSourceKind;
  readonly points: readonly CalculationPoint[];
}): SecondCalculationResult => ({
  kind: "secondDerivative",
  points: calculateSecondDerivativePoints(points),
  source: {
    fileId: fileId ?? null,
    inputKind,
  },
});
