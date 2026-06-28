/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type { Event } from "src/cs/base/common/event";
import type { URI } from "src/cs/base/common/uri";
import { createDecorator } from "src/cs/platform/instantiation/common/instantiation";
import type { Template } from "src/cs/workbench/services/template/common/templateSpec";
import type {
  TemplateSelection,
  TemplateSelectionsByFileId,
} from "src/cs/workbench/services/slice/common/templateSelection";
import type { ReviewedTemplate } from "src/cs/workbench/services/review/common/reviewModel";

export const ISliceService = createDecorator<ISliceService>("sliceService");
export const SlicePriorityContributionId = "workbench.services.slice.priority";

export type SliceRunId = string;
export type SliceFileId = string;
export type SliceSheetId = string;
export type SliceSeriesId = string;
export type SliceBaseCurveFamily = "iv" | "cv" | "cf" | "pv" | "it";
export type SliceIvCurveMode = "transfer" | "output";
export type SliceItCurveMode =
  | "stability"
  | "transient"
  | "retention"
  | "biasStress"
  | "photoResponse"
  | "generic";
export type SliceDerivedCurveFamily =
  | "gm"
  | "localSs"
  | "thresholdFit"
  | "subthresholdFit";
export type SliceSecondDerivedCurveFamily = "secondDerivative";
export type SliceCurveKey =
  | `base:${SliceBaseCurveFamily}:${SliceIvCurveMode | SliceItCurveMode | "default"}:${SliceSeriesId}`
  | `derived:${SliceDerivedCurveFamily}:default:${SliceSeriesId}`
  | `secondDerived:${SliceSecondDerivedCurveFamily}:default:${SliceSeriesId}`;

export type SliceCurvePoint = {
  readonly x: number;
  readonly y: number;
};

export type SliceCurveChannelsRecord = {
  readonly yPositive?: readonly number[];
  readonly yAbsPositive?: readonly number[];
  readonly yLog10Abs?: readonly number[];
};

export type SliceDomainRecord = {
  readonly x?: readonly [number, number];
  readonly y?: readonly [number, number];
  readonly yPositive?: readonly [number, number];
  readonly yAbsPositive?: readonly [number, number];
  readonly yLog10Abs?: readonly [number, number];
};

export type SliceSeriesRecord = {
  readonly fileId: SliceFileId;
  readonly sheetId?: SliceSheetId;
  readonly id: SliceSeriesId;
  readonly name?: string;
  readonly legendValue?: string;
  readonly groupIndex: number;
  readonly yCol?: number;
  readonly y: readonly number[];
  readonly labelOverride?: string;
};

export type SliceCurveLineage =
  | {
      readonly curveGeneration: "base";
      readonly baseFamily: SliceBaseCurveFamily;
      readonly ivMode?: SliceIvCurveMode | null;
      readonly itMode?: SliceItCurveMode | null;
      readonly baseSeries: { readonly fileId: SliceFileId; readonly seriesId: SliceSeriesId };
    }
  | {
      readonly curveGeneration: "derived";
      readonly derivedFamily: SliceDerivedCurveFamily;
      readonly inputCurve: SliceCurveRef;
    }
  | {
      readonly curveGeneration: "secondDerived";
      readonly secondDerivedFamily: SliceSecondDerivedCurveFamily;
      readonly inputCurve: SliceCurveRef;
    };

export type SliceCurveRef = {
  readonly fileId: SliceFileId;
  readonly seriesId: SliceSeriesId;
  readonly curveKey: SliceCurveKey;
  readonly signature: string;
};

export type SliceBaseCurveRecord = {
  readonly fileId: SliceFileId;
  readonly seriesId: SliceSeriesId;
  readonly curveGeneration: "base";
  readonly curveFamily: SliceBaseCurveFamily;
  readonly ivMode?: SliceIvCurveMode | null;
  readonly itMode?: SliceItCurveMode | null;
  readonly lineage: Extract<SliceCurveLineage, { readonly curveGeneration: "base" }>;
  readonly points: readonly SliceCurvePoint[];
  readonly channels?: SliceCurveChannelsRecord;
  readonly domain?: SliceDomainRecord;
  readonly signature: string;
};

