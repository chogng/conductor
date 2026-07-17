/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

export const TableContributionId = "workbench.contrib.table";

export const TableViewContainerId = "workbench.viewContainer.table";

export const TableViewId = "workbench.table";

export const CLEAR_TABLE_SELECTION_COMMAND_ID = "workbench.table.clearSelection";
export const COPY_TABLE_SELECTION_COMMAND_ID = "workbench.table.copySelection";
export const DECREASE_TABLE_COLUMN_DISPLAY_SCALE_COMMAND_ID = "workbench.table.decreaseColumnDisplayScale";
export const INCREASE_TABLE_COLUMN_DISPLAY_SCALE_COMMAND_ID = "workbench.table.increaseColumnDisplayScale";
export const RESET_TABLE_COLUMN_DISPLAY_SCALE_COMMAND_ID = "workbench.table.resetColumnDisplayScale";
export const RESET_TABLE_ZOOM_COMMAND_ID = "workbench.table.resetZoom";
export const SELECT_ALL_TABLE_COLUMNS_COMMAND_ID = "workbench.table.selectAllColumns";
export const ZOOM_IN_TABLE_COMMAND_ID = "workbench.table.zoomIn";
export const ZOOM_OUT_TABLE_COMMAND_ID = "workbench.table.zoomOut";

export type TableCommandId =
	| typeof CLEAR_TABLE_SELECTION_COMMAND_ID
	| typeof COPY_TABLE_SELECTION_COMMAND_ID
	| typeof DECREASE_TABLE_COLUMN_DISPLAY_SCALE_COMMAND_ID
	| typeof INCREASE_TABLE_COLUMN_DISPLAY_SCALE_COMMAND_ID
	| typeof RESET_TABLE_COLUMN_DISPLAY_SCALE_COMMAND_ID
	| typeof RESET_TABLE_ZOOM_COMMAND_ID
	| typeof SELECT_ALL_TABLE_COLUMNS_COMMAND_ID
	| typeof ZOOM_IN_TABLE_COMMAND_ID
	| typeof ZOOM_OUT_TABLE_COMMAND_ID;
