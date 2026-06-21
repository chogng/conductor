import { addDisposableListener, EventType, isEditableElement } from "src/cs/base/browser/dom";
import { Emitter } from "src/cs/base/common/event";
import { DisposableStore, MutableDisposable } from "src/cs/base/common/lifecycle";
import type { IManagedHover } from "src/cs/base/browser/ui/hover/hover";
import { NullHoverDelegate, type IHoverDelegate } from "src/cs/base/browser/ui/hover/hoverDelegate";
import { localize } from "src/cs/nls";
import {
  TableWidget as BaseTableWidget,
  VirtualTableGridModel,
} from "src/cs/base/browser/ui/table/tableWidget";
import type {
  VirtualTableCellPosition,
  VirtualTableCellRange,
  VirtualTableColumnRange,
  VirtualTableRange,
} from "src/cs/base/browser/ui/table/virtualTable";
import { createEmptyView } from "src/cs/workbench/contrib/table/browser/emptyView";
import {
  createTableValueStepperControl,
  type TableValueStepperControl,
} from "src/cs/workbench/contrib/table/browser/tableValueStepperControl";
import type {
  TableModel,
  TableRowsVersionChangeEvent,
} from "src/cs/workbench/services/table/common/table";
import {
  formatCell,
  formatRawCell,
  toSuperscriptExponent,
} from "src/cs/workbench/services/table/common/numericFormat";
import type { ColumnDisplayProfile } from "src/cs/workbench/services/table/common/tableDisplayProfile";
import {
  TableColumnLayout,
  type TableColumnWidth,
} from "src/cs/workbench/services/table/common/tableColumnLayout";

const TABLE_WIDGET_COLUMN_LAYOUT_STORAGE_DEBOUNCE_MS = 120;
export const TABLE_WIDGET_DEFAULT_ZOOM_PERCENT = 100;
export const TABLE_WIDGET_MIN_ZOOM_PERCENT = 50;
export const TABLE_WIDGET_MAX_ZOOM_PERCENT = 200;
export const TABLE_WIDGET_ZOOM_STEP_PERCENT = 10;

export type TableWidgetColumnWidth = TableColumnWidth;

export type TableWidgetColumnWidthTarget = TableColumnWidth;

export type TableWidgetRevealMode = boolean | "force";

const clampTableWidgetZoomPercent = (zoomPercent: number): number =>
  Math.min(
    TABLE_WIDGET_MAX_ZOOM_PERCENT,
    Math.max(TABLE_WIDGET_MIN_ZOOM_PERCENT, Math.floor(Number(zoomPercent) || 0)),
  );

export type TableWidgetModel = Pick<
  TableModel,
  | "adjustColumnDisplayScale"
  | "ensureRows"
  | "getColumnDisplayProfile"
  | "getHighlight"
  | "getRow"
  | "getRowsVersion"
  | "getSelection"
  | "getState"
  | "onDidChangeHighlight"
  | "onDidChangeRevealCell"
  | "onDidChangeSelection"
  | "onDidChangeState"
  | "resetColumnDisplayScale"
  | "subscribeRowsVersion"
>;

type TableState = ReturnType<TableWidgetModel["getState"]>;
type TableSelection = ReturnType<TableWidgetModel["getSelection"]>;
type TableCell = NonNullable<TableSelection["activeCell"]>;
type TableRange = NonNullable<TableSelection["ranges"]>[number];

export type TableWidgetSelectionTarget =
  | { readonly kind: "cell"; readonly cell: TableCell | null }
  | { readonly kind: "range"; readonly range: TableRange }
  | { readonly kind: "columns"; readonly columns: readonly number[] };

export type TableWidgetColumnHeaderSelectionMode = "single" | "multi";

export type TableWidgetProps = {
  readonly columnHeaderSelectionMode?: TableWidgetColumnHeaderSelectionMode;
  readonly getColumnWidths?: (sourceKey: string | null | undefined) => readonly TableColumnWidth[];
  readonly hoverDelegate?: IHoverDelegate;
  readonly onCopySelection?: () => void;
  readonly onSelect: (
    target: TableWidgetSelectionTarget | null,
    reveal?: TableWidgetRevealMode,
  ) => boolean;
  readonly storeColumnWidths?: (
    sourceKey: string | null | undefined,
    widths: readonly TableColumnWidth[],
  ) => void;
  readonly tableModel: TableWidgetModel;
  readonly tableState: TableState;
};

type BodyCell = {
  readonly element: HTMLTableCellElement;
  readonly hover: MutableDisposable<IManagedHover>;
  appliedActive?: boolean;
  appliedHighlighted?: boolean;
  appliedSelected?: boolean;
  appliedSelectionFrame?: string;
  appliedText?: string;
  appliedTitle?: string;
};

type ActiveCell = {
  readonly colIndex: number;
  readonly rowIndex: number;
};

type AppliedCellState = {
  readonly activeCell: ActiveCell | null;
  readonly highlightedColumns: Set<number>;
  readonly selectedColumns: Set<number>;
  readonly selectedRanges: readonly VirtualTableCellRange[];
};

type SelectionFrameEdges = {
  readonly bottom: boolean;
  readonly left: boolean;
  readonly right: boolean;
  readonly top: boolean;
};

type ColumnResizeState = {
  readonly colIndex: number;
  readonly guideLeft: number;
  readonly startClientX: number;
  readonly startGuideLeft: number;
  readonly startWidth: number;
};

type BodyRangeSelectionState = {
  readonly pointerId: number;
};

type DirtyRowsPatchResult = "full" | "ignored" | "patched";

export class TableWidget {
  public readonly element: HTMLElement;
  private readonly onDidChangeZoomEmitter = new Emitter<number>();
  public readonly onDidChangeZoom = this.onDidChangeZoomEmitter.event;
  private readonly store = new DisposableStore();
  private readonly grid: BaseTableWidget;
  private readonly columnResizeStore = new DisposableStore();
  private readonly bodyRangeSelectionStore = new DisposableStore();
  private disposeSelectionListener: (() => void) | null = null;
  private disposeHighlightListener: (() => void) | null = null;
  private disposeRevealCellListener: (() => void) | null = null;
  private disposeRowsVersionListener: (() => void) | null = null;
  private disposeStateListener: (() => void) | null = null;
  private readonly bodyCellStates = new WeakMap<HTMLTableCellElement, BodyCell>();
  private readonly headerColumnScaleControls = new WeakMap<HTMLElement, TableValueStepperControl>();
  private bodyTotalRowCount = 0;
  private bodyStartRowIndex = 0;
  private bodyRowCount = 0;
  private bodyTotalColumnCount = 0;
  private bodyStartColumnIndex = 0;
  private bodyColumnCount = 0;
  private layoutTimeoutId: number | null = null;
  private renderedInputKey: string | null = null;
  private renderedZoomPercent: number | null = null;
  private renderedSourceKey: string | null = null;
  private pendingEnsureRowsKey: string | null = null;
  private appliedCellState: AppliedCellState | null = null;
  private columnWidthSourceKey: string | null = null;
  private columnWidths = new Map<number, number>();
  private pendingColumnWidthStorageTimeout: number | null = null;
  private columnResizeState: ColumnResizeState | null = null;
  private bodyRangeSelectionState: BodyRangeSelectionState | null = null;
  private suppressNextBodyClick = false;
  private bodyClickSuppressionTimeout: number | null = null;
  private rangeAnchorCell: VirtualTableCellPosition | null = null;
  private rangeFocusCell: VirtualTableCellPosition | null = null;
  private zoomPercent = TABLE_WIDGET_DEFAULT_ZOOM_PERCENT;
  private props: TableWidgetProps;

