/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type { IDisposable } from "src/cs/base/common/lifecycle";
import type {
	CalculationAnalysisBySeriesId,
} from "src/cs/workbench/services/calculation/common/calculationAnalysis";
import type {
	CalculationFileRecord,
} from "src/cs/workbench/services/calculation/common/canonicalFileProjection";
import type {
	CalculatedCurveRecord,
	CalculatedMetricRecord,
} from "src/cs/workbench/services/calculation/common/calculationRecordBuilder";

export type CalculationRecordsBackendInput = {
	readonly analysisBySeriesId?: CalculationAnalysisBySeriesId;
	readonly file: CalculationFileRecord;
	readonly inputSignature: string;
	readonly requestId: number;
};

export type CalculationRecordsBackendOutput = {
	readonly curves: readonly CalculatedCurveRecord[];
	readonly inputSignature: string;
	readonly metrics: readonly CalculatedMetricRecord[];
	readonly requestId: number;
};

export interface ICalculationRecordsBackend extends IDisposable {
	isSupported(): boolean;
	calculateRecords(
		input: CalculationRecordsBackendInput,
	): Promise<CalculationRecordsBackendOutput | null>;
}
