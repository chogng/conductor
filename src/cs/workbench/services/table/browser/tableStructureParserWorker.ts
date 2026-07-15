/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { getPerformanceNow } from 'src/cs/base/common/performance';
import { bootstrapWebWorker } from 'src/cs/base/common/worker/webWorker';
import {
	parseTableStructure,
	type ParsedTableStructure,
} from 'src/cs/workbench/services/table/common/tableStructureParser';
import type { TableFormatId } from 'src/cs/workbench/services/table/common/tableFormatService';
import {
	createTableByteBuffer,
	createTableTextBuffer,
} from 'src/cs/workbench/services/table/common/tableReadBuffer';

export type TableStructureParserWorkerBuffer =
	| {
		readonly encoding: string;
		readonly kind: 'text';
		readonly text: string;
	}
	| {
		readonly bytes: ArrayBuffer;
		readonly kind: 'bytes';
	};

export type TableStructureParserWorkerInput = {
	readonly buffer: TableStructureParserWorkerBuffer;
	readonly format: TableFormatId;
};

export type TableStructureParserWorkerOutput = {
	readonly durationMs: number;
	readonly result: ParsedTableStructure;
};

export interface ITableStructureParserWorker {
	$parse(input: TableStructureParserWorkerInput): Promise<TableStructureParserWorkerOutput>;
}

class TableStructureParserWorker implements ITableStructureParserWorker {
	public async $parse(
		input: TableStructureParserWorkerInput,
	): Promise<TableStructureParserWorkerOutput> {
		const startedAt = getPerformanceNow();
		const result = await parseTableStructure({
			buffer: input.buffer.kind === 'text'
				? createTableTextBuffer(input.buffer.text, input.buffer.encoding)
				: createTableByteBuffer(input.buffer.bytes),
			format: input.format,
		});
		return {
			durationMs: getPerformanceNow() - startedAt,
			result,
		};
	}
}

bootstrapWebWorker(
	() => new TableStructureParserWorker(),
	{
		getTransferables: (_method, output) => collectParsedTableTransferables(
			(output as TableStructureParserWorkerOutput).result,
		),
	},
);

function collectParsedTableTransferables(
	result: ParsedTableStructure,
): Transferable[] {
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
}
