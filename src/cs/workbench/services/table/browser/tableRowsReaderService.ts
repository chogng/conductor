/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from "src/cs/base/common/lifecycle";
import { localize } from "src/cs/nls";
import { InstantiationType, registerSingleton } from "src/cs/platform/instantiation/common/extensions";
import {
	IFileConverterBackendService,
	type ConvertedCsvReaderService,
	type FileConverterConvertedCsv,
} from "src/cs/workbench/services/files/common/fileConverterBackend";
import {
	ITableRowsReaderService,
	type TableRowsReaderResultPayload,
} from "src/cs/workbench/services/table/common/table";

const getServiceUnavailableMessage = (): string =>
	localize("tableRowsReader.desktopBridgeUnavailable", "Table preview desktop bridge unavailable.");

function unavailable(): Promise<never> {
	return Promise.reject(new Error(getServiceUnavailableMessage()));
}

export class TableRowsReaderService extends Disposable implements ITableRowsReaderService {
	public declare readonly _serviceBrand: undefined;
	private readonly convertedCsvReaderService: ConvertedCsvReaderService;

	public constructor(
		@IFileConverterBackendService fileConverterBackendService: IFileConverterBackendService,
	) {
		super();
		this.convertedCsvReaderService = fileConverterBackendService;
	}

	public canReleaseSource(): boolean {
		return false;
	}

	public canReadRows(): boolean {
		return false;
	}

	public canOpenSource(): boolean {
		return false;
	}

	public canReadCells(): boolean {
		return false;
	}

	public canReadConvertedCsv(): boolean {
		return this.convertedCsvReaderService.canReadConvertedCsv();
	}

	public releaseSource(_payload: unknown): Promise<unknown> {
		return Promise.resolve(undefined);
	}

	public readRows(_payload: unknown): Promise<TableRowsReaderResultPayload> {
		return unavailable();
	}

	public openSource(_payload: unknown): Promise<TableRowsReaderResultPayload> {
		return unavailable();
	}

	public readCells(_payload: unknown): Promise<TableRowsReaderResultPayload> {
		return unavailable();
	}

	public readConvertedCsv(payload: { path: string; maxRows?: number }): Promise<FileConverterConvertedCsv> {
		return this.convertedCsvReaderService.readConvertedCsv(payload);
	}
}

registerSingleton(ITableRowsReaderService, TableRowsReaderService, InstantiationType.Delayed);
