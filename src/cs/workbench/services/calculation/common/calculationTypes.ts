/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

export type CalculationPoint = {
	readonly x: number;
	readonly y: number;
};

export const CalculationKinds = ["iv", "ss", "gm", "vth"] as const;

export type CalculationKind = typeof CalculationKinds[number];

export type CalculatedDataKind = CalculationKind | "secondDerivative";

export type IonIoffMethod = "auto" | "manual";
export type SsMethod = "auto" | "manual";
