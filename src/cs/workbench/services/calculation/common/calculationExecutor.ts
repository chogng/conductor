/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import {
  calculateGmPoints,
} from "./gm.ts";
import {
  calculateSsPoints,
} from "./ss.ts";
import {
  calculateVthPoints,
} from "./vth.ts";
import type {
  CalculationKind,
  CalculationPoint,
} from "./calculationTypes.ts";

export type CalculationAlgorithmId =
  | "base.identity"
  | "gm.centralDerivative"
  | "ss.subthresholdSwing"
  | "vth.sqrtCurrent";

export type CalculationDescriptor = {
  readonly algorithmId: CalculationAlgorithmId;
  readonly kind: CalculationKind;
  readonly run: (points: readonly CalculationPoint[]) => CalculationPoint[];
};

const calculateBasePoints = (
  points: readonly CalculationPoint[],
): CalculationPoint[] => points.map(({ x, y }) => ({ x, y }));

const calculationDescriptors: Readonly<Record<CalculationKind, CalculationDescriptor>> = {
  gm: {
    algorithmId: "gm.centralDerivative",
    kind: "gm",
    run: calculateGmPoints,
  },
  iv: {
    algorithmId: "base.identity",
    kind: "iv",
    run: calculateBasePoints,
  },
  ss: {
    algorithmId: "ss.subthresholdSwing",
    kind: "ss",
    run: calculateSsPoints,
  },
  vth: {
    algorithmId: "vth.sqrtCurrent",
    kind: "vth",
    run: calculateVthPoints,
  },
};

export const getCalculationDescriptor = (
  kind: CalculationKind,
): CalculationDescriptor =>
  calculationDescriptors[kind];

export const executeCalculation = ({
  kind,
  points,
}: {
  readonly kind: CalculationKind;
  readonly points: readonly CalculationPoint[];
}): CalculationPoint[] =>
  getCalculationDescriptor(kind).run(points);
