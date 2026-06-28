/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { addDisposableListener, EventType, getWindow, isEditableElement } from "src/cs/base/browser/dom";
import { DomEmitter } from "src/cs/base/browser/event";
import { StandardKeyboardEvent } from "src/cs/base/browser/keyboardEvent";
import { StandardMouseEvent } from "src/cs/base/browser/mouseEvent";
import type { IManagedHover, IManagedHoverContent, IManagedHoverOptions } from "src/cs/base/browser/ui/hover/hover";
import { getBaseLayerHoverDelegate } from "src/cs/base/browser/ui/hover/hoverDelegate";
import { VirtualTable, VirtualTableGridModel } from "src/cs/base/browser/ui/table/virtualTable";
import { Emitter, Event as EventUtil, type Event } from "src/cs/base/common/event";
import { KeyCode } from "src/cs/base/common/keyCodes";
import { DisposableStore, type IDisposable } from "src/cs/base/common/lifecycle";
import type * as Table from "src/cs/base/browser/ui/table/table";
import { TABLE_WIDGET_ZOOM_OPTIONS } from "src/cs/base/browser/ui/table/table";

import "src/cs/base/browser/ui/table/table.css";

const TABLE_WIDGET_RESIZING_COLUMN_CLASS = "table_view--resizing_column";
const TABLE_WIDGET_COLUMN_RESIZE_HANDLE_CLASS = "table_view_column_resize_handle";

type TableWidgetColumnResizeState = {
	readonly colIndex: number;
	readonly guideLeft: number;
	readonly hasWidthChange: boolean;
	readonly startClientX: number;
	readonly startGuideLeft: number;
	readonly startWidth: number;
	readonly width: number;
};

type TableWidgetCellEditState = Table.ITableCellPosition & {
	readonly cell: HTMLTableCellElement;
	readonly input: HTMLInputElement;
};

type AppliedTableCellState = {
	readonly activeCell: Table.ITableCellPosition | null;
	readonly highlightedColumns: Set<number>;
	readonly selectedColumns: Set<number>;
	readonly selectedRanges: readonly Table.ITableCellRange[];
};

class TableBodyCellTraits {
	private appliedActive?: boolean;
	private appliedHighlighted?: boolean;
	private appliedHoverContent?: IManagedHoverContent;
	private appliedHovered?: boolean;
	private appliedSelected?: boolean;
	private appliedSelectionFrame?: string;
	private hover: IManagedHover | null = null;

	public constructor(private readonly element: HTMLElement) {}

	public set(state: Table.ITableBodyCellTraitState): void {
		this.setActive(state.active);
		this.setSelected(state.selected);
		this.setHighlighted(state.highlighted);
		this.setSelectionFrame(state.selectionFrame);
	}

	public setHovered(hovered: boolean): void {
		if (this.appliedHovered === hovered) {
			return;
		}

		this.element.dataset.hovered = hovered ? "true" : "false";
		this.appliedHovered = hovered;
	}

	public setHoverContent(content: IManagedHoverContent, options?: IManagedHoverOptions): void {
		if (this.appliedHoverContent === content) {
			return;
		}

		if (content) {
			if (this.hover) {
				this.hover.update(content, options);
			} else {
				this.hover = getBaseLayerHoverDelegate().setupManagedHover(this.element, content, options);
			}
		} else {
			this.hover?.dispose();
			this.hover = null;
		}
		this.appliedHoverContent = content;
	}

	public dispose(): void {
		this.hover?.dispose();
		this.hover = null;
	}

	private setActive(active: boolean): void {
		if (this.appliedActive === active) {
			return;
		}

		this.element.dataset.active = active ? "true" : "false";
		this.appliedActive = active;
	}

	private setSelected(selected: boolean): void {
		if (this.appliedSelected === selected) {
			return;
		}

		this.element.dataset.selected = selected ? "true" : "false";
		this.appliedSelected = selected;
	}

	private setHighlighted(highlighted: boolean): void {
		if (this.appliedHighlighted === highlighted) {
			return;
		}

		this.element.dataset.highlighted = highlighted ? "true" : "false";
		this.appliedHighlighted = highlighted;
	}

	private setSelectionFrame(selectionFrame: Table.ITableBodyCellTraitState["selectionFrame"]): void {
		const serialized = serializeTableSelectionFrame(selectionFrame);
		if (this.appliedSelectionFrame === serialized) {
			return;
		}

		this.element.dataset.selectionFrame = serialized === "" ? "false" : "true";
		this.element.style.setProperty("--table-view-selection-frame-top", selectionFrame.top ? "2px" : "0");
		this.element.style.setProperty("--table-view-selection-frame-right", selectionFrame.right ? "2px" : "0");
		this.element.style.setProperty("--table-view-selection-frame-bottom", selectionFrame.bottom ? "2px" : "0");
		this.element.style.setProperty("--table-view-selection-frame-left", selectionFrame.left ? "2px" : "0");
		this.appliedSelectionFrame = serialized;
	}
}

class TableColumnHeaderTraits {
	private appliedHighlighted?: boolean;
	private appliedHovered?: boolean;
	private appliedSelected?: boolean;

	public constructor(private readonly element: HTMLElement) {}

	public set(state: Table.ITableColumnHeaderTraitState): void {
		this.setSelected(state.selected);
		this.setHighlighted(state.highlighted);
	}

	public setHovered(hovered: boolean): void {
		if (this.appliedHovered === hovered) {
			return;
		}

		this.element.dataset.hovered = hovered ? "true" : "false";
		this.appliedHovered = hovered;
	}

	private setSelected(selected: boolean): void {
		if (this.appliedSelected === selected) {
			return;
		}

		this.element.dataset.selected = selected ? "true" : "false";
		this.element.querySelector<HTMLButtonElement>("button")?.setAttribute("aria-pressed", selected ? "true" : "false");
		this.appliedSelected = selected;
	}

	private setHighlighted(highlighted: boolean): void {
		if (this.appliedHighlighted === highlighted) {
			return;
		}

		this.element.dataset.highlighted = highlighted ? "true" : "false";
		this.appliedHighlighted = highlighted;
	}
}

/**
 * Stable base table entry point for workbench consumers, mirroring the upstream
 * shape where callers depend on one widget owner instead of structure class
 * maps. Feature code can add one root class, subscribe to events, and provide
 * renderers for domain content.
 *
 * The pooled DOM skeleton and its CSS hooks are owned by the base table.
 */
