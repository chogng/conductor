export const TableContributionId = "workbench.contrib.table";

export const TableViewId = "workbench.table";

export const TableCommandId = {
  clearSelection: "workbench.table.clearSelection",
  resetZoom: "workbench.table.resetZoom",
  selectAllColumns: "workbench.table.selectAllColumns",
  zoomIn: "workbench.table.zoomIn",
  zoomOut: "workbench.table.zoomOut",
} as const;

export type TableCommandId = typeof TableCommandId[keyof typeof TableCommandId];
