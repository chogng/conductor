/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type { IStorageService } from "../common/storage.js";
import {
	StorageChannel,
	STORAGE_CHANNEL_NAME,
} from "../common/storageIpc.js";

export { STORAGE_CHANNEL_NAME };

export class StorageMainChannel extends StorageChannel {
	constructor(storageService: IStorageService) {
		super(storageService);
	}
}
