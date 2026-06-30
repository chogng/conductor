import assert from "assert";

import { Event } from "src/cs/base/common/event";
import { SettingsController } from "src/cs/workbench/contrib/settings/browser/settingsController";
import { SettingsView, type SettingsContentItemTarget } from "src/cs/workbench/contrib/settings/browser/settingsView";
import {
  NoOpNotification,
  NotificationsFilter,
  type INotificationService,
} from "src/cs/workbench/services/notification/common/notificationService";
import type { ICommandEvent, ICommandService } from "src/cs/platform/commands/common/commands";
import type {
  ConductorSettings,
  ISettingsService,
  NumericDisplayMode,
  SettingsViewInput,
} from "src/cs/workbench/services/settings/common/settings";
import { dataResourceBuiltinSemanticTerms } from "src/cs/workbench/services/dataResource/common/semanticLibrary";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";

suite("workbench/contrib/settings/browser/settingsController", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
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
      assert.equal(switchButton.disabled, false);
      assert.equal(getComputedStyle(switchButton).opacity, "1");

      controller.update(createSettingsViewInput(service.settings));
      assert.equal(getButton(container, "settings-explorer-badges-toggle"), switchButton);
      assert.equal(switchButton.getAttribute("aria-checked"), "false");
      assert.equal(switchButton.disabled, false);
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
      assert.equal(switchButton.disabled, false);
      assert.equal(getComputedStyle(switchButton).opacity, "1");

      controller.update(createSettingsViewInput(service.settings));
      assert.equal(getButton(container, "settings-transparent-chrome-toggle"), switchButton);
      assert.equal(switchButton.getAttribute("aria-checked"), "false");
      assert.equal(switchButton.disabled, false);
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

  test("keeps numeric display switch on the pending value while saving", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);

    const updateDeferred = new Deferred<ConductorSettings | null>();
    const service = createSettingsService({ numericDisplayMode: "raw" }, updateDeferred);
    const controller = new SettingsController(
      container,
      createSettingsViewInput(service.settings),
      service,
      createCommandService(),
      createNotificationService(),
    );

    try {
      const switchButton = getButton(container, "settings-numeric-display-toggle");
      const content = getElement(container, ".settings-view-content");
      const tree = getElement(container, ".settings-view-content > .settings-tree");
      assert.equal(switchButton.getAttribute("aria-checked"), "false");

      switchButton.click();

      assert.equal(getElement(container, ".settings-view-content"), content);
      assert.equal(getElement(container, ".settings-view-content > .settings-tree"), tree);
      assert.equal(getButton(container, "settings-numeric-display-toggle"), switchButton);
      assert.equal(switchButton.getAttribute("aria-checked"), "true");
      assert.equal(switchButton.disabled, false);

      controller.update(createSettingsViewInput(service.settings));
      assert.equal(getElement(container, ".settings-view-content"), content);
      assert.equal(getElement(container, ".settings-view-content > .settings-tree"), tree);
      assert.equal(getButton(container, "settings-numeric-display-toggle"), switchButton);
      assert.equal(switchButton.getAttribute("aria-checked"), "true");
      assert.equal(switchButton.disabled, false);

      service.settings = { numericDisplayMode: "smart" };
      controller.update(createSettingsViewInput(service.settings));
      assert.equal(getElement(container, ".settings-view-content"), content);
      assert.equal(getElement(container, ".settings-view-content > .settings-tree"), tree);
      updateDeferred.resolve(service.settings);
      await settled();

      assert.equal(getElement(container, ".settings-view-content"), content);
      assert.equal(getElement(container, ".settings-view-content > .settings-tree"), tree);
      assert.equal(getButton(container, "settings-numeric-display-toggle"), switchButton);
      assert.equal(switchButton.getAttribute("aria-checked"), "true");
      assert.equal(switchButton.disabled, false);
    }
    finally {
      controller.dispose();
      container.remove();
    }
  });

  test("re-enables a disabled built-in semantic term from the token input", async () => {
    const builtinTerm = dataResourceBuiltinSemanticTerms[0];
    assert.ok(builtinTerm);
    const container = document.createElement("div");
    document.body.appendChild(container);

    const service = createSettingsService({
      templateDisabledBuiltinSemanticIds: [builtinTerm.id],
    });
    const updateSettings = { value: null as Partial<ConductorSettings> | null };
    service.updateSettings = async updates => {
      const nextSettings = updates as Partial<ConductorSettings>;
      updateSettings.value = nextSettings;
      service.settings = {
        ...service.settings,
        ...nextSettings,
      };
      return service.settings;
    };
    const controller = new SettingsController(
      container,
      createSettingsViewInput(service.settings),
      service,
      createCommandService(),
      createNotificationService(),
    );

    try {
      openTemplateSection(container);
      submitSemanticTerm(container, builtinTerm.alias);
      await settled();

      const savedSettings = updateSettings.value;
      assert.ok(savedSettings);
      assert.deepEqual(savedSettings.templateDisabledBuiltinSemanticIds, []);
      const termOrder = savedSettings.templateSemanticTermOrder;
      assert.ok(Array.isArray(termOrder));
      assert.equal(termOrder.at(-1), builtinTerm.id);
      assert.equal(
        new Set(termOrder).size,
        termOrder.length,
      );
      assert.deepEqual(service.settings.templateDisabledBuiltinSemanticIds, []);
      assert.equal(getSemanticTermInput(container).value, "");
    }
    finally {
      controller.dispose();
      container.remove();
    }
  });

  test("rejects duplicate active semantic terms without updating settings", async () => {
    const builtinTerm = dataResourceBuiltinSemanticTerms[0];
    assert.ok(builtinTerm);
    const container = document.createElement("div");
    document.body.appendChild(container);

    const service = createSettingsService({});
    let updateCount = 0;
    service.updateSettings = async updates => {
      const nextSettings = updates as Partial<ConductorSettings>;
      updateCount++;
      service.settings = {
        ...service.settings,
        ...nextSettings,
      };
      return service.settings;
    };
    const controller = new SettingsController(
      container,
      createSettingsViewInput(service.settings),
      service,
      createCommandService(),
      createNotificationService(),
    );

    try {
      openTemplateSection(container);
      submitSemanticTerm(container, builtinTerm.alias);
      await settled();

      assert.equal(updateCount, 0);
      assert.ok(container.textContent?.includes("Match term already exists."));
    }
    finally {
      controller.dispose();
      container.remove();
    }
  });

  test("patches only active terms and custom form when adding a custom semantic term", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);

    const patchedTargets: SettingsContentItemTarget[] = [];
    const prototype = SettingsView.prototype as unknown as {
      updateContentItems: (target: SettingsContentItemTarget) => void;
    };
    const originalUpdateContentItems = prototype.updateContentItems;
    prototype.updateContentItems = function (target: SettingsContentItemTarget): void {
      patchedTargets.push(target);
      return originalUpdateContentItems.call(this, target);
    };

    let controller: SettingsController | undefined;
    const service = createSettingsService({});
    service.updateSettings = async updates => {
      const nextSettings = updates as Partial<ConductorSettings>;
      service.settings = {
        ...service.settings,
        ...nextSettings,
      };
      controller?.update(createSettingsViewInput(service.settings));
      return service.settings;
    };
    controller = new SettingsController(
      container,
      createSettingsViewInput(service.settings),
      service,
      createCommandService(),
      createNotificationService(),
    );

    try {
      openTemplateSection(container);
      patchedTargets.length = 0;

      submitSemanticTerm(container, "Codex Custom Term");
      await settled();

      assert.deepEqual(
        patchedTargets
          .filter(target => target.descriptorId === "template-semantic-library")
          .map(target => target.itemIds),
        [
          [
            "settings-template-semantic-active-terms-card",
            "settings-template-semantic-custom-form-card",
          ],
          [
            "settings-template-semantic-active-terms-card",
          ],
          [
            "settings-template-semantic-active-terms-card",
            "settings-template-semantic-custom-form-card",
          ],
        ],
      );
    }
    finally {
      prototype.updateContentItems = originalUpdateContentItems;
      controller?.dispose();
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
    onDidChangeConductorSettings: Event.None as Event<ConductorSettings | null>,
    onDidChangeNumericDisplayMode: Event.None as Event<NumericDisplayMode>,
    onDidChangeOriginSettingsViewInput: Event.None as Event<void>,
    onDidChangeSettingsViewInput: Event.None as Event<void>,
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
    executeCommand: <R = unknown>() => deferred.promise as Promise<R | undefined>,
  };
}

