/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type {
	ReviewDiagnostic,
	ReviewedTemplateSource,
	CandidateReview,
	ReviewCandidate,
	ReviewCandidateAxisBinding,
	ReviewCandidateInterpretation,
	ReviewCandidateRowRange,
	ReviewCandidateSummary,
	ReviewContext,
	ReviewEvidence,
	ReviewFactors,
	ReviewFinding,
	ReviewResult,
} from "src/cs/workbench/services/review/common/reviewModel";
import { URI } from "src/cs/base/common/uri";
import { deriveAutomaticReviewCandidates } from "src/cs/workbench/services/review/common/reviewCandidate";
import type { SchemaProfileMatch } from "src/cs/workbench/services/schemaProfile/common/schemaProfileMatcher";
import {
	findExactSchemaProfileMatch,
	findSchemaProfileBindingForColumn,
	findSimilarSchemaProfileMatch,
} from "src/cs/workbench/services/schemaProfile/common/schemaProfileMatcher";
import type { SchemaProfileSnapshot } from "src/cs/workbench/services/schemaProfile/common/schemaProfile";
import {
	REVIEW_ENGINE_VERSION,
	REVIEW_POLICY_VERSION,
	createReviewEvidenceSignature,
} from "src/cs/workbench/services/review/common/review";
import type { Template } from "src/cs/workbench/services/template/common/template";
import { createTemplateFingerprint } from "src/cs/workbench/services/template/common/templateFingerprint";
import type { UserTemplateSnapshot } from "src/cs/workbench/services/userTemplate/common/userTemplate";

// Pure Review decision pipeline. This file scores candidate interpretations and
// selects the reviewed template snapshot; it must not read files or own cache.
const SYSTEM_RECOMMENDED_CONFIDENCE = 0.85;
const READY_CONFIDENCE = 0.85;
const INVALID_CONFIDENCE = 0.5;
const AMBIGUITY_MARGIN = 0.05;
const AMBIGUITY_CANDIDATE_CONFIDENCE_MARGIN = 0.08;
const SIMILAR_SCHEMA_PROFILE_SCORE_CAP = 0.72;

export type ReviewDerivationInput = {
	readonly columnCount?: number;
	readonly contentHash?: string | null;
	readonly evidence: ReviewEvidence;
	readonly fileName?: string | null;
	readonly modelVersion: number;
	readonly resource: URI;
	readonly rowCount?: number;
	readonly schemaProfileSnapshot?: SchemaProfileSnapshot;
	readonly sheetId?: string | null;
	readonly sourceVersion: number;
	readonly userTemplateSnapshot: UserTemplateSnapshot;
};

export const deriveReviewResult = (
	input: ReviewDerivationInput,
): ReviewResult => {
	const context = createReviewDecisionContext(input);
	const candidates = deriveAutomaticReviewCandidates({
		context,
		userTemplateSnapshot: input.userTemplateSnapshot,
	});
	const reviews = scoreReviewCandidates({
		candidates,
		context,
	});
	const decision = createReviewDecision({
		candidates,
		reviews,
	});

	return {
		resource: context.resource,
		modelVersion: context.modelVersion,
		sourceVersion: context.sourceVersion,
		...(context.contentHash ? { contentHash: context.contentHash } : {}),
		...(context.sheetId ? { sheetId: context.sheetId } : {}),
		evidenceFingerprint: context.evidenceFingerprint,
		semanticRulesFingerprint: input.evidence.structuredContent?.semanticRulesFingerprint ?? "",
		userTemplateCatalogVersion: input.userTemplateSnapshot.version,
		userTemplateEffectiveFingerprint: input.userTemplateSnapshot.effectiveFingerprint,
		reviewEngineVersion: REVIEW_ENGINE_VERSION,
		reviewPolicyVersion: REVIEW_POLICY_VERSION,
		candidates: candidates.map(createReviewCandidateSummary),
		reviews,
		decision,
		...(decision.kind === "ready" ? { reviewedTemplate: decision.reviewedTemplate } : {}),
	};
};

type ReviewDecisionContext = ReviewContext & {
	readonly schemaProfileMatch?: SchemaProfileMatch;
};

const createReviewDecisionContext = (
	input: ReviewDerivationInput,
): ReviewDecisionContext => {
	const context = createReviewContext(input);
	const schemaProfileMatch = createSchemaProfileMatch(input, context);
	return {
		...context,
		...(schemaProfileMatch ? { schemaProfileMatch } : {}),
	};
};