export type SliceDerivedCurveRecord = {
  readonly fileId: SliceFileId;
  readonly seriesId: SliceSeriesId;
  readonly curveGeneration: "derived";
  readonly curveFamily: SliceDerivedCurveFamily;
  readonly ivMode?: never;
  readonly itMode?: never;
  readonly lineage: Extract<SliceCurveLineage, { readonly curveGeneration: "derived" }>;
  readonly points: readonly SliceCurvePoint[];
  readonly channels?: SliceCurveChannelsRecord;
  readonly domain?: SliceDomainRecord;
  readonly signature: string;
};

export type SliceSecondDerivedCurveRecord = {
  readonly fileId: SliceFileId;
  readonly seriesId: SliceSeriesId;
  readonly curveGeneration: "secondDerived";
  readonly curveFamily: SliceSecondDerivedCurveFamily;
  readonly ivMode?: never;
  readonly itMode?: never;
  readonly lineage: Extract<SliceCurveLineage, { readonly curveGeneration: "secondDerived" }>;
  readonly points: readonly SliceCurvePoint[];
  readonly channels?: SliceCurveChannelsRecord;
  readonly domain?: SliceDomainRecord;
  readonly signature: string;
};

export type SliceCurveRecord =
  | SliceBaseCurveRecord
  | SliceDerivedCurveRecord
  | SliceSecondDerivedCurveRecord;

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
  readonly sheetId?: SliceSheetId | null;
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
  readonly sourceContentSignature: string;
  readonly sourceModelVersion: number;
  readonly sourceVersion: number;
};

export type SliceRun = {
  readonly id: SliceRunId;
  readonly fileId: string;
  readonly rawTableId: SliceSheetId;
  readonly mode: "auto" | "manual";
  readonly selection: TemplateSelection;
  readonly sourceRawTableVersion: number;
  readonly sourceContentSignature?: string;
  readonly template: Template;
  readonly templateFingerprint: string;
  readonly inputRanges: readonly SliceRawTableRangeRef[];
  readonly outputSeriesIds: readonly string[];
  readonly outputCurveKeys: readonly SliceCurveKey[];
  readonly warnings: readonly string[];
  readonly errors: readonly string[];
};

export type SliceRawTableRangeRef = {
  readonly fileId: string;
  readonly rawTableId: SliceSheetId;
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
  readonly series: readonly SliceSeriesRecord[];
  readonly curves: readonly SliceCurveRecord[];
};

export type SliceUriRangeRef = {
  readonly resource: URI;
  readonly sheetId?: SliceSheetId | null;
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

export type SliceExecutionSeriesRecord = Omit<SliceSeriesRecord, "fileId" | "sheetId">;

export type SliceExecutionBaseCurveRecord = Omit<SliceBaseCurveRecord, "fileId" | "lineage"> & {
  readonly lineage: Omit<Extract<SliceCurveLineage, { readonly curveGeneration: "base" }>, "baseSeries"> & {
    readonly baseSeries: {
      readonly seriesId: SliceSeriesId;
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
  readonly sheetId?: SliceSheetId | null;
  readonly inputRanges: readonly SliceUriRangeRef[];
};

export type SliceUriSeriesRecord = Omit<SliceSeriesRecord, "fileId" | "sheetId"> & {
  readonly resource: URI;
  readonly sheetId?: SliceSheetId | null;
};

export type SliceUriBaseCurveRecord = Omit<SliceBaseCurveRecord, "fileId" | "lineage"> & {
  readonly resource: URI;
  readonly sheetId?: SliceSheetId | null;
  readonly lineage: Omit<Extract<SliceCurveLineage, { curveGeneration: "base" }>, "baseSeries"> & {
    readonly baseSeries: {
      readonly resource: URI;
      readonly sheetId?: SliceSheetId | null;
      readonly seriesId: SliceSeriesId;
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
  readonly sourceContentSignature?: string;
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
  readonly sourceContentSignature?: string;
  readonly template: Template;
  readonly templateFingerprint?: string;
  readonly rowCount: number;
  readonly columnCount: number;
};

export type SliceMeasurementBinding = {
  readonly curveFamily: SliceBaseCurveFamily;
  readonly ivMode?: SliceIvCurveMode | null;
  readonly itMode?: SliceItCurveMode | null;
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
