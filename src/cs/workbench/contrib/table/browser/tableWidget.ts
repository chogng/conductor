import { addDisposableListener, EventType, isEditableElement } from "src/cs/base/browser/dom";
import { Emitter } from "src/cs/base/common/event";
import { DisposableStore } from "src/cs/base/common/lifecycle";
import { localize } from "src/cs/nls";
import { Scrollbar } from "src/cs/base/browser/ui/scrollbar/scrollbar";
import { createEmptyView } from "src/cs/workbench/contrib/table/browser/emptyView";
import type { TableModel } from "src/cs/workbench/services/table/common/table";
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

export namespace TableGridModel {
export type TableGridRange = {
  readonly totalCount: number;
  readonly startIndex: number;
  readonly endIndex: number;
  readonly renderedCount: number;
};

export type ResolveTableGridRangeOptions = {
  readonly maxRenderedCount: number;
  readonly startIndex?: number;
  readonly totalCount: unknown;
};

export type ResolveTableGridViewportRangeOptions = {
  readonly maxRenderedCount: number;
  readonly overscanCount?: number;
  readonly rowHeight: number;
  readonly scrollTop: unknown;
  readonly totalCount: unknown;
  readonly viewportHeight: unknown;
};

export type TableGridColumnRange = TableGridRange & {
  readonly leadingWidth: number;
  readonly renderedWidth: number;
  readonly totalWidth: number;
  readonly trailingWidth: number;
};

export type ResolveTableGridColumnViewportRangeOptions = {
  readonly getColumnWidth: (colIndex: number) => number;
  readonly maxRenderedCount: number;
  readonly overscanCount?: number;
  readonly scrollLeft: unknown;
  readonly totalCount: unknown;
  readonly viewportWidth: unknown;
  readonly zoomPercent: number;
};

export type ResolveTableGridColumnResizeTargetOptions = {
  readonly button: unknown;
  readonly clientX: unknown;
  readonly columnRange: Pick<TableGridColumnRange, "leadingWidth" | "renderedCount" | "startIndex">;
  readonly containerLeft: unknown;
  readonly getColumnWidth: (colIndex: number) => number;
  readonly hitSlop?: number;
  readonly scrollLeft: unknown;
  readonly zoomPercent: number;
};

export type ResolveTableGridColumnResizeGuideOptions = {
  readonly colIndex?: number | null;
  readonly columnRange: Pick<TableGridColumnRange, "leadingWidth" | "renderedCount" | "startIndex">;
  readonly getColumnWidth: (colIndex: number) => number;
  readonly scrollLeft: unknown;
  readonly visible?: boolean;
  readonly zoomPercent: number;
};

export type ResolveTableGridColumnResizeDragGuideOptions = {
  readonly startGuideLeft: unknown;
  readonly startWidth: unknown;
  readonly visible?: boolean;
  readonly width: unknown;
  readonly zoomPercent: number;
};

export type TableGridSpacerHeights = {
  readonly topHeight: number;
  readonly bottomHeight: number;
};

export type TableGridCellPosition = {
  readonly rowIndex: number;
  readonly colIndex: number;
};

export type ResolveTableGridKeyboardTargetOptions = {
  readonly columnCount: unknown;
  readonly currentCell?: TableGridCellPosition | null;
  readonly key: string;
  readonly pageRowCount?: number;
  readonly rowCount: unknown;
  readonly toBoundary?: boolean;
};

export type TableGridCellRange = {
  readonly endCol: number;
  readonly endRow: number;
  readonly startCol: number;
  readonly startRow: number;
};

export const TABLE_GRID_MAX_RENDERED_ROWS = 80;
export const TABLE_GRID_MAX_RENDERED_COLUMNS = 24;
export const TABLE_GRID_DEFAULT_ROW_HEADER_WIDTH = 48;
export const TABLE_GRID_DEFAULT_ROW_HEIGHT = 28;
export const TABLE_GRID_COLUMN_OVERSCAN_COLUMNS = 2;
export const TABLE_GRID_OVERSCAN_ROWS = 8;

export const resolveTableGridRange = ({
  maxRenderedCount,
  startIndex = 0,
  totalCount,
}: ResolveTableGridRangeOptions): TableGridRange => {
  const safeTotalCount = toSafeCount(totalCount);
  const safeMaxRenderedCount = toSafeCount(maxRenderedCount);
  if (safeTotalCount === 0 || safeMaxRenderedCount === 0) {
    return {
      totalCount: safeTotalCount,
      startIndex: 0,
      endIndex: 0,
      renderedCount: 0,
    };
  }

  const safeStartIndex = Math.min(
    Math.max(0, toSafeIndex(startIndex)),
    safeTotalCount - 1,
  );
  const endIndex = Math.min(safeTotalCount, safeStartIndex + safeMaxRenderedCount);

  return {
    totalCount: safeTotalCount,
    startIndex: safeStartIndex,
    endIndex,
    renderedCount: endIndex - safeStartIndex,
  };
};

export const resolveTableGridViewportRange = ({
  maxRenderedCount,
  overscanCount = TABLE_GRID_OVERSCAN_ROWS,
  rowHeight,
  scrollTop,
  totalCount,
  viewportHeight,
}: ResolveTableGridViewportRangeOptions): TableGridRange => {
  const safeTotalCount = toSafeCount(totalCount);
  const safeMaxRenderedCount = toSafeCount(maxRenderedCount);
  if (safeTotalCount === 0 || safeMaxRenderedCount === 0) {
    return resolveTableGridRange({
      totalCount: safeTotalCount,
      maxRenderedCount: safeMaxRenderedCount,
    });
  }

  const safeRowHeight = Math.max(1, Number(rowHeight) || TABLE_GRID_DEFAULT_ROW_HEIGHT);
  const firstVisibleIndex = Math.floor(Math.max(0, Number(scrollTop) || 0) / safeRowHeight);
  const safeViewportHeight = Math.max(0, Number(viewportHeight) || 0);
  if (safeViewportHeight <= 0) {
    return resolveTableGridRange({
      totalCount: safeTotalCount,
      startIndex: firstVisibleIndex,
      maxRenderedCount: safeMaxRenderedCount,
    });
  }

  const safeOverscanCount = Math.max(0, toSafeCount(overscanCount));
  const visibleCount = Math.max(1, Math.ceil(safeViewportHeight / safeRowHeight));
  const renderedCount = Math.min(
    safeMaxRenderedCount,
    visibleCount + (safeOverscanCount * 2),
  );
  const startIndex = Math.max(0, firstVisibleIndex - safeOverscanCount);
  const maxStartIndex = Math.max(0, safeTotalCount - renderedCount);

  return resolveTableGridRange({
    totalCount: safeTotalCount,
    startIndex: Math.min(startIndex, maxStartIndex),
    maxRenderedCount: renderedCount,
  });
};

export const resolveTableGridColumnViewportRange = ({
  getColumnWidth,
  maxRenderedCount,
  overscanCount = TABLE_GRID_COLUMN_OVERSCAN_COLUMNS,
  scrollLeft,
  totalCount,
  viewportWidth,
  zoomPercent,
}: ResolveTableGridColumnViewportRangeOptions): TableGridColumnRange => {
  const safeTotalCount = toSafeCount(totalCount);
  const safeMaxRenderedCount = toSafeCount(maxRenderedCount);
  if (safeTotalCount === 0 || safeMaxRenderedCount === 0) {
    return toColumnRange(resolveTableGridRange({
      totalCount: safeTotalCount,
      maxRenderedCount: safeMaxRenderedCount,
    }), 0, 0, 0);
  }

  const scale = getTableGridZoomScale(zoomPercent);
  const widths = getScaledColumnWidths(safeTotalCount, getColumnWidth, scale);
  const offsets = getPrefixSums(widths);
  const totalWidth = offsets[offsets.length - 1] ?? 0;
  const safeScrollLeft = Math.max(0, Number(scrollLeft) || 0);
  const safeViewportWidth = Math.max(0, Number(viewportWidth) || 0);
  const firstVisibleIndex = findColumnIndexAtOffset(widths, offsets, safeScrollLeft);
  const visibleEndIndex = findColumnEndIndexAtOffset(
    offsets,
    safeScrollLeft + safeViewportWidth,
  );
  const safeOverscanCount = Math.max(0, toSafeCount(overscanCount));
  const startIndex = Math.max(0, firstVisibleIndex - safeOverscanCount);
  const endIndex = Math.min(
    safeTotalCount,
    Math.max(startIndex + 1, visibleEndIndex + safeOverscanCount),
    startIndex + safeMaxRenderedCount,
  );

  return toColumnRange({
    totalCount: safeTotalCount,
    startIndex,
    endIndex,
    renderedCount: endIndex - startIndex,
  }, offsets[startIndex] ?? 0, offsets[endIndex] ?? 0, totalWidth);
};

export const getTableGridSpacerHeights = (
  range: TableGridRange,
  rowHeight: number,
): TableGridSpacerHeights => {
  const safeRowHeight = Math.max(1, Number(rowHeight) || TABLE_GRID_DEFAULT_ROW_HEIGHT);
  return {
    topHeight: range.startIndex * safeRowHeight,
    bottomHeight: Math.max(0, range.totalCount - range.endIndex) * safeRowHeight,
  };
};

export const resolveTableGridKeyboardTarget = ({
  columnCount,
  currentCell,
  key,
  pageRowCount = 1,
  rowCount,
  toBoundary = false,
}: ResolveTableGridKeyboardTargetOptions): TableGridCellPosition | null => {
  const safeRowCount = toSafeCount(rowCount);
  const safeColumnCount = toSafeCount(columnCount);
  if (safeRowCount === 0 || safeColumnCount === 0) {
    return null;
  }

  const current = normalizeCellPosition(currentCell, safeRowCount, safeColumnCount);
  const maxRow = safeRowCount - 1;
  const maxCol = safeColumnCount - 1;
  const pageRows = Math.max(1, toSafeCount(pageRowCount));

  switch (key) {
    case "ArrowUp":
      return {
        rowIndex: toBoundary ? 0 : Math.max(0, current.rowIndex - 1),
        colIndex: current.colIndex,
      };
    case "ArrowDown":
      return {
        rowIndex: toBoundary ? maxRow : Math.min(maxRow, current.rowIndex + 1),
        colIndex: current.colIndex,
      };
    case "ArrowLeft":
      return {
        rowIndex: current.rowIndex,
        colIndex: toBoundary ? 0 : Math.max(0, current.colIndex - 1),
      };
    case "ArrowRight":
      return {
        rowIndex: current.rowIndex,
        colIndex: toBoundary ? maxCol : Math.min(maxCol, current.colIndex + 1),
      };
    case "PageUp":
      return {
        rowIndex: Math.max(0, current.rowIndex - pageRows),
        colIndex: current.colIndex,
      };
    case "PageDown":
      return {
        rowIndex: Math.min(maxRow, current.rowIndex + pageRows),
        colIndex: current.colIndex,
      };
    case "Home":
      return {
        rowIndex: toBoundary ? 0 : current.rowIndex,
        colIndex: 0,
      };
    case "End":
      return {
        rowIndex: toBoundary ? maxRow : current.rowIndex,
        colIndex: maxCol,
      };
  }

  return null;
};

export const resolveTableGridCellRange = (
  anchor: TableGridCellPosition,
  target: TableGridCellPosition,
): TableGridCellRange => {
  const anchorRow = Math.max(0, toSafeIndex(anchor?.rowIndex));
  const anchorCol = Math.max(0, toSafeIndex(anchor?.colIndex));
  const targetRow = Math.max(0, toSafeIndex(target?.rowIndex));
  const targetCol = Math.max(0, toSafeIndex(target?.colIndex));

  return {
    endCol: Math.max(anchorCol, targetCol),
    endRow: Math.max(anchorRow, targetRow),
    startCol: Math.min(anchorCol, targetCol),
    startRow: Math.min(anchorRow, targetRow),
  };
};

export const getTableGridColumnLabel = (index: number): string => {
  let value = Math.max(0, toSafeIndex(index)) + 1;
  let label = "";
  while (value > 0) {
    const remainder = (value - 1) % 26;
    label = String.fromCharCode(65 + remainder) + label;
    value = Math.floor((value - 1) / 26);
  }
  return label;
};

export const getTableGridRowLabel = (rowIndex: number): string =>
  String(Math.max(0, toSafeIndex(rowIndex)) + 1);

export const formatTableGridCell = (value: unknown): string => {
  if (value === null || value === undefined) {
    return "";
  }
  return String(value);
};

export const range = (count: number): number[] => {
  const safeCount = toSafeCount(count);
  const result: number[] = [];
  for (let index = 0; index < safeCount; index += 1) {
    result.push(index);
  }
  return result;
};

export const resizeTableGridColumnWidth = (
  startWidth: number,
  deltaPixels: number,
  zoomPercent: number,
): number =>
  TableColumnLayout.clampWidth(
    startWidth + (deltaPixels / getTableGridZoomScale(zoomPercent)),
  );

export const resolveTableGridColumnResizeTarget = ({
  button,
  clientX,
  columnRange,
  containerLeft,
  getColumnWidth,
  hitSlop = 10,
  scrollLeft,
  zoomPercent,
}: ResolveTableGridColumnResizeTargetOptions): number | null => {
  if (Math.floor(Number(button)) !== 0) {
    return null;
  }

  const startIndex = toSafeIndex(columnRange.startIndex);
  const renderedCount = toSafeCount(columnRange.renderedCount);
  const safeClientX = Number(clientX);
  const safeContainerLeft = Number(containerLeft);
  if (startIndex < 0 ||
    renderedCount === 0 ||
    !Number.isFinite(safeClientX) ||
    !Number.isFinite(safeContainerLeft)) {
    return null;
  }

  const pointerLeft = safeClientX - safeContainerLeft;
  const safeHitSlop = Math.max(0, Number(hitSlop) || 0);
  let closestColIndex: number | null = null;
  let closestDistance = Number.POSITIVE_INFINITY;
  for (let colIndex = startIndex; colIndex < startIndex + renderedCount; colIndex += 1) {
    const boundaryLeft = resolveTableGridColumnBoundaryLeft({
      colIndex,
      columnRange,
      getColumnWidth,
      scrollLeft,
      zoomPercent,
    });
    if (boundaryLeft === null) {
      continue;
    }

    const distance = Math.abs(pointerLeft - boundaryLeft);
    const tied = Math.abs(distance - closestDistance) < 0.001;
    if (
      distance <= safeHitSlop &&
      (
        distance < closestDistance ||
        (tied && (closestColIndex === null || colIndex > closestColIndex))
      )
    ) {
      closestColIndex = colIndex;
      closestDistance = distance;
    }
  }

  return closestColIndex;
};

export const resolveTableGridColumnResizeGuideLeft = ({
  colIndex,
  columnRange,
  getColumnWidth,
  scrollLeft,
  visible = true,
  zoomPercent,
}: ResolveTableGridColumnResizeGuideOptions): number | null => {
  if (!visible) {
    return null;
  }

  return resolveTableGridColumnBoundaryLeft({
    colIndex,
    columnRange,
    getColumnWidth,
    scrollLeft,
    zoomPercent,
  });
};

export const resolveTableGridColumnResizeDragGuideLeft = ({
  startGuideLeft,
  startWidth,
  visible = true,
  width,
  zoomPercent,
}: ResolveTableGridColumnResizeDragGuideOptions): number | null => {
  if (!visible) {
    return null;
  }

  const safeStartGuideLeft = Number(startGuideLeft);
  if (!Number.isFinite(safeStartGuideLeft)) {
    return null;
  }

  const scale = getTableGridZoomScale(zoomPercent);
  const clampedStartWidth = TableColumnLayout.clampWidth(Number(startWidth));
  const clampedWidth = TableColumnLayout.clampWidth(Number(width));
  return safeStartGuideLeft + ((clampedWidth - clampedStartWidth) * scale);
};

const resolveTableGridColumnBoundaryLeft = ({
  colIndex,
  columnRange,
  getColumnWidth,
  scrollLeft,
  zoomPercent,
}: Omit<ResolveTableGridColumnResizeGuideOptions, "visible">): number | null => {
  if (colIndex === null || colIndex === undefined) {
    return null;
  }

  const safeColIndex = toSafeIndex(colIndex);
  const startIndex = toSafeIndex(columnRange.startIndex);
  const renderedCount = toSafeCount(columnRange.renderedCount);
  if (
    startIndex < 0 ||
    safeColIndex < startIndex ||
    renderedCount === 0 ||
    safeColIndex >= startIndex + renderedCount
  ) {
    return null;
  }

  const scale = getTableGridZoomScale(zoomPercent);
  let boundaryOffset = Math.max(0, Number(columnRange.leadingWidth) || 0);
  for (let index = startIndex; index <= safeColIndex; index += 1) {
    boundaryOffset += TableColumnLayout.clampWidth(getColumnWidth(index)) * scale;
  }

  return getTableGridRowHeaderWidth(zoomPercent) +
    boundaryOffset -
    Math.max(0, Number(scrollLeft) || 0);
};

export const getTableGridZoomScale = (zoomPercent: number): number =>
  Math.max(0.25, Number(zoomPercent) / 100 || 1);

export const getTableGridRowHeaderWidth = (zoomPercent: number): number =>
  TABLE_GRID_DEFAULT_ROW_HEADER_WIDTH * getTableGridZoomScale(zoomPercent);

export const getTableGridRowHeight = (zoomPercent: number): number =>
  TABLE_GRID_DEFAULT_ROW_HEIGHT * getTableGridZoomScale(zoomPercent);

const toSafeCount = (value: unknown): number => {
  const count = Math.floor(Number(value));
  return Number.isInteger(count) && count > 0 ? count : 0;
};

const toSafeIndex = (value: unknown): number => {
  const index = Math.floor(Number(value));
  return Number.isInteger(index) && index >= 0 ? index : -1;
};

const normalizeCellPosition = (
  cell: TableGridCellPosition | null | undefined,
  rowCount: number,
  columnCount: number,
): TableGridCellPosition => ({
  rowIndex: Math.min(Math.max(0, toSafeIndex(cell?.rowIndex)), rowCount - 1),
  colIndex: Math.min(Math.max(0, toSafeIndex(cell?.colIndex)), columnCount - 1),
});

const getScaledColumnWidths = (
  columnCount: number,
  getColumnWidth: (colIndex: number) => number,
  scale: number,
): number[] => {
  const widths: number[] = [];
  for (let colIndex = 0; colIndex < columnCount; colIndex += 1) {
    widths.push(TableColumnLayout.clampWidth(getColumnWidth(colIndex)) * scale);
  }
  return widths;
};

const getPrefixSums = (values: readonly number[]): number[] => {
  const offsets = [0];
  for (const value of values) {
    offsets.push((offsets[offsets.length - 1] ?? 0) + value);
  }
  return offsets;
};

const findColumnIndexAtOffset = (
  widths: readonly number[],
  offsets: readonly number[],
  offset: number,
): number => {
  if (widths.length === 0) {
    return 0;
  }

  for (let index = 0; index < widths.length; index += 1) {
    if ((offsets[index] ?? 0) + widths[index] > offset) {
      return index;
    }
  }

  return widths.length - 1;
};

const findColumnEndIndexAtOffset = (
  offsets: readonly number[],
  offset: number,
): number => {
  for (let index = 1; index < offsets.length; index += 1) {
    if ((offsets[index] ?? 0) >= offset) {
      return index;
    }
  }

  return Math.max(0, offsets.length - 1);
};

const toColumnRange = (
  range: TableGridRange,
  leadingWidth: number,
  renderedEndWidth: number,
  totalWidth: number,
): TableGridColumnRange => ({
  ...range,
  leadingWidth,
  renderedWidth: Math.max(0, renderedEndWidth - leadingWidth),
  totalWidth,
  trailingWidth: Math.max(0, totalWidth - renderedEndWidth),
});

}

