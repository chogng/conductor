/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'src/cs/base/common/lifecycle';
import type { IWebWorkerClient } from 'src/cs/base/common/worker/webWorker';
import type { WebWorkerDescriptor } from 'src/cs/platform/webWorker/browser/webWorkerDescriptor';
import type { IWebWorkerService } from 'src/cs/platform/webWorker/browser/webWorkerService';
import type {
	CalculationWorkerFile,
	CalculationRecordsWorkerOutput,
	ICalculationWorker,
} from 'src/cs/workbench/services/calculation/browser/calculationWorker';
import type { CalculationFileId } from 'src/cs/workbench/services/calculation/common/calculation';
import type { SliceRun } from 'src/cs/workbench/services/slice/common/slice';
import type {
	CurveRecord,
	MetricInputRecord,
	SeriesRecord,
} from 'src/cs/workbench/services/session/common/sessionModel';

const CALCULATION_WORKER_TIMEOUT_MS = 30_000;

type CalculationWorkerSourceFile = {
	readonly curvesByKey: Readonly<Record<string, CurveRecord>>;
	readonly id: CalculationFileId;
	readonly kind: CalculationWorkerFile['kind'];
	readonly latestSliceRunId?: string;
	readonly metricInputsByKey?: Readonly<Record<string, MetricInputRecord>>;
	readonly name: string;
	readonly raw: {
		readonly fileId: CalculationFileId;
		readonly fileName: string;
	};
	readonly seriesById: Readonly<Record<string, SeriesRecord>>;
	readonly seriesOrder: readonly string[];
	readonly sliceRunsById?: Readonly<Record<string, SliceRun>>;
};

export type CalculationRecordsWorkerInput = {
	readonly file: CalculationWorkerSourceFile;
	readonly requestId: number;
	readonly sessionVersion: number;
};

export type { CalculationRecordsWorkerOutput };

export class CalculationWorkerClient extends Disposable {
	private readonly activeWorkers = new Set<IWebWorkerClient<ICalculationWorker>>();
	private disposed = false;

	public constructor(
		private readonly webWorkerService: IWebWorkerService,
		private readonly workerDescriptor: WebWorkerDescriptor,
	) {
		super();
	}

	public isSupported(): boolean {
		return !this.disposed && this.webWorkerService.isSupported();
	}

	public async calculateRecords(
		input: CalculationRecordsWorkerInput,
	): Promise<CalculationRecordsWorkerOutput | null> {
		if (!this.isSupported()) {
			return null;
		}

		let worker: IWebWorkerClient<ICalculationWorker>;
		try {
			worker = this.webWorkerService.createWorkerClient<ICalculationWorker>(
				this.workerDescriptor,
			);
		} catch {
			return null;
		}
		if (this.disposed) {
			worker.dispose();
			return null;
		}
		this.activeWorkers.add(worker);

		let timeout: ReturnType<typeof globalThis.setTimeout> | undefined;
		try {
			const workerRequest = worker.proxy.$calculateRecords({
				file: createCalculationWorkerFile(input.file),
				fileId: input.file.id,
				requestId: input.requestId,
				sessionVersion: input.sessionVersion,
			});
			return await new Promise<CalculationRecordsWorkerOutput | null>(resolve => {
				timeout = globalThis.setTimeout(
					() => resolve(null),
					CALCULATION_WORKER_TIMEOUT_MS,
				);
				workerRequest.then(resolve, () => resolve(null));
			});
		} finally {
			if (timeout !== undefined) {
				globalThis.clearTimeout(timeout);
			}
			this.activeWorkers.delete(worker);
			worker.dispose();
		}
	}

	public override dispose(): void {
		if (this.disposed) {
			return;
		}
		this.disposed = true;
		for (const worker of this.activeWorkers) {
			worker.dispose();
		}
		this.activeWorkers.clear();
		super.dispose();
	}
}

function createCalculationWorkerFile(
	file: CalculationWorkerSourceFile,
): CalculationWorkerFile {
	const latestSliceRun = getLatestCalculationWorkerSliceRun(file);
	const curvesByKey: Record<string, CurveRecord> = {};
	for (const [key, curve] of Object.entries(file.curvesByKey)) {
		if (curve.curveGeneration === 'base') {
			curvesByKey[key] = curve;
		}
	}
	const curveSeriesIds = new Set(
		Object.values(curvesByKey).map(curve => curve.seriesId),
	);
	const seriesById: Record<string, SeriesRecord> = {};
	for (const [seriesId, series] of Object.entries(file.seriesById)) {
		if (curveSeriesIds.has(seriesId)) {
			seriesById[seriesId] = series;
		}
	}

	return {
		curvesByKey,
		id: file.id,
		kind: file.kind,
		...(latestSliceRun ? { latestSliceRunId: latestSliceRun.id } : {}),
		...(file.metricInputsByKey ? { metricInputsByKey: file.metricInputsByKey } : {}),
		metricsByKey: {},
		name: file.name,
		raw: {
			fileId: file.raw.fileId,
			fileName: file.raw.fileName,
			tableOrder: [],
			tablesById: {},
		},
		rawTableVersionsById: {},
		seriesById,
		seriesOrder: file.seriesOrder.filter(seriesId => curveSeriesIds.has(seriesId)),
		...(latestSliceRun ? {
			sliceRunsById: { [latestSliceRun.id]: latestSliceRun },
		} : {}),
	};
}

function getLatestCalculationWorkerSliceRun(
	file: Pick<CalculationWorkerSourceFile, 'latestSliceRunId' | 'sliceRunsById'>,
): SliceRun | undefined {
	const sliceRunId = file.latestSliceRunId;
	return sliceRunId ? file.sliceRunsById?.[sliceRunId] : undefined;
}
