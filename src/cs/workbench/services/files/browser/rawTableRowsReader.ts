/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import Papa from "papaparse";

import type {
	RawTableRows,
	RawTableRowsReadInput as RawTableRowsReadInputBase,
} from "src/cs/workbench/services/files/common/rawTableRowsReader";

export type RawTableRowsReadInput = RawTableRowsReadInputBase;

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

	const fallbackFile = input.fallbackFile;
	if (!isTextReadableFile(fallbackFile)) {
		return null;
	}

	return parseCsvRows(await fallbackFile.text(), input.maxRows);
}

const isTextReadableFile = (value: unknown): value is { text(): Promise<string> } =>
	!!value && typeof value === "object" && typeof (value as { text?: unknown }).text === "function";

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
