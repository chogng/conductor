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
import "src/cs/workbench/browser/parts/views/media/secondaryViews.css";

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

export class ExportView extends ViewPane {
  private readonly toolbarStore = new DisposableStore();

  constructor() {
    super({
      id: ExportViewId,
      title: localize("da_analysis_views_export", "Export"),
      className: "secondary_view_pane",
      bodyClassName: "workbench-part-view-pane__body secondary_views_body",
      headerVisible: false,
    });
  }

  render(options: ExportViewOptions): void {
    this.toolbarStore.clear();
    this.body.replaceChildren(OriginExportToolbar({
      ...options,
      store: this.toolbarStore,
    }));
  }

  renderEmpty(message: string): void {
    this.toolbarStore.clear();
    const root = document.createElement("div");
    root.className = "secondary_views_empty";
    root.textContent = message;
    this.body.replaceChildren(root);
  }

  public override dispose(): void {
    this.toolbarStore.dispose();
    this.body.replaceChildren();
    super.dispose();
  }
}
