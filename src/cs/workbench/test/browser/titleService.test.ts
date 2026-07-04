import assert from "assert";

import { Event } from "src/cs/base/common/event";
import { StorageScope } from "src/cs/platform/storage/common/storage";
import { AbstractStorageService } from "src/cs/platform/storage/common/storageService";
import type { ICommandService } from "src/cs/platform/commands/common/commands";
import type { ICommandEvent } from "src/cs/platform/commands/common/commands";
import type {
  INativeHostEnvironment,
  INativeHostService,
  INativeOpenDialogOptions,
  INativeOpenDialogResult,
  INativeWindowControlsOptions,
} from "src/cs/platform/native/common/native";
import {
  BrowserTitleService,
  getWorkbenchTitlebarChrome,
  getWorkbenchWindowState,
} from "src/cs/workbench/browser/parts/titlebar/windowTitle";
import {
  BrowserWorkbenchLayoutService,
  Parts,
} from "src/cs/workbench/services/layout/browser/layoutService";
import { ChartViewContainerId } from "src/cs/workbench/services/chart/common/chart";
import type { IWorkbenchEnvironmentService } from "src/cs/workbench/services/environment/common/environmentService";
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
  showSaveDialog: async () => ({
    canceled: true,
  }),
  showMessageBox: async () => ({ response: 0 }),
  showItemInFolder: async () => undefined,
  writeElevated: async () => undefined,
  toggleDevTools: async () => undefined,
  reloadWindow: async () => undefined,
  isMaximized: async () => false,
  maximizeWindow: async () => undefined,
  unmaximizeWindow: async () => undefined,
  closeWindow: async () => undefined,
  minimizeWindow: async () => undefined,
  updateWindowControls: async (_options: INativeWindowControlsOptions) => undefined,
};

