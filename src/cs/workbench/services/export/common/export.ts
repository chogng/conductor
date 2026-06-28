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