const createReviewContext = (
	input: ReviewDerivationInput,
): ReviewContext => {
	const evidenceFingerprint = createReviewEvidenceSignature(input.evidence, {
		columnCount: input.columnCount,
		contentHash: input.contentHash,
		fileName: input.fileName,
		rowCount: input.rowCount,
		...(input.sheetId !== undefined ? { sheetId: input.sheetId } : {}),
	});

	return {
		resource: URI.revive(input.resource),
		modelVersion: input.modelVersion,
		sourceVersion: input.sourceVersion,
		...(normalizeText(input.contentHash) ? { contentHash: normalizeText(input.contentHash) } : {}),
		...(normalizeText(input.sheetId) ? { sheetId: normalizeText(input.sheetId) } : {}),
		evidenceFingerprint,
		evidence: input.evidence,
	};
};

const createSchemaProfileMatch = (
	input: ReviewDerivationInput,
	context: ReviewContext,
): SchemaProfileMatch | null => {
	const structuredContent = context.evidence.structuredContent;
	const fingerprint = structuredContent?.structure.fingerprint;
	const profiles = input.schemaProfileSnapshot?.profiles ?? [];
	if (!structuredContent || !fingerprint || !profiles.length) {
		return null;
	}

	const exactMatch = findExactSchemaProfileMatch({
		fingerprint,
		profiles,
	});
	if (exactMatch) {
		return exactMatch;
	}

	if (hasConflictedExactSchemaProfile({
		fingerprint,
		profiles,
	})) {
		return null;
	}

	return findSimilarSchemaProfileMatch({
		columnProfiles: structuredContent.columnProfiles,
		measurementColumns: structuredContent.blocks.flatMap(block => block.columns.columns),
		profiles,
	});
};

const hasConflictedExactSchemaProfile = ({
	fingerprint,
	profiles,
}: {
	readonly fingerprint: string;
	readonly profiles: SchemaProfileSnapshot["profiles"];
}): boolean => {
	const normalizedFingerprint = normalizeText(fingerprint);
	return profiles.some(profile =>
		normalizeText(profile.schemaFingerprint) === normalizedFingerprint &&
		Math.max(0, Math.floor(Number(profile.conflictCount) || 0)) > 0
	);
};

const createReviewDecision = ({
	candidates,
	reviews,
}: {
	readonly candidates: readonly ReviewCandidate[];
	readonly reviews: readonly CandidateReview[];
}): ReviewResult["decision"] => {
	const readySelection = selectReviewCandidate({
		candidates,
		isEligibleReview: review => review.status === "ready",
		reviews,
	});
	if (readySelection) {
		const { candidate: readyCandidate, review } = readySelection;
		const template = createReviewedTemplateSnapshotFromCandidateInterpretation(readyCandidate.interpretation);
		const templateFingerprint = createTemplateFingerprint(template);
		const application = isSystemRecommendedReview(review)
			? {
				kind: "systemRecommended" as const,
				reason: "review.ready.systemRecommended",
			}
			: {
				kind: "userActionRequired" as const,
				reason: "review.ready.lowConfidence",
			};
		return {
			kind: "ready",
			reviewedTemplate: {
				candidateId: readyCandidate.id,
				source: toReviewedTemplateSource(readyCandidate.source),
				...(readyCandidate.interpretation.reviewedType ? { reviewedType: readyCandidate.interpretation.reviewedType } : {}),
				template,
				templateFingerprint,
				review,
			},
			application,
			summary: application.kind === "systemRecommended"
				? "Review is ready and recommended for system application."
				: "Review is ready but requires user action before application.",
			suggestedActions: application.kind === "systemRecommended"
				? []
				: [{ id: "review.confirmTemplate", label: "Confirm template" }],
		};
	}

	if (candidates.length) {
		const selection = selectReviewCandidate({
			candidates,
			isEligibleReview: review => review.status !== "ready",
			reviews,
		});
		const candidate = selection?.candidate ?? candidates[0];
		const review = selection?.review ?? reviews.find(candidateReview => candidateReview.candidateId === candidate.id);
		if (review?.status === "invalid" && review.findings.some(finding => finding.blocking)) {
			return {
				kind: "invalid",
				summary: "Review candidates are invalid.",
				reasons: review.reasons,
				diagnostics: createReviewDiagnosticsFromFindings(review.findings),
				suggestedActions: [{ id: "review.createTemplate", label: "Create template" }],
			};
		}
		return {
			kind: "needsManualAdjustment",
			...(candidate ? { candidateId: candidate.id } : {}),
			summary: "Review candidates need manual adjustment before application.",
			reasons: review?.reasons ?? ["review.noReadyCandidate"],
			diagnostics: review?.diagnostics ?? [],
			suggestedActions: [{ id: "review.adjustTemplate", label: "Adjust template" }],
		};
	}

	return {
		kind: "invalid",
		summary: "No usable review candidates were found.",
		reasons: ["review.noCandidates"],
		diagnostics: [{
			severity: "warning",
			code: "review.noCandidates",
			message: "No DataResource or UserTemplate candidates matched this content evidence.",
		}],
		suggestedActions: [{ id: "review.createTemplate", label: "Create template" }],
	};
};