function createNotificationService(): INotificationService {
  return {
    _serviceBrand: undefined,
    onDidChangeFilter: Event.None as Event<void>,
    error: () => undefined,
    getFilter: () => NotificationsFilter.ERROR,
    getFilters: () => [],
    info: () => undefined,
    notify: () => new NoOpNotification(),
    prompt: () => new NoOpNotification(),
    removeFilter: () => undefined,
    setFilter: () => undefined,
    status: () => ({ close: () => undefined }),
    warn: () => undefined,
  };
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

function openTemplateSection(container: HTMLElement): void {
  const button = Array.from(container.querySelectorAll<HTMLButtonElement>("button"))
    .find(button => button.textContent?.trim() === "Template");
  assert.ok(button);
  button.click();
}

function submitSemanticTerm(container: HTMLElement, value: string): void {
  const input = getSemanticTermInput(container);
  input.value = value;
  input.dispatchEvent(new globalThis.Event("input", { bubbles: true }));
  input.dispatchEvent(new globalThis.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
}

function getSemanticTermInput(container: HTMLElement): HTMLInputElement {
  const input = container.querySelector<HTMLInputElement>("#settings-template-semantic-active-terms-card .inputbox_widget input.inputbox_native:not([hidden])");
  assert.ok(input);
  return input;
}

function getButton(container: HTMLElement, id: string): HTMLButtonElement {
  const button = container.querySelector<HTMLButtonElement>(`#${id}`);
  assert.ok(button);
  return button;
}

function getElement(container: ParentNode, selector: string): HTMLElement {
  const element = container.querySelector<HTMLElement>(selector);
  assert.ok(element);
  return element;
}

async function settled(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}