export const TABLE_GRID_MAX_RENDERED_ROWS = TableGridModel.TABLE_GRID_MAX_RENDERED_ROWS;
export const TABLE_GRID_MAX_RENDERED_COLUMNS = TableGridModel.TABLE_GRID_MAX_RENDERED_COLUMNS;
export const TABLE_GRID_DEFAULT_ROW_HEADER_WIDTH =
  TableGridModel.TABLE_GRID_DEFAULT_ROW_HEADER_WIDTH;
export const TABLE_GRID_DEFAULT_ROW_HEIGHT = TableGridModel.TABLE_GRID_DEFAULT_ROW_HEIGHT;
export const TABLE_GRID_COLUMN_OVERSCAN_COLUMNS = TableGridModel.TABLE_GRID_COLUMN_OVERSCAN_COLUMNS;
export const TABLE_GRID_OVERSCAN_ROWS = TableGridModel.TABLE_GRID_OVERSCAN_ROWS;
export const resolveTableGridRange = TableGridModel.resolveTableGridRange;
export const resolveTableGridViewportRange = TableGridModel.resolveTableGridViewportRange;
export const resolveTableGridColumnViewportRange =
  TableGridModel.resolveTableGridColumnViewportRange;
export const getTableGridSpacerHeights = TableGridModel.getTableGridSpacerHeights;
export const resolveTableGridKeyboardTarget = TableGridModel.resolveTableGridKeyboardTarget;
export const resolveTableGridCellRange = TableGridModel.resolveTableGridCellRange;
export const getTableGridColumnLabel = TableGridModel.getTableGridColumnLabel;
export const getTableGridRowLabel = TableGridModel.getTableGridRowLabel;
export const formatTableGridCell = TableGridModel.formatTableGridCell;
export const range = TableGridModel.range;
export const resizeTableGridColumnWidth = TableGridModel.resizeTableGridColumnWidth;
export const resolveTableGridColumnResizeTarget = TableGridModel.resolveTableGridColumnResizeTarget;
export const resolveTableGridColumnResizeGuideLeft =
  TableGridModel.resolveTableGridColumnResizeGuideLeft;