const selectReviewCandidate = ({
	candidates,
	isEligibleReview,
	reviews,
}: {
	readonly candidates: readonly ReviewCandidate[];
	readonly isEligibleReview: (review: CandidateReview) => boolean;
	readonly reviews: readonly CandidateReview[];
}): { readonly candidate: ReviewCandidate; readonly review: CandidateReview } | undefined => {
	const candidateIndexById = new Map<string, number>();
	candidates.forEach((candidate, index) => {
		candidateIndexById.set(candidate.id, index);
	});

	return reviews
		.filter(review => isEligibleReview(review) && candidateIndexById.has(review.candidateId))
		.sort((left, right) =>
			getCandidateReviewStatusRank(right.status) - getCandidateReviewStatusRank(left.status) ||
			right.confidence - left.confidence ||
			(candidateIndexById.get(left.candidateId) ?? Number.MAX_SAFE_INTEGER) -
				(candidateIndexById.get(right.candidateId) ?? Number.MAX_SAFE_INTEGER)
		)
		.map(review => {
			const candidate = candidates[candidateIndexById.get(review.candidateId) ?? -1];
			return candidate ? { candidate, review } : undefined;
		})
		.find((selection): selection is { readonly candidate: ReviewCandidate; readonly review: CandidateReview } => Boolean(selection));
};

const getCandidateReviewStatusRank = (
	status: CandidateReview["status"],
): number => {
	switch (status) {
		case "ready":
			return 3;
		case "needsAdjustment":
			return 2;
		case "invalid":
			return 1;
	}
};

const isSystemRecommendedReview = (
	review: CandidateReview,
): boolean =>
	review.confidence >= SYSTEM_RECOMMENDED_CONFIDENCE &&
	!review.reasons.includes("schemaProfile.similarSchema") &&
	!review.reasons.includes("schemaProfile.bindingIncomplete");

const createReviewDiagnosticsFromFindings = (
	findings: readonly CandidateReview["findings"][number][],
): readonly ReviewDiagnostic[] =>
	findings.map(finding => ({
		severity: finding.severity,
		code: finding.code,
		message: finding.message,
	}));

const createReviewCandidateSummary = (
	candidate: ReviewCandidate,
): ReviewCandidateSummary => ({
	id: candidate.id,
	source: candidate.source,
	interpretationFingerprint: candidate.interpretationFingerprint,
	displayName: candidate.interpretation.name,
	...(candidate.providerRank !== undefined ? { providerRank: candidate.providerRank } : {}),
	reasonCodes: getReviewCandidateReasons(candidate),
	diagnosticCodes: getReviewCandidateDiagnostics(candidate).map(diagnostic => diagnostic.code),
});

const getReviewCandidateReasons = (
	candidate: ReviewCandidate,
): readonly string[] => [
	...candidate.selectorTrace.reasons,
	...candidate.projectionTrace.reasons,
];

const getReviewCandidateDiagnostics = (
	candidate: ReviewCandidate,
): readonly ReviewDiagnostic[] => [
	...candidate.selectorTrace.diagnostics,
	...candidate.projectionTrace.diagnostics,
];

const toReviewedTemplateSource = (
	source: ReviewCandidate["source"],
): ReviewedTemplateSource => source;

