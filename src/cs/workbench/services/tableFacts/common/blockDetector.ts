/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type {
	ImportTableFactsSeed,
} from "src/cs/workbench/services/tableFacts/common/tableFacts";
import type { MeasurementColumnProfile } from "src/cs/workbench/services/tableFacts/common/columnProfile";
import type { TableFactsSourceRange } from "src/cs/workbench/services/tableFacts/common/diagnostics";
import type {
	IvSweepMode,
	MeasurementBlockRecord,
	MeasurementColumnRef,
	MeasurementFamily,
} from "src/cs/workbench/services/tableFacts/common/measurement";
import type {
	RawTableStructure,
} from "src/cs/workbench/services/tableFacts/common/rawTableStructure";

export type DetectMeasurementBlocksInput = {
	readonly columnCount: number;
	readonly columnProfile: MeasurementColumnProfile;
	readonly diagnosticCodes: readonly string[];
	readonly fileId: string;
	readonly fileName?: string | null;
	readonly rawTableId: string;
	readonly rowCount: number;
	readonly structure?: RawTableStructure;
	readonly tableFactsConfidence: number;
	readonly tableFactsSeed: ImportTableFactsSeed;
};

export const detectMeasurementBlocks = ({
	columnCount,
	columnProfile,
	diagnosticCodes,
	fileId,
	fileName,
	rawTableId,
	rowCount,
	structure,
	tableFactsConfidence,
	tableFactsSeed,
}: DetectMeasurementBlocksInput): readonly MeasurementBlockRecord[] => {
	const fullRange = createFullRange(rowCount, columnCount);
	const family = getMeasurementFamily(tableFactsSeed);
	const ivMode = getIvMode(tableFactsSeed);
	const label = tableFactsSeed.curveType ?? fileName ?? rawTableId;
	if (structure && structure.blockRegions.length > 1) {
		return structure.blockRegions.map((blockRegion, index) => {
			const dataRegion = structure.dataRegions[index] ?? null;
			const header = structure.headerRows[index] ?? null;
			const headerRange = header?.range ?? columnProfile.headerRange;
			const dataRange = dataRegion?.range ?? columnProfile.dataRange ?? blockRegion.range;
			return {
				id: createMeasurementBlockId(rawTableId, index),
				fileId,
				rawTableId,
				label,
				family,
				ivMode,
				source: {
					fullRange: blockRegion.range,
					headerRange,
					dataRange,
				},
				columns: {
					columns: retargetColumnsToHeaderRange(columnProfile.columns, headerRange),
				},
				confidence: tableFactsConfidence,
				rowCount: dataRegion?.rowCount ?? getRangeRowCount(blockRegion.range),
				columnCount: dataRegion?.columnCount ?? getRangeColumnCount(blockRegion.range),
				diagnosticCodes,
			};
		});
	}

	return [{
		id: createMeasurementBlockId(rawTableId, 0),
		fileId,
		rawTableId,
		label,
		family,
		ivMode,
		source: {
			fullRange,
			headerRange: columnProfile.headerRange,
			dataRange: columnProfile.dataRange ?? fullRange,
		},
		columns: {
			columns: columnProfile.columns,
		},
		confidence: tableFactsConfidence,
		rowCount,
		columnCount,
		diagnosticCodes,
	}];
};

export const createMeasurementBlockId = (
	rawTableId: string,
	blockIndex: number,
): string => `${rawTableId}:block:${blockIndex}`;

const createFullRange = (
	rowCount: number,
	columnCount: number,
): TableFactsSourceRange => ({
	startRow: 0,
	endRow: Math.max(0, rowCount - 1),
	startCol: 0,
	endCol: Math.max(0, columnCount - 1),
});

const retargetColumnsToHeaderRange = (
	columns: readonly MeasurementColumnRef[],
	headerRange?: TableFactsSourceRange,
): readonly MeasurementColumnRef[] => {
	if (!headerRange) {
		return columns;
	}

	return columns.map(column => ({
		...column,
		sourceRange: {
			startRow: headerRange.startRow,
			endRow: headerRange.endRow,
			startCol: column.rawCol,
			endCol: column.rawCol,
		},
	}));
};

const getRangeRowCount = (
	range: TableFactsSourceRange,
): number =>
	Math.max(0, range.endRow - range.startRow + 1);

const getRangeColumnCount = (
	range: TableFactsSourceRange,
): number =>
	Math.max(0, range.endCol - range.startCol + 1);

const getMeasurementFamily = (
	tableFactsSeed: ImportTableFactsSeed,
): MeasurementFamily => {
	if (
		tableFactsSeed.curveFamily === "iv" ||
		tableFactsSeed.curveFamily === "cv" ||
		tableFactsSeed.curveFamily === "cf" ||
		tableFactsSeed.curveFamily === "pv" ||
		tableFactsSeed.curveFamily === "it"
	) {
		return tableFactsSeed.curveFamily;
	}
	if (
		tableFactsSeed.xAxisRole === "vg" ||
		tableFactsSeed.xAxisRole === "vd" ||
		isIvCurveTypeText(tableFactsSeed.curveType)
	) {
		return "iv";
	}
	return "unknown";
};

const getIvMode = (
	tableFactsSeed: ImportTableFactsSeed,
): IvSweepMode | undefined => {
	if (
		tableFactsSeed.curveFamily === "iv" ||
		tableFactsSeed.xAxisRole === "vg" ||
		tableFactsSeed.xAxisRole === "vd" ||
		isIvCurveTypeText(tableFactsSeed.curveType)
	) {
		if (tableFactsSeed.ivMode === "transfer" || tableFactsSeed.ivMode === "output") {
			return tableFactsSeed.ivMode;
		}
		if (tableFactsSeed.xAxisRole === "vg") {
			return "transfer";
		}
		if (tableFactsSeed.xAxisRole === "vd") {
			return "output";
		}
		const curveType = String(tableFactsSeed.curveType ?? "").toLowerCase();
		if (curveType.includes("transfer")) {
			return "transfer";
		}
		if (curveType.includes("output")) {
			return "output";
		}
		return "unknown";
	}
	return undefined;
};

const isIvCurveTypeText = (value: unknown): boolean => {
	const curveType = String(value ?? "").toLowerCase();
	return curveType.includes("transfer") ||
		curveType.includes("output") ||
		curveType.includes("id-v") ||
		curveType === "iv";
};
