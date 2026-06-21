/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Scrollbar } from "src/cs/base/browser/ui/scrollbar/scrollableElement";
import { Emitter, type Event } from "src/cs/base/common/event";
import { DisposableStore, type IDisposable } from "src/cs/base/common/lifecycle";

export type VirtualTableRange = {
	readonly totalCount: number;
	readonly startIndex: number;
	readonly endIndex: number;
	readonly renderedCount: number;
};

export type VirtualTableColumnRange = VirtualTableRange & {
	readonly leadingWidth: number;
	readonly renderedWidth: number;
	readonly totalWidth: number;
	readonly trailingWidth: number;
};

export type VirtualTableCellPosition = {
	readonly rowIndex: number;
	readonly colIndex: number;
};

export type VirtualTableCellRange = {
	readonly endCol: number;
	readonly endRow: number;
	readonly startCol: number;
	readonly startRow: number;
};

export type ResolveVirtualTableRangeOptions = {
	readonly maxRenderedCount: number;
	readonly startIndex?: number;
	readonly totalCount: unknown;
};

export type ResolveVirtualTableViewportRangeOptions = {
	readonly maxRenderedCount: number;
	readonly overscanCount?: number;
	readonly rowHeight: number;
	readonly scrollTop: unknown;
	readonly totalCount: unknown;
	readonly viewportHeight: unknown;
};

export type ResolveVirtualTableColumnViewportRangeOptions = {
	readonly getColumnWidth: (colIndex: number) => number;
	readonly maxRenderedCount: number;
	readonly overscanCount?: number;
	readonly scrollLeft: unknown;
	readonly totalCount: unknown;
	readonly viewportWidth: unknown;
	readonly zoomPercent: number;
};

export type ResolveVirtualTableDisplayColumnCountOptions = {
	readonly getColumnWidth: (colIndex: number) => number;
	readonly maxDisplayedCount?: number;
	readonly overscanCount?: number;
	readonly totalCount: unknown;
	readonly viewportWidth: unknown;
	readonly zoomPercent: number;
};

export type ResolveVirtualTableColumnResizeTargetOptions = {
	readonly button: unknown;
	readonly clientX: unknown;
	readonly columnRange: Pick<VirtualTableColumnRange, "leadingWidth" | "renderedCount" | "startIndex">;
	readonly containerLeft: unknown;
	readonly getColumnWidth: (colIndex: number) => number;
	readonly hitSlop?: number;
	readonly scrollLeft: unknown;
	readonly zoomPercent: number;
};

export type ResolveVirtualTableColumnResizeGuideOptions = {
	readonly colIndex?: number | null;
	readonly columnRange: Pick<VirtualTableColumnRange, "leadingWidth" | "renderedCount" | "startIndex">;
	readonly getColumnWidth: (colIndex: number) => number;
	readonly scrollLeft: unknown;
	readonly visible?: boolean;
	readonly zoomPercent: number;
};

export type ResolveVirtualTableColumnResizeDragGuideOptions = {
	readonly startGuideLeft: unknown;
	readonly startWidth: unknown;
	readonly visible?: boolean;
	readonly width: unknown;
	readonly zoomPercent: number;
};

export type VirtualTableSpacerHeights = {
	readonly topHeight: number;
	readonly bottomHeight: number;
};

export type ResolveVirtualTableKeyboardTargetOptions = {
	readonly columnCount: unknown;
	readonly currentCell?: VirtualTableCellPosition | null;
	readonly key: string;
	readonly pageRowCount?: number;
	readonly rowCount: unknown;
	readonly toBoundary?: boolean;
};

export type VirtualTableCellDescriptor = {
	readonly colIndex?: number;
	readonly columnOffset?: number;
	readonly rowIndex?: number;
	readonly rowOffset?: number;
};

export type VirtualTableBodyCell = {
	readonly element: HTMLTableCellElement;
	appliedColIndex?: number;
	appliedHidden?: boolean;
	appliedRenderVersion?: unknown;
	appliedRowIndex?: number;
};

type VirtualTableBodyRow = {
	readonly cells: VirtualTableBodyCell[];
	readonly element: HTMLTableRowElement;
	readonly leadingSpacer: HTMLTableCellElement;
	readonly rowHeader: HTMLTableCellElement;
	readonly trailingSpacer: HTMLTableCellElement;
	appliedHidden?: boolean;
	appliedRowIndex?: number;
};

export type VirtualTableRenderOptions = {
	readonly columnCount: unknown;
	readonly renderVersion?: unknown;
	readonly rowCount: unknown;
	readonly zoomPercent: number;
};

export type VirtualTableScrollEvent = {
	readonly scrollLeft: number;
	readonly scrollTop: number;
};

export type VirtualTableVisibleRangeChangeEvent = {
	readonly current: VirtualTableState;
	readonly previous: VirtualTableState;
};

/**
 * Renderer boundary for pooled cells. Implementations should be idempotent: the
 * same DOM cell will be rebound to many row/column descriptors while scrolling.
 */
export type VirtualTableRenderer = {
	readonly clearBodyCell?: (cell: HTMLTableCellElement) => void;
	readonly disposeBodyCell?: (cell: HTMLTableCellElement) => void;
	readonly renderBodyCell: (cell: HTMLTableCellElement, descriptor: Required<Pick<VirtualTableCellDescriptor, "colIndex" | "columnOffset" | "rowIndex" | "rowOffset">>) => void;
	readonly renderColumnHeader: (cell: HTMLElement, descriptor: Required<Pick<VirtualTableCellDescriptor, "colIndex" | "columnOffset">>) => void;
	readonly renderCorner?: (cell: HTMLElement) => void;
	readonly renderRowHeader: (cell: HTMLTableCellElement, descriptor: Required<Pick<VirtualTableCellDescriptor, "rowIndex" | "rowOffset">>) => void;
};

type VirtualTableClassNames = {
	readonly body: string;
	readonly cell: string;
	readonly columnResizeGuide: string;
	readonly columnSpacerCell: string;
	readonly columnSpacerCol: string;
	readonly content: string;
	readonly dataCol: string;
	readonly grid: string;
	readonly header: string;
	readonly headerCell: string;
	readonly headerContent: string;
	readonly headerCorner: string;
	readonly headerScroll: string;
	readonly headerSpacer: string;
	readonly root: string;
	readonly rowHeaderCol: string;
	readonly rowHeaderLabel: string;
	readonly scrollArea: string;
	readonly virtualSpacer: string;
	readonly virtualSpacerCell: string;
	readonly viewport: string;
};

const VIRTUAL_TABLE_CLASS_NAMES: VirtualTableClassNames = {
	body: "table_view_body",
	cell: "table_view_cell",
	columnResizeGuide: "table_view_column_resize_guide",
	columnSpacerCell: "table_view_column_spacer_cell",
	columnSpacerCol: "table_view_column_spacer_col",
	content: "table_view_content",
	dataCol: "table_view_data_col",
	grid: "table_view_grid",
	header: "table_view_grid_header",
	headerCell: "table_view_grid_header_cell",
	headerContent: "table_view_grid_header_content",
	headerCorner: "table_view_grid_header_corner",
	headerScroll: "table_view_grid_header_scroll",
	headerSpacer: "table_view_grid_header_spacer",
	root: "table_view",
	rowHeaderCol: "table_view_row_header_col",
	rowHeaderLabel: "table_view_row_header_label",
	scrollArea: "table_view_scroll_area",
	virtualSpacer: "table_view_virtual_spacer",
	virtualSpacerCell: "table_view_virtual_spacer_cell",
	viewport: "table_view_preview",
};

export type VirtualTableOptions = {
	readonly getColumnWidth: (colIndex: number) => number;
	readonly maxRenderedColumns?: number;
	readonly maxRenderedRows?: number;
	readonly renderer: VirtualTableRenderer;
};

