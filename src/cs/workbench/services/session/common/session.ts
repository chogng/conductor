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
  FileKind,
  MetricInputRecord,
  MetricKey,
  MetricRecord,
  RawTableRecord,
} from "src/cs/workbench/services/session/common/sessionModel";
import type { SessionChangeEvent } from "src/cs/workbench/services/session/common/sessionEvents";
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

export type FileImportDiagnosticSeverity = "info" | "warning" | "error";

export type FileImportDiagnostic = {
  readonly severity: FileImportDiagnosticSeverity;
  readonly code: string;
  readonly message: string;
  readonly sourceName?: string | null;
};

export type RawImportRecord = {
  readonly fileId: string;
  readonly fileName: string;
  readonly rawFile?: unknown;
  readonly size?: number;
  readonly lastModified?: number;
  readonly rawKey?: string;
  readonly relativePath?: string | null;
  readonly filePath?: string | null;
  readonly rawTablesById: Readonly<Record<string, RawTableRecord>>;
  readonly rawTableOrder: readonly string[];
};

export type ImportedFileRecord = {
  readonly id: string;
  readonly name: string;
  readonly kind: FileKind;
  readonly raw: RawImportRecord;
};

export type FileImportResult = {
  readonly files: readonly ImportedFileRecord[];
  readonly diagnostics: readonly FileImportDiagnostic[];
  readonly createdAt: number;
};

export interface ISessionService {
  readonly _serviceBrand: undefined;
  readonly onDidChangeSession: Event<SessionChangeEvent>;

  readonly setMetricInput: (input: MetricInputRecord) => void;
  readonly clearMetricInput: (fileId: string, metricKey: MetricKey) => void;

  clearSession(): void;
  commitFileImport(result: FileImportResult): CommitFileImportResult;
  commitSliceRuns(inputs: readonly SliceCommit[]): void;
  commitCurves(input: CommitCurvesInput): void;
  commitCurvesBatch(inputs: CommitCurvesBatchInput): void;
  commitMetrics(input: CommitMetricsInput): void;
  commitMetricsBatch(inputs: CommitMetricsBatchInput): void;
  getSnapshot(): SessionSnapshot;
  renameFile(fileId: FileId, name: string): boolean;
  removeFiles(fileIds: readonly string[]): void;
}
