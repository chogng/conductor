import type {
  TableCell,
  TableRange,
  TableRangeDecoration,
  TableSelection,
} from "src/cs/workbench/services/table/common/table";
import type {
  TemplateColumnPickTarget,
  TemplatePickFieldName,
} from "src/cs/workbench/contrib/template/browser/views/templateEditorView";
import {
  parseCellLabel,
  toCellLabel,
} from "src/cs/workbench/services/template/common/templateCellRange";
import type { TemplateEditorConfig } from "src/cs/workbench/services/template/common/templateEditorConfig";
import type {
  Template,
  TemplateAxisBinding,
  TemplateBlock,
  TemplateColumnRange,
  TemplateRowRange,
} from "src/cs/workbench/services/template/common/templateSpec";
import {
  normalizeColumnIndexes,
} from "src/cs/workbench/services/template/common/templateXYBinding";
import {
  getTemplateXRangeColumns,
  getTemplateXRangeFormFields,
  normalizeTemplateXRange,
  normalizeTemplateXRanges,
  type TemplateXRange,
} from "src/cs/workbench/services/template/common/templateCellRange";

// UI-only bidirectional map between table picking and Template editor fields.
// Forward: ITableService selection -> TemplateEditorConfig updates.
// Reverse: TemplateEditorConfig cell labels -> ITableService active-cell targets.
export { normalizeColumnIndexes };

export const areColumnIndexesEqual = (
  first: readonly number[] | undefined,
  second: readonly number[] | undefined,
): boolean => {
  const normalizedFirst = normalizeColumnIndexes(first);
  const normalizedSecond = normalizeColumnIndexes(second);
  if (normalizedFirst.length !== normalizedSecond.length) {
    return false;
  }

  return normalizedFirst.every((value, index) => value === normalizedSecond[index]);
};

export const areTableCellsEqual = (
  first: TableCell | null | undefined,
  second: TableCell | null | undefined,
): boolean => {
  if (!first || !second) {
    return !first && !second;
  }

  return first.sheetId === second.sheetId &&
    first.rowIndex === second.rowIndex &&
    first.colIndex === second.colIndex;
};

export const areTableRangesEqual = (
  first: readonly TableRange[] | undefined,
  second: readonly TableRange[] | undefined,
): boolean => {
  const normalizedFirst = normalizeTableRanges(first);
  const normalizedSecond = normalizeTableRanges(second);
  if (normalizedFirst.length !== normalizedSecond.length) {
    return false;
  }

  return normalizedFirst.every((range, index) => {
    const other = normalizedSecond[index];
    return range.startRow === other?.startRow &&
      range.endRow === other.endRow &&
      range.startCol === other.startCol &&
      range.endCol === other.endCol &&
      range.sheetId === other.sheetId;
  });
};

export const resolveTemplateColumnSelectionUpdate = (
  selection: TableSelection,
  target: TemplateColumnPickTarget = "yColumns",
): Partial<TemplateEditorConfig> => {
  const columns = normalizeColumnIndexes(selection.selectedColumns);
  return target === "yColumns" ? { yColumns: columns } : {};
};

export const resolveTemplateXRangeSelectionUpdate = (
  selection: TableSelection,
  {
    existingRanges = [],
    replaceFrom = existingRanges.length,
    rowCount = null,
  }: {
    readonly existingRanges?: readonly TemplateXRange[];
    readonly replaceFrom?: number;
    readonly rowCount?: number | null;
  } = {},
): Partial<TemplateEditorConfig> => {
  const selectedRanges = normalizeTableRanges(selection.ranges)
    .flatMap(range => createTemplateXRangesFromTableRange(range, rowCount));
  if (!selectedRanges.length) {
    return {};
  }

  const currentRanges = normalizeTemplateXRanges(existingRanges);
  const insertionIndex = Math.max(0, Math.min(replaceFrom, currentRanges.length));
  const xRanges = normalizeTemplateXRanges([
    ...currentRanges.slice(0, insertionIndex),
    ...selectedRanges,
  ]);
  return {
    ...getTemplateXRangeFormFields(xRanges),
    xColumns: getTemplateXRangeColumns(xRanges),
    xRanges,
  };
};

