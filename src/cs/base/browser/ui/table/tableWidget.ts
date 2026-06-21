/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { addDisposableListener, EventType } from "src/cs/base/browser/dom";
import { Emitter, type Event } from "src/cs/base/common/event";
import { DisposableStore, type IDisposable } from "src/cs/base/common/lifecycle";
import { VirtualTable, VirtualTableGridModel } from "src/cs/base/browser/ui/table/virtualTable";

import "src/cs/base/browser/ui/table/table.css";

export const TABLE_WIDGET_DEFAULT_ZOOM_PERCENT = 100;
export const TABLE_WIDGET_MIN_ZOOM_PERCENT = 50;
export const TABLE_WIDGET_MAX_ZOOM_PERCENT = 200;
export const TABLE_WIDGET_ZOOM_STEP_PERCENT = 10;

const TABLE_WIDGET_RESIZING_COLUMN_CLASS = "table_view--resizing_column";
const TABLE_WIDGET_COLUMN_RESIZE_HANDLE_CLASS = "table_view_column_resize_handle";

export type TableWidgetRange = {
	readonly totalCount: number;
	readonly startIndex: number;
	readonly endIndex: number;
	readonly renderedCount: number;
};

export type TableWidgetColumnRange = TableWidgetRange & {
	readonly leadingWidth: number;
	readonly renderedWidth: number;
	readonly totalWidth: number;
	readonly trailingWidth: number;
};

export type TableWidgetCellPosition = {
	readonly rowIndex: number;
	readonly colIndex: number;
};

export type TableWidgetCellRange = {
	readonly endCol: number;
	readonly endRow: number;
	readonly startCol: number;
	readonly startRow: number;
};

export type TableWidgetBodyCellDescriptor = {
	readonly colIndex: number;
	readonly columnOffset: number;
	readonly rowIndex: number;
	readonly rowOffset: number;
};

export type TableWidgetColumnHeaderDescriptor = {
	readonly colIndex: number;
	readonly columnOffset: number;
};

export type TableWidgetRowHeaderDescriptor = {
	readonly rowIndex: number;
	readonly rowOffset: number;
};

/**
 * Renderer boundary for pooled cells. Implementations should be idempotent:
 * the same DOM cell will be rebound to many row/column descriptors while
 * scrolling.
 */
export type TableWidgetRenderer = {
	readonly clearBodyCell?: (cell: HTMLTableCellElement) => void;
	readonly disposeBodyCell?: (cell: HTMLTableCellElement) => void;
	readonly renderBodyCell: (cell: HTMLTableCellElement, descriptor: TableWidgetBodyCellDescriptor) => void;
	readonly renderColumnHeader: (cell: HTMLElement, descriptor: TableWidgetColumnHeaderDescriptor) => void;
	readonly renderCorner?: (cell: HTMLElement) => void;
	readonly renderRowHeader: (cell: HTMLTableCellElement, descriptor: TableWidgetRowHeaderDescriptor) => void;
};

export type TableWidgetOptions = {
	readonly className?: string;
	readonly columnResize?: TableWidgetColumnResizeOptions;
	readonly getColumnWidth: (colIndex: number) => number;
	readonly maxRenderedColumns?: number;
	readonly maxRenderedRows?: number;
	readonly renderer: TableWidgetRenderer;
};

export type TableWidgetColumnResizeOptions = {
	readonly enabled?: boolean;
	readonly hitSlop?: number;
	readonly mode?: TableWidgetColumnResizeMode;
};

export type TableWidgetColumnResizeMode = "commit" | "live";

export type TableWidgetColumnResizeEvent = {
	readonly colIndex: number;
	readonly width: number;
};

type TableWidgetColumnResizeState = {
	readonly colIndex: number;
	readonly guideLeft: number;
	readonly hasWidthChange: boolean;
	readonly startClientX: number;
	readonly startGuideLeft: number;
	readonly startWidth: number;
	readonly width: number;
};