export type VirtualTableState = {
	readonly columnRange: VirtualTableColumnRange;
	readonly rowRange: VirtualTableRange;
};

export namespace VirtualTableGridModel {
	export const DEFAULT_MAX_RENDERED_ROWS = 80;
	export const DEFAULT_MAX_RENDERED_COLUMNS = 24;
	export const DEFAULT_ROW_HEADER_WIDTH = 48;
	export const DEFAULT_ROW_HEIGHT = 28;
	export const DEFAULT_MIN_COLUMN_WIDTH = 0;
	export const DEFAULT_MAX_COLUMN_WIDTH = 640;
	export const DEFAULT_COLUMN_OVERSCAN_COLUMNS = 2;
	export const DEFAULT_OVERSCAN_ROWS = 8;

	export const resolveRange = ({
		maxRenderedCount,
		startIndex = 0,
		totalCount,
	}: ResolveVirtualTableRangeOptions): VirtualTableRange => {
		const safeTotalCount = toSafeCount(totalCount);
		const safeMaxRenderedCount = toSafeCount(maxRenderedCount);
		if (safeTotalCount === 0 || safeMaxRenderedCount === 0) {
			return {
				totalCount: safeTotalCount,
				startIndex: 0,
				endIndex: 0,
				renderedCount: 0,
			};
		}

		const safeStartIndex = Math.min(
			Math.max(0, toSafeIndex(startIndex)),
			safeTotalCount - 1,
		);
		const endIndex = Math.min(safeTotalCount, safeStartIndex + safeMaxRenderedCount);

		return {
			totalCount: safeTotalCount,
			startIndex: safeStartIndex,
			endIndex,
			renderedCount: endIndex - safeStartIndex,
		};
	};

	export const resolveViewportRange = ({
		maxRenderedCount,
		overscanCount = DEFAULT_OVERSCAN_ROWS,
		rowHeight,
		scrollTop,
		totalCount,
		viewportHeight,
	}: ResolveVirtualTableViewportRangeOptions): VirtualTableRange => {
		const safeTotalCount = toSafeCount(totalCount);
		const safeMaxRenderedCount = toSafeCount(maxRenderedCount);
		if (safeTotalCount === 0 || safeMaxRenderedCount === 0) {
			return resolveRange({
				totalCount: safeTotalCount,
				maxRenderedCount: safeMaxRenderedCount,
			});
		}

		const safeRowHeight = Math.max(1, Number(rowHeight) || DEFAULT_ROW_HEIGHT);
		const firstVisibleIndex = Math.floor(Math.max(0, Number(scrollTop) || 0) / safeRowHeight);
		const safeViewportHeight = Math.max(0, Number(viewportHeight) || 0);
		if (safeViewportHeight <= 0) {
			return resolveRange({
				totalCount: safeTotalCount,
				startIndex: firstVisibleIndex,
				maxRenderedCount: safeMaxRenderedCount,
			});
		}

		const safeOverscanCount = Math.max(0, toSafeCount(overscanCount));
		const visibleCount = Math.max(1, Math.ceil(safeViewportHeight / safeRowHeight));
		const renderedCount = Math.min(
			safeMaxRenderedCount,
			visibleCount + (safeOverscanCount * 2),
		);
		const startIndex = Math.max(0, firstVisibleIndex - safeOverscanCount);
		const maxStartIndex = Math.max(0, safeTotalCount - renderedCount);

		return resolveRange({
			totalCount: safeTotalCount,
			startIndex: Math.min(startIndex, maxStartIndex),
			maxRenderedCount: renderedCount,
		});
	};

	export const resolveColumnViewportRange = ({
		getColumnWidth,
		maxRenderedCount,
		overscanCount = DEFAULT_COLUMN_OVERSCAN_COLUMNS,
		scrollLeft,
		totalCount,
		viewportWidth,
		zoomPercent,
	}: ResolveVirtualTableColumnViewportRangeOptions): VirtualTableColumnRange => {
		const safeTotalCount = toSafeCount(totalCount);
		const safeMaxRenderedCount = toSafeCount(maxRenderedCount);
		if (safeTotalCount === 0 || safeMaxRenderedCount === 0) {
			return toColumnRange(resolveRange({
				totalCount: safeTotalCount,
				maxRenderedCount: safeMaxRenderedCount,
			}), 0, 0, 0);
		}

		const scale = getZoomScale(zoomPercent);
		const widths = getScaledColumnWidths(safeTotalCount, getColumnWidth, scale);
		const offsets = getPrefixSums(widths);
		const totalWidth = offsets[offsets.length - 1] ?? 0;
		const safeScrollLeft = Math.max(0, Number(scrollLeft) || 0);
		const safeViewportWidth = Math.max(0, Number(viewportWidth) || 0);
		const firstVisibleIndex = findColumnIndexAtOffset(widths, offsets, safeScrollLeft);
		const visibleEndIndex = findColumnEndIndexAtOffset(
			offsets,
			safeScrollLeft + safeViewportWidth,
		);
		const safeOverscanCount = Math.max(0, toSafeCount(overscanCount));
		const startIndex = Math.max(0, firstVisibleIndex - safeOverscanCount);
		const endIndex = Math.min(
			safeTotalCount,
			Math.max(startIndex + 1, visibleEndIndex + safeOverscanCount),
		);
		const unclampedRenderedCount = Math.max(1, endIndex - startIndex);
		const renderedCount = Math.min(safeMaxRenderedCount, unclampedRenderedCount);
		const maxStartIndex = Math.max(0, safeTotalCount - renderedCount);
		const clampedStartIndex = Math.min(startIndex, maxStartIndex);
		const range = resolveRange({
			totalCount: safeTotalCount,
			startIndex: clampedStartIndex,
			maxRenderedCount: renderedCount,
		});
		const leadingWidth = offsets[range.startIndex] ?? 0;
		const renderedWidth = sumWidths(widths, range.startIndex, range.endIndex);
		const trailingWidth = Math.max(0, totalWidth - leadingWidth - renderedWidth);
		return toColumnRange(range, leadingWidth, renderedWidth, trailingWidth);
	};

	export const resolveDisplayColumnCount = ({
		getColumnWidth,
		maxDisplayedCount = DEFAULT_MAX_RENDERED_COLUMNS,
		overscanCount = DEFAULT_COLUMN_OVERSCAN_COLUMNS,
		totalCount,
		viewportWidth,
		zoomPercent,
	}: ResolveVirtualTableDisplayColumnCountOptions): number => {
		const safeTotalCount = toSafeCount(totalCount);
		if (safeTotalCount === 0) {
			return 0;
		}

		const safeMaxDisplayedCount = Math.max(
			safeTotalCount,
			toSafeCount(maxDisplayedCount),
		);
		const safeViewportWidth = Math.max(0, Number(viewportWidth) || 0);
		if (safeViewportWidth <= 0 || safeTotalCount >= safeMaxDisplayedCount) {
			return safeTotalCount;
		}

		const scale = getZoomScale(zoomPercent);
		let displayedCount = safeTotalCount;
		let displayedWidth = 0;
		for (let colIndex = 0; colIndex < safeTotalCount; colIndex += 1) {
			displayedWidth += getScaledColumnWidth(colIndex, getColumnWidth, scale);
		}

		while (displayedCount < safeMaxDisplayedCount && displayedWidth < safeViewportWidth) {
			displayedWidth += getScaledColumnWidth(displayedCount, getColumnWidth, scale);
			displayedCount += 1;
		}

		if (displayedCount > safeTotalCount) {
			displayedCount = Math.min(
				safeMaxDisplayedCount,
				displayedCount + Math.max(0, toSafeCount(overscanCount)),
			);
		}

		return displayedCount;
	};

