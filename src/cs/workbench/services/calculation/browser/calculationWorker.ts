/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { bootstrapWebWorker } from 'src/cs/base/common/worker/webWorker';
import type {
	CalculationAnalysisBySeriesId,
} from 'src/cs/workbench/services/calculation/common/calculationAnalysis';
import {
	createCalculatedRecordsByFile,
	type CalculatedCurveRecord,
	type CalculatedMetricRecord,
} from 'src/cs/workbench/services/calculation/common/calculationRecordBuilder';
import type {
	CalculationFileRecord,
} from 'src/cs/workbench/services/calculation/common/canonicalFileProjection';

export type CalculationWorkerFile = CalculationFileRecord;

export type CalculationRecordsWorkerRequest = {
	readonly analysisBySeriesId?: CalculationAnalysisBySeriesId;
	readonly file: CalculationWorkerFile;
	readonly inputSignature: string;
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
		const fileId = String(input.file?.id ?? '').trim();
		if (!input.file || !fileId) {
			throw new Error('Calculation worker request is missing file.');
		}

		const { curvesByFileId, metricsByFileId } = createCalculatedRecordsByFile(
			{ [fileId]: input.file },
			[fileId],
			{ [fileId]: input.analysisBySeriesId },
		);
		return {
			curves: curvesByFileId[fileId] ?? [],
			inputSignature: input.inputSignature,
			metrics: metricsByFileId[fileId] ?? [],
			requestId: normalizeInteger(input.requestId),
		};
	}
}

bootstrapWebWorker(() => new CalculationWorker());

function normalizeInteger(value: number): number {
	const normalized = Math.floor(Number(value));
	return Number.isFinite(normalized) ? normalized : 0;
}
