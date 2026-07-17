/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'src/cs/base/common/cancellation';
import { CancellationError } from 'src/cs/base/common/errors';
import { Disposable, type IDisposable } from 'src/cs/base/common/lifecycle';
import type { IWebWorkerClient } from 'src/cs/base/common/worker/webWorker';
import { getPerfNow, logPerf } from 'src/cs/workbench/common/perf';
import type { IStructuredContentEvidenceWorker } from 'src/cs/workbench/services/dataResource/browser/structuredContentEvidenceWorker';
import { IStructuredContentEvidenceService } from 'src/cs/workbench/services/dataResource/common/structuredContentEvidenceService';
import type { StructuredContentEvidence } from 'src/cs/workbench/services/dataResource/common/structuredContent';
import type { TemplateSemanticPatches } from 'src/cs/workbench/services/settings/common/settings';
import type { TableModelContentSnapshot } from 'src/cs/workbench/services/table/common/model';

const STRUCTURED_CONTENT_EVIDENCE_WORKER_TIMEOUT_MS = 60_000;

export type StructuredContentEvidenceWorkerClientFactory = () => IWebWorkerClient<IStructuredContentEvidenceWorker>;

type QueuedEvidenceRequest = {
	readonly cancellationListener: IDisposable;
	readonly content: TableModelContentSnapshot;
	readonly patches: TemplateSemanticPatches;
	readonly reject: (error: Error) => void;
	readonly resolve: (evidence: StructuredContentEvidence) => void;
};

type EvidenceWorkerSlot = {
	activeRequest: QueuedEvidenceRequest | null;
	readonly worker: IWebWorkerClient<IStructuredContentEvidenceWorker>;
};

export class StructuredContentEvidenceService extends Disposable implements IStructuredContentEvidenceService {
	public declare readonly _serviceBrand: undefined;

	private readonly pendingRequests: QueuedEvidenceRequest[] = [];
	private readonly slots: EvidenceWorkerSlot[] = [];
	private readonly workerCount: number;
	private disposed = false;

	public constructor(
		private readonly workerFactory: StructuredContentEvidenceWorkerClientFactory,
		workerCount = resolveStructuredContentEvidenceWorkerCount(),
	) {
		super();
		this.workerCount = resolveStructuredContentEvidenceWorkerCount(workerCount);
	}

	public create(
		content: TableModelContentSnapshot,
		patches: TemplateSemanticPatches,
		token: CancellationToken = CancellationToken.None,
	): Promise<StructuredContentEvidence> {
		if (this.disposed) {
			return Promise.reject(new Error('The DataResource evidence service is disposed.'));
		}
		if (token.isCancellationRequested) {
			return Promise.reject(new CancellationError());
		}
		return new Promise<StructuredContentEvidence>((resolve, reject) => {
			let request: QueuedEvidenceRequest;
			const cancellationListener = token.onCancellationRequested(() => {
				this.cancelRequest(request);
			});
			request = {
				cancellationListener,
				content,
				patches,
				reject,
				resolve,
			};
			this.pendingRequests.push(request);
			logPerf('dataResource.evidenceWorker.submit', {
				activeWorkerCount: this.getActiveWorkerCount(),
				pendingRequestCount: this.pendingRequests.length,
				workerCount: this.slots.length,
			}, { silent: true });
			this.dispatchPending();
		});
	}

	public override dispose(): void {
		if (this.disposed) {
			return;
		}
		this.disposed = true;
		const error = new Error('The DataResource evidence service was disposed.');
		for (const request of this.pendingRequests.splice(0)) {
			request.cancellationListener.dispose();
			request.reject(error);
		}
		for (const slot of this.slots) {
			slot.activeRequest?.cancellationListener.dispose();
			slot.activeRequest?.reject(error);
			slot.activeRequest = null;
			slot.worker.dispose();
		}
		this.slots.length = 0;
		super.dispose();
	}

	private createSlot(): EvidenceWorkerSlot {
		const slot: EvidenceWorkerSlot = {
			activeRequest: null,
			worker: this.workerFactory(),
		};
		this.slots.push(slot);
		logPerf('dataResource.evidenceWorker.createWorker', {
			workerCount: this.slots.length,
		}, { silent: true });
		return slot;
	}

	private dispatchPending(): void {
		while (!this.disposed && this.pendingRequests.length > 0) {
			let slot = this.slots.find(candidate => candidate.activeRequest === null);
			if (!slot) {
				if (this.slots.length >= this.workerCount) {
					return;
				}
				try {
					slot = this.createSlot();
				} catch (error) {
					const request = this.pendingRequests.shift();
					request?.cancellationListener.dispose();
					request?.reject(toError(error));
					continue;
				}
			}

			const request = this.pendingRequests.shift();
			if (!request) {
				return;
			}
			slot.activeRequest = request;
			logPerf('dataResource.evidenceWorker.dispatch', {
				activeWorkerCount: this.getActiveWorkerCount(),
				pendingRequestCount: this.pendingRequests.length,
				workerCount: this.slots.length,
			}, { silent: true });
			void this.dispatch(slot, request);
		}
	}

	private async dispatch(
		slot: EvidenceWorkerSlot,
		request: QueuedEvidenceRequest,
	): Promise<void> {
		const startedAt = getPerfNow();
		let timeout: ReturnType<typeof globalThis.setTimeout> | undefined;
		try {
			const workerRequest = slot.worker.proxy.$createEvidence({
				content: request.content,
				patches: request.patches,
			});
			const output = await new Promise<Awaited<typeof workerRequest>>((resolve, reject) => {
				timeout = globalThis.setTimeout(() => {
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
		request.cancellationListener.dispose();
		logPerf('dataResource.evidenceWorker.complete', {
			activeWorkerCount: this.getActiveWorkerCount(),
			durationMs: getPerfNow() - startedAt,
			pendingRequestCount: this.pendingRequests.length,
			success: Boolean(evidence),
		}, { silent: true });
		if (evidence) {
			request.resolve(evidence);
		} else {
			this.removeWorker(slot);
			request.reject(error ?? new Error('The DataResource evidence worker failed.'));
		}
		this.dispatchPending();
	}

	private cancelRequest(request: QueuedEvidenceRequest): void {
		const pendingIndex = this.pendingRequests.indexOf(request);
		if (pendingIndex >= 0) {
			this.pendingRequests.splice(pendingIndex, 1);
			request.cancellationListener.dispose();
			request.reject(new CancellationError());
			return;
		}

		const slot = this.slots.find(candidate => candidate.activeRequest === request);
		if (!slot) {
			return;
		}
		slot.activeRequest = null;
		request.cancellationListener.dispose();
		request.reject(new CancellationError());
		this.removeWorker(slot);
		this.dispatchPending();
	}

	private removeWorker(slot: EvidenceWorkerSlot): void {
		slot.worker.dispose();
		const index = this.slots.indexOf(slot);
		if (index >= 0) {
			this.slots.splice(index, 1);
		}
	}

	private getActiveWorkerCount(): number {
		return this.slots.reduce(
			(count, slot) => count + (slot.activeRequest ? 1 : 0),
			0,
		);
	}
}

export function resolveStructuredContentEvidenceWorkerCount(
	hardwareConcurrency = globalThis.navigator?.hardwareConcurrency,
): number {
	const availableParallelism = Math.floor(Number(hardwareConcurrency));
	return Number.isFinite(availableParallelism) && availableParallelism > 0
		? availableParallelism
		: 1;
}

function toError(error: unknown): Error {
	return error instanceof Error
		? error
		: new Error('The DataResource evidence worker failed.');
}
