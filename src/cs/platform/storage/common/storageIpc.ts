/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Event, type Event as EventType } from "../../../base/common/event.js";
import { DisposableStore, type IDisposable } from "../../../base/common/lifecycle.js";
import type { IChannel, IServerChannel } from "../../../base/parts/ipc/common/ipc.js";
import {
	type IStorageService,
	type IStorageValueChangeEvent,
	StorageScope,
	StorageTarget,
	type StorageValue,
} from "./storage.js";

export const STORAGE_CHANNEL_NAME = "storage";
export const STORAGE_VALUE_CHANGE_EVENT = "onDidChangeValue";

export type StorageValueChangeListenRequest = {
	readonly scope: StorageScope;
	readonly key?: string;
};

export interface IStorageChannelClient {
	onDidChangeValue(
		scope: StorageScope,
		key?: string,
	): EventType<IStorageValueChangeEvent>;

	get(key: string, scope: StorageScope, fallbackValue: string): Promise<string>;
	get(key: string, scope: StorageScope, fallbackValue?: string): Promise<string | undefined>;
	getBoolean(key: string, scope: StorageScope, fallbackValue: boolean): Promise<boolean>;
	getBoolean(key: string, scope: StorageScope, fallbackValue?: boolean): Promise<boolean | undefined>;
	getNumber(key: string, scope: StorageScope, fallbackValue: number): Promise<number>;
	getNumber(key: string, scope: StorageScope, fallbackValue?: number): Promise<number | undefined>;
	getObject<T extends object>(key: string, scope: StorageScope, fallbackValue: T): Promise<T>;
	getObject<T extends object>(key: string, scope: StorageScope, fallbackValue?: T): Promise<T | undefined>;

	store(key: string, value: StorageValue, scope: StorageScope, target: StorageTarget): Promise<void>;
	remove(key: string, scope: StorageScope): Promise<void>;
	keys(scope: StorageScope): Promise<string[]>;
	removeByPrefix(prefix: string, scope: StorageScope): Promise<void>;
}

export class StorageChannel implements IServerChannel<string> {
	constructor(private readonly storageService: IStorageService) { }

	public listen<T>(
		_ctx: string,
		event: string,
		arg?: unknown,
	): EventType<T> {
		if (event === STORAGE_VALUE_CHANGE_EVENT) {
			const request = toValueChangeListenRequest(arg);
			return this.onDidChangeValue(request.scope, request.key) as EventType<T>;
		}

		return Event.None as EventType<T>;
	}

	public async call<T>(
		_ctx: string,
		command: string,
		arg?: unknown,
	): Promise<T> {
		const args = Array.isArray(arg) ? arg : [];

		switch (command) {
			case "get":
				return this.storageService.get(
					toKey(args[0]),
					toStorageScope(args[1]),
					args[2] === undefined ? undefined : String(args[2]),
				) as T;
			case "getBoolean":
				return this.storageService.getBoolean(
					toKey(args[0]),
					toStorageScope(args[1]),
					toOptionalBoolean(args[2]),
				) as T;
			case "getNumber":
				return this.storageService.getNumber(
					toKey(args[0]),
					toStorageScope(args[1]),
					toOptionalNumber(args[2]),
				) as T;
			case "getObject":
				return this.storageService.getObject(
					toKey(args[0]),
					toStorageScope(args[1]),
					toOptionalObject(args[2]),
				) as T;
			case "store":
				this.storageService.store(
					toKey(args[0]),
					args[1] as StorageValue,
					toStorageScope(args[2]),
					toStorageTarget(args[3]),
				);
				return undefined as T;
			case "remove":
				this.storageService.remove(toKey(args[0]), toStorageScope(args[1]));
				return undefined as T;
			case "keys":
				return this.storageService.keys(toStorageScope(args[0])) as T;
			case "removeByPrefix":
				this.storageService.removeByPrefix(
					toKey(args[0]),
					toStorageScope(args[1]),
				);
				return undefined as T;
			default:
				throw new Error(`Unknown storage command '${command}'.`);
		}
	}

