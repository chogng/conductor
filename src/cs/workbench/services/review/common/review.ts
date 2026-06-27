/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type { Event } from "src/cs/base/common/event";
import type { URI } from "src/cs/base/common/uri";
import { createDecorator } from "src/cs/platform/instantiation/common/instantiation";
import type { Template } from "src/cs/workbench/services/template/common/templateSpec";
import type {
  ReviewDiagnostic,
  ReviewedTemplate,
  ReviewSuggestedAction,
  CandidateReview,
  ReviewEvidence,
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
  TableProjectionEvidence,
} from "src/cs/workbench/services/review/common/reviewModel";

export const IReviewService = createDecorator<IReviewService>("reviewService");

export const REVIEW_ENGINE_VERSION = 2;
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

export type UriReview = {
  readonly resource: URI;
  readonly sheetId?: string;
  readonly contentHash?: string;
  readonly summary: ReviewSummary;
  readonly result?: ReviewResult;
  readonly reviewSignature?: string;
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

export type ReviewEvidenceSignatureInput = ReviewEvidence;

export interface IReviewService {
  readonly _serviceBrand: undefined;

  readonly onDidChangeReview: Event<void>;

  getLatestReview(target: ReviewSummaryTarget): UriReview | undefined;
  getLatestReviewSummary(target: ReviewSummaryTarget): ReviewSummary;
  reviewUri(target: ReviewSummaryTarget): Promise<UriReview>;
  reviewUriManualTemplate(input: UriManualTemplateReviewRequest): Promise<ManualTemplateReviewResult>;
}

export const createReviewEvidenceSignature = (
  evidence: ReviewEvidenceSignatureInput,
  context: ReviewEvidenceSignatureContext = {},
): string => {
  const sourceMetadata = {
    columnCount: normalizeSignatureInteger(context.columnCount ?? evidence.sourceMetadata.columnCount),
    contentHash: normalizeSignatureText(context.contentHash ?? evidence.sourceMetadata.contentHash),
    fileName: normalizeSignatureText(context.fileName ?? evidence.sourceMetadata.fileName),
    rowCount: normalizeSignatureInteger(context.rowCount ?? evidence.sourceMetadata.rowCount),
    sourceModelVersion: normalizeSignatureInteger(evidence.sourceMetadata.sourceModelVersion),
    sourceUri: normalizeSignatureText(evidence.sourceMetadata.sourceUri),
    sourceVersion: normalizeSignatureInteger(evidence.sourceMetadata.sourceVersion),
    sheetId: normalizeSignatureText(context.sheetId),
  };

  return JSON.stringify({
    sourceMetadata,
    tableProjection: evidence.tableProjection
      ? {
          structure: evidence.tableProjection.structure,
          columnProfiles: evidence.tableProjection.columnProfiles,
          layoutCandidates: evidence.tableProjection.layoutCandidates,
          semanticCandidates: evidence.tableProjection.semanticCandidates,
          groups: evidence.tableProjection.groups,
          blocks: evidence.tableProjection.blocks,
          diagnostics: evidence.tableProjection.diagnostics,
        }
      : undefined,
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
