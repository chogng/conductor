import { Scrollbar } from "src/cs/base/browser/ui/scrollbar/scrollbar";
import type { TranslateFn } from "src/cs/platform/language/common/language";
import { createEmptyView } from "src/cs/workbench/contrib/table/browser/emptyView";
import type {
  TableFile,
  TableModel,
  TableSelection,
  TableState,
} from "src/cs/workbench/contrib/table/common/tableService";

export type TableViewProps = {
  readonly tableModel: TableModel;
  readonly tableState: TableState;
  readonly t: TranslateFn;
  readonly zoomPercent: number;
};

export class TableView {
  public readonly element: HTMLElement;
  private readonly body = document.createElement("div");
  private readonly header = document.createElement("div");
  private readonly headerCorner = document.createElement("div");
  private readonly headerScroll = document.createElement("div");
  private readonly headerContent = document.createElement("div");
  private readonly content = document.createElement("div");
  private readonly table = document.createElement("table");
  private readonly bodyRows = document.createElement("tbody");
  private readonly scrollArea = new Scrollbar({
    axis: "both",
    className: "table_view_scroll_area",
    onScroll: () => this.syncHeaderScroll(),
    viewportClassName: "table_view_preview",
  });
  private disposeSelectionListener: (() => void) | null = null;
  private disposeRowsVersionListener: (() => void) | null = null;
  private headerColumnCount = 0;
  private props: TableViewProps;

  constructor(props: TableViewProps) {
    this.props = props;
    this.element = document.createElement("div");
    this.element.className = "table_view";
    this.body.className = "table_view_body";
    this.header.className = "table_view_grid_header";
    this.headerCorner.className = "table_view_grid_header_corner";
    this.headerScroll.className = "table_view_grid_header_scroll";
    this.headerContent.className = "table_view_grid_header_content";
    this.content.className = "table_view_content";
    this.table.className = "table_view_grid";
    this.headerCorner.setAttribute("aria-hidden", "true");
    this.headerScroll.append(this.headerContent);
    this.header.append(this.headerCorner, this.headerScroll);
    this.table.append(this.bodyRows);
    this.content.append(this.table);
    this.body.append(this.header, this.scrollArea.element);
    this.element.append(this.body);
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
    this.scrollArea.dispose();
    this.element.replaceChildren();
    this.element.remove();
  }

  private bindTableState(tableModel: TableModel): void {
    this.disposeSelectionListener?.();
    this.disposeRowsVersionListener?.();
    this.disposeSelectionListener = tableModel.onDidChangeSelection(() => {
      this.render();
    });
    this.disposeRowsVersionListener = tableModel.subscribeRowsVersion(() => {
      this.render();
    });
  }

  private render(): void {
    const { tableState, t } = this.props;
    const tableFile = tableState.file;
    this.element.dataset.state = tableState.loadState.state;

    if (!tableState.selectedFileId || !tableFile) {
      this.header.hidden = true;
      this.scrollArea.viewport.replaceChildren();
      this.scrollArea.viewport.append(createEmptyView({
        description: t("preview_empty_hint"),
      }));
      this.scrollArea.layout();
      return;
    }

    if (tableState.loadState.state === "loading") {
      this.header.hidden = true;
      this.scrollArea.viewport.replaceChildren();
      this.scrollArea.viewport.append(createEmptyView({
        title: t("preview_loading"),
        description: tableState.loadState.message || t("preview_loading_hint"),
      }));
      this.scrollArea.layout();
      return;
    }

    if (this.scrollArea.viewport.firstChild !== this.content) {
      this.scrollArea.viewport.replaceChildren(this.content);
    }

    this.renderTable();
    this.scrollArea.layout();
    this.syncHeaderScroll();
  }

