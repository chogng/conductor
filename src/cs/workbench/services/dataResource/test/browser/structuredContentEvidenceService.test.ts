/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { CancellationTokenSource } from "src/cs/base/common/cancellation";
import { isCancellationError } from "src/cs/base/common/errors";
import type { IWebWorkerClient } from "src/cs/base/common/worker/webWorker";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";
import {
	resolveStructuredContentEvidenceWorkerCount,
	StructuredContentEvidenceService,
} from "src/cs/workbench/services/dataResource/browser/structuredContentEvidenceService";
import type {
	IStructuredContentEvidenceWorker,
	StructuredContentEvidenceWorkerInput,
	StructuredContentEvidenceWorkerOutput,
} from "src/cs/workbench/services/dataResource/browser/structuredContentEvidenceWorker";
import { testStructuredContentEvidenceService } from "src/cs/workbench/services/dataResource/test/common/testStructuredContentEvidenceService";

suite("workbench/services/dataResource/test/browser/structuredContentEvidenceService", () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test("submits every request immediately and reuses every hardware worker", async () => {
		const requestCount = 12;
		const workerCount = 3;
		const workers: TestStructuredContentEvidenceWorkerClient[] = [];
		const service = store.add(new StructuredContentEvidenceService(() => {
			const worker = new TestStructuredContentEvidenceWorkerClient();
			workers.push(worker);
			return worker as unknown as IWebWorkerClient<IStructuredContentEvidenceWorker>;
		}, workerCount));
		const requests = Array.from({ length: requestCount }, () => service.create({
			columnCount: 2,
			maxCellLengths: [1, 1],
			rowCount: 2,
			rows: [["X", "Y"], ["0", "1"]],
		}, {
			rules: [],
			terms: [],
		}));

		await waitFor(() =>
			workers.reduce((count, worker) => count + worker.requestCount, 0) === workerCount
		);
		assert.deepStrictEqual({
			requestCount: workers.reduce((count, worker) => count + worker.requestCount, 0),
			workerCount: workers.length,
		}, {
			requestCount: workerCount,
			workerCount,
		});

		let completedCount = 0;
		while (completedCount < requestCount) {
			const activeWorkers = workers.filter(worker => worker.requests.length > 0);
			await Promise.all(activeWorkers.map(worker => worker.complete()));
			completedCount += activeWorkers.length;
			await waitFor(() =>
				completedCount === requestCount ||
				workers.reduce((count, worker) => count + worker.requestCount, 0) > completedCount
			);
		}
		const results = await Promise.all(requests);
		assert.deepStrictEqual({
			resultCount: results.length,
			reusedWorkerCount: workers.filter(worker => worker.requestCount > 1).length,
			workerCount: workers.length,
		}, {
			resultCount: requestCount,
			reusedWorkerCount: workerCount,
			workerCount,
		});
	});

	test("uses the full reported hardware parallelism without a fixed cap", () => {
		assert.strictEqual(resolveStructuredContentEvidenceWorkerCount(64), 64);
		assert.strictEqual(resolveStructuredContentEvidenceWorkerCount(1), 1);
		assert.strictEqual(resolveStructuredContentEvidenceWorkerCount(0), 1);
	});

	test("terminates a cancelled active worker and immediately dispatches the next request", async () => {
		const workers: TestStructuredContentEvidenceWorkerClient[] = [];
		const service = store.add(new StructuredContentEvidenceService(() => {
			const worker = new TestStructuredContentEvidenceWorkerClient();
			workers.push(worker);
			return worker as unknown as IWebWorkerClient<IStructuredContentEvidenceWorker>;
		}, 1));
		const firstSource = store.add(new CancellationTokenSource());
		const content = {
			columnCount: 2,
			maxCellLengths: [1, 1],
			rowCount: 2,
			rows: [["X", "Y"], ["0", "1"]],
		};
		const patches = {
			rules: [],
			terms: [],
		};

		const first = service.create(content, patches, firstSource.token);
		await waitFor(() => workers[0]?.requestCount === 1);
		const second = service.create(content, patches);
		firstSource.cancel();

		await assert.rejects(first, error => isCancellationError(error));
		await waitFor(() =>
			workers.length === 2 &&
			workers[0]?.disposed === true &&
			workers[1]?.requestCount === 1
		);
		await workers[1]?.complete();
		await second;
	});
});

type PendingRequest = {
	readonly input: StructuredContentEvidenceWorkerInput;
	readonly reject: (error: unknown) => void;
	readonly resolve: (output: StructuredContentEvidenceWorkerOutput) => void;
};

class TestStructuredContentEvidenceWorkerClient {
	public disposed = false;
	public readonly requests: PendingRequest[] = [];
	public requestCount = 0;
	public readonly proxy = {
		$createEvidence: (
			input: StructuredContentEvidenceWorkerInput,
		): Promise<StructuredContentEvidenceWorkerOutput> => {
			this.requestCount += 1;
			return new Promise((resolve, reject) => {
				this.requests.push({ input, reject, resolve });
			});
		},
	};

	public isClosed(): boolean {
		return this.disposed;
	}

	public dispose(): void {
		if (this.disposed) {
			return;
		}
		this.disposed = true;
		for (const request of this.requests.splice(0)) {
			request.reject(new Error("The test worker was disposed."));
		}
	}

	public async complete(): Promise<void> {
		const request = this.requests.shift();
		if (!request) {
			throw new Error("The test worker has no request to complete.");
		}
		request.resolve({
			durationMs: 1,
			evidence: await testStructuredContentEvidenceService.create(
				request.input.content,
				request.input.patches,
			),
		});
	}
}

async function waitFor(condition: () => boolean): Promise<void> {
	for (let attempt = 0; attempt < 20; attempt += 1) {
		if (condition()) {
			return;
		}
		await new Promise<void>(resolve => globalThis.setTimeout(resolve, 0));
	}
	throw new Error("Timed out waiting for the worker service test condition.");
}
