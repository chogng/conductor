import type { TableCell, TableSelection } from "src/cs/workbench/contrib/table/common/tableService";
import type { TemplatePickFieldName } from "src/cs/workbench/contrib/template/browser/views/templateEditorView";
import {
  parseCellLabel,
  toCellLabel,
} from "src/cs/workbench/contrib/template/common/templateCellRef";
import type { TemplateConfig } from "src/cs/workbench/contrib/template/common/templateManagerUtils";
export { toColumnLabel } from "src/cs/workbench/contrib/template/common/templateCellRef";

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

export const resolveTemplateColumnSelectionUpdate = (
  selection: TableSelection,
): Partial<TemplateConfig> => {
  const columns = normalizeColumnIndexes(selection.selectedColumns);
  return { yColumns: columns };
};

export const resolveTemplateCellSelectionUpdate = (
  activeCell: TableCell | null | undefined,
  activePickField: TemplatePickFieldName | null,
): Partial<TemplateConfig> => {
  const updates: Partial<TemplateConfig> = {};
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

export const resolveTemplateCellSelection = (
  config: TemplateConfig,
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
