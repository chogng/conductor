import assert from "assert";
import { StorageScope } from "src/cs/platform/storage/common/storage";
import { AbstractStorageService } from "src/cs/platform/storage/common/storageService";
import {
  MAIN_MIN_WIDTH_PX,
  TEMPLATE_MODE_ICON_ONLY_THRESHOLD_PX,
} from "src/cs/workbench/browser/layout";
import {
  AuxiliaryBarLayout,
  AUXILIARY_BAR_DEFAULT_WIDTH_PX,
  AUXILIARY_BAR_MAX_WIDTH_PX,
  AUXILIARY_BAR_MIN_WIDTH_PX,
} from "src/cs/workbench/browser/parts/auxiliarybar/auxiliaryBarPart";
import {
  SidebarLayout,
  SIDEBAR_DEFAULT_WIDTH_PX,
  SIDEBAR_MAX_WIDTH_PX,
  SIDEBAR_MIN_WIDTH_PX,
} from "src/cs/workbench/browser/parts/sidebar/sidebarPart";
import {
  BrowserWorkbenchLayoutService,
  Parts,
} from "src/cs/workbench/services/layout/browser/layoutService";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";

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

suite("workbench/browser/layout", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("sidebar width follows workbench part bounds", () => {
    assert.equal(SIDEBAR_MIN_WIDTH_PX, 170);
    assert.equal(SIDEBAR_DEFAULT_WIDTH_PX, 250);
    assert.equal(SIDEBAR_MAX_WIDTH_PX, Number.POSITIVE_INFINITY);
  });

  test("auxiliary bar width follows workbench part bounds", () => {
    assert.equal(AUXILIARY_BAR_MIN_WIDTH_PX, 170);
    assert.equal(AUXILIARY_BAR_DEFAULT_WIDTH_PX, 280);
    assert.equal(AUXILIARY_BAR_MAX_WIDTH_PX, Number.POSITIVE_INFINITY);
  });

  test("main area keeps the upstream editor minimum width", () => {
    assert.equal(MAIN_MIN_WIDTH_PX, 220);
  });

  test("template icon-only threshold stays below the default sidebar width", () => {
    assert.ok(TEMPLATE_MODE_ICON_ONLY_THRESHOLD_PX < SIDEBAR_DEFAULT_WIDTH_PX);
  });

  test("layout state reset restores hidden workbench parts", () => {
    const storage = new TestStorageService();
    const service = new BrowserWorkbenchLayoutService(storage);

    service.setPartHidden(true, Parts.SIDEBAR_PART);

    assert.equal(service.isVisible(Parts.SIDEBAR_PART), false);
    assert.equal(
      storage.getBoolean(
        `workbench.part.hidden.${Parts.SIDEBAR_PART}`,
        StorageScope.PROFILE,
      ),
      true,
    );

    service.resetLayoutState();

    assert.equal(service.isVisible(Parts.SIDEBAR_PART), true);
    assert.equal(
      storage.getBoolean(
        `workbench.part.hidden.${Parts.SIDEBAR_PART}`,
        StorageScope.PROFILE,
      ),
      undefined,
    );

    service.dispose();
    storage.dispose();
  });

  test("sidebar layout clamps stored width input", () => {
    const layout = new SidebarLayout(120);

    assert.equal(layout.width, SIDEBAR_MIN_WIDTH_PX);

    layout.resize(360);
    assert.equal(layout.width, 360);

    layout.dispose();
  });

  test("auxiliary bar layout clamps stored width input", () => {
    const layout = new AuxiliaryBarLayout(120);

    assert.equal(layout.width, AUXILIARY_BAR_MIN_WIDTH_PX);

    layout.resize(360);
    assert.equal(layout.width, 360);

    layout.dispose();
  });
});
