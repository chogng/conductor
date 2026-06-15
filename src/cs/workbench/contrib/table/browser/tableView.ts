import { addDisposableListener, EventType, isEditableElement } from "src/cs/base/browser/dom";
import { DisposableStore } from "src/cs/base/common/lifecycle";
import { localize } from "src/cs/nls";
import { Scrollbar } from "src/cs/base/browser/ui/scrollbar/scrollbar";
import { createEmptyView } from "src/cs/workbench/contrib/table/browser/emptyView";
import {
  formatTableGridCell,
  getTableGridColumnLabel,
  getTableGridRowLabel,
  getTableGridRowHeight,
  getTableGridSpacerHeights,
  getTableGridZoomScale,
  range,
  resolveTableGridCellRange,
  resolveTableGridColumnViewportRange,
  resolveTableGridKeyboardTarget,
  resolveTableGridViewportRange,
  resizeTableGridColumnWidth,
  type TableGridCellPosition,
  type TableGridCellRange,
  type TableGridColumnRange,
  type TableGridRange,
  TABLE_GRID_DEFAULT_COLUMN_WIDTH,
  TABLE_GRID_MAX_RENDERED_COLUMNS,
  TABLE_GRID_MAX_RENDERED_ROWS,
} from "src/cs/workbench/contrib/table/browser/tableGridModel";
import type {
  ITableService,
  TableCell,
  TableModel,
  TableRange,
  TableSelection,
  TableState,
} from "src/cs/workbench/services/table/common/table";

export type TableViewProps = {
  readonly tableModel: TableModel;
  readonly tableService: Pick<ITableService, "select" | "setColumnWidth">;
  readonly tableState: TableState;
  readonly zoomPercent: number;
};

type BodyCell = {
  readonly element: HTMLTableCellElement;
  appliedActive?: boolean;
  appliedColIndex?: number;
  appliedHighlighted?: boolean;
  appliedHidden?: boolean;
  appliedRowIndex?: number;
  appliedSelected?: boolean;
  appliedText?: string;
};

type BodyRow = {
  readonly element: HTMLTableRowElement;
  readonly leadingSpacer: HTMLTableCellElement;
  readonly cells: BodyCell[];
  readonly trailingSpacer: HTMLTableCellElement;
  appliedHidden?: boolean;
  appliedRowIndex?: number;
};

type ActiveCell = {
  readonly colIndex: number;
  readonly rowIndex: number;
};

type AppliedCellState = {
  readonly activeCell: ActiveCell | null;
  readonly highlightedColumns: Set<number>;
  readonly selectedColumns: Set<number>;
  readonly selectedRanges: readonly TableGridCellRange[];
};

type ColumnResizeState = {
  readonly colIndex: number;
  readonly startClientX: number;
  readonly startWidth: number;
};

export class TableView {
  public readonly element: HTMLElement;
  private readonly store = new DisposableStore();
  private readonly body = document.createElement("div");
  private readonly header = document.createElement("div");
  private readonly headerCorner = document.createElement("div");
  private readonly headerScroll = document.createElement("div");
  private readonly headerContent = document.createElement("div");
  private readonly headerLeadingSpacer = document.createElement("div");
  private readonly headerTrailingSpacer = document.createElement("div");
  private readonly content = document.createElement("div");
  private readonly table = document.createElement("table");
  private readonly columnGroup = document.createElement("colgroup");
  private readonly bodyRows = document.createElement("tbody");
  private readonly rowHeaderColumn = document.createElement("col");
  private readonly bodyLeadingSpacerColumn = document.createElement("col");
  private readonly bodyTrailingSpacerColumn = document.createElement("col");
  private readonly topSpacerRow = document.createElement("tr");
  private readonly topSpacerCell = document.createElement("td");
  private readonly bottomSpacerRow = document.createElement("tr");
  private readonly bottomSpacerCell = document.createElement("td");
  private readonly columnResizeStore = new DisposableStore();
  private readonly scrollArea = new Scrollbar({
    axis: "both",
    className: "table_view_scroll_area",
    observeResize: false,
    onScroll: () => this.onTableScroll(),
    viewportClassName: "table_view_preview",
  });
  private disposeSelectionListener: (() => void) | null = null;
  private disposeRowsVersionListener: (() => void) | null = null;
  private disposeStateListener: (() => void) | null = null;
  private readonly bodyGrid: BodyRow[] = [];
  private readonly bodyDataColumns: HTMLTableColElement[] = [];
  private readonly headerCells: HTMLElement[] = [];
  private headerColumnCount = 0;
  private bodyTotalRowCount = 0;
  private bodyStartRowIndex = 0;
  private bodyRowCount = 0;
  private bodyTotalColumnCount = 0;
  private bodyStartColumnIndex = 0;
  private bodyColumnCount = 0;
  private bodyColumnLeadingWidth = 0;
  private bodyColumnRenderedWidth = 0;
  private bodyColumnTrailingWidth = 0;
  private layoutTimeoutId: number | null = null;
  private renderedInputKey: string | null = null;
  private renderedZoomPercent: number | null = null;
  private renderedSourceKey: string | null = null;
  private renderedRowsSourceKey: string | null = null;
  private renderedRowsVersion: number | null = null;
  private renderedRowsStartIndex = 0;
  private renderedRowsRowCount = 0;
  private renderedRowsStartColumnIndex = 0;
  private renderedRowsColumnCount = 0;
  private pendingEnsureRowsKey: string | null = null;
  private appliedCellState: AppliedCellState | null = null;
  private columnResizeState: ColumnResizeState | null = null;
  private rangeAnchorCell: TableGridCellPosition | null = null;
  private rangeFocusCell: TableGridCellPosition | null = null;
  private props: TableViewProps;

