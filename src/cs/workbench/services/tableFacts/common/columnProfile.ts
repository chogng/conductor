/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type {
	ImportTableFactsSeed,
	RawTableFactsRows,
} from "src/cs/workbench/services/tableFacts/common/tableFacts";
import type { TableFactsSourceRange } from "src/cs/workbench/services/tableFacts/common/diagnostics";
import type {
	MeasurementColumnRef,
} from "src/cs/workbench/services/tableFacts/common/measurement";
import {
	detectRawTableStructure,
	getRawTableStructureColumnCount,
	type RawTableStructure,
} from "src/cs/workbench/services/tableFacts/common/rawTableStructure";
import type { ColumnSemanticCandidate } from "src/cs/workbench/services/tableFacts/common/semanticCandidate";
import {
	createColumnSemanticCandidates,
	getPreferredRoleCandidate,
	getPreferredUnitCandidate,
} from "src/cs/workbench/services/tableFacts/common/semanticCandidate";
import {
	normalizeCellText,
	parseFiniteNumber,
} from "src/cs/workbench/common/cellText";

export type ColumnKind = "numeric" | "text" | "mixed" | "empty";

export type ColumnNumericStats = {
	readonly sampleCount: number;
	readonly finiteCount: number;
	readonly min: number;
	readonly max: number;
	readonly medianAbs: number;
	readonly exponentMin: number;
	readonly exponentMax: number;
	readonly monotonicity: number;
	readonly uniqueRatio: number;
	readonly span: number;
};

export type ColumnProfile = {
	readonly rawCol: number;
	readonly headerText: string;
	readonly normalizedHeader: string;
	readonly explicitUnitText?: string | null;
	readonly kind: ColumnKind;
	readonly numericStats?: ColumnNumericStats;
};

export type MeasurementColumnProfile = {
	readonly columns: readonly MeasurementColumnRef[];
	readonly dataRange?: TableFactsSourceRange;
	readonly headerRange?: TableFactsSourceRange;
};

export const createColumnProfiles = ({
	rows,
	structure,
}: {
	readonly rows: RawTableFactsRows;
	readonly structure?: RawTableStructure;
}): readonly ColumnProfile[] => {
	if (!rows.length) {
		return [];
	}

	const tableStructure = structure ?? detectRawTableStructure(rows);
	const dataRegion = tableStructure.dataRegions[0] ?? null;
	const headerRowIndex = tableStructure.headerRows[0]?.rowIndex ?? 0;
	const unitRowIndex = tableStructure.unitRows[0]?.rowIndex ?? null;
	const columnCount = dataRegion?.columnCount ?? getRawTableStructureColumnCount(rows);
	const headers = getNormalizedRow(rows, headerRowIndex, columnCount);
	const dataStartRow = dataRegion?.range.startRow ?? Math.min(headerRowIndex + 1, rows.length);
	const dataEndRow = dataRegion?.range.endRow ?? rows.length - 1;
	const profiles: ColumnProfile[] = [];

	for (let rawCol = 0; rawCol < columnCount; rawCol += 1) {
		const columnValues = collectColumnValues({
			dataEndRow,
			dataStartRow,
			rawCol,
			rows,
		});
		const numericValues = columnValues
			.map(value => parseFiniteNumber(value))
			.filter((value): value is number => value !== null);
		const textCount = columnValues
			.map(value => normalizeCellText(value))
			.filter(value => value && parseFiniteNumber(value) === null)
			.length;
		const kind = getColumnKind({
			numericCount: numericValues.length,
			textCount,
			totalCount: columnValues.length,
		});

		profiles.push({
			rawCol,
			headerText: headers[rawCol] ?? "",
			normalizedHeader: normalizeHeader(headers[rawCol] ?? ""),
			explicitUnitText: unitRowIndex === null
				? null
				: normalizeCellText(rows[unitRowIndex]?.[rawCol]) || null,
			kind,
			numericStats: numericValues.length
				? createNumericStats(numericValues, columnValues.length)
				: undefined,
		});
	}

	return profiles;
};

