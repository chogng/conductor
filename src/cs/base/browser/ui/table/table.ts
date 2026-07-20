/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type { IMouseEvent } from "src/cs/base/browser/mouseEvent";
import type { IKeyboardEvent } from "src/cs/base/browser/keyboardEvent";
import type {
	IListContextMenuEvent,
	IListEvent,
	IListGestureEvent,
	IListMouseEvent,
	IListRenderer,
	IListTouchEvent,
	IListVirtualDelegate,
} from "src/cs/base/browser/ui/list/list";
import type { Event } from "src/cs/base/common/event";

export const TABLE_WIDGET_ZOOM_OPTIONS = {
	defaultPercent: 100,
	minPercent: 50,
	maxPercent: 200,
	stepPercent: 10,
} as const;

// table/list contracts.

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

export interface ITableRenderer<TCell, TTemplateData> extends IListRenderer<TCell, TTemplateData> { }

export interface ITableEvent<TRow> extends IListEvent<TRow> { }
export interface ITableMouseEvent<TRow> extends IListMouseEvent<TRow> { }
export interface ITableTouchEvent<TRow> extends IListTouchEvent<TRow> { }
export interface ITableGestureEvent<TRow> extends IListGestureEvent<TRow> { }
export interface ITableContextMenuEvent<TRow> extends IListContextMenuEvent<TRow> { }

// Two-dimensional virtual table geometry.

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

export interface ITableColumnHeaderPosition {
	readonly colIndex: number;
}

export interface ITableRowHeaderPosition {
	readonly rowIndex: number;
}

export interface ITableCellRange {
	readonly endCol: number;
	readonly endRow: number;
	readonly startCol: number;
	readonly startRow: number;
}

export interface ITableCellDecorationRange extends ITableCellRange {
	readonly token: string;
}