export const resolveTableGridColumnResizeDragGuideLeft =
  TableGridModel.resolveTableGridColumnResizeDragGuideLeft;
export const getTableGridZoomScale = TableGridModel.getTableGridZoomScale;
export const getTableGridRowHeaderWidth = TableGridModel.getTableGridRowHeaderWidth;
export const getTableGridRowHeight = TableGridModel.getTableGridRowHeight;

export type TableWidgetModel = Pick<
  TableModel,
  | "ensureRows"
  | "getHighlight"
  | "getRow"
  | "getRowsVersion"
  | "getSelection"
  | "getState"
  | "onDidChangeHighlight"
  | "onDidChangeRevealCell"
  | "onDidChangeSelection"
  | "onDidChangeState"
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

export type TableWidgetProps = {
  readonly getColumnWidths?: (sourceKey: string | null | undefined) => readonly TableColumnWidth[];
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
  readonly selectedRanges: readonly TableGridModel.TableGridCellRange[];
};

type ColumnResizeState = {
  readonly colIndex: number;
  readonly guideLeft: number;
  readonly startClientX: number;
  readonly startGuideLeft: number;
  readonly startWidth: number;
};

export class TableWidget {
  public readonly element: HTMLElement;
  private readonly onDidChangeZoomEmitter = new Emitter<number>();
  public readonly onDidChangeZoom = this.onDidChangeZoomEmitter.event;
  private readonly store = new DisposableStore();
  private readonly body = document.createElement("div");
  private readonly header = document.createElement("div");
  private readonly headerCorner = document.createElement("div");
  private readonly headerScroll = document.createElement("div");
  private readonly headerContent = document.createElement("div");
  private readonly headerLeadingSpacer = document.createElement("div");
  private readonly headerTrailingSpacer = document.createElement("div");
  private readonly columnResizeGuide = document.createElement("div");
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
  private disposeHighlightListener: (() => void) | null = null;
  private disposeRevealCellListener: (() => void) | null = null;
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
  private columnWidthSourceKey: string | null = null;
  private columnWidths = new Map<number, number>();
  private pendingColumnWidthStorageTimeout: number | null = null;
  private columnResizeState: ColumnResizeState | null = null;
  private rangeAnchorCell: TableGridModel.TableGridCellPosition | null = null;
  private rangeFocusCell: TableGridModel.TableGridCellPosition | null = null;
  private zoomPercent = TABLE_WIDGET_DEFAULT_ZOOM_PERCENT;
  private props: TableWidgetProps;