  constructor(props: TableWidgetProps) {
    this.props = props;
    this.grid = this.store.add(new BaseTableWidget({
      getColumnWidth: colIndex => this.getColumnWidth(colIndex),
      renderer: {
        clearBodyCell: cell => this.updateCellDisplay(this.getBodyCellState(cell), "", ""),
        disposeBodyCell: cell => this.getBodyCellState(cell).hover.clear(),
        renderBodyCell: (cell, descriptor) => this.renderBodyCell(cell, descriptor.rowIndex, descriptor.colIndex),
        renderColumnHeader: (cell, descriptor) => {
          this.syncHeaderColumnElement(cell, descriptor.colIndex, this.props.tableModel);
        },
        renderRowHeader: (cell, descriptor) => {
          const label = cell.firstElementChild;
          if (label) {
            label.textContent = VirtualTableGridModel.getRowLabel(descriptor.rowIndex);
          }
        },
      },
    }));
    this.element = this.grid.element;
    this.element.tabIndex = 0;
    this.element.setAttribute("role", "region");
    this.element.setAttribute("aria-label", localize("table.view.ariaLabel", "Table"));
    // Base table events describe viewport facts; this widget keeps data and selection ownership.
    this.store.add(this.grid.onDidScroll(() => {
      this.onTableScroll();
    }));
    this.store.add(this.grid.onDidClickHeader(event => {
      this.onHeaderClick(event);
    }));
    this.store.add(this.grid.onDidPointerDownHeader(event => {
      const handle = this.getColumnResizeHandle(event.target);
      if (handle && this.grid.containsHeaderTarget(handle)) {
        this.onColumnResizeStart(event);
      }
    }));
    this.store.add(this.grid.onDidClickBody(event => {
      this.onBodyClick(event);
    }));
    this.store.add(this.grid.onDidPointerDownBody(event => {
      this.onBodyPointerDown(event);
    }));
    this.store.add(addDisposableListener(this.element, EventType.KEY_DOWN, event => {
      this.onKeyDown(event as KeyboardEvent);
    }));
    this.store.add(addDisposableListener(this.element, EventType.WHEEL, event => {
      this.onWheel(event as WheelEvent);
    }, { passive: false }));
    this.store.add(this.onDidChangeZoomEmitter);
    this.store.add(this.columnResizeStore);
    this.store.add(this.bodyRangeSelectionStore);
    this.bindTableState(props.tableModel);
    this.syncColumnWidthSource();
    this.renderedInputKey = getTableWidgetInputKey(props);
    this.render();
  }

  public update(props: TableWidgetProps): void {
    const previousModel = this.props.tableModel;
    const nextInputKey = getTableWidgetInputKey(props);
    this.props = props;
    if (previousModel !== props.tableModel) {
      this.bindTableState(props.tableModel);
    }
    this.syncColumnWidthSource();
    if (previousModel === props.tableModel && this.renderedInputKey === nextInputKey) {
      return;
    }

    this.renderedInputKey = nextInputKey;
    this.render();
  }

  public dispose(): void {
    this.clearScheduledLayout();
    this.flushPendingColumnWidthStorage();
    this.disposeSelectionListener?.();
    this.disposeSelectionListener = null;
    this.disposeHighlightListener?.();
    this.disposeHighlightListener = null;
    this.disposeRevealCellListener?.();
    this.disposeRevealCellListener = null;
    this.disposeRowsVersionListener?.();
    this.disposeRowsVersionListener = null;
    this.disposeStateListener?.();
    this.disposeStateListener = null;
    this.endColumnResize();
    this.endBodyRangeSelection();
    this.clearBodyClickSuppression();
    this.disposeBodyCellHovers();
    this.store.dispose();
  }

  public layout(): void {
    this.scheduleLayout();
  }

  private scheduleLayout(): void {
    const targetWindow = this.element.ownerDocument.defaultView;
    if (!targetWindow) {
      this.layoutNow();
      return;
    }

    this.clearScheduledLayout();
    this.layoutTimeoutId = targetWindow.setTimeout(() => {
      this.layoutTimeoutId = null;
      this.layoutNow();
    }, 80);
  }

  private clearScheduledLayout(): void {
    if (this.layoutTimeoutId === null) {
      return;
    }

    const targetWindow = this.element.ownerDocument.defaultView;
    targetWindow?.clearTimeout(this.layoutTimeoutId);
    this.layoutTimeoutId = null;
  }

  private layoutNow(): void {
    this.clearScheduledLayout();
    this.grid.layout();
    if (this.shouldRenderTableOnLayout()) {
      const needsLayout = this.renderTable();
      if (needsLayout) {
        this.grid.layout();
      }
    }
    this.syncHeaderScroll();
  }

  public focus(): void {
    this.element.focus({ preventScroll: true });
  }

  public getSelection(): TableSelection {
    return this.props.tableModel.getSelection();
  }

  public select(
    target: TableWidgetSelectionTarget | null,
    reveal?: TableWidgetRevealMode,
  ): boolean {
    const didSelect = this.props.onSelect(target, reveal);
    if (!didSelect) {
      return false;
    }

    if (!target) {
      this.rangeAnchorCell = null;
      this.rangeFocusCell = null;
      return true;
    }

    if (target.kind === "cell") {
      this.rangeAnchorCell = null;
      this.rangeFocusCell = null;
      if (reveal && target.cell) {
        this.revealCell(target.cell);
      }
    }

    if (target.kind === "columns") {
      this.rangeAnchorCell = null;
      this.rangeFocusCell = null;
    }

    if (reveal && target.kind === "range") {
      this.revealCell({
        colIndex: target.range.endCol,
        fileId: target.range.fileId ?? null,
        rowIndex: target.range.endRow,
        sheetId: target.range.sheetId ?? null,
      });
    }

    return true;
  }

  public clearSelection(): boolean {
    return this.select(null);
  }

  public selectAllColumns(): boolean {
    const tableFile = this.props.tableState.file;
    if (!tableFile) {
      return false;
    }

    const columnCount = Math.max(0, Math.floor(Number(tableFile.columnCount) || 0));
    if (columnCount === 0) {
      return false;
    }

    const selectedColumns: number[] = [];
    for (let colIndex = 0; colIndex < columnCount; colIndex += 1) {
      selectedColumns.push(colIndex);
    }

    return this.select({ kind: "columns", columns: selectedColumns });
  }

  public getZoomPercent(): number {
    return this.zoomPercent;
  }

  public resetZoom(): boolean {
    return this.setZoomPercent(TABLE_WIDGET_DEFAULT_ZOOM_PERCENT);
  }

  public zoomIn(): boolean {
    return this.setZoomPercent(this.zoomPercent + TABLE_WIDGET_ZOOM_STEP_PERCENT);
  }

  public zoomOut(): boolean {
    return this.setZoomPercent(this.zoomPercent - TABLE_WIDGET_ZOOM_STEP_PERCENT);
  }

  private setZoomPercent(zoomPercent: number): boolean {
    const nextZoomPercent = clampTableWidgetZoomPercent(zoomPercent);
    if (nextZoomPercent === this.zoomPercent) {
      return false;
    }

    this.zoomPercent = nextZoomPercent;
    this.render();
    this.onDidChangeZoomEmitter.fire(nextZoomPercent);
    return true;
  }

  public setColumnWidth(target: TableWidgetColumnWidthTarget): boolean {
    const colIndex = normalizeWidgetColumnIndex(target?.colIndex);
    if (colIndex === null) {
      return false;
    }

    const width = TableColumnLayout.clampWidth(Number(target.width));
    if (this.getColumnWidth(colIndex) === width) {
      return false;
    }

    this.columnWidths = new Map(this.columnWidths);
    if (width === TableColumnLayout.defaultWidth) {
      this.columnWidths.delete(colIndex);
    } else {
      this.columnWidths.set(colIndex, width);
    }
    this.scheduleStoreColumnWidths();

    if (this.isTableVisible()) {
      this.renderTable();
      this.layoutNow();
    }
    return true;
  }

  private syncColumnWidthSource(): void {
    const sourceKey = getTableWidgetColumnWidthSourceKey(this.props.tableState.sourceKey);
    if (this.columnWidthSourceKey === sourceKey) {
      return;
    }

    this.flushPendingColumnWidthStorage();
    this.columnWidthSourceKey = sourceKey;
    this.columnWidths = this.restoreColumnWidths(sourceKey);
  }

  private restoreColumnWidths(sourceKey: string | null): Map<number, number> {
    if (!sourceKey || !this.props.getColumnWidths) {
      return new Map();
    }

    return new Map(
      this.props.getColumnWidths(sourceKey).map(width => [width.colIndex, width.width]),
    );
  }

  private getColumnWidths(): readonly TableWidgetColumnWidth[] {
    return Array.from(this.columnWidths.entries())
      .sort(([left], [right]) => left - right)
      .map(([colIndex, width]) => ({ colIndex, width }));
  }

