import { type Event as EventType } from "../../../base/common/event.js";
import { DisposableStore } from "../../../base/common/lifecycle.js";
import { createDecorator } from "../../instantiation/common/instantiation.js";

export const IStorageService = createDecorator<IStorageService>("storageService");
export const STORAGE_VALUE_MAX_LENGTH = 16 * 1024;
export const STORAGE_KEY_PREFIX = "conductor.storage";

export const enum StorageScope {
  APPLICATION = -1,
  PROFILE = 0,
  WORKSPACE = 1,
}

export const enum StorageTarget {
  USER,
  MACHINE,
}

export const getStorageKeyPrefix = (scope: StorageScope): string =>
  `${STORAGE_KEY_PREFIX}.${scope}.`;

export const getStorageKey = (key: string, scope: StorageScope): string =>
  `${getStorageKeyPrefix(scope)}${key}`;

export type StorageValue = string | boolean | number | undefined | null | object;

export interface IStorageValueChangeEvent {
  readonly key: string;
  readonly scope: StorageScope;
  readonly target: StorageTarget | undefined;
}

export interface IStorageService {
  readonly _serviceBrand: undefined;

  onDidChangeValue(
    scope: StorageScope,
    key: string | undefined,
    disposable: DisposableStore,
  ): EventType<IStorageValueChangeEvent>;

  get(key: string, scope: StorageScope, fallbackValue: string): string;
  get(key: string, scope: StorageScope, fallbackValue?: string): string | undefined;
  getBoolean(key: string, scope: StorageScope, fallbackValue: boolean): boolean;
  getBoolean(key: string, scope: StorageScope, fallbackValue?: boolean): boolean | undefined;
  getNumber(key: string, scope: StorageScope, fallbackValue: number): number;
  getNumber(key: string, scope: StorageScope, fallbackValue?: number): number | undefined;
  getObject<T extends object>(key: string, scope: StorageScope, fallbackValue: T): T;
  getObject<T extends object>(key: string, scope: StorageScope, fallbackValue?: T): T | undefined;

  store(key: string, value: StorageValue, scope: StorageScope, target: StorageTarget): void;
  remove(key: string, scope: StorageScope): void;
  keys(scope: StorageScope): string[];
  removeByPrefix(prefix: string, scope: StorageScope): void;
}
