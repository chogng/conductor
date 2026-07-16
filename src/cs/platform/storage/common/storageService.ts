/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event, type Event as EventType } from "../../../base/common/event.js";
import { DisposableStore, type IDisposable } from "../../../base/common/lifecycle.js";
import {
	type IStorageService,
	type IStorageValueChangeEvent,
	StorageScope,
	StorageTarget,
	type StorageValue,
} from "./storage.js";

const TARGET_KEY = "__$__targetStorageMarker";

export abstract class AbstractStorageService implements IStorageService, IDisposable {
	declare readonly _serviceBrand: undefined;

	private readonly onDidChangeValueEmitter =
		new Emitter<IStorageValueChangeEvent>();
	private readonly targets = new Map<StorageScope, Map<string, StorageTarget>>();
	private readonly loadedTargetScopes = new Set<StorageScope>();
	private initializePromise: Promise<void> | undefined;

	public initialize(): Promise<void> {
		this.initializePromise ??= this.doInitialize();
		return this.initializePromise;
	}

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

		const valueChanged = this.readValue(key, scope) !== serializedValue;
		const targetChanged = this.updateTarget(key, scope, target);
		if (!valueChanged && !targetChanged) {
			return;
		}

		if (valueChanged) {
			this.runStorageOperation(this.writeValue(key, scope, serializedValue));
		}
		this.fireDidChangeValue(key, scope, target);
	}

	public remove(key: string, scope: StorageScope): void {
		const valueExists = this.readValue(key, scope) !== undefined;
		const targetChanged = this.updateTarget(key, scope, undefined);
		if (!valueExists && !targetChanged) {
			return;
		}

		if (valueExists) {
			this.runStorageOperation(this.deleteValue(key, scope));
		}
		this.fireDidChangeValue(key, scope, undefined);
	}

	public keys(scope: StorageScope): string[] {
		return this.readKeys(scope)
			.filter(key => key !== TARGET_KEY)
			.sort();
	}

	public removeByPrefix(prefix: string, scope: StorageScope): void {
		for (const key of this.keys(scope)) {
			if (key.startsWith(prefix)) {
				this.remove(key, scope);
			}
		}
	}

	public async flush(): Promise<void> {
		await this.doFlush();
	}

	public async close(): Promise<void> {
		await this.doClose();
	}

	public dispose(): void {
		this.onDidChangeValueEmitter.dispose();
	}

	protected async doInitialize(): Promise<void> {}
	protected async doFlush(): Promise<void> {}
	protected async doClose(): Promise<void> {
		await this.doFlush();
	}

	protected abstract readValue(key: string, scope: StorageScope): string | undefined;
	protected abstract writeValue(
		key: string,
		scope: StorageScope,
		value: string,
	): void | Promise<void>;
	protected abstract deleteValue(key: string, scope: StorageScope): void | Promise<void>;
	protected abstract readKeys(scope: StorageScope): string[];

	protected fireDidChangeValueExternal(key: string, scope: StorageScope): void {
		if (key === TARGET_KEY) {
			this.loadedTargetScopes.delete(scope);
			this.targets.delete(scope);
			return;
		}

		this.fireDidChangeValue(key, scope, this.getTarget(key, scope), true);
	}

	protected fireDidChangeValue(
		key: string,
		scope: StorageScope,
		target: StorageTarget | undefined,
		external = false,
	): void {
		this.onDidChangeValueEmitter.fire({ key, scope, target, external });
	}

	private getTarget(key: string, scope: StorageScope): StorageTarget | undefined {
		return this.getTargets(scope).get(key);
	}

	private getTargets(scope: StorageScope): Map<string, StorageTarget> {
		if (this.loadedTargetScopes.has(scope)) {
			return this.targets.get(scope) ?? new Map();
		}

		const targets = new Map<string, StorageTarget>();
		const rawTargets = this.readValue(TARGET_KEY, scope);
		if (rawTargets) {
			try {
				const parsed = JSON.parse(rawTargets) as unknown;
				if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
					for (const [key, value] of Object.entries(parsed)) {
						if (value === StorageTarget.USER || value === StorageTarget.MACHINE) {
							targets.set(key, value);
						}
					}
				}
			} catch (error) {
				console.warn(`Failed to parse storage targets for scope ${scope}.`, error);
			}
		}

		this.targets.set(scope, targets);
		this.loadedTargetScopes.add(scope);
		return targets;
	}

	private updateTarget(
		key: string,
		scope: StorageScope,
		target: StorageTarget | undefined,
	): boolean {
		const targets = this.getTargets(scope);
		const currentTarget = targets.get(key);
		if (currentTarget === target) {
			return false;
		}

		if (target === undefined) {
			targets.delete(key);
		} else {
			targets.set(key, target);
		}

		if (targets.size === 0) {
			this.runStorageOperation(this.deleteValue(TARGET_KEY, scope));
		} else {
			this.runStorageOperation(this.writeValue(
				TARGET_KEY,
				scope,
				JSON.stringify(Object.fromEntries(targets)),
			));
		}

		return true;
	}

	private runStorageOperation(operation: void | Promise<void>): void {
		if (operation) {
			void operation.catch(error => {
				console.error("Failed to update storage.", error);
			});
		}
	}
}