  private scheduleStoreColumnWidths(): void {
    if (!this.props.storeColumnWidths || !this.columnWidthSourceKey) {
      return;
    }

    const targetWindow = this.element.ownerDocument.defaultView;
    if (!targetWindow) {
      this.storeColumnWidths();
      return;
    }

    if (this.pendingColumnWidthStorageTimeout !== null) {
      targetWindow.clearTimeout(this.pendingColumnWidthStorageTimeout);
    }

    this.pendingColumnWidthStorageTimeout = targetWindow.setTimeout(() => {
      this.pendingColumnWidthStorageTimeout = null;
      this.storeColumnWidths();
    }, TABLE_WIDGET_COLUMN_LAYOUT_STORAGE_DEBOUNCE_MS);
  }

  private flushPendingColumnWidthStorage(): void {
    if (this.pendingColumnWidthStorageTimeout === null) {
      return;
    }

    const targetWindow = this.element.ownerDocument.defaultView;
    targetWindow?.clearTimeout(this.pendingColumnWidthStorageTimeout);
    this.pendingColumnWidthStorageTimeout = null;
    this.storeColumnWidths();
  }

  private storeColumnWidths(): void {
    if (!this.props.storeColumnWidths || !this.columnWidthSourceKey) {
      return;
    }

    this.props.storeColumnWidths(this.columnWidthSourceKey, this.getColumnWidths());
  }

  public scrollHorizontally(delta: number): boolean {
    return this.grid.scrollHorizontally(delta);
  }

  private bindTableState(tableModel: TableWidgetModel): void {
    this.disposeSelectionListener?.();
    this.disposeHighlightListener?.();
    this.disposeRevealCellListener?.();
    this.disposeRowsVersionListener?.();
    this.disposeStateListener?.();
    this.disposeSelectionListener = tableModel.onDidChangeSelection(() => {
      this.syncSelectionState();
    });
    this.disposeRowsVersionListener = tableModel.subscribeRowsVersion(event => {
      this.syncRows(event);
    });
    this.disposeHighlightListener = tableModel.onDidChangeHighlight(() => {
      this.syncSelectionState();
    });
    this.disposeRevealCellListener = tableModel.onDidChangeRevealCell((cell) => {
      if (cell) {
        this.revealCell(cell);
      }
    });
    this.disposeStateListener = tableModel.onDidChangeState(() => {
      this.props = {
        ...this.props,
        tableState: tableModel.getState(),
      };
      this.renderedInputKey = getTableWidgetInputKey(this.props);
      this.render();
    });
  }

  private render(): void {
    const { tableState } = this.props;
    const tableFile = tableState.file;
    const sourceKey = tableState.sourceKey ?? tableState.selectedFileId ?? null;
    this.element.dataset.state = tableState.loadState.state;

    if (this.renderedSourceKey !== sourceKey) {
      this.renderedSourceKey = sourceKey;
      this.pendingEnsureRowsKey = null;
      this.appliedCellState = null;
      this.rangeAnchorCell = null;
      this.rangeFocusCell = null;
      this.syncColumnResizeGuide();
      this.clearRowsText();
      this.grid.resetScrollTop();
    }

    if (!tableState.selectedFileId || !tableFile) {
      if (
        tableState.loadState.state === "loading" &&
        this.bodyRowCount > 0 &&
        this.bodyColumnCount > 0
      ) {
        this.grid.attachContent();
        this.grid.setHeaderVisible(true);
        this.layoutNow();
        this.syncHeaderScroll();
        return;
      }

      this.grid.setHeaderVisible(false);
      this.grid.replaceViewportContent(createEmptyView({
        title: tableState.loadState.state === "error"
          ? localize("table.preview.unreadableTitle", "File content cannot be decoded")
          : undefined,
        description: tableState.loadState.state === "loading"
          ? tableState.loadState.message ||
            localize("table.preview.loadingHint", "Parsing CSV preview, please wait.")
          : tableState.loadState.state === "error"
            ? tableState.loadState.message ||
              localize("table.preview.unreadableHint", "The system cannot confirm this file is a valid CSV table.")
            : localize("table.preview.emptyHint", "Select a file to preview"),
      }));
      this.syncColumnResizeGuide();
      this.layoutNow();
      return;
    }

    if (tableState.loadState.state === "error") {
      this.grid.setHeaderVisible(false);
      this.grid.replaceViewportContent(createEmptyView({
        title: localize("table.preview.unreadableTitle", "File content cannot be decoded"),
        description: tableState.loadState.message ||
          localize("table.preview.unreadableHint", "The system cannot confirm this file is a valid CSV table."),
      }));
      this.syncColumnResizeGuide();
      this.layoutNow();
      return;
    }

    if (tableState.loadState.state === "loading") {
      this.grid.setHeaderVisible(false);
      this.grid.replaceViewportContent(createEmptyView({
        title: localize("table.preview.loadingTitle", "Loading preview..."),
        description: tableState.loadState.message ||
          localize("table.preview.loadingHint", "Parsing CSV preview, please wait."),
      }));
      this.syncColumnResizeGuide();
      this.layoutNow();
      return;
    }

    const didAttachContent = this.grid.attachContent();
    const needsLayout = this.renderTable();
    if (didAttachContent || needsLayout) {
      this.layoutNow();
    }
    this.syncHeaderScroll();
  }

  private renderTable(): boolean {
    const { tableModel, tableState } = this.props;
    const zoomPercent = this.zoomPercent;
    const tableFile = tableState.file;
    const zoomChanged = this.renderedZoomPercent !== zoomPercent;
    if (zoomChanged) {
      this.renderedZoomPercent = zoomPercent;
      this.grid.setBodyStyleProperty(
        "--table-view-zoom",
        String(VirtualTableGridModel.getZoomScale(zoomPercent)),
      );
    }

    if (!tableFile || tableFile.rowCount <= 0 || tableFile.columnCount <= 0) {
      this.grid.setHeaderVisible(false);
      this.grid.replaceViewportContent(createEmptyView({
        description: localize("table.preview.emptyHint", "Select a file to preview"),
      }));
      this.syncColumnResizeGuide();
      return true;
    }

    this.grid.setHeaderVisible(true);
    const gridChanged = this.grid.render({
      columnCount: tableFile.columnCount,
      renderVersion: this.getRowsRenderVersion(),
      rowCount: tableFile.rowCount,
      zoomPercent,
    });
    this.syncCachedGridState();
    this.syncSelectionState();
    this.syncColumnResizeGuide();

    if (tableFile?.fileId) {
      this.ensureRows(tableModel, tableFile.sourceKey ?? tableFile.fileId, this.getBodyRowRange());
    }

    return gridChanged || zoomChanged;
  }

  private ensureRows(
    tableModel: TableWidgetModel,
    sourceKey: string,
    rowRange: VirtualTableRange,
  ): void {
    const requestKey = `${sourceKey}\u001f${rowRange.startIndex}\u001f${rowRange.endIndex}`;
    if (this.pendingEnsureRowsKey === requestKey) {
      return;
    }

    this.pendingEnsureRowsKey = requestKey;
    void tableModel.ensureRows(sourceKey, rowRange.startIndex, rowRange.endIndex).then(
      () => this.clearPendingEnsureRows(requestKey),
      () => this.clearPendingEnsureRows(requestKey),
    );
  }

  private clearPendingEnsureRows(requestKey: string): void {
    if (this.pendingEnsureRowsKey === requestKey) {
      this.pendingEnsureRowsKey = null;
    }
  }

  private syncHeaderColumnElement(
    cell: HTMLElement,
    colIndex: number,
    tableModel: TableWidgetModel,
  ): void {
    let button = cell.querySelector<HTMLButtonElement>(".table_view_column_button");
    let scaleControl = this.headerColumnScaleControls.get(cell);
    let resizeHandle = cell.querySelector<HTMLElement>(".table_view_column_resize_handle");

    if (!button || !scaleControl || !resizeHandle) {
      cell.replaceChildren();
      button = document.createElement("button");
      button.type = "button";
      button.className = "table_view_column_button";
      scaleControl = this.createColumnScaleControl(colIndex);
      resizeHandle = document.createElement("span");
      resizeHandle.className = "table_view_column_resize_handle";
      resizeHandle.setAttribute("role", "separator");
      resizeHandle.setAttribute("aria-orientation", "vertical");
      cell.append(button, scaleControl.element, resizeHandle);
      this.headerColumnScaleControls.set(cell, scaleControl);
    }

    const columnLabel = VirtualTableGridModel.getColumnLabel(colIndex);
    const profile = tableModel.getColumnDisplayProfile(colIndex);
    const colIndexValue = String(colIndex);
    button.dataset.colIndex = colIndexValue;
    button.textContent = columnLabel;
    button.setAttribute(
      "aria-label",
      localize("table.preview.toggleColumn", "Toggle column {column}", {
        column: columnLabel,
      }),
    );
    resizeHandle.dataset.colIndex = colIndexValue;
    resizeHandle.setAttribute(
      "aria-label",
      localize("table.preview.resizeColumn", "Resize column {column}", {
        column: columnLabel,
      }),
    );
    this.syncHeaderColumnScaleControl(scaleControl, colIndex, profile);
    cell.setAttribute("aria-colindex", String(colIndex + 1));
  }

