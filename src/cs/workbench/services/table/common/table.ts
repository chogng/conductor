/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type { Event } from "src/cs/base/common/event";
import type { URI } from "src/cs/base/common/uri";
import { createDecorator } from "src/cs/platform/instantiation/common/instantiation";
import type { ColumnDisplayProfile } from "src/cs/workbench/services/table/common/tableDisplayProfile";
import type { TableColumnWidth } from "src/cs/workbench/services/table/common/tableColumnLayout";

// Pure data types for the table feature. This module is the common contract
// entry point for table records, source keys, constants, and service contracts.

export type TableCell = {
	readonly fileId?: string | null;
	readonly sheetId?: string | null;
	readonly rowIndex: number;
	readonly colIndex: number;
};

export type TableRange = {
	readonly fileId?: string | null;
	readonly sheetId?: string | null;
	readonly startRow: number;
	readonly endRow: number;
	readonly startCol: number;
	readonly endCol: number;
};

export type TableSelection = {
	readonly activeCell?: TableCell | null;
	readonly selectedColumns?: readonly number[];
	readonly ranges?: readonly TableRange[];
};

export type TableSelectionTarget =
	| { readonly kind: "cell"; readonly cell: TableCell | null }
	| { readonly kind: "range"; readonly range: TableRange }
	| { readonly kind: "columns"; readonly columns: readonly number[] };

export type TableRevealTarget =
	| { readonly kind: "cell"; readonly cell: TableCell }
	| { readonly kind: "range"; readonly range: TableRange };

export type TableRevealMode = boolean | "force";

export type TableRevealOptions = {
	readonly reveal?: TableRevealMode;
};

export type TableSelectionTextResult =
	| { readonly kind: "empty" }
	| {
		readonly cellCount: number;
		readonly kind: "tooLarge";
		readonly maxCellCount: number;
	}
	| {
		readonly columnCount: number;
		readonly kind: "ok";
		readonly rowCount: number;
		readonly text: string;
	};

type TableHighlight = {
	readonly columns?: readonly number[];
	readonly ranges?: readonly TableRange[];
};

export type TableSource = {
	readonly resource?: URI | null;
	readonly sheetId?: string | null;
};

type TableFile = {
	fileName: string;
	sheetId?: string | null;
	sheetKey?: string | null;
	sheetName?: string | null;
	sourceVersion?: number;
	rawTableHealth?: "ok" | "suspect" | "decodeFailed" | "parseFailed" | "unsupported" | "empty";
	rawTableHealthMessage?: string | null;
	templateEligibility?: "eligible" | "notEligible" | "needsUserAction";
	rowCount: number;
	columnCount: number;
	maxCellLengths: number[];
};

type TableLoadState = {
	state: "idle" | "loading" | "ready" | "error";
	message: string;
};

type TableCellReadRequest = {
	colIndex: number;
	rowIndex: number;
};

/**
 * Half-open dirty range from the table view model. Missing row/column bounds mean
 * the change applies to the currently visible span on that axis.
 */
export type TableDirtyRange = {
	readonly endCol?: number;
	readonly endRow?: number;
	readonly startCol?: number;
	readonly startRow?: number;
};

export type TableRowsVersionChangeEvent = {
	readonly full: boolean;
	readonly kind: "content" | "display" | "reset";
	readonly ranges: readonly TableDirtyRange[];
	readonly version: number;
};

export type TableState = {
	readonly selectedSheetId?: string | null;
	readonly source?: TableSource | null;
	readonly sheetKey?: string | null;
	readonly fileName: string;
	readonly file: TableFile | null;
	readonly loadState: TableLoadState;
	readonly dimensions?: string;
	readonly displayVersion?: number;
};

