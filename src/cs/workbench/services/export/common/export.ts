/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type { Event } from "src/cs/base/common/event";
import type { URI } from "src/cs/base/common/uri";
import { createDecorator } from "src/cs/platform/instantiation/common/instantiation";
import type {
  OriginCurveExportSeriesOption,
} from "src/cs/workbench/services/export/common/exportModel";
import type {
  OriginExportContentKey,
  OriginExportMode,
  OriginExportPlan,
} from "src/cs/workbench/services/export/common/originExport";

export const IExportService = createDecorator<IExportService>("exportService");

export const ExportContributionId = "workbench.contrib.export";
export const ExportViewContainerId = "workbench.viewContainer.export";
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

export type OriginExportPlanInput = {
  readonly activeResource?: URI | null;
  readonly activeSheetId?: string | null;
  readonly resources: readonly ExportResourceIdentity[];
};

export type ExportResourceIdentity = {
  readonly resource: URI;
  readonly sheetId?: string | null;
};

export type ExportViewState = {
  readonly curveOptions: OriginCurveExportSeriesOption[];
  readonly hasMixedExportYScales: boolean;
  readonly showFilteredCanvasKindSelect: boolean;
};

export type ExportViewStateInput = OriginExportPlanInput;

export interface IExportService {
  readonly _serviceBrand: undefined;
  readonly onDidChangeExportState: Event<ExportState>;
  readonly onDidChangeExportViewState: Event<ExportViewState>;

  buildOriginExportPlan(input: OriginExportPlanInput): OriginExportPlan;
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
