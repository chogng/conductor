/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import path from "node:path";

import { DisposableStore } from "../../../base/common/lifecycle.js";
import {
	StorageScope,
	type IStorageService,
} from "../common/storage.js";
import { AbstractStorageService } from "../common/storageService.js";
import {
	GLOBAL_STORAGE_DIRECTORY,
	PROFILE_STORAGE_DIRECTORY,
	STORAGE_FILENAME,
	StorageMain,
	WORKSPACE_STORAGE_DIRECTORY,
	type IStorageMain,
} from "./storageMain.js";

const ALL_STORAGE_SCOPES = [
	StorageScope.APPLICATION,
	StorageScope.PROFILE,
	StorageScope.WORKSPACE,
] as const;

export type StorageMainServiceOptions = {
	readonly getHomeDir: () => string;
	readonly profileId: string;
	readonly workspaceId: string;
	readonly logWarning?: (message: string, error?: unknown) => void;
};

export class StorageMainService extends AbstractStorageService implements IStorageService {
	private readonly storages = new Map<StorageScope, IStorageMain>();
	private readonly disposables = new DisposableStore();

	constructor(private readonly options: StorageMainServiceOptions) {
		super();

		const homeDir = options.getHomeDir();
		this.storages.set(StorageScope.APPLICATION, this.createStorage(
			path.join(homeDir, GLOBAL_STORAGE_DIRECTORY, "application.json"),
		));
		this.storages.set(StorageScope.PROFILE, this.createStorage(
			path.join(
				homeDir,
				GLOBAL_STORAGE_DIRECTORY,
				PROFILE_STORAGE_DIRECTORY,
				encodeStorageId(options.profileId),
				STORAGE_FILENAME,
			),
		));
		this.storages.set(StorageScope.WORKSPACE, this.createStorage(
			path.join(
				homeDir,
				WORKSPACE_STORAGE_DIRECTORY,
				encodeStorageId(options.workspaceId),
				STORAGE_FILENAME,
			),
		));

		for (const scope of ALL_STORAGE_SCOPES) {
			this.disposables.add(this.getStorage(scope).onDidChangeStorage(event => {
				if (event.external) {
					this.fireDidChangeValueExternal(event.key, scope);
				}
			}));
		}
	}

	public getStorage(scope: StorageScope): IStorageMain {
		const storage = this.storages.get(scope);
		if (!storage) {
			throw new Error(`Storage is not configured for scope ${scope}.`);
		}

		return storage;
	}

	protected override async doInitialize(): Promise<void> {
		await Promise.all(ALL_STORAGE_SCOPES.map(scope => this.getStorage(scope).init()));
		for (const scope of ALL_STORAGE_SCOPES) {
			this.initializeTargets(scope);
		}
	}

	protected readValue(key: string, scope: StorageScope): string | undefined {
		return this.getStorage(scope).get(key);
	}

	protected writeValue(
		key: string,
		scope: StorageScope,
		value: string,
	): Promise<void> {
		return this.getStorage(scope).set(key, value);
	}

	protected deleteValue(key: string, scope: StorageScope): Promise<void> {
		return this.getStorage(scope).delete(key);
	}

	protected readKeys(scope: StorageScope): string[] {
		return Array.from(this.getStorage(scope).items.keys());
	}

	protected override async doFlush(): Promise<void> {
		await Promise.all(ALL_STORAGE_SCOPES.map(scope => this.getStorage(scope).flush(0)));
	}

	protected override async doClose(): Promise<void> {
		await Promise.all(ALL_STORAGE_SCOPES.map(scope => this.getStorage(scope).close()));
	}

	public override dispose(): void {
		this.storages.clear();
		this.disposables.dispose();
		super.dispose();
	}

	private createStorage(storagePath: string): IStorageMain {
		return this.disposables.add(new StorageMain({
			path: storagePath,
			logWarning: this.options.logWarning,
		}));
	}
}

export function createStorageMainService(
	options: StorageMainServiceOptions,
): StorageMainService {
	return new StorageMainService(options);
}

function encodeStorageId(id: string): string {
	const normalized = id.trim();
	if (!normalized) {
		throw new Error("Storage identity must not be empty.");
	}

	return encodeURIComponent(normalized);
}