	export const getSpacerHeights = (
		range: VirtualTableRange,
		rowHeight: number,
	): VirtualTableSpacerHeights => {
		const safeRowHeight = Math.max(1, Number(rowHeight) || DEFAULT_ROW_HEIGHT);
		const topHeight = range.startIndex * safeRowHeight;
		const bottomHeight = Math.max(0, range.totalCount - range.endIndex) * safeRowHeight;
		return { topHeight, bottomHeight };
	};

	export const resolveKeyboardTarget = ({
		columnCount,
		currentCell,
		key,
		pageRowCount = 10,
		rowCount,
		toBoundary = false,
	}: ResolveVirtualTableKeyboardTargetOptions): VirtualTableCellPosition | null => {
		const maxRowIndex = toSafeCount(rowCount) - 1;
		const maxColIndex = toSafeCount(columnCount) - 1;
		if (maxRowIndex < 0 || maxColIndex < 0) {
			return null;
		}

		const currentRowIndex = Math.min(
			maxRowIndex,
			Math.max(0, toSafeIndex(currentCell?.rowIndex)),
		);
		const currentColIndex = Math.min(
			maxColIndex,
			Math.max(0, toSafeIndex(currentCell?.colIndex)),
		);

		switch (key) {
			case "ArrowUp":
				return { rowIndex: toBoundary ? 0 : Math.max(0, currentRowIndex - 1), colIndex: currentColIndex };
			case "ArrowDown":
				return { rowIndex: toBoundary ? maxRowIndex : Math.min(maxRowIndex, currentRowIndex + 1), colIndex: currentColIndex };
			case "ArrowLeft":
				return { rowIndex: currentRowIndex, colIndex: toBoundary ? 0 : Math.max(0, currentColIndex - 1) };
			case "ArrowRight":
				return { rowIndex: currentRowIndex, colIndex: toBoundary ? maxColIndex : Math.min(maxColIndex, currentColIndex + 1) };
			case "Home":
				return { rowIndex: toBoundary ? 0 : currentRowIndex, colIndex: 0 };
			case "End":
				return { rowIndex: toBoundary ? maxRowIndex : currentRowIndex, colIndex: maxColIndex };
			case "PageUp":
				return {
					rowIndex: Math.max(0, currentRowIndex - Math.max(1, toSafeCount(pageRowCount))),
					colIndex: currentColIndex,
				};
			case "PageDown":
				return {
					rowIndex: Math.min(maxRowIndex, currentRowIndex + Math.max(1, toSafeCount(pageRowCount))),
					colIndex: currentColIndex,
				};
		}

		return null;
	};

	export const resolveCellRange = (
		first: VirtualTableCellPosition,
		second: VirtualTableCellPosition,
	): VirtualTableCellRange => ({
		startRow: Math.min(first.rowIndex, second.rowIndex),
		endRow: Math.max(first.rowIndex, second.rowIndex),
		startCol: Math.min(first.colIndex, second.colIndex),
		endCol: Math.max(first.colIndex, second.colIndex),
	});

	export const getChangedCellRanges = (
		previousRanges: readonly VirtualTableCellRange[],
		nextRanges: readonly VirtualTableCellRange[],
	): VirtualTableCellRange[] => {
		const previous = normalizeCellRanges(previousRanges);
		const next = normalizeCellRanges(nextRanges);
		if (areCellRangeListsEqual(previous, next)) {
			return [];
		}

		const result: VirtualTableCellRange[] = [];
		const seen = new Set<string>();
		const add = (range: VirtualTableCellRange | null): void => {
			if (!range) {
				return;
			}
			const key = `${range.startRow}:${range.endRow}:${range.startCol}:${range.endCol}`;
			if (seen.has(key)) {
				return;
			}
			seen.add(key);
			result.push(range);
		};

		for (const range of subtractCellRangeLists(previous, next)) {
			add(range);
		}
		for (const range of subtractCellRangeLists(next, previous)) {
			add(range);
		}
		for (const range of previous) {
			for (const edge of getCellRangeEdges(range)) {
				add(edge);
			}
		}
		for (const range of next) {
			for (const edge of getCellRangeEdges(range)) {
				add(edge);
			}
		}

		return result;
	};

	export const getColumnLabel = (index: number): string => {
		const safeIndex = Math.max(0, toSafeIndex(index));
		let value = safeIndex + 1;
		let label = "";
		while (value > 0) {
			const remainder = (value - 1) % 26;
			label = String.fromCharCode(65 + remainder) + label;
			value = Math.floor((value - 1) / 26);
		}
		return label;
	};

	export const getRowLabel = (index: number): string =>
		String(Math.max(0, toSafeIndex(index)) + 1);

	export const formatCell = (value: unknown): string => {
		if (value === null || typeof value === "undefined") {
			return "";
		}
		return String(value);
	};

	export const range = (count: number): number[] => {
		const safeCount = toSafeCount(count);
		const values: number[] = [];
		for (let index = 0; index < safeCount; index += 1) {
			values.push(index);
		}
		return values;
	};

	export const resizeColumnWidth = (
		startWidth: unknown,
		deltaClientX: unknown,
		zoomPercent: number,
	): number => {
		const scale = getZoomScale(zoomPercent);
		const delta = (Number(deltaClientX) || 0) / scale;
		return clampColumnWidth(Math.round((Number(startWidth) || 0) + delta));
	};

	export const resolveColumnResizeTarget = ({
		button,
		clientX,
		columnRange,
		containerLeft,
		getColumnWidth,
		hitSlop = 10,
		scrollLeft,
		zoomPercent,
	}: ResolveVirtualTableColumnResizeTargetOptions): number | null => {
		if (Math.floor(Number(button)) !== 0) {
			return null;
		}
		const safeClientX = Number(clientX);
		const safeContainerLeft = Number(containerLeft);
		if (!Number.isFinite(safeClientX) || !Number.isFinite(safeContainerLeft)) {
			return null;
		}
		const x = safeClientX - safeContainerLeft;
		const safeScrollLeft = Math.max(0, Number(scrollLeft) || 0);
		const scale = getZoomScale(zoomPercent);
		const safeHitSlop = Math.max(0, Number(hitSlop) || 0);
		let right = getRowHeaderWidth(zoomPercent) + columnRange.leadingWidth - safeScrollLeft;
		let closestColIndex: number | null = null;
		let closestDistance = Number.POSITIVE_INFINITY;
		for (let offset = 0; offset < columnRange.renderedCount; offset += 1) {
			const colIndex = columnRange.startIndex + offset;
			right += getScaledColumnWidth(colIndex, getColumnWidth, scale);
			const distance = Math.abs(x - right);
			const tied = Math.abs(distance - closestDistance) < 0.001;
			if (
				distance <= safeHitSlop &&
				(
					distance < closestDistance ||
					(tied && (closestColIndex === null || colIndex > closestColIndex))
				)
			) {
				closestColIndex = colIndex;
				closestDistance = distance;
			}
		}
		return closestColIndex;
	};

	export const resolveColumnResizeGuideLeft = ({
		colIndex,
		columnRange,
		getColumnWidth,
		scrollLeft,
		visible = true,
		zoomPercent,
	}: ResolveVirtualTableColumnResizeGuideOptions): number | null => {
		if (!visible || colIndex === null || typeof colIndex === "undefined") {
			return null;
		}
		const safeColIndex = toSafeIndex(colIndex);
		if (
			safeColIndex < columnRange.startIndex ||
			safeColIndex >= columnRange.startIndex + columnRange.renderedCount
		) {
			return null;
		}

		const scale = getZoomScale(zoomPercent);
		let left = getRowHeaderWidth(zoomPercent) + columnRange.leadingWidth - (Number(scrollLeft) || 0);
		for (let index = columnRange.startIndex; index <= safeColIndex; index += 1) {
			left += getScaledColumnWidth(index, getColumnWidth, scale);
		}
		return left;
	};

