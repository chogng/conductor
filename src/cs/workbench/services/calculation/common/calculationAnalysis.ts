/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type { BaseCurrentMetrics } from "src/cs/workbench/services/calculation/common/ionIoff";
import type {
	CurvePoint,
	SeriesId,
} from "src/cs/workbench/services/session/common/sessionModel";

export const CalculationAnalysisVersion = 2;

export type CalculationSeriesAnalysis = {
	readonly baseCurrent?: BaseCurrentMetrics;
	readonly gm?: readonly CurvePoint[];
	readonly ss?: readonly CurvePoint[];
	readonly ssFitAuto?: unknown;
};

export type CalculationAnalysisBySeriesId = Readonly<
	Record<SeriesId, CalculationSeriesAnalysis | undefined>
>;
