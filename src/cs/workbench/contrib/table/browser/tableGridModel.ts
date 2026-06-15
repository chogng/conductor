import {
  clampTableColumnWidth,
  TABLE_DEFAULT_COLUMN_WIDTH,
  TABLE_MAX_COLUMN_WIDTH,
  TABLE_MIN_COLUMN_WIDTH,
} from "src/cs/workbench/services/table/common/table";

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
export const TABLE_GRID_DEFAULT_COLUMN_WIDTH = TABLE_DEFAULT_COLUMN_WIDTH;
export const TABLE_GRID_MIN_COLUMN_WIDTH = TABLE_MIN_COLUMN_WIDTH;
export const TABLE_GRID_MAX_COLUMN_WIDTH = TABLE_MAX_COLUMN_WIDTH;
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
    return resolveTableGridRange({ totalCount: safeTotalCount, maxRenderedCount: safeMaxRenderedCount });
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

export const clampTableGridColumnWidth = clampTableColumnWidth;

export const resizeTableGridColumnWidth = (
  startWidth: number,
  deltaPixels: number,
  zoomPercent: number,
): number =>
  clampTableGridColumnWidth(
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
      (distance < closestDistance || (tied && (closestColIndex === null || colIndex > closestColIndex)))
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
  const clampedStartWidth = clampTableGridColumnWidth(Number(startWidth));
  const clampedWidth = clampTableGridColumnWidth(Number(width));
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
    boundaryOffset += clampTableGridColumnWidth(getColumnWidth(index)) * scale;
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
    widths.push(clampTableGridColumnWidth(getColumnWidth(colIndex)) * scale);
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
