import { Disposable, DisposableStore, toDisposable } from "src/cs/base/common/lifecycle";
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

import "src/cs/workbench/contrib/export/browser/media/export.css";

type StateSetter<T> = (value: T | ((previous: T) => T)) => void;


export type ExportViewPaneOptions = {
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

export class ExportViewPane extends Disposable {
  private readonly toolbarStore = this._register(new DisposableStore());

  constructor(private readonly container: HTMLElement) {
    super();
    this._register(toDisposable(() => {
      this.container.textContent = "";
    }));
  }

  render(options: ExportViewPaneOptions): void {
    this.toolbarStore.clear();
    this.container.replaceChildren(OriginExportToolbar({
      ...options,
      store: this.toolbarStore,
    }));
  }
}
