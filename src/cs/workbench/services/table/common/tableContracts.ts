/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

// Pure data types for the table feature. This module is a dependency-free leaf:
// it must not import service contracts or any value-producing module so that any
// layer can import these types without incurring a runtime dependency.

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

export type TableRowsReaderResultPayload = {
	readonly message?: string;
	readonly ok?: boolean;
	readonly result?: unknown;
	readonly [key: string]: unknown;
};

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
	onDidChangeHighlight: (callback: (highlight: TableHighlight) => void) => () => void;
	onDidChangeRevealCell: (callback: (cell: TableCell | null) => void) => () => void;
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
