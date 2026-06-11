import assert from "assert";

import { Event } from "src/cs/base/common/event";
import {
  AbstractStorageService,
  StorageScope,
} from "src/cs/platform/storage/common/storage";
import type { ICommandService } from "src/cs/platform/commands/common/commands";
import type { ICommandEvent } from "src/cs/platform/commands/common/commands";
import type {
  INativeHostService,
  INativeOpenDialogOptions,
  INativeOpenDialogResult,
  INativeWindowControlsOptions,
} from "src/cs/platform/native/common/native";
import type { INativeHostEnvironment } from "src/cs/platform/native/common/nativeHostService";
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

const testNativeHostService: INativeHostService = {
  _serviceBrand: undefined,
  windowId: 1,
  getEnvironment: async (): Promise<INativeHostEnvironment> => ({
    appVersion: "test",
    isDesktop: true,
    isPackaged: false,
    platform: "win32",
    userDataPath: null,
  }),
  showOpenDialog: async (_options: INativeOpenDialogOptions): Promise<INativeOpenDialogResult> => ({
    canceled: true,
    filePaths: [],
  }),
  showItemInFolder: () => undefined,
  toggleDevTools: () => undefined,
  reloadWindow: () => undefined,
  isMaximized: async () => false,
  maximizeWindow: () => undefined,
  unmaximizeWindow: () => undefined,
  closeWindow: () => undefined,
  minimizeWindow: () => undefined,
  updateWindowControls: (_options: INativeWindowControlsOptions) => undefined,
};

suite("workbench/browser/titleService", () => {
  test("publishes titlebar state from the layout owner", () => {
    const storage = new TestStorageService();
    const layoutService = new BrowserWorkbenchLayoutService(storage);
    const titleService = new BrowserTitleService(testCommandService, layoutService, testNativeHostService);
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
    const titleService = new BrowserTitleService(testCommandService, layoutService, testNativeHostService);

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
