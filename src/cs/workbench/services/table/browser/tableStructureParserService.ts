/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'src/cs/base/common/lifecycle';
import type { IWebWorkerClient } from 'src/cs/base/common/worker/webWorker';
import { getPerfNow, logPerf } from 'src/cs/workbench/common/perf';
import type {
	ITableStructureParserWorker,
	TableStructureParserWorkerBuffer,
} from 'src/cs/workbench/services/table/browser/tableStructureParserWorker';
import {
	parseTableStructure,
	type ParsedTableStructure,
	type TableStructureParseInput,
} from 'src/cs/workbench/services/table/common/tableStructureParser';
import { ITableStructureParserService } from 'src/cs/workbench/services/table/common/tableStructureParserService';
import { getTableReadBufferFilePart } from 'src/cs/workbench/services/table/common/tableReadBuffer';

const TABLE_STRUCTURE_PARSER_WORKER_DEFAULT_CONCURRENCY = 4;
const TABLE_STRUCTURE_PARSER_WORKER_MAX_CONCURRENCY = 8;
const TABLE_STRUCTURE_PARSER_WORKER_TIMEOUT_MS = 60_000;

export type TableStructureParserWorkerClientFactory = () => IWebWorkerClient<ITableStructureParserWorker>;

type QueuedTableStructureParse = {
	readonly input: TableStructureParseInput;
	readonly reject: (error: Error) => void;
	readonly resolve: (result: ParsedTableStructure) => void;
};

type TableStructureParserWorkerSlot = {
	activeRequest: QueuedTableStructureParse | null;
	readonly worker: IWebWorkerClient<ITableStructureParserWorker>;
};

export function getTableStructureParserWorkerConcurrency(
	hardwareConcurrency = globalThis.navigator?.hardwareConcurrency,
): number {
	const coreCount = Number.isFinite(hardwareConcurrency)
		? Math.max(1, Math.floor(Number(hardwareConcurrency)))
		: TABLE_STRUCTURE_PARSER_WORKER_DEFAULT_CONCURRENCY + 1;
	return Math.max(
		1,
		Math.min(TABLE_STRUCTURE_PARSER_WORKER_MAX_CONCURRENCY, coreCount - 1),
	);
}

export class TableStructureParserWorkerPool extends Disposable {
	private readonly queuedRequests: QueuedTableStructureParse[] = [];
	private readonly slots: TableStructureParserWorkerSlot[] = [];
	private disposed = false;

	public constructor(
		private readonly workerFactory: TableStructureParserWorkerClientFactory,
		private readonly concurrency = getTableStructureParserWorkerConcurrency(),
	) {
		super();
	}

	public parse(input: TableStructureParseInput): Promise<ParsedTableStructure> {
		if (this.disposed) {
			return Promise.reject(new Error('The table structure parser worker pool is disposed.'));
		}

		return new Promise<ParsedTableStructure>((resolve, reject) => {
			this.queuedRequests.push({ input, reject, resolve });
			logPerf('table.parserWorker.enqueue', {
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
		const error = new Error('The table structure parser worker pool was disposed.');
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
			let slot: TableStructureParserWorkerSlot | null;
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

	private getAvailableSlot(): TableStructureParserWorkerSlot | null {
		const available = this.slots.find(slot => !slot.activeRequest);
		if (available) {
			return available;
		}
		if (this.slots.length >= this.concurrency) {
			return null;
		}

		const slot: TableStructureParserWorkerSlot = {
			activeRequest: null,
			worker: this.workerFactory(),
		};
		this.slots.push(slot);
		logPerf('table.parserWorker.createWorker', {
			concurrency: this.concurrency,
			workerCount: this.slots.length,
		}, { silent: true });
		return slot;
	}

	private async dispatch(
		slot: TableStructureParserWorkerSlot,
		request: QueuedTableStructureParse,
	): Promise<void> {
		const startedAt = getPerfNow();
		let timeout: ReturnType<typeof globalThis.setTimeout> | undefined;
		let timedOut = false;
		try {
			const buffer = await createWorkerBuffer(request.input);
			if (slot.activeRequest !== request || this.disposed) {
				return;
			}

			const workerRequest = slot.worker.request('$parse', [{
				buffer,
				format: request.input.format,
			}], buffer.kind === 'bytes' ? [buffer.bytes] : []);
			const output = await new Promise<Awaited<typeof workerRequest>>((resolve, reject) => {
				timeout = globalThis.setTimeout(() => {
					timedOut = true;
					reject(new Error('The table structure parser worker timed out.'));
				}, TABLE_STRUCTURE_PARSER_WORKER_TIMEOUT_MS);
				workerRequest.then(resolve, reject);
			});
			if (slot.activeRequest !== request || this.disposed) {
				return;
			}

			logPerf('table.parser.parse', {
				durationMs: output.durationMs,
				format: request.input.format,
				worker: true,
			}, { silent: true });
			this.finish(slot, request, output.result, null, startedAt);
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
		slot: TableStructureParserWorkerSlot,
		request: QueuedTableStructureParse,
		result: ParsedTableStructure | null,
		error: Error | null,
		startedAt: number,
	): void {
		if (slot.activeRequest !== request) {
			return;
		}
		slot.activeRequest = null;
		logPerf('table.parserWorker.complete', {
			durationMs: getPerfNow() - startedAt,
			format: request.input.format,
			queueLength: this.queuedRequests.length,
			success: Boolean(result),
		}, { silent: true });
		if (result) {
			request.resolve(result);
		} else {
			request.reject(error ?? new Error('The table structure parser worker failed.'));
		}
		this.flush();
	}

	private removeWorker(slot: TableStructureParserWorkerSlot): void {
		slot.worker.dispose();
		const index = this.slots.indexOf(slot);
		if (index >= 0) {
			this.slots.splice(index, 1);
		}
	}
}

export class TableStructureParserService extends Disposable implements ITableStructureParserService {
	public declare readonly _serviceBrand: undefined;

	private readonly workerPool: TableStructureParserWorkerPool;

	public constructor(workerFactory: TableStructureParserWorkerClientFactory) {
		super();
		this.workerPool = this._register(new TableStructureParserWorkerPool(workerFactory));
	}

	public parse(input: TableStructureParseInput): Promise<ParsedTableStructure> {
		if (input.format === 'xls' && input.xlsReader) {
			// Native binary XLS parsing is an injected renderer callback and cannot cross the Worker boundary.
			return parseTableStructure(input);
		}
		return this.workerPool.parse(input);
	}
}

async function createWorkerBuffer(
	input: TableStructureParseInput,
): Promise<TableStructureParserWorkerBuffer> {
	const filePart = await getTableReadBufferFilePart(input.buffer);
	return typeof filePart === 'string'
		? {
			encoding: input.buffer.kind === 'text' ? input.buffer.encoding : 'utf8',
			kind: 'text',
			text: filePart,
		}
		: {
			bytes: filePart,
			kind: 'bytes',
		};
}

function toError(error: unknown): Error {
	return error instanceof Error
		? error
		: new Error('The table structure parser worker failed.');
}