export type TableWidgetSize = {
	readonly columnCount: number;
	readonly rowCount: number;
};

export type TableWidgetRenderOptions = {
	readonly columnCount: number;
	readonly renderVersion?: unknown;
	readonly rowCount: number;
};

export type TableWidgetScrollEvent = {
	readonly scrollLeft: number;
	readonly scrollTop: number;
};

export type TableWidgetState = {
	readonly columnRange: TableWidgetColumnRange;
	readonly rowRange: TableWidgetRange;
};

export type TableWidgetVisibleRangeChangeEvent = {
	readonly current: TableWidgetState;
	readonly previous: TableWidgetState;
};

/**
 * Half-open dirty range in logical table coordinates. Missing row or column
 * bounds mean the change applies to the currently visible span on that axis.
 */
export type TableWidgetDirtyRange = {
	readonly endCol?: number;
	readonly endRow?: number;
	readonly startCol?: number;
	readonly startRow?: number;
};

export type TableWidgetPatchResult = "ignored" | "patched";

/**
 * Stable base table entry point for workbench consumers, mirroring the upstream
 * shape where callers depend on one widget owner instead of structure class
 * maps. Feature code can add one root class, subscribe to events, and provide
 * renderers for domain content.
 *
 * The pooled DOM skeleton and its CSS hooks are owned by the base table.
 */
export class TableWidget implements IDisposable {
	public readonly element: HTMLElement;
	public readonly onDidChangeVisibleRange: Event<TableWidgetVisibleRangeChangeEvent>;
	public readonly onDidScroll: Event<TableWidgetScrollEvent>;
	public readonly onDidChangeSize: Event<TableWidgetSize>;
	public readonly onDidChangeZoom: Event<number>;
	public readonly onDidResizeColumn: Event<TableWidgetColumnResizeEvent>;

	private readonly disposables = new DisposableStore();
	private readonly columnResizeStore = this.disposables.add(new DisposableStore());
	private readonly onDidChangeSizeEmitter = this.disposables.add(new Emitter<TableWidgetSize>());
	private readonly onDidChangeZoomEmitter = this.disposables.add(new Emitter<number>());
	private readonly onDidResizeColumnEmitter = this.disposables.add(new Emitter<TableWidgetColumnResizeEvent>());
	private readonly onDidClickBodyEmitter = this.disposables.add(new Emitter<MouseEvent>());
	private readonly onDidClickHeaderEmitter = this.disposables.add(new Emitter<MouseEvent>());
	private readonly onDidPointerDownBodyEmitter = this.disposables.add(new Emitter<PointerEvent>());
	private columnResizeState: TableWidgetColumnResizeState | null = null;
	private lastRenderOptions: TableWidgetRenderOptions | null = null;
	private size: TableWidgetSize = { columnCount: 0, rowCount: 0 };
	private readonly virtualTable: VirtualTable;
	private zoomPercent = TABLE_WIDGET_DEFAULT_ZOOM_PERCENT;

	public readonly onDidClickBody = this.onDidClickBodyEmitter.event;
	public readonly onDidClickHeader = this.onDidClickHeaderEmitter.event;
	public readonly onDidPointerDownBody = this.onDidPointerDownBodyEmitter.event;

