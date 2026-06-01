import type { TranslateFn } from "src/cs/platform/language/common/language";
import type { PreviewFile } from "src/cs/workbench/common/deviceAnalysis/sharedTypes";
import type { PreviewStatus } from "src/cs/workbench/contrib/session/analysis-session-context";
import { createEmptyView } from "src/cs/workbench/contrib/table/browser/emptyView";
import type {
  TableBindings,
  TableSelection,
} from "src/cs/workbench/services/table/common/table";

export type TableViewProps = {
  readonly previewBindings: TableBindings;
  readonly previewFile?: PreviewFile | null;
  readonly previewStatus?: PreviewStatus;
  readonly selectedFileId?: string | null;
  readonly t: TranslateFn;
};

export class TableView {
  public readonly element: HTMLElement;
  private readonly body = document.createElement("div");
  private disposeSelectionListener: (() => void) | null = null;
  private disposeRowsVersionListener: (() => void) | null = null;
  private props: TableViewProps;

  constructor(props: TableViewProps) {
    this.props = props;
    this.element = document.createElement("div");
    this.element.className = "table_view";
    this.body.className = "table_view_body";
    this.element.append(this.body);
    this.bindTableState(props.previewBindings);
    this.render();
  }

  public update(props: TableViewProps): void {
    const previousBindings = this.props.previewBindings;
    this.props = props;
    if (previousBindings !== props.previewBindings) {
      this.bindTableState(props.previewBindings);
    }
    this.render();
  }

  public dispose(): void {
    this.disposeSelectionListener?.();
    this.disposeSelectionListener = null;
    this.disposeRowsVersionListener?.();
    this.disposeRowsVersionListener = null;
    this.element.replaceChildren();
    this.element.remove();
  }

  private bindTableState(previewBindings: TableBindings): void {
    this.disposeSelectionListener?.();
    this.disposeRowsVersionListener?.();
    this.disposeSelectionListener = previewBindings.onDidChangeSelection(() => {
      this.render();
    });
    this.disposeRowsVersionListener = previewBindings.subscribePreviewRowsVersion(() => {
      this.render();
    });
  }

  private render(): void {
    const { previewFile, previewStatus, selectedFileId, t } = this.props;
    this.body.replaceChildren();
    this.element.dataset.state = previewStatus?.state ?? "idle";

    if (!selectedFileId || !previewFile) {
      this.body.append(createEmptyView({
        description: t("preview_empty_hint"),
      }));
      return;
    }

    if (previewStatus?.state === "loading") {
      this.body.append(createEmptyView({
        title: t("preview_loading"),
        description: previewStatus.message || t("preview_loading_hint"),
      }));
      return;
    }

    this.body.append(this.createTablePreview());
  }

  private createTablePreview(): HTMLElement {
    const { previewBindings, previewFile, t } = this.props;
    const root = document.createElement("div");
    root.className = "table_view_preview";

    const table = document.createElement("table");
    table.className = "table_view_grid";

    const rowCount = Math.min(Math.max(Number(previewFile?.rowCount) || 0, 0), 80);
    const columnCount = Math.min(Math.max(Number(previewFile?.columnCount) || 0, 0), 24);
    if (rowCount === 0 || columnCount === 0) {
      root.append(createEmptyView({
        description: t("preview_empty_hint"),
      }));
      return root;
    }

    const selection = previewBindings.getSelection();
    const highlightedColumns = new Set(previewBindings.getHighlight().columns ?? []);
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
        previewBindings.setSelection(toggleSelectedColumn(selection, colIndex));
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

      const cells = previewBindings.getPreviewRow(rowIndex) ?? [];
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
          previewBindings.setSelection({
            selectedColumns: selection.selectedColumns ?? [],
            activeCell: {
              colIndex,
              fileId: previewFile?.fileId ?? null,
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

    if (previewFile?.fileId) {
      void previewBindings.ensurePreviewRows(previewFile.fileId, 0, rowCount);
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