export class TableWidget<TBodyTemplateData = unknown, TColumnHeaderTemplateData = unknown> implements IDisposable {
	public readonly element: HTMLElement;
	public readonly onDidChangeVisibleRange: Event<Table.ITableVisibleRangeChangeEvent>;
	public readonly onDidScroll: Event<Table.ITableScrollEvent>;
	public readonly onDidChangeSize: Event<Table.ITableSize>;
	public readonly onDidChangeZoom: Event<number>;
	public readonly onDidResizeColumn: Event<Table.ITableColumnResizeEvent>;
	public readonly onDidCommitCellEdit: Event<Table.ITableCellEditCommitEvent>;
	public readonly onDidClickBody: Event<Table.ITableBodyMouseEvent>;
	public readonly onDidClickHeader: Event<Table.ITableColumnHeaderMouseEvent>;
	public readonly onDidNavigateKeyboard: Event<Table.ITableKeyboardNavigationEvent>;
	public readonly onDidPointerDownBody: Event<Table.ITableBodyMouseEvent<PointerEvent>>;

	private readonly disposables = new DisposableStore();
	private readonly cellEditStore = this.disposables.add(new DisposableStore());
	private readonly columnResizeStore = this.disposables.add(new DisposableStore());
	private readonly onDidChangeSizeEmitter = this.disposables.add(new Emitter<Table.ITableSize>());
	private readonly onDidChangeZoomEmitter = this.disposables.add(new Emitter<number>());
	private readonly onDidResizeColumnEmitter = this.disposables.add(new Emitter<Table.ITableColumnResizeEvent>());
	private readonly onDidCommitCellEditEmitter = this.disposables.add(new Emitter<Table.ITableCellEditCommitEvent>());
	private readonly onDidNavigateKeyboardEmitter = this.disposables.add(new Emitter<Table.ITableKeyboardNavigationEvent>());
	private readonly bodyCellTraits = new Map<TBodyTemplateData, TableBodyCellTraits>();
	private readonly bodyCellTraitsByElement = new WeakMap<HTMLTableCellElement, TableBodyCellTraits>();
	private readonly columnHeaderTraits = new Map<TColumnHeaderTemplateData, TableColumnHeaderTraits>();
	private readonly columnHeaderTraitsByElement = new WeakMap<HTMLElement, TableColumnHeaderTraits>();
	private columnResizeState: TableWidgetColumnResizeState | null = null;
	private cellEditState: TableWidgetCellEditState | null = null;
	private cellState: Table.ITableCellState = {};
	private selectionAnchorCell: Table.ITableCellPosition | null = null;
	private selectionFocusCell: Table.ITableCellPosition | null = null;
	private appliedCellState: AppliedTableCellState | null = null;
	private hoveredBodyCellTraits: TableBodyCellTraits | null = null;
	private hoveredColumnHeaderTraits: TableColumnHeaderTraits | null = null;
	private lastRenderOptions: Table.ITableRenderOptions | null = null;
	private size: Table.ITableSize = { columnCount: 0, rowCount: 0 };
	private readonly virtualTable: VirtualTable<TBodyTemplateData, TColumnHeaderTemplateData>;
	private zoomPercent: number = TABLE_WIDGET_ZOOM_OPTIONS.defaultPercent;

	public constructor(private readonly options: Table.ITableWidgetOptions<TBodyTemplateData, TColumnHeaderTemplateData>) {
		const { className, ...virtualOptions } = options;
		this.virtualTable = this.disposables.add(new VirtualTable<TBodyTemplateData, TColumnHeaderTemplateData>({
			...virtualOptions,
			renderer: this.createRenderer(options.renderer),
		}));
		this.element = this.virtualTable.element;
		this.onDidChangeVisibleRange = this.virtualTable.onDidChangeVisibleRange;
		this.onDidScroll = this.virtualTable.onDidScroll;
		this.onDidChangeSize = this.onDidChangeSizeEmitter.event;
		this.onDidChangeZoom = this.onDidChangeZoomEmitter.event;
		this.onDidResizeColumn = this.onDidResizeColumnEmitter.event;
		this.onDidCommitCellEdit = this.onDidCommitCellEditEmitter.event;
		this.onDidClickBody = this.createBodyClickEvent();
		this.onDidClickHeader = this.createColumnHeaderClickEvent();
		this.onDidNavigateKeyboard = this.onDidNavigateKeyboardEmitter.event;
		this.onDidPointerDownBody = this.createBodyPointerDownEvent();
		this.disposables.add(this.virtualTable.onDidChangeVisibleRange(() => {
			this.clearHoveredTraits();
			this.resetAppliedCellState();
			this.syncCellState();
		}));
		this.syncZoomStyle();
		addRootClassName(this.element, className);
		this.disposables.add(addDisposableListener(this.virtualTable.headerContent, EventType.POINTER_DOWN, event => {
			this.onColumnResizeStart(event as PointerEvent);
		}));
		this.disposables.add(addDisposableListener(this.virtualTable.headerContent, EventType.POINTER_MOVE, event => {
			this.onHeaderPointerMove(event as PointerEvent);
		}));
		this.disposables.add(addDisposableListener(this.virtualTable.headerContent, "pointerleave", () => {
			this.setHoveredColumnHeaderTraits(null);
		}));
		this.disposables.add(addDisposableListener(this.virtualTable.bodyRows, EventType.DBLCLICK, event => {
			this.onBodyDoubleClick(event as MouseEvent);
		}));
		this.disposables.add(addDisposableListener(this.virtualTable.bodyRows, EventType.POINTER_MOVE, event => {
			this.onBodyPointerMove(event as PointerEvent);
		}));
		this.disposables.add(addDisposableListener(this.virtualTable.bodyRows, "pointerleave", () => {
			this.setHoveredBodyCellTraits(null);
		}));
		this.disposables.add(addDisposableListener(this.element, EventType.KEY_DOWN, event => {
			this.onKeyDown(event as KeyboardEvent);
		}));
	}

	public dispose(): void {
		this.cancelCellEdit();
		this.endColumnResize(false);
		this.disposables.dispose();
	}

	public layout(): void {
		this.virtualTable.layout();
	}

	public render(options: Table.ITableRenderOptions): boolean {
		this.cancelCellEdit();
		this.clearHoveredTraits();
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
		const changed = this.virtualTable.render({
			...options,
			zoomPercent: this.zoomPercent,
		});
		if (changed) {
			this.resetAppliedCellState();
		}
		this.syncCellState();
		return changed;
	}

	public getState(): Table.ITableState {
		return this.virtualTable.getState();
	}

	public getSize(): Table.ITableSize {
		return this.size;
	}

	public getZoomPercent(): number {
		return this.zoomPercent;
	}

	public getZoomScale(): number {
		return VirtualTableGridModel.getZoomScale(this.zoomPercent);
	}

	public setCellState(state: Table.ITableCellState): void {
		this.cellState = state;
		this.syncNavigationStateFromCellState();
		this.syncCellState();
	}