	public constructor(private readonly options: TableWidgetOptions) {
		const { className, ...virtualOptions } = options;
		this.virtualTable = this.disposables.add(new VirtualTable(virtualOptions));
		this.element = this.virtualTable.element;
		this.onDidChangeVisibleRange = this.virtualTable.onDidChangeVisibleRange;
		this.onDidScroll = this.virtualTable.onDidScroll;
		this.onDidChangeSize = this.onDidChangeSizeEmitter.event;
		this.onDidChangeZoom = this.onDidChangeZoomEmitter.event;
		this.onDidResizeColumn = this.onDidResizeColumnEmitter.event;
		this.syncZoomStyle();
		addRootClassName(this.element, className);
		this.disposables.add(addDisposableListener(this.virtualTable.headerContent, EventType.CLICK, event => {
			this.onDidClickHeaderEmitter.fire(event as MouseEvent);
		}));
		this.disposables.add(addDisposableListener(this.virtualTable.headerContent, EventType.POINTER_DOWN, event => {
			this.onColumnResizeStart(event as PointerEvent);
		}));
		this.disposables.add(addDisposableListener(this.virtualTable.bodyRows, EventType.CLICK, event => {
			this.onDidClickBodyEmitter.fire(event as MouseEvent);
		}));
		this.disposables.add(addDisposableListener(this.virtualTable.bodyRows, EventType.POINTER_DOWN, event => {
			this.onDidPointerDownBodyEmitter.fire(event as PointerEvent);
		}, { passive: false }));
	}

	public dispose(): void {
		this.endColumnResize(false);
		this.disposables.dispose();
	}

	public layout(): void {
		this.virtualTable.layout();
	}

	public render(options: TableWidgetRenderOptions): boolean {
		this.lastRenderOptions = options;
		const previousSize = this.size;
		this.size = toTableWidgetSize(options);
		if (!isTableWidgetSizeEqual(previousSize, this.size)) {
			this.onDidChangeSizeEmitter.fire(this.size);
		}
		if (this.size.rowCount === 0 || this.size.columnCount === 0) {
			this.endColumnResize(false);
		}
		this.syncZoomStyle();
		return this.virtualTable.render({
			...options,
			zoomPercent: this.zoomPercent,
		});
	}

	public getState(): TableWidgetState {
		return this.virtualTable.getState();
	}

	public getSize(): TableWidgetSize {
		return this.size;
	}

	public getZoomPercent(): number {
		return this.zoomPercent;
	}

	public getZoomScale(): number {
		return VirtualTableGridModel.getZoomScale(this.zoomPercent);
	}

	public getRowHeight(): number {
		return VirtualTableGridModel.getRowHeight(this.zoomPercent);
	}

	public setZoomPercent(zoomPercent: number): boolean {
		const nextZoomPercent = clampTableWidgetZoomPercent(zoomPercent);
		if (nextZoomPercent === this.zoomPercent) {
			return false;
		}

		this.zoomPercent = nextZoomPercent;
		this.syncZoomStyle();
		if (this.lastRenderOptions) {
			this.render(this.lastRenderOptions);
		}
		this.onDidChangeZoomEmitter.fire(nextZoomPercent);
		return true;
	}

	public resetZoom(): boolean {
		return this.setZoomPercent(TABLE_WIDGET_DEFAULT_ZOOM_PERCENT);
	}

	public zoomIn(): boolean {
		return this.setZoomPercent(this.zoomPercent + TABLE_WIDGET_ZOOM_STEP_PERCENT);
	}

	public zoomOut(): boolean {
		return this.setZoomPercent(this.zoomPercent - TABLE_WIDGET_ZOOM_STEP_PERCENT);
	}

	public isColumnResizeActive(): boolean {
		return this.columnResizeState !== null;
	}

	public createColumnResizeHandle(): HTMLElement {
		const handle = this.element.ownerDocument.createElement("span");
		handle.className = TABLE_WIDGET_COLUMN_RESIZE_HANDLE_CLASS;
		handle.setAttribute("role", "separator");
		handle.setAttribute("aria-orientation", "vertical");
		return handle;
	}

	public isContentVisible(): boolean {
		return this.virtualTable.isContentVisible();
	}

	public isContentAttached(): boolean {
		return this.virtualTable.isContentAttached();
	}

	public attachContent(): boolean {
		return this.virtualTable.attachContent();
	}

	public replaceViewportContent(element?: HTMLElement): void {
		this.virtualTable.replaceViewportContent(element);
	}

