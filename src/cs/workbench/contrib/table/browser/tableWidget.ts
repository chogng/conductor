import { addDisposableListener, EventType, isEditableElement } from "src/cs/base/browser/dom";
import { StandardKeyboardEvent, type IKeyboardEvent } from "src/cs/base/browser/keyboardEvent";
import type { Event } from "src/cs/base/common/event";
import { KeyCode } from "src/cs/base/common/keyCodes";
import { DisposableStore } from "src/cs/base/common/lifecycle";
import { Action } from "src/cs/base/common/actions";
import { Stepper } from "src/cs/base/browser/ui/stepper/stepper";
import { localize } from "src/cs/nls";
import {
  TableWidget as BaseTableWidget,
} from "src/cs/base/browser/ui/table/tableWidget";
import {
  PagedTableWidgetRenderer,
  type PagedTableBodyCellTemplateData,
} from "src/cs/base/browser/ui/table/tablePaging";
import type { CancellationToken } from "src/cs/base/common/cancellation";
import {
  TABLE_WIDGET_ZOOM_OPTIONS,
  type ITableBodyMouseEvent,
  type ITableCellDecorationRange,
  type ITableCellState,
  type ITableCellPosition,
  type ITableCellSelectionTarget,
  type ITableDirtyPatchOutcome,
  type ITableDirtyRange,
  type ITableColumnHeaderMouseEvent,
  type ITableKeyboardNavigationEvent,
  type ITableSize,
} from "src/cs/base/browser/ui/table/table";
import { VirtualTableGridModel } from "src/cs/base/browser/ui/table/virtualTable";
import { createEmptyView } from "src/cs/workbench/contrib/table/browser/emptyView";
import {
  createTableColumnScaleStepper,
  isTableColumnScaleStepperVisible,
  syncTableColumnScaleStepper,
} from "src/cs/workbench/contrib/table/browser/tableStepper";
import {
  createPerformanceStageRecorder,
  type PerformanceStageContext,
  type PerformanceStageState,
} from "src/cs/workbench/contrib/performance/browser/performanceMeasurements";
import {
  formatCell,
  formatRawCell,
  toSuperscriptExponent,
} from "src/cs/workbench/services/table/common/numericFormat";
import type { ColumnDisplayProfile } from "src/cs/workbench/services/table/common/tableDisplayProfile";
import {
  TableColumnLayout,
  type TableColumnSizingMode,
  type TableColumnWidth,
} from "src/cs/workbench/services/table/common/tableColumnLayout";
import {
  toTableSheetKey,
  type TableRangeDecoration,
  type TableSource,
} from "src/cs/workbench/services/table/common/table";

const TABLE_WIDGET_COLUMN_LAYOUT_STORAGE_DEBOUNCE_MS = 120;
const TABLE_WIDGET_COLUMN_SCALE_RESIZE_GUTTER_PX = 8;
const TABLE_WIDGET_AUTO_FIT_SAMPLE_ROW_COUNT = 32;
const TABLE_WIDGET_AUTO_FIT_SAMPLE_TEXT_MAX_LENGTH = 256;

export type TableWidgetColumnWidth = TableColumnWidth;

export type TableWidgetColumnWidthTarget = TableColumnWidth;

export type TableWidgetRevealMode = boolean | "force";

export type TableWidgetCell = {
  readonly sheetId?: string | null;
  readonly rowIndex: number;
  readonly colIndex: number;
};

export type TableWidgetSelectionRange = {
  readonly sheetId?: string | null;
  readonly startRow: number;
  readonly endRow: number;
  readonly startCol: number;
  readonly endCol: number;
};

export type TableWidgetSelection = {
  readonly activeCell?: TableWidgetCell | null;
  readonly selectedColumns?: readonly number[];
  readonly ranges?: readonly TableWidgetSelectionRange[];
};

export type TableWidgetFile = {
  readonly fileName: string;
  readonly sheetId?: string | null;
  readonly source?: TableSource | null;
  readonly sourceVersion?: number;
  readonly rowCount: number;
  readonly columnCount: number;
  readonly maxCellLengths: readonly number[];
};

export type TableWidgetLoadState = {
  readonly state: "idle" | "loading" | "ready" | "error";
  readonly message: string;
};

export type TableWidgetState = {
  readonly selectedSheetId?: string | null;
  readonly source?: TableSource | null;
  readonly fileName: string;
  readonly file: TableWidgetFile | null;
  readonly loadState: TableWidgetLoadState;
  readonly dimensions?: string;
  readonly displayVersion?: number;
};

type TableWidgetHighlight = {
  readonly columns?: readonly number[];
  readonly ranges?: readonly TableWidgetSelectionRange[];
};

type TableWidgetRowsVersionChangeEvent = {
  readonly full: boolean;
  readonly kind: "content" | "display" | "reset";
  readonly ranges: readonly ITableDirtyRange[];
  readonly version: number;
};

type ColumnWidthStorageTarget = {
  readonly source: TableSource;
  readonly storeColumnWidths: NonNullable<TableWidgetProps["storeColumnWidths"]>;
};

export type TableWidgetModel = {
  readonly getColumnDisplayProfile: (colIndex: number) => ColumnDisplayProfile;
  readonly get: (rowIndex: number) => unknown[];
  readonly getHighlight: () => TableWidgetHighlight;
  readonly getRangeDecorations: () => readonly TableRangeDecoration[];
  readonly getRowsVersion: () => number;
  readonly getSelection: () => TableWidgetSelection;
  readonly getState: () => TableWidgetState;
  readonly isResolved: (rowIndex: number) => boolean;
  readonly onDidChangeHighlight: (callback: (highlight: TableWidgetHighlight) => void) => () => void;
  readonly onDidChangeRangeDecorations: (callback: (decorations: readonly TableRangeDecoration[]) => void) => () => void;
  readonly onDidChangeRevealCell: (callback: (cell: TableWidgetCell | null) => void) => () => void;
  readonly onDidChangeSelection: (callback: (selection: TableWidgetSelection) => void) => () => void;
  readonly onDidChangeState: (callback: () => void) => () => void;
  readonly resolve: (rowIndex: number, cancellationToken: CancellationToken) => Promise<unknown[]>;
  readonly subscribeRowsVersion: (callback: (event: TableWidgetRowsVersionChangeEvent) => void) => () => void;
};

type TableState = TableWidgetState;
type TableSelection = TableWidgetSelection;
type TableCell = TableWidgetCell;
type TableRange = TableWidgetSelectionRange;

export type TableWidgetSelectionTarget =
  | { readonly kind: "cell"; readonly cell: TableCell | null }
  | { readonly kind: "range"; readonly range: TableRange }
  | { readonly kind: "columns"; readonly columns: readonly number[] };

export type TableWidgetColumnHeaderSelection = "disabled" | "single" | "multi";

export type TableWidgetProps = {
  readonly canAdjustColumnScale?: boolean;
  readonly columnHeaderSelection?: TableWidgetColumnHeaderSelection;
  readonly columnSizingMode: TableColumnSizingMode;
  readonly getColumnWidths?: (source: TableSource | null | undefined) => readonly TableColumnWidth[];
  readonly onCopySelection?: () => void;
  readonly onAdjustColumnDisplayScale?: (colIndex: number, deltaExponent: number) => boolean;
  readonly onResetColumnDisplayScale?: (colIndex: number) => boolean;
  readonly onSelect: (
    target: TableWidgetSelectionTarget | null,
    reveal?: TableWidgetRevealMode,
  ) => boolean;
  readonly storeColumnWidths?: (
    source: TableSource | null | undefined,
    widths: readonly TableColumnWidth[],
  ) => void;
  readonly tableViewModel: TableWidgetModel;
  readonly tableState: TableState;
};

