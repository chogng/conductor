/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { addDisposableListener, EventType } from "src/cs/base/browser/dom";
import { Emitter, type Event } from "src/cs/base/common/event";
import { DisposableStore, type IDisposable } from "src/cs/base/common/lifecycle";
import {
	VirtualTable,
	VirtualTableGridModel,
	type VirtualTableCellRange,
	type VirtualTableOptions,
	type VirtualTableRenderer,
	type VirtualTableRenderOptions,
	type VirtualTableScrollEvent,
	type VirtualTableState,
	type VirtualTableVisibleRangeChangeEvent,
} from "src/cs/base/browser/ui/table/virtualTable";

import "src/cs/base/browser/ui/table/table.css";

export type TableWidgetRenderer = VirtualTableRenderer;

export type TableWidgetOptions = VirtualTableOptions & {
	readonly className?: string;
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
	public readonly onDidChangeVisibleRange: Event<VirtualTableVisibleRangeChangeEvent>;
	public readonly onDidScroll: Event<VirtualTableScrollEvent>;

	private readonly disposables = new DisposableStore();
	private readonly onDidClickBodyEmitter = this.disposables.add(new Emitter<MouseEvent>());
	private readonly onDidClickHeaderEmitter = this.disposables.add(new Emitter<MouseEvent>());
	private readonly onDidPointerDownBodyEmitter = this.disposables.add(new Emitter<PointerEvent>());
	private readonly onDidPointerDownHeaderEmitter = this.disposables.add(new Emitter<PointerEvent>());
	private readonly virtualTable: VirtualTable;

	public readonly onDidClickBody = this.onDidClickBodyEmitter.event;
	public readonly onDidClickHeader = this.onDidClickHeaderEmitter.event;
	public readonly onDidPointerDownBody = this.onDidPointerDownBodyEmitter.event;
	public readonly onDidPointerDownHeader = this.onDidPointerDownHeaderEmitter.event;

	public constructor(options: TableWidgetOptions) {
		const { className, ...virtualOptions } = options;
		this.virtualTable = this.disposables.add(new VirtualTable(virtualOptions));
		this.element = this.virtualTable.element;
		this.onDidChangeVisibleRange = this.virtualTable.onDidChangeVisibleRange;
		this.onDidScroll = this.virtualTable.onDidScroll;
		addRootClassName(this.element, className);
		this.disposables.add(addDisposableListener(this.virtualTable.headerContent, EventType.CLICK, event => {
			this.onDidClickHeaderEmitter.fire(event as MouseEvent);
		}));
		this.disposables.add(addDisposableListener(this.virtualTable.headerContent, EventType.POINTER_DOWN, event => {
			this.onDidPointerDownHeaderEmitter.fire(event as PointerEvent);
		}));
		this.disposables.add(addDisposableListener(this.virtualTable.bodyRows, EventType.CLICK, event => {
			this.onDidClickBodyEmitter.fire(event as MouseEvent);
		}));
		this.disposables.add(addDisposableListener(this.virtualTable.bodyRows, EventType.POINTER_DOWN, event => {
			this.onDidPointerDownBodyEmitter.fire(event as PointerEvent);
		}, { passive: false }));
	}

	public dispose(): void {
		this.disposables.dispose();
	}

	public layout(): void {
		this.virtualTable.layout();
	}

	public render(options: VirtualTableRenderOptions): boolean {
		return this.virtualTable.render(options);
	}

	public getState(): VirtualTableState {
		return this.virtualTable.getState();
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
		zoomPercent: number,
		getColumnWidth: (colIndex: number) => number,
	): boolean {
		return this.virtualTable.revealCell(rowIndex, colIndex, zoomPercent, getColumnWidth);
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

	public getBodyLeft(): number {
		return this.virtualTable.body.getBoundingClientRect().left;
	}

	public getScrollLeft(): number {
		return this.virtualTable.viewport.scrollLeft;
	}

	public getViewportClientHeight(): number {
		return this.virtualTable.viewport.clientHeight;
	}

	public setBodyStyleProperty(name: string, value: string): void {
		this.virtualTable.body.style.setProperty(name, value);
	}

	public setHeaderVisible(visible: boolean): void {
		this.virtualTable.header.hidden = !visible;
	}

	public isHeaderVisible(): boolean {
		return !this.virtualTable.header.hidden;
	}

	public getColumnResizeBoundaryLeft(colIndex: number): number | null {
		return this.virtualTable.getColumnResizeBoundaryLeft(colIndex);
	}

	public syncColumnResizeGuide(left: number | null): void {
		this.virtualTable.syncColumnResizeGuide(left);
	}

	public syncHeaderScroll(): void {
		this.virtualTable.syncHeaderScroll();
	}

	private toVisibleBodyCellRanges(
		dirtyRanges: readonly TableWidgetDirtyRange[],
	): VirtualTableCellRange[] {
		const state = this.virtualTable.getState();
		const visibleRowStart = state.rowRange.startIndex;
		const visibleRowEnd = state.rowRange.endIndex;
		const visibleColStart = state.columnRange.startIndex;
		const visibleColEnd = state.columnRange.endIndex;
		const ranges: VirtualTableCellRange[] = [];
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

export { VirtualTableGridModel };

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
