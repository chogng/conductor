/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type { RawTableFactsRows } from "src/cs/workbench/services/tableFacts/common/tableFacts";
import type { TableFactsSourceRange } from "src/cs/workbench/services/tableFacts/common/diagnostics";
import {
	normalizeCellText,
	parseFiniteNumber,
} from "src/cs/workbench/common/cellText";

export type SchemaFingerprint = string;

export type HeaderRowCandidate = {
	readonly rowIndex: number;
	readonly range: TableFactsSourceRange;
	readonly confidence: number;
	readonly source: "dataName" | "strippedChannel" | "measurementHeader" | "numericFollower" | "fallback";
};

export type UnitRowCandidate = {
	readonly rowIndex: number;
	readonly range: TableFactsSourceRange;
	readonly confidence: number;
};

export type DataRegion = {
	readonly id: string;
	readonly range: TableFactsSourceRange;
	readonly rowCount: number;
	readonly columnCount: number;
};

export type BlockRegion = {
	readonly id: string;
	readonly range: TableFactsSourceRange;
	readonly kind: "single" | "repeatedHeader";
};

export type RawTableStructure = {
	readonly headerRows: readonly HeaderRowCandidate[];
	readonly unitRows: readonly UnitRowCandidate[];
	readonly dataRegions: readonly DataRegion[];
	readonly blockRegions: readonly BlockRegion[];
	readonly fingerprint: SchemaFingerprint;
};

export const createEmptyRawTableStructure = (): RawTableStructure => ({
	headerRows: [],
	unitRows: [],
	dataRegions: [],
	blockRegions: [],
	fingerprint: "",
});

export const detectRawTableStructure = (
	rows: RawTableFactsRows,
): RawTableStructure => {
	const columnCount = getColumnCount(rows);
	if (!rows.length || columnCount <= 0) {
		return createEmptyRawTableStructure();
	}

	const primaryHeader = findRawTableHeaderRow(rows, columnCount);
	const headerRows = findRepeatedHeaderRows({
		columnCount,
		primaryHeader,
		rows,
	});
	const { blockRegions, dataRegions, unitRows } = createRegionsForHeaders({
		columnCount,
		headerRows,
		rows,
	});

	return {
		headerRows,
		unitRows,
		dataRegions,
		blockRegions,
		fingerprint: createSchemaFingerprint(
			getNormalizedRow(rows, primaryHeader.rowIndex, columnCount),
		),
	};
};

export const getRawTableStructureColumnCount = (
	rows: readonly (readonly unknown[])[],
): number => {
	let columnCount = 0;
	for (const row of rows) {
		columnCount = Math.max(columnCount, row.length);
	}
	return columnCount;
};

const getColumnCount = getRawTableStructureColumnCount;

const findRawTableHeaderRow = (
	rows: RawTableFactsRows,
	columnCount: number,
): HeaderRowCandidate => {
	for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
		const row = getNormalizedRow(rows, rowIndex, columnCount);
		if (!row.length) {
			continue;
		}
		if (row[0] === "DataName" && row.slice(1).filter(Boolean).length >= 2) {
			return createHeaderRowCandidate(rowIndex, columnCount, 0.95, "dataName");
		}
		if (row.includes("CH1 Voltage") && row.includes("CH2 Voltage")) {
			return createHeaderRowCandidate(rowIndex, columnCount, 0.9, "strippedChannel");
		}
	}

	for (let rowIndex = 0; rowIndex < rows.length - 1; rowIndex += 1) {
		const row = getNormalizedRow(rows, rowIndex, columnCount);
		const nonEmptyCells = row.filter(Boolean);
		if (nonEmptyCells.length < 2) {
			continue;
		}
		if (!nonEmptyCells.some(headerLooksMeasurementRelevant)) {
			continue;
		}

		const nextRow = rows[rowIndex + 1] ?? [];
		const nextNumericCount = getNumericCellCount(nextRow);
		const followingRow = rows[rowIndex + 2] ?? [];
		if (
			nextNumericCount >= 2 ||
			(rowLooksUnitRow(nextRow) && getNumericCellCount(followingRow) >= 2)
		) {
			return createHeaderRowCandidate(rowIndex, columnCount, 0.8, "measurementHeader");
		}
	}

	for (let rowIndex = 0; rowIndex < rows.length - 1; rowIndex += 1) {
		const row = getNormalizedRow(rows, rowIndex, columnCount);
		if (row.filter(Boolean).length < 2) {
			continue;
		}
		if (getNumericCellCount(rows[rowIndex + 1] ?? []) >= 2) {
			return createHeaderRowCandidate(rowIndex, columnCount, 0.65, "numericFollower");
		}
	}

	return createHeaderRowCandidate(0, columnCount, 0.3, "fallback");
};

