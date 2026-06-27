/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type { Event } from "src/cs/base/common/event";
import type { URI } from "src/cs/base/common/uri";
import { createDecorator } from "src/cs/platform/instantiation/common/instantiation";
import type {
  CurveRecord,
  CurveKey,
  BaseCurveRecord,
  BaseCurveFamily,
  CurveLineage,
  ItCurveMode,
  IvCurveMode,
  SeriesRecord,
  SeriesId,
  SheetId,
} from "src/cs/workbench/services/session/common/sessionModel";
import type { Template } from "src/cs/workbench/services/template/common/templateSpec";
import type {
  TemplateSelection,
  TemplateSelectionsByFileId,
} from "src/cs/workbench/services/slice/common/templateSelection";
import type { ReviewedTemplate } from "src/cs/workbench/services/review/common/reviewModel";

export const ISliceService = createDecorator<ISliceService>("sliceService");
export const SlicePriorityContributionId = "workbench.services.slice.priority";

export type SliceRunId = string;

export type SliceRequestTrigger =
  | {
      readonly kind: "reviewDecision";
      readonly reviewSignature: string;
      readonly submittedBy: "system";
    }
  | {
      readonly kind: "userCommand";
      readonly commandId?: string;
      readonly submittedBy: "user";
    }
  | {
      readonly kind: "batchCommand";
      readonly batchId: string;
      readonly submittedBy: "user";
    }
  | {
      readonly kind: "rerun";
      readonly previousRunId: string;
      readonly submittedBy: "user" | "system";
    };

export type SliceUriTarget = {
  readonly resource: URI;
  readonly sheetId?: SheetId | null;
};

export type SliceUriRequest = {
  readonly id: string;
  readonly target: SliceUriTarget;
  readonly reviewedTemplate: ReviewedTemplate;
  readonly reviewSignature: string;
  readonly trigger: SliceRequestTrigger;
  readonly requestSignature: string;
  readonly createdAt: number;
  readonly rowCount: number;
  readonly columnCount: number;
  readonly sourceTableModelSignature: string;
  readonly sourceModelVersion: number;
  readonly sourceVersion: number;
};

export type SliceRun = {
  readonly id: SliceRunId;
  readonly fileId: string;
  readonly rawTableId: SheetId;
  readonly mode: "auto" | "manual";
  readonly selection: TemplateSelection;
  readonly sourceRawTableVersion: number;
  readonly sourceTableModelSignature?: string;
  readonly template: Template;
  readonly templateFingerprint: string;
  readonly inputRanges: readonly SliceRawTableRangeRef[];
  readonly outputSeriesIds: readonly string[];
  readonly outputCurveKeys: readonly CurveKey[];
  readonly warnings: readonly string[];
  readonly errors: readonly string[];
};

export type SliceRawTableRangeRef = {
  readonly fileId: string;
  readonly rawTableId: SheetId;
  readonly range: SliceRangeRef;
};

export type SliceRangeRef = {
  readonly startRow: number;
  readonly endRow: number;
  readonly startCol: number;
  readonly endCol: number;
};

export type SliceCommit = {
  readonly run: SliceRun;
  readonly series: readonly SeriesRecord[];
  readonly curves: readonly CurveRecord[];
};

export type SliceUriRangeRef = {
  readonly resource: URI;
  readonly sheetId?: SheetId | null;
  readonly range: SliceRangeRef;
};

export type SlicePlanTarget =
  {
    readonly kind: "uri";
    readonly target: SliceUriTarget;
  };

export type SlicePlanRangeRef = SliceUriRangeRef;

export type SliceExecutionRun = Omit<SliceRun, "fileId" | "inputRanges" | "rawTableId" | "sourceRawTableVersion"> & {
  readonly inputRanges: readonly SlicePlanRangeRef[];
};

export type SliceExecutionSeriesRecord = Omit<SeriesRecord, "fileId" | "sheetId">;

export type SliceExecutionBaseCurveRecord = Omit<BaseCurveRecord, "fileId" | "lineage"> & {
  readonly lineage: Omit<Extract<CurveLineage, { readonly curveGeneration: "base" }>, "baseSeries"> & {
    readonly baseSeries: {
      readonly seriesId: SeriesId;
    };
  };
};

