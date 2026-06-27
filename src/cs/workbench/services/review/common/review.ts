/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type { Event } from "src/cs/base/common/event";
import { createDecorator } from "src/cs/platform/instantiation/common/instantiation";
import type { Template } from "src/cs/workbench/services/template/common/templateSpec";
import type {
  ReviewDiagnostic,
  ReviewedTemplate,
  ReviewSuggestedAction,
  CandidateReview,
  ReviewTableProjectionEvidence,
  ReviewResult,
  ReviewSummary,
  ReviewSummaryTarget,
} from "src/cs/workbench/services/review/common/reviewModel";

export type {
  ReviewDiagnostic,
  ReviewedTemplate,
  ReviewedTemplateSource,
  ReviewSuggestedAction,
  SegmentCandidate,
  CandidateReview,
  CandidateReviewStatus,
  ReviewCandidate,
  ReviewCandidateSummary,
  ReviewContext,
  ReviewDecision,
  ReviewEvidence,
  ReviewFactors,
  ReviewFinding,
  ReviewFindingSeverity,
  ReviewResult,
  ReviewSummary,
  ReviewSummaryState,
  ReviewSummaryTarget,
  ReviewSourceMetadata,
  ReviewTableProjectionEvidence,
} from "src/cs/workbench/services/review/common/reviewModel";

export const IReviewService = createDecorator<IReviewService>("reviewService");

export const REVIEW_ENGINE_VERSION = 1;
export const REVIEW_POLICY_VERSION = 8;

export type ManualTemplateSelection =
  | {
      readonly kind: "userTemplate";
      readonly templateId: string;
    }
  | {
      readonly kind: "inline";
      readonly template: Template;
    };

export type UriManualTemplateReviewRequest = {
  readonly target: ReviewSummaryTarget;
  readonly selection: ManualTemplateSelection;
};

export type ManualTemplateReviewResult =
  | {
      readonly kind: "ready";
      readonly reviewedTemplate: ReviewedTemplate;
      readonly suggestedActions: readonly ReviewSuggestedAction[];
    }
  | {
      readonly kind: "needsManualAdjustment";
      readonly review: CandidateReview;
      readonly diagnostics: readonly ReviewDiagnostic[];
      readonly suggestedActions: readonly ReviewSuggestedAction[];
    }
  | {
      readonly kind: "invalid";
      readonly review?: CandidateReview;
      readonly diagnostics: readonly ReviewDiagnostic[];
      readonly suggestedActions: readonly ReviewSuggestedAction[];
    };

export type ReviewedTableMeasurementBinding = {
  readonly curveFamily: ReviewedTableMeasurementFamily;
  readonly ivMode?: ReviewedTableIvMode | null;
  readonly itMode?: ReviewedTableItMode | null;
};

export type ReviewedTableMeasurementFamily = "iv" | "cv" | "cf" | "pv" | "it";
export type ReviewedTableIvMode = "transfer" | "output";
export type ReviewedTableItMode =
  | "stability"
  | "transient"
  | "retention"
  | "biasStress"
  | "photoResponse"
  | "generic";

export type UriReview = {
  readonly resource: ReviewSummaryTarget["resource"];
  readonly sheetId?: string;
  readonly contentHash?: string;
  readonly summary: ReviewSummary;
  readonly result?: ReviewResult;
  readonly reviewSignature?: string;
  readonly measurement?: ReviewedTableMeasurementBinding;
  readonly sourceModelVersion?: number;
  readonly sourceVersion?: number;
  readonly rowCount?: number;
  readonly columnCount?: number;
  readonly fileName?: string | null;
};

export type ReviewEvidenceSignatureContext = {
  readonly columnCount?: number;
  readonly contentHash?: string | null;
  readonly fileName?: string | null;
  readonly rowCount?: number;
  readonly sheetId?: string | null;
};

