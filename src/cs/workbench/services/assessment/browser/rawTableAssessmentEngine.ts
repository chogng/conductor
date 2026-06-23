/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type {
	AssessRawTableInput,
	ImportFileAssessment,
	RawTableAssessmentRecord,
} from "src/cs/workbench/services/assessment/common/assessment";
import {
	createColumnProfiles,
	createMeasurementColumnProfile,
	type ColumnProfile,
} from "src/cs/workbench/services/assessment/common/columnProfile";
import { detectMeasurementBlocks } from "src/cs/workbench/services/assessment/common/blockDetector";
import { createAssessmentReasonDiagnosticCodes } from "src/cs/workbench/services/assessment/common/diagnostics";
import { detectLayoutCandidates } from "src/cs/workbench/services/assessment/common/layoutCandidate";
import { detectRawTableStructure } from "src/cs/workbench/services/assessment/common/rawTableStructure";
import { createColumnSemanticCandidates } from "src/cs/workbench/services/assessment/common/semanticCandidate";
import type {
	IvSweepMode,
	MeasurementColumnRole,
	MeasurementFamily,
} from "src/cs/workbench/services/assessment/common/measurement";
import type {
	SchemaProfile,
	SchemaProfileBinding,
} from "src/cs/workbench/services/schemaProfile/common/schemaProfile";
import {
	findExactSchemaProfileMatch,
	findSchemaProfileBindingForColumn,
} from "src/cs/workbench/services/schemaProfile/common/schemaProfileMatcher";
import {
	createRawTableAssessmentRecordFromImportAssessment,
	getAssessmentConfidenceScore,
	getColumnCount,
	normalizePositiveCount,
} from "src/cs/workbench/services/assessment/common/assessmentRecord";
import { createAssessmentDecision } from "src/cs/workbench/services/assessment/browser/assessmentDecisionPolicy";
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
			semanticCandidates,
			structure,
		});
	}
}

type ProfileBackedAssessmentInput = {
	readonly assessment: ImportFileAssessment;
	readonly columnProfiles: readonly ColumnProfile[];
	readonly schemaProfile: SchemaProfile | null;
};

type ProfileFamilyInference = {
	readonly family: MeasurementFamily;
	readonly curveType: string;
	readonly ivMode?: IvSweepMode | null;
	readonly xAxisRole?: ImportFileAssessment["xAxisRole"];
	readonly reason: string;
};

type MatchedProfileBinding = {
	readonly binding: SchemaProfileBinding;
};

const createProfileBackedAssessment = ({
	assessment,
	columnProfiles,
	schemaProfile,
}: ProfileBackedAssessmentInput): ImportFileAssessment => {
	if (!schemaProfile || assessment.curveFamily !== "unknown") {
		return assessment;
	}

	const inference = inferFamilyFromProfile({
		columnProfiles,
		schemaProfile,
	});
	if (!inference) {
		return assessment;
	}

	return {
		...assessment,
		curveFamily: inference.family,
		curveType: inference.curveType,
		curveTypeConfidence: "high",
		curveTypeNeedsTemplate: false,
		curveTypeReasons: appendReason(assessment.curveTypeReasons, inference.reason),
		ivMode: inference.ivMode ?? assessment.ivMode ?? null,
		xAxisRole: inference.xAxisRole ?? assessment.xAxisRole,
		xAxisRoleSource: inference.xAxisRole ? "schemaProfile" : assessment.xAxisRoleSource,
	};
};

const inferFamilyFromProfile = ({
	columnProfiles,
	schemaProfile,
}: {
	readonly columnProfiles: readonly ColumnProfile[];
	readonly schemaProfile: SchemaProfile;
}): ProfileFamilyInference | null => {
	const bindings = columnProfiles
		.map(columnProfile => {
			const binding = findSchemaProfileBindingForColumn(schemaProfile, columnProfile);
			return binding
				? { binding }
				: null;
		})
		.filter((binding): binding is MatchedProfileBinding => binding !== null);
	const xBindings = bindings.filter(({ binding }) => binding.axis === "x");
	const yBindings = bindings.filter(({ binding }) => binding.axis === "y");
	if (!xBindings.length || !yBindings.length) {
		return null;
	}

	if (hasProfileBinding(xBindings, ["vg"], "V") && hasProfileBinding(yBindings, ["id", "current"], "A")) {
		return {
			family: "iv",
			curveType: "transfer",
			ivMode: "transfer",
			xAxisRole: "vg",
			reason: "Exact schema profile confirms transfer x/y bindings.",
		};
	}
	if (hasProfileBinding(xBindings, ["vd"], "V") && hasProfileBinding(yBindings, ["id", "current"], "A")) {
		return {
			family: "iv",
			curveType: "output",
			ivMode: "output",
			xAxisRole: "vd",
			reason: "Exact schema profile confirms output x/y bindings.",
		};
	}
	if (hasProfileBinding(xBindings, ["voltage", "vg", "vd"], "V") && hasProfileBinding(yBindings, ["capacitance"], "F")) {
		return {
			family: "cv",
			curveType: "cv",
			reason: "Exact schema profile confirms capacitance-voltage x/y bindings.",
		};
	}
	if (hasProfileUnit(xBindings, "Hz") && hasProfileBinding(yBindings, ["capacitance"], "F")) {
		return {
			family: "cf",
			curveType: "cf",
			reason: "Exact schema profile confirms capacitance-frequency x/y bindings.",
		};
	}
	if (hasProfileBinding(xBindings, ["time"], "s") && hasProfileBinding(yBindings, ["id", "current"], "A")) {
		return {
			family: "it",
			curveType: "it",
			reason: "Exact schema profile confirms current-time x/y bindings.",
		};
	}

	return null;
};

const hasProfileBinding = (
	bindings: readonly MatchedProfileBinding[],
	roles: readonly MeasurementColumnRole[],
	canonicalUnit: string,
): boolean =>
	bindings.some(({ binding }) =>
		roles.includes(binding.role) &&
		binding.canonicalUnit === canonicalUnit
	);

const hasProfileUnit = (
	bindings: readonly MatchedProfileBinding[],
	canonicalUnit: string,
): boolean =>
	bindings.some(({ binding }) => binding.canonicalUnit === canonicalUnit);

const appendReason = (
	reasons: readonly string[],
	reason: string,
): readonly string[] =>
	reasons.includes(reason)
		? reasons
		: [...reasons, reason];
