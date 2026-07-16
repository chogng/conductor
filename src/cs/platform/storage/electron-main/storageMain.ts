/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import {
	InMemoryStorageDatabase,
	Storage,
	StorageHint,
	type IStorage,
} from "../../../base/parts/storage/common/storage.js";
import {
	JsonStorageDatabase,
	SQLiteStorageDatabase,
} from "../../../base/parts/storage/node/storage.js";

export const GLOBAL_STORAGE_DIRECTORY = "globalStorage";
export const PROFILE_STORAGE_DIRECTORY = "profiles";
export const STORAGE_FILENAME = "state.json";

export type StorageMainOptions = {
	readonly path?: string;
	readonly type: "json" | "memory" | "sqlite";
	readonly logWarning?: (message: string, error?: unknown) => void;
};

export interface IStorageMain extends IStorage {
	readonly path: string | undefined;
}

export class StorageMain extends Storage implements IStorageMain {
	public readonly path: string | undefined;

	constructor(options: StorageMainOptions) {
		const database = options.type === "memory"
			? new InMemoryStorageDatabase()
			: options.type === "sqlite"
				? new SQLiteStorageDatabase({
					path: requireStoragePath(options),
					logWarning: options.logWarning,
				})
				: new JsonStorageDatabase({
					path: requireStoragePath(options),
					logWarning: options.logWarning,
				});
		super(
			database,
			options.type === "memory"
				? { hint: StorageHint.STORAGE_IN_MEMORY }
				: undefined,
		);
		this.path = options.path;
	}
}

function requireStoragePath(options: StorageMainOptions): string {
	if (!options.path) {
		throw new Error(`${options.type} storage requires a path.`);
	}

	return options.path;
}
