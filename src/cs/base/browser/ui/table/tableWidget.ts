import { clearNode, getContentHeight, getContentWidth } from "src/cs/base/browser/dom";
import { DisposableStore, type IDisposable } from "src/cs/base/common/lifecycle";
import { ListView } from "src/cs/base/browser/ui/list/listView";
import type { ListRenderState } from "src/cs/base/browser/ui/list/list";
import SplitView, {
  type SplitViewPane,
  type SplitViewResizeEvent,
} from "src/cs/base/browser/ui/splitview/splitview";
import { getBaseLayerHoverDelegate } from "src/cs/base/browser/ui/hover/hoverDelegate";
import type {
  ITableColumn,
  ITableRenderer,
  ITableSelectEvent,
  ITableVirtualDelegate,
} from "src/cs/base/browser/ui/table/table";
import { TableError } from "src/cs/base/browser/ui/table/table";

import "src/cs/base/browser/ui/table/table.css";

type CellTemplate = {
  readonly container: HTMLElement;
  readonly data: unknown;
};

type RowTemplateData<TRow> = {
  readonly cells: CellTemplate[];
  readonly container: HTMLElement;
  index: number;
  row: TRow;
};

export type TableOptions<TRow> = {
  readonly className?: string;
  readonly empty?: (container: HTMLElement) => void;
  readonly disposeEmpty?: (container: HTMLElement) => void;
  readonly getKey: (row: TRow, index: number) => string;
  readonly minVirtualCount?: number;
  readonly onKeyDown?: (event: KeyboardEvent) => void;
  readonly onSelect?: (event: ITableSelectEvent<TRow>) => void;
  readonly overscanRows?: number;
  readonly rowGap?: number;
  readonly selectedKey?: string | null;
};

export type TableOptionsUpdate<TRow> = Partial<TableOptions<TRow>> & {
  readonly getKey?: (row: TRow, index: number) => string;
};

const DEFAULT_COLUMN_WIDTH = 120;

const classNames = (...names: Array<string | undefined>): string =>
  names
    .flatMap((name) => name?.split(/\s+/g) ?? [])
    .filter(Boolean)
    .join(" ");

export class Table<TRow> implements IDisposable {
  public readonly domNode: HTMLElement;
  private readonly bodyElement: HTMLDivElement;
  private readonly headerElement: HTMLDivElement;
  private readonly disposables = new DisposableStore();
  private readonly headerDisposables = this.disposables.add(new DisposableStore());
  private readonly rowTemplates = new Map<string, RowTemplateData<TRow>>();
  private readonly splitView: SplitView;
  private readonly list: ListView<TRow>;
  private readonly renderers: ITableRenderer<unknown, unknown>[];
  private options: TableOptions<TRow>;
  private columnSizes: number[];
  private rows: TRow[] = [];
  private cachedHeight = 0;
  private cachedWidth = 0;

  public constructor(
    private readonly user: string,
    container: HTMLElement,
    private readonly virtualDelegate: ITableVirtualDelegate<TRow>,
    private readonly columns: readonly ITableColumn<TRow, unknown>[],
    renderers: readonly ITableRenderer<unknown, unknown>[],
    options: TableOptions<TRow>,
  ) {
    this.options = options;
    this.renderers = this.resolveRenderers(renderers);
    this.columnSizes = columns.map((column) =>
      Math.max(column.minimumWidth ?? DEFAULT_COLUMN_WIDTH, column.weight),
    );

    this.domNode = document.createElement("div");
    this.headerElement = document.createElement("div");
    this.bodyElement = document.createElement("div");
    this.domNode.append(this.headerElement, this.bodyElement);
    container.appendChild(this.domNode);

    this.splitView = this.disposables.add(new SplitView({
      className: "ui-table__header-split-view",
      onDidResize: (event) => this.onDidResizeColumns(event),
      onDidResizeEnd: (event) => this.onDidResizeColumns(event),
      orientation: "horizontal",
      panes: this.createHeaderPanes(),
      style: {
        height: `${this.virtualDelegate.headerRowHeight}px`,
        lineHeight: `${this.virtualDelegate.headerRowHeight}px`,
      },
    }));
    this.headerElement.appendChild(this.splitView.element);
    this.renderHeaders();

    this.list = this.disposables.add(new ListView(this.bodyElement, {
      delegate: {
        getHeight: (row) => this.virtualDelegate.getHeight(row),
      },
      disposeEmpty: options.disposeEmpty,
      disposeItem: (row, index) => this.disposeRow(row, index),
      empty: options.empty,
      getKey: options.getKey,
      gap: options.rowGap,
      items: this.rows,
      minVirtualCount: options.minVirtualCount,
      onKeyDown: options.onKeyDown,
      onSelect: (row, index, browserEvent) => {
        this.options.onSelect?.({ browserEvent, index, row });
      },
      overscanRows: options.overscanRows,
      renderItem: (row, index, state, container) => this.renderRow(row, index, state, container),
      role: "rowgroup",
      rowRole: "row",
      selectedKey: options.selectedKey,
      viewportClassName: "ui-table__viewport",
    }));

    for (const column of columns) {
      if (column.onDidChangeWidthConstraints) {
        column.onDidChangeWidthConstraints(() => this.layout(this.cachedHeight, this.cachedWidth), undefined, this.disposables);
      }
    }

    this.updateClasses();
  }