export type ReviewEvidenceSignatureInput = {
  readonly tableModelRuleVersion: number;
  readonly blocks: ReviewTableProjectionEvidence["blocks"];
  readonly columnProfiles: ReviewTableProjectionEvidence["columnProfiles"];
  readonly diagnostics: ReviewTableProjectionEvidence["diagnostics"];
  readonly groups: ReviewTableProjectionEvidence["groups"];
  readonly layoutCandidates: ReviewTableProjectionEvidence["layoutCandidates"];
  readonly schemaProfileVersion: number;
  readonly semanticCandidates: ReviewTableProjectionEvidence["semanticCandidates"];
  readonly sourceContentHash?: string;
  readonly sourceModelVersion?: number;
  readonly sourceRawTableVersion: number;
  readonly sourceUri?: string;
  readonly sourceVersion?: number;
  readonly structure: ReviewTableProjectionEvidence["structure"];
};

export interface IReviewService {
  readonly _serviceBrand: undefined;

  readonly onDidChangeReview: Event<void>;

  getLatestReview(target: ReviewSummaryTarget): UriReview | undefined;
  getLatestReviewSummary(target: ReviewSummaryTarget): ReviewSummary;
  reviewUri(target: ReviewSummaryTarget): Promise<UriReview>;
  reviewUriManualTemplate(input: UriManualTemplateReviewRequest): Promise<ManualTemplateReviewResult>;
}

export const createReviewEvidenceSignature = ({
  tableModelRuleVersion,
  blocks,
  columnProfiles,
  diagnostics,
  groups,
  layoutCandidates,
  schemaProfileVersion,
  semanticCandidates,
  sourceContentHash,
  sourceModelVersion,
  sourceRawTableVersion,
  sourceUri,
  sourceVersion,
  structure,
}: ReviewEvidenceSignatureInput, context: ReviewEvidenceSignatureContext = {}): string => {
  const sourceModelSignature = createSourceModelSignature({
    contentHash: context.contentHash ?? sourceContentHash,
    sourceSheetId: context.sheetId,
    sourceModelVersion,
    sourceUri,
    sourceVersion,
  });

  return JSON.stringify({
    tableModelRuleVersion,
    schemaProfileVersion,
    sourceMetadata: {
      columnCount: normalizeSignatureInteger(context.columnCount),
      fileName: normalizeSignatureText(context.fileName),
      rowCount: normalizeSignatureInteger(context.rowCount),
    },
    ...sourceModelSignature,
    ...(sourceModelSignature.sourceModel ? {} : { sourceRawTableVersion }),
    structure,
    columnProfiles,
    layoutCandidates,
    semanticCandidates,
    groups,
    blocks,
    diagnostics,
  });
};

const normalizeSignatureText = (
  value: unknown,
): string | undefined => {
  const normalized = String(value ?? "").trim();
  return normalized || undefined;
};

const normalizeSignatureInteger = (
  value: unknown,
): number | undefined => {
  const normalized = Math.floor(Number(value));
  return Number.isFinite(normalized) && normalized >= 0 ? normalized : undefined;
};

const createSourceModelSignature = ({
  contentHash,
  sourceSheetId,
  sourceModelVersion,
  sourceUri,
  sourceVersion,
}: {
  readonly contentHash?: string | null;
  readonly sourceSheetId?: string | null;
  readonly sourceModelVersion?: number;
  readonly sourceUri?: string;
  readonly sourceVersion?: number;
}): { readonly sourceModel?: { readonly contentHash?: string; readonly modelVersion?: number; readonly sheetId?: string; readonly sourceUri?: string; readonly sourceVersion?: number } } => {
  const normalizedContentHash = normalizeSignatureText(contentHash);
  const modelVersion = normalizeSignatureInteger(sourceModelVersion);
  const normalizedSheetId = normalizeSignatureText(sourceSheetId);
  const normalizedSourceUri = normalizeSignatureText(sourceUri);
  const normalizedSourceVersion = normalizeSignatureInteger(sourceVersion);
  return normalizedContentHash || modelVersion !== undefined || normalizedSheetId || normalizedSourceUri || normalizedSourceVersion !== undefined
    ? {
        sourceModel: {
          contentHash: normalizedContentHash,
          modelVersion,
          sheetId: normalizedSheetId,
          sourceUri: normalizedSourceUri,
          sourceVersion: normalizedSourceVersion,
        },
      }
    : {};
};
