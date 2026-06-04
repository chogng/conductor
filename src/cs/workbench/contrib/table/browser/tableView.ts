import { addDisposableListener, EventType } from "src/cs/base/browser/dom";
import { DisposableStore } from "src/cs/base/common/lifecycle";
import { localize } from "src/cs/nls";
import { Scrollbar } from "src/cs/base/browser/ui/scrollbar/scrollbar";
import { createEmptyView } from "src/cs/workbench/contrib/table/browser/emptyView";
import type {
  TableModel,
  TableSelection,
  TableState,
} from "src/cs/workbench/contrib/table/common/tableService";

export type TableViewProps = {
  readonly tableModel: TableModel;
  readonly tableState: TableState;
  readonly zoomPercent: number;
};

type BodyCell = {
  readonly element: HTMLTableCellElement;
  appliedHighlighted?: boolean;
  appliedHidden?: boolean;
  appliedSelected?: boolean;
  appliedText?: string;
};

type BodyRow = {
  readonly element: HTMLTableRowElement;
  readonly cells: BodyCell[];
  appliedHidden?: boolean;
};

type ActiveCell = {
  readonly colIndex: number;
  readonly rowIndex: number;
};

type AppliedCellState = {
  readonly activeCell: ActiveCell | null;
  readonly highlightedColumns: Set<number>;
  readonly selectedColumns: Set<number>;
};

const MAX_RENDERED_ROWS = 80;
const MAX_RENDERED_COLUMNS = 24;