type BodyCell = {
  readonly content: HTMLElement;
  readonly element: HTMLTableCellElement;
  appliedText?: string;
  appliedTitle?: string;
};

type BodyTemplateData = PagedTableBodyCellTemplateData<unknown[], BodyCell>;

type HeaderCell = {
  readonly button: HTMLButtonElement;
  readonly cell: HTMLElement;
  readonly resizeHandle: HTMLElement;
  readonly scaleBadge: HTMLButtonElement;
};

type BodyRangeSelectionState = {
  readonly pointerId: number;
};

export class TableWidget {
  public readonly element: HTMLElement;
  public readonly onDidChangeSize: Event<ITableSize>;
  public readonly onDidChangeZoom: Event<number>;
  private readonly store = new DisposableStore();
  private readonly grid: BaseTableWidget<BodyTemplateData, HeaderCell>;
  private readonly rowRenderer: PagedTableWidgetRenderer<unknown[], BodyCell, HeaderCell>;
  private readonly columnScaleDecreaseAction: Action;
  private readonly columnScaleIncreaseAction: Action;
  private readonly columnScaleResetAction: Action;
  private readonly columnScaleControl: Stepper;
  private readonly performance = createPerformanceStageRecorder(state => this.getPerformanceStageContext(state));
  private readonly bodyRangeSelectionStore = new DisposableStore();
  private disposeSelectionListener: (() => void) | null = null;
  private disposeHighlightListener: (() => void) | null = null;
  private disposeRangeDecorationListener: (() => void) | null = null;
  private disposeRevealCellListener: (() => void) | null = null;
  private disposeRowsVersionListener: (() => void) | null = null;
  private disposeStateListener: (() => void) | null = null;
  private layoutTimeoutId: number | null = null;
  private renderedInputKey: string | null = null;
  private renderedSheetKey: string | null = null;
  private columnWidthSheetKey: string | null = null;
  private columnWidthSource: TableSource | null = null;
  private columnWidths = new Map<number, number>();
  private autoFitColumnWidths = new Map<number, number>();
  private autoFitColumnWidthSignature: string | null = null;
  private pendingColumnWidthStorageTimeout: number | null = null;
  private pendingColumnWidthStorageTarget: ColumnWidthStorageTarget | null = null;
  private bodyRangeSelectionState: BodyRangeSelectionState | null = null;
  private suppressNextBodyClick = false;
  private bodyClickSuppressionTimeout: number | null = null;
  private hoveredColumnScaleColIndex: number | null = null;
  private columnScaleBadgeMeasureElement: HTMLButtonElement | null = null;
  private tracedBodyCellRenderCount = 0;
  private tracedHeaderCellRenderCount = 0;
  private props: TableWidgetProps;

