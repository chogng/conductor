/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from "src/cs/base/common/lifecycle";
import { InstantiationType, registerSingleton } from "src/cs/platform/instantiation/common/extensions";
import { getPerfNow, logPerf } from "src/cs/workbench/common/perf";
import type {
	StructuredContentEvidenceWorkerMessage,
	StructuredContentEvidenceWorkerRequest,
} from "src/cs/workbench/services/dataResource/browser/structuredContentEvidenceWorker";
import { IStructuredContentEvidenceService } from "src/cs/workbench/services/dataResource/common/structuredContentEvidenceService";
import type { StructuredContentEvidence } from "src/cs/workbench/services/dataResource/common/structuredContent";
import type { TemplateSemanticPatches } from "src/cs/workbench/services/settings/common/settings";
import type { TableModelContentSnapshot } from "src/cs/workbench/services/table/common/model";

const STRUCTURED_CONTENT_EVIDENCE_WORKER_DEFAULT_CONCURRENCY = 4;
const STRUCTURED_CONTENT_EVIDENCE_WORKER_MAX_CONCURRENCY = 8;
const STRUCTURED_CONTENT_EVIDENCE_WORKER_TIMEOUT_MS = 60_000;

type QueuedEvidenceRequest = {
	readonly content: TableModelContentSnapshot;
	readonly patches: TemplateSemanticPatches;
	readonly reject: (error: Error) => void;
	readonly requestId: number;
	readonly resolve: (evidence: StructuredContentEvidence) => void;
};

type EvidenceWorkerSlot = {
	activeRequest: QueuedEvidenceRequest | null;
	worker: Worker;
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
	private requestIdPool = 0;

	public create(
		content: TableModelContentSnapshot,
		patches: TemplateSemanticPatches,
	): Promise<StructuredContentEvidence> {
		if (this.disposed) {
			return Promise.reject(new Error("The DataResource evidence service is disposed."));
		}
		return new Promise<StructuredContentEvidence>((resolve, reject) => {
			this.queuedRequests.push({
				content,
				patches,
				reject,
				requestId: ++this.requestIdPool,
				resolve,
			});
			logPerf("dataResource.evidenceWorker.enqueue", {
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
		const error = new Error("The DataResource evidence service was disposed.");
		for (const request of this.queuedRequests.splice(0)) {
			request.reject(error);
		}
		for (const slot of this.slots) {
			slot.activeRequest?.reject(error);
			slot.activeRequest = null;
			slot.worker.terminate();
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
			this.dispatch(slot, request);
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
		const worker = new Worker(new URL("./structuredContentEvidenceWorker.ts", import.meta.url), {
			name: "DataResource Evidence",
			type: "module",
		});
		const slot: EvidenceWorkerSlot = { activeRequest: null, worker };
		this.slots.push(slot);
		logPerf("dataResource.evidenceWorker.createWorker", {
			concurrency: this.concurrency,
			workerCount: this.slots.length,
		}, { silent: true });
		return slot;
	}

	private dispatch(slot: EvidenceWorkerSlot, request: QueuedEvidenceRequest): void {
		const startedAt = getPerfNow();
		const timeout = globalThis.setTimeout(() => {
			this.removeWorker(slot);
			this.finish(slot, request, null, new Error("The DataResource evidence worker timed out."), startedAt);
		}, STRUCTURED_CONTENT_EVIDENCE_WORKER_TIMEOUT_MS);
		slot.worker.onmessage = (
			event: MessageEvent<StructuredContentEvidenceWorkerMessage>,
		): void => {
			const message = event.data;
			if (message?.payload?.requestId !== request.requestId) {
				return;
			}
			globalThis.clearTimeout(timeout);
			if (message.type === "createEvidenceResult") {
				logPerf("dataResource.structuredContent.evidence", {
					columnCount: request.content.columnCount,
					durationMs: message.payload.durationMs,
					rowCount: request.content.rowCount,
					worker: true,
				}, { silent: true });
				this.finish(slot, request, message.payload.evidence, null, startedAt);
				return;
			}
			this.finish(slot, request, null, new Error(message.payload.message), startedAt);
		};
		slot.worker.onerror = event => {
			globalThis.clearTimeout(timeout);
			this.removeWorker(slot);
			this.finish(
				slot,
				request,
				null,
				new Error(event.message || "The DataResource evidence worker failed."),
				startedAt,
			);
		};
		slot.worker.onmessageerror = () => {
			globalThis.clearTimeout(timeout);
			this.removeWorker(slot);
			this.finish(
				slot,
				request,
				null,
				new Error("The DataResource evidence worker returned an unreadable result."),
				startedAt,
			);
		};
		logPerf("dataResource.evidenceWorker.dispatch", {
			queueLength: this.queuedRequests.length,
			workerCount: this.slots.length,
		}, { silent: true });
		try {
			slot.worker.postMessage({
				payload: {
					content: request.content,
					patches: request.patches,
					requestId: request.requestId,
				},
				type: "createEvidence",
			} satisfies StructuredContentEvidenceWorkerRequest);
		} catch (error) {
			globalThis.clearTimeout(timeout);
			this.removeWorker(slot);
			this.finish(slot, request, null, toError(error), startedAt);
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
		logPerf("dataResource.evidenceWorker.complete", {
			durationMs: getPerfNow() - startedAt,
			queueLength: this.queuedRequests.length,
			success: Boolean(evidence),
		}, { silent: true });
		if (evidence) {
			request.resolve(evidence);
		} else {
			request.reject(error ?? new Error("The DataResource evidence worker failed."));
		}
		this.flush();
	}

	private removeWorker(slot: EvidenceWorkerSlot): void {
		slot.worker.terminate();
		const index = this.slots.indexOf(slot);
		if (index >= 0) {
			this.slots.splice(index, 1);
		}
	}
}

const toError = (error: unknown): Error =>
	error instanceof Error
		? error
		: new Error("The DataResource evidence worker failed.");

registerSingleton(
	IStructuredContentEvidenceService,
	StructuredContentEvidenceService,
	InstantiationType.Delayed,
);
