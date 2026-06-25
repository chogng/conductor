import type { Event } from "src/cs/base/common/event";
import type { IHoverDelegate } from "src/cs/base/browser/ui/hover/hoverDelegate";
import type { TableWidgetSize } from "src/cs/base/browser/ui/table/tableWidget";
import {
  TableWidget,
  type TableWidgetColumnHeaderSelection,
  type TableWidgetColumnWidthTarget,
  type TableWidgetModel,
  type TableWidgetProps,
  type TableWidgetRevealMode,
  type TableWidgetSelectionTarget,
} from "src/cs/workbench/contrib/table/browser/tableWidget";
import type { TableColumnWidth } from "src/cs/workbench/services/table/common/tableColumnLayout";
import type { ITableService } from "src/cs/workbench/services/table/common/table";

export type TableControllerViewModel = TableWidgetModel;

type TableState = ReturnType<TableControllerViewModel["getState"]>;
type TableSelection = ReturnType<TableControllerViewModel["getSelection"]>;

export type TableControllerProps = {
  readonly canAdjustColumnScale?: boolean;
  readonly columnHeaderSelection?: TableWidgetColumnHeaderSelection;
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
  readonly tableViewModel: TableControllerViewModel;
  readonly tableService: ITableService;
  readonly tableState: TableState;
};

// The controller is the table view's adapter boundary: it owns no table data
// and no grid DOM, but connects workbench/service inputs to TableWidget props.
export class TableController {
  public readonly element: HTMLElement;
  private readonly widget: TableWidget;
  public readonly onDidChangeSize: Event<TableWidgetSize>;
  public readonly onDidChangeZoom: Event<number>;

  public constructor(props: TableControllerProps) {
    this.widget = new TableWidget(toWidgetProps(props));
    this.onDidChangeSize = this.widget.onDidChangeSize;
    this.onDidChangeZoom = this.widget.onDidChangeZoom;
    this.element = this.widget.element;
  }

  public update(props: TableControllerProps): void {
    this.widget.update(toWidgetProps(props));
  }

  public dispose(): void {
    this.widget.dispose();
  }

  public layout(): void {
    this.widget.layout();
  }

  public focus(): void {
    this.widget.focus();
  }

  public getSelection(): TableSelection {
    return this.widget.getSelection();
  }

  public select(
    target: TableWidgetSelectionTarget | null,
    reveal?: TableWidgetRevealMode,
  ): boolean {
    return this.widget.select(target, reveal);
  }

  public clearSelection(): boolean {
    return this.widget.clearSelection();
  }

  public selectAllColumns(): boolean {
    return this.widget.selectAllColumns();
  }

  public getZoomPercent(): number {
    return this.widget.getZoomPercent();
  }

  public getSize(): TableWidgetSize {
    return this.widget.getSize();
  }

  public resetZoom(): boolean {
    return this.widget.resetZoom();
  }

  public zoomIn(): boolean {
    return this.widget.zoomIn();
  }

  public zoomOut(): boolean {
    return this.widget.zoomOut();
  }

  public setColumnWidth(target: TableWidgetColumnWidthTarget): boolean {
    return this.widget.setColumnWidth(target);
  }
}

const toWidgetProps = ({
  canAdjustColumnScale,
  columnHeaderSelection,
  tableViewModel,
  tableState,
  getColumnWidths,
  hoverDelegate,
  onCopySelection,
  onSelect,
  storeColumnWidths,
  tableService,
}: TableControllerProps): TableWidgetProps => ({
  canAdjustColumnScale,
  columnHeaderSelection,
  getColumnWidths,
  hoverDelegate,
  onCopySelection,
  onAdjustColumnDisplayScale: (colIndex, deltaExponent) =>
    tableService.adjustColumnDisplayScale(colIndex, deltaExponent),
  onResetColumnDisplayScale: colIndex =>
    tableService.resetColumnDisplayScale(colIndex),
  onSelect,
  storeColumnWidths,
  tableViewModel,
  tableState,
});