  constructor(props: TableWidgetProps) {
    this.props = props;
    this.rowRenderer = this.store.add(new PagedTableWidgetRenderer(props.tableViewModel, {
      clearBodyCell: templateData => this.updateCellDisplay(templateData, "", ""),
      disposeBodyCellTemplate: () => undefined,
      renderBodyCell: () => {
        // The base table owns descriptor rebinding; workbench state is synchronized separately.
      },
      renderBodyCellContent: (templateData, descriptor) => {
        this.renderBodyCellContent(templateData, descriptor.row, descriptor.colIndex);
      },
      renderBodyCellPlaceholder: templateData => {
        this.updateCellDisplay(templateData, "", "");
      },
      renderBodyCellTemplate: (cell, content) => ({
        content,
        element: cell,
      }),
      renderColumnHeader: (templateData, descriptor) => {
        this.syncHeaderColumnElement(templateData, descriptor.colIndex, this.props.tableViewModel);
      },
      renderColumnHeaderTemplate: cell => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "table_view_column_button";
        const scaleBadge = document.createElement("button");
        scaleBadge.type = "button";
        scaleBadge.className = "table_view_column_scale_badge";
        const resizeHandle = this.grid.createColumnResizeHandle();
        cell.replaceChildren(button, scaleBadge, resizeHandle);
        return {
          button,
          cell,
          resizeHandle,
          scaleBadge,
        };
      },
      renderRowHeader: (cell, descriptor) => {
        const label = cell.firstElementChild;
        if (label) {
          label.textContent = VirtualTableGridModel.getRowLabel(descriptor.rowIndex);
        }
      },
    }));
    this.grid = this.store.add(new BaseTableWidget({
      columnResize: { enabled: this.isFixedColumnSizingMode(), mode: "commit" },
      getColumnWidth: colIndex => this.getColumnWidth(colIndex),
      keyboardNavigation: { enabled: true },
      renderer: this.rowRenderer,
      zoom: { wheel: true },
    }));
    this.element = this.grid.element;
    this.onDidChangeSize = this.grid.onDidChangeSize;
    this.onDidChangeZoom = this.grid.onDidChangeZoom;
    this.element.tabIndex = 0;
    this.element.setAttribute("role", "region");
    this.element.setAttribute("aria-label", localize("table.view.ariaLabel", "Table"));
    this.columnScaleDecreaseAction = this.store.add(new Action(
      "table.columnScale.decrease",
      localize("table.preview.decreaseColumnScale", "Decrease column scale exponent"),
      "",
      true,
      () => this.onColumnScaleControlAction("decrease"),
    ));
    this.columnScaleIncreaseAction = this.store.add(new Action(
      "table.columnScale.increase",
      localize("table.preview.increaseColumnScale", "Increase column scale exponent"),
      "",
      true,
      () => this.onColumnScaleControlAction("increase"),
    ));
    this.columnScaleResetAction = this.store.add(new Action(
      "table.columnScale.reset",
      localize("table.preview.resetColumnScale", "Reset column scale to automatic"),
      "",
      true,
      () => this.onColumnScaleControlAction("reset"),
    ));
    this.columnScaleControl = this.store.add(createTableColumnScaleStepper({
      decrease: this.columnScaleDecreaseAction,
      increase: this.columnScaleIncreaseAction,
      reset: this.columnScaleResetAction,
    }));
    this.element.append(this.columnScaleControl.element);
    // Base table events describe viewport facts; this widget keeps data and selection ownership.
    this.store.add(this.grid.onDidScroll(() => {
      this.onTableScroll();
    }));
    this.store.add(this.grid.onDidChangeVisibleRange(() => {
      this.onVisibleRangeChanged();
    }));
    this.store.add(this.grid.onDidClickHeader(event => {
      this.onHeaderClick(event);
    }));
    this.store.add(this.grid.onDidResizeColumn(event => {
      this.setColumnWidth(event);
    }));
    this.store.add(this.grid.onDidDoubleClickColumnResizeBoundary(event => {
      this.autoFitColumnWidth(event.colIndex);
    }));
    this.store.add(this.grid.onDidClickBody(event => {
      this.onBodyClick(event);
    }));
    this.store.add(this.grid.onDidPointerDownBody(event => {
      this.onBodyPointerDown(event);
    }));
    this.store.add(this.grid.onDidNavigateKeyboard(event => {
      this.onKeyboardNavigation(event);
    }));
    this.store.add(addDisposableListener(this.element, EventType.KEY_DOWN, event => {
      this.onShortcutKeyDown(event as KeyboardEvent);
    }));
    this.store.add(addDisposableListener(this.element, EventType.WHEEL, event => {
      this.onWheel(event as WheelEvent);
    }, { passive: false }));
    this.store.add(addDisposableListener(this.element, EventType.POINTER_MOVE, event => {
      this.onColumnScalePointerMove(event as PointerEvent);
    }));
    this.store.add(addDisposableListener(this.element, "pointerleave", () => {
      this.setHoveredColumnScaleTarget(null);
    }));
    this.store.add(this.bodyRangeSelectionStore);
    this.bindTableState(props.tableViewModel);
    this.syncColumnWidthSheet();
    this.renderedInputKey = getTableWidgetInputKey(props);
    this.syncCellState();
    this.render();
  }

  public update(props: TableWidgetProps): void {
    const previousModel = this.props.tableViewModel;
    const previousCanAdjustColumnScale = this.canAdjustColumnScale();
    const previousColumnSizingMode = this.props.columnSizingMode;
    const nextInputKey = getTableWidgetInputKey(props);
    this.props = props;
    if (previousColumnSizingMode !== props.columnSizingMode) {
      this.grid.setColumnResizeEnabled(this.isFixedColumnSizingMode());
      this.autoFitColumnWidthSignature = null;
    }
    if (previousModel !== props.tableViewModel) {
      this.rowRenderer.setModel(props.tableViewModel);
      this.bindTableState(props.tableViewModel);
    }
    this.syncColumnWidthSheet();
    if (previousModel === props.tableViewModel && previousCanAdjustColumnScale !== this.canAdjustColumnScale()) {
      this.syncVisibleHeaderColumnScaleBadges();
    }
    this.syncSharedColumnScaleControl();
    if (previousModel === props.tableViewModel && this.renderedInputKey === nextInputKey) {
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
    this.disposeRangeDecorationListener?.();
    this.disposeRangeDecorationListener = null;
    this.disposeRevealCellListener?.();
    this.disposeRevealCellListener = null;
    this.disposeRowsVersionListener?.();
    this.disposeRowsVersionListener = null;
    this.disposeStateListener?.();
    this.disposeStateListener = null;
    this.endBodyRangeSelection();
    this.clearBodyClickSuppression();
    this.columnScaleBadgeMeasureElement?.remove();
    this.columnScaleBadgeMeasureElement = null;
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
    const endTrace = this.performance.start("table.layout");
    let renderedTable = false;
    let secondLayout = false;
    try {
      this.clearScheduledLayout();
      this.grid.layout();
      if (this.shouldRenderTableOnLayout()) {
        this.invalidateAutoFitColumnWidthsForLayout();
        renderedTable = true;
        const needsLayout = this.renderTable();
        if (needsLayout) {
          secondLayout = true;
          this.grid.layout();
        }
      }
      this.syncHeaderScroll();
    } finally {
      endTrace({
        renderedTable,
        secondLayout,
      });
    }
  }

  public focus(): void {
    this.element.focus({ preventScroll: true });
  }

  public getSelection(): TableSelection {
    return this.props.tableViewModel.getSelection();
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
      return true;
    }

    if (target.kind === "cell") {
      if (reveal && target.cell) {
        this.revealCell(target.cell);
      }
    }

    if (reveal && target.kind === "range") {
      this.revealCell({
        colIndex: target.range.endCol,
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
    return this.grid.getZoomPercent();
  }

  public getSize(): ITableSize {
    return this.grid.getSize();
  }

  public resetZoom(): boolean {
    return this.setZoomPercent(TABLE_WIDGET_ZOOM_OPTIONS.defaultPercent);
  }

  public zoomIn(): boolean {
    return this.applyZoomChange(() => this.grid.zoomIn());
  }

  public zoomOut(): boolean {
    return this.applyZoomChange(() => this.grid.zoomOut());
  }

  private setZoomPercent(zoomPercent: number): boolean {
    return this.applyZoomChange(() => this.grid.setZoomPercent(zoomPercent));
  }

  private applyZoomChange(callback: () => boolean): boolean {
    if (!callback()) {
      return false;
    }

    this.render();
    return true;
  }

  public setColumnWidth(target: TableWidgetColumnWidthTarget): boolean {
    if (!this.isFixedColumnSizingMode()) {
      return false;
    }

    const colIndex = normalizeWidgetColumnIndex(target?.colIndex);
    if (colIndex === null) {
      return false;
    }

    const previousWidth = this.getColumnWidth(colIndex);
    const endTrace = this.performance.start("table.columnWidth.set", {
      colIndex,
      previousWidth,
      requestedWidth: Number(target.width),
    });
    let changed = false;
    let renderedTable = false;
    let laidOut = false;
    const width = TableColumnLayout.clampWidth(Number(target.width));
    try {
      if (previousWidth === width) {
        return false;
      }

      changed = true;
      this.columnWidths = new Map(this.columnWidths);
      if (width === TableColumnLayout.defaultWidth) {
        this.columnWidths.delete(colIndex);
      } else {
        this.columnWidths.set(colIndex, width);
      }
      this.scheduleStoreColumnWidths();

      if (this.isTableVisible()) {
        renderedTable = true;
        this.renderTable();
        laidOut = true;
        this.layoutNow();
      }
      return true;
    } finally {
      endTrace({
        changed,
        colIndex,
        laidOut,
        previousWidth,
        renderedTable,
        width,
      });
    }
  }

  private autoFitColumnWidth(colIndex: number): boolean {
    const tableFile = this.props.tableState.file;
    if (!this.isFixedColumnSizingMode() || !tableFile) {
      return false;
    }

    const normalizedColIndex = normalizeWidgetColumnIndex(colIndex);
    if (normalizedColIndex === null || normalizedColIndex >= tableFile.columnCount) {
      return false;
    }

    return this.setColumnWidth({
      colIndex: normalizedColIndex,
      width: this.resolveAutoFitColumnWidth(tableFile, normalizedColIndex),
    });
  }

  private resolveAutoFitColumnWidth(
    file: TableWidgetFile,
    colIndex: number,
  ): number {
    const profile = this.props.tableViewModel.getColumnDisplayProfile(colIndex);
    return this.grid.measureColumnAutoFitWidth({
      bodyTexts: this.getAutoFitColumnBodyTexts(file, colIndex, profile),
      headerAccessoryWidth: this.measureColumnScaleBadgeWidth(profile),
      headerText: VirtualTableGridModel.getColumnLabel(colIndex),
      maximumWidth: TableColumnLayout.maxWidth,
      minimumWidth: TableColumnLayout.autoFitMinWidth,
    });
  }

  private getAutoFitColumnBodyTexts(
    file: TableWidgetFile,
    colIndex: number,
    profile: ColumnDisplayProfile,
  ): readonly string[] {
    const texts = new Set<string>();
    const lengthSample = createAutoFitLengthSample(file.maxCellLengths[colIndex]);
    if (lengthSample) {
      texts.add(lengthSample);
    }

    const sampleRowCount = Math.min(file.rowCount, TABLE_WIDGET_AUTO_FIT_SAMPLE_ROW_COUNT);
    for (let rowIndex = 0; rowIndex < sampleRowCount; rowIndex += 1) {
      this.addAutoFitColumnBodyText(texts, rowIndex, colIndex, profile);
    }

    const { rowRange } = this.grid.getState();
    for (let rowIndex = rowRange.startIndex; rowIndex < rowRange.endIndex; rowIndex += 1) {
      this.addAutoFitColumnBodyText(texts, rowIndex, colIndex, profile);
    }

    return Array.from(texts);
  }

  private addAutoFitColumnBodyText(
    texts: Set<string>,
    rowIndex: number,
    colIndex: number,
    profile: ColumnDisplayProfile,
  ): void {
    if (!this.props.tableViewModel.isResolved(rowIndex)) {
      return;
    }

    texts.add(formatCell(this.props.tableViewModel.get(rowIndex)[colIndex], profile));
  }

  private measureColumnScaleBadgeWidth(profile: ColumnDisplayProfile): number {
    if (!isTableColumnScaleStepperVisible(profile)) {
      return 0;
    }

    const badge = this.getColumnScaleBadgeMeasureElement();
    badge.textContent = getColumnScaleValueText(profile);
    badge.dataset.interactive = this.canAdjustColumnScale() ? "true" : "false";
    const style = badge.ownerDocument.defaultView?.getComputedStyle(badge);
    const rect = badge.getBoundingClientRect();
    return rect.width + getCssPixelValue(style?.marginLeft) + getCssPixelValue(style?.marginRight);
  }

  private getColumnScaleBadgeMeasureElement(): HTMLButtonElement {
    if (this.columnScaleBadgeMeasureElement) {
      return this.columnScaleBadgeMeasureElement;
    }

    const badge = this.element.ownerDocument.createElement("button");
    badge.type = "button";
    badge.className = "table_view_column_scale_badge";
    badge.style.position = "absolute";
    badge.style.visibility = "hidden";
    badge.style.pointerEvents = "none";
    badge.style.contain = "layout style";
    badge.tabIndex = -1;
    this.element.append(badge);
    this.columnScaleBadgeMeasureElement = badge;
    return badge;
  }

  private syncColumnWidthSheet(): void {
    const source = getTableWidgetSource(this.props.tableState);
    const sheetKey = getTableWidgetColumnWidthSheetKey(source);
    if (this.columnWidthSheetKey === sheetKey) {
      return;
    }

    this.flushPendingColumnWidthStorage();
    this.columnWidthSheetKey = sheetKey;
    this.columnWidthSource = source;
    this.columnWidths = this.restoreColumnWidths(source);
    this.autoFitColumnWidthSignature = null;
  }

  private restoreColumnWidths(source: TableSource | null): Map<number, number> {
    if (!source || !this.props.getColumnWidths) {
      return new Map();
    }

    return new Map(
      this.props.getColumnWidths(source).map(width => [width.colIndex, width.width]),
    );
  }

  private syncAutoFitColumnWidths(tableFile: TableWidgetFile): boolean {
    if (this.isFixedColumnSizingMode()) {
      if (this.autoFitColumnWidths.size === 0 && this.autoFitColumnWidthSignature === null) {
        return false;
      }

      this.autoFitColumnWidths = new Map();
      this.autoFitColumnWidthSignature = null;
      return true;
    }

    const signature = getAutoFitColumnWidthSignature(
      this.props.tableState,
      tableFile,
      this.props.tableViewModel.getRowsVersion(),
    );
    if (this.autoFitColumnWidthSignature === signature) {
      return false;
    }

    const nextWidths = new Map<number, number>();
    const columnCount = Math.max(0, Math.floor(Number(tableFile.columnCount) || 0));
    for (let colIndex = 0; colIndex < columnCount; colIndex += 1) {
      nextWidths.set(colIndex, this.resolveAutoFitColumnWidth(tableFile, colIndex));
    }

    const changed = !areColumnWidthMapsEqual(this.autoFitColumnWidths, nextWidths);
    this.autoFitColumnWidths = nextWidths;
    this.autoFitColumnWidthSignature = signature;
    return changed;
  }

  private invalidateAutoFitColumnWidthsForLayout(): void {
    if (!this.isFixedColumnSizingMode()) {
      this.autoFitColumnWidthSignature = null;
    }
  }

  private getColumnWidths(): readonly TableWidgetColumnWidth[] {
    return Array.from(this.columnWidths.entries())
      .sort(([left], [right]) => left - right)
      .map(([colIndex, width]) => ({ colIndex, width }));
  }

  private scheduleStoreColumnWidths(): void {
    const storeColumnWidths = this.props.storeColumnWidths;
    const source = this.columnWidthSource;
    if (!storeColumnWidths || !source) {
      return;
    }

    this.pendingColumnWidthStorageTarget = { source, storeColumnWidths };
    const targetWindow = this.element.ownerDocument.defaultView;
    if (!targetWindow) {
      this.storePendingColumnWidths();
      return;
    }

    if (this.pendingColumnWidthStorageTimeout !== null) {
      targetWindow.clearTimeout(this.pendingColumnWidthStorageTimeout);
    }

    this.pendingColumnWidthStorageTimeout = targetWindow.setTimeout(() => {
      this.pendingColumnWidthStorageTimeout = null;
      this.storePendingColumnWidths();
    }, TABLE_WIDGET_COLUMN_LAYOUT_STORAGE_DEBOUNCE_MS);
  }

  private flushPendingColumnWidthStorage(): void {
    if (this.pendingColumnWidthStorageTimeout === null) {
      return;
    }

    const targetWindow = this.element.ownerDocument.defaultView;
    targetWindow?.clearTimeout(this.pendingColumnWidthStorageTimeout);
    this.pendingColumnWidthStorageTimeout = null;
    this.storePendingColumnWidths();
  }

  private storePendingColumnWidths(): void {
    const target = this.pendingColumnWidthStorageTarget;
    this.pendingColumnWidthStorageTarget = null;
    if (!target) {
      return;
    }

    target.storeColumnWidths(target.source, this.getColumnWidths());
  }

  public scrollHorizontally(delta: number): boolean {
    return this.grid.scrollHorizontally(delta);
  }

  private bindTableState(tableViewModel: TableWidgetModel): void {
    this.disposeSelectionListener?.();
    this.disposeHighlightListener?.();
    this.disposeRangeDecorationListener?.();
    this.disposeRevealCellListener?.();
    this.disposeRowsVersionListener?.();
    this.disposeStateListener?.();
    this.disposeSelectionListener = tableViewModel.onDidChangeSelection(() => {
      this.syncCellState();
    });
    this.disposeRowsVersionListener = tableViewModel.subscribeRowsVersion(event => {
      this.syncRows(event);
    });
    this.disposeHighlightListener = tableViewModel.onDidChangeHighlight(() => {
      this.syncCellState();
    });
    this.disposeRangeDecorationListener = tableViewModel.onDidChangeRangeDecorations(() => {
      this.syncCellState();
    });
    this.disposeRevealCellListener = tableViewModel.onDidChangeRevealCell((cell) => {
      if (cell) {
        this.revealCell(cell);
      }
    });
    this.disposeStateListener = tableViewModel.onDidChangeState(() => {
      this.props = {
        ...this.props,
        tableState: tableViewModel.getState(),
      };
      this.renderedInputKey = getTableWidgetInputKey(this.props);
      this.syncCellState();
      this.render();
    });
  }

  private render(): void {
    const endTrace = this.performance.start("table.widget.render");
    let outcome = "table";
    let didAttachContent = false;
    let needsLayout = false;
    try {
      const { tableState } = this.props;
      const tableFile = tableState.file;
      const sheetKey = getTableWidgetSheetKey(tableState);
      const keepRenderedTableWhilePendingSource = this.shouldKeepRenderedTableWhilePendingSource(
        tableFile,
        sheetKey,
      );
      if (
        !keepRenderedTableWhilePendingSource &&
        this.element.dataset.state !== tableState.loadState.state
      ) {
        this.element.dataset.state = tableState.loadState.state;
      }

      if (this.renderedSheetKey !== sheetKey && !keepRenderedTableWhilePendingSource) {
        this.renderedSheetKey = sheetKey;
        this.grid.selectCell(null);
        this.grid.resetScrollTop();
      }

      if (!sheetKey || !tableFile) {
        if (keepRenderedTableWhilePendingSource) {
          outcome = "loadingPreviousTable";
          didAttachContent = this.grid.attachContent();
          this.grid.setHeaderVisible(true);
          this.layoutNow();
          this.syncHeaderScroll();
          return;
        }

        outcome = tableState.loadState.state === "error" ? "emptyError" : "empty";
        this.grid.setHeaderVisible(false);
        this.resetGridSize();
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
        this.layoutNow();
        return;
      }

      if (tableState.loadState.state === "error") {
        outcome = "error";
        this.grid.setHeaderVisible(false);
        this.resetGridSize();
        this.grid.replaceViewportContent(createEmptyView({
          title: localize("table.preview.unreadableTitle", "File content cannot be decoded"),
          description: tableState.loadState.message ||
            localize("table.preview.unreadableHint", "The system cannot confirm this file is a valid CSV table."),
        }));
        this.layoutNow();
        return;
      }

      if (tableState.loadState.state === "loading") {
        if (keepRenderedTableWhilePendingSource) {
          outcome = "loadingRenderedTable";
          didAttachContent = this.grid.attachContent();
          this.grid.setHeaderVisible(true);
          if (didAttachContent) {
            this.layoutNow();
          }
          this.syncHeaderScroll();
          return;
        }

        outcome = "loading";
        this.grid.setHeaderVisible(false);
        this.resetGridSize();
        this.grid.replaceViewportContent(createEmptyView({
          title: localize("table.preview.loadingTitle", "Loading preview..."),
          description: tableState.loadState.message ||
            localize("table.preview.loadingHint", "Parsing CSV preview, please wait."),
        }));
        this.layoutNow();
        return;
      }

      didAttachContent = this.grid.attachContent();
      needsLayout = this.renderTable();
      if (didAttachContent || needsLayout) {
        this.layoutNow();
      }
      this.syncHeaderScroll();
    } finally {
      endTrace({
        didAttachContent,
        needsLayout,
        outcome,
      });
    }
  }

  private renderTable(): boolean {
    const endTrace = this.performance.start("table.renderTable");
    const { tableState } = this.props;
    const tableFile = tableState.file;
    const bodyCellRenderCountStart = this.tracedBodyCellRenderCount;
    const headerCellRenderCountStart = this.tracedHeaderCellRenderCount;
    let gridChanged = false;
    let autoFitColumnsChanged = false;
    let outcome = "table";

    try {
      if (!tableFile || tableFile.rowCount <= 0 || tableFile.columnCount <= 0) {
        if (this.shouldKeepRenderedTableWhilePendingSource(
          tableFile,
          getTableWidgetSheetKey(tableState),
        )) {
          outcome = "pendingSource";
          this.grid.attachContent();
          this.grid.setHeaderVisible(true);
          return false;
        }

        outcome = "empty";
        this.grid.setHeaderVisible(false);
        this.resetGridSize();
        this.grid.replaceViewportContent(createEmptyView({
          description: localize("table.preview.emptyHint", "Select a file to preview"),
        }));
        return true;
      }

      this.grid.setHeaderVisible(true);
      autoFitColumnsChanged = this.syncAutoFitColumnWidths(tableFile);
      gridChanged = this.grid.render({
        columnCount: tableFile.columnCount,
        headerRenderVersion: this.getHeaderRenderVersion(),
        renderVersion: this.getRowsRenderVersion(),
        rowCount: tableFile.rowCount,
      });
      this.syncCellState();

      return gridChanged;
    } finally {
      endTrace({
        bodyCellRenderCount: this.tracedBodyCellRenderCount - bodyCellRenderCountStart,
        autoFitColumnsChanged,
        gridChanged,
        headerCellRenderCount: this.tracedHeaderCellRenderCount - headerCellRenderCountStart,
        outcome,
      });
    }
  }

  private resetGridSize(): void {
    this.hideColumnScaleControl();
    this.autoFitColumnWidths = new Map();
    this.autoFitColumnWidthSignature = null;
    this.grid.render({
      columnCount: 0,
      headerRenderVersion: this.getHeaderRenderVersion(),
      renderVersion: this.getRowsRenderVersion(),
      rowCount: 0,
    });
  }

  private syncHeaderColumnElement(
    header: HeaderCell,
    colIndex: number,
    tableViewModel: TableWidgetModel,
  ): void {
    this.tracedHeaderCellRenderCount += 1;
    const columnLabel = VirtualTableGridModel.getColumnLabel(colIndex);
    const profile = tableViewModel.getColumnDisplayProfile(colIndex);
    const colIndexValue = String(colIndex);
    setDatasetValue(header.cell, "tableViewColumnIndex", colIndexValue);
    setDatasetValue(header.button, "colIndex", colIndexValue);
    setElementText(header.button, columnLabel);
    setElementAttribute(
      header.button,
      "aria-label",
      localize("table.preview.toggleColumn", "Toggle column {column}", {
        column: columnLabel,
      }),
    );
    setDatasetValue(header.resizeHandle, "colIndex", colIndexValue);
    setElementAttribute(
      header.resizeHandle,
      "aria-label",
      localize("table.preview.resizeColumn", "Resize column {column}", {
        column: columnLabel,
      }),
    );
    this.syncHeaderColumnScaleBadge(header.scaleBadge, colIndex, columnLabel, profile);
    setElementAttribute(header.cell, "aria-colindex", String(colIndex + 1));
  }

  private syncHeaderColumnScaleBadge(
    badge: HTMLButtonElement,
    colIndex: number,
    columnLabel: string,
    profile: ColumnDisplayProfile,
  ): boolean {
    const showBadge = isTableColumnScaleStepperVisible(profile);
    let changed = setHidden(badge, !showBadge);
    if (!showBadge) {
      return changed;
    }

    const colIndexValue = String(colIndex);
    if (setDatasetValue(badge, "colIndex", colIndexValue)) {
      changed = true;
    }

    const valueText = getColumnScaleValueText(profile);
    if (setElementText(badge, valueText)) {
      changed = true;
    }

    const canAdjust = this.canAdjustColumnScale();
    if (setDatasetValue(badge, "interactive", canAdjust ? "true" : "false")) {
      changed = true;
    }
    if (setElementAttribute(badge, "aria-disabled", canAdjust ? "false" : "true")) {
      changed = true;
    }
    const tabIndex = canAdjust ? 0 : -1;
    if (badge.tabIndex !== tabIndex) {
      badge.tabIndex = tabIndex;
      changed = true;
    }

    if (setElementAttribute(
      badge,
      "aria-label",
      canAdjust
        ? localize("table.preview.showColumnScaleControl", "Show column {column} scale controls, {scale}", {
          column: columnLabel,
          scale: valueText,
        })
        : localize("table.preview.columnScaleReadonly", "Column {column} scale {scale}", {
          column: columnLabel,
          scale: valueText,
        }),
    )) {
      changed = true;
    }

    return changed;
  }

  private syncRows(event: TableWidgetRowsVersionChangeEvent): void {
    const endTrace = this.performance.start("table.rows.sync", {
      dirtyRangeCount: event.ranges.length,
      full: event.full,
      kind: event.kind,
      rowsVersion: event.version,
    });
    let patchResult: ITableDirtyPatchOutcome = "full";
    let tableVisible = false;
    const bodyCellRenderCountStart = this.tracedBodyCellRenderCount;
    try {
      const shouldSyncAutoFitColumnWidths = !this.isFixedColumnSizingMode();
      tableVisible = this.isTableVisible();
      if (shouldSyncAutoFitColumnWidths) {
        this.autoFitColumnWidthSignature = null;
      }
      if (!tableVisible) {
        this.render();
        return;
      }

      if (shouldSyncAutoFitColumnWidths) {
        if (this.renderTable()) {
          this.layoutNow();
        }
        this.syncHeaderScroll();
        return;
      }

      patchResult = this.patchDirtyRows(event);
      if (patchResult === "full") {
        this.renderTable();
      }
      this.syncHeaderScroll();
    } finally {
      endTrace({
        bodyCellRenderCount: this.tracedBodyCellRenderCount - bodyCellRenderCountStart,
        patchResult,
        tableVisible,
      });
    }
  }

  private patchDirtyRows(event: TableWidgetRowsVersionChangeEvent): ITableDirtyPatchOutcome {
    const includeColumnHeaders = event.kind === "display";
    const result = this.grid.patchDirtyCells({
      full: event.full || event.kind === "reset",
      ranges: event.ranges,
      bodyRenderVersion: this.getRowsRenderVersion(),
      ...(includeColumnHeaders
        ? {
          columnHeaderRenderVersion: this.getHeaderRenderVersion(),
          includeColumnHeaders,
        }
        : {}),
    });
    if (result.columnHeaders === "patched") {
      this.syncSharedColumnScaleControl();
    }

    return result.outcome;
  }

  private syncVisibleHeaderColumnScaleBadges(): void {
    const { columnRange } = this.grid.getState();
    for (let columnOffset = 0; columnOffset < columnRange.renderedCount; columnOffset += 1) {
      const header = this.grid.getColumnHeaderTemplateData(columnOffset);
      if (!header || header.cell.hidden) {
        continue;
      }

      const profile = this.props.tableViewModel.getColumnDisplayProfile(columnRange.startIndex + columnOffset);
      this.syncHeaderColumnScaleBadge(
        header.scaleBadge,
        columnRange.startIndex + columnOffset,
        VirtualTableGridModel.getColumnLabel(columnRange.startIndex + columnOffset),
        profile,
      );
    }
  }

  private getRowsRenderVersion(): string {
    const tableFile = this.props.tableState.file;
    return [
      this.renderedSheetKey ?? "",
      tableFile?.sourceVersion ?? "",
      this.props.tableViewModel.getRowsVersion(),
      this.props.tableState.displayVersion ?? 0,
    ].join("\u001f");
  }

  private getHeaderRenderVersion(): string {
    const tableFile = this.props.tableState.file;
    return [
      getTableWidgetSheetKey(this.props.tableState) ?? "",
      tableFile?.sourceVersion ?? "",
      this.props.tableViewModel.getRowsVersion(),
      this.props.tableState.displayVersion ?? 0,
    ].join("\u001f");
  }

  private getPerformanceStageContext(state: PerformanceStageState): PerformanceStageContext {
    const { tableState } = this.props;
    const tableFile = tableState.file;
    const { columnRange, rowRange } = this.grid.getState();
    const measurement = {
      visibleColumns: columnRange.renderedCount,
      visibleRows: rowRange.renderedCount,
    };
    if (!state.trace) {
      return { measurement };
    }

    return {
      measurement,
      trace: {
        columnCount: tableFile?.columnCount ?? 0,
        displayVersion: tableState.displayVersion ?? null,
        loadState: tableState.loadState.state,
        rowCount: tableFile?.rowCount ?? 0,
        sheetKey: getTableWidgetSheetKey(tableState),
        visibleColumnStart: columnRange.startIndex,
        visibleColumns: columnRange.renderedCount,
        visibleRowStart: rowRange.startIndex,
        visibleRows: rowRange.renderedCount,
        zoomPercent: this.grid.getZoomPercent(),
      },
    };
  }

  private renderBodyCellContent(
    cell: BodyCell,
    row: readonly unknown[],
    colIndex: number,
  ): void {
    this.tracedBodyCellRenderCount += 1;
    const rawValue = row[colIndex];
    const profile = this.props.tableViewModel.getColumnDisplayProfile(colIndex);
    const displayText = formatCell(rawValue, profile);
    this.updateCellDisplay(
      cell,
      displayText,
      getCellDisplayTitle(rawValue, displayText, profile),
    );
  }

  private syncCellState(): void {
    const { tableViewModel } = this.props;
    const selection = tableViewModel.getSelection();
    const cellState: ITableCellState = {
      activeCell: selection.activeCell ?? null,
      decorationRanges: tableViewModel.getRangeDecorations().map(toTableCellDecorationRange),
      highlightedColumns: tableViewModel.getHighlight().columns ?? [],
      selectedColumns: selection.selectedColumns ?? [],
      selectedRanges: selection.ranges ?? [],
    };
    this.grid.setCellState(cellState);
    this.syncSharedColumnScaleControl();
  }

  private isTableVisible(): boolean {
    return this.grid.isContentVisible();
  }

  private shouldKeepRenderedTableWhilePendingSource(
    tableFile: TableWidgetState["file"] | null | undefined,
    sheetKey: string | null,
  ): boolean {
    const hasSelectedSheet = Boolean(sheetKey);
    const isPendingSelectedSheet = hasSelectedSheet &&
      !tableFile &&
      this.props.tableState.loadState.state !== "error";
    const isLoadingSheet = hasSelectedSheet &&
      this.props.tableState.loadState.state === "loading";
    if (!isPendingSelectedSheet && !isLoadingSheet) {
      return false;
    }

    return this.grid.isContentAttached();
  }

  private shouldRenderTableOnLayout(): boolean {
    const { tableState } = this.props;
    return this.grid.isContentAttached() &&
      tableState.loadState.state !== "loading" &&
      Boolean(getTableWidgetSheetKey(tableState) && tableState.file);
  }

  private updateCellDisplay(cell: BodyCell, text: string, title: string): void {
    if (cell.appliedText !== text) {
      cell.content.textContent = text;
      cell.appliedText = text;
    }
    if (cell.appliedTitle !== title) {
      if (title) {
        cell.element.removeAttribute("title");
        this.grid.setBodyCellElementHoverContent(
          cell.element,
          createCellDisplayHoverContent(cell.element.ownerDocument, title),
          { appearance: { compact: true } },
        );
      } else {
        cell.element.removeAttribute("title");
        this.grid.setBodyCellElementHoverContent(cell.element, undefined);
      }
      cell.appliedTitle = title;
    }
  }

  private onHeaderClick(event: ITableColumnHeaderMouseEvent): void {
    const browserEvent = event.browserEvent;
    const mouseEvent = event.mouseEvent;
    const target = getElementFromEventTarget(browserEvent.target);
    if (!target) {
      return;
    }

    const scaleBadge = target.closest<HTMLButtonElement>(".table_view_column_scale_badge");
    if (scaleBadge && this.canAdjustColumnScale() && this.grid.containsHeaderTarget(scaleBadge)) {
      const colIndex = normalizeWidgetColumnIndex(scaleBadge.dataset.colIndex);
      if (colIndex !== null) {
        this.setHoveredColumnScaleTarget(colIndex);
      }
      mouseEvent.preventDefault();
      mouseEvent.stopPropagation();
      return;
    }

    const colIndex = event.column?.colIndex;
    if (typeof colIndex !== "number") {
      return;
    }

    const selectionMode = this.props.columnHeaderSelection ?? "single";
    if (selectionMode === "disabled") {
      mouseEvent.preventDefault();
      mouseEvent.stopPropagation();
      return;
    }

    this.select({
      kind: "columns",
      columns: resolveHeaderSelectedColumns(
        this.getSelection(),
        colIndex,
        selectionMode,
      ),
    });
    this.focus();
  }

  private onColumnScaleControlAction(action: "decrease" | "increase" | "reset"): void {
    if (!this.canAdjustColumnScale()) {
      return;
    }

    const colIndex = normalizeWidgetColumnIndex(this.columnScaleControl.element.dataset.colIndex);
    if (colIndex === null) {
      return;
    }

    let changed = false;
    if (action === "decrease") {
      changed = this.props.onAdjustColumnDisplayScale?.(colIndex, -1) ?? false;
    } else if (action === "increase") {
      changed = this.props.onAdjustColumnDisplayScale?.(colIndex, 1) ?? false;
    } else if (action === "reset") {
      changed = this.props.onResetColumnDisplayScale?.(colIndex) ?? false;
    }

    if (!changed) {
      return;
    }

    this.focus();
    this.syncSharedColumnScaleControl();
  }

  private onColumnScalePointerMove(event: PointerEvent): void {
    if (!this.canAdjustColumnScale()) {
      this.setHoveredColumnScaleTarget(null);
      return;
    }

    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }

    if (
      this.columnScaleControl.element.contains(target) ||
      this.isColumnScalePointerWithinActiveSurface(event)
    ) {
      return;
    }

    const headerCell = target.closest<HTMLElement>("[data-table-view-column-index]");
    if (headerCell && this.grid.containsHeaderTarget(headerCell)) {
      this.setHoveredColumnScaleTarget(normalizeWidgetColumnIndex(headerCell.dataset.tableViewColumnIndex));
      return;
    }

    this.setHoveredColumnScaleTarget(null);
  }

  private isColumnScalePointerWithinActiveSurface(event: Pick<PointerEvent, "clientX" | "clientY">): boolean {
    const colIndex = this.resolveColumnScaleTarget();
    if (colIndex === null) {
      return false;
    }

    if (isPointInsideElement(this.columnScaleControl.element, event.clientX, event.clientY)) {
      return true;
    }

    const { columnRange } = this.grid.getState();
    const columnOffset = colIndex - columnRange.startIndex;
    if (columnOffset < 0 || columnOffset >= columnRange.renderedCount) {
      return false;
    }

    const headerCell = this.grid.getColumnHeaderCellElement(columnOffset);
    if (headerCell && !headerCell.hidden && isPointInsideElement(headerCell, event.clientX, event.clientY)) {
      return true;
    }
    return false;
  }

  private setHoveredColumnScaleTarget(colIndex: number | null): void {
    if (this.hoveredColumnScaleColIndex === colIndex) {
      return;
    }

    this.hoveredColumnScaleColIndex = colIndex;
    this.syncSharedColumnScaleControl();
  }

  private syncSharedColumnScaleControl(): void {
    if (!this.canAdjustColumnScale()) {
      this.hideColumnScaleControl();
      return;
    }

    const colIndex = this.resolveColumnScaleTarget();
    if (colIndex === null) {
      this.hideColumnScaleControl();
      return;
    }

    const profile = this.props.tableViewModel.getColumnDisplayProfile(colIndex);
    if (!isTableColumnScaleStepperVisible(profile)) {
      this.hideColumnScaleControl();
      return;
    }

    this.columnScaleResetAction.enabled = Boolean(profile.isScaleManual);
    syncTableColumnScaleStepper(this.columnScaleControl, colIndex, profile);
    this.positionColumnScaleControl(colIndex);
  }

  private resolveColumnScaleTarget(): number | null {
    if (this.hoveredColumnScaleColIndex !== null) {
      return this.hoveredColumnScaleColIndex;
    }

    const selectedColumns = this.getSelection().selectedColumns;
    if (selectedColumns?.length !== 1) {
      return null;
    }

    return normalizeWidgetColumnIndex(selectedColumns[0]);
  }

  private hideColumnScaleControl(): void {
    setHidden(this.columnScaleControl.element, true);
  }

  private positionColumnScaleControl(colIndex: number): void {
    const { columnRange } = this.grid.getState();
    const columnOffset = colIndex - columnRange.startIndex;
    if (columnOffset < 0 || columnOffset >= columnRange.renderedCount) {
      this.hideColumnScaleControl();
      return;
    }

    const headerCell = this.grid.getColumnHeaderCellElement(columnOffset);
    if (!headerCell || headerCell.hidden) {
      this.hideColumnScaleControl();
      return;
    }

    setHidden(this.columnScaleControl.element, false);
    const rootRect = this.element.getBoundingClientRect();
    const cellRect = headerCell.getBoundingClientRect();
    const fallbackWidth = this.getColumnWidth(colIndex) * (this.getZoomPercent() / 100);
    const fallbackHeight = VirtualTableGridModel.getRowHeight(this.getZoomPercent());
    const controlRect = this.columnScaleControl.element.getBoundingClientRect();
    const controlHeight = controlRect.height || 24;
    const controlWidth = Math.max(
      0,
      (cellRect.width || fallbackWidth) - (TABLE_WIDGET_COLUMN_SCALE_RESIZE_GUTTER_PX * 2),
    );
    this.columnScaleControl.element.style.left = `${cellRect.left - rootRect.left + TABLE_WIDGET_COLUMN_SCALE_RESIZE_GUTTER_PX}px`;
    this.columnScaleControl.element.style.top = `${cellRect.top - rootRect.top + (((cellRect.height || fallbackHeight) - controlHeight) / 2)}px`;
    this.columnScaleControl.element.style.width = `${controlWidth}px`;
  }

  private canAdjustColumnScale(): boolean {
    return this.props.canAdjustColumnScale !== false;
  }

  private isFixedColumnSizingMode(): boolean {
    return this.props.columnSizingMode === "fixed";
  }

  private getColumnWidth(colIndex: number): number {
    if (!this.isFixedColumnSizingMode()) {
      return this.autoFitColumnWidths.get(colIndex) ?? TableColumnLayout.defaultWidth;
    }

    return this.columnWidths.get(colIndex) ?? TableColumnLayout.defaultWidth;
  }

  private onShortcutKeyDown(event: KeyboardEvent): void {
    const keyboardEvent = new StandardKeyboardEvent(event);
    if (
      keyboardEvent.browserEvent.defaultPrevented ||
      keyboardEvent.altKey ||
      isEditableElement(keyboardEvent.target)
    ) {
      return;
    }

    if (this.handleShortcutKey(keyboardEvent)) {
      return;
    }
    if (keyboardEvent.metaKey) {
      return;
    }
  }

  private onKeyboardNavigation(event: ITableKeyboardNavigationEvent): void {
    if (this.selectBaseCellTarget(event.selection, true)) {
      this.focus();
    }
  }

  private handleShortcutKey(event: IKeyboardEvent): boolean {
    if (event.ctrlKey || event.metaKey) {
      if (event.keyCode === KeyCode.KeyA) {
        return this.runShortcut(event, () => {
          this.selectAllColumns();
        });
      }
      if (event.keyCode === KeyCode.KeyC) {
        return this.runShortcut(event, this.props.onCopySelection);
      }
      if (event.metaKey) {
        return false;
      }
      if (event.keyCode === KeyCode.Equal) {
        return this.runShortcut(event, () => {
          this.zoomIn();
        });
      }
      if (event.keyCode === KeyCode.Minus) {
        return this.runShortcut(event, () => {
          this.zoomOut();
        });
      }
      if (event.keyCode === KeyCode.Digit0 || event.keyCode === KeyCode.Numpad0) {
        return this.runShortcut(event, () => {
          this.resetZoom();
        });
      }
      return false;
    }

    if (event.keyCode === KeyCode.Escape) {
      return this.runShortcut(event, () => {
        this.clearSelection();
      });
    }

    return false;
  }

  private runShortcut(event: IKeyboardEvent, callback: (() => void) | undefined): boolean {
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

    if (event.shiftKey) {
      this.onHorizontalWheel(event);
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

  private selectBaseCellTarget(
    target: ITableCellSelectionTarget,
    reveal: TableWidgetRevealMode,
  ): boolean {
    const tableFile = this.props.tableState.file;
    if (!tableFile) {
      return false;
    }

    if (target.kind === "cell") {
      return this.select({
        kind: "cell",
        cell: target.cell
          ? {
            colIndex: target.cell.colIndex,
            rowIndex: target.cell.rowIndex,
            sheetId: tableFile.sheetId ?? null,
          }
          : null,
      }, reveal);
    }

    return this.select({
      kind: "range",
      range: {
        ...target.range,
        sheetId: tableFile.sheetId ?? null,
      },
    }, reveal);
  }

  private revealCell(cell: TableCell): void {
    if (this.grid.revealCell(
      cell.rowIndex,
      cell.colIndex,
    )) {
      this.renderTable();
      this.syncHeaderScroll();
    }
  }

  private onBodyPointerDown(event: ITableBodyMouseEvent<PointerEvent>): void {
    const browserEvent = event.browserEvent;
    const mouseEvent = event.mouseEvent;
    if (
      mouseEvent.defaultPrevented ||
      !mouseEvent.leftButton ||
      this.grid.isColumnResizeActive()
    ) {
      return;
    }

    const target = event.cell;
    if (!target) {
      return;
    }

    mouseEvent.preventDefault();
    mouseEvent.stopPropagation();
    this.clearNativeSelection();
    this.endBodyRangeSelection();

    const selection = mouseEvent.shiftKey
      ? this.grid.selectRangeToCell(target)
      : this.grid.selectCell(target);
    if (!selection || !this.selectBaseCellTarget(selection, false)) {
      return;
    }

    this.beginBodyClickSuppression();
    this.bodyRangeSelectionState = {
      pointerId: browserEvent.pointerId,
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
    if (!target) {
      return;
    }

    const selection = this.grid.selectRangeToCell(target);
    if (selection && this.selectBaseCellTarget(selection, false)) {
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

  private getBodyCellPositionFromEvent(
    event: Pick<PointerEvent | MouseEvent, "clientX" | "clientY" | "target">,
  ): ITableCellPosition | null {
    return this.grid.getBodyCellPositionFromMouseEvent(event);
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

  private onBodyClick(event: ITableBodyMouseEvent): void {
    const mouseEvent = event.mouseEvent;
    if (this.suppressNextBodyClick) {
      this.clearBodyClickSuppression();
      mouseEvent.preventDefault();
      mouseEvent.stopPropagation();
      return;
    }

    const target = event.cell;
    if (!target) {
      return;
    }

    if (mouseEvent.shiftKey) {
      const selection = this.grid.selectRangeToCell(target);
      if (selection && this.selectBaseCellTarget(selection, true)) {
        this.focus();
      }
      return;
    }

    const selection = this.grid.selectCell(target);
    if (selection && this.selectBaseCellTarget(selection, false)) {
      this.focus();
    }
  }

  private onVisibleRangeChanged(): void {
    this.syncSharedColumnScaleControl();
  }

  private syncHeaderScroll(): void {
    this.grid.syncHeaderScroll();
    this.syncSharedColumnScaleControl();
  }

  private onTableScroll(): void {
    const endTrace = this.performance.start("table.scroll");
    let tableVisible = false;
    const bodyCellRenderCountStart = this.tracedBodyCellRenderCount;
    try {
      this.syncHeaderScroll();
      tableVisible = this.isTableVisible();
    } finally {
      endTrace({
        bodyCellRenderCount: this.tracedBodyCellRenderCount - bodyCellRenderCountStart,
        tableVisible,
      });
    }
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

const toTableCellDecorationRange = (
  decoration: TableRangeDecoration,
): ITableCellDecorationRange => ({
  startRow: decoration.startRow,
  endRow: decoration.endRow,
  startCol: decoration.startCol,
  endCol: decoration.endCol,
  token: decoration.kind,
});

const resolveHeaderSelectedColumns = (
  selection: TableSelection,
  colIndex: number,
  mode: TableWidgetColumnHeaderSelection,
): readonly number[] => {
  if (mode === "disabled") {
    return selection.selectedColumns ?? [];
  }

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

const getColumnScaleValueText = (profile: ColumnDisplayProfile): string =>
  `×10${toSuperscriptExponent(profile.scaleExponent)}`;

const getTableWidgetSheetKey = (
  tableState: TableWidgetState,
): string | null => {
  const source = getTableWidgetSource(tableState);
  const key = source ? toTableSheetKey(source) : "";
  return key || null;
};

const getTableWidgetSource = (
  tableState: TableWidgetState,
): TableSource | null =>
  tableState.file?.source ?? tableState.source ?? null;

const getTableWidgetColumnWidthSheetKey = (
  source: TableSource | null | undefined,
): string | null => {
  const key = source ? toTableSheetKey(source).trim() : "";
  return key || null;
};

const setHidden = (element: HTMLElement, hidden: boolean): boolean => {
  if (element.hidden === hidden) {
    return false;
  }

  element.hidden = hidden;
  return true;
};

const setElementText = (element: HTMLElement, text: string): boolean => {
  if (element.textContent === text) {
    return false;
  }

  element.textContent = text;
  return true;
};

const setElementAttribute = (element: Element, name: string, value: string): boolean => {
  if (element.getAttribute(name) === value) {
    return false;
  }

  element.setAttribute(name, value);
  return true;
};

const setDatasetValue = (element: HTMLElement, key: string, value: string): boolean => {
  if (element.dataset[key] === value) {
    return false;
  }

  element.dataset[key] = value;
  return true;
};

const createAutoFitLengthSample = (maxCellLength: unknown): string => {
  const cellLength = Math.min(
    TABLE_WIDGET_AUTO_FIT_SAMPLE_TEXT_MAX_LENGTH,
    Math.max(0, Math.floor(Number(maxCellLength) || 0)),
  );
  return cellLength > 0 ? "0".repeat(cellLength) : "";
};

const getCssPixelValue = (value: string | undefined): number => {
  const parsed = Number.parseFloat(value ?? "");
  return Number.isFinite(parsed) ? parsed : 0;
};

const isPointInsideElement = (element: HTMLElement, clientX: number, clientY: number): boolean => {
  const rect = element.getBoundingClientRect();
  return isPointInsideRect(rect, clientX, clientY);
};

const isPointInsideRect = (
  rect: Pick<DOMRect, "bottom" | "height" | "left" | "right" | "top" | "width">,
  clientX: number,
  clientY: number,
): boolean =>
  rect.width > 0 &&
  rect.height > 0 &&
  clientX >= rect.left &&
  clientX <= rect.right &&
  clientY >= rect.top &&
  clientY <= rect.bottom;

const getTableWidgetInputKey = ({
  columnSizingMode,
  tableState,
}: TableWidgetProps): string => {
  const file = tableState.file;
  return [
    columnSizingMode,
    tableState.selectedSheetId ?? "",
    getTableWidgetSheetKey(tableState) ?? "",
    tableState.loadState.state,
    tableState.loadState.message,
    file?.sheetId ?? "",
    file?.sourceVersion ?? "",
    file?.rowCount ?? "",
    file?.columnCount ?? "",
    file?.maxCellLengths.join(",") ?? "",
    tableState.displayVersion ?? "",
  ].join("\u001f");
};

const getAutoFitColumnWidthSignature = (
  tableState: TableWidgetState,
  file: TableWidgetFile,
  rowsVersion: number,
): string => [
  getTableWidgetSheetKey(tableState) ?? "",
  file.sourceVersion ?? "",
  file.columnCount,
  file.maxCellLengths.join(","),
  tableState.displayVersion ?? "",
  rowsVersion,
].join("\u001f");

const areColumnWidthMapsEqual = (
  current: ReadonlyMap<number, number>,
  next: ReadonlyMap<number, number>,
): boolean => {
  if (current.size !== next.size) {
    return false;
  }

  for (const [colIndex, width] of current) {
    if (next.get(colIndex) !== width) {
      return false;
    }
  }

  return true;
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

const getElementFromEventTarget = (target: EventTarget | null): Element | null => {
  if (target instanceof Element) {
    return target;
  }

  if (target instanceof Node) {
    return target.parentElement;
  }

  return null;
};
