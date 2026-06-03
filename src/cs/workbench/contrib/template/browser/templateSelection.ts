import type { TableSelection } from "src/cs/workbench/contrib/table/common/tableService";
import type { TemplatePickFieldName } from "src/cs/workbench/contrib/template/browser/views/templateEditorView";
import type { TemplateConfig } from "src/cs/workbench/contrib/template/common/templateManagerUtils";

export const normalizeColumnIndexes = (columns: readonly number[] | undefined): number[] =>
  Array.from(new Set(
    (Array.isArray(columns) ? columns : [])
      .map((column) => Math.floor(Number(column)))
      .filter((column) => Number.isInteger(column) && column >= 0),
  )).sort((a, b) => a - b);

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

export const toColumnLabel = (colIndex: number): string => {
  let value = Math.max(0, Math.floor(Number(colIndex) || 0)) + 1;
  let label = "";
  while (value > 0) {
    const remainder = (value - 1) % 26;
    label = String.fromCharCode(65 + remainder) + label;
    value = Math.floor((value - 1) / 26);
  }
  return label;
};

const toCellLabel = (rowIndex: number, colIndex: number): string =>
  `${toColumnLabel(colIndex)}${Math.max(0, Math.floor(Number(rowIndex) || 0)) + 1}`;

export const resolveTemplateSelectionUpdate = (
  selection: TableSelection,
  activePickField: TemplatePickFieldName | null,
): Partial<TemplateConfig> => {
  const updates: Partial<TemplateConfig> = {};
  const columns = normalizeColumnIndexes(selection.selectedColumns);
  if (columns.length > 0) {
    updates.yColumns = columns;
  }

  const activeCell = selection.activeCell;
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
    case "yLegendStart":
      updates.yLegendStart = cellLabel;
      break;
    case "yLegendCount":
      updates.yLegendCount = cellLabel;
      break;
  }

  return updates;
};
