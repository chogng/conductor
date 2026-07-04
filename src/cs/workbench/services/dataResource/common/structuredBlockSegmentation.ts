/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type { StructuredContentSourceRange } from "src/cs/workbench/services/dataResource/common/structuredContent";

export type StructuredBlockTitleCell = {
	readonly row: number;
	readonly column: number;
	readonly text: string;
};

export type StructuredBlockColumn = {
	readonly column: number;
	readonly kind: "numeric" | "text";
	readonly valueRange: StructuredContentSourceRange;
};

export type StructuredBlockSegment = {
	readonly id: string;
	readonly range: StructuredContentSourceRange;
	readonly dataRange: StructuredContentSourceRange;
	readonly headerRange?: StructuredContentSourceRange;
	readonly titleRange?: StructuredContentSourceRange;
	readonly dataColumns: readonly StructuredBlockColumn[];
	readonly numericColumns: readonly number[];
	readonly separatorColumns: readonly number[];
	readonly titleCells: readonly StructuredBlockTitleCell[];
	readonly confidence: number;
	readonly reasons: readonly string[];
};

type ColumnScan = {
	readonly column: number;
	readonly longestValueRun?: ValueRun;
	readonly longestNumericRun?: ValueRun;
};

type ValueRun = {
	readonly startRow: number;
	readonly endRow: number;
	readonly pointCount: number;
};

type DataColumnGroup = {
	readonly startCol: number;
	readonly endCol: number;
	readonly scans: readonly ColumnScan[];
};

const MinimumDataRunPoints = 2;
const TitleAttachmentColumnGap = 2;
const HeaderSearchRows = 8;

export const createStructuredBlockSegments = ({
	columnCount,
	rows,
}: {
	readonly columnCount: number;
	readonly rows: readonly (readonly string[])[];
}): readonly StructuredBlockSegment[] => {
	const scans = createColumnScans({ columnCount, rows });
	const groups = createDataColumnGroups(scans);
	return groups.map((group, index) => createBlockSegment({
		group,
		index,
		rows,
		scans,
	}));
};

const createColumnScans = ({
	columnCount,
	rows,
}: {
	readonly columnCount: number;
	readonly rows: readonly (readonly string[])[];
}): readonly ColumnScan[] =>
	Array.from({ length: columnCount }, (_, column): ColumnScan => ({
		column,
		longestValueRun: findLongestValueRun(rows, column, value => Boolean(normalizeText(value))),
		longestNumericRun: findLongestValueRun(rows, column, value => parseFiniteNumber(value) !== null),
	}));

const createDataColumnGroups = (
	scans: readonly ColumnScan[],
): readonly DataColumnGroup[] => {
	const groups: DataColumnGroup[] = [];
	let startCol: number | null = null;
	for (let column = 0; column <= scans.length; column += 1) {
		const scan = column < scans.length ? scans[column] : undefined;
		if (scan && isDataLikeColumn(scan)) {
			startCol ??= column;
			continue;
		}

		if (startCol === null) {
			continue;
		}

		const endCol = column - 1;
		const groupScans = scans.slice(startCol, endCol + 1);
		if (groupScans.some(isNumericCoreColumn)) {
			groups.push({
				startCol,
				endCol,
				scans: groupScans,
			});
		}
		startCol = null;
	}
	return groups;
};

