/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { bootstrapWebWorker } from 'src/cs/base/common/worker/webWorker';
import type {
	CalculationAnalysisBySeriesId,
} from 'src/cs/workbench/services/calculation/common/calculationAnalysis';
import {
	createCalculatedRecords,
	type CalculatedCurveRecord,
	type CalculatedMetricRecord,
} from 'src/cs/workbench/services/calculation/common/calculationRecordBuilder';
import type {
	CalculationRecordsInput,
} from 'src/cs/workbench/services/calculation/common/calculationRecords';

export type CalculationRecordsWorkerRequest = {
	readonly analysisBySeriesId?: CalculationAnalysisBySeriesId;
	readonly inputSignature: string;
	readonly records: CalculationRecordsInput;
	readonly requestId: number;
};

export type CalculationRecordsWorkerOutput = {
	readonly curves: readonly CalculatedCurveRecord[];
	readonly inputSignature: string;
	readonly metrics: readonly CalculatedMetricRecord[];
	readonly requestId: number;
};

export interface ICalculationWorker {
	$calculateRecords(input: CalculationRecordsWorkerRequest): CalculationRecordsWorkerOutput;
}

class CalculationWorker implements ICalculationWorker {
	public $calculateRecords(
		input: CalculationRecordsWorkerRequest,
	): CalculationRecordsWorkerOutput {
		if (!input.records || !Object.keys(input.records.baseCurvesByKey).length) {
			throw new Error('Calculation worker request is missing base curves.');
		}

		const records = createCalculatedRecords(
			input.records,
			input.analysisBySeriesId,
		);
		return {
			curves: records.curves,
			inputSignature: input.inputSignature,
			metrics: records.metrics,
			requestId: normalizeInteger(input.requestId),
		};
	}
}

bootstrapWebWorker(() => new CalculationWorker());

function normalizeInteger(value: number): number {
	const normalized = Math.floor(Number(value));
	return Number.isFinite(normalized) ? normalized : 0;
}