const createReviewedTemplateSnapshotFromCandidateInterpretation = (
	interpretation: ReviewCandidateInterpretation,
): Template => ({
	schemaVersion: 1,
	name: interpretation.name,
	version: interpretation.version,
	...(interpretation.measurement ? { measurement: interpretation.measurement } : {}),
	blocks: interpretation.blocks,
	stopOnError: interpretation.stopOnError,
	...(interpretation.applicability ? { applicability: interpretation.applicability } : {}),
});

const normalizeText = (
	value: unknown,
): string => String(value ?? "").trim();

export const scoreReviewCandidates = ({
	candidates,
	context,
}: {
	readonly candidates: readonly ReviewCandidate[];
	readonly context: ReviewContext | ReviewDecisionContext;
}): readonly CandidateReview[] => {
	const baseScores = new Map<string, number>();
	for (const candidate of candidates) {
		baseScores.set(candidate.id, getBaseConfidence(createBaseFactors(candidate, context)));
	}

	const orderedBaseScores = [...baseScores.entries()]
		.sort((left, right) => right[1] - left[1]);
	const topScore = orderedBaseScores[0]?.[1] ?? 0;
	const candidateById = new Map(candidates.map(candidate => [candidate.id, candidate]));
	const topCandidate = candidateById.get(orderedBaseScores[0]?.[0] ?? "");
	const competitor = topCandidate
		? orderedBaseScores
			.map(([candidateId, score]) => ({ candidate: candidateById.get(candidateId), score }))
			.find(entry =>
				entry.candidate &&
				entry.candidate.id !== topCandidate.id &&
				!isReviewCandidateCoveredBy(topCandidate, entry.candidate) &&
				!isReviewCandidateSemanticallyDominatedBy(topCandidate, entry.candidate)
			)
		: undefined;
	const secondScore = competitor?.score ?? 0;
	const secondCandidate = competitor?.candidate;
	const candidateConfidenceMargin = topCandidate && secondCandidate
		? Math.abs(topCandidate.confidence - secondCandidate.confidence)
		: Number.POSITIVE_INFINITY;
	const isAmbiguous =
		Boolean(topCandidate && secondCandidate) &&
		topScore - secondScore < AMBIGUITY_MARGIN &&
		candidateConfidenceMargin < AMBIGUITY_CANDIDATE_CONFIDENCE_MARGIN;

	return candidates.map(candidate =>
		scoreReviewCandidate({
			ambiguityPenalty: isAmbiguous ? 0.15 : 0,
			candidate,
			context,
		})
	);
};

const isReviewCandidateCoveredBy = (
	topCandidate: ReviewCandidate,
	candidate: ReviewCandidate | undefined,
): boolean => {
	if (!candidate) {
		return false;
	}

	const topBlockIds = getReviewCaptureStringArray(topCandidate.captures?.dataBlockCandidateIds);
	const candidateBlockIds = getReviewCaptureStringArray(candidate.captures?.dataBlockCandidateIds);
	return topBlockIds.length > candidateBlockIds.length &&
		candidateBlockIds.length > 0 &&
		candidateBlockIds.every(blockId => topBlockIds.includes(blockId));
};

const isReviewCandidateSemanticallyDominatedBy = (
	topCandidate: ReviewCandidate,
	candidate: ReviewCandidate,
): boolean =>
	hasReviewCandidateMeasurement(topCandidate) &&
	candidate.source.kind === "dataResource" &&
	!hasReviewCandidateMeasurement(candidate) &&
	!areReviewCandidatesStructuralPeers(topCandidate, candidate) &&
	topCandidate.confidence >= candidate.confidence;

const hasReviewCandidateMeasurement = (
	candidate: ReviewCandidate,
): boolean =>
	Boolean(candidate.interpretation.measurement) ||
	Boolean(String(candidate.interpretation.reviewedType ?? "").trim());

const areReviewCandidatesStructuralPeers = (
	left: ReviewCandidate,
	right: ReviewCandidate,
): boolean => {
	const leftBlocks = left.interpretation.blocks;
	const rightBlocks = right.interpretation.blocks;
	if (leftBlocks.length !== rightBlocks.length) {
		return false;
	}
	return leftBlocks.every((leftBlock, index) => {
		const rightBlock = rightBlocks[index];
		return Boolean(rightBlock) &&
			leftBlock.rowRange.startRow === rightBlock.rowRange.startRow &&
			leftBlock.rowRange.endRow === rightBlock.rowRange.endRow &&
			leftBlock.x.columns.length === rightBlock.x.columns.length &&
			leftBlock.y.columns.length === rightBlock.y.columns.length;
	});
};

