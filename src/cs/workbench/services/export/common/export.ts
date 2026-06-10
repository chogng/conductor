/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type { Event } from "src/cs/base/common/event";
import { createDecorator } from "src/cs/platform/instantiation/common/instantiation";
import type { SessionSnapshot } from "src/cs/workbench/services/session/common/session";
import type {
  FileId,
  FileRecord,
} from "src/cs/workbench/services/session/common/sessionModel";
import type {
  ProcessedEntry,
  ProcessedSeries,
} from "src/cs/workbench/services/session/common/sessionTypes";
import type {
  OriginDisplayRange,
  OriginZipExportResult,
} from "src/cs/workbench/services/origin/common/origin";
import type { OriginCurveExportSeriesOption } from "src/cs/workbench/services/export/common/exportModel";
import type {
  OriginExportContentKey,
  OriginExportMode,
  OriginExportPlan,
  OriginYAxisScaleMode,
} from "src/cs/workbench/services/export/common/originExport";

export const IExportService = createDecorator<IExportService>("exportService");

export const ExportViewId = "workbench.export";

export type OriginCanvasExportScope =
  | "current"
  | "all"
  | "selected"
  | "filtered";

export type OriginFilteredCanvasKind = "transfer" | "output";

export type OriginCurveExportMode = "all" | "select";

export type ExportState = {
  readonly originMode: OriginExportMode;
  readonly canvasScope: OriginCanvasExportScope;
  readonly filteredKind: OriginFilteredCanvasKind;
  readonly curveMode: OriginCurveExportMode;
  readonly selectedCurveKeys: readonly string[];
  readonly selectedContentKeys: readonly OriginExportContentKey[];
};

export type ExportStateSetter<T> = (value: T | ((previous: T) => T)) => void;

export type OriginExportAxisSettings = {
  readonly xUnitByFileId?: Readonly<Record<string, string>>;
  readonly yScaleByFileId?: Readonly<Record<string, OriginYAxisScaleMode | string>>;
  readonly yUnitByFileId?: Readonly<Record<string, string>>;
};

export type OriginExportSeriesLabelResolver = (
  fileId: string,
  seriesId: string,
  fallback: string,
  index: number,
) => string;

export type OriginExportPlanInput = {
  readonly activeFileId?: FileId | null;
  readonly axisSettings?: OriginExportAxisSettings;
  readonly resolveSeriesLabel?: OriginExportSeriesLabelResolver;
  readonly snapshot: SessionSnapshot;
};

export type OriginExportScopeModel = {
  readonly fileIds: readonly FileId[];
  readonly hasMixedYScales: boolean;
};

export type ExportViewState = {
  readonly curveOptions: OriginCurveExportSeriesOption[];
  readonly hasMixedExportYScales: boolean;
  readonly scopedFileIds: string[];
  readonly showFilteredCanvasKindSelect: boolean;
};

export type ExportViewStateInput = OriginExportPlanInput & {
  readonly activeFile?: ProcessedEntry | null;
  readonly activeFileRecord?: FileRecord | null;
  readonly resolveProcessedSeriesLabel?: (
    file: ProcessedEntry,
    series: ProcessedSeries,
    index: number,
  ) => string;
  readonly resolveRecordSeriesLabel?: (
    fileId: string,
    seriesId: string,
    fallback: string,
    index: number,
  ) => string;
};

export type OriginMutableRef<T> = {
  current: T;
};

export type OriginExportPayloadBuildOptions = {
  readonly omitRustEligibleCsvText?: boolean;
};

export type OriginExportExecutionContext = {
  readonly buildCsvExportRequest: (payload: unknown) => unknown;
  readonly buildPayloads: (
    options?: OriginExportPayloadBuildOptions,
  ) => OriginExportPlan;
  readonly exportOriginZipFallback: () => Promise<
    OriginZipExportResult | null | undefined
  >;
  readonly originAxisSettings: unknown;
  readonly originChartXRangeRef: OriginMutableRef<OriginDisplayRange | null>;
  readonly originChartYRangeRef: OriginMutableRef<
    (OriginDisplayRange & { mode: "linear" | "log" }) | null
  >;
  readonly originOpenPlotOptions: unknown;
  readonly showToast: (message: string, type?: unknown) => void;
};

export interface IExportService {
  readonly _serviceBrand: undefined;
  readonly onDidChangeExportState: Event<ExportState>;
  readonly onDidChangeExportViewState: Event<ExportViewState>;

  buildOriginExportPlan(input: OriginExportPlanInput): OriginExportPlan;
  createOriginExportScopeModel(input: OriginExportPlanInput): OriginExportScopeModel;
  getState(): ExportState;
  getViewState(): ExportViewState;
  updateOriginExportExecutionContext(input: OriginExportExecutionContext): void;
  updateViewState(input: ExportViewStateInput): ExportViewState;
  setOriginMode(mode: OriginExportMode): void;
  setCanvasScope: ExportStateSetter<OriginCanvasExportScope>;
  setFilteredKind: ExportStateSetter<OriginFilteredCanvasKind>;
  setCurveMode(mode: OriginCurveExportMode): void;
  setSelectedCurveKeys(curveKeys: readonly string[]): void;
  syncSelectedCurveKeys(availableCurveKeys: readonly string[]): void;
  setContentKeys: ExportStateSetter<readonly OriginExportContentKey[]>;
  exportOriginZip(
    options?: Pick<OriginExportExecutionContext, "exportOriginZipFallback" | "showToast">,
  ): Promise<void>;
  openInOrigin(options?: OriginExportExecutionContext): Promise<void>;
}
