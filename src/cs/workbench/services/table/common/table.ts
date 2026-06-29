/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type { Event } from "src/cs/base/common/event";
import type { URI } from "src/cs/base/common/uri";
import type { CancellationToken } from "src/cs/base/common/cancellation";
import { createDecorator } from "src/cs/platform/instantiation/common/instantiation";
import type { IDecorationData } from "src/cs/workbench/services/decorations/common/decorations";
import type { ColumnDisplayProfile } from "src/cs/workbench/services/table/common/tableDisplayProfile";
import type { TableColumnWidth } from "src/cs/workbench/services/table/common/tableColumnLayout";
import type { TableParseDiagnostic } from "src/cs/workbench/services/table/common/model";

// Pure data types for the table feature. This module is the common contract
// entry point for table records, source identity, constants, and service contracts.

export type TableCell = {
	readonly sheetId?: string | null;
	readonly rowIndex: number;
	readonly colIndex: number;
};

export type TableRange = {
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

export type TableTemplateDecorationKind =
	| "templateBlock"
	| "templateX"
	| "templateY";

export type TableRangeDecoration = TableRange & {
	readonly kind: TableTemplateDecorationKind;
};

export type TableDecorationData = IDecorationData<{
	readonly tableRangeDecorations: readonly TableRangeDecoration[];
}>;

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

export type TableCellValueResult =
	| { readonly kind: "empty" }
	| {
		readonly cell: TableCell;
		readonly kind: "ok";
		readonly value: string;
	};

export type TableCellSearchQuery = {
	readonly pattern: string;
	readonly isCaseSensitive?: boolean;
	readonly isRegExp?: boolean;
	readonly matchWholeCell?: boolean;
	readonly range?: TableRange | null;
	readonly sheetId?: string | null;
};

export type TableCellSearchMatch = {
	readonly cell: TableCell;
	readonly value: string;
};

export type TableCellSearchResult =
	| { readonly kind: "empty" }
	| {
		readonly kind: "invalidPattern";
		readonly message: string;
	}
	| { readonly kind: "notFound" }
	| {
		readonly kind: "ok";
		readonly match: TableCellSearchMatch;
	};

type TableHighlight = {
	readonly columns?: readonly number[];
	readonly ranges?: readonly TableRange[];
};

export type TableSource = {
	readonly resource: URI;
	readonly sheetId?: string | null;
};

export type TableSourceInput = {
	readonly resource?: URI | null;
	readonly sheetId?: string | null;
};

export type TablePreviewHealth = "ok" | "suspect" | "decodeFailed" | "parseFailed" | "unsupported" | "empty";

export type TableSheetTab = {
	readonly columnCount: number;
	readonly label: string;
	readonly rowCount: number;
	readonly sheetId?: string | null;
	readonly sheetName?: string | null;
	readonly source: TableSource;
};

type TableFile = {
	fileName: string;
	sheetId?: string | null;
	sheetName?: string | null;
	source?: TableSource | null;
	sourceVersion?: number;
	diagnostics?: readonly TableParseDiagnostic[];
	previewHealth?: TablePreviewHealth;
	previewHealthMessage?: string | null;
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
	readonly fileName: string;
	readonly file: TableFile | null;
	readonly sheets: readonly TableSheetTab[];
	readonly loadState: TableLoadState;
	readonly dimensions?: string;
	readonly displayVersion?: number;
};

export type TableViewModel = {
	cancelPendingRowRequests: () => void;
	clearState: (options?: { clearSelection?: boolean }) => void;
	ensureCells: (
		cells: TableCellReadRequest[],
	) => Promise<void>;
	ensureRows: (
		startRow: number,
		endRow: number,
	) => Promise<void>;
	adjustColumnDisplayScale: (colIndex: number, deltaExponent: number) => boolean;
	getColumnDisplayProfile: (colIndex: number) => ColumnDisplayProfile;
	get: (rowIndex: number) => unknown[];
	getRow: (rowIndex: number) => unknown[] | null;
	getRowsVersion: () => number;
	getState: () => TableState;
	getRangeDecorations: () => readonly TableRangeDecoration[];
	isResolved: (rowIndex: number) => boolean;
	getRevealCell: () => TableCell | null;
	getSelection: () => TableSelection;
	invalidateRequests: () => void;
	onDidChangeState: (callback: () => void) => () => void;
	onDidChangeRangeDecorations: (callback: (decorations: readonly TableRangeDecoration[]) => void) => () => void;
	onDidChangeSelection: (callback: (selection: TableSelection) => void) => () => void;
	revealCell: (cell: TableCell | null) => void;
	resolve: (rowIndex: number, cancellationToken: CancellationToken) => Promise<unknown[]>;
	resetColumnDisplayScale: (colIndex: number) => boolean;
	clearHighlight: () => void;
	clearSelection: () => boolean;
	getHighlight: () => TableHighlight;
	highlightColumns: (columnIndexes: readonly number[]) => void;
	onDidChangeHighlight: (callback: (highlight: TableHighlight) => void) => () => void;
	onDidChangeRevealCell: (callback: (cell: TableCell | null) => void) => () => void;
	selectAllColumns: () => boolean;
	setRangeDecorations: (decorations: readonly TableRangeDecoration[]) => void;
	setSelection: (selection: TableSelection | null) => void;
	subscribeRowsVersion: (callback: (event: TableRowsVersionChangeEvent) => void) => () => void;
};

export type TableWidgetViewModel = Pick<
	TableViewModel,
	| "getColumnDisplayProfile"
	| "get"
	| "getHighlight"
	| "getRangeDecorations"
	| "getRowsVersion"
	| "isResolved"
	| "getRevealCell"
	| "getSelection"
	| "getState"
	| "onDidChangeHighlight"
	| "onDidChangeRangeDecorations"
	| "onDidChangeRevealCell"
	| "onDidChangeSelection"
	| "onDidChangeState"
	| "resolve"
	| "subscribeRowsVersion"
>;

export type TableViewInput = {
	readonly tableViewModel: TableWidgetViewModel;
	readonly tableState: TableState;
};

export const normalizeTableSource = (
	source: TableSourceInput | null | undefined,
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
	current: TableSourceInput | null | undefined,
	next: TableSourceInput | null | undefined,
): boolean => {
	const currentSource = normalizeTableSource(current);
	const nextSource = normalizeTableSource(next);
	if (!currentSource || !nextSource) {
		return currentSource === nextSource;
	}

	const currentResourceIdentity = getTableSourceResourceIdentity(currentSource);
	const nextResourceIdentity = getTableSourceResourceIdentity(nextSource);
	return currentResourceIdentity === nextResourceIdentity &&
		currentSource.sheetId === nextSource.sheetId;
};

export const toTableSheetKey = (source: TableSource): string => {
	const resourceIdentity = getTableSourceResourceIdentity(source);
	if (resourceIdentity) {
		const sheetId = typeof source.sheetId === "string" && source.sheetId
			? encodeURIComponent(source.sheetId)
			: "";
		return sheetId ? `${resourceIdentity}::${sheetId}` : resourceIdentity;
	}

	return "";
};

const TableDecorationFragment = "conductor.tableDecoration";
const TableDecorationSheetFragmentPrefix = `${TableDecorationFragment}.sheetId=`;

export const createTableDecorationResource = (
	source: TableSourceInput | null | undefined,
	sheetId?: string | null,
): URI | null => {
	const normalizedSource = normalizeTableSource(source);
	if (!normalizedSource) {
		return null;
	}

	const normalizedSheetId = normalizeTableText(sheetId) || normalizeTableText(normalizedSource.sheetId);
	return normalizedSource.resource.with({
		fragment: normalizedSheetId
			? `${TableDecorationSheetFragmentPrefix}${encodeURIComponent(normalizedSheetId)}`
			: TableDecorationFragment,
	});
};

export const parseTableDecorationResource = (
	resource: URI,
): TableSource | null => {
	const fragment = normalizeTableText(resource.fragment);
	if (fragment === TableDecorationFragment) {
		return {
			resource: resource.with({ fragment: "" }),
		};
	}
	if (fragment.startsWith(TableDecorationSheetFragmentPrefix)) {
		const sheetId = decodeURIComponent(fragment.slice(TableDecorationSheetFragmentPrefix.length));
		return {
			resource: resource.with({ fragment: "" }),
			...(sheetId ? { sheetId } : {}),
		};
	}
	return null;
};

export const createTableDecorationData = (
	tableRangeDecorations: readonly TableRangeDecoration[],
): TableDecorationData | undefined =>
	tableRangeDecorations.length
		? { tableRangeDecorations }
		: undefined;

export const getTableRangeDecorationsFromDecorationData = (
	decorationData: readonly IDecorationData[],
): readonly TableRangeDecoration[] =>
	decorationData.flatMap(data =>
		Array.isArray((data as Partial<TableDecorationData>).tableRangeDecorations)
			? (data as TableDecorationData).tableRangeDecorations
			: [],
	);

const getTableSourceResourceIdentity = (
	source: TableSourceInput | null | undefined,
): string | null => {
	const resourceIdentity = source?.resource?.toString()?.trim() ?? "";
	return resourceIdentity || null;
};

const normalizeTableText = (value: unknown): string => String(value ?? "").trim();

export const TABLE_COPY_MAX_CELLS = 100_000;

export const ITableService = createDecorator<ITableService>("tableService");

export interface ITableService {
	readonly _serviceBrand: undefined;
	readonly onDidChangeSelection: Event<TableSelection>;
	readonly onDidChangeTableViewInput: Event<void>;
	adjustColumnDisplayScale(colIndex: number, deltaExponent: number): boolean;
	clearSelection(): boolean;
	clearHighlight(): void;
	findCell(query: TableCellSearchQuery): Promise<TableCellSearchResult>;
	getCellValue(cell: TableCell): Promise<TableCellValueResult>;
	getColumnWidths(source: TableSource | null | undefined): readonly TableColumnWidth[];
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
		source: TableSource | null | undefined,
		widths: readonly TableColumnWidth[],
	): void;
}
