/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type { URI } from "src/cs/base/common/uri";
import { createDecorator } from "src/cs/platform/instantiation/common/instantiation";
import type { IFileStat } from "src/cs/platform/files/common/files";

export const IElevatedFileService = createDecorator<IElevatedFileService>("elevatedFileService");

export interface IElevatedFileService {
	readonly _serviceBrand: undefined;

	isSupported(resource: URI): boolean;
	writeFileElevated(resource: URI, content: string): Promise<IFileStat>;
}