  private createColumnScaleControl(colIndex: number): TableValueStepperControl {
    const colIndexValue = String(colIndex);
    const control = createTableValueStepperControl({
      ariaLabel: localize("table.preview.columnScaleControl", "Column scale"),
      className: "table_view_column_scale_control",
      decrease: {
        className: "table_view_column_scale_button table_view_column_scale_button_minus",
        dataset: {
          colIndex: colIndexValue,
          scaleAction: "decrease",
        },
        label: localize("table.preview.decreaseColumnScale", "Decrease column scale exponent"),
      },
      increase: {
        className: "table_view_column_scale_button table_view_column_scale_button_plus",
        dataset: {
          colIndex: colIndexValue,
          scaleAction: "increase",
        },
        label: localize("table.preview.increaseColumnScale", "Increase column scale exponent"),
      },
      value: {
        className: "table_view_column_scale_value table_view_column_scale_button",
        dataset: {
          colIndex: colIndexValue,
          scaleAction: "reset",
        },
        kind: "button",
        label: localize("table.preview.resetColumnScale", "Reset column scale to automatic"),
      },
    });
    control.element.dataset.colIndex = colIndexValue;
    control.element.hidden = true;
    return control;
  }

  private syncHeaderColumnScaleControl(
    control: TableValueStepperControl | undefined,
    colIndex: number,
    profile: ColumnDisplayProfile,
  ): boolean {
    if (!control) {
      return false;
    }

    const showControl = profile.mode === "columnScale" &&
      profile.isNumericColumn &&
      (Boolean(profile.headerSuffix) || Boolean(profile.isScaleManual));
    let changed = setHidden(control.element, !showControl);
    if (!showControl) {
      return changed;
    }

    const colIndexValue = String(colIndex);
    if (control.element.dataset.colIndex !== colIndexValue) {
      control.element.dataset.colIndex = colIndexValue;
      changed = true;
    }

    if (setColumnScaleControlColumnIndex(control, colIndexValue)) {
      changed = true;
    }
    const valueText = `×10${toSuperscriptExponent(profile.scaleExponent)}`;
    if (control.setValue(valueText)) {
      changed = true;
    }
    if (control.setDisabled({ value: !profile.isScaleManual })) {
      changed = true;
    }

    const ariaLabel = profile.isScaleManual
      ? localize("table.preview.columnScaleManual", "Column scale {scale}, manually adjusted", { scale: valueText })
      : localize("table.preview.columnScaleAutomatic", "Column scale {scale}, automatic", { scale: valueText });
    if (control.setAriaLabel(ariaLabel)) {
      changed = true;
    }

    return changed;
  }

  private syncRows(event?: TableRowsVersionChangeEvent): void {
    if (!this.isTableVisible()) {
      this.render();
      return;
    }

    const patchResult = event ? this.patchDirtyRows(event) : "full";
    if (patchResult === "full") {
      this.renderTable();
    }
    this.syncHeaderScroll();
  }

  private patchDirtyRows(event: TableRowsVersionChangeEvent): DirtyRowsPatchResult {
    if (event.full || event.kind !== "content" || event.ranges.length === 0) {
      return "full";
    }

    return this.grid.rerenderDirtyBodyCells(event.ranges, this.getRowsRenderVersion());
  }

  private getBodyRowRange(): VirtualTableRange {
    return {
      totalCount: this.bodyTotalRowCount,
      startIndex: this.bodyStartRowIndex,
      endIndex: this.bodyStartRowIndex + this.bodyRowCount,
      renderedCount: this.bodyRowCount,
    };
  }

  private getBodyColumnRange(): VirtualTableColumnRange {
    const columnRange = this.grid.getState().columnRange;
    return {
      totalCount: columnRange.totalCount,
      startIndex: columnRange.startIndex,
      endIndex: columnRange.endIndex,
      renderedCount: columnRange.renderedCount,
      leadingWidth: columnRange.leadingWidth,
      renderedWidth: columnRange.renderedWidth,
      totalWidth: columnRange.totalWidth,
      trailingWidth: columnRange.trailingWidth,
    };
  }

  private getRowsRenderVersion(): string {
    return [
      this.renderedSourceKey ?? "",
      this.props.tableModel.getRowsVersion(),
      this.props.tableState.displayVersion ?? 0,
    ].join("\u001f");
  }

  private syncCachedGridState(): void {
    const { rowRange, columnRange } = this.grid.getState();
    const changed = this.bodyStartRowIndex !== rowRange.startIndex ||
      this.bodyTotalRowCount !== rowRange.totalCount ||
      this.bodyRowCount !== rowRange.renderedCount ||
      this.bodyStartColumnIndex !== columnRange.startIndex ||
      this.bodyTotalColumnCount !== columnRange.totalCount ||
      this.bodyColumnCount !== columnRange.renderedCount;
    this.bodyTotalRowCount = rowRange.totalCount;
    this.bodyStartRowIndex = rowRange.startIndex;
    this.bodyRowCount = rowRange.renderedCount;
    this.bodyTotalColumnCount = columnRange.totalCount;
    this.bodyStartColumnIndex = columnRange.startIndex;
    this.bodyColumnCount = columnRange.renderedCount;
    if (changed) {
      this.appliedCellState = null;
    }
  }

  private renderBodyCell(
    element: HTMLTableCellElement,
    rowIndex: number,
    colIndex: number,
  ): void {
    const row = this.props.tableModel.getRow(rowIndex) ?? [];
    const rawValue = row[colIndex];
    const profile = this.props.tableModel.getColumnDisplayProfile(colIndex);
    const displayText = formatCell(rawValue, profile);
    this.updateCellDisplay(
      this.getBodyCellState(element),
      displayText,
      getCellDisplayTitle(rawValue, displayText, profile),
    );
  }

  private syncSelectionState(): void {
    if (!this.isTableVisible()) {
      return;
    }

    const { tableModel } = this.props;
    const rowCount = this.bodyRowCount;
    const columnCount = this.bodyColumnCount;
    const startColumnIndex = this.bodyStartColumnIndex;
    const selection = tableModel.getSelection();
    const activeCell = normalizeActiveCell(
      selection.activeCell,
      this.bodyStartRowIndex,
      rowCount,
      startColumnIndex,
      columnCount,
    );
    const selectedColumns = toColumnSet(selection.selectedColumns, startColumnIndex, columnCount);
    const selectedRanges = toVisibleRanges(
      selection.ranges,
      this.bodyStartRowIndex,
      rowCount,
      startColumnIndex,
      columnCount,
    );
    const highlightedColumns = toColumnSet(
      tableModel.getHighlight().columns,
      startColumnIndex,
      columnCount,
    );
    const previous = this.appliedCellState;
    const next: AppliedCellState = {
      activeCell,
      highlightedColumns,
      selectedColumns,
      selectedRanges,
    };

    if (!previous) {
      this.syncHeaderColumns(VirtualTableGridModel.range(columnCount), next);
      for (let rowOffset = 0; rowOffset < rowCount; rowOffset += 1) {
        const rowIndex = this.bodyStartRowIndex + rowOffset;
        for (let columnOffset = 0; columnOffset < columnCount; columnOffset += 1) {
          const cell = this.getVisibleBodyCell(rowOffset, columnOffset);
          if (!cell) {
            continue;
          }
          const colIndex = startColumnIndex + columnOffset;
          this.updateCellState(cell, {
            active: selectedRanges.length === 0 && isActiveCell(activeCell, rowIndex, colIndex),
            highlighted: highlightedColumns.has(colIndex),
            selected: isSelectedCell(rowIndex, colIndex, next),
            selectionFrame: getSelectionFrame(rowIndex, colIndex, selectedRanges),
          });
        }
      }
      this.appliedCellState = next;
      return;
    }

    const rangesChanged = !areCellRangesEqual(previous.selectedRanges, next.selectedRanges);
    const changedColumns = rangesChanged
      ? VirtualTableGridModel.range(columnCount).map(columnOffset => startColumnIndex + columnOffset)
      : getChangedColumns(previous, next, startColumnIndex, columnCount);
    this.syncHeaderColumns(changedColumns.map(colIndex => colIndex - startColumnIndex), next);

    for (const colIndex of changedColumns) {
      const columnOffset = colIndex - startColumnIndex;
      for (let rowOffset = 0; rowOffset < rowCount; rowOffset += 1) {
        const cell = this.getVisibleBodyCell(rowOffset, columnOffset);
        if (!cell) {
          continue;
        }
        const rowIndex = this.bodyStartRowIndex + rowOffset;
        this.updateCellState(cell, {
          active: selectedRanges.length === 0 && isActiveCell(activeCell, rowIndex, colIndex),
          highlighted: highlightedColumns.has(colIndex),
          selected: isSelectedCell(rowIndex, colIndex, next),
          selectionFrame: getSelectionFrame(rowIndex, colIndex, selectedRanges),
        });
      }
    }

    this.syncActiveCells(previous.activeCell, activeCell, next);
    this.appliedCellState = next;
  }

