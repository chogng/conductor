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
	readonly assessment: ImportTableFactsSeed;
	readonly assessmentConfidence: number;
	readonly columnCount: number;
	readonly columnProfile: MeasurementColumnProfile;
	readonly diagnosticCodes: readonly string[];
	readonly fileId: string;
	readonly fileName?: string | null;
	readonly rawTableId: string;
	readonly rowCount: number;
	readonly structure?: RawTableStructure;
};

export const detectMeasurementBlocks = ({
	assessment,
	assessmentConfidence,
	columnCount,
	columnProfile,
	diagnosticCodes,
	fileId,
	fileName,
	rawTableId,
	rowCount,
	structure,
}: DetectMeasurementBlocksInput): readonly MeasurementBlockRecord[] => {
	const fullRange = createFullRange(rowCount, columnCount);
	const family = getMeasurementFamily(assessment);
	const ivMode = getIvMode(assessment);
	const label = assessment.curveType ?? fileName ?? rawTableId;
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
				confidence: assessmentConfidence,
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
		confidence: assessmentConfidence,
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
	assessment: ImportTableFactsSeed,
): MeasurementFamily => {
	if (
		assessment.curveFamily === "iv" ||
		assessment.curveFamily === "cv" ||
		assessment.curveFamily === "cf" ||
		assessment.curveFamily === "pv" ||
		assessment.curveFamily === "it"
	) {
		return assessment.curveFamily;
	}
	if (
		assessment.xAxisRole === "vg" ||
		assessment.xAxisRole === "vd" ||
		isIvCurveTypeText(assessment.curveType)
	) {
		return "iv";
	}
	return "unknown";
};

const getIvMode = (
	assessment: ImportTableFactsSeed,
): IvSweepMode | undefined => {
	if (
		assessment.curveFamily === "iv" ||
		assessment.xAxisRole === "vg" ||
		assessment.xAxisRole === "vd" ||
		isIvCurveTypeText(assessment.curveType)
	) {
		if (assessment.ivMode === "transfer" || assessment.ivMode === "output") {
			return assessment.ivMode;
		}
		if (assessment.xAxisRole === "vg") {
			return "transfer";
		}
		if (assessment.xAxisRole === "vd") {
			return "output";
		}
		const curveType = String(assessment.curveType ?? "").toLowerCase();
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
