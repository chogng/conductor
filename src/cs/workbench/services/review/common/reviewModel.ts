/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type { URI } from "src/cs/base/common/uri";
import type { ColumnProfile } from "src/cs/workbench/services/tableModel/common/columnProfile";
import type { TableModelDiagnostic } from "src/cs/workbench/services/tableModel/common/diagnostics";
import type { LayoutCandidate } from "src/cs/workbench/services/tableModel/common/layoutCandidate";
import type {
	MeasurementBlockRecord,
	MeasurementGroupRecord,
} from "src/cs/workbench/services/tableModel/common/measurement";
import type { RawTableStructure } from "src/cs/workbench/services/tableModel/common/rawTableStructure";
import type { ColumnSemanticCandidate } from "src/cs/workbench/services/tableModel/common/semanticCandidate";
import type {
	Template,
} from "src/cs/workbench/services/template/common/templateSpec";

export type TableReviewSourceMetadata = {
	readonly columnCount?: number;
	readonly fileName?: string | null;
	readonly rowCount?: number;
	readonly sourceModelVersion?: number;
	readonly sourceUri?: string;
	readonly sourceVersion?: number;
};

export type TableReviewEvidence = {
	readonly structure: RawTableStructure;
	readonly columnProfiles: readonly ColumnProfile[];
	readonly layoutCandidates: readonly LayoutCandidate[];
	readonly semanticCandidates: readonly ColumnSemanticCandidate[];
	readonly groups: readonly MeasurementGroupRecord[];
	readonly blocks: readonly MeasurementBlockRecord[];
	readonly diagnostics: readonly TableModelDiagnostic[];
	readonly sourceMetadata: TableReviewSourceMetadata;
};

export type TableReviewContext = {
	readonly resource: URI;
	readonly sheetId?: string;
	readonly modelVersion: number;
	readonly sourceVersion: number;
	readonly evidenceFingerprint: string;
	readonly evidence: TableReviewEvidence;
};

export type TableReviewCandidateSource =
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

export type TableReviewCandidateDiagnostic = {
	readonly severity: "info" | "warning" | "error";
	readonly code: string;
	readonly message: string;
};

export type ReviewDiagnostic = TableReviewCandidateDiagnostic;

export type TableReviewCandidateTrace = {
	readonly reasons: readonly string[];
	readonly diagnostics: readonly TableReviewCandidateDiagnostic[];
};

export type TableReviewCandidateApplicability = {
	readonly schemaFingerprint?: string;
	readonly columnCount?: number;
};

export type TableReviewCandidateRowRange = {
	readonly startRow: number;
	readonly endRow: number | "end";
};

export type TableReviewCandidateColumnRange = {
	readonly column: number;
	readonly startRow: number;
	readonly endRow: number | "end";
};

export type TableReviewCandidateAxisBinding = {
	readonly columns: readonly number[];
	readonly ranges?: readonly TableReviewCandidateColumnRange[];
	readonly unit?: string;
};

export type TableReviewCandidateSegmentation =
	| { readonly kind: "auto" }
	| { readonly kind: "none" }
	| { readonly kind: "fixedPoints"; readonly pointsPerGroup: number }
	| { readonly kind: "fixedSegments"; readonly segmentCount: number };

export type TableReviewCandidateLegend = {
	readonly target: "auto" | "yColumn" | "group";
	readonly prefix?: string;
};

export type TableReviewCandidateTitles = {
	readonly bottom?: string;
	readonly left?: string;
};

export type TableReviewCandidateBlock = {
	readonly rowRange: TableReviewCandidateRowRange;
	readonly x: TableReviewCandidateAxisBinding;
	readonly y: TableReviewCandidateAxisBinding;
	readonly segmentation: TableReviewCandidateSegmentation;
	readonly legend: TableReviewCandidateLegend;
	readonly titles?: TableReviewCandidateTitles;
};

export type TableReviewCandidateInterpretation = {
	readonly name: string;
	readonly version: number;
	readonly blocks: readonly TableReviewCandidateBlock[];
	readonly stopOnError: boolean;
	readonly applicability?: TableReviewCandidateApplicability;
};

export type TableReviewCandidate = {
	readonly id: string;
	readonly source: TableReviewCandidateSource;
	readonly interpretation: TableReviewCandidateInterpretation;
	readonly interpretationFingerprint: string;
	readonly evidenceFingerprint: string;
	readonly modelVersion?: number;
	readonly sourceVersion?: number;
	readonly confidence: number;
	readonly providerRank?: number;
	readonly selectorTrace: TableReviewCandidateTrace;
	readonly projectionTrace: TableReviewCandidateTrace;
	readonly captures?: Readonly<Record<string, unknown>>;
};

export type TableReviewCandidateSummary = {
	readonly id: string;
	readonly source: TableReviewCandidateSource;
	readonly interpretationFingerprint: string;
	readonly displayName?: string;
	readonly providerRank?: number;
	readonly reasonCodes: readonly string[];
	readonly diagnosticCodes: readonly string[];
};

export type TableCandidateReviewStatus =
	| "ready"
	| "needsAdjustment"
	| "invalid";

export type TableReviewFactors = {
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

export type TableReviewFindingSeverity =
	| "info"
	| "warning"
	| "error";

export type TableReviewFinding = {
	readonly severity: TableReviewFindingSeverity;
	readonly code: string;
	readonly message: string;
	readonly blocking?: boolean;
};

export type TableCandidateReview = {
	readonly candidateId: string;
	readonly interpretationFingerprint: string;
	readonly status: TableCandidateReviewStatus;
	readonly confidence: number;
	readonly factors: TableReviewFactors;
	readonly findings: readonly TableReviewFinding[];
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
	readonly review: TableCandidateReview;
	readonly userOverride?: {
		readonly confirmedAt: number;
		readonly reason?: string;
	};
};

export type ReviewSuggestedAction = {
	readonly id: string;
	readonly label: string;
};

export type TableReviewDecision =
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

export type TableReviewResult = {
	readonly resource?: URI;
	readonly sheetId?: string;
	readonly modelVersion?: number;
	readonly sourceVersion?: number;
	readonly evidenceFingerprint: string;
	readonly recipeFingerprint: string;
	readonly userTemplateCatalogVersion: number;
	readonly userTemplateEffectiveFingerprint: string;
	readonly reviewEngineVersion: number;
	readonly reviewPolicyVersion: number;
	readonly candidates: readonly TableReviewCandidateSummary[];
	readonly reviews: readonly TableCandidateReview[];
	readonly decision: TableReviewDecision;
	readonly reviewedTemplate?: ReviewedTemplate;
};

export type TableReviewSummaryState =
	| "missing"
	| "pending"
	| "stale"
	| "ready"
	| "needsAdjustment"
	| "invalid";

export type TableReviewSummaryTarget = {
	readonly resource: URI;
	readonly sheetId?: string | null;
};

export type TableReviewSummary = {
	readonly resource: URI;
	readonly sheetId?: string;
	readonly state: TableReviewSummaryState;
	readonly confidence?: number;
	readonly reviewedSemanticLabel?: string;
	readonly message?: string;
	readonly findingCodes: readonly string[];
	readonly reviewSignature?: string;
	readonly templateFingerprint?: string;
};
