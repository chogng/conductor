/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type { Event } from "src/cs/base/common/event";
import { createDecorator } from "src/cs/platform/instantiation/common/instantiation";
import type { ConvertedCsvReaderService } from "src/cs/workbench/services/files/common/fileConverterBackend";
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
	readonly fileId: string;
	readonly sheetId?: string | null;
};

type TableFile = {
	fileId: string;
	fileName: string;
	sheetId?: string | null;
	sheetName?: string | null;
	sourceKey?: string;
	sourceVersion?: number;
	assessmentHealth?: "ok" | "suspect" | "decodeFailed" | "parseFailed" | "unsupported" | "empty";
	assessmentHealthMessage?: string | null;
	templateEligibility?: "eligible" | "notEligible" | "needsUserAction";
	rowCount: number;
	columnCount: number;
	maxCellLengths: number[];
};

type TableLoadState = {
	state: "idle" | "loading" | "ready" | "error";
	message: string;
};

export type TableRowsReaderResultPayload = {
	readonly message?: string;
	readonly ok?: boolean;
	readonly result?: unknown;
	readonly [key: string]: unknown;
};

type TableCellReadRequest = {
	colIndex: number;
	rowIndex: number;
};

/**
 * Half-open dirty range from the table model. Missing row/column bounds mean
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
	readonly selectedFileId: string | null;
	readonly selectedSheetId?: string | null;
	readonly source?: TableSource | null;
	readonly sourceKey?: string | null;
	readonly fileName: string;
	readonly file: TableFile | null;
	readonly loadState: TableLoadState;
	readonly dimensions?: string;
	readonly displayVersion?: number;
};

export type TableModel = {
	cancelPendingRowRequests: () => void;
	clearState: (options?: { clearSelection?: boolean }) => void;
	disposeFileCache: (fileId: string) => void;
	ensureCells: (
		fileId: string,
		cells: TableCellReadRequest[],
	) => Promise<void>;
	ensureRows: (
		fileId: string,
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
	hasSourceFile: (fileId: string | null | undefined) => boolean;
	invalidateRequests: () => void;
	onDidChangeState: (callback: () => void) => () => void;
	onDidChangeSelection: (callback: (selection: TableSelection) => void) => () => void;
	revealCell: (cell: TableCell | null) => void;
	resetColumnDisplayScale: (colIndex: number) => boolean;
	resetWorker: () => void;
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

export type TableViewInput = {
	readonly tableModel: TableModel;
	readonly tableState: TableState;
};

export const toTableSourceKey = (source: TableSource): string => {
	const fileId = encodeURIComponent(source.fileId);
	const sheetId = typeof source.sheetId === "string" && source.sheetId
		? encodeURIComponent(source.sheetId)
		: "";
	return sheetId ? `${fileId}::${sheetId}` : fileId;
};

export const ITableRowsReaderService =
	createDecorator<ITableRowsReaderService>("tableRowsReaderService");

export const TABLE_COPY_MAX_CELLS = 100_000;

export type TableRowsReaderProvider = ConvertedCsvReaderService & {
	canReleaseSource(): boolean;
	canReadRows(): boolean;
	canOpenSource(): boolean;
	canReadCells(): boolean;
	releaseSource(payload: unknown): Promise<unknown>;
	readRows(payload: unknown): Promise<TableRowsReaderResultPayload>;
	openSource(payload: unknown): Promise<TableRowsReaderResultPayload>;
	readCells(payload: unknown): Promise<TableRowsReaderResultPayload>;
};

export interface ITableRowsReaderService extends TableRowsReaderProvider {
	readonly _serviceBrand: undefined;
}

export const ITableService = createDecorator<ITableService>("tableService");

export interface ITableService {
	readonly _serviceBrand: undefined;
	readonly onDidChangeSelection: Event<TableSelection>;
	readonly onDidChangeTableViewInput: Event<void>;
	clearSelection(): boolean;
	clearHighlight(): void;
	getColumnWidths(sourceKey: string | null | undefined): readonly TableColumnWidth[];
	getSelection(): TableSelection;
	getSelectionText(maxCellCount?: number): Promise<TableSelectionTextResult>;
	getViewInput(): TableViewInput | null;
	open(source: TableSource | null): TableModel;
	reveal(target: TableRevealTarget | null, options?: TableRevealOptions): boolean;
	select(target: TableSelectionTarget | null, reveal?: TableRevealMode): boolean;
	selectAllColumns(): boolean;
	storeColumnWidths(
		sourceKey: string | null | undefined,
		widths: readonly TableColumnWidth[],
	): void;
}
