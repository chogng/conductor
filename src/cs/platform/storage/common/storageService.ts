/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event, type Event as EventType } from "../../../base/common/event.js";
import { DisposableStore, type IDisposable } from "../../../base/common/lifecycle.js";
import {
	STORAGE_VALUE_MAX_LENGTH,
	type IStorageService,
	type IStorageValueChangeEvent,
	StorageScope,
	StorageTarget,
	type StorageValue,
} from "./storage.js";

export abstract class AbstractStorageService implements IStorageService, IDisposable {
	declare readonly _serviceBrand: undefined;

	private readonly onDidChangeValueEmitter =
		new Emitter<IStorageValueChangeEvent>();

	public onDidChangeValue(
		scope: StorageScope,
		key: string | undefined,
		disposable: DisposableStore,
	): EventType<IStorageValueChangeEvent> {
		const event = Event.filter(
			this.onDidChangeValueEmitter.event,
			event => event.scope === scope && (key === undefined || event.key === key),
		) as EventType<IStorageValueChangeEvent>;
		return (listener, thisArgs, disposables) =>
			event(listener, thisArgs, disposables ?? disposable);
	}

	public get(key: string, scope: StorageScope, fallbackValue: string): string;
	public get(key: string, scope: StorageScope, fallbackValue?: string): string | undefined;
	public get(key: string, scope: StorageScope, fallbackValue?: string): string | undefined {
		return this.readValue(key, scope) ?? fallbackValue;
	}

	public getBoolean(key: string, scope: StorageScope, fallbackValue: boolean): boolean;
	public getBoolean(key: string, scope: StorageScope, fallbackValue?: boolean): boolean | undefined;
	public getBoolean(key: string, scope: StorageScope, fallbackValue?: boolean): boolean | undefined {
		const value = this.readValue(key, scope);
		if (value === undefined) {
			return fallbackValue;
		}

		return value === "true";
	}

	public getNumber(key: string, scope: StorageScope, fallbackValue: number): number;
	public getNumber(key: string, scope: StorageScope, fallbackValue?: number): number | undefined;
	public getNumber(key: string, scope: StorageScope, fallbackValue?: number): number | undefined {
		const value = this.readValue(key, scope);
		if (value === undefined) {
			return fallbackValue;
		}

		const numberValue = Number(value);
		return Number.isFinite(numberValue) ? numberValue : fallbackValue;
	}

	public getObject<T extends object>(key: string, scope: StorageScope, fallbackValue: T): T;
	public getObject<T extends object>(key: string, scope: StorageScope, fallbackValue?: T): T | undefined;
	public getObject<T extends object>(
		key: string,
		scope: StorageScope,
		fallbackValue?: T,
	): T | undefined {
		const value = this.readValue(key, scope);
		if (value === undefined) {
			return fallbackValue;
		}

		try {
			const parsed = JSON.parse(value) as unknown;
			return parsed && typeof parsed === "object" ? parsed as T : fallbackValue;
		} catch {
			return fallbackValue;
		}
	}

	public store(
		key: string,
		value: StorageValue,
		scope: StorageScope,
		target: StorageTarget,
	): void {
		if (value === undefined || value === null) {
			this.remove(key, scope);
			return;
		}

		const serializedValue =
			typeof value === "object" ? JSON.stringify(value) : String(value);
		if (serializedValue.length > STORAGE_VALUE_MAX_LENGTH) {
			this.warnLargeValue(key, scope, serializedValue.length);
			return;
		}

		this.writeValue(key, scope, serializedValue);
		this.fireDidChangeValue(key, scope, target);
	}

	public remove(key: string, scope: StorageScope): void {
		this.deleteValue(key, scope);
		this.fireDidChangeValue(key, scope, undefined);
	}

	public keys(scope: StorageScope): string[] {
		return this.readKeys(scope).sort();
	}

	public removeByPrefix(prefix: string, scope: StorageScope): void {
		for (const key of this.keys(scope)) {
			if (key.startsWith(prefix)) {
				this.remove(key, scope);
			}
		}
	}

	public dispose(): void {
		this.onDidChangeValueEmitter.dispose();
	}

	protected abstract readValue(key: string, scope: StorageScope): string | undefined;
	protected abstract writeValue(key: string, scope: StorageScope, value: string): void;
	protected abstract deleteValue(key: string, scope: StorageScope): void;
	protected abstract readKeys(scope: StorageScope): string[];

	private fireDidChangeValue(
		key: string,
		scope: StorageScope,
		target: StorageTarget | undefined,
	): void {
		this.onDidChangeValueEmitter.fire({ key, scope, target });
	}

	private warnLargeValue(key: string, scope: StorageScope, length: number): void {
		console.warn(
			`Skipped storing '${key}' in scope ${scope}: value length ${length} exceeds ${STORAGE_VALUE_MAX_LENGTH}.`,
		);
	}
}
