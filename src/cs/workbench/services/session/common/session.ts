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
  CalculationCacheRecord,
  CurveGeneration,
  CurveRecord,
  FileId,
  FileRecord,
  MetricInputRecord,
  MetricKey,
  MetricRecord,
  SeriesId,
  SeriesRecord,
  TemplateRunRecord,
} from "src/cs/workbench/services/session/common/sessionModel";
import type { TemplateSelectionRecord } from "src/cs/workbench/services/template/common/templateRun";
import type { SessionChangeEvent } from "src/cs/workbench/services/session/common/sessionEvents";
import type { FileImportResult } from "src/cs/workbench/services/files/common/files";
import type { RawTableAssessmentRecord } from "src/cs/workbench/services/assessment/common/assessment";

export const ISessionService = createDecorator<ISessionService>("sessionService");

export type CommitTemplateOutputOptions = {
  readonly appliedTemplateConfig?: unknown;
  readonly appliedTemplateSelection?: TemplateSelectionRecord;
};

export type CommitTemplateRunInput =
  | TemplateRunRecord
  | {
      readonly kind: "clearTemplateOutput";
      readonly fileIds?: readonly FileId[];
    }
  | {
      readonly run: TemplateRunRecord;
      readonly calculationCache?: CalculationCacheRecord;
      readonly fileName?: string;
      readonly seriesById?: Readonly<Record<SeriesId, SeriesRecord>>;
      readonly seriesOrder?: readonly SeriesId[];
    };

export type CommitCurvesInput = {
  readonly fileId: FileId;
  readonly curves: readonly CurveRecord[];
  readonly replace?: boolean;
  readonly replaceGenerations?: readonly CurveGeneration[];
};

export type CommitMetricsInput = {
  readonly fileId: FileId;
  readonly metrics: readonly MetricRecord[];
  readonly replace?: boolean;
};

export type SessionSnapshot = {
  readonly schemaVersion: 1;
  readonly sessionVersion: number;
  readonly filesById: Record<FileId, FileRecord>;
  readonly fileOrder: FileId[];
};

export interface ISessionService {
  readonly _serviceBrand: undefined;
  readonly onDidChangeSession: Event<SessionChangeEvent>;

  readonly setMetricInput: (input: MetricInputRecord) => void;
  readonly clearMetricInput: (fileId: string, metricKey: MetricKey) => void;

  clearSession(): void;
  commitFileImport(result: FileImportResult): void;
  commitRawTableAssessment(assessment: RawTableAssessmentRecord): void;
  commitTemplateRun(input: CommitTemplateRunInput): void;
  commitCurves(input: CommitCurvesInput): void;
  commitMetrics(input: CommitMetricsInput): void;
  getSnapshot(): SessionSnapshot;
  removeFiles(fileIds: readonly string[]): void;
}