export const resolveTemplateCellSelectionUpdate = (
  activeCell: TableCell | null | undefined,
  activePickField: TemplatePickFieldName | null,
): Partial<TemplateEditorConfig> => {
  const updates: Partial<TemplateEditorConfig> = {};
  if (!activeCell || !activePickField) {
    return updates;
  }

  const cellLabel = toCellLabel(activeCell.rowIndex, activeCell.colIndex);
  switch (activePickField) {
    case "xDataStart":
      updates.xDataStart = cellLabel;
      break;
    case "xDataEnd":
      updates.xDataEnd = cellLabel;
      break;
    case "xSegmentCount":
      updates.xSegmentCount = cellLabel;
      break;
    case "xPointsPerGroup":
      updates.xPointsPerGroup = cellLabel;
      break;
    case "yLegendStart":
      updates.yLegendStart = cellLabel;
      break;
    case "yLegendCount":
      updates.yLegendCount = cellLabel;
      break;
  }

  return updates;
};

export const createTemplateTableDecorations = ({
  columnCount,
  rowCount,
  sheetId,
  template,
}: {
  readonly columnCount: number;
  readonly rowCount: number;
  readonly sheetId?: string | null;
  readonly template: Template;
}): readonly TableRangeDecoration[] => {
  const normalizedRowCount = Math.max(0, Math.floor(Number(rowCount) || 0));
  const normalizedColumnCount = Math.max(0, Math.floor(Number(columnCount) || 0));
  if (normalizedRowCount <= 0 || normalizedColumnCount <= 0) {
    return [];
  }

  const decorations: TableRangeDecoration[] = [];
  for (const block of template.blocks) {
    const blockRange = createTemplateBlockDecoration(block, normalizedRowCount, normalizedColumnCount, sheetId ?? null);
    if (blockRange) {
      decorations.push(blockRange);
    }
    decorations.push(...createTemplateAxisDecorations({
      axis: block.x,
      columnCount: normalizedColumnCount,
      kind: "templateX",
      rowCount: normalizedRowCount,
      rowRange: block.rowRange,
      sheetId: sheetId ?? null,
    }));
    decorations.push(...createTemplateAxisDecorations({
      axis: block.y,
      columnCount: normalizedColumnCount,
      kind: "templateY",
      rowCount: normalizedRowCount,
      rowRange: block.rowRange,
      sheetId: sheetId ?? null,
    }));
  }

  return decorations;
};

export const createTemplateTableDataRanges = ({
  columnCount,
  rowCount,
  sheetId,
  template,
}: {
  readonly columnCount: number;
  readonly rowCount: number;
  readonly sheetId?: string | null;
  readonly template: Template;
}): readonly TableRange[] => {
  const normalizedRowCount = Math.max(0, Math.floor(Number(rowCount) || 0));
  const normalizedColumnCount = Math.max(0, Math.floor(Number(columnCount) || 0));
  if (normalizedRowCount <= 0 || normalizedColumnCount <= 0) {
    return [];
  }

  return template.blocks
    .map(block => createTemplateBlockDecoration(
      block,
      normalizedRowCount,
      normalizedColumnCount,
      sheetId ?? null,
    ))
    .filter((range): range is TableRangeDecoration => Boolean(range))
    .map(range => ({
      sheetId: range.sheetId,
      startRow: range.startRow,
      endRow: range.endRow,
      startCol: range.startCol,
      endCol: range.endCol,
    }));
};

function normalizeTableRanges(ranges: readonly TableRange[] | undefined): TableRange[] {
  return (Array.isArray(ranges) ? ranges : [])
    .map((range): TableRange | null => {
      const startRow = Math.floor(Number(range.startRow));
      const endRow = Math.floor(Number(range.endRow));
      const startCol = Math.floor(Number(range.startCol));
      const endCol = Math.floor(Number(range.endCol));
      if (
        !Number.isInteger(startRow) ||
        !Number.isInteger(endRow) ||
        !Number.isInteger(startCol) ||
        !Number.isInteger(endCol)
      ) {
        return null;
      }

      return {
        sheetId: range.sheetId,
        startRow: Math.min(startRow, endRow),
        endRow: Math.max(startRow, endRow),
        startCol: Math.min(startCol, endCol),
        endCol: Math.max(startCol, endCol),
      };
    })
    .filter((range): range is TableRange => Boolean(range));
}

