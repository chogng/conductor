/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from "src/cs/base/common/lifecycle";
import { InstantiationType, registerSingleton } from "src/cs/platform/instantiation/common/extensions";
import { getPerfNow, logPerf } from "src/cs/workbench/common/perf";
import {
	parseTableStructure,
	type ParsedTableStructure,
	type TableStructureParseInput,
} from "src/cs/workbench/services/table/common/tableStructureParser";
import {
	ITableStructureParserService,
} from "src/cs/workbench/services/table/common/tableStructureParserService";
import { getTableReadBufferFilePart } from "src/cs/workbench/services/table/common/tableReadBuffer";
import type {
	TableStructureParserWorkerBuffer,
	TableStructureParserWorkerMessage,
	TableStructureParserWorkerRequest,
} from "src/cs/workbench/services/table/browser/tableStructureParserWorker";

const TABLE_STRUCTURE_PARSER_WORKER_DEFAULT_CONCURRENCY = 4;
const TABLE_STRUCTURE_PARSER_WORKER_MAX_CONCURRENCY = 8;
const TABLE_STRUCTURE_PARSER_WORKER_TIMEOUT_MS = 60_000;

export interface TableStructureParserWorker {
	onerror: ((event: ErrorEvent) => void) | null;
	onmessage: ((event: MessageEvent<TableStructureParserWorkerMessage>) => void) | null;
	onmessageerror: ((event: MessageEvent) => void) | null;
	postMessage(message: TableStructureParserWorkerRequest, transfer: Transferable[]): void;
	terminate(): void;
}

export type TableStructureParserWorkerFactory = () => TableStructureParserWorker;

type QueuedTableStructureParse = {
	readonly input: TableStructureParseInput;
	readonly reject: (error: Error) => void;
	readonly requestId: number;
	readonly resolve: (result: ParsedTableStructure) => void;
};

type TableStructureParserWorkerSlot = {
	activeRequest: QueuedTableStructureParse | null;
	worker: TableStructureParserWorker;
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
	private requestIdPool = 0;

	public constructor(
		private readonly concurrency = getTableStructureParserWorkerConcurrency(),
		private readonly workerFactory: TableStructureParserWorkerFactory = () =>
			new Worker(new URL("./tableStructureParserWorker.ts", import.meta.url), {
				name: "Table Structure Parser",
				type: "module",
			}),
	) {
		super();
	}

	public parse(input: TableStructureParseInput): Promise<ParsedTableStructure> {
		if (this.disposed) {
			return Promise.reject(new Error("The table structure parser worker pool is disposed."));
		}

		return new Promise<ParsedTableStructure>((resolve, reject) => {
			this.queuedRequests.push({
				input,
				reject,
				requestId: ++this.requestIdPool,
				resolve,
			});
			logPerf("table.parserWorker.enqueue", {
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
		const error = new Error("The table structure parser worker pool was disposed.");
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

		const worker = this.workerFactory();
		const slot: TableStructureParserWorkerSlot = {
			activeRequest: null,
			worker,
		};
		this.slots.push(slot);
		logPerf("table.parserWorker.createWorker", {
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
		try {
			const buffer = await createWorkerBuffer(request.input);
			if (slot.activeRequest !== request || this.disposed) {
				return;
			}

			timeout = globalThis.setTimeout(() => {
				this.removeWorker(slot);
				this.finish(slot, request, null, new Error("The table structure parser worker timed out."), startedAt);
			}, TABLE_STRUCTURE_PARSER_WORKER_TIMEOUT_MS);
			slot.worker.onmessage = (
				event: MessageEvent<TableStructureParserWorkerMessage>,
			): void => {
				const message = event.data;
				if (message?.payload?.requestId !== request.requestId) {
					return;
				}
				globalThis.clearTimeout(timeout);
				if (message.type === "parseResult") {
					logPerf("table.parser.parse", {
						durationMs: message.payload.durationMs,
						format: request.input.format,
						worker: true,
					}, { silent: true });
					this.finish(slot, request, message.payload.result, null, startedAt);
					return;
				}
				this.finish(
					slot,
					request,
					null,
					new Error(message.payload.message),
					startedAt,
				);
			};
			slot.worker.onerror = event => {
				globalThis.clearTimeout(timeout);
				this.removeWorker(slot);
				this.finish(
					slot,
					request,
					null,
					new Error(event.message || "The table structure parser worker failed."),
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
					new Error("The table structure parser worker returned an unreadable result."),
					startedAt,
				);
			};
			logPerf("table.parserWorker.dispatch", {
				format: request.input.format,
				queueLength: this.queuedRequests.length,
				workerCount: this.slots.length,
			}, { silent: true });
			slot.worker.postMessage({
				payload: {
					buffer,
					format: request.input.format,
					requestId: request.requestId,
				},
				type: "parse",
			} satisfies TableStructureParserWorkerRequest, buffer.kind === "bytes" ? [buffer.bytes] : []);
		} catch (error) {
			if (timeout !== undefined) {
				globalThis.clearTimeout(timeout);
				this.removeWorker(slot);
			}
			this.finish(slot, request, null, toError(error), startedAt);
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
		logPerf("table.parserWorker.complete", {
			durationMs: getPerfNow() - startedAt,
			format: request.input.format,
			queueLength: this.queuedRequests.length,
			success: Boolean(result),
		}, { silent: true });
		if (result) {
			request.resolve(result);
		} else {
			request.reject(error ?? new Error("The table structure parser worker failed."));
		}
		this.flush();
	}

	private removeWorker(slot: TableStructureParserWorkerSlot): void {
		slot.worker.terminate();
		const index = this.slots.indexOf(slot);
		if (index >= 0) {
			this.slots.splice(index, 1);
		}
	}
}

export class TableStructureParserService extends Disposable implements ITableStructureParserService {
	public declare readonly _serviceBrand: undefined;

	private readonly workerPool = this._register(new TableStructureParserWorkerPool());

	public parse(input: TableStructureParseInput): Promise<ParsedTableStructure> {
		if (input.format === "xls" && input.xlsReader) {
			// Native binary XLS parsing is an injected renderer callback and cannot cross the Worker boundary.
			return parseTableStructure(input);
		}
		return this.workerPool.parse(input);
	}
}

const createWorkerBuffer = async (
	input: TableStructureParseInput,
): Promise<TableStructureParserWorkerBuffer> => {
	const filePart = await getTableReadBufferFilePart(input.buffer);
	return typeof filePart === "string"
		? {
			encoding: input.buffer.kind === "text" ? input.buffer.encoding : "utf8",
			kind: "text",
			text: filePart,
		}
		: {
			bytes: filePart,
			kind: "bytes",
		};
};

const toError = (error: unknown): Error =>
	error instanceof Error
		? error
		: new Error("The table structure parser worker failed.");

registerSingleton(
	ITableStructureParserService,
	TableStructureParserService,
	InstantiationType.Delayed,
);