const findRepeatedHeaderRows = ({
	columnCount,
	primaryHeader,
	rows,
}: {
	readonly columnCount: number;
	readonly primaryHeader: HeaderRowCandidate;
	readonly rows: RawTableFactsRows;
}): readonly HeaderRowCandidate[] => {
	const fingerprint = createSchemaFingerprint(
		getNormalizedRow(rows, primaryHeader.rowIndex, columnCount),
	);
	if (!fingerprint) {
		return [primaryHeader];
	}

	const headers: HeaderRowCandidate[] = [];
	for (let rowIndex = primaryHeader.rowIndex; rowIndex < rows.length; rowIndex += 1) {
		const candidate = findStrongHeaderRowAt(rows, rowIndex, columnCount);
		if (!candidate) {
			continue;
		}
		const candidateFingerprint = createSchemaFingerprint(
			getNormalizedRow(rows, rowIndex, columnCount),
		);
		if (candidateFingerprint !== fingerprint) {
			continue;
		}

		const unit = findUnitRow(rows, candidate.rowIndex, columnCount);
		const dataStartRow = findDataStartRow(rows, candidate.rowIndex, unit?.rowIndex ?? null);
		if (dataStartRow < rows.length && getNumericCellCount(rows[dataStartRow] ?? []) > 0) {
			headers.push(candidate);
		}
	}

	if (!headers.some(header => header.rowIndex === primaryHeader.rowIndex)) {
		return [primaryHeader];
	}

	return headers.length > 1
		? headers
		: [primaryHeader];
};

const findStrongHeaderRowAt = (
	rows: RawTableFactsRows,
	rowIndex: number,
	columnCount: number,
): HeaderRowCandidate | null => {
	const row = getNormalizedRow(rows, rowIndex, columnCount);
	if (!row.length) {
		return null;
	}
	if (row[0] === "DataName" && row.slice(1).filter(Boolean).length >= 2) {
		return createHeaderRowCandidate(rowIndex, columnCount, 0.95, "dataName");
	}
	if (row.includes("CH1 Voltage") && row.includes("CH2 Voltage")) {
		return createHeaderRowCandidate(rowIndex, columnCount, 0.9, "strippedChannel");
	}

	const nonEmptyCells = row.filter(Boolean);
	if (nonEmptyCells.length < 2 || !nonEmptyCells.some(headerLooksMeasurementRelevant)) {
		return null;
	}

	const nextRow = rows[rowIndex + 1] ?? [];
	const followingRow = rows[rowIndex + 2] ?? [];
	if (
		getNumericCellCount(nextRow) >= 2 ||
		(rowLooksUnitRow(nextRow) && getNumericCellCount(followingRow) >= 2)
	) {
		return createHeaderRowCandidate(rowIndex, columnCount, 0.8, "measurementHeader");
	}

	return null;
};

const createRegionsForHeaders = ({
	columnCount,
	headerRows,
	rows,
}: {
	readonly columnCount: number;
	readonly headerRows: readonly HeaderRowCandidate[];
	readonly rows: RawTableFactsRows;
}): {
	readonly blockRegions: readonly BlockRegion[];
	readonly dataRegions: readonly DataRegion[];
	readonly unitRows: readonly UnitRowCandidate[];
} => {
	const blockRegions: BlockRegion[] = [];
	const dataRegions: DataRegion[] = [];
	const unitRows: UnitRowCandidate[] = [];
	const blockKind: BlockRegion["kind"] = headerRows.length > 1 ? "repeatedHeader" : "single";

	for (let index = 0; index < headerRows.length; index += 1) {
		const header = headerRows[index];
		const nextHeaderRowIndex = headerRows[index + 1]?.rowIndex ?? rows.length;
		const unit = findUnitRow(rows, header.rowIndex, columnCount);
		const dataStartRow = findDataStartRow(
			rows,
			header.rowIndex,
			unit?.rowIndex ?? null,
			nextHeaderRowIndex,
		);
		const dataEndRow = findDataEndRow(rows, dataStartRow, nextHeaderRowIndex - 1);
		if (unit && unit.rowIndex < nextHeaderRowIndex) {
			unitRows.push(unit);
		}
		if (dataEndRow < dataStartRow) {
			continue;
		}

		const dataRegion: DataRegion = {
			id: `data:${dataRegions.length}`,
			range: createRange(dataStartRow, dataEndRow, 0, columnCount - 1),
			rowCount: dataEndRow - dataStartRow + 1,
			columnCount,
		};
		dataRegions.push(dataRegion);
		blockRegions.push({
			id: `block-region:${blockRegions.length}`,
			range: createRange(header.rowIndex, dataEndRow, 0, columnCount - 1),
			kind: blockKind,
		});
	}

	return {
		blockRegions,
		dataRegions,
		unitRows,
	};
};

const findUnitRow = (
	rows: RawTableFactsRows,
	headerRowIndex: number,
	columnCount: number,
): UnitRowCandidate | null => {
	const candidateIndex = headerRowIndex + 1;
	if (candidateIndex >= rows.length) {
		return null;
	}

	const candidate = rows[candidateIndex] ?? [];
	if (getNumericCellCount(candidate) > 0) {
		return null;
	}

	const unitLikeCount = candidate.reduce<number>((count, cell) =>
		isUnitLikeText(cell) ? count + 1 : count,
		0
	);
	if (unitLikeCount === 0) {
		return null;
	}

	const nextRow = rows[candidateIndex + 1] ?? [];
	if (getNumericCellCount(nextRow) <= 0) {
		return null;
	}

	return {
		rowIndex: candidateIndex,
		range: createRange(candidateIndex, candidateIndex, 0, columnCount - 1),
		confidence: 0.8,
	};
};

