/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import {
	ASSESSMENT_RULE_VERSION,
	type AssessRawTableInput,
	type ImportAssessmentSeed,
	type ImportTableFactsSeed,
	type RawTableFactsRecord,
	type RawTableAssessmentRecord,
} from "src/cs/workbench/services/assessment/common/assessment";
import {
	createMeasurementBlockId,
	detectMeasurementBlocks,
} from "src/cs/workbench/services/assessment/common/blockDetector";
import {
	detectLayoutCandidates,
	type LayoutCandidate,
} from "src/cs/workbench/services/assessment/common/layoutCandidate";
import {
	createAssessmentReasonDiagnosticCodes,
	createAssessmentReasonDiagnostics,
} from "src/cs/workbench/services/assessment/common/diagnostics";
import type {
	MeasurementBlockRecord,
} from "src/cs/workbench/services/assessment/common/measurement";
import {
	createColumnProfiles,
	createMeasurementColumnProfile,
	type ColumnProfile,
	type MeasurementColumnProfile,
} from "src/cs/workbench/services/assessment/common/columnProfile";
import {
	detectRawTableStructure,
	type RawTableStructure,
} from "src/cs/workbench/services/assessment/common/rawTableStructure";
import type { ColumnSemanticCandidate } from "src/cs/workbench/services/assessment/common/semanticCandidate";
import { createColumnSemanticCandidates } from "src/cs/workbench/services/assessment/common/semanticCandidate";
import type { SchemaProfile } from "src/cs/workbench/services/schemaProfile/common/schemaProfile";
import { findExactSchemaProfileMatch } from "src/cs/workbench/services/schemaProfile/common/schemaProfileMatcher";

export type CreateRawTableFactsRecordFromImportSeedInput =
	Omit<AssessRawTableInput, "rows"> & {
		readonly tableFactsSeed: ImportTableFactsSeed;
		readonly blocks?: readonly MeasurementBlockRecord[];
		readonly columnProfile?: MeasurementColumnProfile;
		readonly columnProfiles?: readonly ColumnProfile[];
		readonly layoutCandidates?: readonly LayoutCandidate[];
		readonly rows?: AssessRawTableInput["rows"];
		readonly schemaProfile?: SchemaProfile | null;
		readonly semanticCandidates?: readonly ColumnSemanticCandidate[];
		readonly structure?: RawTableStructure;
	};

export type CreateRawTableAssessmentRecordInput =
	Omit<CreateRawTableFactsRecordFromImportSeedInput, "tableFactsSeed"> & {
		readonly assessment: ImportAssessmentSeed;
	};

export const createRawTableFactsRecordFromImportSeed = (
	input: CreateRawTableFactsRecordFromImportSeedInput,
): RawTableFactsRecord => {
	const assessment = input.tableFactsSeed;
	const columnCount = normalizePositiveCount(input.columnCount) ?? 0;
	const rowCount = normalizePositiveCount(input.rowCount) ?? 0;
	const schemaProfileVersion = normalizeSchemaProfileVersion(input.schemaProfileVersion);
	const diagnosticCodes = createAssessmentReasonDiagnosticCodes(assessment.curveTypeReasons);
	const structure = input.structure ?? detectRawTableStructure(input.rows ?? []);
	const schemaProfile = input.schemaProfile ??
		findExactSchemaProfileMatch({
			fingerprint: structure.fingerprint,
			profiles: input.schemaProfiles ?? [],
		})?.profile ??
		null;
	const columnProfiles = input.columnProfiles ??
		createColumnProfiles({
			rows: input.rows ?? [],
			structure,
		});
	const layoutCandidates = input.layoutCandidates ??
		detectLayoutCandidates({
			columnProfiles,
			structure,
		});
	const semanticCandidates = input.semanticCandidates ??
		createColumnSemanticCandidates({
			assessment,
			columnProfiles,
			schemaProfile,
		});
	const columnProfile = input.columnProfile ??
		createMeasurementColumnProfile({
			assessment,
			columnProfiles,
			rows: input.rows ?? [],
			semanticCandidates,
			structure,
		});
	const assessmentConfidence = getAssessmentConfidenceScore(assessment);
	const blocks = input.blocks ?? detectMeasurementBlocks({
		assessment,
		assessmentConfidence,
		columnCount,
		columnProfile,
		diagnosticCodes,
		fileId: input.fileId,
		fileName: input.fileName,
		rawTableId: input.rawTableId,
		rowCount,
		structure,
	});
	const diagnostics = createAssessmentReasonDiagnostics({
		reasons: assessment.curveTypeReasons,
		relatedBlockId: blocks[0]?.id ?? createMeasurementBlockId(input.rawTableId, 0),
	});

	return {
		assessmentRuleVersion: ASSESSMENT_RULE_VERSION,
		schemaProfileVersion,
		fileId: input.fileId,
		rawTableId: input.rawTableId,
		sourceRawTableVersion: input.sourceRawTableVersion,
		structure,
		columnProfiles,
		layoutCandidates,
		semanticCandidates,
		groups: [],
		blocks,
		diagnostics,
		createdAt: Date.now(),
	};
};

export const createRawTableAssessmentRecordFromImportAssessment = (
	input: CreateRawTableAssessmentRecordInput,
): RawTableAssessmentRecord => createRawTableFactsRecordFromImportSeed({
	...input,
	tableFactsSeed: input.assessment,
});

export const getColumnCount = (rows: readonly (readonly unknown[])[]): number => {
	let columnCount = 0;
	for (const row of rows) {
		columnCount = Math.max(columnCount, row.length);
	}
	return columnCount;
};

export const getAssessmentConfidenceScore = (
	assessment: ImportAssessmentSeed,
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

export const normalizeSchemaProfileVersion = (value: unknown): number => {
	const version = Math.floor(Number(value));
	return Number.isFinite(version) && version >= 0 ? version : 0;
};
