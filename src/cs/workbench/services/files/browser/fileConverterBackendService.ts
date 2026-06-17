/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from "src/cs/base/common/lifecycle";
import { localize } from "src/cs/nls";
import { InstantiationType, registerSingleton } from "src/cs/platform/instantiation/common/extensions";
import {
		IFileConverterBackendService,
		type FileConverterConvertedCsv,
		type FileConverterPreparedFile,
	} from "src/cs/workbench/services/files/common/fileConverterBackend";

const getServiceUnavailableMessage = (): string =>
	localize("fileConverter.desktopBridgeUnavailable", "File conversion desktop bridge unavailable.");

function unavailable(): Promise<never> {
	return Promise.reject(new Error(getServiceUnavailableMessage()));
}

export class FileConverterBackendService extends Disposable implements IFileConverterBackendService {
	public declare readonly _serviceBrand: undefined;

	public canPrepareFile(): boolean {
		return false;
	}

	public canReadConvertedCsv(): boolean {
		return false;
	}

		public prepareFile(_payload: { fileName: string; path: string }): Promise<FileConverterPreparedFile> {
			return unavailable();
		}

	public readConvertedCsv(_payload: { path: string; maxRows?: number }): Promise<FileConverterConvertedCsv> {
		return Promise.resolve({ ok: false });
	}
}

registerSingleton(IFileConverterBackendService, FileConverterBackendService, InstantiationType.Delayed);
