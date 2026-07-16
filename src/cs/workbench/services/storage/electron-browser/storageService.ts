/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore, toDisposable } from "src/cs/base/common/lifecycle";
import {
	Storage,
	type IStorage,
} from "src/cs/base/parts/storage/common/storage";
import { ipcRenderer } from "src/cs/base/parts/sandbox/electron-browser/globals";
import { workbenchBootstrapIpcChannels } from "src/cs/base/parts/sandbox/common/sandboxTypes";
import { InstantiationType, registerSingleton } from "src/cs/platform/instantiation/common/extensions";
import { IMainProcessService } from "src/cs/platform/ipc/common/mainProcessService";
import {
	IStorageService,
	StorageScope,
	type IStorageService as IStorageServiceType,
} from "src/cs/platform/storage/common/storage";
import {
	StorageDatabaseClient,
	STORAGE_CHANNEL_NAME,
} from "src/cs/platform/storage/common/storageIpc";
import { AbstractStorageService } from "src/cs/platform/storage/common/storageService";
import {
	ILifecycleService,
	type ILifecycleService as ILifecycleServiceType,
} from "src/cs/workbench/services/lifecycle/common/lifecycle";

const ALL_STORAGE_SCOPES = [
	StorageScope.APPLICATION,
	StorageScope.PROFILE,
	StorageScope.WORKSPACE,
] as const;

export class NativeWorkbenchStorageService
	extends AbstractStorageService
	implements IStorageServiceType {
	private readonly storages = new Map<StorageScope, IStorage>();
	private readonly disposables = new DisposableStore();

	constructor(
		@IMainProcessService mainProcessService: IMainProcessService,
		@ILifecycleService lifecycleService: ILifecycleServiceType,
	) {
		super();

		const channel = mainProcessService.getChannel(STORAGE_CHANNEL_NAME);
		for (const scope of ALL_STORAGE_SCOPES) {
			const database = this.disposables.add(new StorageDatabaseClient(
				channel,
				scope,
			));
			const storage = this.disposables.add(new Storage(database));
			this.storages.set(scope, storage);
			this.disposables.add(storage.onDidChangeStorage(event => {
				if (event.external) {
					this.fireDidChangeValueExternal(event.key, scope);
				}
			}));
		}

		this.disposables.add(lifecycleService.onWillShutdown(event => {
			event.join(this.close(), {
				id: "workbench.storage",
				label: "Saving workbench storage",
			});
		}));

		const handleFlushRequest = () => {
			void this.close()
				.catch(error => {
					console.error("Failed to flush renderer storage before quit.", error);
				})
				.finally(() => {
					ipcRenderer.send(workbenchBootstrapIpcChannels.storageFlushComplete);
				});
		};
		ipcRenderer.on(
			workbenchBootstrapIpcChannels.storageFlushRequest,
			handleFlushRequest,
		);
		this.disposables.add(toDisposable(() => {
			ipcRenderer.removeListener(
				workbenchBootstrapIpcChannels.storageFlushRequest,
				handleFlushRequest,
			);
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

registerSingleton(IStorageService, NativeWorkbenchStorageService, InstantiationType.Delayed);
