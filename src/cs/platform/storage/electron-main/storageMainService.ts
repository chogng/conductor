/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import {
	getStorageKey,
	getStorageKeyPrefix,
	StorageScope,
	type IStorageService,
} from "../common/storage.js";
import { AbstractStorageService } from "../common/storageService.js";
import {
	StorageMain,
	type IStorageMain,
	type StorageMainOptions,
	type StoredValues,
} from "./storageMain.js";

export type StorageMainServiceOptions = StorageMainOptions;

export class StorageMainService extends AbstractStorageService implements IStorageService {
	private values: StoredValues | null = null;
	private readonly storageMain: IStorageMain;

	constructor(options: StorageMainServiceOptions) {
		super();
		this.storageMain = new StorageMain(options);
	}

	protected readValue(key: string, scope: StorageScope): string | undefined {
		return this.readValues()[this.storageKey(key, scope)];
	}

	protected writeValue(key: string, scope: StorageScope, value: string): void {
		const values = this.readValues();
		values[this.storageKey(key, scope)] = value;
		this.writeValues(values);
	}

	protected deleteValue(key: string, scope: StorageScope): void {
		const values = this.readValues();
		delete values[this.storageKey(key, scope)];
		this.writeValues(values);
	}

	protected readKeys(scope: StorageScope): string[] {
		const prefix = this.storageKeyPrefix(scope);
		return Object.keys(this.readValues())
			.filter(key => key.startsWith(prefix))
			.map(key => key.slice(prefix.length));
	}

	private readValues(): StoredValues {
		if (!this.values) {
			this.values = this.storageMain.readValues();
		}

		return this.values;
	}

	private writeValues(values: StoredValues): void {
		this.values = values;
		this.storageMain.writeValues(values);
	}

	private storageKey(key: string, scope: StorageScope): string {
		return getStorageKey(key, scope);
	}

	private storageKeyPrefix(scope: StorageScope): string {
		return getStorageKeyPrefix(scope);
	}
}

export function createStorageMainService(options: StorageMainServiceOptions): IStorageService {
	return new StorageMainService(options);
}