const getReviewCaptureStringArray = (value: unknown): readonly string[] =>
	Array.isArray(value)
		? value.filter((item): item is string => typeof item === "string")
		: [];

export const scoreReviewCandidate = ({
	ambiguityPenalty = 0,
	candidate,
	context,
}: {
	readonly ambiguityPenalty?: number;
	readonly candidate: ReviewCandidate;
	readonly context: ReviewContext | ReviewDecisionContext;
}): CandidateReview => {
	const findings = createReviewFindings(candidate, context, ambiguityPenalty);
	const baseFactors = createBaseFactors(candidate, context);
	const diagnosticPenalty = getDiagnosticPenalty(candidate, findings);
	const factors: ReviewFactors = {
		...baseFactors,
		ambiguityPenalty,
		conflictPenalty: 0,
		diagnosticPenalty,
	};
	const hardGate = findings.some(finding => finding.blocking);
	const cappedConfidence = applyConfidenceCaps(
		getBaseConfidence(factors) - ambiguityPenalty - factors.conflictPenalty - diagnosticPenalty,
		findings,
	);
	const confidence = hardGate ? 0 : clampConfidence(cappedConfidence);
	const hasRepairableProjectionFinding = findings.some(isRepairableProjectionFinding);
	const status = hardGate
		? "invalid"
		: confidence >= READY_CONFIDENCE && ambiguityPenalty === 0
			? "ready"
			: confidence >= INVALID_CONFIDENCE || hasRepairableProjectionFinding
				? "needsAdjustment"
				: "invalid";

	return {
		candidateId: candidate.id,
		interpretationFingerprint: candidate.interpretationFingerprint,
		status,
		confidence,
		factors,
		findings,
		reasons: [
			...candidate.selectorTrace.reasons,
			...candidate.projectionTrace.reasons,
			...getSchemaProfileReasons(candidate, context),
		],
		diagnostics: getCandidateDiagnostics(candidate),
	};
};

export const createManualCandidateReview = ({
	candidateId,
	confidence,
	diagnostics,
	reasons,
	status,
	interpretationFingerprint,
}: {
	readonly candidateId: string;
	readonly confidence: number;
	readonly diagnostics: readonly ReviewDiagnostic[];
	readonly reasons: readonly string[];
	readonly status: CandidateReview["status"];
	readonly interpretationFingerprint: string;
}): CandidateReview => {
	const normalizedConfidence = clampConfidence(confidence);
	return {
		candidateId,
		interpretationFingerprint,
		status,
		confidence: normalizedConfidence,
		factors: {
			selectorScore: normalizedConfidence,
			projectionScore: normalizedConfidence,
			semanticScore: normalizedConfidence,
			dataQualityScore: normalizedConfidence,
			parseHealthScore: 1,
			freshnessScore: 1,
			ambiguityPenalty: 0,
			conflictPenalty: 0,
			diagnosticPenalty: diagnostics.length ? 0.25 : 0,
		},
		findings: diagnostics.map(diagnostic => ({
			severity: diagnostic.severity,
			code: diagnostic.code,
			message: diagnostic.message,
			blocking: status === "invalid",
		})),
		reasons,
		diagnostics,
	};
};

const createBaseFactors = (
	candidate: ReviewCandidate,
	context: ReviewContext | ReviewDecisionContext,
): Omit<ReviewFactors, "ambiguityPenalty" | "conflictPenalty" | "diagnosticPenalty"> => ({
	selectorScore: candidate.selectorTrace.diagnostics.length ? 0.45 : 1,
	projectionScore: getProjectionScore(candidate, context),
	semanticScore: getSemanticScore(candidate, context),
	dataQualityScore: getDataQualityScore(context),
	parseHealthScore: getParseHealthScore(context),
	freshnessScore: getFreshnessScore(candidate, context),
});

const getSemanticScore = (
	candidate: ReviewCandidate,
	context: ReviewContext | ReviewDecisionContext,
): number =>
	Math.max(
		clampConfidence(candidate.confidence),
		getSchemaProfileCandidateEvaluation(candidate, context).score,
	);

