/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

export {
	TableWidget,
	type TableWidgetDirtyRange,
	type TableWidgetOptions,
	type TableWidgetPatchResult,
	type TableWidgetRenderer,
} from "src/cs/base/browser/ui/table/tableWidget";
export {
	VirtualTableGridModel,
	type VirtualTableCellPosition,
	type VirtualTableCellRange,
	type VirtualTableColumnRange,
	type VirtualTableRange,
	type VirtualTableRenderer,
	type VirtualTableScrollEvent,
	type VirtualTableState,
	type VirtualTableVisibleRangeChangeEvent,
} from "src/cs/base/browser/ui/table/virtualTable";

export class TableError extends Error {
	public constructor(message: string) {
		super(`TableError ${message}`);
	}
}
