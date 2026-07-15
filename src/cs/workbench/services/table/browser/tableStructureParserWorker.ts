/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { getPerformanceNow } from "src/cs/base/common/performance";
import {
	parseTableStructure,
	type ParsedTableStructure,
} from "src/cs/workbench/services/table/common/tableStructureParser";
import {
	createTableByteBuffer,
	createTableTextBuffer,
} from "src/cs/workbench/services/table/common/tableReadBuffer";
import type { TableFormatId } from "src/cs/workbench/services/table/common/tableFormatService";

export type TableStructureParserWorkerBuffer =
	| {
		readonly encoding: string;
		readonly kind: "text";
		readonly text: string;
	}
	| {
		readonly bytes: ArrayBuffer;
		readonly kind: "bytes";
	};

export type TableStructureParserWorkerRequest = {
	readonly payload: {
		readonly buffer: TableStructureParserWorkerBuffer;
		readonly format: TableFormatId;
		readonly requestId: number;
	};
	readonly type: "parse";
};

export type TableStructureParserWorkerResult = {
	readonly payload: {
		readonly durationMs: number;
		readonly requestId: number;
		readonly result: ParsedTableStructure;
	};
	readonly type: "parseResult";
};

export type TableStructureParserWorkerError = {
	readonly payload: {
		readonly message: string;
		readonly requestId: number;
	};
	readonly type: "workerError";
};

export type TableStructureParserWorkerMessage =
	| TableStructureParserWorkerResult
	| TableStructureParserWorkerError;

self.onmessage = async (
	event: MessageEvent<TableStructureParserWorkerRequest>,
): Promise<void> => {
	const message = event.data;
	if (message?.type !== "parse") {
		return;
	}

	const startedAt = getPerformanceNow();
	try {
		const result = await parseTableStructure({
			buffer: message.payload.buffer.kind === "text"
				? createTableTextBuffer(
					message.payload.buffer.text,
					message.payload.buffer.encoding,
				)
				: createTableByteBuffer(message.payload.buffer.bytes),
			format: message.payload.format,
		});
		self.postMessage({
			payload: {
				durationMs: getPerformanceNow() - startedAt,
				requestId: message.payload.requestId,
				result,
			},
			type: "parseResult",
		} satisfies TableStructureParserWorkerResult, {
			transfer: collectParsedTableTransferables(result),
		});
	} catch (error) {
		self.postMessage({
			payload: {
				message: getErrorMessage(error),
				requestId: message.payload.requestId,
			},
			type: "workerError",
		} satisfies TableStructureParserWorkerError);
	}
};

const collectParsedTableTransferables = (
	result: ParsedTableStructure,
): Transferable[] => {
	const buffers = new Set<ArrayBuffer>();
	const contents = [
		result.content,
		...result.sheets.map(sheet => sheet.content),
	];
	for (const content of contents) {
		for (const facts of content?.columnFacts ?? []) {
			for (const run of facts.numericRuns) {
				if (run.values.buffer instanceof ArrayBuffer) {
					buffers.add(run.values.buffer);
				}
			}
		}
	}
	return [...buffers];
};

const getErrorMessage = (error: unknown): string =>
	error instanceof Error && error.message.trim()
		? error.message
		: "The table structure worker failed to parse the file.";
