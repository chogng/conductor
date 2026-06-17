/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type {
	AssessRawTableInput,
	ImportFileAssessment,
	RawTableAssessmentRecord,
} from "src/cs/workbench/services/assessment/common/assessment";
import type { AssessmentDiagnostic } from "src/cs/workbench/services/assessment/common/diagnostics";
import type {
	IvSweepMode,
	MeasurementFamily,
} from "src/cs/workbench/services/assessment/common/measurement";

export type CreateRawTableAssessmentRecordInput =
	Omit<AssessRawTableInput, "rows"> & {
		readonly assessment: ImportFileAssessment;
	};

export const createRawTableAssessmentRecordFromImportAssessment = (
	input: CreateRawTableAssessmentRecordInput,
): RawTableAssessmentRecord => {
	const assessment = input.assessment;
	const columnCount = normalizePositiveCount(input.columnCount) ?? 0;
	const rowCount = normalizePositiveCount(input.rowCount) ?? 0;
	const fullRange = {
		startRow: 0,
		endRow: Math.max(0, rowCount - 1),
		startCol: 0,
		endCol: Math.max(0, columnCount - 1),
	};
	const blockId = `${input.rawTableId}:block:0`;
	const diagnosticCodes = assessment.curveTypeReasons.map((_, index) =>
		`assessment.reason.${index + 1}`
	);
	const diagnostics: AssessmentDiagnostic[] = assessment.curveTypeReasons.map((reason, index) => ({
		severity: "info",
		code: diagnosticCodes[index],
		message: reason,
		relatedBlockId: blockId,
	}));

	return {
		fileId: input.fileId,
		rawTableId: input.rawTableId,
		sourceRawTableVersion: input.sourceRawTableVersion,
		groups: [],
		blocks: [{
			id: blockId,
			fileId: input.fileId,
			rawTableId: input.rawTableId,
			label: assessment.curveType ?? input.fileName ?? input.rawTableId,
			family: getMeasurementFamily(assessment),
			ivMode: getIvMode(assessment),
			source: {
				fullRange,
				dataRange: fullRange,
			},
			columns: {
				columns: [],
			},
			confidence: getAssessmentConfidenceScore(assessment),
			rowCount,
			columnCount,
			diagnosticCodes,
		}],
		diagnostics,
		createdAt: Date.now(),
	};
};

export const getColumnCount = (rows: readonly (readonly unknown[])[]): number => {
	let columnCount = 0;
	for (const row of rows) {
		columnCount = Math.max(columnCount, row.length);
	}
	return columnCount;
};

export const getAssessmentConfidenceScore = (
	assessment: ImportFileAssessment,
): number => {
	const confidence = assessment.curveTypeConfidence;
	switch (confidence) {
		case "high":
			return 0.9;
		case "medium":
			return 0.6;
		case "low":
			return 0.3;
	}

	const exhaustive: never = confidence;
	return exhaustive;
};

export const normalizePositiveCount = (value: unknown): number | undefined => {
	const count = Math.floor(Number(value));
	return Number.isFinite(count) && count > 0 ? count : undefined;
};

const getMeasurementFamily = (
	assessment: ImportFileAssessment,
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
	assessment: ImportFileAssessment,
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
