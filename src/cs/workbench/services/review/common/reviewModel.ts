/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type { URI } from "src/cs/base/common/uri";
import type {
	ColumnProfile,
	ColumnSemanticCandidate,
	LayoutCandidate,
	MeasurementBlockRecord,
	MeasurementGroupRecord,
	TableProjectionDiagnostic,
	TableProjectionStructure,
} from "src/cs/workbench/services/table/common/tableProjection";
import type { Template, TemplateMeasurementBinding } from "src/cs/workbench/services/template/common/templateSpec";

// Review owns these evidence shapes while it is their only consumer. Move them
// to a neutral content/table owner only when another service needs the same facts.
export type ReviewSourceMetadata = {
	readonly columnCount?: number;
	readonly contentHash?: string;
	readonly fileName?: string | null;
	readonly rowCount?: number;
	readonly sourceModelVersion?: number;
	readonly sourceUri?: string;
	readonly sourceVersion?: number;
};

export type ReviewEvidence = {
	readonly sourceMetadata: ReviewSourceMetadata;
	readonly tableProjection?: TableProjectionEvidence;
};

export type TableProjectionEvidence = {
	readonly structure: TableProjectionStructure;
	readonly columnProfiles: readonly ColumnProfile[];
	readonly layoutCandidates: readonly LayoutCandidate[];
	readonly semanticCandidates: readonly ColumnSemanticCandidate[];
	readonly groups: readonly MeasurementGroupRecord[];
	readonly blocks: readonly MeasurementBlockRecord[];
	readonly diagnostics: readonly TableProjectionDiagnostic[];
};

export type ReviewContext = {
	readonly resource: URI;
	readonly sheetId?: string;
	readonly contentHash?: string;
	readonly modelVersion: number;
	readonly sourceVersion: number;
	readonly evidenceFingerprint: string;
	readonly evidence: ReviewEvidence;
};

export type ReviewCandidateSource =
	| {
		readonly kind: "recipe";
		readonly recipeId: string;
		readonly recipeVersion: number;
	}
	| {
		readonly kind: "userTemplate";
		readonly templateId: string;
		readonly templateVersion: number;
	};

export type ReviewCandidateDiagnostic = {
	readonly severity: "info" | "warning" | "error";
	readonly code: string;
	readonly message: string;
};

export type ReviewDiagnostic = ReviewCandidateDiagnostic;

export type ReviewCandidateTrace = {
	readonly reasons: readonly string[];
	readonly diagnostics: readonly ReviewCandidateDiagnostic[];
};

export type ReviewCandidateApplicability = {
	readonly schemaFingerprint?: string;
	readonly columnCount?: number;
};

export type ReviewCandidateRowRange = {
	readonly startRow: number;
	readonly endRow: number | "end";
};

export type ReviewCandidateColumnRange = {
	readonly column: number;
	readonly startRow: number;
	readonly endRow: number | "end";
};

export type ReviewCandidateAxisBinding = {
	readonly columns: readonly number[];
	readonly ranges?: readonly ReviewCandidateColumnRange[];
	readonly unit?: string;
};

export type ReviewCandidateSegmentation =
	| { readonly kind: "auto" }
	| { readonly kind: "none" }
	| { readonly kind: "fixedPoints"; readonly pointsPerGroup: number }
	| { readonly kind: "fixedSegments"; readonly segmentCount: number };

export type ReviewCandidateLegend = {
	readonly target: "auto" | "yColumn" | "group";
	readonly prefix?: string;
};

export type ReviewCandidateTitles = {
	readonly bottom?: string;
	readonly left?: string;
};

export type ReviewCandidateBlock = {
	readonly rowRange: ReviewCandidateRowRange;
	readonly x: ReviewCandidateAxisBinding;
	readonly y: ReviewCandidateAxisBinding;
	readonly segmentation: ReviewCandidateSegmentation;
	readonly legend: ReviewCandidateLegend;
	readonly titles?: ReviewCandidateTitles;
};

export type ReviewCandidateInterpretation = {
	readonly name: string;
	readonly version: number;
	readonly measurement?: TemplateMeasurementBinding;
	readonly blocks: readonly ReviewCandidateBlock[];
	readonly stopOnError: boolean;
	readonly applicability?: ReviewCandidateApplicability;
};

export type ReviewCandidate = {
	readonly id: string;
	readonly source: ReviewCandidateSource;
	readonly interpretation: ReviewCandidateInterpretation;
	readonly interpretationFingerprint: string;
	readonly evidenceFingerprint: string;
	readonly contentHash?: string;
	readonly modelVersion?: number;
	readonly sourceVersion?: number;
	readonly confidence: number;
	readonly providerRank?: number;
	readonly selectorTrace: ReviewCandidateTrace;
	readonly projectionTrace: ReviewCandidateTrace;
	readonly captures?: Readonly<Record<string, unknown>>;
};

