/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type { Event } from "src/cs/base/common/event";
import type { URI } from "src/cs/base/common/uri";
import { createDecorator } from "src/cs/platform/instantiation/common/instantiation";
import type {
  CandidateReview,
  ReviewDiagnostic,
  ReviewEvidence,
  ReviewSuggestedAction,
  ReviewSummary,
  ReviewSummaryTarget,
  ReviewedTemplate,
} from "src/cs/workbench/services/review/common/reviewModel";
import type { SchemaProfile } from "src/cs/workbench/services/schemaProfile/common/schemaProfile";

export const IReviewService = createDecorator<IReviewService>("reviewService");

export const REVIEW_ENGINE_VERSION = 2;
export const REVIEW_POLICY_VERSION = 14;

export type ManualTemplateSelection =
  {
    readonly kind: "user";
    readonly templateId: string;
  };

export type ResourceManualTemplateReviewRequest = ReviewSummaryTarget & {
  readonly selection: ManualTemplateSelection;
};

export type ReviewedTemplateConfirmationReason =
  | "user";

export type ReviewedTemplateConfirmationRequest = ReviewSummaryTarget & {
  readonly reviewedTemplate: ReviewedTemplate;
  readonly reason?: ReviewedTemplateConfirmationReason;
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

export type ResourceReviewExecution = {
  readonly resource: URI;
  readonly sheetId?: string;
  readonly contentHash?: string;
  readonly summary: ReviewSummary;
  readonly reviewSignature: string;
  readonly sourceModelVersion: number;
  readonly sourceVersion: number;
  readonly rowCount: number;
  readonly columnCount: number;
  readonly fileName?: string | null;
  readonly systemRecommendedReviewedTemplate?: ReviewedTemplate;
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

  getLatestReviewSummary(target: ReviewSummaryTarget): ReviewSummary;
  confirmReviewedTemplate(input: ReviewedTemplateConfirmationRequest): Promise<SchemaProfile | null>;
  resolveReviewSummary(target: ReviewSummaryTarget): Promise<ReviewSummary | null>;
  reviewResourceForExecution(target: ReviewSummaryTarget): Promise<ResourceReviewExecution | null>;
  reviewResourceManualTemplate(input: ResourceManualTemplateReviewRequest): Promise<ManualTemplateReviewResult>;
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
    structuredContent: evidence.structuredContent
      ? {
          structure: evidence.structuredContent.structure,
          columnProfiles: evidence.structuredContent.columnProfiles,
          xRangeCandidates: evidence.structuredContent.xRangeCandidates,
          xGroupCandidates: evidence.structuredContent.xGroupCandidates,
          dataBlockCandidates: evidence.structuredContent.dataBlockCandidates,
          dependentValueCandidates: evidence.structuredContent.dependentValueCandidates,
          columnTitleSpans: evidence.structuredContent.columnTitleSpans,
          bindingCandidates: evidence.structuredContent.bindingCandidates,
          semanticRulesFingerprint: evidence.structuredContent.semanticRulesFingerprint,
          semanticCandidates: evidence.structuredContent.semanticCandidates,
          groups: evidence.structuredContent.groups,
          blocks: evidence.structuredContent.blocks,
          diagnostics: evidence.structuredContent.diagnostics,
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