  public get length(): number {
    return this.rows.length;
  }

  public getColumnLabels(): string[] {
    return this.columns.map((column) => column.label);
  }

  public row(index: number): TRow {
    const row = this.rows[index];
    if (typeof row === "undefined") {
      throw new TableError(this.user, `Row ${index} not found.`);
    }

    return row;
  }

  public setRows(rows: readonly TRow[]): void {
    this.rows = [...rows];
    this.updateList();
  }

  public splice(start: number, deleteCount: number, rows: readonly TRow[] = []): void {
    this.rows.splice(start, deleteCount, ...rows);
    this.updateList();
  }

  public updateOptions(options: TableOptionsUpdate<TRow>): void {
    this.options = {
      ...this.options,
      ...options,
      getKey: options.getKey ?? this.options.getKey,
    };
    this.updateClasses();
    this.updateList();
  }

  public resizeColumn(index: number, percentage: number): void {
    if (index < 0 || index >= this.columnSizes.length || this.cachedWidth <= 0) {
      return;
    }

    this.columnSizes[index] = Math.round((percentage / 100) * this.cachedWidth);
    this.updateHeaderPanes();
    this.layout(this.cachedHeight, this.cachedWidth);
  }

  public layout(height?: number, width?: number): void {
    this.cachedHeight = height ?? getContentHeight(this.domNode);
    this.cachedWidth = width ?? getContentWidth(this.domNode);

    this.domNode.style.height = `${Math.max(0, this.cachedHeight)}px`;
    this.domNode.style.width = `${Math.max(0, this.cachedWidth)}px`;
    this.updateHeaderPanes();
    this.list.layout(
      Math.max(0, this.cachedHeight - this.virtualDelegate.headerRowHeight),
      this.cachedWidth,
    );
  }

  public focus(): void {
    this.list.focus();
  }

  public getHTMLElement(): HTMLElement {
    return this.domNode;
  }

  public dispose(): void {
    for (const template of this.rowTemplates.values()) {
      this.disposeRowTemplate(template);
    }
    this.rowTemplates.clear();
    this.disposables.dispose();
    this.domNode.remove();
  }

  private updateClasses(): void {
    this.domNode.className = classNames("ui-table", this.options.className);
    this.domNode.setAttribute("role", "table");
    this.headerElement.className = "ui-table__header";
    this.headerElement.setAttribute("role", "row");
    this.bodyElement.className = "ui-table__body";
  }

  private createHeaderPanes(): SplitViewPane[] {
    return this.columns.map((column, index) => ({
      className: "ui-table__header-pane",
      id: String(index),
      maxSize: column.maximumWidth,
      minSize: column.minimumWidth,
      size: this.columnSizes[index] ?? column.weight,
    }));
  }

  private updateHeaderPanes(): void {
    this.splitView.update({
      className: "ui-table__header-split-view",
      onDidResize: (event) => this.onDidResizeColumns(event),
      onDidResizeEnd: (event) => this.onDidResizeColumns(event),
      orientation: "horizontal",
      panes: this.createHeaderPanes(),
      style: {
        height: `${this.virtualDelegate.headerRowHeight}px`,
        lineHeight: `${this.virtualDelegate.headerRowHeight}px`,
      },
    });
    this.renderHeaders();
    this.syncColumnSizesFromHeaders();
    this.layoutRenderedColumns();
  }

  private renderHeaders(): void {
    this.headerDisposables.clear();

    for (let index = 0; index < this.columns.length; index += 1) {
      const column = this.columns[index];
      const pane = this.splitView.getPaneElement(String(index));
      if (!pane) {
        continue;
      }

      let cell = pane.querySelector<HTMLElement>(".ui-table__header-cell");
      if (!cell) {
        cell = document.createElement("div");
        cell.className = "ui-table__header-cell";
        cell.setAttribute("role", "columnheader");
        cell.dataset.colIndex = String(index);
        pane.appendChild(cell);
      }
      cell.textContent = column.label;
      if (column.tooltip) {
        cell.title = column.tooltip;
        this.headerDisposables.add(getBaseLayerHoverDelegate().setupManagedHover(cell, column.tooltip));
      } else {
        cell.removeAttribute("title");
      }
    }
  }

  private onDidResizeColumns(event: SplitViewResizeEvent): void {
    this.columnSizes = event.sizes.map((size) => Math.max(0, size));
    this.layoutRenderedColumns();
  }

