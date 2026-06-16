import assert from "assert";

import { Event } from "src/cs/base/common/event";
import { SettingsController } from "src/cs/workbench/contrib/settings/browser/settingsController";
import { NoOpNotification, type INotificationService } from "src/cs/workbench/services/notification/common/notificationService";
import type { ICommandEvent, ICommandService } from "src/cs/platform/commands/common/commands";
import type { ConductorSettings, ISettingsService, SettingsViewInput } from "src/cs/workbench/services/settings/common/settings";

suite("workbench/contrib/settings/browser/settingsController", () => {
  test("keeps explorer badge switch on the pending value while saving", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);

    const updateDeferred = new Deferred<ConductorSettings | null>();
    const service = createSettingsService({ filesExplorerShowBadges: true }, updateDeferred);
    const controller = new SettingsController(
      container,
      createSettingsViewInput(service.settings),
      service,
      createCommandService(),
      createNotificationService(),
    );

    try {
      openAppearanceSection(container);

      const switchButton = getButton(container, "settings-explorer-badges-toggle");
      assert.equal(switchButton.getAttribute("aria-checked"), "true");

      switchButton.click();

      assert.equal(switchButton.getAttribute("aria-checked"), "false");
      assert.ok(switchButton.classList.contains("ui-switch--animate"));
      assert.equal(switchButton.disabled, true);
      assert.equal(getComputedStyle(switchButton).opacity, "1");

      controller.update(createSettingsViewInput(service.settings));
      assert.equal(getButton(container, "settings-explorer-badges-toggle"), switchButton);
      assert.equal(switchButton.getAttribute("aria-checked"), "false");
      assert.equal(switchButton.disabled, true);
      assert.ok(switchButton.classList.contains("ui-switch--animate"));
      assert.equal(getComputedStyle(switchButton).opacity, "1");

      service.settings = { filesExplorerShowBadges: false };
      controller.update(createSettingsViewInput(service.settings));
      updateDeferred.resolve(service.settings);
      await settled();

      assert.equal(getButton(container, "settings-explorer-badges-toggle"), switchButton);
      assert.equal(switchButton.getAttribute("aria-checked"), "false");
      assert.equal(switchButton.disabled, false);
      assert.equal(getComputedStyle(switchButton).opacity, "1");
    }
    finally {
      controller.dispose();
      container.remove();
    }
  });

  test("keeps transparent chrome switch on the pending value while saving", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);

    const commandDeferred = new Deferred<unknown>();
    const service = createSettingsService({ transparentChrome: true });
    const controller = new SettingsController(
      container,
      createSettingsViewInput(service.settings),
      service,
      createCommandService(commandDeferred),
      createNotificationService(),
    );

    try {
      openAppearanceSection(container);

      const switchButton = getButton(container, "settings-transparent-chrome-toggle");
      assert.equal(switchButton.getAttribute("aria-checked"), "true");

      switchButton.click();

      assert.equal(switchButton.getAttribute("aria-checked"), "false");
      assert.ok(switchButton.classList.contains("ui-switch--animate"));
      assert.equal(switchButton.disabled, true);
      assert.equal(getComputedStyle(switchButton).opacity, "1");

      controller.update(createSettingsViewInput(service.settings));
      assert.equal(getButton(container, "settings-transparent-chrome-toggle"), switchButton);
      assert.equal(switchButton.getAttribute("aria-checked"), "false");
      assert.equal(switchButton.disabled, true);
      assert.ok(switchButton.classList.contains("ui-switch--animate"));
      assert.equal(getComputedStyle(switchButton).opacity, "1");

      service.settings = { transparentChrome: false };
      controller.update(createSettingsViewInput(service.settings));
      commandDeferred.resolve(undefined);
      await settled();

      assert.equal(getButton(container, "settings-transparent-chrome-toggle"), switchButton);
      assert.equal(switchButton.getAttribute("aria-checked"), "false");
      assert.equal(switchButton.disabled, false);
      assert.equal(getComputedStyle(switchButton).opacity, "1");
    }
    finally {
      controller.dispose();
      container.remove();
    }
  });
});

class Deferred<T> {
  public readonly promise: Promise<T>;
  private resolvePromise: ((value: T | PromiseLike<T>) => void) | null = null;

  constructor() {
    this.promise = new Promise<T>(resolve => {
      this.resolvePromise = resolve;
    });
  }

  resolve(value: T): void {
    assert.ok(this.resolvePromise);
    this.resolvePromise(value);
  }
}

function createSettingsService(
  initialSettings: ConductorSettings,
  updateDeferred = new Deferred<ConductorSettings | null>(),
): ISettingsService & { settings: ConductorSettings } {
  return {
    _serviceBrand: undefined,
    settings: initialSettings,
    onDidChangeConductorSettings: Event.None,
    onDidChangeOriginSettingsViewInput: Event.None,
    onDidChangeSettingsViewInput: Event.None,
    canCheckOriginHealth: () => false,
    canManageOrigin: () => false,
    canRunOriginCleanup: () => false,
    checkOriginHealth: async () => ({ ok: true, originExePath: "" }),
    chooseOriginExePath: async () => "",
    errorMessage: error => String(error),
    formatOriginError: error => String(error),
    getConductorSettings() {
      return this.settings;
    },
    getOriginExePath: async () => "",
    getOriginSettingsViewInput: () => ({}),
    getSettingsViewInput() {
      return createSettingsViewInput(this.settings);
    },
    mergeConductorSettings(nextSettings) {
      this.settings = nextSettings ?? {};
    },
    runOriginCleanup: async () => ({ removedTotal: 0 }),
    update: () => undefined,
    updateOriginPlotOptions: async () => null,
    updatePlotAxisSettings: async () => null,
    updateSettings: async () => updateDeferred.promise,
  };
}

function createCommandService(deferred = new Deferred<unknown>()): ICommandService {
  return {
    _serviceBrand: undefined,
    onDidExecuteCommand: Event.None as Event<ICommandEvent>,
    onWillExecuteCommand: Event.None as Event<ICommandEvent>,
    executeCommand: async () => deferred.promise,
  };
}

function createNotificationService(): INotificationService {
  return {
    notify: () => new NoOpNotification(),
  } as INotificationService;
}

function createSettingsViewInput(settings: ConductorSettings): SettingsViewInput {
  return {
    appUpdateSettings: {
      currentVersion: "0.0.0",
      isAvailable: false,
    },
    conductorSettings: settings,
    conductorSettingsLoaded: true,
    isWindowsDesktopShell: false,
    language: "system",
    theme: "system",
  };
}

function openAppearanceSection(container: HTMLElement): void {
  const button = Array.from(container.querySelectorAll<HTMLButtonElement>("button"))
    .find(button => button.textContent?.trim() === "Appearance");
  assert.ok(button);
  button.click();
}

function getButton(container: HTMLElement, id: string): HTMLButtonElement {
  const button = container.querySelector<HTMLButtonElement>(`#${id}`);
  assert.ok(button);
  return button;
}

async function settled(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}