export interface ITableCellState {
	readonly activeCell?: ITableCellPosition | null;
	readonly decorationRanges?: readonly ITableCellDecorationRange[];
	readonly highlightedColumns?: readonly number[];
	readonly selectedColumns?: readonly number[];
	readonly selectedRanges?: readonly ITableCellRange[];
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

// Widget interaction state and events.

export interface ITableBodyMouseEvent<T extends MouseEvent = MouseEvent> {
	readonly browserEvent: T;
	readonly cell: ITableCellPosition | null;
	readonly mouseEvent: IMouseEvent;
}

export interface ITableSelectionRequestEvent {
	readonly reveal: boolean;
	readonly selection: ITableSelectionTarget;
}

export interface ITableCellEditCommitEvent extends ITableCellPosition {
	readonly value: string;
}

export interface ITableCellEditOptions {
	readonly enabled: boolean;
	readonly getInitialValue: (cell: ITableCellPosition) => string;
}

export interface ITableSelectionFrameEdges {
	readonly bottom: boolean;
	readonly left: boolean;
	readonly right: boolean;
	readonly top: boolean;
}

export interface ITableBodyCellTraitState {
	readonly active: boolean;
	readonly columnSelected: boolean;
	readonly decoration: string;
	readonly highlighted: boolean;
	readonly selected: boolean;
	readonly selectionFrame: ITableSelectionFrameEdges;
}

export interface ITableColumnHeaderTraitState {
	readonly columnSelected: boolean;
	readonly highlighted: boolean;
	readonly selected: boolean;
}

// Renderer contracts for pooled table DOM.

/**
 * Renderer boundary for pooled cells. Implementations should be idempotent:
 * the same DOM cell will be rebound to many row/column descriptors while
 * scrolling.
 */
export interface ITableWidgetRenderer<TBodyTemplateData = unknown, TColumnHeaderTemplateData = unknown> {
	readonly clearBodyCell: (templateData: TBodyTemplateData) => void;
	readonly disposeBodyCellTemplate: (templateData: TBodyTemplateData) => void;
	readonly disposeColumnHeaderTemplate?: (templateData: TColumnHeaderTemplateData) => void;
	readonly renderBodyCell: (templateData: TBodyTemplateData, descriptor: ITableBodyCellDescriptor) => void;
	readonly renderBodyCellContent: (templateData: TBodyTemplateData, descriptor: ITableBodyCellDescriptor) => void;
	readonly renderBodyCellTemplate: (cell: HTMLTableCellElement, content: HTMLElement) => TBodyTemplateData;
	readonly renderColumnHeader: (templateData: TColumnHeaderTemplateData, descriptor: ITableColumnHeaderDescriptor) => void;
	readonly renderColumnHeaderTemplate: (cell: HTMLElement) => TColumnHeaderTemplateData;
	readonly renderCorner?: (cell: HTMLElement) => void;
	readonly renderRowHeader: (cell: HTMLTableCellElement, descriptor: ITableRowHeaderDescriptor) => void;
}

export interface ITablePagedBodyCellDescriptor<TRow> extends ITableBodyCellDescriptor {
	readonly row: TRow;
}

export interface ITablePagedWidgetRenderer<TRow, TBodyTemplateData = unknown, TColumnHeaderTemplateData = unknown> {
	readonly clearBodyCell: (templateData: TBodyTemplateData) => void;
	readonly disposeBodyCellTemplate: (templateData: TBodyTemplateData) => void;
	readonly disposeColumnHeaderTemplate?: (templateData: TColumnHeaderTemplateData) => void;
	readonly renderBodyCell?: (templateData: TBodyTemplateData, descriptor: ITableBodyCellDescriptor) => void;
	readonly renderBodyCellContent: (templateData: TBodyTemplateData, descriptor: ITablePagedBodyCellDescriptor<TRow>) => void;
	readonly renderBodyCellPlaceholder: (templateData: TBodyTemplateData, descriptor: ITableBodyCellDescriptor) => void;
	readonly renderBodyCellTemplate: (cell: HTMLTableCellElement, content: HTMLElement) => TBodyTemplateData;
	readonly renderColumnHeader: (templateData: TColumnHeaderTemplateData, descriptor: ITableColumnHeaderDescriptor) => void;
	readonly renderColumnHeaderTemplate: (cell: HTMLElement) => TColumnHeaderTemplateData;
	readonly renderCorner?: (cell: HTMLElement) => void;
	readonly renderRowHeader: (cell: HTMLTableCellElement, descriptor: ITableRowHeaderDescriptor) => void;
}

// Widget options, facts, and patching.

export interface ITableWidgetOptions<TBodyTemplateData = unknown, TColumnHeaderTemplateData = unknown> {
	readonly cellEditing?: ITableCellEditOptions;
	readonly className?: string;
	readonly columnHeaderSelection?: ITableColumnHeaderSelection;
	readonly columnResize?: ITableColumnResizeOptions;
	readonly getColumnWidth: (colIndex: number) => number;
	readonly keyboardNavigation?: ITableKeyboardNavigationOptions;
	readonly maxRenderedColumns?: number;
	readonly maxRenderedRows?: number;
	readonly renderer: ITableWidgetRenderer<TBodyTemplateData, TColumnHeaderTemplateData>;
	readonly zoom?: ITableZoomOptions;
}

export interface ITableColumnAutoFitWidthOptions {
	readonly bodyTexts: readonly string[];
	readonly headerAccessoryWidth?: number;
	readonly headerText: string;
	readonly maximumWidth: number;
	readonly minimumWidth: number;
}

export interface ITableKeyboardNavigationOptions {
	readonly enabled?: boolean;
}

export type ITableColumnHeaderSelection = "disabled" | "single" | "multi";

export interface ITableZoomOptions {
	readonly wheel?: boolean;
}

export type ITableCellSelectionTarget =
	| { readonly kind: "cell"; readonly cell: ITableCellPosition | null }
	| {
		readonly kind: "range";
		readonly anchorCell: ITableCellPosition;
		readonly focusCell: ITableCellPosition;
		readonly range: ITableCellRange;
	};

export type ITableSelectionTarget =
	| ITableCellSelectionTarget
	| { readonly kind: "columns"; readonly columns: readonly number[] };

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

export interface ITableColumnResizeBoundaryDoubleClickEvent {
	readonly colIndex: number;
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
export type ITableDirtyPatchOutcome = "full" | ITablePatchResult;

export interface ITableDirtyPatchOptions {
	readonly bodyRenderVersion: unknown;
	readonly columnHeaderRenderVersion?: unknown;
	readonly full?: boolean;
	readonly includeColumnHeaders?: boolean;
	readonly ranges: readonly ITableDirtyRange[];
}

export interface ITableDirtyPatchResult {
	readonly body: ITablePatchResult;
	readonly columnHeaders: ITablePatchResult;
	readonly outcome: ITableDirtyPatchOutcome;
}

export class TableError extends Error {
	public constructor(user: string, message: string) {
		super(`TableError [${user}] ${message}`);
	}
}