	public selectCell(cell: Table.ITableCellPosition | null): Table.ITableCellSelectionTarget | null {
		if (!cell) {
			this.selectionAnchorCell = null;
			this.selectionFocusCell = null;
			this.cellState = {
				...this.cellState,
				activeCell: null,
				selectedRanges: [],
			};
			this.syncCellState();
			return { kind: "cell", cell: null };
		}

		const normalizedCell = normalizeCellPosition(cell, this.size);
		if (!normalizedCell) {
			return null;
		}

		this.selectionAnchorCell = normalizedCell;
		this.selectionFocusCell = normalizedCell;
		this.cellState = {
			...this.cellState,
			activeCell: normalizedCell,
			selectedRanges: [],
		};
		this.syncCellState();
		return { kind: "cell", cell: normalizedCell };
	}

	public selectRangeToCell(cell: Table.ITableCellPosition): Table.ITableCellSelectionTarget | null {
		const focusCell = normalizeCellPosition(cell, this.size);
		if (!focusCell) {
			return null;
		}

		const anchorCell = normalizeCellPosition(this.selectionAnchorCell, this.size) ??
			this.getNavigationCell() ??
			focusCell;
		const range = VirtualTableGridModel.resolveCellRange(anchorCell, focusCell);
		this.selectionAnchorCell = anchorCell;
		this.selectionFocusCell = focusCell;
		this.cellState = {
			...this.cellState,
			activeCell: focusCell,
			selectedRanges: [range],
		};
		this.syncCellState();
		return {
			kind: "range",
			anchorCell,
			focusCell,
			range,
		};
	}

	public setBodyCellTraits(templateData: TBodyTemplateData, state: Table.ITableBodyCellTraitState): void {
		const traits = this.bodyCellTraits.get(templateData);
		if (!traits) {
			throw new Error("Unknown table body cell template data");
		}

		traits.set(state);
	}

	public setBodyCellHoverContent(
		templateData: TBodyTemplateData,
		content: IManagedHoverContent,
		options?: IManagedHoverOptions,
	): void {
		const traits = this.bodyCellTraits.get(templateData);
		if (!traits) {
			throw new Error("Unknown table body cell template data");
		}

		traits.setHoverContent(content, options);
	}

	public setBodyCellElementHoverContent(
		cell: HTMLTableCellElement,
		content: IManagedHoverContent,
		options?: IManagedHoverOptions,
	): void {
		const traits = this.bodyCellTraitsByElement.get(cell);
		if (!traits) {
			throw new Error("Unknown table body cell element");
		}

		traits.setHoverContent(content, options);
	}

	public setColumnHeaderTraits(templateData: TColumnHeaderTemplateData, state: Table.ITableColumnHeaderTraitState): void {
		const traits = this.columnHeaderTraits.get(templateData);
		if (!traits) {
			throw new Error("Unknown table column header template data");
		}

		traits.set(state);
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
		return this.setZoomPercent(TABLE_WIDGET_ZOOM_OPTIONS.defaultPercent);
	}

	public zoomIn(): boolean {
		return this.setZoomPercent(this.zoomPercent + TABLE_WIDGET_ZOOM_OPTIONS.stepPercent);
	}

	public zoomOut(): boolean {
		return this.setZoomPercent(this.zoomPercent - TABLE_WIDGET_ZOOM_OPTIONS.stepPercent);
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
		this.cancelCellEdit();
		this.clearHoveredTraits();
		this.virtualTable.replaceViewportContent(element);
	}

	public resetScrollTop(): void {
		this.cancelCellEdit();
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

	public getBodyCellTemplateData(rowOffset: number, columnOffset: number): TBodyTemplateData | null {
		return this.virtualTable.getBodyCellTemplateData(rowOffset, columnOffset);
	}

	public getColumnHeaderTemplateData(columnOffset: number): TColumnHeaderTemplateData | null {
		return this.virtualTable.getColumnHeaderTemplateData(columnOffset);
	}

	public getBodyCellPositionFromTarget(target: EventTarget | null): Table.ITableCellPosition | null {
		const targetElement = this.getElementFromEventTarget(target);
		if (!targetElement) {
			return null;
		}

		const cell = targetElement.closest<HTMLTableCellElement>(".table_view_cell");
		if (!cell || cell.hidden || !this.virtualTable.bodyRows.contains(cell)) {
			return null;
		}

		const rowIndex = Number(cell.dataset.rowIndex);
		const colIndex = Number(cell.dataset.colIndex);
		if (
			!Number.isInteger(rowIndex) ||
			rowIndex < 0 ||
			!Number.isInteger(colIndex) ||
			colIndex < 0
		) {
			return null;
		}

		return { rowIndex, colIndex };
	}

	public getBodyCellPositionFromPoint(clientX: number, clientY: number): Table.ITableCellPosition | null {
		if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) {
			return null;
		}

		return this.getBodyCellPositionFromTarget(this.element.ownerDocument.elementFromPoint(clientX, clientY));
	}

	public getBodyCellPositionFromMouseEvent(
		event: Pick<MouseEvent, "clientX" | "clientY" | "target">,
	): Table.ITableCellPosition | null {
		return this.getBodyCellPositionFromTarget(event.target) ??
			this.getBodyCellPositionFromPoint(event.clientX, event.clientY);
	}

	public getColumnHeaderPositionFromTarget(target: EventTarget | null): Table.ITableColumnHeaderPosition | null {
		const targetElement = this.getElementFromEventTarget(target);
		if (!targetElement) {
			return null;
		}

		const cell = targetElement.closest<HTMLElement>(".table_view_grid_header_cell");
		if (!cell || cell.hidden || !this.virtualTable.headerContent.contains(cell)) {
			return null;
		}

		const ariaColIndex = Number(cell.getAttribute("aria-colindex"));
		if (!Number.isInteger(ariaColIndex) || ariaColIndex <= 0) {
			return null;
		}

		return { colIndex: ariaColIndex - 1 };
	}

	public forEachBodyCellElement(callback: (cell: HTMLTableCellElement) => void): void {
		this.virtualTable.forEachBodyCell(cell => callback(cell.element));
	}

	public forEachBodyCellTemplateData(callback: (templateData: TBodyTemplateData) => void): void {
		this.virtualTable.forEachBodyCell(cell => callback(cell.templateData));
	}