	public resetScrollTop(): void {
		this.virtualTable.resetScrollTop();
	}

	public scrollHorizontally(delta: number): boolean {
		return this.virtualTable.scrollHorizontally(delta);
	}

	public revealCell(
		rowIndex: number,
		colIndex: number,
	): boolean {
		return this.virtualTable.revealCell(rowIndex, colIndex, this.zoomPercent, this.options.getColumnWidth);
	}

	public getBodyCellElement(rowOffset: number, columnOffset: number): HTMLTableCellElement | null {
		return this.virtualTable.getBodyCell(rowOffset, columnOffset);
	}

	public getColumnHeaderCellElement(columnOffset: number): HTMLElement | null {
		return this.virtualTable.getColumnHeaderCell(columnOffset);
	}

	public forEachBodyCellElement(callback: (cell: HTMLTableCellElement) => void): void {
		this.virtualTable.forEachBodyCell(cell => callback(cell.element));
	}

	public forEachBodyCellInRanges(
		ranges: readonly TableWidgetCellRange[],
		callback: (cell: HTMLTableCellElement, descriptor: TableWidgetBodyCellDescriptor) => void,
	): number {
		const { columnRange, rowRange } = this.virtualTable.getState();
		const visited = new Set<string>();
		let count = 0;
		for (const range of ranges) {
			const startRow = Math.max(rowRange.startIndex, Math.floor(Number(range.startRow)));
			const endRow = Math.min(rowRange.endIndex - 1, Math.floor(Number(range.endRow)));
			const startCol = Math.max(columnRange.startIndex, Math.floor(Number(range.startCol)));
			const endCol = Math.min(columnRange.endIndex - 1, Math.floor(Number(range.endCol)));
			if (
				!Number.isInteger(startRow) ||
				!Number.isInteger(endRow) ||
				!Number.isInteger(startCol) ||
				!Number.isInteger(endCol) ||
				startRow > endRow ||
				startCol > endCol
			) {
				continue;
			}

			for (let rowIndex = startRow; rowIndex <= endRow; rowIndex += 1) {
				const rowOffset = rowIndex - rowRange.startIndex;
				for (let colIndex = startCol; colIndex <= endCol; colIndex += 1) {
					const columnOffset = colIndex - columnRange.startIndex;
					const key = `${rowOffset}:${columnOffset}`;
					if (visited.has(key)) {
						continue;
					}
					const cell = this.virtualTable.getBodyCell(rowOffset, columnOffset);
					if (!cell || cell.hidden) {
						continue;
					}

					visited.add(key);
					count += 1;
					callback(cell, {
						rowIndex,
						rowOffset,
						colIndex,
						columnOffset,
					});
				}
			}
		}

		return count;
	}

	public clearBodyCells(): void {
		this.virtualTable.clearBodyCells();
	}

	public rerenderDirtyBodyCells(
		ranges: readonly TableWidgetDirtyRange[],
		renderVersion: unknown,
	): TableWidgetPatchResult {
		const visibleRanges = this.toVisibleBodyCellRanges(ranges);
		if (visibleRanges.length === 0) {
			return "ignored";
		}

		this.virtualTable.rerenderBodyCells(visibleRanges, renderVersion);
		return "patched";
	}

	public containsBodyTarget(target: EventTarget | null): boolean {
		const targetWindow = this.element.ownerDocument.defaultView;
		return Boolean(targetWindow && target instanceof targetWindow.Node && this.virtualTable.bodyRows.contains(target));
	}

	public containsHeaderTarget(target: EventTarget | null): boolean {
		const targetWindow = this.element.ownerDocument.defaultView;
		return Boolean(targetWindow && target instanceof targetWindow.Node && this.virtualTable.headerContent.contains(target));
	}

	public getViewportClientHeight(): number {
		return this.virtualTable.viewport.clientHeight;
	}

