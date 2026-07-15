/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'src/cs/base/common/lifecycle';
import type { IWebWorkerClient } from 'src/cs/base/common/worker/webWorker';
import { getPerfNow, logPerf } from 'src/cs/workbench/common/perf';
import type { IStructuredContentEvidenceWorker } from 'src/cs/workbench/services/dataResource/browser/structuredContentEvidenceWorker';
import { IStructuredContentEvidenceService } from 'src/cs/workbench/services/dataResource/common/structuredContentEvidenceService';
import type { StructuredContentEvidence } from 'src/cs/workbench/services/dataResource/common/structuredContent';
import type { TemplateSemanticPatches } from 'src/cs/workbench/services/settings/common/settings';
import type { TableModelContentSnapshot } from 'src/cs/workbench/services/table/common/model';

const STRUCTURED_CONTENT_EVIDENCE_WORKER_DEFAULT_CONCURRENCY = 4;
const STRUCTURED_CONTENT_EVIDENCE_WORKER_MAX_CONCURRENCY = 8;
const STRUCTURED_CONTENT_EVIDENCE_WORKER_TIMEOUT_MS = 60_000;

export type StructuredContentEvidenceWorkerClientFactory = () => IWebWorkerClient<IStructuredContentEvidenceWorker>;

type QueuedEvidenceRequest = {
	readonly content: TableModelContentSnapshot;
	readonly patches: TemplateSemanticPatches;
	readonly reject: (error: Error) => void;
	readonly resolve: (evidence: StructuredContentEvidence) => void;
};

type EvidenceWorkerSlot = {
	activeRequest: QueuedEvidenceRequest | null;
	readonly worker: IWebWorkerClient<IStructuredContentEvidenceWorker>;
};

export function getStructuredContentEvidenceWorkerConcurrency(
	hardwareConcurrency = globalThis.navigator?.hardwareConcurrency,
): number {
	const coreCount = Number.isFinite(hardwareConcurrency)
		? Math.max(1, Math.floor(Number(hardwareConcurrency)))
		: STRUCTURED_CONTENT_EVIDENCE_WORKER_DEFAULT_CONCURRENCY + 1;
	return Math.max(
		1,
		Math.min(STRUCTURED_CONTENT_EVIDENCE_WORKER_MAX_CONCURRENCY, coreCount - 1),
	);
}

export class StructuredContentEvidenceService extends Disposable implements IStructuredContentEvidenceService {
	public declare readonly _serviceBrand: undefined;

	private readonly concurrency = getStructuredContentEvidenceWorkerConcurrency();
	private readonly queuedRequests: QueuedEvidenceRequest[] = [];
	private readonly slots: EvidenceWorkerSlot[] = [];
	private disposed = false;

	public constructor(
		private readonly workerFactory: StructuredContentEvidenceWorkerClientFactory,
	) {
		super();
	}

	public create(
		content: TableModelContentSnapshot,
		patches: TemplateSemanticPatches,
	): Promise<StructuredContentEvidence> {
		if (this.disposed) {
			return Promise.reject(new Error('The DataResource evidence service is disposed.'));
		}
		return new Promise<StructuredContentEvidence>((resolve, reject) => {
			this.queuedRequests.push({ content, patches, reject, resolve });
			logPerf('dataResource.evidenceWorker.enqueue', {
				concurrency: this.concurrency,
				queueLength: this.queuedRequests.length,
			}, { silent: true });
			this.flush();
		});
	}

	public override dispose(): void {
		if (this.disposed) {
			return;
		}
		this.disposed = true;
		const error = new Error('The DataResource evidence service was disposed.');
		for (const request of this.queuedRequests.splice(0)) {
			request.reject(error);
		}
		for (const slot of this.slots) {
			slot.activeRequest?.reject(error);
			slot.activeRequest = null;
			slot.worker.dispose();
		}
		this.slots.length = 0;
		super.dispose();
	}

	private flush(): void {
		if (this.disposed) {
			return;
		}
		while (this.queuedRequests.length) {
			let slot: EvidenceWorkerSlot | null;
			try {
				slot = this.getAvailableSlot();
			} catch (error) {
				this.queuedRequests.shift()?.reject(toError(error));
				continue;
			}
			if (!slot) {
				return;
			}
			const request = this.queuedRequests.shift()!;
			slot.activeRequest = request;
			void this.dispatch(slot, request);
		}
	}

	private getAvailableSlot(): EvidenceWorkerSlot | null {
		const available = this.slots.find(slot => !slot.activeRequest);
		if (available) {
			return available;
		}
		if (this.slots.length >= this.concurrency) {
			return null;
		}

		const slot: EvidenceWorkerSlot = {
			activeRequest: null,
			worker: this.workerFactory(),
		};
		this.slots.push(slot);
		logPerf('dataResource.evidenceWorker.createWorker', {
			concurrency: this.concurrency,
			workerCount: this.slots.length,
		}, { silent: true });
		return slot;
	}

	private async dispatch(
		slot: EvidenceWorkerSlot,
		request: QueuedEvidenceRequest,
	): Promise<void> {
		const startedAt = getPerfNow();
		let timeout: ReturnType<typeof globalThis.setTimeout> | undefined;
		let timedOut = false;
		try {
			const workerRequest = slot.worker.proxy.$createEvidence({
				content: request.content,
				patches: request.patches,
			});
			const output = await new Promise<Awaited<typeof workerRequest>>((resolve, reject) => {
				timeout = globalThis.setTimeout(() => {
					timedOut = true;
					reject(new Error('The DataResource evidence worker timed out.'));
				}, STRUCTURED_CONTENT_EVIDENCE_WORKER_TIMEOUT_MS);
				workerRequest.then(resolve, reject);
			});
			if (slot.activeRequest !== request || this.disposed) {
				return;
			}

			logPerf('dataResource.structuredContent.evidence', {
				columnCount: request.content.columnCount,
				durationMs: output.durationMs,
				rowCount: request.content.rowCount,
				worker: true,
			}, { silent: true });
			this.finish(slot, request, output.evidence, null, startedAt);
		} catch (error) {
			if (slot.activeRequest !== request || this.disposed) {
				return;
			}
			if (timedOut || slot.worker.isClosed()) {
				this.removeWorker(slot);
			}
			this.finish(slot, request, null, toError(error), startedAt);
		} finally {
			if (timeout !== undefined) {
				globalThis.clearTimeout(timeout);
			}
		}
	}

	private finish(
		slot: EvidenceWorkerSlot,
		request: QueuedEvidenceRequest,
		evidence: StructuredContentEvidence | null,
		error: Error | null,
		startedAt: number,
	): void {
		if (slot.activeRequest !== request) {
			return;
		}
		slot.activeRequest = null;
		logPerf('dataResource.evidenceWorker.complete', {
			durationMs: getPerfNow() - startedAt,
			queueLength: this.queuedRequests.length,
			success: Boolean(evidence),
		}, { silent: true });
		if (evidence) {
			request.resolve(evidence);
		} else {
			request.reject(error ?? new Error('The DataResource evidence worker failed.'));
		}
		this.flush();
	}

	private removeWorker(slot: EvidenceWorkerSlot): void {
		slot.worker.dispose();
		const index = this.slots.indexOf(slot);
		if (index >= 0) {
			this.slots.splice(index, 1);
		}
	}
}

function toError(error: unknown): Error {
	return error instanceof Error
		? error
		: new Error('The DataResource evidence worker failed.');
}
