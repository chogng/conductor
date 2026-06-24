import type { TableCell, TableRange, TableSelection } from "src/cs/workbench/services/table/common/table";
import type {
  TemplateColumnPickTarget,
  TemplatePickFieldName,
} from "src/cs/workbench/contrib/template/browser/views/templateEditorView";
import {
  parseCellLabel,
  toCellLabel,
} from "src/cs/workbench/services/template/common/templateCellRef";
import type { TemplateEditorConfig } from "src/cs/workbench/services/template/common/templateEditorConfig";
import {
  normalizeColumnIndexes,
} from "src/cs/workbench/services/template/common/templateXYBinding";
import {
  getTemplateXRangeColumns,
  getTemplateXRangeFormFields,
  normalizeTemplateXRange,
  normalizeTemplateXRanges,
  type TemplateXRange,
} from "src/cs/workbench/services/template/common/templateXRange";

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

  return first.fileId === second.fileId &&
    first.sheetId === second.sheetId &&
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
      range.endCol === other.endCol;
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
        fileId: range.fileId,
        sheetId: range.sheetId,
        startRow: Math.min(startRow, endRow),
        endRow: Math.max(startRow, endRow),
        startCol: Math.min(startCol, endCol),
        endCol: Math.max(startCol, endCol),
      };
    })
    .filter((range): range is TableRange => Boolean(range));
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
    fileId: currentCell?.fileId ?? null,
    rowIndex: parsedCell.rowIndex,
    sheetId: currentCell?.sheetId ?? null,
  };
};
