/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import {
	Storage,
	type IStorage,
} from "../../../base/parts/storage/common/storage.js";
import { JsonStorageDatabase } from "../../../base/parts/storage/node/storage.js";

export const GLOBAL_STORAGE_DIRECTORY = "globalStorage";
export const PROFILE_STORAGE_DIRECTORY = "profiles";
export const WORKSPACE_STORAGE_DIRECTORY = "workspaceStorage";
export const STORAGE_FILENAME = "state.json";

export type StorageMainOptions = {
	readonly path: string;
	readonly logWarning?: (message: string, error?: unknown) => void;
};

export interface IStorageMain extends IStorage {
	readonly path: string;
}

export class StorageMain extends Storage implements IStorageMain {
	public readonly path: string;

	constructor(options: StorageMainOptions) {
		const database = new JsonStorageDatabase(options);
		super(database);
		this.path = options.path;
	}
}
