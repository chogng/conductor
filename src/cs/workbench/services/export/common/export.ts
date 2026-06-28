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
  OriginCurveExportSeriesOption,
} from "src/cs/workbench/services/export/common/exportModel";
import type {
  OriginExportContentKey,
  OriginExportMode,
  OriginExportPlan,
  OriginYAxisScaleMode,
} from "src/cs/workbench/services/export/common/originExport";

export const IExportService = createDecorator<IExportService>("exportService");

export const ExportContributionId = "workbench.contrib.export";
export const ExportViewId = "workbench.export";

export const ExportCommandId = {
	exportOriginZip: "workbench.action.exportOriginZip",
	openInOrigin: "workbench.action.openInOrigin",
	showExport: "workbench.action.showExport",
} as const;

export type ExportCommandId = typeof ExportCommandId[keyof typeof ExportCommandId];

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

export type OriginExportPlanInput = {
  readonly activeFileId?: FileId | null;
  readonly axisSettings?: OriginExportAxisSettings;
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
  readonly activeFileRecord?: FileRecord | null;
};

export interface IExportService {
  readonly _serviceBrand: undefined;
  readonly onDidChangeExportState: Event<ExportState>;
  readonly onDidChangeExportViewState: Event<ExportViewState>;

  buildOriginExportPlan(input: OriginExportPlanInput): OriginExportPlan;
  createOriginExportScopeModel(input: OriginExportPlanInput): OriginExportScopeModel;
  getState(): ExportState;
  getViewState(): ExportViewState;
  updateViewState(input: ExportViewStateInput): ExportViewState;
  setOriginMode(mode: OriginExportMode): void;
  setCanvasScope: ExportStateSetter<OriginCanvasExportScope>;
  setFilteredKind: ExportStateSetter<OriginFilteredCanvasKind>;
  setCurveMode(mode: OriginCurveExportMode): void;
  setSelectedCurveKeys(curveKeys: readonly string[]): void;
  syncSelectedCurveKeys(availableCurveKeys: readonly string[]): void;
  setContentKeys: ExportStateSetter<readonly OriginExportContentKey[]>;
  exportOriginZip(): Promise<void>;
  openInOrigin(): Promise<void>;
}