function createTemplateBlockDecoration(
  block: TemplateBlock,
  rowCount: number,
  columnCount: number,
  sheetId: string | null,
): TableRangeDecoration | null {
  const columns = [
    ...block.x.columns,
    ...block.y.columns,
    ...(block.x.ranges ?? []).map(range => range.column),
    ...(block.y.ranges ?? []).map(range => range.column),
  ]
    .map(column => Math.floor(Number(column)))
    .filter(column => Number.isInteger(column) && column >= 0 && column < columnCount);
  if (!columns.length) {
    return null;
  }

  return normalizeTemplateDecorationRange({
    kind: "templateBlock",
    sheetId,
    startRow: block.rowRange.startRow,
    endRow: resolveTemplateEndRow(block.rowRange.endRow, rowCount),
    startCol: Math.min(...columns),
    endCol: Math.max(...columns),
  }, rowCount, columnCount);
}

function createTemplateAxisDecorations({
  axis,
  columnCount,
  kind,
  rowCount,
  rowRange,
  sheetId,
}: {
  readonly axis: TemplateAxisBinding;
  readonly columnCount: number;
  readonly kind: TableRangeDecoration["kind"];
  readonly rowCount: number;
  readonly rowRange: TemplateRowRange;
  readonly sheetId: string | null;
}): readonly TableRangeDecoration[] {
  const explicitRanges = axis.ranges?.length
    ? axis.ranges
    : axis.columns.map((column): TemplateColumnRange => ({
      column,
      startRow: rowRange.startRow,
      endRow: rowRange.endRow,
    }));

  return explicitRanges
    .map(range => normalizeTemplateDecorationRange({
      kind,
      sheetId,
      startRow: range.startRow,
      endRow: resolveTemplateEndRow(range.endRow, rowCount),
      startCol: range.column,
      endCol: range.column,
    }, rowCount, columnCount))
    .filter((range): range is TableRangeDecoration => Boolean(range));
}

function normalizeTemplateDecorationRange(
  range: TableRangeDecoration,
  rowCount: number,
  columnCount: number,
): TableRangeDecoration | null {
  const startRow = Math.floor(Number(range.startRow));
  const endRow = Math.floor(Number(range.endRow));
  const startCol = Math.floor(Number(range.startCol));
  const endCol = Math.floor(Number(range.endCol));
  if (
    !Number.isInteger(startRow) ||
    !Number.isInteger(endRow) ||
    !Number.isInteger(startCol) ||
    !Number.isInteger(endCol)
  ) {
    return null;
  }

  if (startRow > endRow || startCol > endCol) {
    return null;
  }

  const normalizedStartRow = Math.max(0, startRow);
  const normalizedEndRow = Math.min(rowCount - 1, endRow);
  const normalizedStartCol = Math.max(0, startCol);
  const normalizedEndCol = Math.min(columnCount - 1, endCol);
  if (
    normalizedStartRow > normalizedEndRow ||
    normalizedStartCol > normalizedEndCol ||
    normalizedStartRow >= rowCount ||
    normalizedStartCol >= columnCount
  ) {
    return null;
  }

  return {
    kind: range.kind,
    sheetId: range.sheetId,
    startRow: normalizedStartRow,
    endRow: normalizedEndRow,
    startCol: normalizedStartCol,
    endCol: normalizedEndCol,
  };
}

function resolveTemplateEndRow(
  endRow: TemplateRowRange["endRow"],
  rowCount: number,
): number {
  return endRow === "end" ? rowCount - 1 : endRow;
}

function createTemplateXRangesFromTableRange(
  range: TableRange,
  rowCount: number | null,
): TemplateXRange[] {
  const ranges: TemplateXRange[] = [];
  for (let column = range.startCol; column <= range.endCol; column += 1) {
    const xRange = normalizeTemplateXRange({
      start: toCellLabel(range.startRow, column),
      end: rowCount !== null && rowCount > 0 && range.endRow >= rowCount - 1
        ? "End"
        : toCellLabel(range.endRow, column),
    });
    if (xRange) {
      ranges.push(xRange);
    }
  }
  return ranges;
}

export const resolveTemplateCellSelection = (
  config: TemplateEditorConfig,
  activePickField: TemplatePickFieldName | null,
  currentCell: TableCell | null | undefined,
): TableCell | null => {
  if (!activePickField) {
    return null;
  }

  const parsedCell = parseCellLabel(config[activePickField]);
  if (!parsedCell) {
    return null;
  }

  return {
    colIndex: parsedCell.colIndex,
    rowIndex: parsedCell.rowIndex,
    sheetId: currentCell?.sheetId ?? null,
  };
};