suite("workbench/browser/titleService", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("enables desktop chrome preview on macOS desktop", () => {
    const state = getWorkbenchWindowState(createEnvironmentService({
      isDesktop: true,
      platform: "darwin",
    }));

    assert.deepStrictEqual({
      isDesktopChromePreviewEnabled: state.isDesktopChromePreviewEnabled,
      isMacintoshDesktopShell: state.isMacintoshDesktopShell,
      isWindowsDesktopShell: state.isWindowsDesktopShell,
    }, {
      isDesktopChromePreviewEnabled: true,
      isMacintoshDesktopShell: true,
      isWindowsDesktopShell: false,
    });
  });

  test("resolves platform titlebar chrome", () => {
    const macState = getWorkbenchWindowState(createEnvironmentService({
      isDesktop: true,
      platform: "darwin",
    }));
    const windowsState = getWorkbenchWindowState(createEnvironmentService({
      isDesktop: true,
      platform: "win32",
    }));
    const macChrome = getWorkbenchTitlebarChrome(macState);
    const windowsChrome = getWorkbenchTitlebarChrome(windowsState);

    assert.deepStrictEqual({
      macShowBrandIcon: macChrome.showBrandIcon,
      macWindowControlsSide: macChrome.windowControlsSide,
      windowsShowBrandIcon: windowsChrome.showBrandIcon,
      windowsWindowControlsSide: windowsChrome.windowControlsSide,
    }, {
      macShowBrandIcon: false,
      macWindowControlsSide: "left",
      windowsShowBrandIcon: true,
      windowsWindowControlsSide: "right",
    });
  });

  test("publishes titlebar navigation state from the shell owner", () => {
    const storage = new TestStorageService();
    const layoutService = new BrowserWorkbenchLayoutService(storage);
    const titleService = new BrowserTitleService(testCommandService, layoutService, testNativeHostService);
    let changeCount = 0;

    const listener = titleService.onDidChangeTitlebarState(() => {
      changeCount += 1;
    });

    titleService.updateTitlebarState({
      activePage: ChartViewContainerId,
      canNavigateBack: true,
      canNavigateForward: false,
      enabled: true,
    });

    const state = titleService.getTitlebarState();

    assert.deepStrictEqual({
      activePage: state?.activePage,
      canNavigateBack: state?.canNavigateBack,
      canNavigateForward: state?.canNavigateForward,
      isAuxiliaryBarExpanded: state?.isAuxiliaryBarExpanded,
      isSidebarVisible: state?.isSidebarVisible,
      changeCount,
    }, {
      activePage: ChartViewContainerId,
      canNavigateBack: true,
      canNavigateForward: false,
      isAuxiliaryBarExpanded: true,
      isSidebarVisible: true,
      changeCount: 1,
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

  test("reflects auxiliary bar expanded state without owning layout state", () => {
    const storage = new TestStorageService();
    const layoutService = new BrowserWorkbenchLayoutService(storage);
    const titleService = new BrowserTitleService(testCommandService, layoutService, testNativeHostService);

    titleService.updateTitlebarState({ enabled: true });
    layoutService.setPartHidden(true, Parts.AUXILIARYBAR_PART);

    const state = titleService.getTitlebarState();

    assert.equal(state?.isAuxiliaryBarExpanded, false);
    assert.equal(layoutService.isVisible(Parts.AUXILIARYBAR_PART), false);

    titleService.dispose();
    layoutService.dispose();
    storage.dispose();
  });

  test("publishes titlebar command ids as state values", () => {
    const storage = new TestStorageService();
    const layoutService = new BrowserWorkbenchLayoutService(storage);
    const titleService = new BrowserTitleService(testCommandService, layoutService, testNativeHostService);

    titleService.updateTitlebarState({
      chartIntentCommandId: "chart.intent",
      enabled: true,
      installUpdateCommandId: "update.install",
      isUpdateReadyToInstall: true,
      isUpdateVisible: true,
      updateCommandId: "update.downloadNow",
      updateLabel: "Downloading 42%",
      updateProgressPercent: 42,
    });

    const state = titleService.getTitlebarState();

    assert.deepEqual({
      chartIntentCommandId: state?.chartIntentCommandId,
      installUpdateCommandId: state?.installUpdateCommandId,
      isUpdateVisible: state?.isUpdateVisible,
      updateCommandId: state?.updateCommandId,
      updateLabel: state?.updateLabel,
      updateProgressPercent: state?.updateProgressPercent,
    }, {
      chartIntentCommandId: "chart.intent",
      installUpdateCommandId: "update.install",
      isUpdateVisible: true,
      updateCommandId: "update.downloadNow",
      updateLabel: "Downloading 42%",
      updateProgressPercent: 42,
    });

    titleService.dispose();
    layoutService.dispose();
    storage.dispose();
  });

  test("patches titlebar state without replacing shell navigation state", () => {
    const storage = new TestStorageService();
    const layoutService = new BrowserWorkbenchLayoutService(storage);
    const titleService = new BrowserTitleService(testCommandService, layoutService, testNativeHostService);

    titleService.updateTitlebarState({
      activePage: ChartViewContainerId,
      canNavigateBack: true,
      chartIntentCommandId: "chart.intent",
      enabled: true,
    });
    titleService.patchTitlebarState({
      installUpdateCommandId: "update.install",
      isUpdateReadyToInstall: true,
      isUpdateVisible: true,
      updateCommandId: "update.install",
      updateLabel: "Install Update",
      updateProgressPercent: null,
      updateVersion: "1.2.3",
    });

    const state = titleService.getTitlebarState();

    assert.deepStrictEqual({
      activePage: state?.activePage,
      canNavigateBack: state?.canNavigateBack,
      chartIntentCommandId: state?.chartIntentCommandId,
      installUpdateCommandId: state?.installUpdateCommandId,
      isUpdateReadyToInstall: state?.isUpdateReadyToInstall,
      isUpdateVisible: state?.isUpdateVisible,
      updateCommandId: state?.updateCommandId,
      updateLabel: state?.updateLabel,
      updateProgressPercent: state?.updateProgressPercent,
      updateVersion: state?.updateVersion,
    }, {
      activePage: ChartViewContainerId,
      canNavigateBack: true,
      chartIntentCommandId: "chart.intent",
      installUpdateCommandId: "update.install",
      isUpdateReadyToInstall: true,
      isUpdateVisible: true,
      updateCommandId: "update.install",
      updateLabel: "Install Update",
      updateProgressPercent: null,
      updateVersion: "1.2.3",
    });

    titleService.dispose();
    layoutService.dispose();
    storage.dispose();
  });

  test("preserves update patch when workbench replaces base titlebar state", () => {
    const storage = new TestStorageService();
    const layoutService = new BrowserWorkbenchLayoutService(storage);
    const titleService = new BrowserTitleService(testCommandService, layoutService, testNativeHostService);

    titleService.updateTitlebarState({
      chartIntentCommandId: "chart.intent",
      enabled: true,
    });
    titleService.patchTitlebarState({
      installUpdateCommandId: "update.install",
      isUpdateReadyToInstall: true,
      isUpdateVisible: true,
      updateCommandId: "update.install",
      updateLabel: "Install Update",
      updateProgressPercent: null,
      updateTooltip: "Update Ready",
      updateVersion: "1.2.3",
    });
    titleService.updateTitlebarState({
      chartIntentCommandId: "chart.nextIntent",
      enabled: true,
    });

    const state = titleService.getTitlebarState();

    assert.deepStrictEqual({
      chartIntentCommandId: state?.chartIntentCommandId,
      installUpdateCommandId: state?.installUpdateCommandId,
      isUpdateReadyToInstall: state?.isUpdateReadyToInstall,
      isUpdateVisible: state?.isUpdateVisible,
      updateCommandId: state?.updateCommandId,
      updateLabel: state?.updateLabel,
      updateProgressPercent: state?.updateProgressPercent,
      updateTooltip: state?.updateTooltip,
      updateVersion: state?.updateVersion,
    }, {
      chartIntentCommandId: "chart.nextIntent",
      installUpdateCommandId: "update.install",
      isUpdateReadyToInstall: true,
      isUpdateVisible: true,
      updateCommandId: "update.install",
      updateLabel: "Install Update",
      updateProgressPercent: null,
      updateTooltip: "Update Ready",
      updateVersion: "1.2.3",
    });

    titleService.dispose();
    layoutService.dispose();
    storage.dispose();
  });
});

const createEnvironmentService = ({
  isDesktop,
  platform,
}: {
  readonly isDesktop: boolean;
  readonly platform: string;
}): IWorkbenchEnvironmentService => ({
  _serviceBrand: undefined,
  environment: {
    appVersion: "test",
    isDesktop,
    isPackaged: false,
    platform,
    userDataPath: null,
  },
  isDesktop,
  isPackaged: false,
  isWindowsDesktop: isDesktop && platform === "win32",
});
