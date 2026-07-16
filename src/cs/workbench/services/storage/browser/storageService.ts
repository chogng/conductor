/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { mainWindow } from "src/cs/base/browser/window";
import { Event, type Event as EventType } from "src/cs/base/common/event";
import { DisposableStore } from "src/cs/base/common/lifecycle";
import {
	Storage as BaseStorage,
	StorageHint,
	type IStorage,
	type IStorageDatabase,
	type IStorageItemsChangeEvent,
	type IUpdateRequest,
} from "src/cs/base/parts/storage/common/storage";
import { InstantiationType, registerSingleton } from "src/cs/platform/instantiation/common/extensions";
import {
	IStorageService,
	StorageScope,
	type IStorageService as IStorageServiceType,
} from "src/cs/platform/storage/common/storage";
import { AbstractStorageService } from "src/cs/platform/storage/common/storageService";
import {
	ILifecycleService,
	type ILifecycleService as ILifecycleServiceType,
} from "src/cs/workbench/services/lifecycle/common/lifecycle";

const STORAGE_KEY_PREFIX = "conductor.storage";
const ALL_STORAGE_SCOPES = [
	StorageScope.APPLICATION,
	StorageScope.PROFILE,
	StorageScope.WORKSPACE,
] as const;

export class BrowserStorageService
	extends AbstractStorageService
	implements IStorageServiceType {
	private readonly storages = new Map<StorageScope, IStorage>();
	private readonly disposables = new DisposableStore();

	constructor(
		@ILifecycleService lifecycleService: ILifecycleServiceType,
	) {
		super();

		const localStorage = getLocalStorage();
		for (const scope of ALL_STORAGE_SCOPES) {
			const storage = this.disposables.add(new BaseStorage(
				new LocalStorageDatabase(localStorage, getStorageKeyPrefix(scope)),
				{ hint: StorageHint.STORAGE_IN_MEMORY },
			));
			this.storages.set(scope, storage);
		}

		this.disposables.add(lifecycleService.onWillShutdown(event => {
			event.join(this.close(), {
				id: "workbench.storage",
				label: "Saving workbench storage",
			});
		}));
	}

	protected override async doInitialize(): Promise<void> {
		await Promise.all(ALL_STORAGE_SCOPES.map(scope => this.getStorage(scope).init()));
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

	private getStorage(scope: StorageScope): IStorage {
		const storage = this.storages.get(scope);
		if (!storage) {
			throw new Error(`Storage is not configured for scope ${scope}.`);
		}

		return storage;
	}
}

class LocalStorageDatabase implements IStorageDatabase {
	public readonly onDidChangeItemsExternal =
		Event.None as EventType<IStorageItemsChangeEvent>;
	private readonly fallback = new Map<string, string>();

	constructor(
		private readonly storage: Storage | null,
		private readonly prefix: string,
	) {}

	public async getItems(): Promise<Map<string, string>> {
		try {
			if (this.storage) {
				for (let index = 0; index < this.storage.length; index += 1) {
					const physicalKey = this.storage.key(index);
					if (physicalKey?.startsWith(this.prefix)) {
						const value = this.storage.getItem(physicalKey);
						if (value !== null) {
							this.fallback.set(physicalKey.slice(this.prefix.length), value);
						}
					}
				}
			}
		} catch {
			// The in-memory copy remains available when browser storage is unavailable.
		}

		return new Map(this.fallback);
	}

	public async updateItems(request: IUpdateRequest): Promise<void> {
		request.insert?.forEach((value, key) => {
			this.fallback.set(key, value);
			try {
				this.storage?.setItem(`${this.prefix}${key}`, value);
			} catch {
				// Keep the in-memory copy current when browser storage is unavailable.
			}
		});
		request.delete?.forEach(key => {
			this.fallback.delete(key);
			try {
				this.storage?.removeItem(`${this.prefix}${key}`);
			} catch {
				// The in-memory copy has already been updated.
			}
		});
	}

	public async optimize(): Promise<void> {}
	public async close(): Promise<void> {}
}

function getStorageKeyPrefix(scope: StorageScope): string {
	return `${STORAGE_KEY_PREFIX}.${scope}.`;
}

function getLocalStorage(): Storage | null {
	try {
		return mainWindow.localStorage ?? null;
	} catch {
		return null;
	}
}

registerSingleton(IStorageService, BrowserStorageService, InstantiationType.Delayed);