	private onDidChangeValue(
		scope: StorageScope,
		key: string | undefined,
	): EventType<IStorageValueChangeEvent> {
		return (listener, thisArgs, disposables) => {
			const store = new DisposableStore();
			this.storageService.onDidChangeValue(scope, key, store)(listener, thisArgs);
			addDisposable(store, disposables);
			return store;
		};
	}
}

export class StorageChannelClient implements IStorageChannelClient {
	constructor(private readonly channel: IChannel) { }

	public onDidChangeValue(
		scope: StorageScope,
		key?: string,
	): EventType<IStorageValueChangeEvent> {
		return this.channel.listen<IStorageValueChangeEvent>(
			STORAGE_VALUE_CHANGE_EVENT,
			{ scope, key } satisfies StorageValueChangeListenRequest,
		);
	}

	public get(key: string, scope: StorageScope, fallbackValue: string): Promise<string>;
	public get(key: string, scope: StorageScope, fallbackValue?: string): Promise<string | undefined>;
	public get(key: string, scope: StorageScope, fallbackValue?: string): Promise<string | undefined> {
		return this.channel.call("get", [key, scope, fallbackValue]);
	}

	public getBoolean(key: string, scope: StorageScope, fallbackValue: boolean): Promise<boolean>;
	public getBoolean(key: string, scope: StorageScope, fallbackValue?: boolean): Promise<boolean | undefined>;
	public getBoolean(key: string, scope: StorageScope, fallbackValue?: boolean): Promise<boolean | undefined> {
		return this.channel.call("getBoolean", [key, scope, fallbackValue]);
	}

	public getNumber(key: string, scope: StorageScope, fallbackValue: number): Promise<number>;
	public getNumber(key: string, scope: StorageScope, fallbackValue?: number): Promise<number | undefined>;
	public getNumber(key: string, scope: StorageScope, fallbackValue?: number): Promise<number | undefined> {
		return this.channel.call("getNumber", [key, scope, fallbackValue]);
	}

	public getObject<T extends object>(key: string, scope: StorageScope, fallbackValue: T): Promise<T>;
	public getObject<T extends object>(key: string, scope: StorageScope, fallbackValue?: T): Promise<T | undefined>;
	public getObject<T extends object>(key: string, scope: StorageScope, fallbackValue?: T): Promise<T | undefined> {
		return this.channel.call("getObject", [key, scope, fallbackValue]);
	}

	public store(
		key: string,
		value: StorageValue,
		scope: StorageScope,
		target: StorageTarget,
	): Promise<void> {
		return this.channel.call("store", [key, value, scope, target]);
	}

	public remove(key: string, scope: StorageScope): Promise<void> {
		return this.channel.call("remove", [key, scope]);
	}

	public keys(scope: StorageScope): Promise<string[]> {
		return this.channel.call("keys", [scope]);
	}

	public removeByPrefix(prefix: string, scope: StorageScope): Promise<void> {
		return this.channel.call("removeByPrefix", [prefix, scope]);
	}
}

function toValueChangeListenRequest(arg: unknown): StorageValueChangeListenRequest {
	if (isObject(arg)) {
		return {
			scope: toStorageScope(arg.scope),
			key: typeof arg.key === "string" ? arg.key : undefined,
		};
	}

	return { scope: StorageScope.PROFILE };
}

function toKey(value: unknown): string {
	return String(value ?? "");
}

function toStorageScope(value: unknown): StorageScope {
	switch (value) {
		case StorageScope.APPLICATION:
			return StorageScope.APPLICATION;
		case StorageScope.WORKSPACE:
			return StorageScope.WORKSPACE;
		case StorageScope.PROFILE:
		default:
			return StorageScope.PROFILE;
	}
}

function toStorageTarget(value: unknown): StorageTarget {
	return value === StorageTarget.MACHINE ? StorageTarget.MACHINE : StorageTarget.USER;
}

function toOptionalBoolean(value: unknown): boolean | undefined {
	if (value === undefined) {
		return undefined;
	}

	return value === true;
}

function toOptionalNumber(value: unknown): number | undefined {
	if (value === undefined) {
		return undefined;
	}

	const numberValue = Number(value);
	return Number.isFinite(numberValue) ? numberValue : undefined;
}

function toOptionalObject(value: unknown): object | undefined {
	return isObject(value) ? value : undefined;
}

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
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
