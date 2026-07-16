/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type { IDisposable } from "src/cs/base/common/lifecycle";
import type {
	CalculationAnalysisBySeriesId,
} from "src/cs/workbench/services/calculation/common/calculationAnalysis";
import type {
	CurveRecord,
	FileRecord,
	MetricRecord,
} from "src/cs/workbench/services/session/common/sessionModel";

export type CalculationRecordsBackendInput = {
	readonly analysisBySeriesId?: CalculationAnalysisBySeriesId;
	readonly file: FileRecord;
	readonly requestId: number;
	readonly sessionVersion: number;
};

export type CalculationRecordsBackendOutput = {
	readonly curves: readonly CurveRecord[];
	readonly fileId: string;
	readonly metrics: readonly MetricRecord[];
	readonly requestId: number;
	readonly sessionVersion: number;
};

export interface ICalculationRecordsBackend extends IDisposable {
	isSupported(): boolean;
	calculateRecords(
		input: CalculationRecordsBackendInput,
	): Promise<CalculationRecordsBackendOutput | null>;
}
