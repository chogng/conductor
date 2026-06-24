/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type {
	CreateRawTableFactsInput,
	RawTableFactsRecord,
} from "src/cs/workbench/services/tableFacts/common/tableFacts";
import {
	createColumnProfiles,
	createMeasurementColumnProfile,
} from "src/cs/workbench/services/assessment/common/columnProfile";
import { detectMeasurementBlocks } from "src/cs/workbench/services/assessment/common/blockDetector";
import { createAssessmentReasonDiagnosticCodes } from "src/cs/workbench/services/assessment/common/diagnostics";
import { detectLayoutCandidates } from "src/cs/workbench/services/assessment/common/layoutCandidate";
import { detectRawTableStructure } from "src/cs/workbench/services/assessment/common/rawTableStructure";
import { createColumnSemanticCandidates } from "src/cs/workbench/services/assessment/common/semanticCandidate";
import {
	findExactSchemaProfileMatch,
} from "src/cs/workbench/services/schemaProfile/common/schemaProfileMatcher";
import {
	createRawTableFactsRecordFromImportSeed,
	getColumnCount,
	getTableFactsConfidenceScore,
	normalizePositiveCount,
} from "src/cs/workbench/services/tableFacts/common/tableFactsRecord";
import { createProfileBackedAssessment } from "src/cs/workbench/services/assessment/common/schemaProfileAssessment";
import { createImportTableFactsSeedFromRows } from "src/cs/workbench/services/assessment/browser/importAssessmentSeed";

export class RawTableAssessmentEngine {
	public async assess(
		input: CreateRawTableFactsInput,
	): Promise<RawTableFactsRecord> {
		const tableFactsSeed = await createImportTableFactsSeedFromRows(
			input.fileName ?? input.rawTableId,
			input.rows,
		);
		const columnCount = normalizePositiveCount(input.columnCount) ?? getColumnCount(input.rows);
		const rowCount = normalizePositiveCount(input.rowCount) ?? input.rows.length;
		const structure = detectRawTableStructure(input.rows);
		const columnProfiles = createColumnProfiles({
			rows: input.rows,
			structure,
		});
		const layoutCandidates = detectLayoutCandidates({
			columnProfiles,
			structure,
		});
		const schemaProfileMatch = findExactSchemaProfileMatch({
			fingerprint: structure.fingerprint,
			profiles: input.schemaProfiles ?? [],
		});
		const effectiveAssessment = createProfileBackedAssessment({
			assessment: tableFactsSeed,
			columnProfiles,
			schemaProfile: schemaProfileMatch?.profile ?? null,
		});
		const semanticCandidates = createColumnSemanticCandidates({
			assessment: effectiveAssessment,
			columnProfiles,
			schemaProfile: schemaProfileMatch?.profile ?? null,
		});
		const columnProfile = createMeasurementColumnProfile({
			assessment: effectiveAssessment,
			columnProfiles,
			rows: input.rows,
			semanticCandidates,
			structure,
		});
		const assessmentConfidence = getTableFactsConfidenceScore(effectiveAssessment);
		const diagnosticCodes = createAssessmentReasonDiagnosticCodes(effectiveAssessment.curveTypeReasons);
		const blocks = detectMeasurementBlocks({
			assessment: effectiveAssessment,
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
		return createRawTableFactsRecordFromImportSeed({
			...input,
			blocks,
			columnProfile,
			columnProfiles,
			columnCount,
			layoutCandidates,
			rowCount,
			rows: input.rows,
			schemaProfile: schemaProfileMatch?.profile ?? null,
			schemaProfileVersion: input.schemaProfileVersion,
			semanticCandidates,
			structure,
			tableFactsSeed: effectiveAssessment,
		});
	}
}
