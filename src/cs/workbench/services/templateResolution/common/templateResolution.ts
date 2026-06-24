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

export const ITemplateResolutionService =
  createDecorator<ITemplateResolutionService>("templateResolutionService");

export type TemplateCandidateSource =
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
      readonly kind: "savedTemplate";
      readonly templateId: string;
      readonly templateVersion: number;
    };

export type TemplateResolutionDiagnostic = {
  readonly severity: "info" | "warning" | "error";
  readonly code: string;
  readonly message: string;
};

export type TemplateCandidateSummary = {
  readonly id: string;
  readonly source: TemplateCandidateSource;
  readonly templateFingerprint: string;
  readonly confidence: number;
  readonly state: "ready" | "review";
  readonly reasons: readonly string[];
  readonly diagnosticCodes: readonly string[];
};

export type TemplateCandidate = TemplateCandidateSummary & {
  readonly template: Template;
};

export type RawTableTemplateResolutionRecord = {
  readonly fileId: FileId;
  readonly rawTableId: SheetId;
  readonly sourceRawTableVersion: number;
  readonly sourceAssessmentSignature: string;
  readonly recipeFingerprint: string;
  readonly templateCatalogVersion: number;
  readonly templateCandidates: readonly TemplateCandidateSummary[];
  readonly diagnostics: readonly TemplateResolutionDiagnostic[];
  readonly resolvedAt: number;
};

export type TemplateResolutionInput = {
  readonly assessment: RawTableAssessmentRecord;
  readonly columnCount?: number;
  readonly fileName?: string | null;
  readonly recipeSnapshot: RecipeSnapshot;
  readonly rowCount?: number;
  readonly userTemplateSnapshot: UserTemplateSnapshot;
};

export type TemplateResolutionResult = Omit<
  RawTableTemplateResolutionRecord,
  "fileId" | "rawTableId" | "sourceRawTableVersion" | "sourceAssessmentSignature" | "resolvedAt"
>;

export type TemplateResolutionCommit = RawTableTemplateResolutionRecord;

export type TemplateResolutionQueueSnapshot = {
  readonly rawTables: readonly RawTableRef[];
};

export type TemplateResolutionAssessmentSignatureContext = {
  readonly columnCount?: number;
  readonly fileName?: string | null;
  readonly rowCount?: number;
};

export interface ITemplateResolutionService {
  readonly _serviceBrand: undefined;

  readonly onDidChangeTemplateResolutionState: Event<void>;

  enqueueAllCurrentAssessments(): void;
  enqueueForAssessments(refs: readonly RawTableRef[]): void;
  getQueueSnapshot(): TemplateResolutionQueueSnapshot;
  resolve(input: TemplateResolutionInput): TemplateResolutionResult;
}

export const createTemplateResolutionAssessmentSignature = ({
  assessmentRuleVersion,
  blocks,
  columnProfiles,
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
  | "groups"
  | "layoutCandidates"
  | "schemaProfileVersion"
  | "semanticCandidates"
  | "sourceRawTableVersion"
  | "structure"
>, context: TemplateResolutionAssessmentSignatureContext = {}): string => JSON.stringify({
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