const createBlockSegment = ({
	group,
	index,
	rows,
	scans,
}: {
	readonly group: DataColumnGroup;
	readonly index: number;
	readonly rows: readonly (readonly string[])[];
	readonly scans: readonly ColumnScan[];
}): StructuredBlockSegment => {
	const numericRuns = group.scans
		.map(scan => scan.longestNumericRun)
		.filter((run): run is ValueRun => Boolean(run));
	const numericDataStartRow = Math.min(...numericRuns.map(run => run.startRow));
	const numericDataEndRow = Math.max(...numericRuns.map(run => run.endRow));
	const dataColumns = group.scans
		.filter(scan => scan.longestValueRun)
		.map((scan): StructuredBlockColumn => {
			const valueRun = scan.longestValueRun!;
			const numericRun = scan.longestNumericRun;
			const range = numericRun
				? numericRun
				: clampValueRunToNumericCore(valueRun, numericDataStartRow, numericDataEndRow);
			return {
				column: scan.column,
				kind: isNumericCoreColumn(scan) ? "numeric" : "text",
				valueRange: {
					startRow: range.startRow,
					endRow: range.endRow,
					startCol: scan.column,
					endCol: scan.column,
				},
			};
		});
	const numericColumns = group.scans
		.filter(isNumericCoreColumn)
		.map(scan => scan.column);
	const dataStartRow = numericDataStartRow;
	const dataEndRow = Math.max(...dataColumns.map(column => column.valueRange.endRow));
	const headerRow = findHeaderRow({
		dataStartRow,
		endCol: group.endCol,
		rows,
		startCol: group.startCol,
	});
	const titleCells = collectAttachedTitleCells({
		group,
		headerRow,
		rows,
		scans,
	});
	const segmentStartCol = titleCells.length
		? Math.min(group.startCol, ...titleCells.map(cell => cell.column))
		: group.startCol;
	const titleRows = titleCells.map(cell => cell.row);
	const segmentStartRow = Math.min(
		dataStartRow,
		...(headerRow !== undefined ? [headerRow] : []),
		...titleRows,
	);
	const separatorColumns = collectSeparatorColumns(scans, segmentStartCol, group.startCol - 1);
	const confidence = scoreBlockSegment({
		dataColumns,
		numericColumns,
		titleCells,
	});
	const reasons = [
		"blockSegment.dataColumnRun",
		...(numericColumns.length ? ["blockSegment.numericCore"] : []),
		...(headerRow !== undefined ? ["blockSegment.localHeader"] : []),
		...(titleCells.length ? ["blockSegment.attachedTitle"] : []),
		...(separatorColumns.length ? ["blockSegment.separatorColumns"] : []),
	];
	return {
		id: `block-segment:${index}:c${segmentStartCol}-${group.endCol}:r${segmentStartRow}-${dataEndRow}`,
		range: {
			startRow: segmentStartRow,
			endRow: dataEndRow,
			startCol: segmentStartCol,
			endCol: group.endCol,
		},
		dataRange: {
			startRow: dataStartRow,
			endRow: dataEndRow,
			startCol: group.startCol,
			endCol: group.endCol,
		},
		...(headerRow !== undefined ? {
			headerRange: {
				startRow: headerRow,
				endRow: headerRow,
				startCol: group.startCol,
				endCol: group.endCol,
			},
		} : {}),
		...(titleCells.length ? {
			titleRange: {
				startRow: Math.min(...titleRows),
				endRow: Math.max(...titleRows),
				startCol: Math.min(...titleCells.map(cell => cell.column)),
				endCol: Math.max(...titleCells.map(cell => cell.column)),
			},
		} : {}),
		dataColumns,
		numericColumns,
		separatorColumns,
		titleCells,
		confidence,
		reasons,
	};
};

const findHeaderRow = ({
	dataStartRow,
	endCol,
	rows,
	startCol,
}: {
	readonly dataStartRow: number;
	readonly endCol: number;
	readonly rows: readonly (readonly string[])[];
	readonly startCol: number;
}): number | undefined => {
	const firstCandidate = Math.max(0, dataStartRow - HeaderSearchRows);
	let bestRow: number | undefined;
	let bestScore = 0;
	for (let rowIndex = dataStartRow - 1; rowIndex >= firstCandidate; rowIndex -= 1) {
		let score = 0;
		for (let column = startCol; column <= endCol; column += 1) {
			const text = normalizeText(rows[rowIndex]?.[column]);
			if (text && parseFiniteNumber(text) === null) {
				score += 1;
			}
		}
		if (score > bestScore) {
			bestScore = score;
			bestRow = rowIndex;
		}
	}
	return bestScore > 0 ? bestRow : undefined;
};

