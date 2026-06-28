/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type { Event } from "src/cs/base/common/event";
import type {
	IListContextMenuEvent,
	IListEvent,
	IListGestureEvent,
	IListMouseEvent,
	IListRenderer,
	IListTouchEvent,
	IListVirtualDelegate,
} from "src/cs/base/browser/ui/list/list";

export const TABLE_WIDGET_DEFAULT_ZOOM_PERCENT = 100;
export const TABLE_WIDGET_MIN_ZOOM_PERCENT = 50;
export const TABLE_WIDGET_MAX_ZOOM_PERCENT = 200;
export const TABLE_WIDGET_ZOOM_STEP_PERCENT = 10;

export interface ITableColumn<TRow, TCell> {
	readonly label: string;
	readonly tooltip?: string;
	readonly weight: number;
	readonly templateId: string;

	readonly minimumWidth?: number;
	readonly maximumWidth?: number;
	readonly onDidChangeWidthConstraints?: Event<void>;

	project(row: TRow): TCell;
}

export interface ITableVirtualDelegate<TRow> extends Pick<IListVirtualDelegate<TRow>, "getHeight"> {
	readonly headerRowHeight: number;
}

export interface ITableColumnVirtualDelegate<TColumn = number> {
	getWidth(column: TColumn): number;
}

export interface ITableRange {
	readonly totalCount: number;
	readonly startIndex: number;
	readonly endIndex: number;
	readonly renderedCount: number;
}

export interface ITableColumnRange extends ITableRange {
	readonly leadingWidth: number;
	readonly renderedWidth: number;
	readonly totalWidth: number;
	readonly trailingWidth: number;
}

export interface ITableCellPosition {
	readonly rowIndex: number;
	readonly colIndex: number;
}

export interface ITableCellRange {
	readonly endCol: number;
	readonly endRow: number;
	readonly startCol: number;
	readonly startRow: number;
}

export interface ITableBodyCellDescriptor {
	readonly colIndex: number;
	readonly columnOffset: number;
	readonly rowIndex: number;
	readonly rowOffset: number;
}

export interface ITableColumnHeaderDescriptor {
	readonly colIndex: number;
	readonly columnOffset: number;
}

export interface ITableRowHeaderDescriptor {
	readonly rowIndex: number;
	readonly rowOffset: number;
}

export interface ITableRenderer<TCell, TTemplateData> extends IListRenderer<TCell, TTemplateData> { }

export interface ITableEvent<TRow> extends IListEvent<TRow> { }
export interface ITableMouseEvent<TRow> extends IListMouseEvent<TRow> { }
export interface ITableTouchEvent<TRow> extends IListTouchEvent<TRow> { }
export interface ITableGestureEvent<TRow> extends IListGestureEvent<TRow> { }
export interface ITableContextMenuEvent<TRow> extends IListContextMenuEvent<TRow> { }

/**
 * Renderer boundary for pooled cells. Implementations should be idempotent:
 * the same DOM cell will be rebound to many row/column descriptors while
 * scrolling.
 */
export interface ITableWidgetRenderer {
	readonly clearBodyCell?: (cell: HTMLTableCellElement) => void;
	readonly disposeBodyCell?: (cell: HTMLTableCellElement) => void;
	readonly renderBodyCell: (cell: HTMLTableCellElement, descriptor: ITableBodyCellDescriptor) => void;
	readonly renderBodyCellContent?: (content: HTMLElement, descriptor: ITableBodyCellDescriptor) => void;
	readonly renderColumnHeader: (cell: HTMLElement, descriptor: ITableColumnHeaderDescriptor) => void;
	readonly renderCorner?: (cell: HTMLElement) => void;
	readonly renderRowHeader: (cell: HTMLTableCellElement, descriptor: ITableRowHeaderDescriptor) => void;
}

export interface ITablePagedBodyCellDescriptor<TRow> extends ITableBodyCellDescriptor {
	readonly row: TRow;
}

export interface ITablePagedWidgetRenderer<TRow> {
	readonly clearBodyCell?: (cell: HTMLTableCellElement) => void;
	readonly disposeBodyCell?: (cell: HTMLTableCellElement) => void;
	readonly renderBodyCell?: (cell: HTMLTableCellElement, descriptor: ITableBodyCellDescriptor) => void;
	readonly renderBodyCellContent: (content: HTMLElement, descriptor: ITablePagedBodyCellDescriptor<TRow>) => void;
	readonly renderBodyCellPlaceholder?: (content: HTMLElement, descriptor: ITableBodyCellDescriptor) => void;
	readonly renderColumnHeader: (cell: HTMLElement, descriptor: ITableColumnHeaderDescriptor) => void;
	readonly renderCorner?: (cell: HTMLElement) => void;
	readonly renderRowHeader: (cell: HTMLTableCellElement, descriptor: ITableRowHeaderDescriptor) => void;
}

export interface ITableWidgetOptions {
	readonly className?: string;
	readonly columnResize?: ITableColumnResizeOptions;
	readonly getColumnWidth: (colIndex: number) => number;
	readonly maxRenderedColumns?: number;
	readonly maxRenderedRows?: number;
	readonly renderer: ITableWidgetRenderer;
}

export interface ITableColumnResizeOptions {
	readonly enabled?: boolean;
	readonly hitSlop?: number;
	readonly mode?: ITableColumnResizeMode;
}

export type ITableColumnResizeMode = "commit" | "live";

export interface ITableColumnResizeEvent {
	readonly colIndex: number;
	readonly width: number;
}

export interface ITableSize {
	readonly columnCount: number;
	readonly rowCount: number;
}

export interface ITableRenderOptions {
	readonly columnCount: number;
	readonly headerRenderVersion?: unknown;
	readonly renderVersion?: unknown;
	readonly rowCount: number;
}

export interface ITableScrollEvent {
	readonly scrollLeft: number;
	readonly scrollTop: number;
}

export interface ITableState {
	readonly columnRange: ITableColumnRange;
	readonly rowRange: ITableRange;
}

export interface ITableVisibleRangeChangeEvent {
	readonly current: ITableState;
	readonly previous: ITableState;
}

/**
 * Half-open dirty range in logical table coordinates. Missing row or column
 * bounds mean the change applies to the currently visible span on that axis.
 */
export interface ITableDirtyRange {
	readonly endCol?: number;
	readonly endRow?: number;
	readonly startCol?: number;
	readonly startRow?: number;
}

export type ITablePatchResult = "ignored" | "patched";

export class TableError extends Error {
	public constructor(user: string, message: string) {
		super(`TableError [${user}] ${message}`);
	}
}