  private syncActiveCells(
    previous: ActiveCell | null,
    next: ActiveCell | null,
    state: Pick<AppliedCellState, "highlightedColumns" | "selectedColumns" | "selectedRanges">,
  ): void {
    if (areActiveCellsEqual(previous, next)) {
      return;
    }

    this.updateActiveCellState(previous, false, state);
    this.updateActiveCellState(next, true, state);
  }

  private updateActiveCellState(
    activeCell: ActiveCell | null,
    active: boolean,
    state: Pick<AppliedCellState, "highlightedColumns" | "selectedColumns" | "selectedRanges">,
  ): void {
    if (!activeCell) {
      return;
    }

    const rowOffset = activeCell.rowIndex - this.bodyStartRowIndex;
    const columnOffset = activeCell.colIndex - this.bodyStartColumnIndex;
    const cell = this.getVisibleBodyCell(rowOffset, columnOffset);
    if (!cell) {
      return;
    }

    this.updateCellState(cell, {
      active: active && state.selectedRanges.length === 0,
      highlighted: state.highlightedColumns.has(activeCell.colIndex),
      selected: isSelectedCell(activeCell.rowIndex, activeCell.colIndex, state),
      selectionFrame: getSelectionFrame(activeCell.rowIndex, activeCell.colIndex, state.selectedRanges),
    });
  }

  private syncHeaderColumns(
    columns: readonly number[],
    state: Pick<AppliedCellState, "highlightedColumns" | "selectedColumns">,
  ): void {
    for (const columnOffset of columns) {
      const colIndex = this.bodyStartColumnIndex + columnOffset;
      const cell = this.grid.getColumnHeaderCellElement(columnOffset);
      if (!cell) {
        continue;
      }

      const selected = state.selectedColumns.has(colIndex);
      cell.dataset.selected = selected ? "true" : "false";
      cell.dataset.highlighted = state.highlightedColumns.has(colIndex) ? "true" : "false";
      const button = cell.firstElementChild as HTMLButtonElement | null;
      button?.setAttribute("aria-pressed", selected ? "true" : "false");
    }
  }

  private isTableVisible(): boolean {
    return this.grid.isContentVisible();
  }

  private shouldRenderTableOnLayout(): boolean {
    const { tableState } = this.props;
    return this.grid.isContentAttached() &&
      tableState.loadState.state !== "loading" &&
      Boolean(tableState.selectedFileId && tableState.file);
  }

  private getVisibleBodyCell(rowOffset: number, columnOffset: number): BodyCell | null {
    const element = this.grid.getBodyCellElement(rowOffset, columnOffset);
    return element ? this.getBodyCellState(element) : null;
  }

  private getBodyCellState(element: HTMLTableCellElement): BodyCell {
    let cell = this.bodyCellStates.get(element);
    if (!cell) {
      cell = {
        element,
        hover: this.store.add(new MutableDisposable<IManagedHover>()),
      };
      this.bodyCellStates.set(element, cell);
    }
    return cell;
  }

  private updateCellDisplay(cell: BodyCell, text: string, title: string): void {
    if (cell.appliedText !== text) {
      cell.element.textContent = text;
      cell.appliedText = text;
    }
    if (cell.appliedTitle !== title) {
      if (title) {
        cell.element.removeAttribute("title");
        if (cell.hover.current) {
          cell.hover.current.update(createCellDisplayHoverContent(cell.element.ownerDocument, title));
        } else {
          cell.hover.current = (this.props.hoverDelegate ?? NullHoverDelegate)
            .setupManagedHover(cell.element, createCellDisplayHoverContent(cell.element.ownerDocument, title), {
              appearance: { compact: true },
            });
        }
      } else {
        cell.element.removeAttribute("title");
        cell.hover.clear();
      }
      cell.appliedTitle = title;
    }
  }

  private disposeBodyCellHovers(): void {
    this.grid.forEachBodyCellElement(cell => this.getBodyCellState(cell).hover.clear());
  }

  private clearRowsText(): void {
    this.grid.clearBodyCells();
  }

  private updateCellState(
    cell: BodyCell,
    state: {
      readonly active: boolean;
      readonly highlighted: boolean;
      readonly selected: boolean;
      readonly selectionFrame: SelectionFrameEdges;
    },
  ): void {
    const element = cell.element;

    if (cell.appliedActive !== state.active) {
      element.dataset.active = state.active ? "true" : "false";
      cell.appliedActive = state.active;
    }

    if (cell.appliedSelected !== state.selected) {
      element.dataset.selected = state.selected ? "true" : "false";
      cell.appliedSelected = state.selected;
    }

    if (cell.appliedHighlighted !== state.highlighted) {
      element.dataset.highlighted = state.highlighted ? "true" : "false";
      cell.appliedHighlighted = state.highlighted;
    }

    const selectionFrame = serializeSelectionFrame(state.selectionFrame);
    if (cell.appliedSelectionFrame !== selectionFrame) {
      element.dataset.selectionFrame = selectionFrame === "" ? "false" : "true";
      element.style.setProperty("--table-view-selection-frame-top", state.selectionFrame.top ? "2px" : "0");
      element.style.setProperty("--table-view-selection-frame-right", state.selectionFrame.right ? "2px" : "0");
      element.style.setProperty("--table-view-selection-frame-bottom", state.selectionFrame.bottom ? "2px" : "0");
      element.style.setProperty("--table-view-selection-frame-left", state.selectionFrame.left ? "2px" : "0");
      cell.appliedSelectionFrame = selectionFrame;
    }
  }

  private onHeaderClick(event: MouseEvent): void {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    const scaleButton = target.closest<HTMLButtonElement>(".table_view_column_scale_button");
    if (scaleButton && this.grid.containsHeaderTarget(scaleButton)) {
      this.onColumnScaleButtonClick(event, scaleButton);
      return;
    }

    const button = target.closest<HTMLButtonElement>(".table_view_column_button");
    if (!button || !this.grid.containsHeaderTarget(button)) {
      return;
    }

    const colIndex = Number(button.dataset.colIndex);
    if (!Number.isInteger(colIndex) || colIndex < 0) {
      return;
    }

    this.select({
      kind: "columns",
      columns: resolveHeaderSelectedColumns(
        this.getSelection(),
        colIndex,
        this.props.columnHeaderSelectionMode ?? "single",
      ),
    });
    this.focus();
  }

  private onColumnScaleButtonClick(event: MouseEvent, button: HTMLButtonElement): void {
    const colIndex = Number(button.dataset.colIndex);
    if (!Number.isInteger(colIndex) || colIndex < 0) {
      return;
    }

    const action = button.dataset.scaleAction;
    let changed = false;
    if (action === "decrease") {
      changed = this.props.tableModel.adjustColumnDisplayScale(colIndex, -1);
    } else if (action === "increase") {
      changed = this.props.tableModel.adjustColumnDisplayScale(colIndex, 1);
    } else if (action === "reset") {
      changed = this.props.tableModel.resetColumnDisplayScale(colIndex);
    }

    if (!changed) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    this.focus();
  }

