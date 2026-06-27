/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type {
	ReviewDiagnostic,
	ReviewedTemplateSource,
	CandidateReview,
	ReviewCandidate,
	ReviewCandidateInterpretation,
	ReviewCandidateSummary,
	ReviewContext,
	ReviewEvidence,
	ReviewResult,
	ReviewSummaryTarget,
} from "src/cs/workbench/services/review/common/reviewModel";
import { URI } from "src/cs/base/common/uri";
import { deriveAutomaticReviewCandidates } from "src/cs/workbench/services/review/common/reviewCandidate";
import {
	REVIEW_ENGINE_VERSION,
	REVIEW_POLICY_VERSION,
	createReviewEvidenceSignature,
} from "src/cs/workbench/services/review/common/review";
import { scoreReviewCandidates } from "src/cs/workbench/services/review/common/reviewScoring";
import type { RecipeSnapshot } from "src/cs/workbench/services/recipe/common/recipe";
import type { Template } from "src/cs/workbench/services/template/common/template";
import { createTemplateFingerprint } from "src/cs/workbench/services/template/common/templateFingerprint";
import type { UserTemplateSnapshot } from "src/cs/workbench/services/userTemplate/common/userTemplate";

const SYSTEM_RECOMMENDED_CONFIDENCE = 0.85;

export type ReviewDerivationInput = {
	readonly columnCount?: number;
	readonly contentHash?: string | null;
	readonly evidence: ReviewEvidence;
	readonly fileName?: string | null;
	readonly modelVersion: number;
	readonly recipeSnapshot: RecipeSnapshot;
	readonly resource: ReviewSummaryTarget["resource"];
	readonly rowCount?: number;
	readonly sheetId?: string | null;
	readonly sourceVersion: number;
	readonly userTemplateSnapshot: UserTemplateSnapshot;
};

export const deriveReviewResult = (
	input: ReviewDerivationInput,
): ReviewResult => {
	const context = createReviewContext(input);
	const candidates = deriveAutomaticReviewCandidates({
		context,
		recipeSnapshot: input.recipeSnapshot,
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
		recipeFingerprint: input.recipeSnapshot.fingerprint,
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
		const application = review.confidence >= SYSTEM_RECOMMENDED_CONFIDENCE
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
			message: "No Recipe or UserTemplate candidates matched this content evidence.",
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
	blocks: interpretation.blocks,
	stopOnError: interpretation.stopOnError,
	...(interpretation.applicability ? { applicability: interpretation.applicability } : {}),
});

const normalizeText = (
	value: unknown,
): string => String(value ?? "").trim();
