import assert from "node:assert/strict";

import { ConfigurationTarget } from "src/cs/platform/configuration/common/configuration";
import { ConfigurationService } from "src/cs/platform/configuration/common/configurationService";
import { StorageScope, StorageTarget, type IStorageService } from "src/cs/platform/storage/common/storage";
import { TrayMainService, type TrayMainServiceOptions } from "src/cs/platform/windows/electron-main/trayMainServiceImpl";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";

class TestStorageService {
  public readonly _serviceBrand = undefined;
  private readonly values = new Map<string, unknown>();

  public onDidChangeValue() {
    return () => ({ dispose: () => undefined });
  }

  public get(_key: string, _scope: StorageScope, fallbackValue?: string): string | undefined {
    return fallbackValue;
  }

  public getBoolean(key: string, _scope: StorageScope, fallbackValue?: boolean): boolean | undefined {
    const value = this.values.get(key);
    return typeof value === "boolean" ? value : fallbackValue;
  }

  public getNumber(_key: string, _scope: StorageScope, fallbackValue?: number): number | undefined {
    return fallbackValue;
  }

  public getObject<T extends object>(_key: string, _scope: StorageScope, fallbackValue?: T): T | undefined {
    return fallbackValue;
  }

  public store(key: string, value: unknown, _scope: StorageScope, _target: StorageTarget): void {
    this.values.set(key, value);
  }

  public remove(key: string): void {
    this.values.delete(key);
  }

  public keys(): string[] {
    return Array.from(this.values.keys());
  }

  public removeByPrefix(prefix: string): void {
    for (const key of this.values.keys()) {
      if (key.startsWith(prefix)) {
        this.values.delete(key);
      }
    }
  }
}

class TestWindow {
  public hidden = false;

  public isDestroyed(): boolean {
    return false;
  }

  public isVisible(): boolean {
    return !this.hidden;
  }

  public hide(): void {
    this.hidden = true;
  }
}

class TestEvent {
  public prevented = false;

  public preventDefault(): void {
    this.prevented = true;
  }
}

class TestTray {
  public balloons = 0;
  public contextMenu: unknown = null;
  public tooltip = "";
  public readonly listeners = new Map<string, () => void>();

  public setToolTip(value: string): void {
    this.tooltip = value;
  }

  public on(event: string, listener: () => void): void {
    this.listeners.set(event, listener);
  }

  public setContextMenu(menu: unknown): void {
    this.contextMenu = menu;
  }

  public displayBalloon(): void {
    this.balloons++;
  }

  public destroy(): void {
    this.listeners.clear();
  }
}

const createService = async (
  platform: NodeJS.Platform,
  windowCloseBehavior: "minimizeToTray" | "quit",
  optionOverrides: Partial<TrayMainServiceOptions> = {},
) => {
  const configurationService = new ConfigurationService();
  await configurationService.updateValue("windowCloseBehavior", windowCloseBehavior, ConfigurationTarget.USER);
  const storageService = new TestStorageService();
  const options: TrayMainServiceOptions = {
    appDisplayName: "Conductor",
    platform,
    checkForUpdates: () => undefined,
    ensureMainWindowVisible: () => null,
    getMainWindow: () => null,
    quit: () => undefined,
    resolveTrayIconPath: () => "tray.png",
    showMessage: key => key,
    ...optionOverrides,
  };

  return {
    configurationService,
    service: new TrayMainService(
      options,
      configurationService,
      storageService as unknown as IStorageService,
    ),
    storageService,
  };
};

suite("platform/windows/electron-main/trayMainService", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("minimizes macOS windows to tray when configured", async () => {
    const window = new TestWindow();
    const event = new TestEvent();
    const { configurationService, service } = await createService("darwin", "minimizeToTray");

    assert.equal(service.handleWindowClose(window as never, event as never), true);
    assert.equal(event.prevented, true);
    assert.equal(window.hidden, true);
    assert.equal(service.shouldMinimizeToTrayOnWindowClose(), true);

    service.dispose();
    configurationService.dispose();
  });

  test("quit close behavior requests application quit on macOS", async () => {
    const window = new TestWindow();
    const event = new TestEvent();
    let quitCount = 0;
    const { configurationService, service } = await createService("darwin", "quit", {
      quit: () => {
        quitCount++;
      },
    });

    assert.equal(service.handleWindowClose(window as never, event as never), true);
    assert.equal(event.prevented, true);
    assert.equal(window.hidden, false);
    assert.equal(quitCount, 1);
    assert.equal(service.isQuitRequested(), true);

    service.dispose();
    configurationService.dispose();
  });

  test("shows the minimize hint balloon only once on Windows", async () => {
    const tray = new TestTray();
    const window = new TestWindow();
    const { configurationService, service } = await createService("win32", "minimizeToTray", {
      imageFactory: () => ({ setTemplateImage: () => undefined }) as never,
      menuFactory: items => items as never,
      trayFactory: () => tray as never,
    });

    service.createTray();
    service.hideWindowToTray(window as never, { showTrayHint: true });
    service.hideWindowToTray(window as never, { showTrayHint: true });

    assert.equal(tray.balloons, 1);

    service.dispose();
    configurationService.dispose();
  });
});