  private onColumnResizeStart(event: PointerEvent): void {
    const colIndex = VirtualTableGridModel.resolveColumnResizeTarget({
      button: event.button,
      clientX: event.clientX,
      columnRange: this.getBodyColumnRange(),
      containerLeft: this.grid.getBodyLeft(),
      getColumnWidth: index => this.getColumnWidth(index),
      scrollLeft: this.grid.getScrollLeft(),
      zoomPercent: this.zoomPercent,
    });
    if (colIndex === null) {
      return;
    }

    const startGuideLeft = this.getColumnResizeBoundaryLeft(colIndex) ??
      VirtualTableGridModel.resolveColumnResizeGuideLeft({
        colIndex,
        columnRange: this.getBodyColumnRange(),
        getColumnWidth: index => this.getColumnWidth(index),
        scrollLeft: this.grid.getScrollLeft(),
        visible: this.grid.isHeaderVisible(),
        zoomPercent: this.zoomPercent,
      });
    if (startGuideLeft === null) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    this.endColumnResize();
    this.columnResizeState = {
      colIndex,
      guideLeft: startGuideLeft,
      startClientX: event.clientX,
      startGuideLeft,
      startWidth: this.getColumnWidth(colIndex),
    };
    this.element.classList.add("table_view--resizing_column");
    this.syncColumnResizeGuide();

    const targetWindow = this.element.ownerDocument.defaultView;
    if (!targetWindow) {
      return;
    }

    this.columnResizeStore.add(addDisposableListener(
      targetWindow,
      EventType.POINTER_MOVE,
      moveEvent => {
        this.onColumnResizeMove(moveEvent as PointerEvent);
      },
    ));
    this.columnResizeStore.add(addDisposableListener(targetWindow, EventType.POINTER_UP, () => {
      this.endColumnResize();
    }));
  }

  private onColumnResizeMove(event: PointerEvent): void {
    const state = this.columnResizeState;
    if (!state) {
      return;
    }

    event.preventDefault();
    const width = VirtualTableGridModel.resizeColumnWidth(
      state.startWidth,
      event.clientX - state.startClientX,
      this.zoomPercent,
    );
    const guideLeft = VirtualTableGridModel.resolveColumnResizeDragGuideLeft({
      startGuideLeft: state.startGuideLeft,
      startWidth: state.startWidth,
      visible: this.grid.isHeaderVisible(),
      width,
      zoomPercent: this.zoomPercent,
    });
    if (guideLeft !== null) {
      this.columnResizeState = {
        ...state,
        guideLeft,
      };
    }
    this.setColumnWidth({ colIndex: state.colIndex, width });
    this.syncColumnResizeGuide();
  }

  private endColumnResize(): void {
    if (this.columnResizeState) {
      this.columnResizeState = null;
      this.element.classList.remove("table_view--resizing_column");
    }

    this.syncColumnResizeGuide();
    this.columnResizeStore.clear();
  }

  private getColumnResizeHandle(target: EventTarget | null): HTMLElement | null {
    return target instanceof HTMLElement
      ? target.closest<HTMLElement>(".table_view_column_resize_handle")
      : null;
  }

  private getColumnResizeBoundaryLeft(colIndex: number): number | null {
    return this.grid.getColumnResizeBoundaryLeft(colIndex);
  }

  private getColumnWidth(colIndex: number): number {
    return this.columnWidths.get(colIndex) ?? TableColumnLayout.defaultWidth;
  }

  private syncColumnResizeGuide(): void {
    const left = this.columnResizeState
      ? this.columnResizeState.guideLeft
      : null;
    this.grid.syncColumnResizeGuide(left);
  }

  private onKeyDown(event: KeyboardEvent): void {
    if (
      event.defaultPrevented ||
      event.altKey ||
      (event.target instanceof Element && isEditableElement(event.target))
    ) {
      return;
    }

    if (this.handleShortcutKey(event)) {
      return;
    }
    if (event.metaKey) {
      return;
    }

    const tableFile = this.props.tableState.file;
    if (!tableFile) {
      return;
    }

    const target = VirtualTableGridModel.resolveKeyboardTarget({
      key: event.key,
      currentCell: event.shiftKey
        ? this.getRangeFocusCell()
        : this.getNavigationCell(),
      rowCount: tableFile.rowCount,
      columnCount: tableFile.columnCount,
      pageRowCount: this.getPageRowCount(),
      toBoundary: event.ctrlKey,
    });
    if (!target) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    if (event.shiftKey) {
      if (this.selectRangeToCell(target, true)) {
        this.focus();
      }
      return;
    }

    const cell: TableCell = {
      colIndex: target.colIndex,
      fileId: tableFile.fileId,
      rowIndex: target.rowIndex,
      sheetId: tableFile.sheetId ?? null,
    };
    this.rangeAnchorCell = null;
    this.rangeFocusCell = null;
    if (this.select({ kind: "cell", cell }, true)) {
      this.focus();
    }
  }

  private handleShortcutKey(event: KeyboardEvent): boolean {
    const key = String(event.key || "").toLowerCase();
    if (event.ctrlKey || event.metaKey) {
      if (key === "a") {
        return this.runShortcut(event, () => {
          this.selectAllColumns();
        });
      }
      if (key === "c") {
        return this.runShortcut(event, this.props.onCopySelection);
      }
      if (event.metaKey) {
        return false;
      }
      if (key === "=" || key === "+") {
        return this.runShortcut(event, () => {
          this.zoomIn();
        });
      }
      if (key === "-") {
        return this.runShortcut(event, () => {
          this.zoomOut();
        });
      }
      if (key === "0") {
        return this.runShortcut(event, () => {
          this.resetZoom();
        });
      }
      return false;
    }

    if (key === "escape") {
      return this.runShortcut(event, () => {
        this.clearSelection();
      });
    }

    return false;
  }

  private runShortcut(event: KeyboardEvent, callback: (() => void) | undefined): boolean {
    if (!callback) {
      return false;
    }

    event.preventDefault();
    event.stopPropagation();
    callback();
    return true;
  }

  private onWheel(event: WheelEvent): void {
    if (event.defaultPrevented || event.altKey || event.metaKey) {
      return;
    }

    if (event.ctrlKey) {
      this.onZoomWheel(event);
      return;
    }

    if (event.shiftKey) {
      this.onHorizontalWheel(event);
    }
  }

  private onZoomWheel(event: WheelEvent): void {
    const delta = getWheelDelta(event);
    if (delta === 0) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    if (delta < 0) {
      this.zoomIn();
    } else {
      this.zoomOut();
    }
  }

