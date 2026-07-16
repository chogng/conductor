/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Event, Emitter, type Event as EventType } from "../../../base/common/event.js";
import {
	Disposable,
	DisposableStore,
	type IDisposable,
} from "../../../base/common/lifecycle.js";
import type {
	IStorage,
	IStorageDatabase,
	IStorageItemsChangeEvent,
	IUpdateRequest,
} from "../../../base/parts/storage/common/storage.js";
import type { IChannel, IServerChannel } from "../../../base/parts/ipc/common/ipc.js";
import {
	type IStorageService,
	StorageScope,
	STORAGE_TARGET_KEY,
} from "./storage.js";

export const STORAGE_CHANNEL_NAME = "storage";
export const STORAGE_ITEMS_CHANGE_EVENT = "onDidChangeItems";

type StorageItemsChangeDto = {
	readonly key: string;
	readonly targetChanged: boolean;
	readonly changed?: readonly (readonly [string, string])[];
	readonly deleted?: readonly string[];
};

type StorageUpdateRequestDto = {
	readonly scope: StorageScope;
	readonly insert?: readonly (readonly [string, string])[];
	readonly delete?: readonly string[];
};

export interface IStorageProvider {
	getStorage(scope: StorageScope): IStorage;
}

export interface IStorageServer extends IStorageProvider, IStorageService {}

export class StorageChannel implements IServerChannel<string> {
	constructor(private readonly storageServer: IStorageServer) {}

	public listen<T>(
		_ctx: string,
		event: string,
		arg?: unknown,
	): EventType<T> {
		if (event !== STORAGE_ITEMS_CHANGE_EVENT) {
			return Event.None as EventType<T>;
		}

		const scope = toStorageScope(arg);
		return this.onDidChangeItems(scope) as EventType<T>;
	}

	public async call<T>(
		_ctx: string,
		command: string,
		arg?: unknown,
	): Promise<T> {
		switch (command) {
			case "getItems": {
				const storage = this.storageServer.getStorage(toStorageScope(arg));
				return Array.from(storage.items) as T;
			}
			case "updateItems": {
				const request = toStorageUpdateRequest(arg);
				const storage = this.storageServer.getStorage(request.scope);
				await Promise.all([
					...(request.insert?.map(([key, value]) => storage.set(key, value, true)) ?? []),
					...(request.delete?.map(key => storage.delete(key, true)) ?? []),
				]);
				return undefined as T;
			}
			case "replaceItems": {
				const request = toStorageUpdateRequest(arg);
				const storage = this.storageServer.getStorage(request.scope);
				const replacement = new Map(request.insert);
				await Promise.all([
					...Array.from(storage.items.keys())
						.filter(key => !replacement.has(key))
						.map(key => storage.delete(key, true)),
					...Array.from(replacement, ([key, value]) =>
						storage.set(key, value, true)),
				]);
				await storage.flush(0);
				return undefined as T;
			}
			case "optimize": {
				const storage = this.storageServer.getStorage(toStorageScope(arg));
				await storage.optimize();
				return undefined as T;
			}
			default:
				throw new Error(`Unknown storage command '${command}'.`);
		}
	}

	private onDidChangeItems(scope: StorageScope): EventType<StorageItemsChangeDto> {
		return (listener, thisArgs, disposables) => {
			const store = new DisposableStore();
			const storage = this.storageServer.getStorage(scope);
			this.storageServer.onDidChangeValue(scope, undefined, store)(event => {
				const changed: Array<readonly [string, string]> = [];
				const deleted: string[] = [];
				if (event.targetChanged) {
					const targetMarker = storage.get(STORAGE_TARGET_KEY);
					if (targetMarker === undefined) {
						deleted.push(STORAGE_TARGET_KEY);
					} else {
						changed.push([STORAGE_TARGET_KEY, targetMarker]);
					}
				}

				const value = storage.get(event.key);
				if (value === undefined) {
					deleted.push(event.key);
				} else {
					changed.push([event.key, value]);
				}

				listener.call(thisArgs, {
					key: event.key,
					targetChanged: event.targetChanged === true,
					changed: changed.length > 0 ? changed : undefined,
					deleted: deleted.length > 0 ? deleted : undefined,
				});
			});
			addDisposable(store, disposables);
			return store;
		};
	}
}

