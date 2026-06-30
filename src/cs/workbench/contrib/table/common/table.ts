/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

export const TableContributionId = "workbench.contrib.table";

export const TableViewId = "workbench.table";

export const TableCommandId = {
	clearSelection: "workbench.table.clearSelection",
	copySelection: "workbench.table.copySelection",
	resetZoom: "workbench.table.resetZoom",
	selectAllColumns: "workbench.table.selectAllColumns",
	toggleColumnAutoFit: "workbench.table.toggleColumnAutoFit",
	zoomIn: "workbench.table.zoomIn",
	zoomOut: "workbench.table.zoomOut",
} as const;

export type TableCommandId = typeof TableCommandId[keyof typeof TableCommandId];
