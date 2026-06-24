/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type { Event } from "src/cs/base/common/event";
import { createDecorator } from "src/cs/platform/instantiation/common/instantiation";
import type {
  CurveRecord,
  CurveKey,
  BaseCurveFamily,
  ItCurveMode,
  IvCurveMode,
  RawTableRef,
  SeriesRecord,
  SheetId,
} from "src/cs/workbench/services/session/common/sessionModel";
import type { Template } from "src/cs/workbench/services/template/common/templateSpec";
import type {
  TemplateSelection,
  TemplateSelectionsByFileId,
} from "src/cs/workbench/services/slice/common/templateSelection";
import type { ReviewedTemplate } from "src/cs/workbench/services/review/common/review";

export const ISliceService = createDecorator<ISliceService>("sliceService");
export const AutoSliceContributionId = "workbench.services.slice.auto";
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

export type SliceRequest = {
  readonly id: string;
  readonly ref: RawTableRef;
  readonly sourceRawTableVersion: number;
  readonly reviewedTemplate: ReviewedTemplate;
  readonly trigger: SliceRequestTrigger;
  readonly requestSignature: string;
  readonly createdAt: number;
};

export type SliceRun = {
  readonly id: SliceRunId;
  readonly fileId: string;
  readonly rawTableId: SheetId;
  readonly mode: "auto" | "manual";
  readonly selection: TemplateSelection;
  readonly sourceRawTableVersion: number;
  readonly sourceTableFactsSignature?: string;
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

export type SlicePlan = {
  readonly ref: RawTableRef;
  readonly mode: SliceRun["mode"];
  readonly selection: TemplateSelection;
  readonly sourceRawTableVersion: number;
  readonly sourceTableFactsSignature?: string;
  readonly measurement?: SliceMeasurementBinding;
  readonly template: Template;
  readonly templateFingerprint: string;
  readonly blocks: readonly SlicePlanBlock[];
  readonly inputRanges: readonly SliceRawTableRangeRef[];
  readonly warnings: readonly string[];
  readonly errors: readonly string[];
};

export type SlicePlanBlock = {
  readonly blockIndex: number;
  readonly inputRange: SliceRawTableRangeRef;
  readonly xColumns: readonly number[];
  readonly yColumns: readonly number[];
};

export type CreateSlicePlanInput = {
  readonly ref: RawTableRef;
  readonly mode: SliceRun["mode"];
  readonly selection: TemplateSelection;
  readonly sourceRawTableVersion: number;
  readonly sourceTableFactsSignature?: string;
  readonly measurement?: SliceMeasurementBinding;
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

export type RunSliceWithTemplateInput = {
  readonly ref: RawTableRef;
  readonly selection: TemplateSelection;
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

  getState(): SliceState;
  submit(requests: readonly SliceRequest[]): void;
  enqueueAuto(refs: readonly RawTableRef[]): void;
  runWithTemplate(input: RunSliceWithTemplateInput): void;
  prioritize(fileId: string): void;
  cancel(fileIds?: readonly string[]): void;
  setTemplateSelection(fileId: string, selection: TemplateSelection): void;
}