export type SliceExecutionCurveRecord = SliceExecutionBaseCurveRecord;

export type SliceExecutionResult = {
  readonly run: SliceExecutionRun;
  readonly series: readonly SliceExecutionSeriesRecord[];
  readonly curves: readonly SliceExecutionCurveRecord[];
};

export type SliceUriRun = Omit<SliceExecutionRun, "inputRanges"> & {
  readonly resource: URI;
  readonly sheetId?: SheetId | null;
  readonly inputRanges: readonly SliceUriRangeRef[];
};

export type SliceUriSeriesRecord = Omit<SeriesRecord, "fileId" | "sheetId"> & {
  readonly resource: URI;
  readonly sheetId?: SheetId | null;
};

export type SliceUriBaseCurveRecord = Omit<BaseCurveRecord, "fileId" | "lineage"> & {
  readonly resource: URI;
  readonly sheetId?: SheetId | null;
  readonly lineage: Omit<Extract<CurveLineage, { curveGeneration: "base" }>, "baseSeries"> & {
    readonly baseSeries: {
      readonly resource: URI;
      readonly sheetId?: SheetId | null;
      readonly seriesId: SeriesId;
    };
  };
};

export type SliceUriCurveRecord = SliceUriBaseCurveRecord;

export type SliceUriResult = {
  readonly target: SliceUriTarget;
  readonly run: SliceUriRun;
  readonly series: readonly SliceUriSeriesRecord[];
  readonly curves: readonly SliceUriCurveRecord[];
  readonly requestSignature: string;
  readonly sourceModelVersion: number;
  readonly sourceVersion: number;
  readonly completedAt: number;
};

export type SlicePlan = {
  readonly target: SlicePlanTarget;
  readonly mode: SliceRun["mode"];
  readonly selection: TemplateSelection;
  readonly sourceVersion?: number;
  readonly sourceTableModelSignature?: string;
  readonly measurement?: SliceMeasurementBinding;
  readonly template: Template;
  readonly templateFingerprint: string;
  readonly blocks: readonly SlicePlanBlock[];
  readonly inputRanges: readonly SlicePlanRangeRef[];
  readonly warnings: readonly string[];
  readonly errors: readonly string[];
};

export type SlicePlanBlock = {
  readonly blockIndex: number;
  readonly inputRange: SlicePlanRangeRef;
  readonly segmentIndex?: number;
  readonly xColumns: readonly number[];
  readonly yColumns: readonly number[];
};

export type CreateSlicePlanInput = {
  readonly target: SlicePlanTarget;
  readonly mode: SliceRun["mode"];
  readonly selection: TemplateSelection;
  readonly sourceVersion?: number;
  readonly sourceTableModelSignature?: string;
  readonly template: Template;
  readonly templateFingerprint?: string;
  readonly rowCount: number;
  readonly columnCount: number;
};

export type SliceMeasurementBinding = {
  readonly curveFamily: BaseCurveFamily;
  readonly ivMode?: IvCurveMode | null;
  readonly itMode?: ItCurveMode | null;
};

export type SliceFileState =
  | { readonly state: "none" }
  | { readonly state: "queued" }
  | { readonly state: "processing" }
  | { readonly state: "ready" }
  | { readonly state: "skipped"; readonly code: string; readonly message: string }
  | { readonly state: "failed"; readonly code: string; readonly message: string };

export type SliceState = {
  readonly fileStates: ReadonlyMap<string, SliceFileState>;
  readonly queueLength: number;
  readonly activeFileId: string | null;
  readonly templateSelectionsByFileId: TemplateSelectionsByFileId;
};

export interface ISliceService {
  readonly _serviceBrand: undefined;

  readonly onDidChangeSliceState: Event<void>;
  readonly onDidChangeUriSliceResult: Event<SliceUriTarget>;

  getState(): SliceState;
  getUriResult(target: SliceUriTarget): SliceUriResult | null;
  getUriState(target: SliceUriTarget): SliceFileState | undefined;
  submitUri(requests: readonly SliceUriRequest[]): void;
  prioritizeUri(target: SliceUriTarget): void;
  cancel(fileIds?: readonly string[]): void;
  cancelUri(targets: readonly SliceUriTarget[]): void;
  setTemplateSelection(fileId: string, selection: TemplateSelection): void;
}
