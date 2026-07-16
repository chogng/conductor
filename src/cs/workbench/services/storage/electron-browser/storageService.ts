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
	STORAGE_TARGET_KEY,
	type IStorageService as IStorageServiceType,
} from "src/cs/platform/storage/common/storage";
import {
	StorageDatabaseClient,
	STORAGE_CHANNEL_NAME,
	switchStorageChannelWorkspace,
} from "src/cs/platform/storage/common/storageIpc";
import { AbstractStorageService } from "src/cs/platform/storage/common/storageService";
import type { IChannel } from "src/cs/base/parts/ipc/common/ipc";
import type { IAnyWorkspaceIdentifier } from "src/cs/platform/workspaces/common/workspaceIdentifier";
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
	private readonly workspaceDisposables = new DisposableStore();
	private readonly channel: IChannel;

	constructor(
		@IMainProcessService mainProcessService: IMainProcessService,
		@ILifecycleService lifecycleService: ILifecycleServiceType,
	) {
		super();

		this.channel = mainProcessService.getChannel(STORAGE_CHANNEL_NAME);
		for (const scope of [
			StorageScope.APPLICATION,
			StorageScope.PROFILE,
		] as const) {
			const database = this.disposables.add(new StorageDatabaseClient(
				this.channel,
				scope,
			));
			const storage = this.disposables.add(new Storage(database));
			this.storages.set(scope, storage);
			this.disposables.add(database.onDidChangeValueExternal(event => {
				this.fireDidChangeValueExternal(
					event.targetChanged ? STORAGE_TARGET_KEY : event.key,
					scope,
				);
			}));
		}
		this.storages.set(
			StorageScope.WORKSPACE,
			this.createWorkspaceStorage(),
		);

		this.disposables.add(lifecycleService.onWillShutdown(event => {
			event.join(this.close(), {
				id: "workbench.storage",
				label: "Saving workbench storage",
			});
		}));

		const handleFlushRequest = () => {
			void this.close()
				.then(() => {
					ipcRenderer.send(
						workbenchBootstrapIpcChannels.storageFlushComplete,
						{ ok: true },
					);
				})
				.catch(error => {
					console.error("Failed to flush renderer storage before quit.", error);
					ipcRenderer.send(
						workbenchBootstrapIpcChannels.storageFlushComplete,
						{
							ok: false,
							message: error instanceof Error ? error.message : String(error),
						},
					);
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
		for (const scope of ALL_STORAGE_SCOPES) {
			this.initializeTargets(scope);
		}
	}

	public override async switchWorkspace(
		workspace: IAnyWorkspaceIdentifier,
	): Promise<void> {
		const oldStorage = this.getStorage(StorageScope.WORKSPACE);
		const oldItems = new Map(oldStorage.items);
		await oldStorage.close();
		this.workspaceDisposables.clear();

		await switchStorageChannelWorkspace(this.channel, workspace);
		const newStorage = this.createWorkspaceStorage();
		this.storages.set(StorageScope.WORKSPACE, newStorage);
		await newStorage.init();
		this.switchData(StorageScope.WORKSPACE, oldItems, newStorage.items);
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
		this.workspaceDisposables.dispose();
		this.disposables.dispose();
		super.dispose();
	}

	private createWorkspaceStorage(): IStorage {
		const database = this.workspaceDisposables.add(new StorageDatabaseClient(
			this.channel,
			StorageScope.WORKSPACE,
		));
		const storage = this.workspaceDisposables.add(new Storage(database));
		this.workspaceDisposables.add(database.onDidChangeValueExternal(event => {
			this.fireDidChangeValueExternal(
				event.targetChanged ? STORAGE_TARGET_KEY : event.key,
				StorageScope.WORKSPACE,
			);
		}));
		return storage;
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