export type TableViewModel = {
	cancelPendingRowRequests: () => void;
	clearState: (options?: { clearSelection?: boolean }) => void;
	ensureCells: (
		sheetKey: string,
		cells: TableCellReadRequest[],
	) => Promise<void>;
	ensureRows: (
		sheetKey: string,
		startRow: number,
		endRow: number,
	) => Promise<void>;
	adjustColumnDisplayScale: (colIndex: number, deltaExponent: number) => boolean;
	getColumnDisplayProfile: (colIndex: number) => ColumnDisplayProfile;
	getRow: (rowIndex: number) => unknown[] | null;
	getRowsVersion: () => number;
	getState: () => TableState;
	getRevealCell: () => TableCell | null;
	getSelection: () => TableSelection;
	invalidateRequests: () => void;
	onDidChangeState: (callback: () => void) => () => void;
	onDidChangeSelection: (callback: (selection: TableSelection) => void) => () => void;
	revealCell: (cell: TableCell | null) => void;
	resetColumnDisplayScale: (colIndex: number) => boolean;
	clearHighlight: () => void;
	clearSelection: () => boolean;
	getHighlight: () => TableHighlight;
	highlightColumns: (columnIndexes: readonly number[]) => void;
	onDidChangeHighlight: (callback: (highlight: TableHighlight) => void) => () => void;
	onDidChangeRevealCell: (callback: (cell: TableCell | null) => void) => () => void;
	selectAllColumns: () => boolean;
	setSelection: (selection: TableSelection | null) => void;
	subscribeRowsVersion: (callback: (event: TableRowsVersionChangeEvent) => void) => () => void;
};

export type TableWidgetViewModel = Pick<
	TableViewModel,
	| "ensureRows"
	| "getColumnDisplayProfile"
	| "getHighlight"
	| "getRow"
	| "getRowsVersion"
	| "getRevealCell"
	| "getSelection"
	| "getState"
	| "onDidChangeHighlight"
	| "onDidChangeRevealCell"
	| "onDidChangeSelection"
	| "onDidChangeState"
	| "subscribeRowsVersion"
>;

export type TableViewInput = {
	readonly tableViewModel: TableWidgetViewModel;
	readonly tableState: TableState;
};

export const getTableSourceIdentityKey = (
	source: TableSource | null | undefined,
): string | null => {
	return getTableSourceResourceKey(source);
};

export const normalizeTableSource = (
	source: TableSource | null | undefined,
): TableSource | null => {
	const resource = source?.resource ?? null;
	if (!resource) {
		return null;
	}

	const sheetId = typeof source?.sheetId === "string" && source.sheetId.trim()
		? source.sheetId.trim()
		: null;
	return {
		resource,
		sheetId,
	};
};

export const areTableSourcesEqual = (
	current: TableSource | null | undefined,
	next: TableSource | null | undefined,
): boolean => {
	const currentSource = normalizeTableSource(current);
	const nextSource = normalizeTableSource(next);
	if (!currentSource || !nextSource) {
		return currentSource === nextSource;
	}

	const currentResourceKey = getTableSourceResourceKey(currentSource);
	const nextResourceKey = getTableSourceResourceKey(nextSource);
	return currentResourceKey === nextResourceKey &&
		currentSource.sheetId === nextSource.sheetId;
};

export const toTableSheetKey = (source: TableSource): string => {
	const resourceKey = getTableSourceResourceKey(source);
	if (resourceKey) {
		const sheetId = typeof source.sheetId === "string" && source.sheetId
			? encodeURIComponent(source.sheetId)
			: "";
		return sheetId ? `${resourceKey}::${sheetId}` : resourceKey;
	}

	return "";
};

const getTableSourceResourceKey = (
	source: TableSource | null | undefined,
): string | null => {
	const resourceKey = source?.resource?.toString()?.trim() ?? "";
	return resourceKey || null;
};

export const TABLE_COPY_MAX_CELLS = 100_000;

export const ITableService = createDecorator<ITableService>("tableService");

export interface ITableService {
	readonly _serviceBrand: undefined;
	readonly onDidChangeSelection: Event<TableSelection>;
	readonly onDidChangeTableViewInput: Event<void>;
	adjustColumnDisplayScale(colIndex: number, deltaExponent: number): boolean;
	clearSelection(): boolean;
	clearHighlight(): void;
	getColumnWidths(sheetKey: string | null | undefined): readonly TableColumnWidth[];
	getPreviewRow(rowIndex: number): unknown[] | null;
	getSelection(): TableSelection;
	getSelectionText(maxCellCount?: number): Promise<TableSelectionTextResult>;
	getViewInput(): TableViewInput | null;
	highlightColumns(columnIndexes: readonly number[]): void;
	open(source: TableSource | null): void;
	reveal(target: TableRevealTarget | null, options?: TableRevealOptions): boolean;
	resetColumnDisplayScale(colIndex: number): boolean;
	select(target: TableSelectionTarget | null, reveal?: TableRevealMode): boolean;
	selectAllColumns(): boolean;
	storeColumnWidths(
		sheetKey: string | null | undefined,
		widths: readonly TableColumnWidth[],
	): void;
}
