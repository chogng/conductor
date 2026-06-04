import {
  TableCommandId,
  type TableCommandId as TableCommandIdValue,
} from "src/cs/workbench/contrib/table/common/table";
import type TableViewPane from "src/cs/workbench/contrib/table/browser/tableViewPane";

export const runTableCommand = (
  view: TableViewPane | null,
  commandId: TableCommandIdValue,
): boolean => {
  if (!view) {
    return false;
  }

  switch (commandId) {
    case TableCommandId.clearSelection:
      view.clearSelection();
      return true;
    case TableCommandId.resetZoom:
      view.resetZoom();
      return true;
    case TableCommandId.selectAllColumns:
      view.selectAllColumns();
      return true;
    case TableCommandId.zoomIn:
      view.zoomIn();
      return true;
    case TableCommandId.zoomOut:
      view.zoomOut();
      return true;
  }

  return false;
};