const getSchemaProfileReasons = (
	candidate: ReviewCandidate,
	context: ReviewContext | ReviewDecisionContext,
): readonly string[] =>
	getSchemaProfileCandidateEvaluation(candidate, context).reasons;

type SchemaProfileCandidateEvaluation = {
	readonly score: number;
	readonly reasons: readonly string[];
};

const getSchemaProfileCandidateEvaluation = (
	candidate: ReviewCandidate,
	context: ReviewContext | ReviewDecisionContext,
): SchemaProfileCandidateEvaluation => {
	const match = getSchemaProfileMatch(context);
	const columnProfiles = context.evidence.structuredContent?.columnProfiles ?? [];
	if (!match) {
		return noSchemaProfileCandidateEvaluation;
	}
	if (!columnProfiles.length) {
		return incompleteSchemaProfileCandidateEvaluation;
	}

	const axisBindings = candidate.interpretation.blocks.flatMap(block => [
		...block.x.columns.map(column => ({
			axis: "x" as const,
			column,
			unit: block.x.unit,
		})),
		...block.y.columns.map(column => ({
			axis: "y" as const,
			column,
			unit: block.y.unit,
		})),
	]);
	if (!axisBindings.length) {
		return createIncompleteSchemaProfileCandidateEvaluation(match);
	}

	for (const axisBinding of axisBindings) {
		const columnProfile = columnProfiles.find(profile => profile.rawCol === axisBinding.column);
		if (!columnProfile) {
			return createIncompleteSchemaProfileCandidateEvaluation(match);
		}

		const binding = findSchemaProfileBindingForColumn(match.profile, columnProfile);
		if (!binding || !isSchemaProfileBindingCompatible(binding, axisBinding)) {
			return createIncompleteSchemaProfileCandidateEvaluation(match);
		}
	}

	if (match.kind === "similar") {
		return {
			score: Math.min(SIMILAR_SCHEMA_PROFILE_SCORE_CAP, clampConfidence(match.confidence)),
			reasons: [
				"schemaProfile.similarSchema",
			],
		};
	}

	return {
		score: clampConfidence(match.confidence),
		reasons: [
			"schemaProfile.exactFingerprint",
			"schemaProfile.bindingMatched",
		],
	};
};

const noSchemaProfileCandidateEvaluation: SchemaProfileCandidateEvaluation = {
	score: 0,
	reasons: [],
};

const incompleteSchemaProfileCandidateEvaluation: SchemaProfileCandidateEvaluation = {
	score: 0,
	reasons: [
		"schemaProfile.exactFingerprint",
		"schemaProfile.bindingIncomplete",
	],
};

const createIncompleteSchemaProfileCandidateEvaluation = (
	match: SchemaProfileMatch,
): SchemaProfileCandidateEvaluation =>
	match.kind === "similar"
		? {
			score: 0,
			reasons: [
				"schemaProfile.similarSchema",
				"schemaProfile.bindingIncomplete",
			],
		}
		: incompleteSchemaProfileCandidateEvaluation;

const getSchemaProfileMatch = (
	context: ReviewContext | ReviewDecisionContext,
): SchemaProfileMatch | undefined =>
	"schemaProfileMatch" in context ? context.schemaProfileMatch : undefined;

const isSchemaProfileBindingCompatible = (
	binding: ReturnType<typeof findSchemaProfileBindingForColumn>,
	axisBinding: {
		readonly axis: "x" | "y";
		readonly unit?: string;
	},
): boolean =>
	Boolean(binding) &&
	binding?.axis === axisBinding.axis &&
	(!binding.canonicalUnit || !axisBinding.unit || binding.canonicalUnit === axisBinding.unit);

const getBaseConfidence = (
	factors: Omit<ReviewFactors, "ambiguityPenalty" | "conflictPenalty" | "diagnosticPenalty">,
): number =>
	0.25 * factors.selectorScore +
	0.25 * factors.projectionScore +
	0.20 * factors.semanticScore +
	0.15 * factors.dataQualityScore +
	0.10 * factors.parseHealthScore +
	0.05 * factors.freshnessScore;

const getProjectionScore = (
	candidate: ReviewCandidate,
	context: ReviewContext,
): number => {
	if (candidate.projectionTrace.diagnostics.length) {
		return 0.45;
	}
	const rangeFindings = validateCandidateInterpretationRanges(candidate.interpretation, context);
	return rangeFindings.length ? 0.35 : 1;
};