  private onHorizontalWheel(event: WheelEvent): void {
    const delta = event.deltaX !== 0 ? event.deltaX : event.deltaY;
    if (delta === 0 || !this.scrollHorizontally(delta)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
  }

  private getNavigationCell(): VirtualTableCellPosition | null {
    const tableFile = this.props.tableState.file;
    if (!tableFile) {
      return null;
    }

    const activeCell = this.getSelection().activeCell;
    const rowIndex = Math.floor(Number(activeCell?.rowIndex));
    const colIndex = Math.floor(Number(activeCell?.colIndex));
    if (
      Number.isInteger(rowIndex) &&
      rowIndex >= 0 &&
      rowIndex < tableFile.rowCount &&
      Number.isInteger(colIndex) &&
      colIndex >= 0 &&
      colIndex < tableFile.columnCount
    ) {
      return { colIndex, rowIndex };
    }

    return {
      colIndex: 0,
      rowIndex: Math.min(Math.max(0, this.bodyStartRowIndex), Math.max(0, tableFile.rowCount - 1)),
    };
  }

  private getRangeFocusCell(): VirtualTableCellPosition | null {
    return this.rangeFocusCell ?? this.getNavigationCell();
  }

  private selectRangeToCell(
    target: VirtualTableCellPosition,
    reveal: boolean,
  ): boolean {
    const tableFile = this.props.tableState.file;
    if (!tableFile) {
      return false;
    }

    const anchor = this.rangeAnchorCell ?? this.getNavigationCell() ?? target;
    const range = VirtualTableGridModel.resolveCellRange(anchor, target);
    const didSelect = this.select({
      kind: "range",
      range: {
        ...range,
        fileId: tableFile.fileId,
        sheetId: tableFile.sheetId ?? null,
      },
    }, reveal);
    if (!didSelect) {
      return false;
    }

    this.rangeAnchorCell = anchor;
    this.rangeFocusCell = target;
    return true;
  }

  private getPageRowCount(): number {
    return Math.max(
      1,
      Math.floor(
        this.grid.getViewportClientHeight() /
          VirtualTableGridModel.getRowHeight(this.zoomPercent),
      ),
    );
  }

  private revealCell(cell: TableCell): void {
    if (this.grid.revealCell(
      cell.rowIndex,
      cell.colIndex,
      this.zoomPercent,
      colIndex => this.getColumnWidth(colIndex),
    )) {
      this.renderTable();
      this.syncHeaderScroll();
    }
  }

  private onBodyPointerDown(event: PointerEvent): void {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      this.columnResizeState
    ) {
      return;
    }

    const target = this.getBodyCellPositionFromEvent(event);
    if (!target) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    this.clearNativeSelection();
    this.endBodyRangeSelection();

    const didSelect = event.shiftKey
      ? this.selectRangeToCell(target, false)
      : this.selectBodyAnchorCell(target);
    if (!didSelect) {
      return;
    }

    this.beginBodyClickSuppression();
    this.bodyRangeSelectionState = {
      pointerId: event.pointerId,
    };
    this.element.classList.add("table_view--selecting_cells");
    this.focus();

    const targetWindow = this.element.ownerDocument.defaultView;
    if (!targetWindow) {
      return;
    }

    this.bodyRangeSelectionStore.add(addDisposableListener(
      targetWindow,
      EventType.POINTER_MOVE,
      moveEvent => {
        this.onBodyPointerMove(moveEvent as PointerEvent);
      },
      { passive: false },
    ));
    this.bodyRangeSelectionStore.add(addDisposableListener(targetWindow, EventType.POINTER_UP, event => {
      this.onBodyPointerUp(event as PointerEvent);
    }, { passive: false }));
    this.bodyRangeSelectionStore.add(addDisposableListener(targetWindow, "pointercancel", event => {
      this.onBodyPointerUp(event as PointerEvent);
    }, { passive: false }));
    this.bodyRangeSelectionStore.add(addDisposableListener(targetWindow, EventType.BLUR, () => {
      this.endBodyRangeSelection();
      this.releaseBodyClickSuppressionSoon();
    }));
  }

  private onBodyPointerMove(event: PointerEvent): void {
    const state = this.bodyRangeSelectionState;
    if (!state || event.pointerId !== state.pointerId) {
      return;
    }

    if ((event.buttons & 1) === 0) {
      this.endBodyRangeSelection();
      this.releaseBodyClickSuppressionSoon();
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    this.clearNativeSelection();

    const target = this.getBodyCellPositionFromEvent(event);
    if (!target || areActiveCellsEqual(this.rangeFocusCell, target)) {
      return;
    }

    if (this.selectRangeToCell(target, false)) {
      this.beginBodyClickSuppression();
    }
  }

  private onBodyPointerUp(event: PointerEvent): void {
    const state = this.bodyRangeSelectionState;
    if (!state || event.pointerId !== state.pointerId) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    this.clearNativeSelection();
    this.endBodyRangeSelection();
    this.releaseBodyClickSuppressionSoon();
    this.focus();
  }

  private endBodyRangeSelection(): void {
    if (this.bodyRangeSelectionState) {
      this.bodyRangeSelectionState = null;
      this.element.classList.remove("table_view--selecting_cells");
    }
    this.bodyRangeSelectionStore.clear();
  }

  private selectBodyAnchorCell(target: VirtualTableCellPosition): boolean {
    const tableFile = this.props.tableState.file;
    const didSelect = this.select({
      kind: "cell",
      cell: {
        colIndex: target.colIndex,
        fileId: tableFile?.fileId ?? null,
        rowIndex: target.rowIndex,
        sheetId: tableFile?.sheetId ?? null,
      },
    });
    if (!didSelect) {
      return false;
    }

    this.rangeAnchorCell = target;
    this.rangeFocusCell = target;
    return true;
  }

  private getBodyCellPositionFromEvent(
    event: Pick<PointerEvent | MouseEvent, "clientX" | "clientY" | "target">,
  ): VirtualTableCellPosition | null {
    return this.getBodyCellPositionFromTarget(event.target) ??
      this.getBodyCellPositionFromPoint(event.clientX, event.clientY);
  }

  private getBodyCellPositionFromPoint(
    clientX: number,
    clientY: number,
  ): VirtualTableCellPosition | null {
    if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) {
      return null;
    }

    const element = this.element.ownerDocument.elementFromPoint(clientX, clientY);
    return this.getBodyCellPositionFromTarget(element);
  }

  private getBodyCellPositionFromTarget(
    target: EventTarget | null,
  ): VirtualTableCellPosition | null {
    if (!(target instanceof HTMLElement)) {
      return null;
    }

    const cell = target.closest<HTMLTableCellElement>(".table_view_cell");
    if (!cell || cell.hidden || !this.grid.containsBodyTarget(cell)) {
      return null;
    }

    const rowIndex = Number(cell.dataset.rowIndex);
    const colIndex = Number(cell.dataset.colIndex);
    if (
      !Number.isInteger(rowIndex) ||
      rowIndex < 0 ||
      !Number.isInteger(colIndex) ||
      colIndex < 0
    ) {
      return null;
    }

    return { colIndex, rowIndex };
  }

  private clearNativeSelection(): void {
    const selection = this.element.ownerDocument.getSelection?.() ??
      this.element.ownerDocument.defaultView?.getSelection?.();
    selection?.removeAllRanges();
  }

  private beginBodyClickSuppression(): void {
    this.suppressNextBodyClick = true;
    this.clearBodyClickSuppressionTimeout();
  }

  private releaseBodyClickSuppressionSoon(): void {
    this.clearBodyClickSuppressionTimeout();
    const targetWindow = this.element.ownerDocument.defaultView;
    if (!targetWindow) {
      this.suppressNextBodyClick = false;
      return;
    }

    this.bodyClickSuppressionTimeout = targetWindow.setTimeout(() => {
      this.suppressNextBodyClick = false;
      this.bodyClickSuppressionTimeout = null;
    }, 50);
  }

  private clearBodyClickSuppression(): void {
    this.suppressNextBodyClick = false;
    this.clearBodyClickSuppressionTimeout();
  }

  private clearBodyClickSuppressionTimeout(): void {
    if (this.bodyClickSuppressionTimeout === null) {
      return;
    }

    this.element.ownerDocument.defaultView?.clearTimeout(this.bodyClickSuppressionTimeout);
    this.bodyClickSuppressionTimeout = null;
  }