const rowLooksUnitRow = (
	row: readonly unknown[],
): boolean =>
	getNumericCellCount(row) === 0 &&
	row.reduce<number>((count, cell) =>
		isUnitLikeText(cell) ? count + 1 : count,
		0
	) > 0;

const findDataStartRow = (
	rows: RawTableFactsRows,
	headerRowIndex: number,
	unitRowIndex: number | null,
	beforeRowIndex = rows.length,
): number => {
	const startRow = (unitRowIndex ?? headerRowIndex) + 1;
	const endBefore = Math.min(rows.length, beforeRowIndex);
	for (let rowIndex = startRow; rowIndex < endBefore; rowIndex += 1) {
		if (getNumericCellCount(rows[rowIndex] ?? []) > 0) {
			return rowIndex;
		}
	}
	return Math.min(startRow, rows.length);
};

const findDataEndRow = (
	rows: RawTableFactsRows,
	dataStartRow: number,
	beforeRowIndex = rows.length - 1,
): number => {
	let dataEndRow = dataStartRow - 1;
	const lastRowIndex = Math.min(rows.length - 1, beforeRowIndex);
	for (let rowIndex = dataStartRow; rowIndex <= lastRowIndex; rowIndex += 1) {
		if (getNumericCellCount(rows[rowIndex] ?? []) > 0) {
			dataEndRow = rowIndex;
		}
	}
	return dataEndRow;
};

const createHeaderRowCandidate = (
	rowIndex: number,
	columnCount: number,
	confidence: number,
	source: HeaderRowCandidate["source"],
): HeaderRowCandidate => ({
	rowIndex,
	range: createRange(rowIndex, rowIndex, 0, Math.max(0, columnCount - 1)),
	confidence,
	source,
});

const createRange = (
	startRow: number,
	endRow: number,
	startCol: number,
	endCol: number,
): TableFactsSourceRange => ({
	startRow,
	endRow,
	startCol,
	endCol,
});

const getNormalizedRow = (
	rows: RawTableFactsRows,
	rowIndex: number,
	columnCount: number,
): string[] => {
	const row = rows[rowIndex] ?? [];
	const result: string[] = [];
	for (let colIndex = 0; colIndex < columnCount; colIndex += 1) {
		result.push(normalizeCellText(row[colIndex]));
	}
	return result;
};

const getNumericCellCount = (
	row: readonly unknown[],
): number =>
	row.reduce<number>((count, cell) =>
		parseFiniteNumber(cell) === null ? count : count + 1,
		0
	);

const headerLooksMeasurementRelevant = (
	cell: string,
): boolean => {
	const normalized = normalizeCellText(cell).toLowerCase();
	if (!normalized) {
		return false;
	}

	const compact = normalizeCompactText(normalized);
	return (
		compact === "vg" ||
		compact === "vd" ||
		compact === "vs" ||
		compact === "id" ||
		compact === "ig" ||
		compact === "is" ||
		compact === "cp" ||
		compact === "cs" ||
		compact === "gm" ||
		compact.startsWith("var") ||
		normalized.includes("voltage") ||
		normalized.includes("current") ||
		normalized.includes("drain") ||
		normalized.includes("gate") ||
		normalized.includes("source") ||
		normalized.includes("substrate") ||
		normalized.includes("cap") ||
		normalized.includes("freq") ||
		normalized.includes("time") ||
		normalized === "point" ||
		normalized === "repeat"
	);
};

const isUnitLikeText = (
	value: unknown,
): boolean => {
	const compact = normalizeCompactText(value);
	return (
		compact === "v" ||
		compact === "mv" ||
		compact === "uv" ||
		compact === "nv" ||
		compact === "a" ||
		compact === "ma" ||
		compact === "ua" ||
		compact === "na" ||
		compact === "pa" ||
		compact === "f" ||
		compact === "mf" ||
		compact === "uf" ||
		compact === "nf" ||
		compact === "pf" ||
		compact === "hz" ||
		compact === "khz" ||
		compact === "mhz" ||
		compact === "ghz" ||
		compact === "s" ||
		compact === "ms" ||
		compact === "us" ||
		compact === "ns" ||
		compact === "ohm" ||
		compact === "kohm" ||
		compact === "mohm"
	);
};

const createSchemaFingerprint = (
	headers: readonly string[],
): SchemaFingerprint =>
	headers
		.map(header => normalizeCompactText(header))
		.filter(Boolean)
		.join("|");

const normalizeCompactText = (
	value: unknown,
): string =>
	normalizeCellText(value)
		.toLowerCase()
		.replace(/[\s_\-./()[\]{}:=`]+/g, "");
