/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import Papa from "papaparse";

import {
	loadConvertedCsvFile,
} from "src/cs/workbench/services/files/browser/fileConverter";
import type {
	ConvertedCsvReaderService,
} from "src/cs/workbench/services/files/common/fileConverterBackend";
import type {
	RawTableRows,
	RawTableRowsReadInput as RawTableRowsReadInputBase,
} from "src/cs/workbench/services/files/common/rawTableRowsReader";

export type RawTableRowsReadInput = {
	readonly convertedCsvReaderService: ConvertedCsvReaderService;
} & RawTableRowsReadInputBase;

export async function readRawTableRows(
	input: RawTableRowsReadInput,
): Promise<RawTableRows | null> {
	const rowStore = input.rowStore;
	if (!rowStore) {
		return null;
	}

	if (rowStore.kind === "memory") {
		return rowStore.rows.map(convertRowToStrings);
	}

	const file = await loadConvertedCsvFile({
		convertedCsvReaderService: input.convertedCsvReaderService,
		fallbackFile: input.fallbackFile,
		fileName: input.fileName ?? undefined,
		lastModified: input.lastModified ?? undefined,
		normalizedCsvPath: rowStore.normalizedCsvPath,
	});
	if (!file) {
		return null;
	}

	return parseCsvRows(await file.text());
}

function parseCsvRows(text: string): RawTableRows {
	const parsed = Papa.parse<unknown[]>(text, {
		skipEmptyLines: false,
	});
	return parsed.data.map(convertRowToStrings);
}

function convertRowToStrings(row: readonly unknown[]): readonly string[] {
	return row.map(cell => cell == null ? "" : String(cell));
}
