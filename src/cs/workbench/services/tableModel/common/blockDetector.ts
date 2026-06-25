/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type {
	ImportTableModelSeed,
} from "src/cs/workbench/services/tableModel/common/tableModel";
import type { MeasurementColumnProfile } from "src/cs/workbench/services/tableModel/common/columnProfile";
import type { TableModelSourceRange } from "src/cs/workbench/services/tableModel/common/diagnostics";
import type {
	IvSweepMode,
	MeasurementBlockRecord,
	MeasurementColumnRef,
	MeasurementFamily,
} from "src/cs/workbench/services/tableModel/common/measurement";
import type {
	RawTableStructure,
} from "src/cs/workbench/services/tableModel/common/rawTableStructure";

export type DetectMeasurementBlocksInput = {
	readonly columnCount: number;
	readonly columnProfile: MeasurementColumnProfile;
	readonly diagnosticCodes: readonly string[];
	readonly fileId: string;
	readonly fileName?: string | null;
	readonly rawTableId: string;
	readonly rowCount: number;
	readonly structure?: RawTableStructure;
	readonly tableModelConfidence: number;
	readonly tableModelSeed: ImportTableModelSeed;
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
	tableModelConfidence,
	tableModelSeed,
}: DetectMeasurementBlocksInput): readonly MeasurementBlockRecord[] => {
	const fullRange = createFullRange(rowCount, columnCount);
	const family = getMeasurementFamily(tableModelSeed);
	const ivMode = getIvMode(tableModelSeed);
	const label = tableModelSeed.curveType ?? fileName ?? rawTableId;
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
				confidence: tableModelConfidence,
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
		confidence: tableModelConfidence,
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
): TableModelSourceRange => ({
	startRow: 0,
	endRow: Math.max(0, rowCount - 1),
	startCol: 0,
	endCol: Math.max(0, columnCount - 1),
});

const retargetColumnsToHeaderRange = (
	columns: readonly MeasurementColumnRef[],
	headerRange?: TableModelSourceRange,
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
	range: TableModelSourceRange,
): number =>
	Math.max(0, range.endRow - range.startRow + 1);

const getRangeColumnCount = (
	range: TableModelSourceRange,
): number =>
	Math.max(0, range.endCol - range.startCol + 1);

const getMeasurementFamily = (
	tableModelSeed: ImportTableModelSeed,
): MeasurementFamily => {
	if (
		tableModelSeed.curveFamily === "iv" ||
		tableModelSeed.curveFamily === "cv" ||
		tableModelSeed.curveFamily === "cf" ||
		tableModelSeed.curveFamily === "pv" ||
		tableModelSeed.curveFamily === "it"
	) {
		return tableModelSeed.curveFamily;
	}
	if (
		tableModelSeed.xAxisRole === "vg" ||
		tableModelSeed.xAxisRole === "vd" ||
		isIvCurveTypeText(tableModelSeed.curveType)
	) {
		return "iv";
	}
	return "unknown";
};

const getIvMode = (
	tableModelSeed: ImportTableModelSeed,
): IvSweepMode | undefined => {
	if (
		tableModelSeed.curveFamily === "iv" ||
		tableModelSeed.xAxisRole === "vg" ||
		tableModelSeed.xAxisRole === "vd" ||
		isIvCurveTypeText(tableModelSeed.curveType)
	) {
		if (tableModelSeed.ivMode === "transfer" || tableModelSeed.ivMode === "output") {
			return tableModelSeed.ivMode;
		}
		if (tableModelSeed.xAxisRole === "vg") {
			return "transfer";
		}
		if (tableModelSeed.xAxisRole === "vd") {
			return "output";
		}
		const curveType = String(tableModelSeed.curveType ?? "").toLowerCase();
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