	export const resolveColumnResizeDragGuideLeft = ({
		startGuideLeft,
		startWidth,
		visible = true,
		width,
		zoomPercent,
	}: ResolveVirtualTableColumnResizeDragGuideOptions): number | null => {
		if (!visible) {
			return null;
		}
		const scale = getZoomScale(zoomPercent);
		const left = Number(startGuideLeft) +
			((Math.max(0, Number(width) || 0) - Math.max(0, Number(startWidth) || 0)) * scale);
		return Number.isFinite(left) ? left : null;
	};

	export const getZoomScale = (zoomPercent: number): number =>
		Math.max(0.25, Number(zoomPercent) / 100 || 1);

	export const getRowHeaderWidth = (zoomPercent: number): number =>
		DEFAULT_ROW_HEADER_WIDTH * getZoomScale(zoomPercent);

	export const getRowHeight = (zoomPercent: number): number =>
		DEFAULT_ROW_HEIGHT * getZoomScale(zoomPercent);
}

/**
 * Conductor-specific two-dimensional virtual table engine.
 *
 * Owns the structural DOM, virtual scroll geometry, visible cell pool, spacer
 * rows/columns, and header/body scroll sync. It intentionally does not own data
 * fetching, cell formatting, selection semantics, keyboard shortcuts, or
 * persistence. Consumers subscribe to the emitted facts and re-render by passing
 * total row/column counts plus a renderer-owned version token.
 */
export class VirtualTable implements IDisposable {
	public readonly element: HTMLElement;
	public readonly body: HTMLDivElement;
	public readonly bodyRows: HTMLTableSectionElement;
	public readonly columnResizeGuide: HTMLDivElement;
	public readonly content: HTMLDivElement;
	public readonly header: HTMLDivElement;
	public readonly headerContent: HTMLDivElement;
	public readonly viewport: HTMLElement;
	public readonly onDidChangeVisibleRange: Event<VirtualTableVisibleRangeChangeEvent>;
	public readonly onDidScroll: Event<VirtualTableScrollEvent>;

	private readonly bodyDataColumns: HTMLTableColElement[] = [];
	private readonly bodyGrid: VirtualTableBodyRow[] = [];
	private readonly bodyLeadingSpacerColumn = document.createElement("col");
	private readonly bodyTrailingSpacerColumn = document.createElement("col");
	private readonly bottomSpacerCell = document.createElement("td");
	private readonly bottomSpacerRow = document.createElement("tr");
	private readonly classNames = VIRTUAL_TABLE_CLASS_NAMES;
	private readonly columnGroup = document.createElement("colgroup");
	private readonly disposables = new DisposableStore();
	private readonly onDidChangeVisibleRangeEmitter = this.disposables.add(new Emitter<VirtualTableVisibleRangeChangeEvent>());
	private readonly onDidScrollEmitter = this.disposables.add(new Emitter<VirtualTableScrollEvent>());
	private readonly headerCells: HTMLElement[] = [];
	private readonly headerCorner: HTMLDivElement;
	private readonly headerLeadingSpacer: HTMLDivElement;
	private readonly headerScroll: HTMLDivElement;
	private readonly headerTrailingSpacer: HTMLDivElement;
	private readonly maxRenderedColumns: number;
	private readonly maxRenderedRows: number;
	private readonly rowHeaderColumn = document.createElement("col");
	private readonly scrollArea: Scrollbar;
	private readonly table = document.createElement("table");
	private readonly topSpacerCell = document.createElement("td");
	private readonly topSpacerRow = document.createElement("tr");
	private headerColumnCount = 0;
	private lastRenderOptions: VirtualTableRenderOptions | null = null;
	private renderedZoomPercent: number | null = null;
	private state: VirtualTableState = {
		rowRange: {
			totalCount: 0,
			startIndex: 0,
			endIndex: 0,
			renderedCount: 0,
		},
		columnRange: {
			totalCount: 0,
			startIndex: 0,
			endIndex: 0,
			renderedCount: 0,
			leadingWidth: 0,
			renderedWidth: 0,
			totalWidth: 0,
			trailingWidth: 0,
		},
	};

	public constructor(private readonly options: VirtualTableOptions) {
		this.maxRenderedColumns = options.maxRenderedColumns ?? VirtualTableGridModel.DEFAULT_MAX_RENDERED_COLUMNS;
		this.maxRenderedRows = options.maxRenderedRows ?? VirtualTableGridModel.DEFAULT_MAX_RENDERED_ROWS;
		this.onDidChangeVisibleRange = this.onDidChangeVisibleRangeEmitter.event;
		this.onDidScroll = this.onDidScrollEmitter.event;

		this.element = document.createElement("div");
		this.body = document.createElement("div");
		this.header = document.createElement("div");
		this.headerCorner = document.createElement("div");
		this.headerScroll = document.createElement("div");
		this.headerContent = document.createElement("div");
		this.headerLeadingSpacer = document.createElement("div");
		this.headerTrailingSpacer = document.createElement("div");
		this.columnResizeGuide = document.createElement("div");
		this.content = document.createElement("div");
		this.bodyRows = document.createElement("tbody");
		this.scrollArea = this.disposables.add(new Scrollbar({
			axis: "both",
			className: this.classNames.scrollArea,
			observeResize: false,
			onScroll: () => this.onScroll(),
			viewportClassName: this.classNames.viewport,
		}));
		this.viewport = this.scrollArea.viewport;

		this.element.className = this.classNames.root;
		this.body.className = this.classNames.body;
		this.header.className = this.classNames.header;
		this.headerCorner.className = this.classNames.headerCorner;
		this.headerScroll.className = this.classNames.headerScroll;
		this.headerContent.className = this.classNames.headerContent;
		this.headerLeadingSpacer.className = this.classNames.headerSpacer;
		this.headerTrailingSpacer.className = this.classNames.headerSpacer;
		this.columnResizeGuide.className = this.classNames.columnResizeGuide;
		this.content.className = this.classNames.content;
		this.table.className = this.classNames.grid;
		this.rowHeaderColumn.className = this.classNames.rowHeaderCol;
		this.bodyLeadingSpacerColumn.className = this.classNames.columnSpacerCol;
		this.bodyTrailingSpacerColumn.className = this.classNames.columnSpacerCol;
		this.headerCorner.setAttribute("aria-hidden", "true");
		this.headerLeadingSpacer.setAttribute("aria-hidden", "true");
		this.headerTrailingSpacer.setAttribute("aria-hidden", "true");
		this.columnResizeGuide.setAttribute("aria-hidden", "true");
		this.columnResizeGuide.hidden = true;
		this.topSpacerRow.className = this.classNames.virtualSpacer;
		this.topSpacerRow.setAttribute("aria-hidden", "true");
		this.topSpacerCell.className = this.classNames.virtualSpacerCell;
		this.bottomSpacerRow.className = this.classNames.virtualSpacer;
		this.bottomSpacerRow.setAttribute("aria-hidden", "true");
		this.bottomSpacerCell.className = this.classNames.virtualSpacerCell;

		this.headerContent.append(this.headerLeadingSpacer, this.headerTrailingSpacer);
		this.headerScroll.append(this.headerContent);
		this.header.append(this.headerCorner, this.headerScroll);
		this.topSpacerRow.append(this.topSpacerCell);
		this.bottomSpacerRow.append(this.bottomSpacerCell);
		this.table.append(this.columnGroup, this.bodyRows);
		this.content.append(this.table);
		this.body.append(this.header, this.scrollArea.element, this.columnResizeGuide);
		this.element.append(this.body);

		this.options.renderer.renderCorner?.(this.headerCorner);
		this.ensureHeaderGrid();
		this.ensureBodyColumns();
		this.ensureBodyCells();
		this.syncBodyGridVisibility(this.state.rowRange, this.state.columnRange, this.state);
	}

