/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

export type RustPreviewCellRequest = {
  colIndex: number;
  rowIndex: number;
};

type RustPreviewCellResult = RustPreviewCellRequest & {
  value?: unknown;
};

const toSafeIndex = (value: unknown): number | null => {
  const index = Math.floor(Number(value));
  return Number.isInteger(index) && index >= 0 ? index : null;
};

export const buildRustPreviewCellRequests = ({
  columnCount,
  maxCells = 5000,
  rowIndices,
}: {
  columnCount: number;
  maxCells?: number;
  rowIndices: Iterable<unknown>;
}): RustPreviewCellRequest[] => {
  const safeColumnCount = Math.floor(Number(columnCount));
  if (!Number.isInteger(safeColumnCount) || safeColumnCount <= 0) return [];

  const rows = Array.from(rowIndices)
    .map(toSafeIndex)
    .filter((rowIndex): rowIndex is number => rowIndex !== null);
  const uniqueRows = Array.from(new Set(rows)).sort((a, b) => a - b);
  const safeMaxCells = Math.max(1, Math.floor(Number(maxCells) || 1));
  if (uniqueRows.length * safeColumnCount > safeMaxCells) return [];

  const cells: RustPreviewCellRequest[] = [];
  for (const rowIndex of uniqueRows) {
    for (let colIndex = 0; colIndex < safeColumnCount; colIndex += 1) {
      cells.push({ colIndex, rowIndex });
    }
  }
  return cells;
};

export const rowsFromRustPreviewCells = ({
  cells,
  columnCount,
}: {
  cells: unknown;
  columnCount: number;
}): Map<number, unknown[]> => {
  const safeColumnCount = Math.floor(Number(columnCount));
  const rows = new Map<number, unknown[]>();
  if (!Array.isArray(cells) || safeColumnCount <= 0) return rows;

  for (const rawCell of cells) {
    if (!rawCell || typeof rawCell !== "object") continue;
    const cell = rawCell as RustPreviewCellResult;
    const rowIndex = toSafeIndex(cell.rowIndex);
    const colIndex = toSafeIndex(cell.colIndex);
    if (rowIndex === null || colIndex === null || colIndex >= safeColumnCount) {
      continue;
    }

    let row = rows.get(rowIndex);
    if (!row) {
      row = Array.from({ length: safeColumnCount }, () => "");
      rows.set(rowIndex, row);
    }
    row[colIndex] = cell.value ?? "";
  }

  return rows;
};
