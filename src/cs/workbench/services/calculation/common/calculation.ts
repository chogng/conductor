/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/
export const CalculationContributionId = "workbench.services.calculation";

export type CalculationPoint = {
  readonly x: number;
  readonly y: number;
};

export type IonIoffMethod = "auto" | "manual";
export type SsMethod = "auto" | "manual";