	public dispose(): void {
		this.options.renderer.clearBodyCell && this.forEachBodyCell(cell => this.options.renderer.clearBodyCell?.(cell.element));
		this.options.renderer.disposeBodyCell && this.forEachBodyCell(cell => this.options.renderer.disposeBodyCell?.(cell.element));
		this.disposables.dispose();
		this.element.replaceChildren();
		this.element.remove();
	}

	public layout(): void {
		this.scrollArea.layout();
		this.syncHeaderScroll();
	}

	public getState(): VirtualTableState {
		return this.state;
	}

	public render(options: VirtualTableRenderOptions): boolean {
		this.lastRenderOptions = options;
		const previousState = this.state;
		const zoomChanged = this.renderedZoomPercent !== options.zoomPercent;
		if (zoomChanged) {
			this.renderedZoomPercent = options.zoomPercent;
		}

		const { rowRange, columnRange } = this.resolveVisibleState(options);
		const rowCount = rowRange.renderedCount;
		const columnCount = columnRange.renderedCount;
		const nextState = { rowRange, columnRange };
		const visibleRangeChanged = !isVirtualTableStateEqual(previousState, nextState);
		this.state = nextState;
		if (rowCount === 0 || columnCount === 0) {
			const bodyVisibilityChanged = this.syncBodyGridVisibility(rowRange, columnRange, previousState);
			const columnLayoutChanged = this.syncColumnLayout(columnRange);
			this.renderVisibleHeaders(columnRange);
			this.syncHeaderScroll();
			this.syncColumnResizeGuide(null);
			if (visibleRangeChanged) {
				this.onDidChangeVisibleRangeEmitter.fire({ previous: previousState, current: nextState });
			}
			return bodyVisibilityChanged || columnLayoutChanged || visibleRangeChanged || zoomChanged;
		}

		this.header.hidden = false;
		const headerChanged = this.ensureHeaderGrid();
		const columnsChanged = this.ensureBodyColumns();
		const cellsChanged = this.ensureBodyCells();
		const bodyVisibilityChanged = this.syncBodyGridVisibility(rowRange, columnRange, previousState);
		const columnLayoutChanged = this.syncColumnLayout(columnRange);
		this.renderVisibleHeaders(columnRange);
		this.renderVisibleBody(rowRange, columnRange, options.renderVersion);
		this.table.setAttribute("aria-rowcount", String(rowRange.totalCount));
		this.table.setAttribute("aria-colcount", String(columnRange.totalCount));
		this.syncHeaderScroll();
		if (visibleRangeChanged) {
			this.onDidChangeVisibleRangeEmitter.fire({ previous: previousState, current: nextState });
		}
		return headerChanged || columnsChanged || cellsChanged || bodyVisibilityChanged || columnLayoutChanged || zoomChanged;
	}

	public clearBodyCells(): void {
		if (!this.options.renderer.clearBodyCell) {
			return;
		}

		this.forEachBodyCell(cell => {
			this.options.renderer.clearBodyCell?.(cell.element);
			cell.appliedRenderVersion = undefined;
		});
	}

	public rerenderBodyCells(
		ranges: readonly VirtualTableCellRange[],
		renderVersion: unknown,
	): void {
		for (const range of ranges) {
			const startRow = Math.max(this.state.rowRange.startIndex, range.startRow);
			const endRow = Math.min(this.state.rowRange.endIndex - 1, range.endRow);
			const startCol = Math.max(this.state.columnRange.startIndex, range.startCol);
			const endCol = Math.min(this.state.columnRange.endIndex - 1, range.endCol);
			if (startRow > endRow || startCol > endCol) {
				continue;
			}

			for (let rowIndex = startRow; rowIndex <= endRow; rowIndex += 1) {
				const rowOffset = rowIndex - this.state.rowRange.startIndex;
				const row = this.bodyGrid[rowOffset];
				if (!row || row.element.hidden) {
					continue;
				}

				for (let colIndex = startCol; colIndex <= endCol; colIndex += 1) {
					const columnOffset = colIndex - this.state.columnRange.startIndex;
					const cell = row.cells[columnOffset];
					if (!cell || cell.element.hidden) {
						continue;
					}

					this.options.renderer.renderBodyCell(cell.element, {
						rowIndex,
						rowOffset,
						colIndex,
						columnOffset,
					});
					cell.appliedRenderVersion = renderVersion;
					cell.appliedRowIndex = rowIndex;
					cell.appliedColIndex = colIndex;
				}
			}
		}
	}

	public forEachBodyCell(callback: (cell: VirtualTableBodyCell) => void): void {
		for (const row of this.bodyGrid) {
			for (const cell of row.cells) {
				callback(cell);
			}
		}
	}

	public getBodyCell(rowOffset: number, columnOffset: number): HTMLTableCellElement | null {
		return this.bodyGrid[rowOffset]?.cells[columnOffset]?.element ?? null;
	}

	public getColumnHeaderCell(columnOffset: number): HTMLElement | null {
		return this.headerCells[columnOffset] ?? null;
	}

	public isContentVisible(): boolean {
		return this.viewport.firstChild === this.content &&
			this.state.rowRange.renderedCount > 0 &&
			this.state.columnRange.renderedCount > 0;
	}

	public isContentAttached(): boolean {
		return this.viewport.firstChild === this.content;
	}

	public replaceViewportContent(element?: HTMLElement): void {
		this.viewport.replaceChildren();
		if (element) {
			this.viewport.append(element);
		}
	}

	public attachContent(): boolean {
		if (this.viewport.firstChild === this.content) {
			return false;
		}

		this.viewport.replaceChildren(this.content);
		return true;
	}

	public getScrollPosition(): VirtualTableScrollEvent {
		return this.scrollArea.getScrollPosition();
	}

	public resetScrollTop(): void {
		this.scrollArea.setScrollPosition({ scrollTop: 0 });
	}

	public scrollHorizontally(delta: number): boolean {
		if (!this.isContentVisible()) {
			return false;
		}

		const { scrollLeft } = this.getScrollPosition();
		const { scrollWidth, clientWidth } = this.scrollArea.getScrollDimensions();
		const maxScrollLeft = Math.max(0, scrollWidth - clientWidth);
		const nextScrollLeft = Math.max(0, Math.min(maxScrollLeft, scrollLeft + delta));
		if (Math.abs(nextScrollLeft - scrollLeft) < 0.5) {
			return false;
		}

		this.scrollArea.setScrollPosition({ scrollLeft: nextScrollLeft });
		this.syncHeaderScroll();
		return true;
	}

	public revealCell(
		rowIndex: number,
		colIndex: number,
		zoomPercent: number,
		getColumnWidth: (colIndex: number) => number,
	): boolean {
		const verticalChanged = this.revealCellVertically(rowIndex, zoomPercent);
		const horizontalChanged = this.revealCellHorizontally(colIndex, zoomPercent, getColumnWidth);
		return verticalChanged || horizontalChanged;
	}

	public getColumnResizeBoundaryLeft(colIndex: number): number | null {
		const columnOffset = colIndex - this.state.columnRange.startIndex;
		if (columnOffset < 0 || columnOffset >= this.state.columnRange.renderedCount) {
			return null;
		}

		const headerCell = this.headerCells[columnOffset];
		if (!headerCell || headerCell.hidden) {
			return null;
		}

		return headerCell.getBoundingClientRect().right - this.body.getBoundingClientRect().left;
	}

	public syncColumnResizeGuide(left: number | null): void {
		if (left === null) {
			this.columnResizeGuide.hidden = true;
			this.columnResizeGuide.style.left = "";
			return;
		}

		this.columnResizeGuide.hidden = false;
		this.columnResizeGuide.style.left = `${left}px`;
	}

	public syncHeaderScroll(): void {
		const { scrollLeft } = this.getScrollPosition();
		this.headerContent.style.transform = scrollLeft === 0
			? ""
			: `translateX(${-scrollLeft}px)`;
	}

