import assert from "assert";

import { Event } from "src/cs/base/common/event";
import { SettingsController } from "src/cs/workbench/contrib/settings/browser/settingsController";
import { SettingsView, type SettingsContentItemId, type SettingsContentItemTarget } from "src/cs/workbench/contrib/settings/browser/settingsView";
import {
  NoOpNotification,
  NotificationsFilter,
  type INotification,
  type INotificationService,
} from "src/cs/workbench/services/notification/common/notificationService";
import type { ICommandEvent, ICommandService } from "src/cs/platform/commands/common/commands";
import type {
  ConductorSettings,
  ISettingsService,
  NumericDisplayMode,
  SettingsViewInput,
} from "src/cs/workbench/services/settings/common/settings";
import { builtinSemanticDomainRules } from "src/cs/workbench/services/dataResource/common/semanticLibrary";
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
    controller.attachNavigation(container);

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
    controller.attachNavigation(container);

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
    controller.attachNavigation(container);

    try {
      const switchButton = getButton(container, "settings-numeric-display-toggle");
      const content = getElement(container, ".settings-view-content");
      const tree = getElement(container, ".settings-view-content > .settings-section-list");
      assert.equal(switchButton.getAttribute("aria-checked"), "false");

      switchButton.click();

      assert.equal(getElement(container, ".settings-view-content"), content);
      assert.equal(getElement(container, ".settings-view-content > .settings-section-list"), tree);
      assert.equal(getButton(container, "settings-numeric-display-toggle"), switchButton);
      assert.equal(switchButton.getAttribute("aria-checked"), "true");
      assert.equal(switchButton.disabled, false);

      controller.update(createSettingsViewInput(service.settings));
      assert.equal(getElement(container, ".settings-view-content"), content);
      assert.equal(getElement(container, ".settings-view-content > .settings-section-list"), tree);
      assert.equal(getButton(container, "settings-numeric-display-toggle"), switchButton);
      assert.equal(switchButton.getAttribute("aria-checked"), "true");
      assert.equal(switchButton.disabled, false);

      service.settings = { numericDisplayMode: "smart" };
      controller.update(createSettingsViewInput(service.settings));
      assert.equal(getElement(container, ".settings-view-content"), content);
      assert.equal(getElement(container, ".settings-view-content > .settings-section-list"), tree);
      updateDeferred.resolve(service.settings);
      await settled();

      assert.equal(getElement(container, ".settings-view-content"), content);
      assert.equal(getElement(container, ".settings-view-content > .settings-section-list"), tree);
      assert.equal(getButton(container, "settings-numeric-display-toggle"), switchButton);
      assert.equal(switchButton.getAttribute("aria-checked"), "true");
      assert.equal(switchButton.disabled, false);
    }
    finally {
      controller.dispose();
      container.remove();
    }
  });

  test("creates semantic section item rules with X and Y axis evidence", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);

    const service = createSettingsService({});
    const notifications: INotification[] = [];
    const savedSettings: Partial<ConductorSettings>[] = [];
    let controller: SettingsController | undefined;
    service.updateSettings = async updates => {
      const nextSettings = updates as Partial<ConductorSettings>;
      savedSettings.push(nextSettings);
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
      createNotificationService(notifications),
    );
    controller.attachNavigation(container);

    try {
      openTemplateSection(container);
      clickNewSemanticRule(container);
      const draftItem = getSemanticRuleItems(container)[0];
      assert.ok(draftItem);

      setSemanticRuleInput(draftItem, "Domain scope, for example iv", "iv");
      acceptSemanticRuleInput(container, "X representative", "Codex Gate Bias");
      acceptSemanticRuleInput(container, "Y representative", "Codex Drain Current");
      await settled();

      const update = savedSettings.at(-1);
      assert.ok(update);
      const domainRules = update.templateSemanticDomainRules;
      assert.ok(Array.isArray(domainRules));
      assert.equal(domainRules.length, 1);
      assert.equal(domainRules[0]?.title, "iv");
      assert.deepEqual(domainRules[0]?.xTerms, ["Codex Gate Bias"]);
      assert.deepEqual(domainRules[0]?.yTerms, ["Codex Drain Current"]);
      assert.deepEqual(update.templateSemanticDomainPriority?.slice(0, 1), [domainRules[0]?.id]);
      const savedItem = getSemanticRuleItems(container)
        .find(item => hasSemanticRuleValue(item, "Codex Gate Bias"));
      assert.ok(savedItem);
      assert.equal(hasSemanticRuleValue(savedItem, "iv"), true);
      assert.equal(hasSemanticRuleValue(savedItem, "Codex Drain Current"), true);
    }
    finally {
      controller?.dispose();
      container.remove();
    }
  });

  test("saves semantic section item widget values on blur", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);

    const service = createSettingsService({});
    const savedSettings: Partial<ConductorSettings>[] = [];
    let controller: SettingsController | undefined;
    service.updateSettings = async updates => {
      const nextSettings = updates as Partial<ConductorSettings>;
      savedSettings.push(nextSettings);
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
    controller.attachNavigation(container);

    try {
      openTemplateSection(container);
      clickNewSemanticRule(container);
      const draftItem = getSemanticRuleItems(container)[0];
      assert.ok(draftItem);

      blurSemanticRuleInput(draftItem, "Domain scope, for example iv", "blur");
      blurSemanticRuleInput(container, "X representative", "Blur Gate");
      assert.equal(savedSettings.length, 0);
      blurSemanticRuleInput(container, "Y representative", "Blur Current");
      await settled();

      const update = savedSettings.at(-1);
      assert.ok(update);
      const domainRules = update.templateSemanticDomainRules;
      assert.ok(Array.isArray(domainRules));
      assert.equal(domainRules[0]?.title, "blur");
      assert.deepEqual(domainRules[0]?.xTerms, ["Blur Gate"]);
      assert.deepEqual(domainRules[0]?.yTerms, ["Blur Current"]);
    }
    finally {
      controller?.dispose();
      container.remove();
    }
  });

  test("edits saved custom semantic section item terms", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);

    const service = createSettingsService({
      templateSemanticDomainPriority: ["custom-term"],
      templateSemanticDomainRules: [{
        id: "custom-term",
        title: "Custom Term",
        xTerms: ["Custom Gate"],
        yTerms: ["Custom Current"],
        enabled: true,
      }],
    });
    const savedSettings: Partial<ConductorSettings>[] = [];
    let controller: SettingsController | undefined;
    service.updateSettings = async updates => {
      const nextSettings = updates as Partial<ConductorSettings>;
      savedSettings.push(nextSettings);
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
    controller.attachNavigation(container);

    try {
      openTemplateSection(container);
      const customItem = getSemanticRuleItems(container)
        .find(item => hasSemanticRuleValue(item, "Custom Term"));
      assert.ok(customItem);
      assert.equal(getSemanticRuleInput(customItem, "X representative").hidden, false);
      assert.equal(getSemanticRuleInput(customItem, "Domain scope, for example iv").readOnly, false);
      assert.equal(getSemanticRuleActionNames(customItem).includes("Done"), false);
      assert.equal(getSemanticRuleActionNames(customItem).includes("Cancel"), false);

      acceptSemanticRuleInput(customItem, "X representative", "Added Gate");
      const editedItem = getSemanticRuleItems(container)
        .find(item => hasSemanticRuleValue(item, "Added Gate"));
      assert.ok(editedItem);
      await settled();

      const update = savedSettings.at(-1);
      assert.ok(update);
      assert.deepEqual(update.templateSemanticDomainPriority?.slice(0, 1), ["custom-term"]);
      assert.deepEqual(update.templateSemanticDomainRules, [{
        id: "custom-term",
        title: "Custom Term",
        xTerms: ["Custom Gate", "Added Gate"],
        yTerms: ["Custom Current"],
        enabled: true,
      }]);
    }
    finally {
      controller?.dispose();
      container.remove();
    }
  });

  test("edits built-in semantic section item terms as user overrides", async () => {
    const builtinRule = builtinSemanticDomainRules.find(rule => rule.title === "iv");
    assert.ok(builtinRule);
    const container = document.createElement("div");
    document.body.appendChild(container);

    const service = createSettingsService({});
    const savedSettings: Partial<ConductorSettings>[] = [];
    let controller: SettingsController | undefined;
    service.updateSettings = async updates => {
      const nextSettings = updates as Partial<ConductorSettings>;
      savedSettings.push(nextSettings);
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
    controller.attachNavigation(container);

    try {
      openTemplateSection(container);
      const builtinItem = getSemanticRuleItems(container)
        .find(item => hasSemanticRuleValue(item, builtinRule.title));
      assert.ok(builtinItem);
      assert.equal(getSemanticRuleInput(builtinItem, "X representative").hidden, false);
      assert.equal(getSemanticRuleInput(builtinItem, "Domain scope, for example iv").readOnly, false);
      assert.equal(getSemanticRuleActionNames(builtinItem).includes("Done"), false);
      assert.equal(getSemanticRuleActionNames(builtinItem).includes("Cancel"), false);

      acceptSemanticRuleInput(builtinItem, "X representative", "Codex Override Gate");
      const editedItem = getSemanticRuleItems(container)
        .find(item => hasSemanticRuleValue(item, "Codex Override Gate"));
      assert.ok(editedItem);
      await settled();

      const update = savedSettings.at(-1);
      assert.ok(update);
      const rule = update.templateSemanticDomainRules?.find(rule => rule.id === builtinRule.id);
      assert.ok(rule);
      assert.equal(rule.title, builtinRule.title);
      assert.ok(rule.xTerms.includes("Codex Override Gate"));
      assert.deepEqual(rule.yTerms, builtinRule.yTerms);
      assert.equal(update.templateSemanticDomainPriority?.includes(builtinRule.id), true);
    }
    finally {
      controller?.dispose();
      container.remove();
    }
  });

  test("keeps built-in semantic item unchanged on title blur", async () => {
    const builtinRule = builtinSemanticDomainRules.find(rule => rule.title === "transient");
    assert.ok(builtinRule);
    const container = document.createElement("div");
    document.body.appendChild(container);

    const service = createSettingsService({});
    const savedSettings: Partial<ConductorSettings>[] = [];
    let controller: SettingsController | undefined;
    service.updateSettings = async updates => {
      const nextSettings = updates as Partial<ConductorSettings>;
      savedSettings.push(nextSettings);
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
    controller.attachNavigation(container);

    try {
      openTemplateSection(container);
      const builtinItem = getSemanticRuleItems(container)
        .find(item => hasSemanticRuleValue(item, builtinRule.title));
      assert.ok(builtinItem);
      assert.equal(getSemanticRuleActionNames(builtinItem).includes(`Remove domain rule ${builtinRule.title}`), true);

      blurSemanticRuleInput(builtinItem, "Domain scope, for example iv", builtinRule.title);
      await settled();

      const nextBuiltinItem = getSemanticRuleItems(container)
        .find(item => hasSemanticRuleValue(item, builtinRule.title));
      assert.ok(nextBuiltinItem);
      assert.deepEqual(savedSettings, []);
      assert.equal(service.settings.templateSemanticDomainRules, undefined);
      assert.equal(getSemanticRuleActionNames(nextBuiltinItem).includes(`Remove domain rule ${builtinRule.title}`), true);
    }
    finally {
      controller?.dispose();
      container.remove();
    }
  });

  test("removes built-in semantic section item until reset restores it", async () => {
    const builtinRule = builtinSemanticDomainRules.find(rule => rule.title === "transient");
    assert.ok(builtinRule);
    const container = document.createElement("div");
    document.body.appendChild(container);

    const service = createSettingsService({});
    const savedSettings: Partial<ConductorSettings>[] = [];
    let controller: SettingsController | undefined;
    service.updateSettings = async updates => {
      const nextSettings = updates as Partial<ConductorSettings>;
      savedSettings.push(nextSettings);
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
    controller.attachNavigation(container);

    try {
      openTemplateSection(container);
      const builtinItem = getSemanticRuleItems(container)
        .find(item => hasSemanticRuleValue(item, builtinRule.title));
      assert.ok(builtinItem);

      getSemanticRuleAction(builtinItem, `Remove domain rule ${builtinRule.title}`).click();
      await settled();

      const removeUpdate = savedSettings.at(-1);
      assert.ok(removeUpdate);
      assert.deepEqual(removeUpdate.templateSemanticDomainRules?.find(rule => rule.id === builtinRule.id), {
        id: builtinRule.id,
        title: builtinRule.title,
        xTerms: builtinRule.xTerms,
        yTerms: builtinRule.yTerms,
        enabled: false,
      });
      assert.equal(removeUpdate.templateSemanticDomainPriority?.includes(builtinRule.id), false);
      assert.equal(getSemanticRuleItems(container).some(item => hasSemanticRuleValue(item, builtinRule.title)), false);

      getButton(container, "settings-template-semantic-reset-rules").click();
      await settled();

      const resetUpdate = savedSettings.at(-1);
      assert.ok(resetUpdate);
      assert.equal(resetUpdate.templateSemanticDomainRules?.some(rule => rule.id === builtinRule.id) ?? false, false);
      assert.equal(getSemanticRuleItems(container).some(item => hasSemanticRuleValue(item, builtinRule.title)), true);
    }
    finally {
      controller?.dispose();
      container.remove();
    }
  });

  test("resets built-in semantic section item overrides without removing custom rules", async () => {
    const builtinRule = builtinSemanticDomainRules.find(rule => rule.title === "iv");
    assert.ok(builtinRule);
    const container = document.createElement("div");
    document.body.appendChild(container);

    const service = createSettingsService({
      templateSemanticDomainPriority: ["custom-term"],
      templateSemanticDomainRules: [{
        id: builtinRule.id,
        title: builtinRule.title,
        xTerms: ["Codex Override Gate"],
        yTerms: builtinRule.yTerms,
        enabled: true,
      }, {
        id: "custom-term",
        title: "Custom Term",
        xTerms: ["Custom Gate"],
        yTerms: ["Custom Current"],
        enabled: true,
      }],
    });
    const savedSettings: Partial<ConductorSettings>[] = [];
    let controller: SettingsController | undefined;
    service.updateSettings = async updates => {
      const nextSettings = updates as Partial<ConductorSettings>;
      savedSettings.push(nextSettings);
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
    controller.attachNavigation(container);

    try {
      openTemplateSection(container);
      getButton(container, "settings-template-semantic-reset-rules").click();
      await settled();

      const update = savedSettings.at(-1);
      assert.ok(update);
      assert.deepEqual(update.templateSemanticDomainRules, [{
        id: "custom-term",
        title: "Custom Term",
        xTerms: ["Custom Gate"],
        yTerms: ["Custom Current"],
        enabled: true,
      }]);
      assert.deepEqual(
        update.templateSemanticDomainPriority?.slice(0, builtinSemanticDomainRules.length),
        builtinSemanticDomainRules.map(rule => rule.id),
      );
      assert.equal(update.templateSemanticDomainPriority?.includes("custom-term"), true);
    }
    finally {
      controller?.dispose();
      container.remove();
    }
  });

  test("rejects duplicate semantic section item terms inside the same input", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);

    const service = createSettingsService({});
    const notifications: INotification[] = [];
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
      createNotificationService(notifications),
    );
    controller.attachNavigation(container);

    try {
      openTemplateSection(container);
      clickNewSemanticRule(container);
      const draftItem = getSemanticRuleItems(container)[0];
      assert.ok(draftItem);
      setSemanticRuleInput(draftItem, "Domain scope, for example iv", "iv");
      acceptSemanticRuleInput(container, "X representative", "Codex Gate Bias");
      acceptSemanticRuleInput(container, "X representative", "Codex-Gate-Bias");
      await settled();

      assert.equal(updateCount, 0);
      assert.equal(notifications.at(-1)?.message, "Character block already exists in this input.");
      assert.equal(notifications.at(-1)?.presentation?.type, "error");
    }
    finally {
      controller.dispose();
      container.remove();
    }
  });

  test("rejects single-character semantic section item terms", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);

    const service = createSettingsService({});
    const notifications: INotification[] = [];
    let controller: SettingsController | undefined;
    let updateCount = 0;
    service.updateSettings = async updates => {
      const nextSettings = updates as Partial<ConductorSettings>;
      updateCount++;
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
      createNotificationService(notifications),
    );
    controller.attachNavigation(container);

    try {
      openTemplateSection(container);
      clickNewSemanticRule(container);
      const draftItem = getSemanticRuleItems(container)[0];
      assert.ok(draftItem);
      acceptSemanticRuleInput(draftItem, "Domain scope, for example iv", "V");
      await settled();

      assert.equal(updateCount, 0);
      assert.equal(service.settings.templateSemanticDomainRules, undefined);
      assert.equal(notifications.at(-1)?.message, "Enter at least two letters or digits for the domain scope.");
      assert.equal(notifications.at(-1)?.presentation?.type, "error");
      assert.equal(getSemanticRuleInput(draftItem, "Domain scope, for example iv").value, "V");
      assert.equal(hasReadOnlySemanticRuleValue(container, "V"), false);
    }
    finally {
      controller?.dispose();
      container.remove();
    }
  });

  test("hides configured single-character semantic domain rules from section items", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);

    const service = createSettingsService({
      templateSemanticDomainRules: [{
        id: "single-i",
        title: "I",
        xTerms: ["Vg"],
        yTerms: ["Id"],
        enabled: true,
      }, {
        id: "drive-bias",
        title: "DriveBias",
        xTerms: ["DriveBias"],
        yTerms: ["SenseCurrent"],
        enabled: true,
      }],
    });
    const controller = new SettingsController(
      container,
      createSettingsViewInput(service.settings),
      service,
      createCommandService(),
      createNotificationService(),
    );
    controller.attachNavigation(container);

    try {
      openTemplateSection(container);

      assert.equal(hasSemanticRuleValue(container, "I"), false);
      assert.equal(hasSemanticRuleValue(container, "DriveBias"), true);
    }
    finally {
      controller.dispose();
      container.remove();
    }
  });

  test("patches semantic library descriptor when adding a custom section item", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);

    const patchedTargets: SettingsContentItemTarget[] = [];
    const patchedDescriptors: string[] = [];
    const prototype = SettingsView.prototype as unknown as {
      updateContentDescriptor: (descriptorId: string) => void;
      updateContentItems: (target: SettingsContentItemTarget) => void;
    };
    const originalUpdateContentDescriptor = prototype.updateContentDescriptor;
    const originalUpdateContentItems = prototype.updateContentItems;
    prototype.updateContentDescriptor = function (descriptorId: string): void {
      patchedDescriptors.push(descriptorId);
      return originalUpdateContentDescriptor.call(this, descriptorId);
    };
    prototype.updateContentItems = function (target: SettingsContentItemTarget): void {
      patchedTargets.push(target);
      return originalUpdateContentItems.call(this, target);
    };

    let controller: SettingsController | undefined;
    const service = createSettingsService({});
    const notifications: INotification[] = [];
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
      createNotificationService(notifications),
    );
    controller.attachNavigation(container);

    try {
      openTemplateSection(container);
      patchedTargets.length = 0;
      patchedDescriptors.length = 0;

      clickNewSemanticRule(container);
      const draftItem = getSemanticRuleItems(container)[0];
      assert.ok(draftItem);
      setSemanticRuleInput(draftItem, "Domain scope, for example iv", "custom");
      acceptSemanticRuleInput(container, "X representative", "Codex Custom X");
      patchedTargets.length = 0;
      patchedDescriptors.length = 0;
      acceptSemanticRuleInput(container, "Y representative", "Codex Custom Y");
      await settled();

      assert.deepEqual(patchedTargets, [
        {
          descriptorId: "template-semantic-library",
          itemIds: [draftItem.id as SettingsContentItemId],
        },
      ]);
      assert.equal(patchedDescriptors.includes("template-domain-priority"), true);
      assert.deepEqual(
        patchedDescriptors.filter(descriptorId => descriptorId === "template-semantic-library"),
        [
          "template-semantic-library",
          "template-semantic-library",
          "template-semantic-library",
          "template-semantic-library",
        ],
      );
    }
    finally {
      prototype.updateContentDescriptor = originalUpdateContentDescriptor;
      prototype.updateContentItems = originalUpdateContentItems;
      controller?.dispose();
      container.remove();
    }
  });

  test("keeps semantic draft section item editable while save is pending", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);

    const updateDeferred = new Deferred<ConductorSettings | null>();
    const service = createSettingsService({}, updateDeferred);
    let updateCount = 0;
    service.updateSettings = async () => {
      updateCount++;
      return updateDeferred.promise;
    };
    const controller = new SettingsController(
      container,
      createSettingsViewInput(service.settings),
      service,
      createCommandService(),
      createNotificationService(),
    );
    controller.attachNavigation(container);

    try {
      openTemplateSection(container);
      clickNewSemanticRule(container);
      const draftItem = getSemanticRuleItems(container)[0];
      assert.ok(draftItem);
      const input = getSemanticRuleInput(draftItem, "Domain scope, for example iv");
      input.focus();

      setSemanticRuleInput(draftItem, "Domain scope, for example iv", "Codex Custom Term");
      acceptSemanticRuleInput(container, "X representative", "Codex Gate Bias");
      acceptSemanticRuleInput(container, "Y representative", "Codex Drain Current");
      await settled();

      const pendingItem = getSemanticRuleItems(container)[0];
      assert.ok(pendingItem);
      const pendingInput = getSemanticRuleInput(pendingItem, "Domain scope, for example iv");
      assert.equal(pendingInput.value, "Codex Custom Term");
      assert.equal(pendingInput.disabled, true);

      clickNewSemanticRule(container);
      const nextDraftItem = getSemanticRuleItems(container)[0];
      assert.ok(nextDraftItem);
      const nextInput = getSemanticRuleInput(nextDraftItem, "Domain scope, for example iv");
      setSemanticRuleInput(nextDraftItem, "Domain scope, for example iv", "Next Term");
      assert.equal(updateCount, 1);
      assert.equal(nextInput.value, "Next Term");
      assert.equal(nextInput.disabled, false);
    }
    finally {
      updateDeferred.resolve(service.settings);
      await settled();
      controller.dispose();
      container.remove();
    }
  });

  test("keeps newer semantic term draft when add save fails", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);

    const updateDeferred = new Deferred<ConductorSettings | null>();
    const service = createSettingsService({}, updateDeferred);
    const controller = new SettingsController(
      container,
      createSettingsViewInput(service.settings),
      service,
      createCommandService(),
      createNotificationService(),
    );
    controller.attachNavigation(container);

    try {
      openTemplateSection(container);
      clickNewSemanticRule(container);
      const draftItem = getSemanticRuleItems(container)[0];
      assert.ok(draftItem);
      const input = getSemanticRuleInput(draftItem, "Domain scope, for example iv");
      input.focus();

      setSemanticRuleInput(draftItem, "Domain scope, for example iv", "Codex Custom Term");
      acceptSemanticRuleInput(container, "X representative", "Codex Gate Bias");
      acceptSemanticRuleInput(container, "Y representative", "Codex Drain Current");
      await settled();

      const pendingItem = getSemanticRuleItems(container)[0];
      assert.ok(pendingItem);
      const pendingInput = getSemanticRuleInput(pendingItem, "Domain scope, for example iv");
      pendingInput.value = "Next Term";
      pendingInput.dispatchEvent(new globalThis.Event("input", { bubbles: true }));

      updateDeferred.reject("save failed");
      await settled();

      const failedItem = getSemanticRuleItems(container)[0];
      assert.ok(failedItem);
      const failedInput = getSemanticRuleInput(failedItem, "Domain scope, for example iv");
      assert.equal(failedInput.value, "Next Term");
      assert.equal(failedInput.readOnly, false);
    }
    finally {
      controller.dispose();
      container.remove();
    }
  });

  test("patches semantic library descriptor when removing a custom section item", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);

    const patchedTargets: SettingsContentItemTarget[] = [];
    const patchedDescriptors: string[] = [];
    const prototype = SettingsView.prototype as unknown as {
      updateContentDescriptor: (descriptorId: string) => void;
      updateContentItems: (target: SettingsContentItemTarget) => void;
    };
    const originalUpdateContentDescriptor = prototype.updateContentDescriptor;
    const originalUpdateContentItems = prototype.updateContentItems;
    prototype.updateContentDescriptor = function (descriptorId: string): void {
      patchedDescriptors.push(descriptorId);
      return originalUpdateContentDescriptor.call(this, descriptorId);
    };
    prototype.updateContentItems = function (target: SettingsContentItemTarget): void {
      patchedTargets.push(target);
      return originalUpdateContentItems.call(this, target);
    };

    let controller: SettingsController | undefined;
    const service = createSettingsService({
      templateSemanticDomainRules: [{
        id: "custom-term",
        title: "Custom Term",
        xTerms: ["Custom Gate"],
        yTerms: ["Custom Current"],
        enabled: true,
      }],
    });
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
    controller.attachNavigation(container);

    try {
      openTemplateSection(container);
      patchedTargets.length = 0;
      patchedDescriptors.length = 0;

      const customItem = getSemanticRuleItems(container)
        .find(item => hasSemanticRuleValue(item, "Custom Term"));
      assert.ok(customItem);
      patchedTargets.length = 0;
      patchedDescriptors.length = 0;
      getSemanticRuleAction(customItem, "Remove domain rule Custom Term").click();
      await settled();

      assert.deepEqual(patchedTargets, []);
      assert.equal(patchedDescriptors.includes("template-domain-priority"), true);
      assert.deepEqual(
        patchedDescriptors.filter(descriptorId => descriptorId === "template-semantic-library"),
        [
          "template-semantic-library",
          "template-semantic-library",
          "template-semantic-library",
        ],
      );
    }
    finally {
      prototype.updateContentDescriptor = originalUpdateContentDescriptor;
      prototype.updateContentItems = originalUpdateContentItems;
      controller?.dispose();
      container.remove();
    }
  });
});