  private onBodyClick(event: MouseEvent): void {
    if (this.suppressNextBodyClick) {
      this.clearBodyClickSuppression();
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    const target = this.getBodyCellPositionFromEvent(event);
    if (!target) {
      return;
    }

    const { tableState } = this.props;
    const tableFile = tableState.file;
    if (event.shiftKey && this.selectRangeToCell(target, true)) {
      this.focus();
      return;
    }

    this.rangeAnchorCell = null;
    this.rangeFocusCell = null;
    this.select({
      kind: "cell",
      cell: {
        colIndex: target.colIndex,
        fileId: tableFile?.fileId ?? null,
        rowIndex: target.rowIndex,
        sheetId: tableFile?.sheetId ?? null,
      },
    });
    this.focus();
  }

  private syncHeaderScroll(): void {
    this.grid.syncHeaderScroll();
    this.syncColumnResizeGuide();
  }

  private onTableScroll(): void {
    this.syncHeaderScroll();
    if (!this.isTableVisible()) {
      return;
    }

    this.renderTable();
  }
}

const toggleSelectedColumn = (
  selection: TableSelection,
  colIndex: number,
): readonly number[] => {
  const columns = new Set(selection.selectedColumns ?? []);
  if (columns.has(colIndex)) {
    columns.delete(colIndex);
  } else {
    columns.add(colIndex);
  }

  return Array.from(columns).sort((a, b) => a - b);
};

const resolveHeaderSelectedColumns = (
  selection: TableSelection,
  colIndex: number,
  mode: TableWidgetColumnHeaderSelectionMode,
): readonly number[] => {
  if (mode === "multi") {
    return toggleSelectedColumn(selection, colIndex);
  }

  return selection.selectedColumns?.length === 1 && selection.selectedColumns[0] === colIndex
    ? []
    : [colIndex];
};

const normalizeWidgetColumnIndex = (value: unknown): number | null => {
  const index = Math.floor(Number(value));
  return Number.isInteger(index) && index >= 0 ? index : null;
};

const getTableWidgetColumnWidthSourceKey = (
  sourceKey: string | null | undefined,
): string | null =>
  typeof sourceKey === "string" && sourceKey.trim() ? sourceKey.trim() : null;

const setColumnScaleControlColumnIndex = (
  control: TableValueStepperControl,
  colIndexValue: string,
): boolean => {
  let changed = false;
  for (const element of [
    control.decreaseButton,
    control.valueElement,
    control.increaseButton,
  ]) {
    if (element.dataset.colIndex !== colIndexValue) {
      element.dataset.colIndex = colIndexValue;
      changed = true;
    }
  }
  return changed;
};

const setHidden = (element: HTMLElement, hidden: boolean): boolean => {
  if (element.hidden === hidden) {
    return false;
  }

  element.hidden = hidden;
  return true;
};

const getTableWidgetInputKey = ({
  tableState,
}: TableWidgetProps): string => {
  const file = tableState.file;
  return [
    tableState.selectedFileId ?? "",
    tableState.selectedSheetId ?? "",
    tableState.sourceKey ?? "",
    tableState.loadState.state,
    tableState.loadState.message,
    file?.fileId ?? "",
    file?.sheetId ?? "",
    file?.sourceKey ?? "",
    file?.rowCount ?? "",
    file?.columnCount ?? "",
    tableState.displayVersion ?? "",
  ].join("\u001f");
};

const getCellDisplayTitle = (
  rawValue: unknown,
  displayText: string,
  profile: ColumnDisplayProfile,
): string => {
  if (profile.mode !== "columnScale" || !profile.isNumericColumn) {
    return "";
  }

  const rawText = formatRawCell(rawValue);
  if (!rawText || rawText === displayText) {
    return "";
  }

  return rawText;
};

const createCellDisplayHoverContent = (ownerDocument: Document, title: string): HTMLElement => {
  const container = ownerDocument.createElement("div");
  container.className = "table_view_cell_hover";
  for (const line of title.split("\n")) {
    const row = ownerDocument.createElement("div");
    row.className = "table_view_cell_hover_line";
    row.textContent = line;
    container.append(row);
  }
  return container;
};

const toColumnSet = (
  columnIndexes: readonly number[] | undefined,
  startColumnIndex: number,
  columnCount: number,
): Set<number> => {
  const columns = new Set<number>();
  const endColumnIndex = startColumnIndex + columnCount;
  for (const value of columnIndexes ?? []) {
    const columnIndex = Math.floor(Number(value));
    if (
      Number.isInteger(columnIndex) &&
      columnIndex >= startColumnIndex &&
      columnIndex < endColumnIndex
    ) {
      columns.add(columnIndex);
    }
  }
  return columns;
};

const toVisibleRanges = (
  ranges: readonly TableRange[] | undefined,
  startRowIndex: number,
  rowCount: number,
  startColumnIndex: number,
  columnCount: number,
): readonly VirtualTableCellRange[] => {
  const visibleRanges: VirtualTableCellRange[] = [];
  const endRowIndex = startRowIndex + rowCount - 1;
  const endColumnIndex = startColumnIndex + columnCount - 1;

  for (const range of ranges ?? []) {
    const startRow = Math.max(startRowIndex, Math.floor(Number(range.startRow)));
    const endRow = Math.min(endRowIndex, Math.floor(Number(range.endRow)));
    const startCol = Math.max(startColumnIndex, Math.floor(Number(range.startCol)));
    const endCol = Math.min(endColumnIndex, Math.floor(Number(range.endCol)));
    if (
      Number.isInteger(startRow) &&
      Number.isInteger(endRow) &&
      Number.isInteger(startCol) &&
      Number.isInteger(endCol) &&
      startRow <= endRow &&
      startCol <= endCol
    ) {
      visibleRanges.push({ startRow, endRow, startCol, endCol });
    }
  }

  return visibleRanges;
};

const isSelectedCell = (
  rowIndex: number,
  colIndex: number,
  state: Pick<AppliedCellState, "selectedColumns" | "selectedRanges">,
): boolean =>
  state.selectedColumns.has(colIndex) ||
  state.selectedRanges.some(range =>
    rowIndex >= range.startRow &&
    rowIndex <= range.endRow &&
    colIndex >= range.startCol &&
    colIndex <= range.endCol,
  );

const getSelectionFrame = (
  rowIndex: number,
  colIndex: number,
  ranges: readonly VirtualTableCellRange[],
): SelectionFrameEdges => {
  let top = false;
  let right = false;
  let bottom = false;
  let left = false;

  for (const range of ranges) {
    if (
      rowIndex < range.startRow ||
      rowIndex > range.endRow ||
      colIndex < range.startCol ||
      colIndex > range.endCol
    ) {
      continue;
    }

    top ||= rowIndex === range.startRow;
    right ||= colIndex === range.endCol;
    bottom ||= rowIndex === range.endRow;
    left ||= colIndex === range.startCol;
  }

  return { bottom, left, right, top };
};

const serializeSelectionFrame = (frame: SelectionFrameEdges): string =>
  `${frame.top ? "t" : ""}${frame.right ? "r" : ""}${frame.bottom ? "b" : ""}${frame.left ? "l" : ""}`;

const normalizeActiveCell = (
  cell: TableSelection["activeCell"],
  startRowIndex: number,
  rowCount: number,
  startColumnIndex: number,
  columnCount: number,
): ActiveCell | null => {
  const rowIndex = Math.floor(Number(cell?.rowIndex));
  const colIndex = Math.floor(Number(cell?.colIndex));
  const endColumnIndex = startColumnIndex + columnCount;
  if (
    !Number.isInteger(rowIndex) ||
    rowIndex < startRowIndex ||
    rowIndex >= startRowIndex + rowCount ||
    !Number.isInteger(colIndex) ||
    colIndex < startColumnIndex ||
    colIndex >= endColumnIndex
  ) {
    return null;
  }

  return {
    colIndex,
    rowIndex,
  };
};

const isActiveCell = (
  activeCell: ActiveCell | null,
  rowIndex: number,
  colIndex: number,
): boolean =>
  activeCell?.rowIndex === rowIndex &&
  activeCell.colIndex === colIndex;

const areActiveCellsEqual = (
  first: ActiveCell | null,
  second: ActiveCell | null,
): boolean => {
  if (!first || !second) {
    return !first && !second;
  }

  return first.rowIndex === second.rowIndex &&
    first.colIndex === second.colIndex;
};

const areCellRangesEqual = (
  first: readonly VirtualTableCellRange[],
  second: readonly VirtualTableCellRange[],
): boolean => {
  if (first.length !== second.length) {
    return false;
  }

  for (let index = 0; index < first.length; index += 1) {
    const left = first[index];
    const right = second[index];
    if (
      !left ||
      !right ||
      left.startRow !== right.startRow ||
      left.endRow !== right.endRow ||
      left.startCol !== right.startCol ||
      left.endCol !== right.endCol
    ) {
      return false;
    }
  }

  return true;
};

const getChangedColumns = (
  previous: Pick<AppliedCellState, "highlightedColumns" | "selectedColumns">,
  next: Pick<AppliedCellState, "highlightedColumns" | "selectedColumns">,
  startColumnIndex: number,
  columnCount: number,
): number[] => {
  const columns = new Set<number>();
  const endColumnIndex = startColumnIndex + columnCount;

  for (const colIndex of previous.selectedColumns) {
    if (!next.selectedColumns.has(colIndex)) {
      columns.add(colIndex);
    }
  }

  for (const colIndex of next.selectedColumns) {
    if (!previous.selectedColumns.has(colIndex)) {
      columns.add(colIndex);
    }
  }

  for (const colIndex of previous.highlightedColumns) {
    if (!next.highlightedColumns.has(colIndex)) {
      columns.add(colIndex);
    }
  }

  for (const colIndex of next.highlightedColumns) {
    if (!previous.highlightedColumns.has(colIndex)) {
      columns.add(colIndex);
    }
  }

  return Array.from(columns)
    .filter((colIndex) => colIndex >= startColumnIndex && colIndex < endColumnIndex)
    .sort((a, b) => a - b);
};

const getWheelDelta = (event: WheelEvent): number => {
  if (event.deltaY !== 0) {
    return event.deltaY;
  }

  return event.deltaX;
};
