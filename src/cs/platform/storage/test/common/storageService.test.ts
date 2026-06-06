import assert from "assert";
import { DisposableStore } from "src/cs/base/common/lifecycle";
import {
  AbstractStorageService,
  getStorageKey,
  getStorageKeyPrefix,
  STORAGE_VALUE_MAX_LENGTH,
  StorageScope,
  StorageTarget,
} from "src/cs/platform/storage/common/storage";

class TestStorageService extends AbstractStorageService {
  private readonly values = new Map<string, string>();

  protected readValue(key: string, scope: StorageScope): string | undefined {
    return this.values.get(this.storageKey(key, scope));
  }

  protected writeValue(key: string, scope: StorageScope, value: string): void {
    this.values.set(this.storageKey(key, scope), value);
  }

  protected deleteValue(key: string, scope: StorageScope): void {
    this.values.delete(this.storageKey(key, scope));
  }

  protected readKeys(scope: StorageScope): string[] {
    const prefix = `${scope}:`;
    const keys: string[] = [];
    for (const key of this.values.keys()) {
      if (key.startsWith(prefix)) {
        keys.push(key.slice(prefix.length));
      }
    }
    return keys;
  }

  private storageKey(key: string, scope: StorageScope): string {
    return `${scope}:${key}`;
  }
}

suite("platform/storage/common/storageService", () => {
  test("creates scoped physical storage keys", () => {
    assert.equal(
      getStorageKeyPrefix(StorageScope.PROFILE),
      "conductor.storage.0.",
    );
    assert.equal(
      getStorageKey("workbench.sidebar.width", StorageScope.PROFILE),
      "conductor.storage.0.workbench.sidebar.width",
    );
  });

  test("stores typed values by scope", () => {
    const store = new TestStorageService();

    store.store("sidebar.visible", false, StorageScope.PROFILE, StorageTarget.USER);
    store.store("sidebar.width", 320, StorageScope.PROFILE, StorageTarget.USER);
    store.store("sidebar.width", 220, StorageScope.WORKSPACE, StorageTarget.USER);
    store.store("view.state", { active: "data" }, StorageScope.PROFILE, StorageTarget.USER);

    assert.equal(store.getBoolean("sidebar.visible", StorageScope.PROFILE), false);
    assert.equal(store.getNumber("sidebar.width", StorageScope.PROFILE), 320);
    assert.equal(store.getNumber("sidebar.width", StorageScope.WORKSPACE), 220);
    assert.deepEqual(
      store.getObject("view.state", StorageScope.PROFILE),
      { active: "data" },
    );

    store.dispose();
  });

  test("emits filtered change events", () => {
    const store = new TestStorageService();
    const disposables = new DisposableStore();
    const changed: string[] = [];

    store.onDidChangeValue(StorageScope.PROFILE, "sidebar.width", disposables)(
      event => changed.push(event.key),
    );

    store.store("sidebar.visible", true, StorageScope.PROFILE, StorageTarget.USER);
    store.store("sidebar.width", 310, StorageScope.PROFILE, StorageTarget.USER);
    store.store("sidebar.width", 320, StorageScope.WORKSPACE, StorageTarget.USER);

    assert.deepEqual(changed, ["sidebar.width"]);
    disposables.dispose();
    store.dispose();
  });

  test("lists keys and removes by prefix within one scope", () => {
    const store = new TestStorageService();

    store.store("workbench.sidebar.width", 300, StorageScope.PROFILE, StorageTarget.USER);
    store.store("workbench.part.hidden.sidebar", true, StorageScope.PROFILE, StorageTarget.USER);
    store.store("other.value", "keep", StorageScope.PROFILE, StorageTarget.USER);
    store.store("workbench.sidebar.width", 220, StorageScope.WORKSPACE, StorageTarget.USER);

    assert.deepEqual(
      store.keys(StorageScope.PROFILE),
      ["other.value", "workbench.part.hidden.sidebar", "workbench.sidebar.width"],
    );

    store.removeByPrefix("workbench.", StorageScope.PROFILE);

    assert.equal(store.get("workbench.sidebar.width", StorageScope.PROFILE), undefined);
    assert.equal(store.getBoolean("workbench.part.hidden.sidebar", StorageScope.PROFILE), undefined);
    assert.equal(store.get("other.value", StorageScope.PROFILE), "keep");
    assert.equal(store.getNumber("workbench.sidebar.width", StorageScope.WORKSPACE), 220);
    store.dispose();
  });

  test("skips values above the storage size limit", () => {
    const store = new TestStorageService();
    const warnings: string[] = [];
    const originalWarn = console.warn;
    console.warn = (message?: unknown) => {
      warnings.push(String(message));
    };

    try {
      store.store(
        "large.value",
        "x".repeat(STORAGE_VALUE_MAX_LENGTH + 1),
        StorageScope.PROFILE,
        StorageTarget.USER,
      );
    } finally {
      console.warn = originalWarn;
    }

    assert.equal(store.get("large.value", StorageScope.PROFILE), undefined);
    assert.equal(warnings.length, 1);
    store.dispose();
  });
});
