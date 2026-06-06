import { InstantiationType, registerSingleton } from "src/cs/platform/instantiation/common/extensions";
import {
  AbstractStorageService,
  getStorageKey,
  getStorageKeyPrefix,
  IStorageService,
  StorageScope,
  type IStorageService as IStorageServiceType,
} from "src/cs/platform/storage/common/storage";

export class BrowserStorageService
  extends AbstractStorageService
  implements IStorageServiceType {
  private readonly fallback = new Map<string, string>();
  private readonly storage: globalThis.Storage | null = getLocalStorage();

  protected readValue(key: string, scope: StorageScope): string | undefined {
    const storageKey = this.storageKey(key, scope);
    try {
      return this.storage?.getItem(storageKey) ?? this.fallback.get(storageKey);
    } catch {
      return this.fallback.get(storageKey);
    }
  }

  protected writeValue(key: string, scope: StorageScope, value: string): void {
    const storageKey = this.storageKey(key, scope);
    this.fallback.set(storageKey, value);
    try {
      this.storage?.setItem(storageKey, value);
    } catch {
      // Keep the in-memory fallback current when browser storage is unavailable.
    }
  }

  protected deleteValue(key: string, scope: StorageScope): void {
    const storageKey = this.storageKey(key, scope);
    this.fallback.delete(storageKey);
    try {
      this.storage?.removeItem(storageKey);
    } catch {
      // The fallback has already been updated.
    }
  }

  protected readKeys(scope: StorageScope): string[] {
    const prefix = this.storageKeyPrefix(scope);
    const keys = new Set<string>();

    for (const key of this.fallback.keys()) {
      if (key.startsWith(prefix)) {
        keys.add(key.slice(prefix.length));
      }
    }

    try {
      const storage = this.storage;
      if (storage) {
        for (let i = 0; i < storage.length; i += 1) {
          const key = storage.key(i);
          if (key?.startsWith(prefix)) {
            keys.add(key.slice(prefix.length));
          }
        }
      }
    } catch {
      // Fall back to the in-memory keys collected above.
    }

    return [...keys];
  }

  private storageKey(key: string, scope: StorageScope): string {
    return getStorageKey(key, scope);
  }

  private storageKeyPrefix(scope: StorageScope): string {
    return getStorageKeyPrefix(scope);
  }
}

function getLocalStorage(): globalThis.Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

registerSingleton(IStorageService, BrowserStorageService, InstantiationType.Delayed);
