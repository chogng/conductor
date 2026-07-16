/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'src/cs/base/common/lifecycle';
import type { IWebWorkerClient } from 'src/cs/base/common/worker/webWorker';
import type { WebWorkerDescriptor } from 'src/cs/platform/webWorker/browser/webWorkerDescriptor';
import type { IWebWorkerService } from 'src/cs/platform/webWorker/browser/webWorkerService';
import type {
	ICalculationWorker,
} from 'src/cs/workbench/services/calculation/browser/calculationWorker';
import type {
	CalculationRecordsBackendInput,
	CalculationRecordsBackendOutput,
	ICalculationRecordsBackend,
} from 'src/cs/workbench/services/calculation/common/calculationRecordsBackend';

const CALCULATION_WORKER_TIMEOUT_MS = 30_000;

export class CalculationWorkerClient extends Disposable implements ICalculationRecordsBackend {
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
		input: CalculationRecordsBackendInput,
	): Promise<CalculationRecordsBackendOutput | null> {
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
				analysisBySeriesId: input.analysisBySeriesId,
				inputSignature: input.inputSignature,
				records: input.records,
				requestId: input.requestId,
			});
			return await new Promise<CalculationRecordsBackendOutput | null>(resolve => {
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
