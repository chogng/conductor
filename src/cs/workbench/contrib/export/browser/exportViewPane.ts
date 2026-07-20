/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { replaceChildrenIfChanged } from "src/cs/base/browser/dom";
import { localize } from "src/cs/nls";
import { ViewPane } from "src/cs/workbench/browser/parts/views/viewPane";
import {
  createOriginExportToolbar,
  type OriginExportToolbarElement,
  type OriginExportToolbarProps,
} from "src/cs/workbench/contrib/export/browser/OriginExportToolbar";
import {
  ExportViewId,
  IExportService,
  type ExportViewState,
} from "src/cs/workbench/services/export/common/export";
import { ORIGIN_EXPORT_CONTENT_OPTIONS } from "src/cs/workbench/services/export/common/exportModel";

import "src/cs/workbench/contrib/export/browser/media/export.css";
import "src/cs/workbench/browser/parts/views/media/views.css";

export type ExportViewOptions = OriginExportToolbarProps;

export class ExportViewPane extends ViewPane {
  private readonly pane = document.createElement("div");
  private readonly view = document.createElement("div");
  private readonly content = document.createElement("div");
  private currentToolbar: OriginExportToolbarElement | null = null;

  constructor(
    @IExportService private readonly exportService: IExportService,
  ) {
    super({
      id: ExportViewId,
      title: localize("chart.views.export", "Export"),
      className: "auxiliarybar_view_pane export_view_pane",
      bodyClassName: "workbench-part-view-pane__body",
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
      resolvedCurveExportMode: exportState.curveMode,
      selectedContentKeys: [...exportState.selectedContentKeys],
      selectedCurveOptionKeySet: new Set(exportState.selectedCurveKeys),
      setContentKeys: value => {
        if (typeof value === "function") {
          this.exportService.setContentKeys(previous => value([...previous]));
          return;
        }
        this.exportService.setContentKeys(value);
      },
      setOriginCanvasExportScope: this.exportService.setCanvasScope,
      setOriginFilteredCanvasKind: this.exportService.setFilteredKind,
      setResolvedCurveExportMode: next => this.exportService.setCurveMode(next),
      showFilteredCanvasKindSelect: viewState.showFilteredCanvasKindSelect,
    });
  }

  render(options: ExportViewOptions): void {
    if (!this.currentToolbar) {
      this.currentToolbar = createOriginExportToolbar(options);
    } else {
      this.currentToolbar.update(options);
    }
    replaceChildrenIfChanged(this.content, this.currentToolbar);
  }

  renderEmpty(_message: string): void {
    this.currentToolbar?.dispose();
    this.currentToolbar = null;
    this.content.replaceChildren();
  }

  public override dispose(): void {
    this.currentToolbar?.dispose();
    this.currentToolbar = null;
    this.content.replaceChildren();
    this.pane.remove();
    super.dispose();
  }
}
