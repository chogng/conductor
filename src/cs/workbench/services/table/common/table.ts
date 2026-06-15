/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type { Event } from "src/cs/base/common/event";
import { createDecorator } from "src/cs/platform/instantiation/common/instantiation";
import type { ConvertedCsvReaderService } from "src/cs/workbench/services/files/common/fileConverterBackend";
import type { SessionFile } from "src/cs/workbench/services/session/common/sessionTypes";
import type {
	TableRowsReaderResultPayload,
	TableColumnWidthTarget,
	TableRevealMode,
	TableRevealOptions,
	TableRevealTarget,
	TableSelection,
	TableSelectionTarget,
	TableSelectionTextResult,
	TableSource,
	TableModel,
	TableViewInput,
} from "src/cs/workbench/services/table/common/tableContracts";

// Re-export the data types and source helper so existing consumers can keep
// importing everything from this single entry point.
export * from "src/cs/workbench/services/table/common/tableContracts";
export * from "src/cs/workbench/services/table/common/tableSource";

export const TableContributionId = "workbench.contrib.table";

export const TableViewId = "workbench.table";

export const ITableRowsReaderService =
	createDecorator<ITableRowsReaderService>("tableRowsReaderService");

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

export type TableInput = {
	tableRowsReaderService?: TableRowsReaderProvider;
	rawFiles?: SessionFile[];
	source?: TableSource | null;
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