  private renderTable(): void {
    const { tableModel, tableState, t, zoomPercent } = this.props;
    const tableFile = tableState.file;
    this.body.style.setProperty("--table-view-zoom", String(zoomPercent / 100));

    const rowCount = Math.min(Math.max(Number(tableFile?.rowCount) || 0, 0), 80);
    const columnCount = Math.min(Math.max(Number(tableFile?.columnCount) || 0, 0), 24);
    if (rowCount === 0 || columnCount === 0) {
      this.header.hidden = true;
      this.scrollArea.viewport.replaceChildren(createEmptyView({
        description: t("preview_empty_hint"),
      }));
      return;
    }

    this.header.hidden = false;
    this.renderHeader(tableModel, columnCount);
    this.renderBody(tableModel, tableFile, rowCount, columnCount);

    if (tableFile?.fileId) {
      void tableModel.ensureRows(tableFile.sourceKey ?? tableFile.fileId, 0, rowCount);
    }
  }

  private renderHeader(tableModel: TableModel, columnCount: number): void {
    if (this.headerColumnCount !== columnCount) {
      this.headerColumnCount = columnCount;
      this.headerContent.replaceChildren();

      for (let colIndex = 0; colIndex < columnCount; colIndex += 1) {
        const cell = document.createElement("div");
        const button = document.createElement("button");
        cell.className = "table_view_grid_header_cell";
        cell.setAttribute("role", "columnheader");
        button.type = "button";
        button.className = "table_view_column_button";
        button.textContent = getColumnLabel(colIndex);
        button.addEventListener("click", () => {
          const currentModel = this.props.tableModel;
          currentModel.setSelection(toggleSelectedColumn(currentModel.getSelection(), colIndex));
        });
        cell.append(button);
        this.headerContent.append(cell);
      }
    }

    const selection = tableModel.getSelection();
    const highlightedColumns = new Set(tableModel.getHighlight().columns ?? []);
    const selectedColumns = new Set(selection.selectedColumns ?? []);

    for (let colIndex = 0; colIndex < columnCount; colIndex += 1) {
      const cell = this.headerContent.children.item(colIndex) as HTMLElement | null;
      if (!cell) {
        continue;
      }

      cell.dataset.selected = selectedColumns.has(colIndex) ? "true" : "false";
      cell.dataset.highlighted = highlightedColumns.has(colIndex) ? "true" : "false";
    }
  }

  private renderBody(
    tableModel: TableModel,
    tableFile: TableFile | null,
    rowCount: number,
    columnCount: number,
  ): void {
    this.bodyRows.replaceChildren();

    const selection = tableModel.getSelection();
    const highlightedColumns = new Set(tableModel.getHighlight().columns ?? []);
    const selectedColumns = new Set(selection.selectedColumns ?? []);

    for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
      const row = document.createElement("tr");
      const rowHeader = document.createElement("th");
      const rowHeaderLabel = document.createElement("span");
      rowHeaderLabel.className = "table_view_row_header_label";
      rowHeaderLabel.textContent = String(rowIndex + 1);
      rowHeader.append(rowHeaderLabel);
      row.append(rowHeader);

      const cells = tableModel.getRow(rowIndex) ?? [];
      for (let colIndex = 0; colIndex < columnCount; colIndex += 1) {
        const cell = document.createElement("td");
        const isActiveCell =
          selection.activeCell?.rowIndex === rowIndex &&
          selection.activeCell?.colIndex === colIndex;
        cell.textContent = formatCell(cells[colIndex]);
        cell.dataset.active = isActiveCell ? "true" : "false";
        cell.dataset.selected = selectedColumns.has(colIndex) ? "true" : "false";
        cell.dataset.highlighted = highlightedColumns.has(colIndex) ? "true" : "false";
        cell.addEventListener("click", () => {
          tableModel.setSelection({
            selectedColumns: selection.selectedColumns ?? [],
            activeCell: {
              colIndex,
              fileId: tableFile?.fileId ?? null,
              rowIndex,
              sheetId: tableFile?.sheetId ?? null,
            },
          });
        });
        row.append(cell);
      }
      this.bodyRows.append(row);
    }
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
