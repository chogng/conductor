import { Scrollbar } from "src/cs/base/browser/ui/scrollbar/scrollbar";
import type { TranslateFn } from "src/cs/platform/language/common/language";
import { createEmptyView } from "src/cs/workbench/contrib/table/browser/emptyView";
import type {
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
  private readonly scrollArea = new Scrollbar({
    axis: "both",
    className: "table_view_scroll_area",
    viewportClassName: "table_view_preview",
  });
  private disposeSelectionListener: (() => void) | null = null;
  private disposeRowsVersionListener: (() => void) | null = null;
  private props: TableViewProps;

  constructor(props: TableViewProps) {
    this.props = props;
    this.element = document.createElement("div");
    this.element.className = "table_view";
    this.body.className = "table_view_body";
    this.body.append(this.scrollArea.element);
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
    this.scrollArea.viewport.replaceChildren();
    this.element.dataset.state = tableState.loadState.state;

    if (!tableState.selectedFileId || !tableFile) {
      this.scrollArea.viewport.append(createEmptyView({
        description: t("preview_empty_hint"),
      }));
      this.scrollArea.layout();
      return;
    }

    if (tableState.loadState.state === "loading") {
      this.scrollArea.viewport.append(createEmptyView({
        title: t("preview_loading"),
        description: tableState.loadState.message || t("preview_loading_hint"),
      }));
      this.scrollArea.layout();
      return;
    }

    this.scrollArea.viewport.append(this.createTable());
    this.scrollArea.layout();
  }

  private createTable(): HTMLElement {
    const { tableModel, tableState, t, zoomPercent } = this.props;
    const tableFile = tableState.file;
    const root = document.createElement("div");
    root.className = "table_view_content";
    root.style.setProperty("--table-view-zoom", String(zoomPercent / 100));

    const table = document.createElement("table");
    table.className = "table_view_grid";

    const rowCount = Math.min(Math.max(Number(tableFile?.rowCount) || 0, 0), 80);
    const columnCount = Math.min(Math.max(Number(tableFile?.columnCount) || 0, 0), 24);
    if (rowCount === 0 || columnCount === 0) {
      root.append(createEmptyView({
        description: t("preview_empty_hint"),
      }));
      return root;
    }

    const selection = tableModel.getSelection();
    const highlightedColumns = new Set(tableModel.getHighlight().columns ?? []);
    const selectedColumns = new Set(selection.selectedColumns ?? []);

    const head = document.createElement("thead");
    const headerRow = document.createElement("tr");
    headerRow.append(document.createElement("th"));
    for (let colIndex = 0; colIndex < columnCount; colIndex += 1) {
      const cell = document.createElement("th");
      const button = document.createElement("button");
      button.type = "button";
      button.className = "table_view_column_button";
      button.textContent = getColumnLabel(colIndex);
      button.addEventListener("click", () => {
        tableModel.setSelection(toggleSelectedColumn(selection, colIndex));
      });
      cell.dataset.selected = selectedColumns.has(colIndex) ? "true" : "false";
      cell.dataset.highlighted = highlightedColumns.has(colIndex) ? "true" : "false";
      cell.append(button);
      headerRow.append(cell);
    }
    head.append(headerRow);
    table.append(head);

    const body = document.createElement("tbody");
    for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
      const row = document.createElement("tr");
      const rowHeader = document.createElement("th");
      rowHeader.textContent = String(rowIndex + 1);
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
            },
          });
        });
        row.append(cell);
      }
      body.append(row);
    }
    table.append(body);
    root.append(table);

    if (tableFile?.fileId) {
      void tableModel.ensureRows(tableFile.fileId, 0, rowCount);
    }

    return root;
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