	private onScroll(): void {
		this.syncHeaderScroll();
		this.renderVisibleRangeFromScroll();
		const { scrollLeft, scrollTop } = this.getScrollPosition();
		this.onDidScrollEmitter.fire({
			scrollLeft,
			scrollTop,
		});
	}

	private renderVisibleRangeFromScroll(): void {
		const options = this.lastRenderOptions;
		if (!options || !this.isContentAttached()) {
			return;
		}

		const nextState = this.resolveVisibleState(options);
		if (isVirtualTableStateEqual(this.state, nextState)) {
			return;
		}

		this.render(options);
	}

	private resolveVisibleState(options: VirtualTableRenderOptions): VirtualTableState {
		return {
			rowRange: this.resolveVisibleRowRange(options.rowCount, options.zoomPercent),
			columnRange: this.resolveVisibleColumnRange(options.columnCount, options.zoomPercent),
		};
	}

	private resolveVisibleRowRange(totalCount: unknown, zoomPercent: number): VirtualTableRange {
		return VirtualTableGridModel.resolveViewportRange({
			totalCount,
			maxRenderedCount: this.maxRenderedRows,
			rowHeight: VirtualTableGridModel.getRowHeight(zoomPercent),
			scrollTop: this.getScrollPosition().scrollTop,
			viewportHeight: this.viewport.clientHeight,
		});
	}

	private resolveVisibleColumnRange(totalCount: unknown, zoomPercent: number): VirtualTableColumnRange {
		const rowHeaderWidth = VirtualTableGridModel.getRowHeaderWidth(zoomPercent);
		const viewportWidth = Math.max(0, this.viewport.clientWidth - rowHeaderWidth);
		const displayColumnCount = VirtualTableGridModel.resolveDisplayColumnCount({
			totalCount,
			maxDisplayedCount: this.maxRenderedColumns,
			viewportWidth,
			zoomPercent,
			getColumnWidth: colIndex => this.options.getColumnWidth(colIndex),
		});
		return VirtualTableGridModel.resolveColumnViewportRange({
			totalCount: displayColumnCount,
			maxRenderedCount: this.maxRenderedColumns,
			scrollLeft: this.getScrollPosition().scrollLeft,
			viewportWidth,
			zoomPercent,
			getColumnWidth: colIndex => this.options.getColumnWidth(colIndex),
		});
	}

	private ensureHeaderGrid(): boolean {
		let changed = false;
		if (this.headerColumnCount < this.maxRenderedColumns) {
			const startIndex = this.headerColumnCount;
			this.headerColumnCount = this.maxRenderedColumns;

			for (let colIndex = startIndex; colIndex < this.maxRenderedColumns; colIndex += 1) {
				const cell = document.createElement("div");
				cell.className = this.classNames.headerCell;
				cell.setAttribute("role", "columnheader");
				this.headerCells.push(cell);
				this.headerContent.insertBefore(cell, this.headerTrailingSpacer);
			}

			changed = true;
		}

		return changed;
	}

	private ensureBodyColumns(): boolean {
		if (this.bodyDataColumns.length > 0) {
			return false;
		}

		this.columnGroup.append(this.rowHeaderColumn, this.bodyLeadingSpacerColumn);

		for (let colIndex = 0; colIndex < this.maxRenderedColumns; colIndex += 1) {
			const column = document.createElement("col");
			column.className = this.classNames.dataCol;
			this.bodyDataColumns.push(column);
			this.columnGroup.append(column);
		}

		this.columnGroup.append(this.bodyTrailingSpacerColumn);
		return true;
	}

	private ensureBodyCells(): boolean {
		if (this.bodyGrid.length > 0) {
			return false;
		}

		this.bodyRows.append(this.topSpacerRow);

		for (let rowIndex = 0; rowIndex < this.maxRenderedRows; rowIndex += 1) {
			const row = document.createElement("tr");
			const rowHeader = document.createElement("th");
			const rowHeaderLabel = document.createElement("span");
			const leadingSpacer = document.createElement("td");
			const trailingSpacer = document.createElement("td");
			const cells: VirtualTableBodyCell[] = [];

			rowHeader.scope = "row";
			rowHeaderLabel.className = this.classNames.rowHeaderLabel;
			rowHeader.append(rowHeaderLabel);
			row.append(rowHeader);
			leadingSpacer.className = this.classNames.columnSpacerCell;
			leadingSpacer.setAttribute("aria-hidden", "true");
			row.append(leadingSpacer);

			for (let colIndex = 0; colIndex < this.maxRenderedColumns; colIndex += 1) {
				const cell = document.createElement("td");
				cell.className = this.classNames.cell;
				cell.dataset.rowIndex = String(rowIndex);
				cell.dataset.colIndex = String(colIndex);
				row.append(cell);
				cells.push({ element: cell });
			}

			trailingSpacer.className = this.classNames.columnSpacerCell;
			trailingSpacer.setAttribute("aria-hidden", "true");
			row.append(trailingSpacer);

			this.bodyGrid.push({
				element: row,
				rowHeader,
				leadingSpacer,
				cells,
				trailingSpacer,
			});
			this.bodyRows.append(row);
		}

		this.bodyRows.append(this.bottomSpacerRow);
		return true;
	}

	private syncColumnLayout(columnRange: VirtualTableColumnRange): boolean {
		let changed = this.syncColumnSpacers(columnRange);
		for (let columnOffset = 0; columnOffset < this.maxRenderedColumns; columnOffset += 1) {
			const colIndex = columnRange.startIndex + columnOffset;
			const isVisible = columnOffset < columnRange.renderedCount;
			const width = isVisible ? this.getColumnCssWidth(colIndex, this.renderedZoomPercent ?? 100) : "";
			if (this.applyHeaderColumnWidth(columnOffset, width)) {
				changed = true;
			}
			if (this.applyBodyColumnWidth(columnOffset, width)) {
				changed = true;
			}
		}
		return changed;
	}

	private syncColumnSpacers(columnRange: VirtualTableColumnRange): boolean {
		const leadingWidth = `${columnRange.leadingWidth}px`;
		const trailingWidth = `${columnRange.trailingWidth}px`;
		let changed = false;
		if (setElementWidth(this.headerLeadingSpacer, leadingWidth)) {
			changed = true;
		}
		if (setElementWidth(this.headerTrailingSpacer, trailingWidth)) {
			changed = true;
		}
		if (setColumnWidth(this.bodyLeadingSpacerColumn, leadingWidth)) {
			changed = true;
		}
		if (setColumnWidth(this.bodyTrailingSpacerColumn, trailingWidth)) {
			changed = true;
		}
		for (const row of this.bodyGrid) {
			if (setElementWidth(row.leadingSpacer, leadingWidth)) {
				changed = true;
			}
			if (setElementWidth(row.trailingSpacer, trailingWidth)) {
				changed = true;
			}
		}
		return changed;
	}

	private applyHeaderColumnWidth(columnOffset: number, width: string): boolean {
		const cell = this.headerCells[columnOffset];
		return cell ? setElementWidth(cell, width) : false;
	}

	private applyBodyColumnWidth(columnOffset: number, width: string): boolean {
		let changed = false;
		const column = this.bodyDataColumns[columnOffset];
		if (column && setColumnWidth(column, width)) {
			changed = true;
		}

		for (const row of this.bodyGrid) {
			const cell = row.cells[columnOffset];
			if (cell && setElementWidth(cell.element, width)) {
				changed = true;
			}
		}
		return changed;
	}

