/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type {
	ReviewDiagnostic,
	ReviewedTemplateSource,
	TableCandidateReview,
	TableReviewCandidate,
	TableReviewCandidateInterpretation,
	TableReviewCandidateSummary,
	TableReviewContext,
	TableReviewResult,
	TableReviewSourceMetadata,
	TableReviewSummaryTarget,
} from "src/cs/workbench/services/review/common/reviewModel";
import { URI } from "src/cs/base/common/uri";
import { deriveAutomaticTableReviewCandidates } from "src/cs/workbench/services/review/common/reviewCandidate";
import {
	REVIEW_ENGINE_VERSION,
	REVIEW_POLICY_VERSION,
	createReviewEvidenceSignature,
} from "src/cs/workbench/services/review/common/review";
import { scoreTableReviewCandidates } from "src/cs/workbench/services/review/common/reviewScoring";
import type { RecipeSnapshot } from "src/cs/workbench/services/recipe/common/recipe";
import type { TableModelRecord } from "src/cs/workbench/services/tableModel/common/tableModel";
import type { Template } from "src/cs/workbench/services/template/common/template";
import { createTemplateFingerprint } from "src/cs/workbench/services/template/common/templateFingerprint";
import type { UserTemplateSnapshot } from "src/cs/workbench/services/userTemplate/common/userTemplate";

const SYSTEM_RECOMMENDED_CONFIDENCE = 0.85;

export type TableReviewDerivationInput = {
	readonly tableModel: TableModelRecord;
	readonly columnCount?: number;
	readonly fileName?: string | null;
	readonly modelVersion: number;
	readonly recipeSnapshot: RecipeSnapshot;
	readonly resource: TableReviewSummaryTarget["resource"];
	readonly rowCount?: number;
	readonly sheetId?: string | null;
	readonly sourceVersion: number;
	readonly userTemplateSnapshot: UserTemplateSnapshot;
};

export const deriveTableReviewResult = (
	input: TableReviewDerivationInput,
): TableReviewResult => {
	const context = createTableReviewContext(input);
	const candidates = deriveAutomaticTableReviewCandidates({
		context,
		recipeSnapshot: input.recipeSnapshot,
		userTemplateSnapshot: input.userTemplateSnapshot,
	});
	const reviews = scoreTableReviewCandidates({
		candidates,
		context,
	});
	const decision = createTableReviewDecision({
		candidates,
		reviews,
	});

	return {
		resource: context.resource,
		modelVersion: context.modelVersion,
		sourceVersion: context.sourceVersion,
		...(context.sheetId ? { sheetId: context.sheetId } : {}),
		evidenceFingerprint: context.evidenceFingerprint,
		recipeFingerprint: input.recipeSnapshot.fingerprint,
		userTemplateCatalogVersion: input.userTemplateSnapshot.version,
		userTemplateEffectiveFingerprint: input.userTemplateSnapshot.effectiveFingerprint,
		reviewEngineVersion: REVIEW_ENGINE_VERSION,
		reviewPolicyVersion: REVIEW_POLICY_VERSION,
		candidates: candidates.map(createTableReviewCandidateSummary),
		reviews,
		decision,
		...(decision.kind === "ready" ? { reviewedTemplate: decision.reviewedTemplate } : {}),
	};
};

const createTableReviewContext = (
	input: TableReviewDerivationInput,
): TableReviewContext => {
	const evidenceFingerprint = createReviewEvidenceSignature(input.tableModel, {
		columnCount: input.columnCount,
		fileName: input.fileName,
		rowCount: input.rowCount,
		...(input.sheetId !== undefined ? { sheetId: input.sheetId } : {}),
	});

	return {
		resource: URI.revive(input.resource),
		modelVersion: input.modelVersion,
		sourceVersion: input.sourceVersion,
		...(normalizeText(input.sheetId) ? { sheetId: normalizeText(input.sheetId) } : {}),
		evidenceFingerprint,
		evidence: {
			structure: input.tableModel.structure,
			columnProfiles: input.tableModel.columnProfiles,
			layoutCandidates: input.tableModel.layoutCandidates,
			semanticCandidates: input.tableModel.semanticCandidates,
			groups: input.tableModel.groups,
			blocks: input.tableModel.blocks,
			diagnostics: input.tableModel.diagnostics,
			sourceMetadata: createTableReviewSourceMetadata(input),
		},
	};
};

const createTableReviewSourceMetadata = (
	input: TableReviewDerivationInput,
): TableReviewSourceMetadata => ({
	...(input.columnCount !== undefined ? { columnCount: input.columnCount } : {}),
	...(input.fileName !== undefined ? { fileName: input.fileName } : {}),
	...(input.rowCount !== undefined ? { rowCount: input.rowCount } : {}),
	sourceModelVersion: input.modelVersion,
	sourceUri: getResourceIdentity(input.resource),
	sourceVersion: input.sourceVersion,
});

const getResourceIdentity = (
	resource: unknown,
): string => {
	const text = getResourceString(resource);
	if (text) {
		return text.replace(/\\/g, "/");
	}

	if (resource && typeof resource === "object") {
		const candidate = resource as { readonly scheme?: unknown; readonly authority?: unknown; readonly path?: unknown; readonly query?: unknown; readonly fragment?: unknown };
		const scheme = normalizeText(candidate.scheme);
		const path = normalizeText(candidate.path);
		if (scheme && path) {
			const authority = normalizeText(candidate.authority);
			const query = normalizeText(candidate.query);
			const fragment = normalizeText(candidate.fragment);
			return (scheme === "file"
				? `file://${authority}${path}${query ? `?${query}` : ""}${fragment ? `#${fragment}` : ""}`
				: `${scheme}://${authority}${path}${query ? `?${query}` : ""}${fragment ? `#${fragment}` : ""}`
			).replace(/\\/g, "/");
		}
	}

	return "";
};

