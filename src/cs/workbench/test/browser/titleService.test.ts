import assert from "assert";

import { Event } from "src/cs/base/common/event";
import {
  AbstractStorageService,
  StorageScope,
} from "src/cs/platform/storage/common/storage";
import type { ICommandService } from "src/cs/platform/commands/common/commands";
import type { ICommandEvent } from "src/cs/platform/commands/common/commands";
import { BrowserTitleService } from "src/cs/workbench/browser/parts/titlebar/titlebarPart";
import {
  BrowserWorkbenchLayoutService,
  Parts,
} from "src/cs/workbench/services/layout/browser/layoutService";

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

const testCommandService: ICommandService = {
  _serviceBrand: undefined,
  onDidExecuteCommand: Event.None as Event<ICommandEvent>,
  onWillExecuteCommand: Event.None as Event<ICommandEvent>,
  executeCommand: async () => undefined,
};

suite("workbench/browser/titleService", () => {
  test("publishes titlebar state from the layout owner", () => {
    const storage = new TestStorageService();
    const layoutService = new BrowserWorkbenchLayoutService(storage);
    const titleService = new BrowserTitleService(testCommandService, layoutService);
    let changeCount = 0;

    const listener = titleService.onDidChangeTitlebarState(() => {
      changeCount += 1;
    });

    titleService.updateTitlebarState({ enabled: true });
    layoutService.navigateToView("chart");

    const state = titleService.getTitlebarState();

    assert.deepStrictEqual({
      activePage: state?.activePage,
      canNavigateBack: state?.canNavigateBack,
      canNavigateForward: state?.canNavigateForward,
      isSidebarVisible: state?.isSidebarVisible,
      changeCount,
    }, {
      activePage: "chart",
      canNavigateBack: true,
      canNavigateForward: false,
      isSidebarVisible: true,
      changeCount: 2,
    });

    listener.dispose();
    titleService.dispose();
    layoutService.dispose();
    storage.dispose();
  });

  test("reflects sidebar visibility without owning layout state", () => {
    const storage = new TestStorageService();
    const layoutService = new BrowserWorkbenchLayoutService(storage);
    const titleService = new BrowserTitleService(testCommandService, layoutService);

    titleService.updateTitlebarState({ enabled: true });
    layoutService.setPartHidden(true, Parts.SIDEBAR_PART);

    const state = titleService.getTitlebarState();

    assert.equal(state?.isSidebarVisible, false);
    assert.equal(layoutService.isVisible(Parts.SIDEBAR_PART), false);

    titleService.dispose();
    layoutService.dispose();
    storage.dispose();
  });
});