export type SegmentCandidate = ReviewCandidate;

export type ReviewCandidateSummary = {
	readonly id: string;
	readonly source: ReviewCandidateSource;
	readonly interpretationFingerprint: string;
	readonly displayName?: string;
	readonly providerRank?: number;
	readonly reasonCodes: readonly string[];
	readonly diagnosticCodes: readonly string[];
};

export type CandidateReviewStatus =
	| "ready"
	| "needsAdjustment"
	| "invalid";

export type ReviewFactors = {
	readonly selectorScore: number;
	readonly projectionScore: number;
	readonly semanticScore: number;
	readonly dataQualityScore: number;
	readonly parseHealthScore: number;
	readonly freshnessScore: number;
	readonly ambiguityPenalty: number;
	readonly conflictPenalty: number;
	readonly diagnosticPenalty: number;
};

export type ReviewFindingSeverity =
	| "info"
	| "warning"
	| "error";

export type ReviewFinding = {
	readonly severity: ReviewFindingSeverity;
	readonly code: string;
	readonly message: string;
	readonly blocking?: boolean;
};

export type CandidateReview = {
	readonly candidateId: string;
	readonly interpretationFingerprint: string;
	readonly status: CandidateReviewStatus;
	readonly confidence: number;
	readonly factors: ReviewFactors;
	readonly findings: readonly ReviewFinding[];
	readonly reasons: readonly string[];
	readonly diagnostics: readonly ReviewDiagnostic[];
};

export type ReviewedTemplateSource =
	| {
		readonly kind: "recipe";
		readonly recipeId: string;
		readonly recipeVersion: number;
	}
	| {
		readonly kind: "userTemplate";
		readonly templateId: string;
		readonly templateVersion: number;
	}
	| {
		readonly kind: "inline";
	};

export type ReviewedTemplate = {
	readonly candidateId: string;
	readonly source: ReviewedTemplateSource;
	readonly template: Template;
	readonly templateFingerprint: string;
	readonly review: CandidateReview;
	readonly userOverride?: {
		readonly confirmedAt: number;
		readonly reason?: string;
	};
};

export type ReviewSuggestedAction = {
	readonly id: string;
	readonly label: string;
};

export type ReviewDecision =
	| {
		readonly kind: "ready";
		readonly reviewedTemplate: ReviewedTemplate;
		readonly application:
			| {
				readonly kind: "systemRecommended";
				readonly reason: string;
			}
			| {
				readonly kind: "userActionRequired";
				readonly reason: string;
			};
		readonly summary: string;
		readonly suggestedActions: readonly ReviewSuggestedAction[];
	}
	| {
		readonly kind: "needsManualAdjustment";
		readonly candidateId?: string;
		readonly summary: string;
		readonly reasons: readonly string[];
		readonly diagnostics: readonly ReviewDiagnostic[];
		readonly suggestedActions: readonly ReviewSuggestedAction[];
	}
	| {
		readonly kind: "invalid";
		readonly summary: string;
		readonly reasons: readonly string[];
		readonly diagnostics: readonly ReviewDiagnostic[];
		readonly suggestedActions: readonly ReviewSuggestedAction[];
	};

export type ReviewResult = {
	readonly resource?: URI;
	readonly sheetId?: string;
	readonly contentHash?: string;
	readonly modelVersion?: number;
	readonly sourceVersion?: number;
	readonly evidenceFingerprint: string;
	readonly recipeFingerprint: string;
	readonly userTemplateCatalogVersion: number;
	readonly userTemplateEffectiveFingerprint: string;
	readonly reviewEngineVersion: number;
	readonly reviewPolicyVersion: number;
	readonly candidates: readonly ReviewCandidateSummary[];
	readonly reviews: readonly CandidateReview[];
	readonly decision: ReviewDecision;
	readonly reviewedTemplate?: ReviewedTemplate;
};

export type ReviewSummaryState =
	| "missing"
	| "pending"
	| "stale"
	| "ready"
	| "needsAdjustment"
	| "invalid";

export type ReviewSummaryTarget = {
	readonly resource: URI;
	readonly contentHash?: string | null;
	readonly sheetId?: string | null;
};

export type ReviewSummary = {
	readonly resource: URI;
	readonly sheetId?: string;
	readonly state: ReviewSummaryState;
	readonly confidence?: number;
	readonly reviewedSemanticLabel?: string;
	readonly message?: string;
	readonly findingCodes: readonly string[];
	readonly reviewSignature?: string;
	readonly templateFingerprint?: string;
};
