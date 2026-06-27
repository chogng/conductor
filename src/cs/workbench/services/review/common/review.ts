/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type { Event } from "src/cs/base/common/event";
import { createDecorator } from "src/cs/platform/instantiation/common/instantiation";
import type {
  BaseCurveFamily,
  ItCurveMode,
  IvCurveMode,
  RawTableRef,
  SheetId,
} from "src/cs/workbench/services/session/common/sessionModel";
import type { Template } from "src/cs/workbench/services/template/common/templateSpec";
import type { TableModelRecord } from "src/cs/workbench/services/tableModel/common/tableModel";
import type {
  ReviewDiagnostic,
  ReviewedTemplate,
  ReviewSuggestedAction,
  TableCandidateReview,
  TableReviewResult,
  TableReviewSummary,
  TableReviewSummaryTarget,
} from "src/cs/workbench/services/review/common/reviewModel";

export type {
  ReviewDiagnostic,
  ReviewedTemplate,
  ReviewedTemplateSource,
  ReviewSuggestedAction,
  TableCandidateReview,
  TableCandidateReviewStatus,
  TableReviewCandidate,
  TableReviewCandidateSummary,
  TableReviewContext,
  TableReviewDecision,
  TableReviewEvidence,
  TableReviewFactors,
  TableReviewFinding,
  TableReviewFindingSeverity,
  TableReviewResult,
  TableReviewSummary,
  TableReviewSummaryState,
  TableReviewSummaryTarget,
  TableReviewSourceMetadata,
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
      readonly kind: "savedTemplate";
      readonly templateId: string;
    }
  | {
      readonly kind: "inline";
      readonly template: Template;
    };

export type RawTableManualTemplateReviewRequest = {
  readonly ref: RawTableRef;
  readonly selection: ManualTemplateSelection;
};

export type UriManualTemplateReviewRequest = {
  readonly target: TableReviewSummaryTarget;
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
      readonly review: TableCandidateReview;
      readonly diagnostics: readonly ReviewDiagnostic[];
      readonly suggestedActions: readonly ReviewSuggestedAction[];
    }
  | {
      readonly kind: "invalid";
      readonly review?: TableCandidateReview;
      readonly diagnostics: readonly ReviewDiagnostic[];
      readonly suggestedActions: readonly ReviewSuggestedAction[];
    };

export type ReviewedTableMeasurementBinding = {
  readonly curveFamily: BaseCurveFamily;
  readonly ivMode?: IvCurveMode | null;
  readonly itMode?: ItCurveMode | null;
};

export type UriTableReview = {
  readonly resource: TableReviewSummaryTarget["resource"];
  readonly sheetId?: SheetId;
  readonly summary: TableReviewSummary;
  readonly result?: TableReviewResult;
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
  readonly fileName?: string | null;
  readonly rowCount?: number;
  readonly sheetId?: SheetId | null;
};

export interface IReviewService {
  readonly _serviceBrand: undefined;

  readonly onDidChangeTableReview: Event<void>;

  getLatestReview(target: TableReviewSummaryTarget): UriTableReview | undefined;
  getLatestReviewSummary(target: TableReviewSummaryTarget): TableReviewSummary;
  reviewUriTable(target: TableReviewSummaryTarget): Promise<UriTableReview>;
  /**
   * Legacy raw-table compatibility boundary. Implementations must fail closed
   * instead of reading Session evidence for URI-backed TableReview.
   */
  reviewRawTableManualTemplate(input: RawTableManualTemplateReviewRequest): ManualTemplateReviewResult;
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
  sourceModelVersion,
  sourceRawTableVersion,
  sourceUri,
  sourceVersion,
  structure,
}: Pick<
  TableModelRecord,
  | "tableModelRuleVersion"
  | "blocks"
  | "columnProfiles"
  | "diagnostics"
  | "groups"
  | "layoutCandidates"
  | "schemaProfileVersion"
  | "semanticCandidates"
  | "sourceModelVersion"
  | "sourceRawTableVersion"
  | "sourceUri"
  | "sourceVersion"
  | "structure"
>, context: ReviewEvidenceSignatureContext = {}): string => {
  const sourceModelSignature = createSourceModelSignature({
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
  sourceSheetId,
  sourceModelVersion,
  sourceUri,
  sourceVersion,
}: {
  readonly sourceSheetId?: string | null;
  readonly sourceModelVersion?: number;
  readonly sourceUri?: string;
  readonly sourceVersion?: number;
}): { readonly sourceModel?: { readonly modelVersion?: number; readonly sheetId?: string; readonly sourceUri?: string; readonly sourceVersion?: number } } => {
  const modelVersion = normalizeSignatureInteger(sourceModelVersion);
  const normalizedSheetId = normalizeSignatureText(sourceSheetId);
  const normalizedSourceUri = normalizeSignatureText(sourceUri);
  const normalizedSourceVersion = normalizeSignatureInteger(sourceVersion);
  return modelVersion !== undefined || normalizedSheetId || normalizedSourceUri || normalizedSourceVersion !== undefined
    ? {
        sourceModel: {
          modelVersion,
          sheetId: normalizedSheetId,
          sourceUri: normalizedSourceUri,
          sourceVersion: normalizedSourceVersion,
        },
      }
    : {};
};