const collectAttachedTitleCells = ({
	group,
	headerRow,
	rows,
	scans,
}: {
	readonly group: DataColumnGroup;
	readonly headerRow: number | undefined;
	readonly rows: readonly (readonly string[])[];
	readonly scans: readonly ColumnScan[];
}): readonly StructuredBlockTitleCell[] => {
	if (headerRow === undefined) {
		return [];
	}
	const cells: StructuredBlockTitleCell[] = [];
	const firstColumn = Math.max(0, group.startCol - TitleAttachmentColumnGap);
	for (let column = firstColumn; column < group.startCol; column += 1) {
		const scan = scans[column];
		if (!scan || isDataLikeColumn(scan)) {
			continue;
		}
		const text = normalizeText(rows[headerRow]?.[column]);
		if (!text || parseFiniteNumber(text) !== null) {
			continue;
		}
		cells.push({
			row: headerRow,
			column,
			text,
		});
	}
	return cells;
};

const collectSeparatorColumns = (
	scans: readonly ColumnScan[],
	startCol: number,
	endCol: number,
): readonly number[] => {
	const columns: number[] = [];
	for (let column = startCol; column <= endCol; column += 1) {
		const scan = scans[column];
		if (scan && !scan.longestValueRun) {
			columns.push(column);
		}
	}
	return columns;
};

const clampValueRunToNumericCore = (
	run: ValueRun,
	numericStartRow: number,
	numericEndRow: number,
): ValueRun => {
	const startRow = Math.max(run.startRow, numericStartRow);
	const endRow = Math.min(run.endRow, numericEndRow);
	return endRow >= startRow
		? {
			startRow,
			endRow,
			pointCount: endRow - startRow + 1,
		}
		: run;
};

const scoreBlockSegment = ({
	dataColumns,
	numericColumns,
	titleCells,
}: {
	readonly dataColumns: readonly StructuredBlockColumn[];
	readonly numericColumns: readonly number[];
	readonly titleCells: readonly StructuredBlockTitleCell[];
}): number => {
	const numericRatio = numericColumns.length / Math.max(1, dataColumns.length);
	return clampConfidence(0.58 + numericRatio * 0.32 + Math.min(0.1, titleCells.length * 0.04));
};

const isDataLikeColumn = (
	scan: ColumnScan,
): boolean =>
	Boolean(scan.longestValueRun && scan.longestValueRun.pointCount >= MinimumDataRunPoints);

const isNumericCoreColumn = (
	scan: ColumnScan,
): boolean =>
	Boolean(scan.longestNumericRun && scan.longestNumericRun.pointCount >= MinimumDataRunPoints);

const findLongestValueRun = (
	rows: readonly (readonly string[])[],
	column: number,
	predicate: (value: unknown) => boolean,
): ValueRun | undefined => {
	let currentStart: number | null = null;
	let currentCount = 0;
	let longest: ValueRun | undefined;
	for (let rowIndex = 0; rowIndex <= rows.length; rowIndex += 1) {
		const matches = rowIndex < rows.length && predicate(rows[rowIndex]?.[column]);
		if (matches) {
			currentStart ??= rowIndex;
			currentCount += 1;
			continue;
		}
		if (currentStart !== null) {
			const run = {
				startRow: currentStart,
				endRow: rowIndex - 1,
				pointCount: currentCount,
			};
			if (!longest || run.pointCount > longest.pointCount) {
				longest = run;
			}
		}
		currentStart = null;
		currentCount = 0;
	}
	return longest;
};

const parseFiniteNumber = (
	value: unknown,
): number | null => {
	const text = normalizeText(value).replace(/,/g, "");
	if (!text) {
		return null;
	}
	const number = Number(text);
	return Number.isFinite(number) ? number : null;
};

const normalizeText = (
	value: unknown,
): string => String(value ?? "").trim();

const clampConfidence = (
	value: number,
): number => Math.max(0, Math.min(1, value));
