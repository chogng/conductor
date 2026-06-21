/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

export {
	TABLE_WIDGET_DEFAULT_ZOOM_PERCENT,
	TABLE_WIDGET_MAX_ZOOM_PERCENT,
	TABLE_WIDGET_MIN_ZOOM_PERCENT,
	TABLE_WIDGET_ZOOM_STEP_PERCENT,
	TableWidget,
	type TableWidgetBodyCellDescriptor,
	type TableWidgetCellPosition,
	type TableWidgetCellRange,
	type TableWidgetColumnHeaderDescriptor,
	type TableWidgetColumnRange,
	type TableWidgetColumnResizeEvent,
	type TableWidgetColumnResizeMode,
	type TableWidgetColumnResizeOptions,
	type TableWidgetDirtyRange,
	type TableWidgetOptions,
	type TableWidgetPatchResult,
	type TableWidgetRange,
	type TableWidgetRenderer,
	type TableWidgetRenderOptions,
	type TableWidgetRowHeaderDescriptor,
	type TableWidgetScrollEvent,
	type TableWidgetSize,
	type TableWidgetState,
	type TableWidgetVisibleRangeChangeEvent,
} from "src/cs/base/browser/ui/table/tableWidget";

export class TableError extends Error {
	public constructor(message: string) {
		super(`TableError ${message}`);
	}
}
