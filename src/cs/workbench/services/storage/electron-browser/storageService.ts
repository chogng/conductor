/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore } from "src/cs/base/common/lifecycle";
import { InstantiationType, registerSingleton } from "src/cs/platform/instantiation/common/extensions";
import { IMainProcessService } from "src/cs/platform/ipc/common/mainProcessService";
import {
	getStorageKey,
	getStorageKeyPrefix,
	IStorageService,
	type IStorageValueChangeEvent,
	StorageScope,
	StorageTarget,
	type IStorageService as IStorageServiceType,
	type StorageValue,
} from "src/cs/platform/storage/common/storage";
import {
	StorageChannelClient,
	STORAGE_CHANNEL_NAME,
} from "src/cs/platform/storage/common/storageIpc";
import { AbstractStorageService } from "src/cs/platform/storage/common/storageService";

const ALL_STORAGE_SCOPES = [
	StorageScope.APPLICATION,
	StorageScope.PROFILE,
	StorageScope.WORKSPACE,
] as const;

export class NativeWorkbenchStorageService
	extends AbstractStorageService
	implements IStorageServiceType {
	private readonly values = new Map<string, string>();
	private readonly dirtyStorageKeys = new Set<string>();
	private readonly disposables = new DisposableStore();
	private readonly client: StorageChannelClient;
	private writeTarget: StorageTarget | undefined;

	constructor(
		@IMainProcessService mainProcessService: IMainProcessService,
	) {
		super();

		this.client = new StorageChannelClient(
			mainProcessService.getChannel(STORAGE_CHANNEL_NAME),
		);
		this.registerListeners();
		void this.hydrate().catch(() => undefined);
	}

	public override store(
		key: string,
		value: StorageValue,
		scope: StorageScope,
		target: StorageTarget,
	): void {
		this.writeTarget = target;
		try {
			super.store(key, value, scope, target);
		} finally {
			this.writeTarget = undefined;
		}
	}

	protected readValue(key: string, scope: StorageScope): string | undefined {
		return this.values.get(this.storageKey(key, scope));
	}

	protected writeValue(key: string, scope: StorageScope, value: string): void {
		const storageKey = this.storageKey(key, scope);
		this.values.set(storageKey, value);
		this.dirtyStorageKeys.add(storageKey);
		void this.client
			.store(key, value, scope, this.writeTarget ?? StorageTarget.USER)
			.catch(() => undefined);
	}

	protected deleteValue(key: string, scope: StorageScope): void {
		const storageKey = this.storageKey(key, scope);
		this.values.delete(storageKey);
		this.dirtyStorageKeys.add(storageKey);
		void this.client.remove(key, scope).catch(() => undefined);
	}

	protected readKeys(scope: StorageScope): string[] {
		const prefix = this.storageKeyPrefix(scope);
		return [...this.values.keys()]
			.filter(key => key.startsWith(prefix))
			.map(key => key.slice(prefix.length));
	}

	public override dispose(): void {
		this.disposables.dispose();
		super.dispose();
	}

	private registerListeners(): void {
		for (const scope of ALL_STORAGE_SCOPES) {
			this.disposables.add(
				this.client.onDidChangeValue(scope)(event => {
					void this.refreshValue(event).catch(() => undefined);
				}),
			);
		}
	}

	private async refreshValue(event: IStorageValueChangeEvent): Promise<void> {
		const storageKey = this.storageKey(event.key, event.scope);
		if (event.target === undefined) {
			this.values.delete(storageKey);
			return;
		}

		const value = await this.client.get(event.key, event.scope);
		if (value === undefined) {
			this.values.delete(storageKey);
			return;
		}

		this.values.set(storageKey, value);
	}

	private async hydrate(): Promise<void> {
		await Promise.all(ALL_STORAGE_SCOPES.map(scope => this.hydrateScope(scope)));
	}

	private async hydrateScope(scope: StorageScope): Promise<void> {
		const keys = await this.client.keys(scope);
		await Promise.all(keys.map(async key => {
			const value = await this.client.get(key, scope);
			const storageKey = this.storageKey(key, scope);
			if (value === undefined || this.dirtyStorageKeys.has(storageKey)) {
				return;
			}

			this.values.set(storageKey, value);
		}));
	}

	private storageKey(key: string, scope: StorageScope): string {
		return getStorageKey(key, scope);
	}

	private storageKeyPrefix(scope: StorageScope): string {
		return getStorageKeyPrefix(scope);
	}
}

registerSingleton(IStorageService, NativeWorkbenchStorageService, InstantiationType.Delayed);