	public setHeaderVisible(visible: boolean): void {
		this.virtualTable.header.hidden = !visible;
		if (!visible) {
			this.endColumnResize(false);
		}
	}

	public isHeaderVisible(): boolean {
		return !this.virtualTable.header.hidden;
	}

	public syncHeaderScroll(): void {
		this.virtualTable.syncHeaderScroll();
		this.syncColumnResizeGuide();
	}

	private syncZoomStyle(): void {
		this.virtualTable.body.style.setProperty(
			"--table-view-zoom",
			String(this.getZoomScale()),
		);
	}

	private onColumnResizeStart(event: PointerEvent): boolean {
		if (
			event.defaultPrevented ||
			this.options.columnResize?.enabled !== true ||
			!this.canStartColumnResizeFromTarget(event.target)
		) {
			return false;
		}

		const colIndex = VirtualTableGridModel.resolveColumnResizeTarget({
			button: event.button,
			clientX: event.clientX,
			columnRange: this.getColumnRange(),
			containerLeft: this.virtualTable.body.getBoundingClientRect().left,
			getColumnWidth: index => this.options.getColumnWidth(index),
			hitSlop: this.options.columnResize.hitSlop,
			scrollLeft: this.virtualTable.getScrollPosition().scrollLeft,
			zoomPercent: this.zoomPercent,
		});
		if (colIndex === null) {
			return false;
		}

		const startGuideLeft = this.virtualTable.getColumnResizeBoundaryLeft(colIndex) ??
			VirtualTableGridModel.resolveColumnResizeGuideLeft({
				colIndex,
				columnRange: this.getColumnRange(),
				getColumnWidth: index => this.options.getColumnWidth(index),
				scrollLeft: this.virtualTable.getScrollPosition().scrollLeft,
				visible: this.isHeaderVisible(),
				zoomPercent: this.zoomPercent,
			});
		if (startGuideLeft === null) {
			return false;
		}

		event.preventDefault();
		event.stopPropagation();
		this.endColumnResize(false);
		const startWidth = this.options.getColumnWidth(colIndex);
		this.columnResizeState = {
			colIndex,
			guideLeft: startGuideLeft,
			hasWidthChange: false,
			startClientX: event.clientX,
			startGuideLeft,
			startWidth,
			width: startWidth,
		};
		this.element.classList.add(TABLE_WIDGET_RESIZING_COLUMN_CLASS);
		this.syncColumnResizeGuide();
		this.startColumnResizeTracking();
		return true;
	}

	private startColumnResizeTracking(): void {
		const targetWindow = this.element.ownerDocument.defaultView;
		if (!targetWindow) {
			this.endColumnResize(false);
			return;
		}

		this.columnResizeStore.add(addDisposableListener(
			targetWindow,
			EventType.POINTER_MOVE,
			event => this.onColumnResizeMove(event as PointerEvent),
		));
		this.columnResizeStore.add(addDisposableListener(targetWindow, EventType.POINTER_UP, () => {
			this.endColumnResize(true);
		}));
		this.columnResizeStore.add(addDisposableListener(targetWindow, "pointercancel", () => {
			this.endColumnResize(false);
		}));
	}

	private onColumnResizeMove(event: PointerEvent): void {
		const state = this.columnResizeState;
		if (!state) {
			return;
		}

		event.preventDefault();
		const width = VirtualTableGridModel.resizeColumnWidth(
			state.startWidth,
			event.clientX - state.startClientX,
			this.zoomPercent,
		);
		const guideLeft = VirtualTableGridModel.resolveColumnResizeDragGuideLeft({
			startGuideLeft: state.startGuideLeft,
			startWidth: state.startWidth,
			visible: this.isHeaderVisible(),
			width,
			zoomPercent: this.zoomPercent,
		});
		const nextState = guideLeft === null
			? state
			: {
				...state,
				guideLeft,
				hasWidthChange: state.hasWidthChange || width !== state.startWidth,
				width,
			};
		this.columnResizeState = nextState;
		if (this.getColumnResizeMode() === "live") {
			this.onDidResizeColumnEmitter.fire({ colIndex: nextState.colIndex, width });
		}
		this.syncColumnResizeGuide();
	}

