/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { bootstrapWebWorker } from 'src/cs/base/common/worker/webWorker';
import type { CalculationFileId } from 'src/cs/workbench/services/calculation/common/calculation';
import { createCalculatedRecordsByFile } from 'src/cs/workbench/services/calculation/common/calculationRecordBuilder';
import type { SliceRun } from 'src/cs/workbench/services/slice/common/slice';
import type {
	CurveRecord,
	MetricInputRecord,
	MetricRecord,
	SeriesRecord,
} from 'src/cs/workbench/services/session/common/sessionModel';

type CalculationWorkerFileKind = 'csv' | 'excel' | 'unknown';

export type CalculationWorkerFile = {
	readonly curvesByKey: Record<string, CurveRecord>;
	readonly id: CalculationFileId;
	readonly kind: CalculationWorkerFileKind;
	readonly latestSliceRunId?: string;
	readonly metricInputsByKey?: Record<string, MetricInputRecord>;
	readonly metricsByKey: Record<string, MetricRecord>;
	readonly name: string;
	readonly raw: {
		readonly fileId: CalculationFileId;
		readonly fileName: string;
		readonly tableOrder: string[];
		readonly tablesById: Record<string, never>;
	};
	readonly rawTableVersionsById: Record<string, number>;
	readonly seriesById: Record<string, SeriesRecord>;
	readonly seriesOrder: string[];
	readonly sliceRunsById?: Record<string, SliceRun>;
};

export type CalculationRecordsWorkerRequest = {
	readonly file: CalculationWorkerFile;
	readonly fileId: CalculationFileId;
	readonly requestId: number;
	readonly sessionVersion: number;
};

export type CalculationRecordsWorkerOutput = {
	readonly curves: readonly CurveRecord[];
	readonly fileId: CalculationFileId;
	readonly metrics: readonly MetricRecord[];
	readonly requestId: number;
	readonly sessionVersion: number;
};

export interface ICalculationWorker {
	$calculateRecords(input: CalculationRecordsWorkerRequest): CalculationRecordsWorkerOutput;
}

class CalculationWorker implements ICalculationWorker {
	public $calculateRecords(
		input: CalculationRecordsWorkerRequest,
	): CalculationRecordsWorkerOutput {
		const fileId = String(input.fileId ?? input.file?.id ?? '').trim();
		if (!input.file || !fileId) {
			throw new Error('Calculation worker request is missing file.');
		}

		const { curvesByFileId, metricsByFileId } = createCalculatedRecordsByFile(
			{ [fileId]: input.file },
			[fileId],
		);
		return {
			curves: curvesByFileId[fileId] ?? [],
			fileId,
			metrics: metricsByFileId[fileId] ?? [],
			requestId: normalizeInteger(input.requestId),
			sessionVersion: normalizeInteger(input.sessionVersion),
		};
	}
}

bootstrapWebWorker(() => new CalculationWorker());

function normalizeInteger(value: number): number {
	const normalized = Math.floor(Number(value));
	return Number.isFinite(normalized) ? normalized : 0;
}