class Deferred<T> {
  public readonly promise: Promise<T>;
  private rejectPromise: ((reason?: unknown) => void) | null = null;
  private resolvePromise: ((value: T | PromiseLike<T>) => void) | null = null;

  constructor() {
    this.promise = new Promise<T>((resolve, reject) => {
      this.resolvePromise = resolve;
      this.rejectPromise = reject;
    });
  }

  resolve(value: T): void {
    assert.ok(this.resolvePromise);
    this.resolvePromise(value);
  }

  reject(reason?: unknown): void {
    assert.ok(this.rejectPromise);
    this.rejectPromise(reason);
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

function createNotificationService(notifications: INotification[] = []): INotificationService {
  return {
    _serviceBrand: undefined,
    onDidChangeFilter: Event.None as Event<void>,
    error: () => undefined,
    getFilter: () => NotificationsFilter.ERROR,
    getFilters: () => [],
    info: () => undefined,
    notify: notification => {
      notifications.push(notification);
      return new NoOpNotification();
    },
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

function getButton(container: HTMLElement, id: string): HTMLButtonElement {
  const button = container.querySelector<HTMLButtonElement>(`#${id}`);
  assert.ok(button);
  return button;
}

function clickNewSemanticRule(container: HTMLElement): void {
  getButton(container, "settings-template-semantic-new-rule").click();
}

function getSemanticRuleItems(container: ParentNode): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(".settings-template-semantic-rule-item"));
}

function getSemanticRuleInput(container: ParentNode, placeholder: string): HTMLInputElement {
  const input = Array.from(container.querySelectorAll<HTMLInputElement>(".settings-template-semantic-rule-input input.inputbox_native"))
    .find(input => input.placeholder === placeholder);
  assert.ok(input);
  return input;
}

function setSemanticRuleInput(container: ParentNode, placeholder: string, value: string): void {
  const input = getSemanticRuleInput(container, placeholder);
  input.value = value;
  input.dispatchEvent(new globalThis.Event("input", { bubbles: true }));
}

function acceptSemanticRuleInput(container: ParentNode, placeholder: string, value: string): void {
  const input = getSemanticRuleInput(container, placeholder);
  input.value = value;
  input.dispatchEvent(new globalThis.Event("input", { bubbles: true }));
  input.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Enter" }));
}

function blurSemanticRuleInput(container: ParentNode, placeholder: string, value: string): void {
  const input = getSemanticRuleInput(container, placeholder);
  input.value = value;
  input.dispatchEvent(new globalThis.Event("input", { bubbles: true }));
  input.dispatchEvent(new FocusEvent("blur", { bubbles: true }));
}

function getSemanticRuleAction(container: ParentNode, accessibleName: string): HTMLButtonElement {
  const button = Array.from(container.querySelectorAll<HTMLButtonElement>(".settings-template-semantic-rule-action"))
    .find(button => button.getAttribute("aria-label") === accessibleName);
  assert.ok(button);
  return button;
}

function getSemanticRuleActionNames(container: ParentNode): string[] {
  return Array.from(container.querySelectorAll<HTMLButtonElement>(".settings-template-semantic-rule-action"))
    .map(button => button.getAttribute("aria-label") ?? "");
}

function hasSemanticRuleValue(container: ParentNode, value: string): boolean {
  return Array.from(container.querySelectorAll<HTMLInputElement>(".settings-template-semantic-rule-input input.inputbox_native"))
    .some(input => input.value === value) ||
    Array.from(container.querySelectorAll<HTMLElement>(".settings-template-semantic-rule-input .inputbox_widget_item_label"))
      .some(item => item.textContent === value);
}

function hasReadOnlySemanticRuleValue(container: ParentNode, value: string): boolean {
  return Array.from(container.querySelectorAll<HTMLInputElement>(".settings-template-semantic-rule-input input.inputbox_native"))
    .some(input => input.value === value && input.readOnly);
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
