/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type { Event } from "src/cs/base/common/event";
import { createDecorator } from "src/cs/platform/instantiation/common/instantiation";
import type { ConvertedCsvReaderService } from "src/cs/workbench/services/files/common/fileConverterBackend";
import type { SessionFile } from "src/cs/workbench/services/session/common/sessionTypes";

export const TableContributionId = "workbench.contrib.table";

export const TableViewId = "workbench.table";

export const ITableBackendService =
	createDecorator<ITableBackendService>("tableBackendService");

export const TableCommandId = {
	clearSelection: "workbench.table.clearSelection",
	copySelection: "workbench.table.copySelection",
	resetZoom: "workbench.table.resetZoom",
	selectAllColumns: "workbench.table.selectAllColumns",
	zoomIn: "workbench.table.zoomIn",
	zoomOut: "workbench.table.zoomOut",
} as const;

export type TableCommandId = typeof TableCommandId[keyof typeof TableCommandId];

export const TABLE_DEFAULT_ZOOM_PERCENT = 100;
export const TABLE_MIN_ZOOM_PERCENT = 50;
export const TABLE_MAX_ZOOM_PERCENT = 200;
export const TABLE_ZOOM_STEP_PERCENT = 10;
export const TABLE_DEFAULT_COLUMN_WIDTH = 160;
export const TABLE_MIN_COLUMN_WIDTH = 72;
export const TABLE_MAX_COLUMN_WIDTH = 640;
export const TABLE_COPY_MAX_CELLS = 100_000;

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

export type TableColumnWidth = {
	readonly colIndex: number;
	readonly width: number;
};

export type TableColumnWidthTarget = TableColumnWidth;

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

export type TableHighlight = {
	readonly columns?: readonly number[];
	readonly ranges?: readonly TableRange[];
};

export type TableSource = {
	readonly fileId: string;
	readonly sheetId?: string | null;
};

export type TableFile = {
	fileId: string;
	fileName: string;
	sheetId?: string | null;
	sheetName?: string | null;
	sourceKey?: string;
	sourceVersion?: number;
	rowCount: number;
	columnCount: number;
	maxCellLengths: number[];
};

export type TableLoadState = {
	state: "idle" | "loading" | "ready";
	message: string;
};

export type TableBackendResultPayload = {
	readonly message?: string;
	readonly ok?: boolean;
	readonly result?: unknown;
	readonly [key: string]: unknown;
};

export type TableBackendPreviewProvider = ConvertedCsvReaderService & {
	canDisposeFile(): boolean;
	canGetPreviewRows(): boolean;
	canOpenFile(): boolean;
	canReadCells(): boolean;
	disposeFile(payload: unknown): Promise<unknown>;
	getPreviewRows(payload: unknown): Promise<TableBackendResultPayload>;
	openFile(payload: unknown): Promise<TableBackendResultPayload>;
	readCells(payload: unknown): Promise<TableBackendResultPayload>;
};

export interface ITableBackendService extends TableBackendPreviewProvider {
	readonly _serviceBrand: undefined;
}

export type TableCellReadRequest = {
	colIndex: number;
	rowIndex: number;
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
	readonly zoomPercent: number;
};

export type TableInput = {
	tableBackendService?: TableBackendPreviewProvider;
	rawFiles?: SessionFile[];
	source?: TableSource | null;
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
	getColumnWidth: (colIndex: number) => number | null;
	getColumnWidths: () => readonly TableColumnWidth[];
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
	resetWorker: () => void;
	clearHighlight: () => void;
	clearSelection: () => boolean;
	getHighlight: () => TableHighlight;
	highlightColumns: (columnIndexes: readonly number[]) => void;
	resetZoom: () => boolean;
	selectAllColumns: () => boolean;
	setColumnWidth: (target: TableColumnWidthTarget) => boolean;
	setSelection: (selection: TableSelection | null) => void;
	setZoomPercent: (zoomPercent: number) => boolean;
	subscribeRowsVersion: (callback: () => void) => () => void;
	zoomIn: () => boolean;
	zoomOut: () => boolean;
};

export type TableViewInput = {
	readonly tableModel: TableModel;
	readonly tableState: TableState;
};

export const ITableService = createDecorator<ITableService>("tableService");

export interface ITableService {
	readonly _serviceBrand: undefined;
	readonly onDidChangeSelection: Event<TableSelection>;
	readonly onDidChangeTableViewInput: Event<void>;
	clearHighlight(): void;
	executeCommand(commandId: TableCommandId): boolean;
	getSelection(): TableSelection;
	getSelectionText(maxCellCount?: number): Promise<TableSelectionTextResult>;
	getViewInput(): TableViewInput | null;
	reveal(target: TableRevealTarget | null, options?: TableRevealOptions): boolean;
	select(target: TableSelectionTarget | null, reveal?: TableRevealMode): boolean;
	setColumnWidth(target: TableColumnWidthTarget): boolean;
	update(input: TableInput): TableModel;
	updateViewInput(input: TableViewInput): void;
}

export const clampTableColumnWidth = (width: number): number =>
	Math.min(
		TABLE_MAX_COLUMN_WIDTH,
		Math.max(TABLE_MIN_COLUMN_WIDTH, Math.round(Number(width) || 0)),
	);

export const toTableSourceKey = (source: TableSource): string => {
	const fileId = encodeURIComponent(source.fileId);
	const sheetId = typeof source.sheetId === "string" && source.sheetId
		? encodeURIComponent(source.sheetId)
		: "";
	return sheetId ? `${fileId}::${sheetId}` : fileId;
};