  private updateList(): void {
    this.list.setProps({
      delegate: {
        getHeight: (row) => this.virtualDelegate.getHeight(row),
      },
      disposeEmpty: this.options.disposeEmpty,
      disposeItem: (row, index) => this.disposeRow(row, index),
      empty: this.options.empty,
      getKey: this.options.getKey,
      gap: this.options.rowGap,
      items: this.rows,
      minVirtualCount: this.options.minVirtualCount,
      onKeyDown: this.options.onKeyDown,
      onSelect: (row, index, browserEvent) => {
        this.options.onSelect?.({ browserEvent, index, row });
      },
      overscanRows: this.options.overscanRows,
      renderItem: (row, index, state, container) => this.renderRow(row, index, state, container),
      role: "rowgroup",
      rowRole: "row",
      selectedKey: this.options.selectedKey,
      viewportClassName: "ui-table__viewport",
    });
  }

  private resolveRenderers(
    renderers: readonly ITableRenderer<unknown, unknown>[],
  ): ITableRenderer<unknown, unknown>[] {
    const rendererMap = new Map(renderers.map((renderer) => [renderer.templateId, renderer]));

    return this.columns.map((column) => {
      const renderer = rendererMap.get(column.templateId);
      if (!renderer) {
        throw new TableError(this.user, `Cell renderer for template id ${column.templateId} not found.`);
      }

      return renderer;
    });
  }

  private renderRow(row: TRow, index: number, state: ListRenderState, mount: HTMLElement): void {
    const key = this.options.getKey(row, index);
    const template = this.ensureRowTemplate(key, row, index);
    if (template.container.parentElement !== mount) {
      mount.replaceChildren(template.container);
    }
    template.container.setAttribute("aria-rowindex", String(index + 1));
    template.container.dataset.index = String(index);

    for (let columnIndex = 0; columnIndex < this.columns.length; columnIndex += 1) {
      const column = this.columns[columnIndex];
      const renderer = this.renderers[columnIndex];
      const cellTemplate = template.cells[columnIndex];

      if (!column || !renderer || !cellTemplate) {
        continue;
      }

      renderer.renderElement(column.project(row), index, cellTemplate.data, state);
    }
  }

  private ensureRowTemplate(key: string, row: TRow, index: number): RowTemplateData<TRow> {
    let template = this.rowTemplates.get(key);
    if (template) {
      template.row = row;
      template.index = index;
      return template;
    }

    const container = document.createElement("div");
    container.className = "ui-table__row";
    container.setAttribute("role", "presentation");

    const cells = this.columns.map((_, columnIndex) => {
      const cell = document.createElement("div");
      cell.className = "ui-table__cell";
      cell.setAttribute("role", "cell");
      cell.dataset.colIndex = String(columnIndex);
      cell.style.width = `${this.columnSizes[columnIndex] ?? DEFAULT_COLUMN_WIDTH}px`;
      container.appendChild(cell);

      return {
        container: cell,
        data: this.renderers[columnIndex].renderTemplate(cell),
      };
    });

    template = {
      cells,
      container,
      index,
      row,
    };
    this.rowTemplates.set(key, template);
    return template;
  }

  private disposeRow(row: TRow, index: number): void {
    const key = this.options.getKey(row, index);
    const template = this.rowTemplates.get(key);
    if (!template) {
      return;
    }

    this.disposeRowTemplate(template);
    this.rowTemplates.delete(key);
  }

  private disposeRowTemplate(template: RowTemplateData<TRow>): void {
    for (let columnIndex = 0; columnIndex < template.cells.length; columnIndex += 1) {
      const renderer = this.renderers[columnIndex];
      const column = this.columns[columnIndex];
      const cellTemplate = template.cells[columnIndex];
      if (!renderer || !column || !cellTemplate) {
        continue;
      }

      renderer.disposeElement?.(
        column.project(template.row),
        template.index,
        cellTemplate.data,
        {
          focused: false,
          index: template.index,
          selected: false,
        },
      );
      renderer.disposeTemplate(cellTemplate.data);
      clearNode(cellTemplate.container);
    }
    template.container.remove();
  }

  private layoutRenderedColumns(): void {
    for (const template of this.rowTemplates.values()) {
      for (let index = 0; index < template.cells.length; index += 1) {
        template.cells[index].container.style.width = `${this.columnSizes[index] ?? DEFAULT_COLUMN_WIDTH}px`;
      }
    }
  }

  private syncColumnSizesFromHeaders(): void {
    for (let index = 0; index < this.columns.length; index += 1) {
      const pane = this.splitView.getPaneElement(String(index));
      const width = pane?.getBoundingClientRect().width ?? 0;
      if (width > 0) {
        this.columnSizes[index] = width;
      }
    }
  }
}

export type ITableOptions<TRow> = TableOptions<TRow>;
export type ITableOptionsUpdate<TRow> = TableOptionsUpdate<TRow>;