export class TableView {
  public readonly element: HTMLElement;
  private readonly store = new DisposableStore();
  private readonly body = document.createElement("div");
  private readonly header = document.createElement("div");
  private readonly headerCorner = document.createElement("div");
  private readonly headerScroll = document.createElement("div");
  private readonly headerContent = document.createElement("div");
  private readonly content = document.createElement("div");
  private readonly table = document.createElement("table");
  private readonly bodyRows = document.createElement("tbody");
  private readonly activeCell = document.createElement("div");
  private readonly scrollArea = new Scrollbar({
    axis: "both",
    className: "table_view_scroll_area",
    onScroll: () => this.syncHeaderScroll(),
    viewportClassName: "table_view_preview",
  });
  private disposeSelectionListener: (() => void) | null = null;
  private disposeRowsVersionListener: (() => void) | null = null;
  private readonly bodyGrid: BodyRow[] = [];
  private headerColumnCount = 0;
  private bodyRowCount = 0;
  private bodyColumnCount = 0;
  private renderedZoomPercent: number | null = null;
  private renderedSourceKey: string | null = null;
  private appliedCellState: AppliedCellState | null = null;
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
    this.content.className = "table_view_content";
    this.table.className = "table_view_grid";
    this.activeCell.className = "table_view_active_cell";
    this.activeCell.hidden = true;
    this.activeCell.setAttribute("aria-hidden", "true");
    this.headerCorner.setAttribute("aria-hidden", "true");
    this.headerScroll.append(this.headerContent);
    this.header.append(this.headerCorner, this.headerScroll);
    this.table.append(this.bodyRows);
    this.content.append(this.table, this.activeCell);
    this.body.append(this.header, this.scrollArea.element);
    this.element.append(this.body);
    this.store.add(addDisposableListener(this.headerContent, EventType.CLICK, event => {
      this.onHeaderClick(event as MouseEvent);
    }));
    this.store.add(addDisposableListener(this.bodyRows, EventType.CLICK, event => {
      this.onBodyClick(event as MouseEvent);
    }));
    this.bindTableState(props.tableModel);
    this.render();
  }

  public update(props: TableViewProps): void {
    const previousModel = this.props.tableModel;
    this.props = props;
    if (previousModel !== props.tableModel) {
      this.bindTableState(props.tableModel);
    }
    this.render();
  }

  public dispose(): void {
    this.disposeSelectionListener?.();
    this.disposeSelectionListener = null;
    this.disposeRowsVersionListener?.();
    this.disposeRowsVersionListener = null;
    this.store.dispose();
    this.scrollArea.dispose();
    this.element.replaceChildren();
    this.element.remove();
  }

  public focus(): void {
    this.element.focus();
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
    this.disposeSelectionListener = tableModel.onDidChangeSelection(() => {
      this.syncSelectionState();
    });
    this.disposeRowsVersionListener = tableModel.subscribeRowsVersion(() => {
      this.syncRows();
    });
  }

  private render(): void {
    const { tableState } = this.props;
    const tableFile = tableState.file;
    const sourceKey = tableState.sourceKey ?? tableState.selectedFileId ?? null;
    this.element.dataset.state = tableState.loadState.state;

    if (this.renderedSourceKey !== sourceKey) {
      this.renderedSourceKey = sourceKey;
      this.appliedCellState = null;
      this.clearRowsText();
    }

    if (!tableState.selectedFileId || !tableFile) {
      if (tableState.loadState.state === "loading" && this.bodyGrid.length > 0) {
        if (this.scrollArea.viewport.firstChild !== this.content) {
          this.scrollArea.viewport.replaceChildren(this.content);
        }
        this.header.hidden = false;
        this.scrollArea.layout();
        this.syncHeaderScroll();
        return;
      }

      this.header.hidden = true;
      this.scrollArea.viewport.replaceChildren();
      this.scrollArea.viewport.append(createEmptyView({
        description: tableState.loadState.state === "loading"
          ? tableState.loadState.message || localize("preview_loading_hint", "Parsing CSV preview, please wait.")
          : localize("preview_empty_hint", "Select a file to preview"),
      }));
      this.scrollArea.layout();
      return;
    }

    if (tableState.loadState.state === "loading") {
      this.header.hidden = true;
      this.scrollArea.viewport.replaceChildren();
      this.scrollArea.viewport.append(createEmptyView({
        title: localize("preview_loading", "Loading preview..."),
        description: tableState.loadState.message || localize("preview_loading_hint", "Parsing CSV preview, please wait."),
      }));
      this.scrollArea.layout();
      return;
    }

    const didAttachContent = this.scrollArea.viewport.firstChild !== this.content;
    if (didAttachContent) {
      this.scrollArea.viewport.replaceChildren(this.content);
    }

    const needsLayout = this.renderTable();
    if (didAttachContent || needsLayout) {
      this.scrollArea.layout();
    }
    this.syncHeaderScroll();
  }

  private renderTable(): boolean {
    const { tableModel, tableState, zoomPercent } = this.props;
    const tableFile = tableState.file;
    const zoomChanged = this.renderedZoomPercent !== zoomPercent;
    if (zoomChanged) {
      this.renderedZoomPercent = zoomPercent;
      this.body.style.setProperty("--table-view-zoom", String(zoomPercent / 100));
    }

    const rowCount = Math.min(Math.max(Number(tableFile?.rowCount) || 0, 0), MAX_RENDERED_ROWS);
    const columnCount = Math.min(Math.max(Number(tableFile?.columnCount) || 0, 0), MAX_RENDERED_COLUMNS);
    if (rowCount === 0 || columnCount === 0) {
      this.header.hidden = true;
      this.scrollArea.viewport.replaceChildren(createEmptyView({
        description: localize("preview_empty_hint", "Select a file to preview"),
      }));
      return true;
    }

    this.header.hidden = false;
    const headerChanged = this.ensureHeaderGrid(columnCount);
    const gridChanged = this.renderBody(tableModel, rowCount, columnCount);

    if (tableFile?.fileId) {
      void tableModel.ensureRows(tableFile.sourceKey ?? tableFile.fileId, 0, rowCount);
    }

    return headerChanged || gridChanged || zoomChanged;
  }

  private ensureHeaderGrid(columnCount: number): boolean {
    let changed = false;
    if (this.headerColumnCount < MAX_RENDERED_COLUMNS) {
      const startIndex = this.headerColumnCount;
      this.headerColumnCount = MAX_RENDERED_COLUMNS;

      for (let colIndex = startIndex; colIndex < MAX_RENDERED_COLUMNS; colIndex += 1) {
        const cell = document.createElement("div");
        const button = document.createElement("button");
        cell.className = "table_view_grid_header_cell";
        cell.setAttribute("role", "columnheader");
        button.type = "button";
        button.className = "table_view_column_button";
        button.dataset.colIndex = String(colIndex);
        button.textContent = getColumnLabel(colIndex);
        button.setAttribute("aria-label", localize("preview_toggle_column", "Toggle column {column}", {
          column: getColumnLabel(colIndex),
        }));
        cell.append(button);
        this.headerContent.append(cell);
      }

      changed = true;
    }

    for (let colIndex = 0; colIndex < this.headerColumnCount; colIndex += 1) {
      const cell = this.headerContent.children.item(colIndex) as HTMLElement | null;
      if (cell && setHidden(cell, colIndex >= columnCount)) {
        changed = true;
      }
    }

    return changed;
  }

  private renderBody(
    tableModel: TableModel,
    rowCount: number,
    columnCount: number,
  ): boolean {
    const gridChanged = this.ensureBodyGrid(rowCount, columnCount);
    this.table.setAttribute("aria-rowcount", String(rowCount));
    this.table.setAttribute("aria-colcount", String(columnCount));
    this.syncRowsText(tableModel, rowCount, columnCount);
    this.syncSelectionState();

    return gridChanged;
  }

  private syncRows(): void {
    if (!this.isTableVisible()) {
      this.render();
      return;
    }

    this.syncRowsText(this.props.tableModel, this.bodyRowCount, this.bodyColumnCount);
  }

  private syncRowsText(
    tableModel: TableModel,
    rowCount: number,
    columnCount: number,
  ): void {
    for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
      const row = this.bodyGrid[rowIndex];
      const cells = tableModel.getRow(rowIndex) ?? [];
      for (let colIndex = 0; colIndex < columnCount; colIndex += 1) {
        const cell = row.cells[colIndex];
        this.updateCellText(cell, formatCell(cells[colIndex]));
      }
    }
  }

  private ensureBodyGrid(rowCount: number, columnCount: number): boolean {
    const gridChanged = this.ensureBodyCells();
    const visibleRangeChanged = this.syncBodyGridVisibility(rowCount, columnCount);

    if (visibleRangeChanged) {
      this.appliedCellState = null;
    }

    return gridChanged || visibleRangeChanged;
  }

  private ensureBodyCells(): boolean {
    if (this.bodyGrid.length > 0) {
      return false;
    }

    for (let rowIndex = 0; rowIndex < MAX_RENDERED_ROWS; rowIndex += 1) {
      const row = document.createElement("tr");
      const rowHeader = document.createElement("th");
      const rowHeaderLabel = document.createElement("span");
      const cells: BodyCell[] = [];

      rowHeader.scope = "row";
      rowHeaderLabel.className = "table_view_row_header_label";
      rowHeaderLabel.textContent = String(rowIndex + 1);
      rowHeader.append(rowHeaderLabel);
      row.append(rowHeader);

      for (let colIndex = 0; colIndex < MAX_RENDERED_COLUMNS; colIndex += 1) {
        const cell = document.createElement("td");
        cell.className = "table_view_cell";
        cell.dataset.rowIndex = String(rowIndex);
        cell.dataset.colIndex = String(colIndex);
        row.append(cell);
        cells.push({ element: cell });
      }

      this.bodyGrid.push({
        element: row,
        cells,
      });
      this.bodyRows.append(row);
    }

    return true;
  }

  private syncBodyGridVisibility(rowCount: number, columnCount: number): boolean {
    const changed = this.bodyRowCount !== rowCount || this.bodyColumnCount !== columnCount;
    this.bodyRowCount = rowCount;
    this.bodyColumnCount = columnCount;

    for (let rowIndex = 0; rowIndex < this.bodyGrid.length; rowIndex += 1) {
      const row = this.bodyGrid[rowIndex];
      const rowHidden = rowIndex >= rowCount;
      if (row.appliedHidden !== rowHidden) {
        row.element.hidden = rowHidden;
        row.appliedHidden = rowHidden;
      }

      for (let colIndex = 0; colIndex < row.cells.length; colIndex += 1) {
        const cell = row.cells[colIndex];
        const cellHidden = colIndex >= columnCount;
        if (cell.appliedHidden !== cellHidden) {
          cell.element.hidden = cellHidden;
          cell.appliedHidden = cellHidden;
        }
      }
    }

    return changed;
  }

  private syncSelectionState(): void {
    if (!this.isTableVisible()) {
      return;
    }

    const { tableModel } = this.props;
    const rowCount = this.bodyRowCount;
    const columnCount = this.bodyColumnCount;
    const selection = tableModel.getSelection();
    const activeCell = normalizeActiveCell(selection.activeCell, rowCount, columnCount);
    const selectedColumns = toColumnSet(selection.selectedColumns, columnCount);
    const highlightedColumns = toColumnSet(tableModel.getHighlight().columns, columnCount);
    const previous = this.appliedCellState;
    const next: AppliedCellState = {
      activeCell,
      highlightedColumns,
      selectedColumns,
    };

    if (!previous) {
      this.syncHeaderColumns(range(columnCount), next);
      for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
        const row = this.bodyGrid[rowIndex];
        for (let colIndex = 0; colIndex < columnCount; colIndex += 1) {
          this.updateCellState(row.cells[colIndex], {
            highlighted: highlightedColumns.has(colIndex),
            selected: selectedColumns.has(colIndex),
          });
        }
      }
      this.syncActiveCell(activeCell);
      this.appliedCellState = next;
      return;
    }

    const changedColumns = getChangedColumns(previous, next, columnCount);
    this.syncHeaderColumns(changedColumns, next);

    for (const colIndex of changedColumns) {
      for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
        this.updateCellState(this.bodyGrid[rowIndex].cells[colIndex], {
          highlighted: highlightedColumns.has(colIndex),
          selected: selectedColumns.has(colIndex),
        });
      }
    }

    this.syncActiveCell(activeCell);
    this.appliedCellState = next;
  }

  private syncActiveCell(activeCell: ActiveCell | null): void {
    if (!activeCell) {
      this.activeCell.hidden = true;
      this.activeCell.style.transform = "";
      return;
    }

    const cell = this.bodyGrid[activeCell.rowIndex]?.cells[activeCell.colIndex]?.element;
    if (!cell) {
      this.activeCell.hidden = true;
      this.activeCell.style.transform = "";
      return;
    }

    const cellRect = cell.getBoundingClientRect();
    const contentRect = this.content.getBoundingClientRect();
    this.activeCell.style.width = `${cellRect.width}px`;
    this.activeCell.style.height = `${cellRect.height}px`;
    this.activeCell.hidden = false;
    this.activeCell.style.transform = `translate3d(${cellRect.left - contentRect.left}px, ${cellRect.top - contentRect.top}px, 0)`;
  }

  private syncHeaderColumns(
    columns: readonly number[],
    state: Pick<AppliedCellState, "highlightedColumns" | "selectedColumns">,
  ): void {
    for (const colIndex of columns) {
      const cell = this.headerContent.children.item(colIndex) as HTMLElement | null;
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
      readonly highlighted: boolean;
      readonly selected: boolean;
    },
  ): void {
    const element = cell.element;

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
    tableModel.setSelection(toggleSelectedColumn(tableModel.getSelection(), colIndex));
    this.focus();
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

    const { tableModel, tableState } = this.props;
    const selection = tableModel.getSelection();
    const tableFile = tableState.file;
    tableModel.setSelection({
      selectedColumns: selection.selectedColumns ?? [],
      activeCell: {
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
}

const toggleSelectedColumn = (
  selection: TableSelection,
  colIndex: number,
): TableSelection => {
  const columns = new Set(selection.selectedColumns ?? []);
  if (columns.has(colIndex)) {
    columns.delete(colIndex);
  } else {
    columns.add(colIndex);
  }

  return {
    ...selection,
    selectedColumns: Array.from(columns).sort((a, b) => a - b),
  };
};

const getColumnLabel = (index: number): string => {
  let value = Math.floor(index) + 1;
  let label = "";
  while (value > 0) {
    const remainder = (value - 1) % 26;
    label = String.fromCharCode(65 + remainder) + label;
    value = Math.floor((value - 1) / 26);
  }
  return label;
};

const formatCell = (value: unknown): string => {
  if (value === null || value === undefined) {
    return "";
  }
  return String(value);
};

const range = (count: number): number[] => {
  const result: number[] = [];
  for (let index = 0; index < count; index += 1) {
    result.push(index);
  }
  return result;
};

const setHidden = (element: HTMLElement, hidden: boolean): boolean => {
  if (element.hidden === hidden) {
    return false;
  }

  element.hidden = hidden;
  return true;
};

const toColumnSet = (
  columnIndexes: readonly number[] | undefined,
  columnCount: number,
): Set<number> => {
  const columns = new Set<number>();
  for (const value of columnIndexes ?? []) {
    const columnIndex = Math.floor(Number(value));
    if (
      Number.isInteger(columnIndex) &&
      columnIndex >= 0 &&
      columnIndex < columnCount
    ) {
      columns.add(columnIndex);
    }
  }
  return columns;
};

const normalizeActiveCell = (
  cell: TableSelection["activeCell"],
  rowCount: number,
  columnCount: number,
): ActiveCell | null => {
  const rowIndex = Math.floor(Number(cell?.rowIndex));
  const colIndex = Math.floor(Number(cell?.colIndex));
  if (
    !Number.isInteger(rowIndex) ||
    rowIndex < 0 ||
    rowIndex >= rowCount ||
    !Number.isInteger(colIndex) ||
    colIndex < 0 ||
    colIndex >= columnCount
  ) {
    return null;
  }

  return {
    colIndex,
    rowIndex,
  };
};

const getChangedColumns = (
  previous: Pick<AppliedCellState, "highlightedColumns" | "selectedColumns">,
  next: Pick<AppliedCellState, "highlightedColumns" | "selectedColumns">,
  columnCount: number,
): number[] => {
  const columns = new Set<number>();

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
    .filter((colIndex) => colIndex >= 0 && colIndex < columnCount)
    .sort((a, b) => a - b);
};