const getDataQualityScore = (
	context: ReviewContext,
): number => {
	const rowCount = Number(context.evidence.sourceMetadata.rowCount);
	const columnCount = Number(context.evidence.sourceMetadata.columnCount);
	if (!Number.isInteger(rowCount) || rowCount <= 0 || !Number.isInteger(columnCount) || columnCount <= 0) {
		return 0;
	}
	const blocks = context.evidence.structuredContent?.blocks ?? [];
	if (!blocks.length) {
		return 0.4;
	}
	return clampConfidence(Math.min(1, 0.7 + blocks.length * 0.1));
};

const getParseHealthScore = (
	context: ReviewContext,
): number => {
	const diagnostics = context.evidence.structuredContent?.diagnostics ?? [];
	const fatalCount = diagnostics.filter(diagnostic => diagnostic.severity === "fatal").length;
	const errorCount = diagnostics.filter(diagnostic => diagnostic.severity === "error").length;
	const warningCount = diagnostics.filter(diagnostic => diagnostic.severity === "warning").length;
	return clampConfidence(1 - fatalCount - errorCount * 0.5 - warningCount * 0.15);
};

const getFreshnessScore = (
	candidate: ReviewCandidate,
	context: ReviewContext,
): number => {
	return getFreshnessFindings(candidate, context).length ? 0 : 1;
};

const createReviewFindings = (
	candidate: ReviewCandidate,
	context: ReviewContext,
	ambiguityPenalty: number,
): readonly ReviewFinding[] => {
	const findings: ReviewFinding[] = [];
	findings.push(...getFreshnessFindings(candidate, context));
	const structuredContent = context.evidence.structuredContent;
	if (structuredContent?.diagnostics.some(diagnostic => diagnostic.severity === "fatal")) {
		findings.push(createFinding("error", "review.parserFatalDiagnostic", "Parser diagnostics contain a fatal error.", true));
	}
	if (!structuredContent?.blocks.length) {
		findings.push(createFinding("warning", "review.noMeasurementBlocks", "No measurement block evidence is available."));
	}
	for (const diagnostic of getCandidateDiagnostics(candidate)) {
		findings.push(createFinding(
			diagnostic.severity,
			diagnostic.code,
			diagnostic.message,
			diagnostic.severity === "error",
		));
	}
	findings.push(...validateCandidateInterpretationRanges(candidate.interpretation, context));
	if (ambiguityPenalty > 0) {
		findings.push(createFinding("warning", "review.ambiguousCandidates", "Top review candidates are too close to auto-apply."));
	}
	return findings;
};

const getFreshnessFindings = (
	candidate: ReviewCandidate,
	context: ReviewContext,
): readonly ReviewFinding[] => {
	const findings: ReviewFinding[] = [];
	if (candidate.evidenceFingerprint !== context.evidenceFingerprint) {
		findings.push(createFinding("error", "review.staleEvidence", "Candidate evidence is stale.", true));
	}
	if (context.contentHash && candidate.contentHash !== context.contentHash) {
		findings.push(createFinding("error", "review.staleContentHash", "Candidate content hash is stale.", true));
	}
	if (candidate.modelVersion !== context.modelVersion) {
		findings.push(createFinding("error", "review.staleModelVersion", "Candidate model version is stale.", true));
	}
	if (candidate.sourceVersion !== context.sourceVersion) {
		findings.push(createFinding("error", "review.staleSourceVersion", "Candidate source version is stale.", true));
	}
	return findings;
};

