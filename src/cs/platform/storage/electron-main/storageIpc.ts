/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import {
	StorageChannel,
	STORAGE_CHANNEL_NAME,
	type IStorageProvider,
} from "../common/storageIpc.js";

export { STORAGE_CHANNEL_NAME };

export class StorageMainChannel extends StorageChannel {
	constructor(storageProvider: IStorageProvider) {
		super(storageProvider);
	}
}