	private syncBodyGridVisibility(
		rowRange: VirtualTableRange,
		columnRange: VirtualTableColumnRange,
		previousState: VirtualTableState,
	): boolean {
		const rowCount = rowRange.renderedCount;
		const columnCount = columnRange.renderedCount;
		const changed = !isVirtualTableStateEqual(previousState, { rowRange, columnRange });
		const spacerChanged = this.syncVirtualSpacers(rowRange, columnCount);

		for (let rowIndex = 0; rowIndex < this.bodyGrid.length; rowIndex += 1) {
			const row = this.bodyGrid[rowIndex];
			const actualRowIndex = rowRange.startIndex + rowIndex;
			const rowHidden = rowIndex >= rowCount;
			if (row.appliedHidden !== rowHidden) {
				row.element.hidden = rowHidden;
				row.appliedHidden = rowHidden;
			}
			if (!rowHidden && row.appliedRowIndex !== actualRowIndex) {
				row.element.setAttribute("aria-rowindex", String(actualRowIndex + 1));
				row.appliedRowIndex = actualRowIndex;
				this.options.renderer.renderRowHeader(row.rowHeader, {
					rowIndex: actualRowIndex,
					rowOffset: rowIndex,
				});
			}

			for (let colIndex = 0; colIndex < row.cells.length; colIndex += 1) {
				const cell = row.cells[colIndex];
				const actualColIndex = columnRange.startIndex + colIndex;
				const cellHidden = colIndex >= columnCount;
				if (cell.appliedHidden !== cellHidden) {
					cell.element.hidden = cellHidden;
					cell.appliedHidden = cellHidden;
				}
				if (!rowHidden && !cellHidden && (
					cell.appliedRowIndex !== actualRowIndex ||
					cell.appliedColIndex !== actualColIndex
				)) {
					cell.element.dataset.colIndex = String(actualColIndex);
					cell.element.dataset.rowIndex = String(actualRowIndex);
					cell.element.setAttribute("aria-colindex", String(actualColIndex + 1));
					cell.appliedRowIndex = actualRowIndex;
					cell.appliedColIndex = actualColIndex;
				}
			}
		}

		for (let colIndex = 0; colIndex < this.maxRenderedColumns; colIndex += 1) {
			const column = this.bodyDataColumns[colIndex];
			if (column) {
				column.hidden = colIndex >= columnCount;
			}
		}

		return changed || spacerChanged;
	}

	private syncVirtualSpacers(rowRange: VirtualTableRange, columnCount: number): boolean {
		const { topHeight, bottomHeight } = VirtualTableGridModel.getSpacerHeights(
			rowRange,
			VirtualTableGridModel.getRowHeight(this.renderedZoomPercent ?? 100),
		);
		const colSpan = Math.max(1, columnCount + 3);
		const topChanged = syncSpacerRow(this.topSpacerRow, this.topSpacerCell, topHeight, colSpan);
		const bottomChanged = syncSpacerRow(
			this.bottomSpacerRow,
			this.bottomSpacerCell,
			bottomHeight,
			colSpan,
		);
		return topChanged || bottomChanged;
	}

	private renderVisibleHeaders(columnRange: VirtualTableColumnRange): void {
		for (let columnOffset = 0; columnOffset < this.maxRenderedColumns; columnOffset += 1) {
			const cell = this.headerCells[columnOffset];
			if (!cell) {
				continue;
			}

			const hidden = columnOffset >= columnRange.renderedCount;
			setHidden(cell, hidden);
			if (hidden) {
				continue;
			}

			const colIndex = columnRange.startIndex + columnOffset;
			this.options.renderer.renderColumnHeader(cell, {
				colIndex,
				columnOffset,
			});
			cell.setAttribute("aria-colindex", String(colIndex + 1));
		}
	}

	private renderVisibleBody(
		rowRange: VirtualTableRange,
		columnRange: VirtualTableColumnRange,
		renderVersion: unknown,
	): void {
		for (let rowOffset = 0; rowOffset < rowRange.renderedCount; rowOffset += 1) {
			const row = this.bodyGrid[rowOffset];
			const rowIndex = rowRange.startIndex + rowOffset;
			for (let columnOffset = 0; columnOffset < columnRange.renderedCount; columnOffset += 1) {
				const colIndex = columnRange.startIndex + columnOffset;
				const cell = row.cells[columnOffset];
				if (
					cell.appliedRenderVersion === renderVersion &&
					cell.appliedRowIndex === rowIndex &&
					cell.appliedColIndex === colIndex
				) {
					continue;
				}

				this.options.renderer.renderBodyCell(cell.element, {
					rowIndex,
					rowOffset,
					colIndex,
					columnOffset,
				});
				cell.appliedRenderVersion = renderVersion;
			}
		}
	}

	private revealCellVertically(rowIndex: number, zoomPercent: number): boolean {
		const rowHeight = VirtualTableGridModel.getRowHeight(zoomPercent);
		const top = rowIndex * rowHeight;
		const bottom = top + rowHeight;
		const { scrollTop: viewportTop } = this.getScrollPosition();
		const viewportBottom = viewportTop + this.viewport.clientHeight;
		const nextScrollTop = top < viewportTop
			? top
			: bottom > viewportBottom
				? bottom - this.viewport.clientHeight
				: viewportTop;
		if (Math.abs(nextScrollTop - viewportTop) < 0.5) {
			return false;
		}

		this.scrollArea.setScrollPosition({ scrollTop: Math.max(0, nextScrollTop) });
		return true;
	}

	private revealCellHorizontally(
		colIndex: number,
		zoomPercent: number,
		getColumnWidth: (colIndex: number) => number,
	): boolean {
		const scale = VirtualTableGridModel.getZoomScale(zoomPercent);
		const rowHeaderWidth = VirtualTableGridModel.getRowHeaderWidth(zoomPercent);
		const left = this.getColumnOffset(colIndex, zoomPercent, getColumnWidth);
		const right = left + (getColumnWidth(colIndex) * scale);
		const { scrollLeft } = this.getScrollPosition();
		const viewportLeft = scrollLeft + rowHeaderWidth;
		const viewportRight = scrollLeft + this.viewport.clientWidth;
		const nextScrollLeft = left < viewportLeft
			? left - rowHeaderWidth
			: right > viewportRight
				? right - this.viewport.clientWidth
				: scrollLeft;
		if (Math.abs(nextScrollLeft - scrollLeft) < 0.5) {
			return false;
		}

		this.scrollArea.setScrollPosition({ scrollLeft: Math.max(0, nextScrollLeft) });
		return true;
	}

	private getColumnOffset(
		colIndex: number,
		zoomPercent: number,
		getColumnWidth: (colIndex: number) => number,
	): number {
		const scale = VirtualTableGridModel.getZoomScale(zoomPercent);
		let offset = VirtualTableGridModel.getRowHeaderWidth(zoomPercent);
		for (let index = 0; index < colIndex; index += 1) {
			offset += getColumnWidth(index) * scale;
		}
		return offset;
	}

	private getColumnCssWidth(colIndex: number, zoomPercent: number): string {
		const width = this.options.getColumnWidth(colIndex) *
			VirtualTableGridModel.getZoomScale(zoomPercent);
		return `${width}px`;
	}
}

const toSafeCount = (value: unknown): number => {
	const count = Math.floor(Number(value));
	return Number.isInteger(count) && count > 0 ? count : 0;
};

const toSafeIndex = (value: unknown): number => {
	const index = Math.floor(Number(value));
	return Number.isInteger(index) && index >= 0 ? index : -1;
};

const normalizeCellRanges = (ranges: readonly VirtualTableCellRange[]): VirtualTableCellRange[] =>
	ranges.map(normalizeCellRange).filter(range => range !== null);

const normalizeCellRange = (range: VirtualTableCellRange): VirtualTableCellRange | null => {
	const startRow = toSafeIndex(range.startRow);
	const endRow = toSafeIndex(range.endRow);
	const startCol = toSafeIndex(range.startCol);
	const endCol = toSafeIndex(range.endCol);
	if (startRow < 0 || endRow < 0 || startCol < 0 || endCol < 0) {
		return null;
	}

	return {
		startRow: Math.min(startRow, endRow),
		endRow: Math.max(startRow, endRow),
		startCol: Math.min(startCol, endCol),
		endCol: Math.max(startCol, endCol),
	};
};

