/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type { IDisposable } from "src/cs/base/common/lifecycle";
import type { CancellationToken } from "src/cs/base/common/cancellation";
import type {
	CalculationAnalysisBySeriesId,
} from "src/cs/workbench/services/calculation/common/calculationAnalysis";
import type {
	CalculatedCurveRecord,
	CalculatedMetricRecord,
} from "src/cs/workbench/services/calculation/common/calculationRecordBuilder";
import type {
	CalculationRecordsInput,
} from "src/cs/workbench/services/calculation/common/calculationRecords";

export type CalculationRecordsBackendInput = {
	readonly analysisBySeriesId?: CalculationAnalysisBySeriesId;
	readonly inputSignature: string;
	readonly records: CalculationRecordsInput;
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
		token?: CancellationToken,
	): Promise<CalculationRecordsBackendOutput | null>;
}