  constructor(props: TableWidgetProps) {
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
    this.columnResizeGuide.className = "table_view_column_resize_guide";
    this.columnResizeGuide.setAttribute("aria-hidden", "true");
    this.columnResizeGuide.hidden = true;
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
    this.body.append(this.header, this.scrollArea.element, this.columnResizeGuide);
    this.element.append(this.body);
    this.store.add(addDisposableListener(this.headerContent, EventType.CLICK, event => {
      this.onHeaderClick(event as MouseEvent);
    }));
    this.store.add(addDisposableListener(this.headerContent, EventType.POINTER_DOWN, event => {
      const handle = this.getColumnResizeHandle(event.target);
      if (handle && this.headerContent.contains(handle)) {
        this.onColumnResizeStart(event as PointerEvent);
      }
    }));
    this.store.add(addDisposableListener(this.bodyRows, EventType.CLICK, event => {
      this.onBodyClick(event as MouseEvent);
    }));
    this.store.add(addDisposableListener(this.element, EventType.KEY_DOWN, event => {
      this.onKeyDown(event as KeyboardEvent);
    }));
    this.store.add(addDisposableListener(this.element, EventType.WHEEL, event => {
      this.onWheel(event as WheelEvent);
    }, { passive: false }));
    this.store.add(this.onDidChangeZoomEmitter);
    this.store.add(this.columnResizeStore);
    this.prepareGrid();
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
    if (this.shouldRenderTableOnLayout()) {
      const needsLayout = this.renderTable();
      if (needsLayout) {
        this.scrollArea.layout();
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
      this.syncColumnLayout(this.getBodyColumnRange());
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

  private bindTableState(tableModel: TableWidgetModel): void {
    this.disposeSelectionListener?.();
    this.disposeHighlightListener?.();
    this.disposeRevealCellListener?.();
    this.disposeRowsVersionListener?.();
    this.disposeStateListener?.();
    this.resetRenderedRows();
    this.disposeSelectionListener = tableModel.onDidChangeSelection(() => {
      this.syncSelectionState();
    });
    this.disposeRowsVersionListener = tableModel.subscribeRowsVersion(() => {
      this.syncRows();
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
      this.resetRenderedRows();
      this.appliedCellState = null;
      this.rangeAnchorCell = null;
      this.rangeFocusCell = null;
      this.syncColumnResizeGuide();
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
          ? tableState.loadState.message ||
            localize("table.preview.loadingHint", "Parsing CSV preview, please wait.")
          : localize("table.preview.emptyHint", "Select a file to preview"),
      }));
      this.syncColumnResizeGuide();
      this.layoutNow();
      return;
    }

    if (tableState.loadState.state === "loading") {
      this.header.hidden = true;
      this.scrollArea.viewport.replaceChildren();
      this.scrollArea.viewport.append(createEmptyView({
        title: localize("table.preview.loadingTitle", "Loading preview..."),
        description: tableState.loadState.message ||
          localize("table.preview.loadingHint", "Parsing CSV preview, please wait."),
      }));
      this.syncColumnResizeGuide();
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
    const { tableModel, tableState } = this.props;
    const zoomPercent = this.zoomPercent;
    const tableFile = tableState.file;
    const zoomChanged = this.renderedZoomPercent !== zoomPercent;
    if (zoomChanged) {
      this.renderedZoomPercent = zoomPercent;
      this.body.style.setProperty(
        "--table-view-zoom",
        String(TableGridModel.getTableGridZoomScale(zoomPercent)),
      );
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
      this.syncColumnResizeGuide();
      return true;
    }

    this.header.hidden = false;
    const headerChanged = this.ensureHeaderGrid();
    const gridChanged = this.renderBody(tableModel, rowRange, columnRange);
    const columnLayoutChanged = this.syncColumnLayout(columnRange);
    this.syncColumnResizeGuide();

    if (tableFile?.fileId) {
      this.ensureRows(tableModel, tableFile.sourceKey ?? tableFile.fileId, rowRange);
    }

    return headerChanged || gridChanged || columnLayoutChanged || zoomChanged;
  }

  private resolveVisibleRowRange(totalCount: unknown): TableGridModel.TableGridRange {
    return TableGridModel.resolveTableGridViewportRange({
      totalCount,
      maxRenderedCount: TableGridModel.TABLE_GRID_MAX_RENDERED_ROWS,
      rowHeight: TableGridModel.getTableGridRowHeight(this.zoomPercent),
      scrollTop: this.scrollArea.viewport.scrollTop,
      viewportHeight: this.scrollArea.viewport.clientHeight,
    });
  }

  private resolveVisibleColumnRange(totalCount: unknown): TableGridModel.TableGridColumnRange {
    const rowHeaderWidth = TableGridModel.getTableGridRowHeaderWidth(this.zoomPercent);
    return TableGridModel.resolveTableGridColumnViewportRange({
      totalCount,
      maxRenderedCount: TableGridModel.TABLE_GRID_MAX_RENDERED_COLUMNS,
      scrollLeft: this.scrollArea.viewport.scrollLeft,
      viewportWidth: this.scrollArea.viewport.clientWidth - rowHeaderWidth,
      zoomPercent: this.zoomPercent,
      getColumnWidth: colIndex => this.getColumnWidth(colIndex),
    });
  }

  private ensureRows(
    tableModel: TableWidgetModel,
    sourceKey: string,
    rowRange: TableGridModel.TableGridRange,
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
    if (this.headerColumnCount < TableGridModel.TABLE_GRID_MAX_RENDERED_COLUMNS) {
      const startIndex = this.headerColumnCount;
      this.headerColumnCount = TableGridModel.TABLE_GRID_MAX_RENDERED_COLUMNS;

      for (
        let colIndex = startIndex;
        colIndex < TableGridModel.TABLE_GRID_MAX_RENDERED_COLUMNS;
        colIndex += 1
      ) {
        const cell = document.createElement("div");
        const button = document.createElement("button");
        const columnLabel = TableGridModel.getTableGridColumnLabel(colIndex);
        cell.className = "table_view_grid_header_cell";
        cell.setAttribute("role", "columnheader");
        button.type = "button";
        button.className = "table_view_column_button";
        button.dataset.colIndex = String(colIndex);
        button.textContent = columnLabel;
        button.setAttribute(
          "aria-label",
          localize("table.preview.toggleColumn", "Toggle column {column}", {
            column: columnLabel,
          }),
        );
        const resizeHandle = document.createElement("span");
        resizeHandle.className = "table_view_column_resize_handle";
        resizeHandle.dataset.colIndex = String(colIndex);
        resizeHandle.setAttribute("role", "separator");
        resizeHandle.setAttribute("aria-orientation", "vertical");
        resizeHandle.setAttribute(
          "aria-label",
          localize("table.preview.resizeColumn", "Resize column {column}", {
            column: columnLabel,
          }),
        );
        cell.append(button, resizeHandle);
        this.headerCells.push(cell);
        this.headerContent.insertBefore(cell, this.headerTrailingSpacer);
      }

      changed = true;
    }

    return changed;
  }

  private syncColumnLayout(columnRange: TableGridModel.TableGridColumnRange): boolean {
    let changed = this.syncColumnSpacers(columnRange);
    for (
      let columnOffset = 0;
      columnOffset < TableGridModel.TABLE_GRID_MAX_RENDERED_COLUMNS;
      columnOffset += 1
    ) {
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

  private syncColumnSpacers(columnRange: TableGridModel.TableGridColumnRange): boolean {
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
    const columnLabel = TableGridModel.getTableGridColumnLabel(colIndex);
    const colIndexValue = String(colIndex);
    const ariaColIndex = String(colIndex + 1);
    if (button?.dataset.colIndex !== colIndexValue) {
      if (button) {
        button.dataset.colIndex = colIndexValue;
        button.textContent = columnLabel;
        button.setAttribute(
          "aria-label",
          localize("table.preview.toggleColumn", "Toggle column {column}", {
            column: columnLabel,
          }),
        );
      }
      if (resizeHandle) {
        resizeHandle.dataset.colIndex = colIndexValue;
        resizeHandle.setAttribute(
          "aria-label",
          localize("table.preview.resizeColumn", "Resize column {column}", {
            column: columnLabel,
          }),
        );
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
    tableModel: TableWidgetModel,
    rowRange: TableGridModel.TableGridRange,
    columnRange: TableGridModel.TableGridColumnRange,
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

    this.syncRowsTextIfNeeded(
      this.props.tableModel,
      this.getBodyRowRange(),
      this.getBodyColumnRange(),
    );
  }

  private getBodyRowRange(): TableGridModel.TableGridRange {
    return {
      totalCount: this.bodyTotalRowCount,
      startIndex: this.bodyStartRowIndex,
      endIndex: this.bodyStartRowIndex + this.bodyRowCount,
      renderedCount: this.bodyRowCount,
    };
  }

  private getBodyColumnRange(): TableGridModel.TableGridColumnRange {
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
    tableModel: TableWidgetModel,
    rowRange: TableGridModel.TableGridRange,
    columnRange: TableGridModel.TableGridColumnRange,
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
        this.updateCellText(cell, TableGridModel.formatTableGridCell(cells[colIndex]));
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

  private ensureBodyGrid(
    rowRange: TableGridModel.TableGridRange,
    columnRange: TableGridModel.TableGridColumnRange,
  ): boolean {
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

    for (
      let colIndex = 0;
      colIndex < TableGridModel.TABLE_GRID_MAX_RENDERED_COLUMNS;
      colIndex += 1
    ) {
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

    for (
      let rowIndex = 0;
      rowIndex < TableGridModel.TABLE_GRID_MAX_RENDERED_ROWS;
      rowIndex += 1
    ) {
      const row = document.createElement("tr");
      const rowHeader = document.createElement("th");
      const rowHeaderLabel = document.createElement("span");
      const leadingSpacer = document.createElement("td");
      const trailingSpacer = document.createElement("td");
      const cells: BodyCell[] = [];

      rowHeader.scope = "row";
      rowHeaderLabel.className = "table_view_row_header_label";
      rowHeaderLabel.textContent = TableGridModel.getTableGridRowLabel(rowIndex);
      rowHeader.append(rowHeaderLabel);
      row.append(rowHeader);
      leadingSpacer.className = "table_view_column_spacer_cell";
      leadingSpacer.setAttribute("aria-hidden", "true");
      row.append(leadingSpacer);

      for (
        let colIndex = 0;
        colIndex < TableGridModel.TABLE_GRID_MAX_RENDERED_COLUMNS;
        colIndex += 1
      ) {
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
    rowRange: TableGridModel.TableGridRange,
    columnRange: TableGridModel.TableGridColumnRange,
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
          label.textContent = TableGridModel.getTableGridRowLabel(actualRowIndex);
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

    for (
      let colIndex = 0;
      colIndex < TableGridModel.TABLE_GRID_MAX_RENDERED_COLUMNS;
      colIndex += 1
    ) {
      const column = this.bodyDataColumns[colIndex];
      if (column) {
        column.hidden = colIndex >= columnCount;
      }
    }

    return changed || spacerChanged;
  }

  private syncVirtualSpacers(
    rowRange: TableGridModel.TableGridRange,
    columnCount: number,
  ): boolean {
    const { topHeight, bottomHeight } = TableGridModel.getTableGridSpacerHeights(
      rowRange,
      TableGridModel.getTableGridRowHeight(this.zoomPercent),
    );
    const colSpan = Math.max(1, columnCount + 3);
    const topChanged = syncSpacerRow(this.topSpacerRow, this.topSpacerCell, topHeight, colSpan);
    const bottomChanged = syncSpacerRow(
      this.bottomSpacerRow,
      this.bottomSpacerCell,
      bottomHeight,
      colSpan,
    );
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
      this.syncHeaderColumns(TableGridModel.range(columnCount), next);
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
      ? TableGridModel.range(columnCount).map(columnOffset => startColumnIndex + columnOffset)
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

  private shouldRenderTableOnLayout(): boolean {
    const { tableState } = this.props;
    return this.scrollArea.viewport.firstChild === this.content &&
      tableState.loadState.state !== "loading" &&
      Boolean(tableState.selectedFileId && tableState.file);
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

    this.select({
      kind: "columns",
      columns: toggleSelectedColumn(this.getSelection(), colIndex),
    });
    this.focus();
  }

  private onColumnResizeStart(event: PointerEvent): void {
    const colIndex = TableGridModel.resolveTableGridColumnResizeTarget({
      button: event.button,
      clientX: event.clientX,
      columnRange: this.getBodyColumnRange(),
      containerLeft: this.body.getBoundingClientRect().left,
      getColumnWidth: index => this.getColumnWidth(index),
      scrollLeft: this.scrollArea.viewport.scrollLeft,
      zoomPercent: this.zoomPercent,
    });
    if (colIndex === null) {
      return;
    }

    const startGuideLeft = this.getColumnResizeBoundaryLeft(colIndex) ??
      TableGridModel.resolveTableGridColumnResizeGuideLeft({
        colIndex,
        columnRange: this.getBodyColumnRange(),
        getColumnWidth: index => this.getColumnWidth(index),
        scrollLeft: this.scrollArea.viewport.scrollLeft,
        visible: !this.header.hidden,
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
    const width = TableGridModel.resizeTableGridColumnWidth(
      state.startWidth,
      event.clientX - state.startClientX,
      this.zoomPercent,
    );
    const guideLeft = TableGridModel.resolveTableGridColumnResizeDragGuideLeft({
      startGuideLeft: state.startGuideLeft,
      startWidth: state.startWidth,
      visible: !this.header.hidden,
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
    const columnOffset = colIndex - this.bodyStartColumnIndex;
    if (columnOffset < 0 || columnOffset >= this.bodyColumnCount) {
      return null;
    }

    const headerCell = this.headerCells[columnOffset];
    if (!headerCell || headerCell.hidden) {
      return null;
    }

    return headerCell.getBoundingClientRect().right - this.body.getBoundingClientRect().left;
  }

  private getColumnWidth(colIndex: number): number {
    return this.columnWidths.get(colIndex) ?? TableColumnLayout.defaultWidth;
  }

  private getColumnCssWidth(colIndex: number): string {
    const width = this.getColumnWidth(colIndex) *
      TableGridModel.getTableGridZoomScale(this.zoomPercent);
    return `${width}px`;
  }

  private syncColumnResizeGuide(): void {
    const left = this.columnResizeState
      ? this.columnResizeState.guideLeft
      : null;
    if (left === null) {
      this.columnResizeGuide.hidden = true;
      this.columnResizeGuide.style.left = "";
      return;
    }

    this.columnResizeGuide.hidden = false;
    this.columnResizeGuide.style.left = `${left}px`;
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

    const target = TableGridModel.resolveTableGridKeyboardTarget({
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

  private getNavigationCell(): TableGridModel.TableGridCellPosition | null {
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

  private getRangeFocusCell(): TableGridModel.TableGridCellPosition | null {
    return this.rangeFocusCell ?? this.getNavigationCell();
  }

  private selectRangeToCell(
    target: TableGridModel.TableGridCellPosition,
    reveal: boolean,
  ): boolean {
    const tableFile = this.props.tableState.file;
    if (!tableFile) {
      return false;
    }

    const anchor = this.rangeAnchorCell ?? this.getNavigationCell() ?? target;
    const range = TableGridModel.resolveTableGridCellRange(anchor, target);
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
        this.scrollArea.viewport.clientHeight /
          TableGridModel.getTableGridRowHeight(this.zoomPercent),
      ),
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
    const rowHeight = TableGridModel.getTableGridRowHeight(this.zoomPercent);
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
    const scale = TableGridModel.getTableGridZoomScale(this.zoomPercent);
    const rowHeaderWidth = TableGridModel.getTableGridRowHeaderWidth(this.zoomPercent);
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
    let offset = TableGridModel.getTableGridRowHeaderWidth(this.zoomPercent);
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

    const { tableState } = this.props;
    const tableFile = tableState.file;
    if (event.shiftKey && this.selectRangeToCell({ colIndex, rowIndex }, true)) {
      this.focus();
      return;
    }

    this.rangeAnchorCell = null;
    this.rangeFocusCell = null;
    this.select({
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

const normalizeWidgetColumnIndex = (value: unknown): number | null => {
  const index = Math.floor(Number(value));
  return Number.isInteger(index) && index >= 0 ? index : null;
};

const getTableWidgetColumnWidthSourceKey = (
  sourceKey: string | null | undefined,
): string | null =>
  typeof sourceKey === "string" && sourceKey.trim() ? sourceKey.trim() : null;

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
): readonly TableGridModel.TableGridCellRange[] => {
  const visibleRanges: TableGridModel.TableGridCellRange[] = [];
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
  first: readonly TableGridModel.TableGridCellRange[],
  second: readonly TableGridModel.TableGridCellRange[],
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
