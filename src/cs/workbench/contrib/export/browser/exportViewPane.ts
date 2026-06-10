/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore } from "src/cs/base/common/lifecycle";
import { localize } from "src/cs/nls";
import { ViewPane } from "src/cs/workbench/browser/parts/views/viewPane";
import OriginExportToolbar, {
  type ReplaceMatchingOriginSeriesAcrossFilesFn,
} from "src/cs/workbench/contrib/export/browser/OriginExportToolbar";
import {
  ExportViewId,
  IExportService,
  type ExportViewState,
  type IExportService as IExportServiceType,
  OriginCanvasExportScope,
  OriginCurveExportMode,
  OriginFilteredCanvasKind,
} from "src/cs/workbench/services/export/common/export";
import type {
  OriginCurveExportSeriesOption,
  OriginExportContentOption,
} from "src/cs/workbench/services/export/common/exportModel";
import { ORIGIN_EXPORT_CONTENT_OPTIONS } from "src/cs/workbench/services/export/common/exportModel";
import type {
  OriginExportContentKey,
  OriginExportMode,
} from "src/cs/workbench/services/export/common/originExport";

import "src/cs/workbench/contrib/export/browser/media/export.css";
import "src/cs/workbench/browser/parts/views/media/views.css";

type StateSetter<T> = (value: T | ((previous: T) => T)) => void;

export type ExportViewOptions = {
  curveOptions: OriginCurveExportSeriesOption[];
  hasMixedExportYScales: boolean;
  mode: OriginExportMode;
  onExportOriginZip: () => void | Promise<void>;
  onModeChange: (next: OriginExportMode) => void;
  onOpenInOrigin: () => void | Promise<void>;
  onSelectedCurveOptionKeysChange: (nextKeys: string[]) => void;
  originCanvasExportScope: OriginCanvasExportScope;
  originExportContentOptions: OriginExportContentOption[];
  originFilteredCanvasKind: OriginFilteredCanvasKind;
  replaceMatchingOriginSeriesAcrossFiles: ReplaceMatchingOriginSeriesAcrossFilesFn;
  resolvedCurveExportMode: OriginCurveExportMode;
  scopedFileIds: string[];
  selectedContentKeys: OriginExportContentKey[];
  selectedCurveOptionKeySet: Set<string>;
  setContentKeys: StateSetter<OriginExportContentKey[]>;
  setOriginCanvasExportScope: StateSetter<OriginCanvasExportScope>;
  setOriginFilteredCanvasKind: StateSetter<OriginFilteredCanvasKind>;
  setResolvedCurveExportMode: (next: OriginCurveExportMode) => void;
  showFilteredCanvasKindSelect: boolean;
};

export class ExportViewPane extends ViewPane {
  private readonly toolbarStore = new DisposableStore();
  private readonly pane = document.createElement("div");
  private readonly view = document.createElement("div");
  private readonly content = document.createElement("div");

  constructor(
    @IExportService private readonly exportService: IExportServiceType,
  ) {
    super({
      id: ExportViewId,
      title: localize("analysis_views_export", "Export"),
      className: "auxiliarybar_view_pane export_view_pane",
      bodyClassName: "workbench-part-view-pane__body",
      headerVisible: false,
    });
    this.pane.className = "export_pane";
    this.view.className = "export_view";
    this.content.className = "export_view_content";
    this.view.append(this.content);
    this.pane.append(this.view);
    this.body.append(this.pane);
    this._register(this.exportService.onDidChangeExportViewState(state => {
      this.renderViewState(state);
    }));
    this._register(this.exportService.onDidChangeExportState(() => {
      this.renderViewState(this.exportService.getViewState());
    }));
    this.renderViewState(this.exportService.getViewState());
  }

  private renderViewState(viewState: ExportViewState): void {
    const exportState = this.exportService.getState();
    this.render({
      curveOptions: viewState.curveOptions,
      hasMixedExportYScales: viewState.hasMixedExportYScales,
      mode: exportState.originMode,
      onExportOriginZip: () => this.exportService.exportOriginZip(),
      onModeChange: next => this.exportService.setOriginMode(next),
      onOpenInOrigin: () => this.exportService.openInOrigin(),
      onSelectedCurveOptionKeysChange: nextKeys => {
        this.exportService.setSelectedCurveKeys(nextKeys);
      },
      originCanvasExportScope: exportState.canvasScope,
      originExportContentOptions: ORIGIN_EXPORT_CONTENT_OPTIONS,
      originFilteredCanvasKind: exportState.filteredKind,
      replaceMatchingOriginSeriesAcrossFiles: () => ({
        matchedFileCount: 0,
        matchedSeriesCount: 0,
      }),
      resolvedCurveExportMode: exportState.curveMode,
      scopedFileIds: viewState.scopedFileIds,
      selectedContentKeys: [...exportState.selectedContentKeys],
      selectedCurveOptionKeySet: new Set(exportState.selectedCurveKeys),
      setContentKeys: this.exportService.setContentKeys,
      setOriginCanvasExportScope: this.exportService.setCanvasScope,
      setOriginFilteredCanvasKind: this.exportService.setFilteredKind,
      setResolvedCurveExportMode: next => this.exportService.setCurveMode(next),
      showFilteredCanvasKindSelect: viewState.showFilteredCanvasKindSelect,
    });
  }

  render(options: ExportViewOptions): void {
    this.toolbarStore.clear();
    this.content.replaceChildren(OriginExportToolbar({
      ...options,
      store: this.toolbarStore,
    }));
  }

  renderEmpty(_message: string): void {
    this.toolbarStore.clear();
    this.content.replaceChildren();
  }

  public override dispose(): void {
    this.toolbarStore.dispose();
    this.content.replaceChildren();
    this.pane.remove();
    super.dispose();
  }
}