const areCellRangeListsEqual = (
	first: readonly VirtualTableCellRange[],
	second: readonly VirtualTableCellRange[],
): boolean => {
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
};

const subtractCellRangeLists = (
	source: readonly VirtualTableCellRange[],
	subtract: readonly VirtualTableCellRange[],
): VirtualTableCellRange[] => {
	let remaining = [...source];
	for (const range of subtract) {
		remaining = remaining.flatMap(candidate => subtractCellRange(candidate, range));
	}
	return remaining;
};

const subtractCellRange = (
	source: VirtualTableCellRange,
	subtract: VirtualTableCellRange,
): VirtualTableCellRange[] => {
	const intersection = intersectCellRange(source, subtract);
	if (!intersection) {
		return [source];
	}

	const ranges: VirtualTableCellRange[] = [];
	const add = (range: VirtualTableCellRange): void => {
		if (range.startRow <= range.endRow && range.startCol <= range.endCol) {
			ranges.push(range);
		}
	};

	add({
		startRow: source.startRow,
		endRow: intersection.startRow - 1,
		startCol: source.startCol,
		endCol: source.endCol,
	});
	add({
		startRow: intersection.endRow + 1,
		endRow: source.endRow,
		startCol: source.startCol,
		endCol: source.endCol,
	});
	add({
		startRow: intersection.startRow,
		endRow: intersection.endRow,
		startCol: source.startCol,
		endCol: intersection.startCol - 1,
	});
	add({
		startRow: intersection.startRow,
		endRow: intersection.endRow,
		startCol: intersection.endCol + 1,
		endCol: source.endCol,
	});

	return ranges;
};

const intersectCellRange = (
	first: VirtualTableCellRange,
	second: VirtualTableCellRange,
): VirtualTableCellRange | null => {
	const range = {
		startRow: Math.max(first.startRow, second.startRow),
		endRow: Math.min(first.endRow, second.endRow),
		startCol: Math.max(first.startCol, second.startCol),
		endCol: Math.min(first.endCol, second.endCol),
	};
	return range.startRow <= range.endRow && range.startCol <= range.endCol ? range : null;
};

const getCellRangeEdges = (range: VirtualTableCellRange): VirtualTableCellRange[] => {
	const edges: VirtualTableCellRange[] = [{
		startRow: range.startRow,
		endRow: range.startRow,
		startCol: range.startCol,
		endCol: range.endCol,
	}];

	if (range.endRow !== range.startRow) {
		edges.push({
			startRow: range.endRow,
			endRow: range.endRow,
			startCol: range.startCol,
			endCol: range.endCol,
		});
	}

	if (range.endRow - range.startRow > 1) {
		edges.push({
			startRow: range.startRow + 1,
			endRow: range.endRow - 1,
			startCol: range.startCol,
			endCol: range.startCol,
		});
		if (range.endCol !== range.startCol) {
			edges.push({
				startRow: range.startRow + 1,
				endRow: range.endRow - 1,
				startCol: range.endCol,
				endCol: range.endCol,
			});
		}
	}

	return edges;
};

function isVirtualTableStateEqual(
	first: VirtualTableState,
	second: VirtualTableState,
): boolean {
	return isVirtualTableRangeEqual(first.rowRange, second.rowRange) &&
		isVirtualTableColumnRangeEqual(first.columnRange, second.columnRange);
}

function isVirtualTableRangeEqual(
	first: VirtualTableRange,
	second: VirtualTableRange,
): boolean {
	return first.totalCount === second.totalCount &&
		first.startIndex === second.startIndex &&
		first.endIndex === second.endIndex &&
		first.renderedCount === second.renderedCount;
}

function isVirtualTableColumnRangeEqual(
	first: VirtualTableColumnRange,
	second: VirtualTableColumnRange,
): boolean {
	return isVirtualTableRangeEqual(first, second) &&
		first.leadingWidth === second.leadingWidth &&
		first.renderedWidth === second.renderedWidth &&
		first.totalWidth === second.totalWidth &&
		first.trailingWidth === second.trailingWidth;
}

const toColumnRange = (
	range: VirtualTableRange,
	leadingWidth: number,
	renderedWidth: number,
	trailingWidth: number,
): VirtualTableColumnRange => ({
	...range,
	leadingWidth,
	renderedWidth,
	totalWidth: leadingWidth + renderedWidth + trailingWidth,
	trailingWidth,
});

const getScaledColumnWidth = (
	colIndex: number,
	getColumnWidth: (colIndex: number) => number,
	scale: number,
): number =>
	clampColumnWidth(getColumnWidth(colIndex)) * scale;

const clampColumnWidth = (value: unknown): number => {
	const width = Math.round(Number(value));
	if (!Number.isFinite(width)) {
		return VirtualTableGridModel.DEFAULT_MIN_COLUMN_WIDTH;
	}
	return Math.min(
		VirtualTableGridModel.DEFAULT_MAX_COLUMN_WIDTH,
		Math.max(VirtualTableGridModel.DEFAULT_MIN_COLUMN_WIDTH, width),
	);
};

const getScaledColumnWidths = (
	count: number,
	getColumnWidth: (colIndex: number) => number,
	scale: number,
): number[] =>
	VirtualTableGridModel.range(count).map(colIndex => getScaledColumnWidth(colIndex, getColumnWidth, scale));

const getPrefixSums = (widths: readonly number[]): number[] => {
	const offsets = [0];
	for (const width of widths) {
		offsets.push(offsets[offsets.length - 1] + width);
	}
	return offsets;
};

const sumWidths = (
	widths: readonly number[],
	startIndex: number,
	endIndex: number,
): number => {
	let total = 0;
	for (let index = startIndex; index < endIndex; index += 1) {
		total += widths[index] ?? 0;
	}
	return total;
};

const findColumnIndexAtOffset = (
	widths: readonly number[],
	offsets: readonly number[],
	targetOffset: number,
): number => {
	for (let index = 0; index < widths.length; index += 1) {
		const start = offsets[index] ?? 0;
		const end = start + (widths[index] ?? 0);
		if (targetOffset < end) {
			return index;
		}
	}
	return Math.max(0, widths.length - 1);
};

const findColumnEndIndexAtOffset = (
	offsets: readonly number[],
	targetOffset: number,
): number => {
	for (let index = 1; index < offsets.length; index += 1) {
		if ((offsets[index] ?? 0) >= targetOffset) {
			return index;
		}
	}
	return Math.max(1, offsets.length - 1);
};

const setHidden = (element: HTMLElement, hidden: boolean): boolean => {
	if (element.hidden === hidden) {
		return false;
	}

	element.hidden = hidden;
	return true;
};

const setElementWidth = (element: HTMLElement, width: string): boolean => {
	let changed = false;
	if (element.style.width !== width) {
		element.style.width = width;
		changed = true;
	}
	if (element.style.minWidth !== width) {
		element.style.minWidth = width;
		changed = true;
	}
	if (element.style.maxWidth !== width) {
		element.style.maxWidth = width;
		changed = true;
	}
	return changed;
};

const setColumnWidth = (column: HTMLTableColElement, width: string): boolean => {
	if (column.style.width === width) {
		return false;
	}

	column.style.width = width;
	return true;
};

const syncSpacerRow = (
	row: HTMLTableRowElement,
	cell: HTMLTableCellElement,
	height: number,
	colSpan: number,
): boolean => {
	const visible = height > 0;
	let changed = setHidden(row, !visible);
	if (cell.colSpan !== colSpan) {
		cell.colSpan = colSpan;
		changed = true;
	}

	const nextHeight = visible ? `${height}px` : "";
	if (cell.style.height !== nextHeight) {
		cell.style.height = nextHeight;
		changed = true;
	}

	return changed;
};
