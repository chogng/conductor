/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from "src/cs/platform/instantiation/common/instantiation";
import type { Event } from "src/cs/base/common/event";
import type { AssessmentDecision } from "src/cs/workbench/services/assessment/common/assessmentDecision";
import type { ColumnProfile } from "src/cs/workbench/services/assessment/common/columnProfile";
import type { AssessmentDiagnostic } from "src/cs/workbench/services/assessment/common/diagnostics";
import type {
  IvSweepMode,
  MeasurementBlockRecord,
  MeasurementFamily,
  MeasurementGroupRecord,
} from "src/cs/workbench/services/assessment/common/measurement";
import type { LayoutCandidate } from "src/cs/workbench/services/assessment/common/layoutCandidate";
import type { RawTableStructure } from "src/cs/workbench/services/assessment/common/rawTableStructure";
import type { ColumnSemanticCandidate } from "src/cs/workbench/services/assessment/common/semanticCandidate";
import type { SchemaProfile } from "src/cs/workbench/services/schemaProfile/common/schemaProfile";
import type {
  RawTableRef,
} from "src/cs/workbench/services/session/common/sessionModel";

export const IAssessmentService = createDecorator<IAssessmentService>("assessmentService");
export const IAssessmentQueueService = createDecorator<IAssessmentQueueService>("assessmentQueueService");
export const AssessmentContributionId = "workbench.services.assessment.lifecycle";

// Bump this when assessment heuristics change in a way that should invalidate
// stored raw table assessment records.
export const ASSESSMENT_RULE_VERSION = 2;

export type AssessmentRows = readonly (readonly string[])[];

export type ImportFileAxisRole = "vg" | "vd" | null;

export type ImportFileAxisRoleSource =
  | "filename"
  | "title"
  | "label"
  | "metadata"
  | "schemaProfile"
  | "shape"
  | null;

export type ImportFileAssessment = {
  curveFamily: MeasurementFamily;
  curveType: string | null;
  curveTypeConfidence: "high" | "medium" | "low";
  curveTypeNeedsTemplate: boolean;
  curveTypeReasons: string[];
  ivMode?: IvSweepMode | null;
  xAxisRole: ImportFileAxisRole;
  xAxisRoleSource: ImportFileAxisRoleSource;
};

export type AssessmentFileInput = {
  readonly name: string;
  slice(start?: number, end?: number): {
    text(): Promise<string>;
  };
};

export type AssessRawTableInput = {
  readonly columnCount?: number;
  readonly fileId: string;
  readonly rawTableId: string;
  readonly rowCount?: number;
  readonly sourceRawTableVersion: number;
  readonly rows: AssessmentRows;
  readonly fileName?: string | null;
  readonly schemaProfiles?: readonly SchemaProfile[];
  readonly schemaProfileVersion?: number;
};

export type RawTableAssessmentRecord = {
  readonly assessmentRuleVersion: number;
  readonly schemaProfileVersion: number;
  readonly fileId: string;
  readonly rawTableId: string;
  readonly sourceRawTableVersion: number;
  readonly structure: RawTableStructure;
  readonly columnProfiles: readonly ColumnProfile[];
  readonly layoutCandidates: readonly LayoutCandidate[];
  readonly semanticCandidates: readonly ColumnSemanticCandidate[];
  readonly groups: readonly MeasurementGroupRecord[];
  readonly blocks: readonly MeasurementBlockRecord[];
  readonly decision: AssessmentDecision;
  readonly diagnostics: readonly AssessmentDiagnostic[];
  readonly createdAt: number;
};

export interface IAssessmentService {
  readonly _serviceBrand: undefined;

  assessImportFile(file: AssessmentFileInput): Promise<ImportFileAssessment>;
  assessImportRows(fileName: string, rows: AssessmentRows): Promise<ImportFileAssessment>;
  assessRawTable(input: AssessRawTableInput): Promise<RawTableAssessmentRecord>;
}

export type AssessmentQueuePriority = "visible" | "nearby" | "background";

// Conductor-specific service-local queue state for Explorer projections.
// This is not a canonical Session record.
export type AssessmentRawTableQueueState = {
  readonly fileId: string;
  readonly priority: AssessmentQueuePriority;
  readonly rawTableId: string;
  readonly sourceRawTableVersion: number;
  readonly state: "queued" | "running";
};

export type AssessmentQueueSnapshot = {
  readonly rawTables: readonly AssessmentRawTableQueueState[];
};

export interface IAssessmentQueueService {
  readonly _serviceBrand: undefined;

  readonly onDidChangeAssessmentQueueState: Event<void>;

  enqueueRawTables(refs: readonly RawTableRef[]): void;
  getQueueSnapshot(): AssessmentQueueSnapshot;
  prioritizeRawTables(
    refs: readonly RawTableRef[],
    priority: AssessmentQueuePriority,
  ): void;
}

type AssessmentRawTableSnapshot = {
  readonly filesById: Readonly<Record<string, {
    readonly id: string;
    readonly raw: {
      readonly tableOrder: readonly string[];
      readonly tablesById: Readonly<Record<string, unknown>>;
    };
  }>>;
};

export const getRawTableRefsForFileIds = (
  fileIds: readonly string[],
  snapshot: AssessmentRawTableSnapshot,
): RawTableRef[] => {
  const refs: RawTableRef[] = [];
  const seenFileIds = new Set<string>();
  for (const fileId of fileIds) {
    const normalizedFileId = String(fileId ?? "").trim();
    if (!normalizedFileId || seenFileIds.has(normalizedFileId)) {
      continue;
    }
    seenFileIds.add(normalizedFileId);

    const file = snapshot.filesById[normalizedFileId];
    if (!file) {
      continue;
    }

    for (const rawTableId of file.raw.tableOrder) {
      if (file.raw.tablesById[rawTableId]) {
        refs.push({ fileId: file.id, rawTableId });
      }
    }
  }

  return uniqueRawTableRefs(refs);
};

const uniqueRawTableRefs = (
  refs: readonly RawTableRef[],
): RawTableRef[] => {
  const result: RawTableRef[] = [];
  const seen = new Set<string>();
  for (const ref of refs) {
    const fileId = String(ref.fileId ?? "").trim();
    const rawTableId = String(ref.rawTableId ?? "").trim();
    const key = `${fileId}\u0000${rawTableId}`;
    if (!fileId || !rawTableId || seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push({ fileId, rawTableId });
  }

  return result;
};