export const createMeasurementColumnProfile = ({
	columnProfiles,
	rows,
	semanticCandidates,
	structure,
	tableFactsSeed,
}: {
	readonly columnProfiles?: readonly ColumnProfile[];
	readonly rows: RawTableFactsRows;
	readonly semanticCandidates?: readonly ColumnSemanticCandidate[];
	readonly structure?: RawTableStructure;
	readonly tableFactsSeed: ImportTableFactsSeed;
}): MeasurementColumnProfile => {
	if (!rows.length) {
		return { columns: [] };
	}

	const tableStructure = structure ?? detectRawTableStructure(rows);
	const dataRegion = tableStructure.dataRegions[0] ?? null;
	const header = tableStructure.headerRows[0] ?? null;
	const unit = tableStructure.unitRows[0] ?? null;
	const profiles = columnProfiles ?? createColumnProfiles({
		rows,
		structure: tableStructure,
	});
	const candidates = semanticCandidates ?? createColumnSemanticCandidates({
		columnProfiles: profiles,
		tableFactsSeed,
	});
	const candidatesByCol = new Map(candidates.map(candidate => [candidate.rawCol, candidate]));
	const columns: MeasurementColumnRef[] = [];

	for (const profile of profiles) {
		if (profile.kind !== "numeric" && profile.kind !== "mixed") {
			continue;
		}

		const candidate = candidatesByCol.get(profile.rawCol);
		const roleCandidate = candidate ? getPreferredRoleCandidate(candidate) : null;
		const unitCandidate = candidate ? getPreferredUnitCandidate(candidate) : null;
		columns.push({
			rawCol: profile.rawCol,
			headerText: profile.headerText,
			role: roleCandidate?.role ?? "unknown",
			unit: unitCandidate?.canonicalUnit ?? null,
			sourceRange: header
				? {
					startRow: header.rowIndex,
					endRow: unit?.rowIndex ?? header.rowIndex,
					startCol: profile.rawCol,
					endCol: profile.rawCol,
				}
				: undefined,
			confidence: Math.max(roleCandidate?.confidence ?? 0.35, unitCandidate?.confidence ?? 0),
		});
	}

	return {
		columns,
		dataRange: dataRegion?.range,
		headerRange: header?.range,
	};
};

const collectColumnValues = ({
	dataEndRow,
	dataStartRow,
	rawCol,
	rows,
}: {
	readonly dataEndRow: number;
	readonly dataStartRow: number;
	readonly rawCol: number;
	readonly rows: RawTableFactsRows;
}): readonly unknown[] => {
	const values: unknown[] = [];
	for (let rowIndex = dataStartRow; rowIndex <= dataEndRow && rowIndex < rows.length; rowIndex += 1) {
		values.push(rows[rowIndex]?.[rawCol]);
	}
	return values;
};

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

const normalizeHeader = (
	value: unknown,
): string =>
	normalizeCellText(value)
		.toLowerCase()
		.replace(/\s+/g, " ")
		.trim();

const getColumnKind = ({
	numericCount,
	textCount,
	totalCount,
}: {
	readonly numericCount: number;
	readonly textCount: number;
	readonly totalCount: number;
}): ColumnKind => {
	if (totalCount <= 0 || (numericCount === 0 && textCount === 0)) {
		return "empty";
	}
	if (numericCount > 0 && textCount === 0) {
		return "numeric";
	}
	if (numericCount > 0 && textCount > 0) {
		return "mixed";
	}
	return "text";
};

const createNumericStats = (
	values: readonly number[],
	sampleCount: number,
): ColumnNumericStats => {
	const finiteValues = values.filter(Number.isFinite);
	const sortedAbs = finiteValues
		.map(value => Math.abs(value))
		.sort((left, right) => left - right);
	const min = Math.min(...finiteValues);
	const max = Math.max(...finiteValues);
	const uniqueValues = new Set(finiteValues.map(value => String(value)));
	const exponents = finiteValues
		.filter(value => value !== 0)
		.map(value => Math.floor(Math.log10(Math.abs(value))));
	return {
		sampleCount,
		finiteCount: finiteValues.length,
		min,
		max,
		medianAbs: getMedian(sortedAbs),
		exponentMin: exponents.length ? Math.min(...exponents) : 0,
		exponentMax: exponents.length ? Math.max(...exponents) : 0,
		monotonicity: getMonotonicity(finiteValues),
		uniqueRatio: finiteValues.length ? uniqueValues.size / finiteValues.length : 0,
		span: max - min,
	};
};

const getMedian = (
	sortedValues: readonly number[],
): number => {
	if (!sortedValues.length) {
		return 0;
	}
	const middle = Math.floor(sortedValues.length / 2);
	if (sortedValues.length % 2 === 1) {
		return sortedValues[middle] ?? 0;
	}
	return ((sortedValues[middle - 1] ?? 0) + (sortedValues[middle] ?? 0)) / 2;
};

const getMonotonicity = (
	values: readonly number[],
): number => {
	if (values.length < 2) {
		return 0;
	}
	let increasing = 0;
	let decreasing = 0;
	for (let index = 1; index < values.length; index += 1) {
		const previous = values[index - 1] ?? 0;
		const current = values[index] ?? 0;
		if (current > previous) {
			increasing += 1;
		} else if (current < previous) {
			decreasing += 1;
		}
	}
	const denominator = values.length - 1;
	return denominator > 0
		? Math.max(increasing, decreasing) / denominator
		: 0;
};
