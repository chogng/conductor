/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';

import type { IWebWorkerClient } from 'src/cs/base/common/worker/webWorker';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'src/cs/base/test/common/lifecycleTestUtils';
import {
	getTableStructureParserWorkerConcurrency,
	TableStructureParserWorkerPool,
} from 'src/cs/workbench/services/table/browser/tableStructureParserService';
import type {
	ITableStructureParserWorker,
	TableStructureParserWorkerInput,
	TableStructureParserWorkerOutput,
} from 'src/cs/workbench/services/table/browser/tableStructureParserWorker';
import type { ParsedTableStructure } from 'src/cs/workbench/services/table/common/tableStructureParser';
import { createTableTextBuffer } from 'src/cs/workbench/services/table/common/tableReadBuffer';

suite('workbench/services/table/test/browser/tableStructureParserService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('scales worker concurrency from available CPU cores', () => {
		assert.deepStrictEqual([
			getTableStructureParserWorkerConcurrency(1),
			getTableStructureParserWorkerConcurrency(2),
			getTableStructureParserWorkerConcurrency(4),
			getTableStructureParserWorkerConcurrency(12),
			getTableStructureParserWorkerConcurrency(Number.NaN),
		], [1, 1, 3, 8, 4]);
	});

	test('bounds concurrent parsing and reuses workers for queued files', async () => {
		const workers: TestTableStructureParserWorkerClient[] = [];
		const pool = store.add(new TableStructureParserWorkerPool(() => {
			const worker = new TestTableStructureParserWorkerClient();
			workers.push(worker);
			return worker as unknown as IWebWorkerClient<ITableStructureParserWorker>;
		}, 3));
		const parses = Array.from({ length: 5 }, (_, index) => pool.parse({
			buffer: createTableTextBuffer(`X,Y\n${index},${index + 1}`, 'utf8'),
			format: 'csv',
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
			terminatedWorkers: workers.filter(worker => worker.disposed).length,
			workerCount: workers.length,
		}, {
			resultCount: 5,
			terminatedWorkers: 0,
			workerCount: 3,
		});
	});
});

type PendingRequest = {
	readonly input: TableStructureParserWorkerInput;
	readonly reject: (error: unknown) => void;
	readonly resolve: (output: TableStructureParserWorkerOutput) => void;
};

class TestTableStructureParserWorkerClient {
	public disposed = false;
	public readonly requests: PendingRequest[] = [];
	public requestCount = 0;

	public request(
		_method: '$parse',
		args: [TableStructureParserWorkerInput],
	): Promise<TableStructureParserWorkerOutput> {
		this.requestCount += 1;
		return new Promise<TableStructureParserWorkerOutput>((resolve, reject) => {
			this.requests.push({ input: args[0], reject, resolve });
		});
	}

	public isClosed(): boolean {
		return this.disposed;
	}

	public dispose(): void {
		if (this.disposed) {
			return;
		}
		this.disposed = true;
		for (const request of this.requests.splice(0)) {
			request.reject(new Error('The test worker was disposed.'));
		}
	}

	public complete(): void {
		const request = this.requests.shift();
		if (!request) {
			throw new Error('The test worker has no request to complete.');
		}
		request.resolve({
			durationMs: 1,
			result: emptyParsedTableStructure,
		});
	}
}

const emptyParsedTableStructure: ParsedTableStructure = {
	content: null,
	diagnostics: [],
	sheets: [],
};

function countWorkerRequests(
	workers: readonly TestTableStructureParserWorkerClient[],
): number {
	return workers.reduce((count, worker) => count + worker.requestCount, 0);
}

async function waitFor(condition: () => boolean): Promise<void> {
	for (let attempt = 0; attempt < 20; attempt += 1) {
		if (condition()) {
			return;
		}
		await new Promise<void>(resolve => globalThis.setTimeout(resolve, 0));
	}
	throw new Error('Timed out waiting for the worker pool test condition.');
}
