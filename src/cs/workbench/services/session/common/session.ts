/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

/*
 * Session owns the current workbench data table. Canonical facts live in
 * filesById/fileOrder.
 */
import type { Event } from "src/cs/base/common/event";
import { createDecorator } from "src/cs/platform/instantiation/common/instantiation";
import type {
  CurveGeneration,
  CurveRecord,
  FileId,
  FileRecord,
  MetricInputRecord,
  MetricKey,
  MetricRecord,
} from "src/cs/workbench/services/session/common/sessionModel";
import type { SessionChangeEvent } from "src/cs/workbench/services/session/common/sessionEvents";
import type { FileImportResult } from "src/cs/workbench/services/files/common/files";
import type { RawTableAssessmentRecord } from "src/cs/workbench/services/assessment/common/assessment";
import type { SliceCommit } from "src/cs/workbench/services/slice/common/slice";

export const ISessionService = createDecorator<ISessionService>("sessionService");

export type CommitCurvesInput = {
  readonly fileId: FileId;
  readonly curves: readonly CurveRecord[];
  readonly replace?: boolean;
  readonly replaceGenerations?: readonly CurveGeneration[];
};

export type CommitCurvesBatchInput = readonly CommitCurvesInput[];

export type CommitMetricsInput = {
  readonly fileId: FileId;
  readonly metrics: readonly MetricRecord[];
  readonly replace?: boolean;
};

export type CommitMetricsBatchInput = readonly CommitMetricsInput[];

export type CommitCalculatedRecordsInput = {
  readonly fileId: FileId;
  readonly curves: readonly CurveRecord[];
  readonly metrics: readonly MetricRecord[];
  readonly replaceCurveGenerations?: readonly CurveGeneration[];
  readonly replaceMetrics?: boolean;
};

export type CommitCalculatedRecordsBatchInput = readonly CommitCalculatedRecordsInput[];

export type SessionSnapshot = {
  readonly schemaVersion: 1;
  readonly sessionVersion: number;
  readonly filesById: Record<FileId, FileRecord>;
  readonly fileOrder: FileId[];
};

export type CommitFileImportResult = {
  readonly importedFileIds: readonly FileId[];
  readonly skippedDuplicateFileIds: readonly FileId[];
};

export type CommitFileImportRawTableAssessmentInput =
  Omit<RawTableAssessmentRecord, "assessmentRuleVersion" | "fileId" | "rawTableId" | "schemaProfileVersion" | "sourceRawTableVersion" | "templateCatalogVersion"> & {
    readonly fileId: FileId;
    readonly rawTableId?: string | null;
    readonly assessmentRuleVersion?: number;
    readonly schemaProfileVersion?: number;
    readonly templateCatalogVersion?: number;
  };

export type CommitFileImportOptions = {
  readonly rawTableAssessments?: readonly CommitFileImportRawTableAssessmentInput[];
};

export interface ISessionService {
  readonly _serviceBrand: undefined;
  readonly onDidChangeSession: Event<SessionChangeEvent>;

  readonly setMetricInput: (input: MetricInputRecord) => void;
  readonly clearMetricInput: (fileId: string, metricKey: MetricKey) => void;

  clearSession(): void;
  commitFileImport(result: FileImportResult, options?: CommitFileImportOptions): CommitFileImportResult;
  commitRawTableAssessment(assessment: RawTableAssessmentRecord): void;
  commitRawTableAssessments(assessments: readonly RawTableAssessmentRecord[]): void;
  commitSliceRuns(inputs: readonly SliceCommit[]): void;
  commitCalculatedRecordsBatch(inputs: CommitCalculatedRecordsBatchInput): void;
  commitCurves(input: CommitCurvesInput): void;
  commitCurvesBatch(inputs: CommitCurvesBatchInput): void;
  commitMetrics(input: CommitMetricsInput): void;
  commitMetricsBatch(inputs: CommitMetricsBatchInput): void;
  getSnapshot(): SessionSnapshot;
  renameFile(fileId: FileId, name: string): boolean;
  removeFiles(fileIds: readonly string[]): void;
}
