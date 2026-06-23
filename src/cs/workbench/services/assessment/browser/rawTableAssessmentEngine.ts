/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type {
	AssessRawTableInput,
	RawTableAssessmentRecord,
} from "src/cs/workbench/services/assessment/common/assessment";
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
	createRawTableAssessmentRecordFromImportAssessment,
	getAssessmentConfidenceScore,
	getColumnCount,
	normalizePositiveCount,
} from "src/cs/workbench/services/assessment/common/assessmentRecord";
import { createAssessmentDecision } from "src/cs/workbench/services/assessment/browser/assessmentDecisionPolicy";
import type { AssessmentEvidence } from "src/cs/workbench/services/assessment/common/assessmentEvidence";
import {
	toTemplateCandidateSummary,
} from "src/cs/workbench/services/assessment/common/templateCandidate";
import {
	resolveTemplateCandidates,
	selectTemplateCandidate,
} from "src/cs/workbench/services/assessment/common/templateResolver";
import { createProfileBackedAssessment } from "src/cs/workbench/services/assessment/common/schemaProfileAssessment";
import { LegacyAssessmentAdapter } from "src/cs/workbench/services/assessment/browser/legacyAssessmentAdapter";

export class RawTableAssessmentEngine {
	private readonly legacyAssessmentAdapter: LegacyAssessmentAdapter;

	constructor(
		legacyAssessmentAdapter = new LegacyAssessmentAdapter(),
	) {
		this.legacyAssessmentAdapter = legacyAssessmentAdapter;
	}

	public async assess(
		input: AssessRawTableInput,
	): Promise<RawTableAssessmentRecord> {
		const assessment = await this.legacyAssessmentAdapter.assessImportRows(
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
			assessment,
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
		const assessmentConfidence = getAssessmentConfidenceScore(effectiveAssessment);
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
		const decision = createAssessmentDecision({
			assessment: effectiveAssessment,
			columnProfile,
			layoutCandidates,
		});
		const evidence: AssessmentEvidence = {
			structure,
			columnProfiles,
			layoutCandidates,
			semanticCandidates,
			blocks,
			sourceMetadata: {
				fileId: input.fileId,
				rawTableId: input.rawTableId,
				fileName: input.fileName,
				rowCount,
				columnCount,
				sourceRawTableVersion: input.sourceRawTableVersion,
			},
		};
		const templateCandidates = resolveTemplateCandidates({
			recipeSnapshot: input.recipeSnapshot,
			evidence,
			templateSnapshot: input.templateSnapshot,
		});
		const selectedTemplate = selectTemplateCandidate(templateCandidates, decision.autoApplyAllowed);

		return createRawTableAssessmentRecordFromImportAssessment({
			...input,
			assessment: effectiveAssessment,
			blocks,
			columnProfile,
			columnProfiles,
			columnCount,
			decision,
			layoutCandidates,
			rowCount,
			rows: input.rows,
			schemaProfile: schemaProfileMatch?.profile ?? null,
			schemaProfileVersion: input.schemaProfileVersion,
			selectedTemplate,
			semanticCandidates,
			structure,
			templateCandidates: templateCandidates.map(toTemplateCandidateSummary),
		});
	}
}