const validateCandidateInterpretationRanges = (
	interpretation: ReviewCandidateInterpretation,
	context: ReviewContext,
): readonly ReviewFinding[] => {
	const findings: ReviewFinding[] = [];
	const rawRowCount = context.evidence.sourceMetadata.rowCount;
	const rawColumnCount = context.evidence.sourceMetadata.columnCount;
	const rowCount = typeof rawRowCount === "number" && Number.isInteger(rawRowCount) && rawRowCount > 0
		? rawRowCount
		: undefined;
	const columnCount = typeof rawColumnCount === "number" && Number.isInteger(rawColumnCount) && rawColumnCount > 0
		? rawColumnCount
		: undefined;
	if (rowCount === undefined) {
		findings.push(createFinding("error", "review.invalidRowCount", "Review evidence has no valid row count.", true));
	}
	if (columnCount === undefined) {
		findings.push(createFinding("error", "review.invalidColumnCount", "Review evidence has no valid column count.", true));
	}
	if (!interpretation.blocks.length) {
		findings.push(createFinding("warning", "review.missingProjectionBlock", "Candidate has no projected blocks."));
		return findings;
	}
	if (rowCount === undefined || columnCount === undefined) {
		return findings;
	}
	for (const block of interpretation.blocks) {
		if (!isRowRangeInBounds(block.rowRange, rowCount)) {
			findings.push(createFinding("error", "review.rangeOutOfBounds", "Candidate row range is out of bounds.", true));
		}
		if (!isAxisInBounds(block.x, columnCount, rowCount)) {
			findings.push(createFinding("warning", "review.xAxisOutOfBounds", "Candidate X axis is out of bounds."));
		}
		if (!isAxisInBounds(block.y, columnCount, rowCount)) {
			findings.push(createFinding("warning", "review.yAxisOutOfBounds", "Candidate Y axis is out of bounds."));
		}
	}
	return findings;
};

const applyConfidenceCaps = (
	confidence: number,
	findings: readonly ReviewFinding[],
): number => {
	if (findings.some(finding => finding.code === "review.rangeOutOfBounds")) {
		return Math.min(confidence, 0.39);
	}
	if (findings.some(finding => finding.code === "dataResourceCandidate.missingAxisBinding" || finding.code === "dataResourceCandidate.missingDataBlock")) {
		return Math.min(confidence, 0.49);
	}
	if (findings.some(finding => finding.code === "review.missingProjectionBlock")) {
		return Math.min(confidence, 0.49);
	}
	if (findings.some(finding => finding.code === "review.xAxisOutOfBounds" || finding.code === "review.yAxisOutOfBounds")) {
		return Math.min(confidence, 0.69);
	}
	return confidence;
};

const isRepairableProjectionFinding = (
	finding: ReviewFinding,
): boolean =>
	finding.code === "dataResourceCandidate.missingAxisBinding" ||
	finding.code === "dataResourceCandidate.missingDataBlock" ||
	finding.code === "review.missingProjectionBlock";

const getDiagnosticPenalty = (
	candidate: ReviewCandidate,
	findings: readonly ReviewFinding[],
): number =>
	Math.min(0.4, getCandidateDiagnostics(candidate).length * 0.1 + findings.filter(finding => finding.severity === "warning").length * 0.05);

const getCandidateDiagnostics = (
	candidate: ReviewCandidate,
): readonly ReviewDiagnostic[] => [
	...candidate.selectorTrace.diagnostics,
	...candidate.projectionTrace.diagnostics,
];

const createFinding = (
	severity: ReviewFinding["severity"],
	code: string,
	message: string,
	blocking?: boolean,
): ReviewFinding => ({
	severity,
	code,
	message,
	...(blocking ? { blocking } : {}),
});

const isRowRangeInBounds = (
	rowRange: ReviewCandidateRowRange,
	rowCount: number,
): boolean => {
	const startRow = Math.floor(Number(rowRange.startRow));
	const endRow = rowRange.endRow === "end"
		? Math.max(0, rowCount - 1)
		: Math.floor(Number(rowRange.endRow));
	return Number.isInteger(startRow) &&
		Number.isInteger(endRow) &&
		startRow >= 0 &&
		startRow < rowCount &&
		endRow >= startRow &&
		endRow < rowCount;
};

const isAxisInBounds = (
	axis: ReviewCandidateAxisBinding,
	columnCount: number,
	rowCount: number,
): boolean =>
	axis.columns.length > 0 &&
	axis.columns.every(column => Number.isInteger(column) && column >= 0 && column < columnCount) &&
	(axis.ranges ?? []).every(range =>
		Number.isInteger(range.column) &&
		range.column >= 0 &&
		range.column < columnCount &&
		isRowRangeInBounds({
			startRow: range.startRow,
			endRow: range.endRow,
		}, rowCount)
	);

const clampConfidence = (
	value: unknown,
): number => {
	const confidence = Number(value);
	if (!Number.isFinite(confidence)) {
		return 0;
	}
	return Math.max(0, Math.min(1, confidence));
};
