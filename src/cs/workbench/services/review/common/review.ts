/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type { Event } from "src/cs/base/common/event";
import { createDecorator } from "src/cs/platform/instantiation/common/instantiation";
import type { RawTableAssessmentRecord } from "src/cs/workbench/services/assessment/common/assessment";
import type { RecipeSnapshot } from "src/cs/workbench/services/recipe/common/recipe";
import type {
  FileId,
  RawTableRef,
  SheetId,
} from "src/cs/workbench/services/session/common/sessionModel";
import type { Template } from "src/cs/workbench/services/template/common/templateSpec";
import type { UserTemplateSnapshot } from "src/cs/workbench/services/userTemplate/common/userTemplate";

export const IReviewService = createDecorator<IReviewService>("reviewService");

export const ReviewContributionId = "workbench.services.review.lifecycle";
export const ReviewApplyContributionId = "workbench.services.review.apply";

export const REVIEW_ENGINE_VERSION = 1;
export const REVIEW_POLICY_VERSION = 2;

export type ReviewDiagnostic = {
  readonly severity: "info" | "warning" | "error";
  readonly code: string;
  readonly message: string;
};

export type AutomaticTemplateCandidateSource =
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

export type TemplateCandidateSummary = {
  readonly id: string;
  readonly source: AutomaticTemplateCandidateSource;
  readonly templateFingerprint: string;
  readonly displayName?: string;
  readonly providerRank?: number;
  readonly reasonCodes: readonly string[];
  readonly diagnosticCodes: readonly string[];
};

export type TemplateReviewStatus =
  | "ready"
  | "needsAdjustment"
  | "invalid";

export type TemplateReview = {
  readonly candidateId: string;
  readonly templateFingerprint: string;
  readonly status: TemplateReviewStatus;
  readonly confidence: number;
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
  readonly review: TemplateReview;
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

export type ManualTemplateReviewRequest = {
  readonly ref: RawTableRef;
  readonly selection:
    | {
        readonly kind: "userTemplate";
        readonly templateId: string;
      }
    | {
        readonly kind: "savedTemplate";
        readonly templateId: string;
      }
    | {
        readonly kind: "inline";
        readonly template: Template;
      };
};

export type ManualTemplateReviewResult =
  | {
      readonly kind: "ready";
      readonly reviewedTemplate: ReviewedTemplate;
      readonly suggestedActions: readonly ReviewSuggestedAction[];
    }
  | {
      readonly kind: "needsManualAdjustment";
      readonly review: TemplateReview;
      readonly diagnostics: readonly ReviewDiagnostic[];
      readonly suggestedActions: readonly ReviewSuggestedAction[];
    }
  | {
      readonly kind: "invalid";
      readonly review?: TemplateReview;
      readonly diagnostics: readonly ReviewDiagnostic[];
      readonly suggestedActions: readonly ReviewSuggestedAction[];
    };

export type RawTableReviewRecord = {
  readonly fileId: FileId;
  readonly rawTableId: SheetId;
  readonly sourceRawTableVersion: number;
  readonly evidenceSignature: string;
  readonly recipeFingerprint: string;
  readonly userTemplateCatalogVersion: number;
  readonly userTemplateEffectiveFingerprint: string;
  readonly reviewEngineVersion: number;
  readonly reviewPolicyVersion: number;
  readonly candidates: readonly TemplateCandidateSummary[];
  readonly reviews: readonly TemplateReview[];
  readonly decision: ReviewDecision;
  readonly createdAt: number;
};

export type ReviewInput = {
  readonly assessment: RawTableAssessmentRecord;
  readonly columnCount?: number;
  readonly fileName?: string | null;
  readonly recipeSnapshot: RecipeSnapshot;
  readonly rowCount?: number;
  readonly userTemplateSnapshot: UserTemplateSnapshot;
};

export type ReviewResult = Omit<
  RawTableReviewRecord,
  "fileId" | "rawTableId" | "sourceRawTableVersion" | "evidenceSignature" | "createdAt"
>;

export type ReviewCommit = RawTableReviewRecord;

export type ReviewQueueSnapshot = {
  readonly rawTables: readonly RawTableRef[];
};

export type ReviewEvidenceSignatureContext = {
  readonly columnCount?: number;
  readonly fileName?: string | null;
  readonly rowCount?: number;
};

export interface IReviewService {
  readonly _serviceBrand: undefined;

  readonly onDidChangeReviewState: Event<void>;

  deriveAndReview(input: ReviewInput): ReviewResult;
  enqueueAllCurrentEvidence(): void;
  enqueueForEvidence(refs: readonly RawTableRef[]): void;
  getQueueSnapshot(): ReviewQueueSnapshot;
  reviewManualTemplate(input: ManualTemplateReviewRequest): ManualTemplateReviewResult;
}

export const createReviewEvidenceSignature = ({
  assessmentRuleVersion,
  blocks,
  columnProfiles,
  diagnostics,
  groups,
  layoutCandidates,
  schemaProfileVersion,
  semanticCandidates,
  sourceRawTableVersion,
  structure,
}: Pick<
  RawTableAssessmentRecord,
  | "assessmentRuleVersion"
  | "blocks"
  | "columnProfiles"
  | "diagnostics"
  | "groups"
  | "layoutCandidates"
  | "schemaProfileVersion"
  | "semanticCandidates"
  | "sourceRawTableVersion"
  | "structure"
>, context: ReviewEvidenceSignatureContext = {}): string => JSON.stringify({
  assessmentRuleVersion,
  schemaProfileVersion,
  sourceMetadata: {
    columnCount: normalizeSignatureInteger(context.columnCount),
    fileName: normalizeSignatureText(context.fileName),
    rowCount: normalizeSignatureInteger(context.rowCount),
  },
  sourceRawTableVersion,
  structure,
  columnProfiles,
  layoutCandidates,
  semanticCandidates,
  groups,
  blocks,
  diagnostics,
});

export const createReviewRecordSignature = (
  record: Pick<
    RawTableReviewRecord,
    | "evidenceSignature"
    | "recipeFingerprint"
    | "reviewEngineVersion"
    | "reviewPolicyVersion"
    | "userTemplateCatalogVersion"
    | "userTemplateEffectiveFingerprint"
  >,
): string => JSON.stringify({
  evidenceSignature: record.evidenceSignature,
  recipeFingerprint: record.recipeFingerprint,
  userTemplateCatalogVersion: record.userTemplateCatalogVersion,
  userTemplateEffectiveFingerprint: record.userTemplateEffectiveFingerprint,
  reviewEngineVersion: record.reviewEngineVersion,
  reviewPolicyVersion: record.reviewPolicyVersion,
});

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