	public forEachBodyCellInRanges(
		ranges: readonly Table.ITableCellRange[],
		callback: (templateData: TBodyTemplateData, descriptor: Table.ITableBodyCellDescriptor) => void,
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
					const templateData = this.virtualTable.getBodyCellTemplateData(rowOffset, columnOffset);
					if (templateData === null) {
						continue;
					}

					visited.add(key);
					count += 1;
					callback(templateData, {
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
		this.cancelCellEdit();
		this.virtualTable.clearBodyCells();
	}

	public rerenderDirtyBodyCells(
		ranges: readonly Table.ITableDirtyRange[],
		renderVersion: unknown,
	): Table.ITablePatchResult {
		this.cancelCellEditInDirtyRanges(ranges);
		const visibleRanges = this.toVisibleBodyCellRanges(ranges);
		if (visibleRanges.length === 0) {
			return "ignored";
		}

		this.virtualTable.rerenderBodyCells(visibleRanges, renderVersion);
		return "patched";
	}

	public rerenderDirtyColumnHeaders(
		ranges: readonly Table.ITableDirtyRange[],
		renderVersion: unknown,
	): Table.ITablePatchResult {
		if (!this.isHeaderVisible()) {
			return "ignored";
		}

		const columnOffsets = this.toVisibleColumnOffsets(ranges);
		if (columnOffsets.length === 0) {
			return "ignored";
		}

		this.virtualTable.rerenderColumnHeaders(columnOffsets, renderVersion);
		return "patched";
	}

	public containsHeaderTarget(target: EventTarget | null): boolean {
		const targetWindow = this.element.ownerDocument.defaultView;
		return Boolean(targetWindow && target instanceof targetWindow.Node && this.virtualTable.headerContent.contains(target));
	}

	public getViewportClientHeight(): number {
		return this.virtualTable.viewport.clientHeight;
	}

	public setHeaderVisible(visible: boolean): void {
		const hidden = !visible;
		if (this.virtualTable.header.hidden !== hidden) {
			this.virtualTable.header.hidden = hidden;
		}
		if (!visible) {
			this.cancelCellEdit();
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

	public startCellEdit(rowIndex: number, colIndex: number): boolean {
		const cellEditing = this.options.cellEditing;
		if (cellEditing?.enabled !== true) {
			return false;
		}

		const normalizedRowIndex = Math.floor(Number(rowIndex));
		const normalizedColIndex = Math.floor(Number(colIndex));
		if (!Number.isInteger(normalizedRowIndex) || !Number.isInteger(normalizedColIndex)) {
			return false;
		}

		const { columnRange, rowRange } = this.virtualTable.getState();
		if (
			normalizedRowIndex < rowRange.startIndex ||
			normalizedRowIndex >= rowRange.endIndex ||
			normalizedColIndex < columnRange.startIndex ||
			normalizedColIndex >= columnRange.endIndex
		) {
			return false;
		}

		const rowOffset = normalizedRowIndex - rowRange.startIndex;
		const columnOffset = normalizedColIndex - columnRange.startIndex;
		const cell = this.virtualTable.getBodyCell(rowOffset, columnOffset);
		if (!cell || cell.hidden) {
			return false;
		}

		this.cancelCellEdit();
		const input = cell.ownerDocument.createElement("input");
		input.className = "table_view_cell_editor";
		input.type = "text";
		input.value = cellEditing.getInitialValue({
			rowIndex: normalizedRowIndex,
			colIndex: normalizedColIndex,
		});
		input.setAttribute("aria-label", "Edit cell");
		cell.dataset.editing = "true";
		cell.append(input);
		this.cellEditState = {
			cell,
			input,
			rowIndex: normalizedRowIndex,
			colIndex: normalizedColIndex,
		};
		this.cellEditStore.add(addDisposableListener(input, EventType.KEY_DOWN, event => {
			this.onCellEditKeyDown(event as KeyboardEvent);
		}));
		this.cellEditStore.add(addDisposableListener(input, EventType.BLUR, () => {
			this.commitCellEdit();
		}));
		input.focus();
		input.select();
		return true;
	}

	public commitCellEdit(): boolean {
		const state = this.cellEditState;
		if (!state) {
			return false;
		}

		const value = state.input.value;
		this.clearCellEditState();
		this.onDidCommitCellEditEmitter.fire({
			rowIndex: state.rowIndex,
			colIndex: state.colIndex,
			value,
		});
		return true;
	}

	public cancelCellEdit(): boolean {
		const state = this.cellEditState;
		if (!state) {
			return false;
		}

		this.clearCellEditState();
		return true;
	}

	private createRenderer(
		renderer: Table.ITableWidgetRenderer<TBodyTemplateData, TColumnHeaderTemplateData>,
	): Table.ITableWidgetRenderer<TBodyTemplateData, TColumnHeaderTemplateData> {
		return {
			clearBodyCell: templateData => {
				this.bodyCellTraits.get(templateData)?.setHoverContent(undefined);
				renderer.clearBodyCell(templateData);
			},
			disposeBodyCellTemplate: templateData => {
				const traits = this.bodyCellTraits.get(templateData);
				if (this.hoveredBodyCellTraits === traits) {
					this.setHoveredBodyCellTraits(null);
				}
				traits?.dispose();
				this.bodyCellTraits.delete(templateData);
				renderer.disposeBodyCellTemplate(templateData);
			},
			disposeColumnHeaderTemplate: templateData => {
				const traits = this.columnHeaderTraits.get(templateData);
				if (this.hoveredColumnHeaderTraits === traits) {
					this.setHoveredColumnHeaderTraits(null);
				}
				this.columnHeaderTraits.delete(templateData);
				renderer.disposeColumnHeaderTemplate?.(templateData);
			},
			renderBodyCell: (templateData, descriptor) => {
				renderer.renderBodyCell(templateData, descriptor);
			},
			renderBodyCellContent: (templateData, descriptor) => {
				renderer.renderBodyCellContent(templateData, descriptor);
			},
			renderBodyCellTemplate: (cell, content) => {
				const templateData = renderer.renderBodyCellTemplate(cell, content);
				const traits = new TableBodyCellTraits(cell);
				this.bodyCellTraits.set(templateData, traits);
				this.bodyCellTraitsByElement.set(cell, traits);
				return templateData;
			},
			renderColumnHeader: (templateData, descriptor) => {
				renderer.renderColumnHeader(templateData, descriptor);
			},
			renderColumnHeaderTemplate: cell => {
				const templateData = renderer.renderColumnHeaderTemplate(cell);
				const traits = new TableColumnHeaderTraits(cell);
				this.columnHeaderTraits.set(templateData, traits);
				this.columnHeaderTraitsByElement.set(cell, traits);
				return templateData;
			},
			renderCorner: cell => {
				renderer.renderCorner?.(cell);
			},
			renderRowHeader: (cell, descriptor) => {
				renderer.renderRowHeader(cell, descriptor);
			},
		};
	}

	private createBodyClickEvent(): Event<Table.ITableBodyMouseEvent> {
		const emitter = this.disposables.add(new DomEmitter(this.virtualTable.bodyRows, "click"));
		return EventUtil.map(emitter.event, event => this.toBodyMouseEvent(event));
	}

	private createBodyPointerDownEvent(): Event<Table.ITableBodyMouseEvent<PointerEvent>> {
		const emitter = this.disposables.add(new DomEmitter(this.virtualTable.bodyRows, "pointerdown"));
		return EventUtil.map(emitter.event, event => this.toBodyMouseEvent(event));
	}

	private createColumnHeaderClickEvent(): Event<Table.ITableColumnHeaderMouseEvent> {
		const emitter = this.disposables.add(new DomEmitter(this.virtualTable.headerContent, "click"));
		return EventUtil.map(emitter.event, event => this.toColumnHeaderMouseEvent(event));
	}

	private onBodyPointerMove(event: PointerEvent): void {
		this.setHoveredBodyCellTraits(this.getBodyCellTraitsFromTarget(event.target));
	}

	private onHeaderPointerMove(event: PointerEvent): void {
		this.setHoveredColumnHeaderTraits(this.getColumnHeaderTraitsFromTarget(event.target));
	}

	private toBodyMouseEvent<T extends MouseEvent>(browserEvent: T): Table.ITableBodyMouseEvent<T> {
		return {
			browserEvent,
			cell: this.getBodyCellPositionFromMouseEvent(browserEvent),
			mouseEvent: new StandardMouseEvent(getWindow(this.element), browserEvent),
		};
	}

	private toColumnHeaderMouseEvent<T extends MouseEvent>(browserEvent: T): Table.ITableColumnHeaderMouseEvent<T> {
		return {
			browserEvent,
			column: this.getColumnHeaderPositionFromTarget(browserEvent.target),
			mouseEvent: new StandardMouseEvent(getWindow(this.element), browserEvent),
		};
	}

	private clearHoveredTraits(): void {
		this.setHoveredBodyCellTraits(null);
		this.setHoveredColumnHeaderTraits(null);
	}

	private setHoveredBodyCellTraits(traits: TableBodyCellTraits | null): void {
		if (this.hoveredBodyCellTraits === traits) {
			return;
		}

		this.hoveredBodyCellTraits?.setHovered(false);
		this.hoveredBodyCellTraits = traits;
		this.hoveredBodyCellTraits?.setHovered(true);
	}

	private setHoveredColumnHeaderTraits(traits: TableColumnHeaderTraits | null): void {
		if (this.hoveredColumnHeaderTraits === traits) {
			return;
		}

		this.hoveredColumnHeaderTraits?.setHovered(false);
		this.hoveredColumnHeaderTraits = traits;
		this.hoveredColumnHeaderTraits?.setHovered(true);
	}

	private getBodyCellTraitsFromTarget(target: EventTarget | null): TableBodyCellTraits | null {
		const targetElement = this.getElementFromEventTarget(target);
		if (!targetElement) {
			return null;
		}

		const cell = targetElement.closest<HTMLTableCellElement>(".table_view_cell");
		if (!cell || cell.hidden || !this.virtualTable.bodyRows.contains(cell)) {
			return null;
		}

		return this.bodyCellTraitsByElement.get(cell) ?? null;
	}

	private getColumnHeaderTraitsFromTarget(target: EventTarget | null): TableColumnHeaderTraits | null {
		const targetElement = this.getElementFromEventTarget(target);
		if (!targetElement) {
			return null;
		}

		const cell = targetElement.closest<HTMLElement>(".table_view_grid_header_cell");
		if (!cell || cell.hidden || !this.virtualTable.headerContent.contains(cell)) {
			return null;
		}

		return this.columnHeaderTraitsByElement.get(cell) ?? null;
	}

	private getElementFromEventTarget(target: EventTarget | null): Element | null {
		const targetWindow = this.element.ownerDocument.defaultView;
		if (!targetWindow || !(target instanceof targetWindow.Node)) {
			return null;
		}

		return target instanceof targetWindow.Element ? target : target.parentElement;
	}

	private syncZoomStyle(): void {
		this.virtualTable.body.style.setProperty(
			"--table-view-zoom",
			String(this.getZoomScale()),
		);
	}

	private onBodyDoubleClick(event: MouseEvent): void {
		const target = this.getBodyCellPositionFromTarget(event.target);
		if (!target) {
			return;
		}

		if (!this.startCellEdit(target.rowIndex, target.colIndex)) {
			return;
		}

		event.preventDefault();
		event.stopPropagation();
	}

	private onCellEditKeyDown(event: KeyboardEvent): void {
		const keyboardEvent = new StandardKeyboardEvent(event);
		if (keyboardEvent.keyCode === KeyCode.Enter) {
			keyboardEvent.preventDefault();
			keyboardEvent.stopPropagation();
			this.commitCellEdit();
			return;
		}

		if (keyboardEvent.keyCode === KeyCode.Escape) {
			keyboardEvent.preventDefault();
			keyboardEvent.stopPropagation();
			this.cancelCellEdit();
		}
	}

	private onKeyDown(event: KeyboardEvent): void {
		if (this.options.keyboardNavigation?.enabled === false) {
			return;
		}

		const keyboardEvent = new StandardKeyboardEvent(event);
		if (
			keyboardEvent.browserEvent.defaultPrevented ||
			keyboardEvent.altKey ||
			keyboardEvent.metaKey ||
			isEditableElement(keyboardEvent.target)
		) {
			return;
		}

		const currentCell = this.getNavigationCell();
		if (!currentCell) {
			return;
		}

		const target = VirtualTableGridModel.resolveKeyboardTarget({
			keyCode: keyboardEvent.keyCode,
			currentCell,
			rowCount: this.size.rowCount,
			columnCount: this.size.columnCount,
			pageRowCount: this.getPageRowCount(),
			toBoundary: keyboardEvent.ctrlKey,
		});
		if (!target) {
			return;
		}

		const selection = keyboardEvent.shiftKey
			? this.selectRangeToCell(target)
			: this.selectCell(target);
		if (!selection) {
			return;
		}

		keyboardEvent.preventDefault();
		keyboardEvent.stopPropagation();
		this.onDidNavigateKeyboardEmitter.fire({
			browserEvent: event,
			cell: target,
			extendSelection: keyboardEvent.shiftKey,
			keyboardEvent,
			selection,
		});
	}

	private getNavigationCell(): Table.ITableCellPosition | null {
		const focusCell = normalizeCellPosition(this.selectionFocusCell, this.size);
		if (focusCell) {
			return focusCell;
		}

		const activeCell = normalizeCellPosition(this.cellState.activeCell, this.size);
		if (activeCell) {
			return activeCell;
		}

		if (this.size.rowCount <= 0 || this.size.columnCount <= 0) {
			return null;
		}

		const { rowRange } = this.virtualTable.getState();
		return {
			colIndex: 0,
			rowIndex: Math.min(
				Math.max(0, rowRange.startIndex),
				this.size.rowCount - 1,
			),
		};
	}

	private syncNavigationStateFromCellState(): void {
		const ranges = normalizeCellRanges(this.cellState.selectedRanges, this.size);
		if (ranges.length > 0) {
			const range = ranges[0]!;
			if (
				this.selectionAnchorCell &&
				this.selectionFocusCell &&
				areCellRangesEqual(
					[VirtualTableGridModel.resolveCellRange(this.selectionAnchorCell, this.selectionFocusCell)],
					[range],
				)
			) {
				return;
			}

			const activeCell = normalizeCellPosition(this.cellState.activeCell, this.size);
			const focusCell = activeCell && isCellInRange(activeCell, range)
				? activeCell
				: { rowIndex: range.endRow, colIndex: range.endCol };
			this.selectionFocusCell = focusCell;
			this.selectionAnchorCell = getOppositeRangeCorner(range, focusCell);
			return;
		}

		const activeCell = normalizeCellPosition(this.cellState.activeCell, this.size);
		this.selectionAnchorCell = activeCell;
		this.selectionFocusCell = activeCell;
	}

	private resetAppliedCellState(): void {
		this.appliedCellState = null;
	}

	private syncCellState(): void {
		if (!this.isContentVisible()) {
			return;
		}

		const { columnRange, rowRange } = this.virtualTable.getState();
		const rowCount = rowRange.renderedCount;
		const columnCount = columnRange.renderedCount;
		const startRowIndex = rowRange.startIndex;
		const startColumnIndex = columnRange.startIndex;
		const activeCell = normalizeActiveCell(
			this.cellState.activeCell,
			startRowIndex,
			rowCount,
			startColumnIndex,
			columnCount,
		);
		const selectedColumns = toColumnSet(
			this.cellState.selectedColumns,
			startColumnIndex,
			columnCount,
		);
		const selectedRanges = toVisibleRanges(
			this.cellState.selectedRanges,
			startRowIndex,
			rowCount,
			startColumnIndex,
			columnCount,
		);
		const highlightedColumns = toColumnSet(
			this.cellState.highlightedColumns,
			startColumnIndex,
			columnCount,
		);
		const previous = this.appliedCellState;
		const next: AppliedTableCellState = {
			activeCell,
			highlightedColumns,
			selectedColumns,
			selectedRanges,
		};

		if (!previous) {
			this.syncHeaderCellState(VirtualTableGridModel.range(columnCount), next);
			this.syncBodyCellStateInRanges([{
				startRow: startRowIndex,
				endRow: startRowIndex + rowCount - 1,
				startCol: startColumnIndex,
				endCol: startColumnIndex + columnCount - 1,
			}], next);
			this.appliedCellState = next;
			return;
		}

		const rangesChanged = !areCellRangesEqual(previous.selectedRanges, next.selectedRanges);
		const changedColumns = getChangedColumns(previous, next, startColumnIndex, columnCount);
		this.syncHeaderCellState(changedColumns.map(colIndex => colIndex - startColumnIndex), next);
		this.syncBodyCellStateInRanges(
			getChangedCellStateRanges({
				changedColumns,
				columnCount,
				next,
				previous,
				rangesChanged,
				rowCount,
				startColumnIndex,
				startRowIndex,
			}),
			next,
		);
		this.syncActiveCellState(previous.activeCell, activeCell, next);
		this.appliedCellState = next;
	}

	private syncHeaderCellState(
		columnOffsets: readonly number[],
		state: Pick<AppliedTableCellState, "highlightedColumns" | "selectedColumns">,
	): void {
		const { columnRange } = this.virtualTable.getState();
		for (const columnOffset of columnOffsets) {
			const colIndex = columnRange.startIndex + columnOffset;
			const header = this.virtualTable.getColumnHeaderTemplateData(columnOffset);
			if (!header) {
				continue;
			}

			this.setColumnHeaderTraits(header, {
				highlighted: state.highlightedColumns.has(colIndex),
				selected: state.selectedColumns.has(colIndex),
			});
		}
	}

	private syncBodyCellStateInRanges(
		ranges: readonly Table.ITableCellRange[],
		state: AppliedTableCellState,
	): void {
		this.forEachBodyCellInRanges(ranges, (templateData, descriptor) => {
			this.setBodyCellTraits(templateData, {
				active: state.selectedRanges.length === 0 && isActiveCell(state.activeCell, descriptor.rowIndex, descriptor.colIndex),
				highlighted: state.highlightedColumns.has(descriptor.colIndex),
				selected: isSelectedCell(descriptor.rowIndex, descriptor.colIndex, state),
				selectionFrame: getSelectionFrame(descriptor.rowIndex, descriptor.colIndex, state.selectedRanges),
			});
		});
	}

	private syncActiveCellState(
		previous: Table.ITableCellPosition | null,
		next: Table.ITableCellPosition | null,
		state: AppliedTableCellState,
	): void {
		if (areActiveCellsEqual(previous, next)) {
			return;
		}

		this.updateActiveCellState(previous, false, state);
		this.updateActiveCellState(next, true, state);
	}

	private updateActiveCellState(
		activeCell: Table.ITableCellPosition | null,
		active: boolean,
		state: Pick<AppliedTableCellState, "highlightedColumns" | "selectedColumns" | "selectedRanges">,
	): void {
		if (!activeCell) {
			return;
		}

		const { columnRange, rowRange } = this.virtualTable.getState();
		const rowOffset = activeCell.rowIndex - rowRange.startIndex;
		const columnOffset = activeCell.colIndex - columnRange.startIndex;
		const cell = this.virtualTable.getBodyCellTemplateData(rowOffset, columnOffset);
		if (!cell) {
			return;
		}

		this.setBodyCellTraits(cell, {
			active: active && state.selectedRanges.length === 0,
			highlighted: state.highlightedColumns.has(activeCell.colIndex),
			selected: isSelectedCell(activeCell.rowIndex, activeCell.colIndex, state),
			selectionFrame: getSelectionFrame(activeCell.rowIndex, activeCell.colIndex, state.selectedRanges),
		});
	}

	private clearCellEditState(): void {
		const state = this.cellEditState;
		if (!state) {
			return;
		}

		this.cellEditState = null;
		this.cellEditStore.clear();
		state.input.remove();
		delete state.cell.dataset.editing;
	}

	private cancelCellEditInDirtyRanges(ranges: readonly Table.ITableDirtyRange[]): void {
		const state = this.cellEditState;
		if (!state) {
			return;
		}

		for (const range of ranges) {
			const startRow = range.startRow ?? state.rowIndex;
			const endRow = range.endRow ?? state.rowIndex + 1;
			const startCol = range.startCol ?? state.colIndex;
			const endCol = range.endCol ?? state.colIndex + 1;
			if (
				state.rowIndex >= startRow &&
				state.rowIndex < endRow &&
				state.colIndex >= startCol &&
				state.colIndex < endCol
			) {
				this.cancelCellEdit();
				return;
			}
		}
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

	private getPageRowCount(): number {
		return Math.max(
			1,
			Math.floor(
				this.getViewportClientHeight() /
					this.getRowHeight(),
			),
		);
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

	private getColumnResizeMode(): Table.ITableColumnResizeMode {
		return this.options.columnResize?.mode ?? "commit";
	}

	private syncColumnResizeGuide(): void {
		this.virtualTable.syncColumnResizeGuide(this.columnResizeState?.guideLeft ?? null);
	}

	private getColumnRange(): Table.ITableColumnRange {
		return this.virtualTable.getState().columnRange;
	}

	private canStartColumnResizeFromTarget(target: EventTarget | null): boolean {
		const targetWindow = this.element.ownerDocument.defaultView;
		if (!targetWindow || !(target instanceof targetWindow.Node)) {
			return true;
		}

		const element = target instanceof targetWindow.Element ? target : target.parentElement;
		if (!element) {
			return true;
		}

		return !element.closest("button,input,select,textarea,a,[contenteditable='true'],[role='button']");
	}

	private toVisibleBodyCellRanges(
		dirtyRanges: readonly Table.ITableDirtyRange[],
	): Table.ITableCellRange[] {
		const state = this.virtualTable.getState();
		const visibleRowStart = state.rowRange.startIndex;
		const visibleRowEnd = state.rowRange.endIndex;
		const visibleColStart = state.columnRange.startIndex;
		const visibleColEnd = state.columnRange.endIndex;
		const ranges: Table.ITableCellRange[] = [];
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

	private toVisibleColumnOffsets(
		dirtyRanges: readonly Table.ITableDirtyRange[],
	): number[] {
		const { columnRange } = this.virtualTable.getState();
		const visibleColStart = columnRange.startIndex;
		const visibleColEnd = columnRange.endIndex;
		const columnOffsets = new Set<number>();
		for (const dirtyRange of dirtyRanges) {
			const startCol = Math.max(visibleColStart, dirtyRange.startCol ?? visibleColStart);
			const endCol = Math.min(visibleColEnd, dirtyRange.endCol ?? visibleColEnd);
			if (startCol >= endCol) {
				continue;
			}

			for (let colIndex = startCol; colIndex < endCol; colIndex += 1) {
				columnOffsets.add(colIndex - visibleColStart);
			}
		}

		return Array.from(columnOffsets).sort((left, right) => left - right);
	}
}

function clampTableWidgetZoomPercent(zoomPercent: number): number {
	return Math.min(
		TABLE_WIDGET_ZOOM_OPTIONS.maxPercent,
		Math.max(TABLE_WIDGET_ZOOM_OPTIONS.minPercent, Math.floor(Number(zoomPercent) || 0)),
	);
}

function toTableWidgetSize(options: Table.ITableRenderOptions): Table.ITableSize {
	return {
		columnCount: toSafeCount(options.columnCount),
		rowCount: toSafeCount(options.rowCount),
	};
}

function toSafeCount(value: unknown): number {
	const count = Math.floor(Number(value));
	return Number.isFinite(count) && count > 0 ? count : 0;
}

function isTableWidgetSizeEqual(first: Table.ITableSize, second: Table.ITableSize): boolean {
	return first.columnCount === second.columnCount &&
		first.rowCount === second.rowCount;
}

function toColumnSet(
	columnIndexes: readonly number[] | undefined,
	startColumnIndex: number,
	columnCount: number,
): Set<number> {
	const columns = new Set<number>();
	const endColumnIndex = startColumnIndex + columnCount;
	for (const value of columnIndexes ?? []) {
		const columnIndex = Math.floor(Number(value));
		if (
			Number.isInteger(columnIndex) &&
			columnIndex >= startColumnIndex &&
			columnIndex < endColumnIndex
		) {
			columns.add(columnIndex);
		}
	}
	return columns;
}

function toVisibleRanges(
	ranges: readonly Table.ITableCellRange[] | undefined,
	startRowIndex: number,
	rowCount: number,
	startColumnIndex: number,
	columnCount: number,
): readonly Table.ITableCellRange[] {
	const visibleRanges: Table.ITableCellRange[] = [];
	const endRowIndex = startRowIndex + rowCount - 1;
	const endColumnIndex = startColumnIndex + columnCount - 1;

	for (const range of ranges ?? []) {
		const startRow = Math.max(startRowIndex, Math.floor(Number(range.startRow)));
		const endRow = Math.min(endRowIndex, Math.floor(Number(range.endRow)));
		const startCol = Math.max(startColumnIndex, Math.floor(Number(range.startCol)));
		const endCol = Math.min(endColumnIndex, Math.floor(Number(range.endCol)));
		if (
			Number.isInteger(startRow) &&
			Number.isInteger(endRow) &&
			Number.isInteger(startCol) &&
			Number.isInteger(endCol) &&
			startRow <= endRow &&
			startCol <= endCol
		) {
			visibleRanges.push({ startRow, endRow, startCol, endCol });
		}
	}

	return visibleRanges;
}

function normalizeActiveCell(
	cell: Table.ITableCellPosition | null | undefined,
	startRowIndex: number,
	rowCount: number,
	startColumnIndex: number,
	columnCount: number,
): Table.ITableCellPosition | null {
	const rowIndex = Math.floor(Number(cell?.rowIndex));
	const colIndex = Math.floor(Number(cell?.colIndex));
	const endColumnIndex = startColumnIndex + columnCount;
	if (
		!Number.isInteger(rowIndex) ||
		rowIndex < startRowIndex ||
		rowIndex >= startRowIndex + rowCount ||
		!Number.isInteger(colIndex) ||
		colIndex < startColumnIndex ||
		colIndex >= endColumnIndex
	) {
		return null;
	}

	return {
		colIndex,
		rowIndex,
	};
}

function normalizeCellPosition(
	cell: Table.ITableCellPosition | null | undefined,
	size: Table.ITableSize,
): Table.ITableCellPosition | null {
	const rowIndex = Math.floor(Number(cell?.rowIndex));
	const colIndex = Math.floor(Number(cell?.colIndex));
	if (
		!Number.isInteger(rowIndex) ||
		rowIndex < 0 ||
		rowIndex >= size.rowCount ||
		!Number.isInteger(colIndex) ||
		colIndex < 0 ||
		colIndex >= size.columnCount
	) {
		return null;
	}

	return { rowIndex, colIndex };
}

function normalizeCellRanges(
	ranges: readonly Table.ITableCellRange[] | undefined,
	size: Table.ITableSize,
): readonly Table.ITableCellRange[] {
	const maxRowIndex = size.rowCount - 1;
	const maxColIndex = size.columnCount - 1;
	if (maxRowIndex < 0 || maxColIndex < 0) {
		return [];
	}

	const normalizedRanges: Table.ITableCellRange[] = [];
	for (const range of ranges ?? []) {
		const startRow = Math.max(0, Math.min(maxRowIndex, Math.min(
			Math.floor(Number(range.startRow)),
			Math.floor(Number(range.endRow)),
		)));
		const endRow = Math.max(0, Math.min(maxRowIndex, Math.max(
			Math.floor(Number(range.startRow)),
			Math.floor(Number(range.endRow)),
		)));
		const startCol = Math.max(0, Math.min(maxColIndex, Math.min(
			Math.floor(Number(range.startCol)),
			Math.floor(Number(range.endCol)),
		)));
		const endCol = Math.max(0, Math.min(maxColIndex, Math.max(
			Math.floor(Number(range.startCol)),
			Math.floor(Number(range.endCol)),
		)));
		if (
			Number.isInteger(startRow) &&
			Number.isInteger(endRow) &&
			Number.isInteger(startCol) &&
			Number.isInteger(endCol) &&
			startRow <= endRow &&
			startCol <= endCol
		) {
			normalizedRanges.push({ startRow, endRow, startCol, endCol });
		}
	}

	return normalizedRanges;
}

function isCellInRange(
	cell: Table.ITableCellPosition,
	range: Table.ITableCellRange,
): boolean {
	return cell.rowIndex >= range.startRow &&
		cell.rowIndex <= range.endRow &&
		cell.colIndex >= range.startCol &&
		cell.colIndex <= range.endCol;
}

function getOppositeRangeCorner(
	range: Table.ITableCellRange,
	focusCell: Table.ITableCellPosition,
): Table.ITableCellPosition {
	const rowIndex = focusCell.rowIndex === range.startRow ? range.endRow : range.startRow;
	const colIndex = focusCell.colIndex === range.startCol ? range.endCol : range.startCol;
	return { rowIndex, colIndex };
}

function isSelectedCell(
	rowIndex: number,
	colIndex: number,
	state: Pick<AppliedTableCellState, "selectedColumns" | "selectedRanges">,
): boolean {
	return state.selectedColumns.has(colIndex) ||
		state.selectedRanges.some(range =>
			rowIndex >= range.startRow &&
			rowIndex <= range.endRow &&
			colIndex >= range.startCol &&
			colIndex <= range.endCol,
		);
}

function getSelectionFrame(
	rowIndex: number,
	colIndex: number,
	ranges: readonly Table.ITableCellRange[],
): Table.ITableSelectionFrameEdges {
	let top = false;
	let right = false;
	let bottom = false;
	let left = false;

	for (const range of ranges) {
		if (
			rowIndex < range.startRow ||
			rowIndex > range.endRow ||
			colIndex < range.startCol ||
			colIndex > range.endCol
		) {
			continue;
		}

		top ||= rowIndex === range.startRow;
		right ||= colIndex === range.endCol;
		bottom ||= rowIndex === range.endRow;
		left ||= colIndex === range.startCol;
	}

	return { bottom, left, right, top };
}

function isActiveCell(
	activeCell: Table.ITableCellPosition | null,
	rowIndex: number,
	colIndex: number,
): boolean {
	return activeCell?.rowIndex === rowIndex &&
		activeCell.colIndex === colIndex;
}

function areActiveCellsEqual(
	first: Table.ITableCellPosition | null,
	second: Table.ITableCellPosition | null,
): boolean {
	if (!first || !second) {
		return !first && !second;
	}

	return first.rowIndex === second.rowIndex &&
		first.colIndex === second.colIndex;
}

function areCellRangesEqual(
	first: readonly Table.ITableCellRange[],
	second: readonly Table.ITableCellRange[],
): boolean {
	if (first.length !== second.length) {
		return false;
	}

	for (let index = 0; index < first.length; index += 1) {
		const left = first[index];
		const right = second[index];
		if (
			!left ||
			!right ||
			left.startRow !== right.startRow ||
			left.endRow !== right.endRow ||
			left.startCol !== right.startCol ||
			left.endCol !== right.endCol
		) {
			return false;
		}
	}

	return true;
}

function getChangedColumns(
	previous: Pick<AppliedTableCellState, "highlightedColumns" | "selectedColumns">,
	next: Pick<AppliedTableCellState, "highlightedColumns" | "selectedColumns">,
	startColumnIndex: number,
	columnCount: number,
): number[] {
	const columns = new Set<number>();
	const endColumnIndex = startColumnIndex + columnCount;

	for (const colIndex of previous.selectedColumns) {
		if (!next.selectedColumns.has(colIndex)) {
			columns.add(colIndex);
		}
	}

	for (const colIndex of next.selectedColumns) {
		if (!previous.selectedColumns.has(colIndex)) {
			columns.add(colIndex);
		}
	}

	for (const colIndex of previous.highlightedColumns) {
		if (!next.highlightedColumns.has(colIndex)) {
			columns.add(colIndex);
		}
	}

	for (const colIndex of next.highlightedColumns) {
		if (!previous.highlightedColumns.has(colIndex)) {
			columns.add(colIndex);
		}
	}

	return Array.from(columns)
		.filter((colIndex) => colIndex >= startColumnIndex && colIndex < endColumnIndex)
		.sort((a, b) => a - b);
}

function getChangedCellStateRanges({
	changedColumns,
	columnCount,
	next,
	previous,
	rangesChanged,
	rowCount,
	startColumnIndex,
	startRowIndex,
}: {
	readonly changedColumns: readonly number[];
	readonly columnCount: number;
	readonly next: AppliedTableCellState;
	readonly previous: AppliedTableCellState;
	readonly rangesChanged: boolean;
	readonly rowCount: number;
	readonly startColumnIndex: number;
	readonly startRowIndex: number;
}): readonly Table.ITableCellRange[] {
	const ranges: Table.ITableCellRange[] = [];
	const endRow = startRowIndex + rowCount - 1;
	const endColumn = startColumnIndex + columnCount - 1;
	if (rowCount <= 0 || columnCount <= 0) {
		return ranges;
	}

	for (const colIndex of changedColumns) {
		if (colIndex < startColumnIndex || colIndex > endColumn) {
			continue;
		}
		ranges.push({
			startRow: startRowIndex,
			endRow,
			startCol: colIndex,
			endCol: colIndex,
		});
	}

	if (rangesChanged) {
		ranges.push(
			...VirtualTableGridModel.getChangedCellRanges(previous.selectedRanges, next.selectedRanges),
		);
	}

	return ranges;
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

const serializeTableSelectionFrame = (frame: Table.ITableBodyCellTraitState["selectionFrame"]): string =>
	`${frame.top ? "t" : ""}${frame.right ? "r" : ""}${frame.bottom ? "b" : ""}${frame.left ? "l" : ""}`;
