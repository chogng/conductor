/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

const clampInt = (value, min, max) => {
  const n = Math.floor(Number(value) || 0);
  return Math.max(min, Math.min(max, n));
};

const hasCell = (cell) =>
  Boolean(
    cell &&
      Number.isFinite(Number(cell.rowIndex)) &&
      Number.isFinite(Number(cell.colIndex)),
  );

export const getSelectionFocusCell = (range) => {
  if (!range) return null;
  const rowIndex = Math.floor(Number(range.endRow));
  const colIndex = Math.floor(Number(range.endCol));
  if (!Number.isFinite(rowIndex) || !Number.isFinite(colIndex)) return null;
  return {
    rowIndex: Math.max(0, rowIndex),
    colIndex: Math.max(0, colIndex),
  };
};

export const getSelectionModeFromPointerEvent = ({ ctrlKey, metaKey } = {}) =>
  ctrlKey || metaKey ? "append" : "replace";

export const resolveSelectionDragStart = ({
  anchor,
  colIndex,
  rowIndex,
  shiftKey,
}) => {
  const safeRow = Math.max(0, Math.floor(Number(rowIndex) || 0));
  const safeCol = Math.max(0, Math.floor(Number(colIndex) || 0));
  const useAnchor = Boolean(shiftKey && hasCell(anchor));
  const startCell = useAnchor
    ? {
        rowIndex: Math.max(0, Math.floor(Number(anchor.rowIndex) || 0)),
        colIndex: Math.max(0, Math.floor(Number(anchor.colIndex) || 0)),
      }
    : {
        rowIndex: safeRow,
        colIndex: safeCol,
      };
  const pointerCell = { rowIndex: safeRow, colIndex: safeCol };
  const nextAnchor = useAnchor ? anchor : pointerCell;
  return { nextAnchor, pointerCell, startCell, useAnchor };
};

export const computePreviewPageRows = ({
  headerHeight,
  rowHeight,
  viewportHeight,
}) => {
  const safeRowHeight = Math.max(1, Number(rowHeight) || 1);
  const safeViewport = Math.max(1, Number(viewportHeight) || 0);
  const safeHeader = Math.max(0, Number(headerHeight) || 0);
  return Math.max(1, Math.floor(Math.max(1, safeViewport - safeHeader) / safeRowHeight));
};

export const isPreviewNavigationKey = (key) => {
  const normalized = String(key || "").toLowerCase();
  return (
    normalized === "arrowup" ||
    normalized === "arrowdown" ||
    normalized === "arrowleft" ||
    normalized === "arrowright" ||
    normalized === "home" ||
    normalized === "end" ||
    normalized === "pageup" ||
    normalized === "pagedown"
  );
};

export const computeNextPreviewCell = ({
  currentCell,
  key,
  pageRows,
  totalCols,
  totalRows,
}) => {
  if (!hasCell(currentCell)) return null;
  const rowMax = Math.max(0, Math.floor(Number(totalRows) || 0) - 1);
  const colMax = Math.max(0, Math.floor(Number(totalCols) || 0) - 1);
  if (rowMax < 0 || colMax < 0) return null;

  const normalizedKey = String(key || "").toLowerCase();
  let rowIndex = clampInt(currentCell.rowIndex, 0, rowMax);
  let colIndex = clampInt(currentCell.colIndex, 0, colMax);
  const safePageRows = Math.max(1, Math.floor(Number(pageRows) || 1));

  if (normalizedKey === "arrowup") rowIndex = clampInt(rowIndex - 1, 0, rowMax);
  if (normalizedKey === "arrowdown")
    rowIndex = clampInt(rowIndex + 1, 0, rowMax);
  if (normalizedKey === "arrowleft")
    colIndex = clampInt(colIndex - 1, 0, colMax);
  if (normalizedKey === "arrowright")
    colIndex = clampInt(colIndex + 1, 0, colMax);
  if (normalizedKey === "home") colIndex = 0;
  if (normalizedKey === "end") colIndex = colMax;
  if (normalizedKey === "pageup")
    rowIndex = clampInt(rowIndex - safePageRows, 0, rowMax);
  if (normalizedKey === "pagedown")
    rowIndex = clampInt(rowIndex + safePageRows, 0, rowMax);

  return { colIndex, rowIndex };
};
