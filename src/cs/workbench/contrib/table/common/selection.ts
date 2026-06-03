import type {
  TableCell,
  TableRange,
  TableSelection,
} from "src/cs/workbench/contrib/table/common/tableService";

export const normalizeTableCell = (cell: TableCell | null | undefined): TableCell | null => {
  if (!cell) return null;
  const rowIndex = Math.floor(Number(cell.rowIndex));
  const colIndex = Math.floor(Number(cell.colIndex));
  if (!Number.isInteger(rowIndex) || rowIndex < 0) return null;
  if (!Number.isInteger(colIndex) || colIndex < 0) return null;

  return {
    fileId: typeof cell.fileId === "string" ? cell.fileId : null,
    sheetId: typeof cell.sheetId === "string" ? cell.sheetId : null,
    rowIndex,
    colIndex,
  };
};

export const normalizeColumnIndexes = (columnIndexes: readonly number[] | undefined): number[] =>
  Array.from(new Set(
    (Array.isArray(columnIndexes) ? columnIndexes : [])
      .map((columnIndex) => Math.floor(Number(columnIndex)))
      .filter((columnIndex) => Number.isInteger(columnIndex) && columnIndex >= 0),
  )).sort((a, b) => a - b);

export const normalizeTableSelection = (
  selection: TableSelection | null | undefined,
): TableSelection => ({
  activeCell: normalizeTableCell(selection?.activeCell),
  selectedColumns: normalizeColumnIndexes(selection?.selectedColumns),
  ranges: Array.isArray(selection?.ranges)
    ? selection.ranges
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
            fileId: typeof range.fileId === "string" ? range.fileId : null,
            sheetId: typeof range.sheetId === "string" ? range.sheetId : null,
            startRow: Math.max(0, Math.min(startRow, endRow)),
            endRow: Math.max(0, Math.max(startRow, endRow)),
            startCol: Math.max(0, Math.min(startCol, endCol)),
            endCol: Math.max(0, Math.max(startCol, endCol)),
          };
        })
        .filter((range): range is TableRange => Boolean(range))
    : [],
});

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

const areColumnIndexesEqual = (
  first: readonly number[] | undefined,
  second: readonly number[] | undefined,
): boolean => {
  const left = first ?? [];
  const right = second ?? [];
  return left.length === right.length &&
    left.every((value, index) => value === right[index]);
};

const areTableRangesEqual = (
  first: readonly TableRange[] | undefined,
  second: readonly TableRange[] | undefined,
): boolean => {
  const left = first ?? [];
  const right = second ?? [];
  return left.length === right.length &&
    left.every((range, index) => {
      const next = right[index];
      if (!next) {
        return false;
      }

      return range.fileId === next.fileId &&
        range.sheetId === next.sheetId &&
        range.startRow === next.startRow &&
        range.endRow === next.endRow &&
        range.startCol === next.startCol &&
        range.endCol === next.endCol;
    });
};

export const areTableSelectionsEqual = (
  first: TableSelection,
  second: TableSelection,
): boolean =>
  areTableCellsEqual(first.activeCell, second.activeCell) &&
  areColumnIndexesEqual(first.selectedColumns, second.selectedColumns) &&
  areTableRangesEqual(first.ranges, second.ranges);
