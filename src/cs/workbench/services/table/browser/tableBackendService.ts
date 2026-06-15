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
	ITableBackendService,
	type TableBackendResultPayload,
} from "src/cs/workbench/services/table/common/table";

const getServiceUnavailableMessage = (): string =>
	localize("tableBackend.desktopBridgeUnavailable", "Table preview desktop bridge unavailable.");

function unavailable(): Promise<never> {
	return Promise.reject(new Error(getServiceUnavailableMessage()));
}

export class TableBackendService extends Disposable implements ITableBackendService {
	public declare readonly _serviceBrand: undefined;
	private readonly convertedCsvReaderService: ConvertedCsvReaderService;

	public constructor(
		@IFileConverterBackendService fileConverterBackendService: IFileConverterBackendService,
	) {
		super();
		this.convertedCsvReaderService = fileConverterBackendService;
	}

	public canDisposeFile(): boolean {
		return false;
	}

	public canGetPreviewRows(): boolean {
		return false;
	}

	public canOpenFile(): boolean {
		return false;
	}

	public canReadCells(): boolean {
		return false;
	}

	public canReadConvertedCsv(): boolean {
		return this.convertedCsvReaderService.canReadConvertedCsv();
	}

	public disposeFile(_payload: unknown): Promise<unknown> {
		return Promise.resolve(undefined);
	}

	public getPreviewRows(_payload: unknown): Promise<TableBackendResultPayload> {
		return unavailable();
	}

	public openFile(_payload: unknown): Promise<TableBackendResultPayload> {
		return unavailable();
	}

	public readCells(_payload: unknown): Promise<TableBackendResultPayload> {
		return unavailable();
	}

	public readConvertedCsv(payload: { path: string }): Promise<FileConverterConvertedCsv> {
		return this.convertedCsvReaderService.readConvertedCsv(payload);
	}
}

registerSingleton(ITableBackendService, TableBackendService, InstantiationType.Delayed);
