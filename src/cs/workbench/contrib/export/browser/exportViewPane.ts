import { DisposableStore } from "src/cs/base/common/lifecycle";
import { localize } from "src/cs/nls";
import { ViewPane } from "src/cs/workbench/browser/parts/views/viewPane";
import OriginExportToolbar, {
  type OriginCurveExportSeriesOption,
  type OriginExportContentOption,
  type ReplaceMatchingOriginSeriesAcrossFilesFn,
} from "src/cs/workbench/contrib/export/browser/OriginExportToolbar";
import type {
  OriginCanvasExportScope,
  OriginCurveExportMode,
  OriginFilteredCanvasKind,
} from "src/cs/workbench/contrib/export/browser/originCanvasExport";
import type {
  OriginExportContentKey,
  OriginExportMode,
} from "src/cs/workbench/contrib/export/common/originSelectionExport";
import { ExportViewId } from "src/cs/workbench/contrib/export/common/export";

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

  constructor() {
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