export class StorageDatabaseClient extends Disposable implements IStorageDatabase {
	private readonly onDidChangeItemsExternalEmitter =
		this._register(new Emitter<IStorageItemsChangeEvent>());
	public readonly onDidChangeItemsExternal =
		this.onDidChangeItemsExternalEmitter.event;
	private readonly onDidChangeValueExternalEmitter =
		this._register(new Emitter<{
			readonly key: string;
			readonly targetChanged: boolean;
		}>());
	public readonly onDidChangeValueExternal =
		this.onDidChangeValueExternalEmitter.event;

	private didGetItems = false;
	private readonly pendingChanges: StorageItemsChangeDto[] = [];

	constructor(
		private readonly channel: IChannel,
		private readonly scope: StorageScope,
	) {
		super();
		this._register(this.channel.listen<StorageItemsChangeDto>(
			STORAGE_ITEMS_CHANGE_EVENT,
			scope,
		)(event => {
			if (!this.didGetItems) {
				this.pendingChanges.push(event);
				return;
			}

			this.emitChange(event);
		}));
	}

	public async getItems(): Promise<Map<string, string>> {
		const items = await this.channel.call<readonly (readonly [string, string])[]>(
			"getItems",
			this.scope,
		);
		const result = new Map(items);
		for (const change of this.pendingChanges.splice(0)) {
			change.changed?.forEach(([key, value]) => result.set(key, value));
			change.deleted?.forEach(key => result.delete(key));
		}
		this.didGetItems = true;
		return result;
	}

	public async updateItems(request: IUpdateRequest): Promise<void> {
		await this.channel.call("updateItems", {
			scope: this.scope,
			insert: request.insert ? Array.from(request.insert) : undefined,
			delete: request.delete ? Array.from(request.delete) : undefined,
		} satisfies StorageUpdateRequestDto);
	}

	public async optimize(): Promise<void> {
		await this.channel.call("optimize", this.scope);
	}

	public async close(recovery?: () => Map<string, string>): Promise<void> {
		if (!recovery) {
			return;
		}

		await this.channel.call("replaceItems", {
			scope: this.scope,
			insert: Array.from(recovery()),
		} satisfies StorageUpdateRequestDto);
	}

	private emitChange(event: StorageItemsChangeDto): void {
		this.onDidChangeItemsExternalEmitter.fire({
			changed: event.changed ? new Map(event.changed) : undefined,
			deleted: event.deleted ? new Set(event.deleted) : undefined,
		});
		this.onDidChangeValueExternalEmitter.fire({
			key: event.key,
			targetChanged: event.targetChanged,
		});
	}
}

function toStorageUpdateRequest(value: unknown): StorageUpdateRequestDto {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		throw new Error("Invalid storage update request.");
	}

	const request = value as {
		readonly scope?: unknown;
		readonly insert?: unknown;
		readonly delete?: unknown;
	};
	return {
		scope: toStorageScope(request.scope),
		insert: toStorageEntries(request.insert),
		delete: toStorageKeys(request.delete),
	};
}

function toStorageEntries(
	value: unknown,
): readonly (readonly [string, string])[] | undefined {
	if (value === undefined) {
		return undefined;
	}
	if (!Array.isArray(value)) {
		throw new Error("Invalid storage insert entries.");
	}

	return value.map(entry => {
		if (
			!Array.isArray(entry) ||
			entry.length !== 2 ||
			typeof entry[0] !== "string" ||
			typeof entry[1] !== "string"
		) {
			throw new Error("Invalid storage insert entry.");
		}
		return [entry[0], entry[1]] as const;
	});
}

function toStorageKeys(value: unknown): readonly string[] | undefined {
	if (value === undefined) {
		return undefined;
	}
	if (!Array.isArray(value) || !value.every(key => typeof key === "string")) {
		throw new Error("Invalid storage delete entries.");
	}

	return value;
}

function toStorageScope(value: unknown): StorageScope {
	switch (value) {
		case StorageScope.APPLICATION:
			return StorageScope.APPLICATION;
		case StorageScope.WORKSPACE:
			return StorageScope.WORKSPACE;
		case StorageScope.PROFILE:
			return StorageScope.PROFILE;
		default:
			throw new Error(`Invalid storage scope '${String(value)}'.`);
	}
}

function addDisposable(
	disposable: IDisposable,
	disposables?: IDisposable[] | DisposableStore,
): void {
	if (!disposables) {
		return;
	}

	if (Array.isArray(disposables)) {
		disposables.push(disposable);
		return;
	}

	disposables.add(disposable);
}