  constructor(props: TableViewProps) {
    this.props = props;
    this.element = document.createElement("div");
    this.element.className = "table_view";
    this.element.tabIndex = 0;
    this.element.setAttribute("role", "region");
    this.element.setAttribute("aria-label", localize("table.view.ariaLabel", "Table"));
    this.body.className = "table_view_body";
    this.header.className = "table_view_grid_header";
    this.headerCorner.className = "table_view_grid_header_corner";
    this.headerScroll.className = "table_view_grid_header_scroll";
    this.headerContent.className = "table_view_grid_header_content";
    this.headerLeadingSpacer.className = "table_view_grid_header_spacer";
    this.headerTrailingSpacer.className = "table_view_grid_header_spacer";
    this.content.className = "table_view_content";
    this.table.className = "table_view_grid";
    this.rowHeaderColumn.className = "table_view_row_header_col";
    this.bodyLeadingSpacerColumn.className = "table_view_column_spacer_col";
    this.bodyTrailingSpacerColumn.className = "table_view_column_spacer_col";
    this.headerCorner.setAttribute("aria-hidden", "true");
    this.headerLeadingSpacer.setAttribute("aria-hidden", "true");
    this.headerTrailingSpacer.setAttribute("aria-hidden", "true");
    this.headerContent.append(this.headerLeadingSpacer, this.headerTrailingSpacer);
    this.headerScroll.append(this.headerContent);
    this.header.append(this.headerCorner, this.headerScroll);
    this.topSpacerRow.className = "table_view_virtual_spacer";
    this.topSpacerRow.setAttribute("aria-hidden", "true");
    this.topSpacerCell.className = "table_view_virtual_spacer_cell";
    this.bottomSpacerRow.className = "table_view_virtual_spacer";
    this.bottomSpacerRow.setAttribute("aria-hidden", "true");
    this.bottomSpacerCell.className = "table_view_virtual_spacer_cell";
    this.topSpacerRow.append(this.topSpacerCell);
    this.bottomSpacerRow.append(this.bottomSpacerCell);
    this.table.append(this.columnGroup, this.bodyRows);
    this.content.append(this.table);
    this.body.append(this.header, this.scrollArea.element);
    this.element.append(this.body);
    this.store.add(addDisposableListener(this.headerContent, EventType.CLICK, event => {
      this.onHeaderClick(event as MouseEvent);
    }));
    this.store.add(addDisposableListener(this.headerContent, EventType.POINTER_DOWN, event => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }

      const handle = target.closest<HTMLElement>(".table_view_column_resize_handle");
      if (handle && this.headerContent.contains(handle)) {
        this.onColumnResizeStart(event as PointerEvent, handle);
      }
    }));
    this.store.add(addDisposableListener(this.bodyRows, EventType.CLICK, event => {
      this.onBodyClick(event as MouseEvent);
    }));
    this.store.add(addDisposableListener(this.element, EventType.KEY_DOWN, event => {
      this.onKeyDown(event as KeyboardEvent);
    }));
    this.store.add(this.columnResizeStore);
    this.prepareGrid();
    this.bindTableState(props.tableModel);
    this.renderedInputKey = getTableViewInputKey(props);
    this.render();
  }

  public update(props: TableViewProps): void {
    const previousModel = this.props.tableModel;
    const nextInputKey = getTableViewInputKey(props);
    this.props = props;
    if (previousModel !== props.tableModel) {
      this.bindTableState(props.tableModel);
    }
    if (previousModel === props.tableModel && this.renderedInputKey === nextInputKey) {
      return;
    }

    this.renderedInputKey = nextInputKey;
    this.render();
  }

  public dispose(): void {
    this.clearScheduledLayout();
    this.disposeSelectionListener?.();
    this.disposeSelectionListener = null;
    this.disposeRowsVersionListener?.();
    this.disposeRowsVersionListener = null;
    this.disposeStateListener?.();
    this.disposeStateListener = null;
    this.endColumnResize();
    this.store.dispose();
    this.scrollArea.dispose();
    this.element.replaceChildren();
    this.element.remove();
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
    this.scrollArea.layout();
    this.syncHeaderScroll();
  }

  public focus(): void {
    this.element.focus({ preventScroll: true });
  }

  public scrollHorizontally(delta: number): boolean {
    if (!this.isTableVisible()) {
      return false;
    }

    const viewport = this.scrollArea.viewport;
    const previousScrollLeft = viewport.scrollLeft;
    const maxScrollLeft = Math.max(0, viewport.scrollWidth - viewport.clientWidth);
    const nextScrollLeft = Math.min(
      maxScrollLeft,
      Math.max(0, previousScrollLeft + delta),
    );
    if (nextScrollLeft === previousScrollLeft) {
      return false;
    }

    viewport.scrollLeft = nextScrollLeft;
    this.syncHeaderScroll();
    return true;
  }

  private bindTableState(tableModel: TableModel): void {
    this.disposeSelectionListener?.();
    this.disposeRowsVersionListener?.();
    this.disposeStateListener?.();
    this.resetRenderedRows();
    this.disposeSelectionListener = tableModel.onDidChangeSelection(() => {
      this.syncSelectionState();
    });
    this.disposeRowsVersionListener = tableModel.subscribeRowsVersion(() => {
      this.syncRows();
    });
    this.disposeStateListener = tableModel.onDidChangeState(() => {
      this.props = {
        ...this.props,
        tableState: tableModel.getState(),
      };
      this.renderedInputKey = getTableViewInputKey(this.props);
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
      this.resetRenderedRows();
      this.appliedCellState = null;
      this.rangeAnchorCell = null;
      this.rangeFocusCell = null;
      this.clearRowsText();
      this.scrollArea.viewport.scrollTop = 0;
    }

    if (!tableState.selectedFileId || !tableFile) {
      if (
        tableState.loadState.state === "loading" &&
        this.bodyRowCount > 0 &&
        this.bodyColumnCount > 0
      ) {
        if (this.scrollArea.viewport.firstChild !== this.content) {
          this.scrollArea.viewport.replaceChildren(this.content);
        }
        this.header.hidden = false;
        this.layoutNow();
        this.syncHeaderScroll();
        return;
      }

      this.header.hidden = true;
      this.scrollArea.viewport.replaceChildren();
      this.scrollArea.viewport.append(createEmptyView({
        description: tableState.loadState.state === "loading"
          ? tableState.loadState.message || localize("table.preview.loadingHint", "Parsing CSV preview, please wait.")
          : localize("table.preview.emptyHint", "Select a file to preview"),
      }));
      this.layoutNow();
      return;
    }

    if (tableState.loadState.state === "loading") {
      this.header.hidden = true;
      this.scrollArea.viewport.replaceChildren();
      this.scrollArea.viewport.append(createEmptyView({
        title: localize("table.preview.loadingTitle", "Loading preview..."),
        description: tableState.loadState.message || localize("table.preview.loadingHint", "Parsing CSV preview, please wait."),
      }));
      this.layoutNow();
      return;
    }

    const didAttachContent = this.scrollArea.viewport.firstChild !== this.content;
    if (didAttachContent) {
      this.scrollArea.viewport.replaceChildren(this.content);
    }

    const needsLayout = this.renderTable();
    if (didAttachContent || needsLayout) {
      this.layoutNow();
    }
    this.syncHeaderScroll();
  }

  private renderTable(): boolean {
    const { tableModel, tableState, zoomPercent } = this.props;
    const tableFile = tableState.file;
    const zoomChanged = this.renderedZoomPercent !== zoomPercent;
    if (zoomChanged) {
      this.renderedZoomPercent = zoomPercent;
      this.body.style.setProperty("--table-view-zoom", String(getTableGridZoomScale(zoomPercent)));
    }

    const rowRange = this.resolveVisibleRowRange(tableFile?.rowCount);
    const columnRange = this.resolveVisibleColumnRange(tableFile?.columnCount);
    const columnCount = columnRange.renderedCount;
    const rowCount = rowRange.renderedCount;
    if (rowCount === 0 || columnCount === 0) {
      this.header.hidden = true;
      this.scrollArea.viewport.replaceChildren(createEmptyView({
        description: localize("table.preview.emptyHint", "Select a file to preview"),
      }));
      return true;
    }

    this.header.hidden = false;
    const headerChanged = this.ensureHeaderGrid();
    const gridChanged = this.renderBody(tableModel, rowRange, columnRange);
    const columnLayoutChanged = this.syncColumnLayout(columnRange);

    if (tableFile?.fileId) {
      this.ensureRows(tableModel, tableFile.sourceKey ?? tableFile.fileId, rowRange);
    }

    return headerChanged || gridChanged || columnLayoutChanged || zoomChanged;
  }

  private resolveVisibleRowRange(totalCount: unknown): TableGridRange {
    return resolveTableGridViewportRange({
      totalCount,
      maxRenderedCount: TABLE_GRID_MAX_RENDERED_ROWS,
      rowHeight: getTableGridRowHeight(this.props.zoomPercent),
      scrollTop: this.scrollArea.viewport.scrollTop,
      viewportHeight: this.scrollArea.viewport.clientHeight,
    });
  }

  private resolveVisibleColumnRange(totalCount: unknown): TableGridColumnRange {
    const rowHeaderWidth = 48 * getTableGridZoomScale(this.props.zoomPercent);
    return resolveTableGridColumnViewportRange({
      totalCount,
      maxRenderedCount: TABLE_GRID_MAX_RENDERED_COLUMNS,
      scrollLeft: this.scrollArea.viewport.scrollLeft,
      viewportWidth: this.scrollArea.viewport.clientWidth - rowHeaderWidth,
      zoomPercent: this.props.zoomPercent,
      getColumnWidth: colIndex => this.getColumnWidth(colIndex),
    });
  }

  private ensureRows(tableModel: TableModel, sourceKey: string, rowRange: TableGridRange): void {
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

  private resetRenderedRows(): void {
    this.renderedRowsSourceKey = null;
    this.renderedRowsVersion = null;
    this.renderedRowsStartIndex = 0;
    this.renderedRowsRowCount = 0;
    this.renderedRowsStartColumnIndex = 0;
    this.renderedRowsColumnCount = 0;
  }

  private ensureHeaderGrid(): boolean {
    let changed = false;
    if (this.headerColumnCount < TABLE_GRID_MAX_RENDERED_COLUMNS) {
      const startIndex = this.headerColumnCount;
      this.headerColumnCount = TABLE_GRID_MAX_RENDERED_COLUMNS;

      for (let colIndex = startIndex; colIndex < TABLE_GRID_MAX_RENDERED_COLUMNS; colIndex += 1) {
        const cell = document.createElement("div");
        const button = document.createElement("button");
        const columnLabel = getTableGridColumnLabel(colIndex);
        cell.className = "table_view_grid_header_cell";
        cell.setAttribute("role", "columnheader");
        button.type = "button";
        button.className = "table_view_column_button";
        button.dataset.colIndex = String(colIndex);
        button.textContent = columnLabel;
        button.setAttribute("aria-label", localize("table.preview.toggleColumn", "Toggle column {column}", {
          column: columnLabel,
        }));
        const resizeHandle = document.createElement("span");
        resizeHandle.className = "table_view_column_resize_handle";
        resizeHandle.dataset.colIndex = String(colIndex);
        resizeHandle.setAttribute("role", "separator");
        resizeHandle.setAttribute("aria-orientation", "vertical");
        resizeHandle.setAttribute("aria-label", localize("table.preview.resizeColumn", "Resize column {column}", {
          column: columnLabel,
        }));
        cell.append(button, resizeHandle);
        this.headerCells.push(cell);
        this.headerContent.insertBefore(cell, this.headerTrailingSpacer);
      }

      changed = true;
    }

    return changed;
  }

  private syncColumnLayout(columnRange: TableGridColumnRange): boolean {
    let changed = this.syncColumnSpacers(columnRange);
    for (let columnOffset = 0; columnOffset < TABLE_GRID_MAX_RENDERED_COLUMNS; columnOffset += 1) {
      const colIndex = columnRange.startIndex + columnOffset;
      const isVisible = columnOffset < columnRange.renderedCount;
      if (this.syncHeaderColumn(columnOffset, isVisible ? colIndex : null)) {
        changed = true;
      }
      const width = isVisible
        ? this.getColumnCssWidth(colIndex)
        : "";
      this.applyHeaderColumnWidth(columnOffset, width);
      this.applyBodyColumnWidth(columnOffset, width);
    }
    return changed;
  }

  private syncColumnSpacers(columnRange: TableGridColumnRange): boolean {
    const leadingWidth = `${columnRange.leadingWidth}px`;
    const trailingWidth = `${columnRange.trailingWidth}px`;
    let changed = false;
    if (setElementWidth(this.headerLeadingSpacer, leadingWidth)) {
      changed = true;
    }
    if (setElementWidth(this.headerTrailingSpacer, trailingWidth)) {
      changed = true;
    }
    if (setColumnWidth(this.bodyLeadingSpacerColumn, leadingWidth)) {
      changed = true;
    }
    if (setColumnWidth(this.bodyTrailingSpacerColumn, trailingWidth)) {
      changed = true;
    }
    for (const row of this.bodyGrid) {
      if (setElementWidth(row.leadingSpacer, leadingWidth)) {
        changed = true;
      }
      if (setElementWidth(row.trailingSpacer, trailingWidth)) {
        changed = true;
      }
    }
    return changed;
  }

  private syncHeaderColumn(columnOffset: number, colIndex: number | null): boolean {
    const cell = this.headerCells[columnOffset];
    if (!cell) {
      return false;
    }

    let changed = setHidden(cell, colIndex === null);
    if (colIndex === null) {
      return changed;
    }

    const button = cell.firstElementChild as HTMLButtonElement | null;
    const resizeHandle = cell.lastElementChild as HTMLElement | null;
    const columnLabel = getTableGridColumnLabel(colIndex);
    const colIndexValue = String(colIndex);
    const ariaColIndex = String(colIndex + 1);
    if (button?.dataset.colIndex !== colIndexValue) {
      if (button) {
        button.dataset.colIndex = colIndexValue;
        button.textContent = columnLabel;
        button.setAttribute("aria-label", localize("table.preview.toggleColumn", "Toggle column {column}", {
          column: columnLabel,
        }));
      }
      if (resizeHandle) {
        resizeHandle.dataset.colIndex = colIndexValue;
        resizeHandle.setAttribute("aria-label", localize("table.preview.resizeColumn", "Resize column {column}", {
          column: columnLabel,
        }));
      }
      changed = true;
    }
    if (cell.getAttribute("aria-colindex") !== ariaColIndex) {
      cell.setAttribute("aria-colindex", ariaColIndex);
      changed = true;
    }

    return changed;
  }

  private applyHeaderColumnWidth(columnOffset: number, width: string): void {
    const cell = this.headerCells[columnOffset];
    if (!cell) {
      return;
    }

    setElementWidth(cell, width);
  }

  private applyBodyColumnWidth(columnOffset: number, width: string): void {
    const column = this.bodyDataColumns[columnOffset];
    if (column) {
      setColumnWidth(column, width);
    }

    for (const row of this.bodyGrid) {
      const cell = row.cells[columnOffset];
      if (cell) {
        setElementWidth(cell.element, width);
      }
    }
  }

  private renderBody(
    tableModel: TableModel,
    rowRange: TableGridRange,
    columnRange: TableGridColumnRange,
  ): boolean {
    const gridChanged = this.ensureBodyGrid(rowRange, columnRange);
    this.table.setAttribute("aria-rowcount", String(rowRange.totalCount));
    this.table.setAttribute("aria-colcount", String(columnRange.totalCount));
    this.syncRowsTextIfNeeded(tableModel, rowRange, columnRange);
    this.syncSelectionState();

    return gridChanged;
  }

  private syncRows(): void {
    if (!this.isTableVisible()) {
      this.render();
      return;
    }

    this.syncRowsTextIfNeeded(this.props.tableModel, this.getBodyRowRange(), this.getBodyColumnRange());
  }

  private getBodyRowRange(): TableGridRange {
    return {
      totalCount: this.bodyTotalRowCount,
      startIndex: this.bodyStartRowIndex,
      endIndex: this.bodyStartRowIndex + this.bodyRowCount,
      renderedCount: this.bodyRowCount,
    };
  }

  private getBodyColumnRange(): TableGridColumnRange {
    return {
      totalCount: this.bodyTotalColumnCount,
      startIndex: this.bodyStartColumnIndex,
      endIndex: this.bodyStartColumnIndex + this.bodyColumnCount,
      renderedCount: this.bodyColumnCount,
      leadingWidth: this.bodyColumnLeadingWidth,
      renderedWidth: this.bodyColumnRenderedWidth,
      totalWidth: this.bodyColumnLeadingWidth +
        this.bodyColumnRenderedWidth +
        this.bodyColumnTrailingWidth,
      trailingWidth: this.bodyColumnTrailingWidth,
    };
  }

  private syncRowsTextIfNeeded(
    tableModel: TableModel,
    rowRange: TableGridRange,
    columnRange: TableGridColumnRange,
  ): void {
    const rowsVersion = tableModel.getRowsVersion();
    const sourceKey = this.renderedSourceKey;
    if (
      this.renderedRowsSourceKey === sourceKey &&
      this.renderedRowsVersion === rowsVersion &&
      this.renderedRowsStartIndex === rowRange.startIndex &&
      this.renderedRowsRowCount === rowRange.renderedCount &&
      this.renderedRowsStartColumnIndex === columnRange.startIndex &&
      this.renderedRowsColumnCount === columnRange.renderedCount
    ) {
      return;
    }

    for (let rowOffset = 0; rowOffset < rowRange.renderedCount; rowOffset += 1) {
      const row = this.bodyGrid[rowOffset];
      const rowIndex = rowRange.startIndex + rowOffset;
      const cells = tableModel.getRow(rowIndex) ?? [];
      for (let columnOffset = 0; columnOffset < columnRange.renderedCount; columnOffset += 1) {
        const colIndex = columnRange.startIndex + columnOffset;
        const cell = row.cells[columnOffset];
        this.updateCellText(cell, formatTableGridCell(cells[colIndex]));
      }
    }

    this.renderedRowsSourceKey = sourceKey;
    this.renderedRowsVersion = rowsVersion;
    this.renderedRowsStartIndex = rowRange.startIndex;
    this.renderedRowsRowCount = rowRange.renderedCount;
    this.renderedRowsStartColumnIndex = columnRange.startIndex;
    this.renderedRowsColumnCount = columnRange.renderedCount;
  }

  private prepareGrid(): void {
    this.ensureHeaderGrid();
    this.ensureBodyColumns();
    this.ensureBodyCells();
    this.syncBodyGridVisibility({
      totalCount: 0,
      startIndex: 0,
      endIndex: 0,
      renderedCount: 0,
    }, {
      totalCount: 0,
      startIndex: 0,
      endIndex: 0,
      renderedCount: 0,
      leadingWidth: 0,
      renderedWidth: 0,
      totalWidth: 0,
      trailingWidth: 0,
    });
  }

  private ensureBodyGrid(rowRange: TableGridRange, columnRange: TableGridColumnRange): boolean {
    const columnsChanged = this.ensureBodyColumns();
    const gridChanged = this.ensureBodyCells();
    const visibleRangeChanged = this.syncBodyGridVisibility(rowRange, columnRange);

    if (visibleRangeChanged) {
      this.appliedCellState = null;
    }

    return columnsChanged || gridChanged || visibleRangeChanged;
  }

  private ensureBodyColumns(): boolean {
    if (this.bodyDataColumns.length > 0) {
      return false;
    }

    this.columnGroup.append(this.rowHeaderColumn, this.bodyLeadingSpacerColumn);

    for (let colIndex = 0; colIndex < TABLE_GRID_MAX_RENDERED_COLUMNS; colIndex += 1) {
      const column = document.createElement("col");
      column.className = "table_view_data_col";
      this.bodyDataColumns.push(column);
      this.columnGroup.append(column);
    }

    this.columnGroup.append(this.bodyTrailingSpacerColumn);

    return true;
  }

  private ensureBodyCells(): boolean {
    if (this.bodyGrid.length > 0) {
      return false;
    }

    this.bodyRows.append(this.topSpacerRow);

    for (let rowIndex = 0; rowIndex < TABLE_GRID_MAX_RENDERED_ROWS; rowIndex += 1) {
      const row = document.createElement("tr");
      const rowHeader = document.createElement("th");
      const rowHeaderLabel = document.createElement("span");
      const leadingSpacer = document.createElement("td");
      const trailingSpacer = document.createElement("td");
      const cells: BodyCell[] = [];

      rowHeader.scope = "row";
      rowHeaderLabel.className = "table_view_row_header_label";
      rowHeaderLabel.textContent = getTableGridRowLabel(rowIndex);
      rowHeader.append(rowHeaderLabel);
      row.append(rowHeader);
      leadingSpacer.className = "table_view_column_spacer_cell";
      leadingSpacer.setAttribute("aria-hidden", "true");
      row.append(leadingSpacer);

      for (let colIndex = 0; colIndex < TABLE_GRID_MAX_RENDERED_COLUMNS; colIndex += 1) {
        const cell = document.createElement("td");
        cell.className = "table_view_cell";
        cell.dataset.rowIndex = String(rowIndex);
        cell.dataset.colIndex = String(colIndex);
        row.append(cell);
        cells.push({ element: cell });
      }

      trailingSpacer.className = "table_view_column_spacer_cell";
      trailingSpacer.setAttribute("aria-hidden", "true");
      row.append(trailingSpacer);

      this.bodyGrid.push({
        element: row,
        leadingSpacer,
        cells,
        trailingSpacer,
      });
      this.bodyRows.append(row);
    }

    this.bodyRows.append(this.bottomSpacerRow);

    return true;
  }

  private syncBodyGridVisibility(
    rowRange: TableGridRange,
    columnRange: TableGridColumnRange,
  ): boolean {
    const rowCount = rowRange.renderedCount;
    const columnCount = columnRange.renderedCount;
    const changed = this.bodyStartRowIndex !== rowRange.startIndex ||
      this.bodyTotalRowCount !== rowRange.totalCount ||
      this.bodyRowCount !== rowCount ||
      this.bodyStartColumnIndex !== columnRange.startIndex ||
      this.bodyTotalColumnCount !== columnRange.totalCount ||
      this.bodyColumnCount !== columnCount;
    const spacerChanged = this.syncVirtualSpacers(rowRange, columnCount);
    this.bodyTotalRowCount = rowRange.totalCount;
    this.bodyStartRowIndex = rowRange.startIndex;
    this.bodyRowCount = rowCount;
    this.bodyTotalColumnCount = columnRange.totalCount;
    this.bodyStartColumnIndex = columnRange.startIndex;
    this.bodyColumnCount = columnCount;
    this.bodyColumnLeadingWidth = columnRange.leadingWidth;
    this.bodyColumnRenderedWidth = columnRange.renderedWidth;
    this.bodyColumnTrailingWidth = columnRange.trailingWidth;

    for (let rowIndex = 0; rowIndex < this.bodyGrid.length; rowIndex += 1) {
      const row = this.bodyGrid[rowIndex];
      const actualRowIndex = rowRange.startIndex + rowIndex;
      const rowHidden = rowIndex >= rowCount;
      if (row.appliedHidden !== rowHidden) {
        row.element.hidden = rowHidden;
        row.appliedHidden = rowHidden;
      }
      if (!rowHidden && row.appliedRowIndex !== actualRowIndex) {
        const label = row.element.firstElementChild?.firstElementChild;
        if (label) {
          label.textContent = getTableGridRowLabel(actualRowIndex);
        }
        row.element.setAttribute("aria-rowindex", String(actualRowIndex + 1));
        row.appliedRowIndex = actualRowIndex;
      }

      for (let colIndex = 0; colIndex < row.cells.length; colIndex += 1) {
        const cell = row.cells[colIndex];
        const actualColIndex = columnRange.startIndex + colIndex;
        const cellHidden = colIndex >= columnCount;
        if (cell.appliedHidden !== cellHidden) {
          cell.element.hidden = cellHidden;
          cell.appliedHidden = cellHidden;
        }
        if (!rowHidden && !cellHidden && (
          cell.appliedRowIndex !== actualRowIndex ||
          cell.appliedColIndex !== actualColIndex
        )) {
          cell.element.dataset.colIndex = String(actualColIndex);
          cell.element.dataset.rowIndex = String(actualRowIndex);
          cell.element.setAttribute("aria-colindex", String(actualColIndex + 1));
          cell.appliedRowIndex = actualRowIndex;
          cell.appliedColIndex = actualColIndex;
        }
      }
    }

    for (let colIndex = 0; colIndex < TABLE_GRID_MAX_RENDERED_COLUMNS; colIndex += 1) {
      const column = this.bodyDataColumns[colIndex];
      if (column) {
        column.hidden = colIndex >= columnCount;
      }
    }

    return changed || spacerChanged;
  }

  private syncVirtualSpacers(rowRange: TableGridRange, columnCount: number): boolean {
    const { topHeight, bottomHeight } = getTableGridSpacerHeights(
      rowRange,
      getTableGridRowHeight(this.props.zoomPercent),
    );
    const colSpan = Math.max(1, columnCount + 3);
    const topChanged = syncSpacerRow(this.topSpacerRow, this.topSpacerCell, topHeight, colSpan);
    const bottomChanged = syncSpacerRow(this.bottomSpacerRow, this.bottomSpacerCell, bottomHeight, colSpan);
    return topChanged || bottomChanged;
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
    const highlightedColumns = toColumnSet(tableModel.getHighlight().columns, startColumnIndex, columnCount);
    const previous = this.appliedCellState;
    const next: AppliedCellState = {
      activeCell,
      highlightedColumns,
      selectedColumns,
      selectedRanges,
    };

    if (!previous) {
      this.syncHeaderColumns(range(columnCount), next);
      for (let rowOffset = 0; rowOffset < rowCount; rowOffset += 1) {
        const row = this.bodyGrid[rowOffset];
        const rowIndex = this.bodyStartRowIndex + rowOffset;
        for (let columnOffset = 0; columnOffset < columnCount; columnOffset += 1) {
          const colIndex = startColumnIndex + columnOffset;
          this.updateCellState(row.cells[columnOffset], {
            active: isActiveCell(activeCell, rowIndex, colIndex),
            highlighted: highlightedColumns.has(colIndex),
            selected: isSelectedCell(rowIndex, colIndex, next),
          });
        }
      }
      this.appliedCellState = next;
      return;
    }

    const rangesChanged = !areCellRangesEqual(previous.selectedRanges, next.selectedRanges);
    const changedColumns = rangesChanged
      ? range(columnCount).map(columnOffset => startColumnIndex + columnOffset)
      : getChangedColumns(previous, next, startColumnIndex, columnCount);
    this.syncHeaderColumns(changedColumns.map(colIndex => colIndex - startColumnIndex), next);

    for (const colIndex of changedColumns) {
      const columnOffset = colIndex - startColumnIndex;
      for (let rowOffset = 0; rowOffset < rowCount; rowOffset += 1) {
        const rowIndex = this.bodyStartRowIndex + rowOffset;
        this.updateCellState(this.bodyGrid[rowOffset].cells[columnOffset], {
          active: isActiveCell(activeCell, rowIndex, colIndex),
          highlighted: highlightedColumns.has(colIndex),
          selected: isSelectedCell(rowIndex, colIndex, next),
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
    const cell = this.bodyGrid[rowOffset]?.cells[columnOffset];
    if (!cell) {
      return;
    }

    this.updateCellState(cell, {
      active,
      highlighted: state.highlightedColumns.has(activeCell.colIndex),
      selected: isSelectedCell(activeCell.rowIndex, activeCell.colIndex, state),
    });
  }

  private syncHeaderColumns(
    columns: readonly number[],
    state: Pick<AppliedCellState, "highlightedColumns" | "selectedColumns">,
  ): void {
    for (const columnOffset of columns) {
      const colIndex = this.bodyStartColumnIndex + columnOffset;
      const cell = this.headerCells[columnOffset];
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
    return this.scrollArea.viewport.firstChild === this.content &&
      this.bodyRowCount > 0 &&
      this.bodyColumnCount > 0;
  }

  private updateCellText(cell: BodyCell, text: string): void {
    if (cell.appliedText !== text) {
      cell.element.textContent = text;
      cell.appliedText = text;
    }
  }

  private clearRowsText(): void {
    for (const row of this.bodyGrid) {
      for (const cell of row.cells) {
        this.updateCellText(cell, "");
      }
    }
  }

  private updateCellState(
    cell: BodyCell,
    state: {
      readonly active: boolean;
      readonly highlighted: boolean;
      readonly selected: boolean;
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
  }

  private onHeaderClick(event: MouseEvent): void {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    const button = target.closest<HTMLButtonElement>(".table_view_column_button");
    if (!button || !this.headerContent.contains(button)) {
      return;
    }

    const colIndex = Number(button.dataset.colIndex);
    if (!Number.isInteger(colIndex) || colIndex < 0) {
      return;
    }

    const tableModel = this.props.tableModel;
    this.props.tableService.select({
      kind: "columns",
      columns: toggleSelectedColumn(tableModel.getSelection(), colIndex),
    });
    this.focus();
  }

  private onColumnResizeStart(event: PointerEvent, handle: HTMLElement): void {
    const colIndex = Number(handle.dataset.colIndex);
    if (
      !Number.isInteger(colIndex) ||
      colIndex < 0 ||
      colIndex < this.bodyStartColumnIndex ||
      colIndex >= this.bodyStartColumnIndex + this.bodyColumnCount
    ) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    this.endColumnResize();
    this.columnResizeState = {
      colIndex,
      startClientX: event.clientX,
      startWidth: this.getColumnWidth(colIndex),
    };
    this.element.classList.add("table_view--resizing_column");

    const targetWindow = this.element.ownerDocument.defaultView;
    if (!targetWindow) {
      return;
    }

    this.columnResizeStore.add(addDisposableListener(targetWindow, EventType.POINTER_MOVE, moveEvent => {
      this.onColumnResizeMove(moveEvent as PointerEvent);
    }));
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
    const width = resizeTableGridColumnWidth(
      state.startWidth,
      event.clientX - state.startClientX,
      this.props.zoomPercent,
    );
    if (this.props.tableService.setColumnWidth({ colIndex: state.colIndex, width })) {
      this.syncColumnLayout(this.getBodyColumnRange());
      this.layoutNow();
    }
  }

  private endColumnResize(): void {
    if (this.columnResizeState) {
      this.columnResizeState = null;
      this.element.classList.remove("table_view--resizing_column");
    }

    this.columnResizeStore.clear();
  }

  private getColumnWidth(colIndex: number): number {
    return this.props.tableModel.getColumnWidth(colIndex) ?? TABLE_GRID_DEFAULT_COLUMN_WIDTH;
  }

  private getColumnCssWidth(colIndex: number): string {
    return `${this.getColumnWidth(colIndex) * getTableGridZoomScale(this.props.zoomPercent)}px`;
  }

  private onKeyDown(event: KeyboardEvent): void {
    if (
      event.defaultPrevented ||
      event.altKey ||
      event.metaKey ||
      isEditableElement(event.target)
    ) {
      return;
    }

    const tableFile = this.props.tableState.file;
    if (!tableFile) {
      return;
    }

    const target = resolveTableGridKeyboardTarget({
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
    if (this.props.tableService.select({ kind: "cell", cell }, true)) {
      this.revealCell(cell);
      this.focus();
    }
  }

  private getNavigationCell(): TableGridCellPosition | null {
    const tableFile = this.props.tableState.file;
    if (!tableFile) {
      return null;
    }

    const activeCell = this.props.tableModel.getSelection().activeCell;
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

  private getRangeFocusCell(): TableGridCellPosition | null {
    return this.rangeFocusCell ?? this.getNavigationCell();
  }

  private selectRangeToCell(target: TableGridCellPosition, reveal: boolean): boolean {
    const tableFile = this.props.tableState.file;
    if (!tableFile) {
      return false;
    }

    const anchor = this.rangeAnchorCell ?? this.getNavigationCell() ?? target;
    const range = resolveTableGridCellRange(anchor, target);
    const didSelect = this.props.tableService.select({
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
    if (reveal) {
      this.revealCell({
        colIndex: target.colIndex,
        fileId: tableFile.fileId,
        rowIndex: target.rowIndex,
        sheetId: tableFile.sheetId ?? null,
      });
    }
    return true;
  }

  private getPageRowCount(): number {
    return Math.max(
      1,
      Math.floor(this.scrollArea.viewport.clientHeight / getTableGridRowHeight(this.props.zoomPercent)),
    );
  }

  private revealCell(cell: TableCell): void {
    const verticalChanged = this.revealCellVertically(cell.rowIndex);
    const horizontalChanged = this.revealCellHorizontally(cell.colIndex);
    if (verticalChanged || horizontalChanged) {
      this.renderTable();
      this.syncHeaderScroll();
    }
  }

  private revealCellVertically(rowIndex: number): boolean {
    const viewport = this.scrollArea.viewport;
    const rowHeight = getTableGridRowHeight(this.props.zoomPercent);
    const top = rowIndex * rowHeight;
    const bottom = top + rowHeight;
    const viewportTop = viewport.scrollTop;
    const viewportBottom = viewportTop + viewport.clientHeight;
    const nextScrollTop = top < viewportTop
      ? top
      : bottom > viewportBottom
        ? bottom - viewport.clientHeight
        : viewportTop;
    if (Math.abs(nextScrollTop - viewportTop) < 0.5) {
      return false;
    }

    viewport.scrollTop = Math.max(0, nextScrollTop);
    return true;
  }

  private revealCellHorizontally(colIndex: number): boolean {
    const viewport = this.scrollArea.viewport;
    const scale = getTableGridZoomScale(this.props.zoomPercent);
    const rowHeaderWidth = 48 * scale;
    const left = this.getColumnOffset(colIndex, scale);
    const right = left + (this.getColumnWidth(colIndex) * scale);
    const viewportLeft = viewport.scrollLeft + rowHeaderWidth;
    const viewportRight = viewport.scrollLeft + viewport.clientWidth;
    const nextScrollLeft = left < viewportLeft
      ? left - rowHeaderWidth
      : right > viewportRight
        ? right - viewport.clientWidth
        : viewport.scrollLeft;
    if (Math.abs(nextScrollLeft - viewport.scrollLeft) < 0.5) {
      return false;
    }

    viewport.scrollLeft = Math.max(0, nextScrollLeft);
    return true;
  }

  private getColumnOffset(colIndex: number, scale: number): number {
    let offset = 48 * scale;
    for (let index = 0; index < colIndex; index += 1) {
      offset += this.getColumnWidth(index) * scale;
    }
    return offset;
  }

  private onBodyClick(event: MouseEvent): void {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    const cell = target.closest<HTMLTableCellElement>(".table_view_cell");
    if (!cell || !this.bodyRows.contains(cell)) {
      return;
    }

    const rowIndex = Number(cell.dataset.rowIndex);
    const colIndex = Number(cell.dataset.colIndex);
    if (
      !Number.isInteger(rowIndex) ||
      rowIndex < 0 ||
      !Number.isInteger(colIndex) ||
      colIndex < 0
    ) {
      return;
    }

    const { tableService, tableState } = this.props;
    const tableFile = tableState.file;
    if (event.shiftKey && this.selectRangeToCell({ colIndex, rowIndex }, true)) {
      this.focus();
      return;
    }

    this.rangeAnchorCell = null;
    this.rangeFocusCell = null;
    tableService.select({
      kind: "cell",
      cell: {
        colIndex,
        fileId: tableFile?.fileId ?? null,
        rowIndex,
        sheetId: tableFile?.sheetId ?? null,
      },
    });
    this.focus();
  }

  private syncHeaderScroll(): void {
    const scrollLeft = this.scrollArea.viewport.scrollLeft;
    this.headerContent.style.transform = scrollLeft === 0
      ? ""
      : `translateX(${-scrollLeft}px)`;
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

const setHidden = (element: HTMLElement, hidden: boolean): boolean => {
  if (element.hidden === hidden) {
    return false;
  }

  element.hidden = hidden;
  return true;
};

const setElementWidth = (element: HTMLElement, width: string): boolean => {
  let changed = false;
  if (element.style.width !== width) {
    element.style.width = width;
    changed = true;
  }
  if (element.style.minWidth !== width) {
    element.style.minWidth = width;
    changed = true;
  }
  if (element.style.maxWidth !== width) {
    element.style.maxWidth = width;
    changed = true;
  }
  return changed;
};

const setColumnWidth = (column: HTMLTableColElement, width: string): boolean => {
  if (column.style.width === width) {
    return false;
  }

  column.style.width = width;
  return true;
};

const syncSpacerRow = (
  row: HTMLTableRowElement,
  cell: HTMLTableCellElement,
  height: number,
  colSpan: number,
): boolean => {
  const visible = height > 0;
  let changed = setHidden(row, !visible);
  if (cell.colSpan !== colSpan) {
    cell.colSpan = colSpan;
    changed = true;
  }

  const nextHeight = visible ? `${height}px` : "";
  if (cell.style.height !== nextHeight) {
    cell.style.height = nextHeight;
    changed = true;
  }

  return changed;
};

const getTableViewInputKey = ({
  tableState,
  zoomPercent,
}: TableViewProps): string => {
  const file = tableState.file;
  return [
    zoomPercent,
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
  ].join("\u001f");
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
): readonly TableGridCellRange[] => {
  const visibleRanges: TableGridCellRange[] = [];
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
  first: readonly TableGridCellRange[],
  second: readonly TableGridCellRange[],
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
