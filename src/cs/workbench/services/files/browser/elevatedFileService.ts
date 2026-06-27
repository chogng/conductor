/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type { URI } from "src/cs/base/common/uri";
import type { IFileStat } from "src/cs/platform/files/common/files";
import { InstantiationType, registerSingleton } from "src/cs/platform/instantiation/common/extensions";
import {
	IElevatedFileService,
	type IElevatedFileService as IElevatedFileServiceType,
} from "src/cs/workbench/services/files/common/elevatedFileService";

export class BrowserElevatedFileService implements IElevatedFileServiceType {
	public declare readonly _serviceBrand: undefined;

	public isSupported(_resource: URI): boolean {
		return false;
	}

	public writeFileElevated(_resource: URI, _content: string): Promise<IFileStat> {
		return Promise.reject(new Error("Elevated file writes are not supported in the browser workbench."));
	}
}

registerSingleton(IElevatedFileService, BrowserElevatedFileService, InstantiationType.Delayed);
