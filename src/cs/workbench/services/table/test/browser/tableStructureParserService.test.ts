/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";
import {
	getTableStructureParserWorkerConcurrency,
	TableStructureParserWorkerPool,
	type TableStructureParserWorker,
} from "src/cs/workbench/services/table/browser/tableStructureParserService";
import type {
	TableStructureParserWorkerMessage,
	TableStructureParserWorkerRequest,
} from "src/cs/workbench/services/table/browser/tableStructureParserWorker";
import { createTableTextBuffer } from "src/cs/workbench/services/table/common/tableReadBuffer";
import type { ParsedTableStructure } from "src/cs/workbench/services/table/common/tableStructureParser";

suite("workbench/services/table/test/browser/tableStructureParserService", () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test("scales worker concurrency from available CPU cores", () => {
		assert.deepStrictEqual([
			getTableStructureParserWorkerConcurrency(1),
			getTableStructureParserWorkerConcurrency(2),
			getTableStructureParserWorkerConcurrency(4),
			getTableStructureParserWorkerConcurrency(12),
			getTableStructureParserWorkerConcurrency(Number.NaN),
		], [1, 1, 3, 8, 4]);
	});

	test("bounds concurrent parsing and reuses workers for queued files", async () => {
		const workers: TestTableStructureParserWorker[] = [];
		const pool = store.add(new TableStructureParserWorkerPool(3, () => {
			const worker = new TestTableStructureParserWorker();
			workers.push(worker);
			return worker;
		}));
		const parses = Array.from({ length: 5 }, (_, index) => pool.parse({
			buffer: createTableTextBuffer(`X,Y\n${index},${index + 1}`, "utf8"),
			format: "csv",
		}));

		await waitFor(() => countWorkerRequests(workers) === 3);
		assert.deepStrictEqual({
			requestCount: countWorkerRequests(workers),
			workerCount: workers.length,
		}, {
			requestCount: 3,
			workerCount: 3,
		});

		workers[0]!.complete();
		workers[1]!.complete();
		await waitFor(() => countWorkerRequests(workers) === 5);

		workers[2]!.complete();
		workers[0]!.complete();
		workers[1]!.complete();
		const results = await Promise.all(parses);

		assert.deepStrictEqual({
			resultCount: results.length,
			terminatedWorkers: workers.filter(worker => worker.terminated).length,
			workerCount: workers.length,
		}, {
			resultCount: 5,
			terminatedWorkers: 0,
			workerCount: 3,
		});
	});
});

class TestTableStructureParserWorker implements TableStructureParserWorker {
	public onerror: ((event: ErrorEvent) => void) | null = null;
	public onmessage: ((event: MessageEvent<TableStructureParserWorkerMessage>) => void) | null = null;
	public onmessageerror: ((event: MessageEvent) => void) | null = null;
	public readonly requests: TableStructureParserWorkerRequest[] = [];
	public terminated = false;

	public postMessage(
		message: TableStructureParserWorkerRequest,
		_transfer: Transferable[],
	): void {
		this.requests.push(message);
	}

	public terminate(): void {
		this.terminated = true;
	}

	public complete(): void {
		const request = this.requests[this.requests.length - 1];
		if (!request) {
			throw new Error("The test worker has no request to complete.");
		}
		this.onmessage?.(new MessageEvent<TableStructureParserWorkerMessage>("message", {
			data: {
				payload: {
					durationMs: 1,
					requestId: request.payload.requestId,
					result: emptyParsedTableStructure,
				},
				type: "parseResult",
			},
		}));
	}
}

const emptyParsedTableStructure: ParsedTableStructure = {
	content: null,
	diagnostics: [],
	sheets: [],
};

const countWorkerRequests = (
	workers: readonly TestTableStructureParserWorker[],
): number => workers.reduce((count, worker) => count + worker.requests.length, 0);

const waitFor = async (condition: () => boolean): Promise<void> => {
	for (let attempt = 0; attempt < 20; attempt += 1) {
		if (condition()) {
			return;
		}
		await new Promise<void>(resolve => globalThis.setTimeout(resolve, 0));
	}
	throw new Error("Timed out waiting for the worker pool test condition.");
};
