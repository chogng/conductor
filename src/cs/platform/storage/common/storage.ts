import { type Event as EventType } from "../../../base/common/event.js";
import { DisposableStore } from "../../../base/common/lifecycle.js";
import { createDecorator } from "../../instantiation/common/instantiation.js";
import type { IAnyWorkspaceIdentifier } from "../../workspaces/common/workspaceIdentifier.js";

export const IStorageService = createDecorator<IStorageService>("storageService");
export const STORAGE_TARGET_KEY = "__$__targetStorageMarker";
export const WORKSPACE_STORAGE_FOLDER_NAME = ".conductor";
export const WORKSPACE_STORAGE_FILENAME = "state.vscdb";

export const enum StorageScope {
  APPLICATION = -1,
  PROFILE = 0,
  WORKSPACE = 1,
}

export const enum StorageTarget {
  USER,
  MACHINE,
}

export type StorageValue = string | boolean | number | undefined | null | object;

export interface IStorageValueChangeEvent {
  readonly key: string;
  readonly scope: StorageScope;
  readonly target: StorageTarget | undefined;
  readonly external?: boolean;
  readonly targetChanged?: boolean;
}

export interface IStorageService {
  readonly _serviceBrand: undefined;

  initialize(): Promise<void>;
  switchWorkspace(workspace: IAnyWorkspaceIdentifier): Promise<void>;

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

  flush(): Promise<void>;
  close(): Promise<void>;
}
