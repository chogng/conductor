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
import { builtinRules } from "src/cs/workbench/services/dataResource/common/semanticRules";
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
      assert.equal(switchButton.disabled, true);

      controller.update(createSettingsViewInput(service.settings));
      assert.equal(getElement(container, ".settings-view-content"), content);
      assert.equal(getElement(container, ".settings-view-content > .settings-section-list"), tree);
      assert.equal(getButton(container, "settings-numeric-display-toggle"), switchButton);
      assert.equal(switchButton.getAttribute("aria-checked"), "true");
      assert.equal(switchButton.disabled, true);

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

  test("keeps numeric and template switch transitions after settings patch", () => {
    const numericContainer = document.createElement("div");
    const templateContainer = document.createElement("div");
    document.body.append(numericContainer, templateContainer);

    const numericController = new SettingsController(
      numericContainer,
      createSettingsViewInput({ numericDisplayMode: "raw" }),
      createSettingsService({ numericDisplayMode: "raw" }),
      createCommandService(),
      createNotificationService(),
    );
    const templateController = new SettingsController(
      templateContainer,
      createSettingsViewInput({ tableTemplateVisualizationEnabled: false }),
      createSettingsService({ tableTemplateVisualizationEnabled: false }),
      createCommandService(),
      createNotificationService(),
    );

    try {
      numericController.attachNavigation(numericContainer);
      templateController.attachNavigation(templateContainer);
      openTemplateSection(templateContainer);

      const numericSwitch = getButton(numericContainer, "settings-numeric-display-toggle");
      const templateSwitch = getButton(templateContainer, "settings-table-template-visualization-toggle");

      numericSwitch.click();
      templateSwitch.click();

      assertSwitchInteractionAnimation(numericSwitch);
      assertSwitchInteractionAnimation(templateSwitch);
    }
    finally {
      numericController.dispose();
      templateController.dispose();
      numericContainer.remove();
      templateContainer.remove();
    }
  });

  test("keeps numeric switch transition when settings service publishes saved input", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);

    const service = createSettingsService({ numericDisplayMode: "raw" });
    let controller: SettingsController | undefined;
    service.updateSettings = async updates => {
      service.settings = {
        ...service.settings,
        ...(updates as Partial<ConductorSettings>),
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
      const switchButton = getButton(container, "settings-numeric-display-toggle");
      switchButton.click();

      assert.equal(getButton(container, "settings-numeric-display-toggle"), switchButton);
      assert.equal(switchButton.getAttribute("aria-checked"), "true");
      assertSwitchInteractionAnimation(switchButton);
    }
    finally {
      controller.dispose();
      container.remove();
    }
  });

  test("keeps table auto-fit columns switch on the pending value while saving", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);

    const updateDeferred = new Deferred<ConductorSettings | null>();
    const service = createSettingsService({ tableAutoFitColumnWidthsEnabled: false }, updateDeferred);
    const savedSettings: Partial<ConductorSettings>[] = [];
    service.updateSettings = async updates => {
      savedSettings.push(updates as Partial<ConductorSettings>);
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
      const switchButton = getButton(container, "settings-table-auto-fit-columns-toggle");
      assert.equal(switchButton.getAttribute("aria-checked"), "false");

      switchButton.click();

      assert.deepEqual(savedSettings, [{ tableAutoFitColumnWidthsEnabled: true }]);
      assert.equal(getButton(container, "settings-table-auto-fit-columns-toggle"), switchButton);
      assert.equal(switchButton.getAttribute("aria-checked"), "true");
      assert.equal(switchButton.disabled, true);

      controller.update(createSettingsViewInput(service.settings));
      assert.equal(getButton(container, "settings-table-auto-fit-columns-toggle"), switchButton);
      assert.equal(switchButton.getAttribute("aria-checked"), "true");
      assert.equal(switchButton.disabled, true);

      service.settings = { tableAutoFitColumnWidthsEnabled: true };
      controller.update(createSettingsViewInput(service.settings));
      updateDeferred.resolve(service.settings);
      await settled();

      assert.equal(getButton(container, "settings-table-auto-fit-columns-toggle"), switchButton);
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

      setSemanticRuleInput(draftItem, "Rule label, for example iv transfer", "iv");
      acceptSemanticRuleInput(container, "X representative", "Codex Gate Bias");
      acceptSemanticRuleInput(container, "Y representative", "Codex Drain Current");
      await settled();

      const update = savedSettings.at(-1);
      assert.ok(update);
      const rules = update.templateRules;
      assert.ok(Array.isArray(rules));
      assert.equal(rules.length, 1);
      assert.equal(rules[0]?.label, "iv");
      assert.deepEqual(rules[0]?.xTerms, ["Codex Gate Bias"]);
      assert.deepEqual(rules[0]?.yTerms, ["Codex Drain Current"]);
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

      blurSemanticRuleInput(draftItem, "Rule label, for example iv transfer", "blur");
      blurSemanticRuleInput(container, "X representative", "Blur Gate");
      assert.equal(savedSettings.length, 0);
      blurSemanticRuleInput(container, "Y representative", "Blur Current");
      await settled();

      const update = savedSettings.at(-1);
      assert.ok(update);
      const rules = update.templateRules;
      assert.ok(Array.isArray(rules));
      assert.equal(rules[0]?.label, "blur");
      assert.deepEqual(rules[0]?.xTerms, ["Blur Gate"]);
      assert.deepEqual(rules[0]?.yTerms, ["Blur Current"]);
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
      templateRules: [{
        id: "custom-term",
        label: "Custom Term",
        priority: 0,
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
      assert.equal(getSemanticRuleInput(customItem, "Rule label, for example iv transfer").readOnly, false);
      assert.equal(getSemanticRuleActionNames(customItem).includes("Done"), false);
      assert.equal(getSemanticRuleActionNames(customItem).includes("Cancel"), false);

      acceptSemanticRuleInput(customItem, "X representative", "Added Gate");
      const editedItem = getSemanticRuleItems(container)
        .find(item => hasSemanticRuleValue(item, "Added Gate"));
      assert.ok(editedItem);
      await settled();

      const update = savedSettings.at(-1);
      assert.ok(update);
      assert.deepEqual(update.templateRules, [{
        id: "custom-term",
        label: "Custom Term",
        priority: 0,
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
    const builtinRule = builtinRules.find(rule => rule.label === "iv transfer");
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
        .find(item => hasSemanticRuleValue(item, builtinRule.label));
      assert.ok(builtinItem);
      assert.equal(getSemanticRuleInput(builtinItem, "X representative").hidden, false);
      assert.equal(getSemanticRuleInput(builtinItem, "Rule label, for example iv transfer").readOnly, false);
      assert.equal(getSemanticRuleActionNames(builtinItem).includes("Done"), false);
      assert.equal(getSemanticRuleActionNames(builtinItem).includes("Cancel"), false);

      acceptSemanticRuleInput(builtinItem, "X representative", "Codex Override Gate");
      const editedItem = getSemanticRuleItems(container)
        .find(item => hasSemanticRuleValue(item, "Codex Override Gate"));
      assert.ok(editedItem);
      await settled();

      const update = savedSettings.at(-1);
      assert.ok(update);
      const rule = update.templateRules?.find(rule => rule.id === builtinRule.id);
      assert.ok(rule);
      assert.equal(rule.label, builtinRule.label);
      assert.ok(rule.xTerms.includes("Codex Override Gate"));
      assert.deepEqual(rule.yTerms, builtinRule.yTerms);
    }
    finally {
      controller?.dispose();
      container.remove();
    }
  });

  test("keeps built-in semantic item unchanged on title blur", async () => {
    const builtinRule = builtinRules.find(rule => rule.label === "transient");
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
        .find(item => hasSemanticRuleValue(item, builtinRule.label));
      assert.ok(builtinItem);
      assert.equal(getSemanticRuleActionNames(builtinItem).includes(`Remove rule ${builtinRule.label}`), true);

      blurSemanticRuleInput(builtinItem, "Rule label, for example iv transfer", builtinRule.label);
      await settled();

      const nextBuiltinItem = getSemanticRuleItems(container)
        .find(item => hasSemanticRuleValue(item, builtinRule.label));
      assert.ok(nextBuiltinItem);
      assert.deepEqual(savedSettings, []);
      assert.equal(service.settings.templateRules, undefined);
      assert.equal(getSemanticRuleActionNames(nextBuiltinItem).includes(`Remove rule ${builtinRule.label}`), true);
    }
    finally {
      controller?.dispose();
      container.remove();
    }
  });

  test("removes built-in semantic section item until reset restores it", async () => {
    const builtinRule = builtinRules.find(rule => rule.label === "transient");
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
        .find(item => hasSemanticRuleValue(item, builtinRule.label));
      assert.ok(builtinItem);

      getSemanticRuleAction(builtinItem, `Remove rule ${builtinRule.label}`).click();
      await settled();

      const removeUpdate = savedSettings.at(-1);
      assert.ok(removeUpdate);
      assert.deepEqual(removeUpdate.templateRules?.find(rule => rule.id === builtinRule.id), {
        id: builtinRule.id,
        label: builtinRule.label,
        description: builtinRule.description,
        priority: builtinRule.priority,
        badge: builtinRule.badge,
        xTerms: builtinRule.xTerms,
        yTerms: builtinRule.yTerms,
        enabled: false,
      });
      assert.equal(getSemanticRuleItems(container).some(item => hasSemanticRuleValue(item, builtinRule.label)), false);

      getButton(container, "settings-template-semantic-reset-rules").click();
      await settled();

      const resetUpdate = savedSettings.at(-1);
      assert.ok(resetUpdate);
      assert.equal(resetUpdate.templateRules?.some(rule => rule.id === builtinRule.id) ?? false, false);
      assert.equal(getSemanticRuleItems(container).some(item => hasSemanticRuleValue(item, builtinRule.label)), true);
    }
    finally {
      controller?.dispose();
      container.remove();
    }
  });

  test("resets built-in semantic section item overrides without removing custom rules", async () => {
    const builtinRule = builtinRules.find(rule => rule.label === "iv transfer");
    assert.ok(builtinRule);
    const container = document.createElement("div");
    document.body.appendChild(container);

    const service = createSettingsService({
      templateRules: [{
        id: builtinRule.id,
        label: builtinRule.label,
        priority: builtinRule.priority,
        ...(builtinRule.badge ? { badge: builtinRule.badge } : {}),
        xTerms: ["Codex Override Gate"],
        yTerms: builtinRule.yTerms,
        enabled: true,
      }, {
        id: "custom-term",
        label: "Custom Term",
        priority: 0,
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
      assert.deepEqual(update.templateRules, [{
        id: "custom-term",
        label: "Custom Term",
        priority: 0,
        xTerms: ["Custom Gate"],
        yTerms: ["Custom Current"],
        enabled: true,
      }]);
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
      setSemanticRuleInput(draftItem, "Rule label, for example iv transfer", "iv");
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
      acceptSemanticRuleInput(draftItem, "Rule label, for example iv transfer", "V");
      await settled();

      assert.equal(updateCount, 0);
      assert.equal(service.settings.templateRules, undefined);
      assert.equal(notifications.at(-1)?.message, "Enter at least two letters or digits for the rule label.");
      assert.equal(notifications.at(-1)?.presentation?.type, "error");
      assert.equal(getSemanticRuleInput(draftItem, "Rule label, for example iv transfer").value, "V");
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
      templateRules: [{
        id: "single-i",
        label: "I",
        priority: 0,
        xTerms: ["Vg"],
        yTerms: ["Id"],
        enabled: true,
      }, {
        id: "drive-bias",
        label: "DriveBias",
        priority: 1,
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

  test("patches semantic rules descriptor when adding a custom section item", async () => {
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
      setSemanticRuleInput(draftItem, "Rule label, for example iv transfer", "custom");
      acceptSemanticRuleInput(container, "X representative", "Codex Custom X");
      patchedTargets.length = 0;
      patchedDescriptors.length = 0;
      acceptSemanticRuleInput(container, "Y representative", "Codex Custom Y");
      await settled();

      assert.deepEqual(patchedTargets, [
        {
          descriptorId: "template-semantic-rules",
          itemIds: [draftItem.id as SettingsContentItemId],
        },
      ]);
      assert.equal(patchedDescriptors.includes("template-domain-priority"), false);
      assert.deepEqual(
        patchedDescriptors.filter(descriptorId => descriptorId === "template-semantic-rules"),
        [
          "template-semantic-rules",
          "template-semantic-rules",
          "template-semantic-rules",
          "template-semantic-rules",
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
      const input = getSemanticRuleInput(draftItem, "Rule label, for example iv transfer");
      input.focus();

      setSemanticRuleInput(draftItem, "Rule label, for example iv transfer", "Codex Custom Term");
      acceptSemanticRuleInput(container, "X representative", "Codex Gate Bias");
      acceptSemanticRuleInput(container, "Y representative", "Codex Drain Current");
      await settled();

      const pendingItem = getSemanticRuleItems(container)[0];
      assert.ok(pendingItem);
      const pendingInput = getSemanticRuleInput(pendingItem, "Rule label, for example iv transfer");
      assert.equal(pendingInput.value, "Codex Custom Term");
      assert.equal(pendingInput.disabled, true);

      clickNewSemanticRule(container);
      const nextDraftItem = getSemanticRuleItems(container)[0];
      assert.ok(nextDraftItem);
      const nextInput = getSemanticRuleInput(nextDraftItem, "Rule label, for example iv transfer");
      setSemanticRuleInput(nextDraftItem, "Rule label, for example iv transfer", "Next Term");
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
      const input = getSemanticRuleInput(draftItem, "Rule label, for example iv transfer");
      input.focus();

      setSemanticRuleInput(draftItem, "Rule label, for example iv transfer", "Codex Custom Term");
      acceptSemanticRuleInput(container, "X representative", "Codex Gate Bias");
      acceptSemanticRuleInput(container, "Y representative", "Codex Drain Current");
      await settled();

      const pendingItem = getSemanticRuleItems(container)[0];
      assert.ok(pendingItem);
      const pendingInput = getSemanticRuleInput(pendingItem, "Rule label, for example iv transfer");
      pendingInput.value = "Next Term";
      pendingInput.dispatchEvent(new globalThis.Event("input", { bubbles: true }));

      updateDeferred.reject("save failed");
      await settled();

      const failedItem = getSemanticRuleItems(container)[0];
      assert.ok(failedItem);
      const failedInput = getSemanticRuleInput(failedItem, "Rule label, for example iv transfer");
      assert.equal(failedInput.value, "Next Term");
      assert.equal(failedInput.readOnly, false);
    }
    finally {
      controller.dispose();
      container.remove();
    }
  });

  test("patches semantic rules descriptor when removing a custom section item", async () => {
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
      templateRules: [{
        id: "custom-term",
        label: "Custom Term",
        priority: 0,
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
      getSemanticRuleAction(customItem, "Remove rule Custom Term").click();
      await settled();

      assert.deepEqual(patchedTargets, []);
      assert.equal(patchedDescriptors.includes("template-domain-priority"), false);
      assert.deepEqual(
        patchedDescriptors.filter(descriptorId => descriptorId === "template-semantic-rules"),
        [
          "template-semantic-rules",
          "template-semantic-rules",
          "template-semantic-rules",
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

function assertSwitchInteractionAnimation(button: HTMLButtonElement): void {
  const thumb = button.querySelector<HTMLElement>(".ui-switch__thumb");
  assert.ok(thumb);
  assert.ok(button.classList.contains("ui-switch--animate"));
  assert.ok(getComputedStyle(thumb).transitionDuration !== "0s");
  assert.ok(getComputedStyle(thumb).transitionProperty.includes("transform"));
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