	private endColumnResize(commit: boolean): void {
		const state = this.columnResizeState;
		if (state) {
			this.columnResizeState = null;
			this.element.classList.remove(TABLE_WIDGET_RESIZING_COLUMN_CLASS);
			if (commit && this.getColumnResizeMode() === "commit" && state.hasWidthChange) {
				this.onDidResizeColumnEmitter.fire({ colIndex: state.colIndex, width: state.width });
			}
		}

		this.syncColumnResizeGuide();
		this.columnResizeStore.clear();
	}

	private getColumnResizeMode(): TableWidgetColumnResizeMode {
		return this.options.columnResize?.mode ?? "commit";
	}

	private syncColumnResizeGuide(): void {
		this.virtualTable.syncColumnResizeGuide(this.columnResizeState?.guideLeft ?? null);
	}

	private getColumnRange(): TableWidgetColumnRange {
		return this.virtualTable.getState().columnRange;
	}

	private canStartColumnResizeFromTarget(target: EventTarget | null): boolean {
		const targetWindow = this.element.ownerDocument.defaultView;
		if (!targetWindow || !(target instanceof targetWindow.Element)) {
			return true;
		}

		return !target.closest("button,input,select,textarea,a,[contenteditable='true'],[role='button']");
	}

	private toVisibleBodyCellRanges(
		dirtyRanges: readonly TableWidgetDirtyRange[],
	): TableWidgetCellRange[] {
		const state = this.virtualTable.getState();
		const visibleRowStart = state.rowRange.startIndex;
		const visibleRowEnd = state.rowRange.endIndex;
		const visibleColStart = state.columnRange.startIndex;
		const visibleColEnd = state.columnRange.endIndex;
		const ranges: TableWidgetCellRange[] = [];
		for (const dirtyRange of dirtyRanges) {
			const startRow = Math.max(visibleRowStart, dirtyRange.startRow ?? visibleRowStart);
			const endRow = Math.min(visibleRowEnd, dirtyRange.endRow ?? visibleRowEnd);
			const startCol = Math.max(visibleColStart, dirtyRange.startCol ?? visibleColStart);
			const endCol = Math.min(visibleColEnd, dirtyRange.endCol ?? visibleColEnd);
			if (startRow >= endRow || startCol >= endCol) {
				continue;
			}

			ranges.push({
				startRow,
				endRow: endRow - 1,
				startCol,
				endCol: endCol - 1,
			});
		}

		return ranges;
	}
}

function clampTableWidgetZoomPercent(zoomPercent: number): number {
	return Math.min(
		TABLE_WIDGET_MAX_ZOOM_PERCENT,
		Math.max(TABLE_WIDGET_MIN_ZOOM_PERCENT, Math.floor(Number(zoomPercent) || 0)),
	);
}

function toTableWidgetSize(options: TableWidgetRenderOptions): TableWidgetSize {
	return {
		columnCount: toSafeCount(options.columnCount),
		rowCount: toSafeCount(options.rowCount),
	};
}

function toSafeCount(value: unknown): number {
	const count = Math.floor(Number(value));
	return Number.isFinite(count) && count > 0 ? count : 0;
}

function isTableWidgetSizeEqual(first: TableWidgetSize, second: TableWidgetSize): boolean {
	return first.columnCount === second.columnCount &&
		first.rowCount === second.rowCount;
}

function addRootClassName(element: HTMLElement, className: string | undefined): void {
	if (!className) {
		return;
	}

	for (const name of className.split(/\s+/g)) {
		if (name) {
			element.classList.add(name);
		}
	}
}
