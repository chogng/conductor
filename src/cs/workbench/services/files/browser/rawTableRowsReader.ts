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
		return limitRows(rowStore.rows, input.maxRows).map(convertRowToStrings);
	}

	const file = await loadConvertedCsvFile({
		convertedCsvReaderService: input.convertedCsvReaderService,
		fallbackFile: input.fallbackFile,
		fileName: input.fileName ?? undefined,
		lastModified: input.lastModified ?? undefined,
		maxRows: input.maxRows,
		normalizedCsvPath: rowStore.normalizedCsvPath,
	});
	if (!file) {
		return null;
	}

	return parseCsvRows(await file.text(), input.maxRows);
}

function parseCsvRows(text: string, maxRows?: number): RawTableRows {
	const preview = normalizeMaxRows(maxRows);
	const parsed = Papa.parse<unknown[]>(text, {
		...(preview !== undefined ? { preview } : {}),
		skipEmptyLines: false,
	});
	return parsed.data.map(convertRowToStrings);
}

function limitRows<T>(
	rows: readonly T[],
	maxRows: number | undefined,
): readonly T[] {
	const preview = normalizeMaxRows(maxRows);
	return preview === undefined ? rows : rows.slice(0, preview);
}

function normalizeMaxRows(value: number | undefined): number | undefined {
	const normalized = Math.floor(Number(value));
	return Number.isFinite(normalized) && normalized >= 0 ? normalized : undefined;
}

function convertRowToStrings(row: readonly unknown[]): readonly string[] {
	return row.map(cell => cell == null ? "" : String(cell));
}