const getResourceString = (
	resource: unknown,
): string => {
	if (!resource) {
		return "";
	}

	if (typeof resource === "string") {
		return normalizeText(resource);
	}

	const toString = (resource as { readonly toString?: unknown }).toString;
	if (typeof toString === "function" && toString !== Object.prototype.toString) {
		const text = normalizeText(toString.call(resource));
		return text === "[object Object]" ? "" : text;
	}

	return "";
};

const createTableReviewDecision = ({
	candidates,
	reviews,
}: {
	readonly candidates: readonly TableReviewCandidate[];
	readonly reviews: readonly TableCandidateReview[];
}): TableReviewResult["decision"] => {
	const readySelection = selectTableReviewCandidate({
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
		const selection = selectTableReviewCandidate({
			candidates,
			isEligibleReview: review => review.status !== "ready",
			reviews,
		});
		const candidate = selection?.candidate ?? candidates[0];
		const review = selection?.review ?? reviews.find(candidateReview => candidateReview.candidateId === candidate.id);
		if (review?.status === "invalid" && review.findings.some(finding => finding.blocking)) {
			return {
				kind: "invalid",
				summary: "Table review candidates are invalid.",
				reasons: review.reasons,
				diagnostics: createReviewDiagnosticsFromFindings(review.findings),
				suggestedActions: [{ id: "review.createTemplate", label: "Create template" }],
			};
		}
		return {
			kind: "needsManualAdjustment",
			...(candidate ? { candidateId: candidate.id } : {}),
			summary: "Table review candidates need manual adjustment before application.",
			reasons: review?.reasons ?? ["review.noReadyCandidate"],
			diagnostics: review?.diagnostics ?? [],
			suggestedActions: [{ id: "review.adjustTemplate", label: "Adjust template" }],
		};
	}

	return {
		kind: "invalid",
		summary: "No usable table review candidates were found.",
		reasons: ["review.noCandidates"],
		diagnostics: [{
			severity: "warning",
			code: "review.noCandidates",
			message: "No Recipe or UserTemplate candidates matched this table evidence.",
		}],
		suggestedActions: [{ id: "review.createTemplate", label: "Create template" }],
	};
};

const selectTableReviewCandidate = ({
	candidates,
	isEligibleReview,
	reviews,
}: {
	readonly candidates: readonly TableReviewCandidate[];
	readonly isEligibleReview: (review: TableCandidateReview) => boolean;
	readonly reviews: readonly TableCandidateReview[];
}): { readonly candidate: TableReviewCandidate; readonly review: TableCandidateReview } | undefined => {
	const candidateIndexById = new Map<string, number>();
	candidates.forEach((candidate, index) => {
		candidateIndexById.set(candidate.id, index);
	});

	return reviews
		.filter(review => isEligibleReview(review) && candidateIndexById.has(review.candidateId))
		.sort((left, right) =>
			getTableCandidateReviewStatusRank(right.status) - getTableCandidateReviewStatusRank(left.status) ||
			right.confidence - left.confidence ||
			(candidateIndexById.get(left.candidateId) ?? Number.MAX_SAFE_INTEGER) -
				(candidateIndexById.get(right.candidateId) ?? Number.MAX_SAFE_INTEGER)
		)
		.map(review => {
			const candidate = candidates[candidateIndexById.get(review.candidateId) ?? -1];
			return candidate ? { candidate, review } : undefined;
		})
		.find((selection): selection is { readonly candidate: TableReviewCandidate; readonly review: TableCandidateReview } => Boolean(selection));
};

const getTableCandidateReviewStatusRank = (
	status: TableCandidateReview["status"],
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
	findings: readonly TableCandidateReview["findings"][number][],
): readonly ReviewDiagnostic[] =>
	findings.map(finding => ({
		severity: finding.severity,
		code: finding.code,
		message: finding.message,
	}));

const createTableReviewCandidateSummary = (
	candidate: TableReviewCandidate,
): TableReviewCandidateSummary => ({
	id: candidate.id,
	source: candidate.source,
	interpretationFingerprint: candidate.interpretationFingerprint,
	displayName: candidate.interpretation.name,
	...(candidate.providerRank !== undefined ? { providerRank: candidate.providerRank } : {}),
	reasonCodes: getTableReviewCandidateReasons(candidate),
	diagnosticCodes: getTableReviewCandidateDiagnostics(candidate).map(diagnostic => diagnostic.code),
});

const getTableReviewCandidateReasons = (
	candidate: TableReviewCandidate,
): readonly string[] => [
	...candidate.selectorTrace.reasons,
	...candidate.projectionTrace.reasons,
];

const getTableReviewCandidateDiagnostics = (
	candidate: TableReviewCandidate,
): readonly ReviewDiagnostic[] => [
	...candidate.selectorTrace.diagnostics,
	...candidate.projectionTrace.diagnostics,
];

const toReviewedTemplateSource = (
	source: TableReviewCandidate["source"],
): ReviewedTemplateSource => source;

const createReviewedTemplateSnapshotFromCandidateInterpretation = (
	interpretation: TableReviewCandidateInterpretation,
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
