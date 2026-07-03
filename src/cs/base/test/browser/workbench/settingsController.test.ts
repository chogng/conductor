import assert from "assert";

import { Event } from "src/cs/base/common/event";
import { SettingsController } from "src/cs/workbench/contrib/settings/browser/settingsController";
import { SettingsControllerService } from "src/cs/workbench/contrib/settings/browser/settingsControllerService";
import { SettingsView, type SettingsContentItemId, type SettingsContentItemTarget } from "src/cs/workbench/contrib/settings/browser/settingsView";
import { ConfigurationService } from "src/cs/platform/configuration/common/configurationService";
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
import { builtinRules, toSemanticTermKey } from "src/cs/workbench/services/dataResource/common/semanticRules";
import { BrowserSettingsService } from "src/cs/workbench/services/settings/browser/settingsService";
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
      assertSwitchInteractionAnimation(switchButton);
      assert.equal(switchButton.disabled, false);
      assert.equal(getComputedStyle(switchButton).opacity, "1");

      controller.update(createSettingsViewInput(service.settings));
      assert.equal(getButton(container, "settings-explorer-badges-toggle"), switchButton);
      assert.equal(switchButton.getAttribute("aria-checked"), "false");
      assert.equal(switchButton.disabled, false);
      assertSwitchInteractionAnimation(switchButton);
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
      assertSwitchInteractionAnimation(switchButton);
      assert.equal(switchButton.disabled, false);
      assert.equal(getComputedStyle(switchButton).opacity, "1");

      controller.update(createSettingsViewInput(service.settings));
      assert.equal(getButton(container, "settings-transparent-chrome-toggle"), switchButton);
      assert.equal(switchButton.getAttribute("aria-checked"), "false");
      assert.equal(switchButton.disabled, false);
      assertSwitchInteractionAnimation(switchButton);
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

  test("keeps template visualization switch transition when settings service publishes saved input", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);

    const service = createSettingsService({ tableTemplateVisualizationEnabled: false });
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
      openTemplateSection(container);
      const switchButton = getButton(container, "settings-table-template-visualization-toggle");
      switchButton.click();

      assert.equal(getButton(container, "settings-table-template-visualization-toggle"), switchButton);
      assert.equal(switchButton.getAttribute("aria-checked"), "true");
      assertSwitchInteractionAnimation(switchButton);
    }
    finally {
      controller.dispose();
      container.remove();
    }
  });

  test("keeps template visualization switch through configuration persistence", async () => {
    const contentContainer = document.createElement("div");
    const navigationContainer = document.createElement("div");
    document.body.append(contentContainer, navigationContainer);

    const configurationService = new ConfigurationService();
    const settingsService = new BrowserSettingsService(configurationService);
    settingsService.mergeConductorSettings({ tableTemplateVisualizationEnabled: false });
    settingsService.update({
      appUpdateSettings: {
        currentVersion: "1.0.0",
        isAvailable: false,
      },
      isWindowsDesktopShell: false,
      language: "en",
      settingsPersistence: undefined,
      theme: "light",
    });
    const controllerService = new SettingsControllerService(
      settingsService,
      createCommandService(),
      createNotificationService(),
    );
    const contentAttachment = controllerService.attachContent(contentContainer);
    const navigationAttachment = controllerService.attachNavigation(navigationContainer);

    try {
      openTemplateSection(navigationContainer);
      const switchButton = getButton(contentContainer, "settings-table-template-visualization-toggle");
      assert.equal(switchButton.getAttribute("aria-checked"), "false");

      switchButton.click();

      assert.equal(
        getButton(contentContainer, "settings-table-template-visualization-toggle"),
        switchButton,
        "Template visualization switch should survive the pending render.",
      );
      assert.equal(switchButton.getAttribute("aria-checked"), "true");
      assertSwitchInteractionAnimation(switchButton);

      await settled();

      assert.equal(configurationService.getValue("tableTemplateVisualizationEnabled"), true);
      assert.equal(
        getButton(contentContainer, "settings-table-template-visualization-toggle"),
        switchButton,
        "Template visualization switch should survive the configuration writeback render.",
      );
      assert.equal(switchButton.getAttribute("aria-checked"), "true");
      assertSwitchInteractionAnimation(switchButton);
    }
    finally {
      navigationAttachment.dispose();
      contentAttachment.dispose();
      controllerService.dispose();
      settingsService.dispose();
      configurationService.dispose();
      contentContainer.remove();
      navigationContainer.remove();
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

      setSemanticRuleInput(draftItem, "Domain scope, for example iv", "iv");
      acceptSemanticRuleInput(container, "X representative", "Codex Gate Bias");
      acceptSemanticRuleInput(container, "Y representative", "Codex Drain Current");
      await settled();

      const update = savedSettings.at(-1);
      assert.ok(update);
      const rule = update.templateSemanticPatches?.rules[0];
      assert.ok(rule);
      assert.equal(rule.label, "iv");
      assert.deepEqual(rule.xKeys?.addKeys, ["codexgatebias"]);
      assert.deepEqual(rule.yKeys?.addKeys, ["codexdraincurrent"]);
      assert.ok(update.templateSemanticPatches?.terms.some(term =>
        term.key === "codexgatebias" &&
        term.addAliases.includes("Codex Gate Bias")
      ));
      assert.ok(update.templateSemanticPatches?.terms.some(term =>
        term.key === "codexdraincurrent" &&
        term.addAliases.includes("Codex Drain Current")
      ));
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
      const rule = update.templateSemanticPatches?.rules[0];
      assert.ok(rule);
      assert.equal(rule.label, "blur");
      assert.deepEqual(rule.xKeys?.addKeys, ["blurgate"]);
      assert.deepEqual(rule.yKeys?.addKeys, ["blurcurrent"]);
    }
    finally {
      controller?.dispose();
      container.remove();
    }
  });

  test("edits saved custom semantic section item terms", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);

    const service = createSettingsService(createTemplateSemanticPatchSettings([{
        id: "custom-term",
        label: "Custom Term",
        priority: 0,
        xTerms: ["Custom Gate"],
        yTerms: ["Custom Current"],
        enabled: true,
      }]));
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
      const rule = getTemplateSemanticRulePatch(update, "custom-term");
      assert.ok(rule);
      assert.deepEqual(rule.xKeys?.addKeys, ["customgate", "addedgate"]);
      assert.deepEqual(rule.yKeys?.addKeys, ["customcurrent"]);
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
      const rule = getTemplateSemanticRulePatch(update, builtinRule.id);
      assert.ok(rule);
      assert.equal(rule.label, builtinRule.label);
      assert.ok(rule.xKeys?.addKeys.includes("codexoverridegate"));
      assert.deepEqual(rule.yKeys?.removeKeys, []);
      assert.ok(update.templateSemanticPatches?.terms.some(term =>
        term.key === "codexoverridegate" &&
        term.addAliases.includes("Codex Override Gate")
      ));
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
      assert.equal(getSemanticRuleActionNames(builtinItem).includes(`Remove domain rule ${builtinRule.label}`), true);

      blurSemanticRuleInput(builtinItem, "Domain scope, for example iv", builtinRule.label);
      await settled();

      const nextBuiltinItem = getSemanticRuleItems(container)
        .find(item => hasSemanticRuleValue(item, builtinRule.label));
      assert.ok(nextBuiltinItem);
      assert.deepEqual(savedSettings, []);
      assert.equal(service.settings.templateSemanticPatches, undefined);
      assert.equal(getSemanticRuleActionNames(nextBuiltinItem).includes(`Remove domain rule ${builtinRule.label}`), true);
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

      getSemanticRuleAction(builtinItem, `Remove domain rule ${builtinRule.label}`).click();
      await settled();

      const removeUpdate = savedSettings.at(-1);
      assert.ok(removeUpdate);
      assert.deepEqual(getTemplateSemanticRulePatch(removeUpdate, builtinRule.id), {
        id: builtinRule.id,
        enabled: false,
      });
      assert.equal(getSemanticRuleItems(container).some(item => hasSemanticRuleValue(item, builtinRule.label)), false);

      getButton(container, "settings-template-semantic-reset-rules").click();
      await settled();

      const resetUpdate = savedSettings.at(-1);
      assert.ok(resetUpdate);
      assert.equal(resetUpdate.templateSemanticPatches?.rules.some(rule => rule.id === builtinRule.id) ?? false, false);
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
      templateSemanticPatches: {
        terms: createSemanticTermPatches(["Codex Override Gate", "Custom Gate", "Custom Current"]),
        rules: [{
          id: builtinRule.id,
          label: builtinRule.label,
          priority: builtinRule.priority,
          ...(builtinRule.type ? { type: builtinRule.type } : {}),
          enabled: true,
          xKeys: {
            addKeys: ["codexoverridegate"],
            removeKeys: builtinRule.xTerms.map(toSemanticTermKey).filter(Boolean),
          },
          yKeys: {
            addKeys: [],
            removeKeys: [],
          },
        }, {
          id: "custom-term",
          label: "Custom Term",
          priority: 0,
          enabled: true,
          xKeys: {
            addKeys: ["customgate"],
            removeKeys: [],
          },
          yKeys: {
            addKeys: ["customcurrent"],
            removeKeys: [],
          },
        }],
      },
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
      assert.equal(update.templateSemanticPatches?.rules.some(rule => rule.id === builtinRule.id), false);
      assert.ok(getTemplateSemanticRulePatch(update, "custom-term"));
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
      assert.equal(service.settings.templateSemanticPatches, undefined);
      assert.equal(notifications.at(-1)?.message, "Enter at least two letters or digits for the rule label.");
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

    const service = createSettingsService(createTemplateSemanticPatchSettings([{
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
      }]));
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
      setSemanticRuleInput(draftItem, "Domain scope, for example iv", "custom");
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
    const service = createSettingsService(createTemplateSemanticPatchSettings([{
        id: "custom-term",
        label: "Custom Term",
        priority: 0,
        xTerms: ["Custom Gate"],
        yTerms: ["Custom Current"],
        enabled: true,
      }]));
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
  const ariaLabel = getSemanticRuleInputAriaLabel(placeholder);
  const inputs = Array.from(container.querySelectorAll<HTMLInputElement>(".settings-template-semantic-rule-input input.inputbox_native"));
  const input = inputs
    .find(input => input.placeholder === placeholder || input.getAttribute("aria-label") === ariaLabel);
  assert.ok(input, `Missing semantic rule input ${placeholder}. Available: ${inputs.map(input => `${input.placeholder}/${input.getAttribute("aria-label")}`).join(", ")}`);
  return input;
}

function getSemanticRuleInputAriaLabel(placeholder: string): string {
  switch (placeholder) {
    case "Domain scope, for example iv":
      return "Domain scope";
    case "Type, for example transfer":
      return "Rule type";
    case "X representative":
      return "X axis representative character block";
    case "Y representative":
      return "Y axis representative character block";
    default:
      return placeholder;
  }
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
  const buttons = Array.from(container.querySelectorAll<HTMLButtonElement>(".settings-template-semantic-rule-action"));
  const button = buttons
    .find(button => button.getAttribute("aria-label") === accessibleName);
  assert.ok(button, `Missing semantic rule action ${accessibleName}. Available: ${buttons.map(button => button.getAttribute("aria-label") ?? "").join(", ")}`);
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

function createTemplateSemanticPatchSettings(
  rules: readonly {
    readonly id: string;
    readonly label: string;
    readonly priority: number;
    readonly type?: string;
    readonly xTerms: readonly string[];
    readonly yTerms: readonly string[];
    readonly enabled?: boolean;
  }[],
): Pick<ConductorSettings, "templateSemanticPatches"> {
  return {
    templateSemanticPatches: {
      terms: createSemanticTermPatches(rules.flatMap(rule => [...rule.xTerms, ...rule.yTerms])),
      rules: rules.map(rule => ({
        id: rule.id,
        label: rule.label,
        priority: rule.priority,
        ...(rule.type ? { type: rule.type } : {}),
        ...(rule.enabled === false ? { enabled: false } : { enabled: true }),
        xKeys: {
          addKeys: rule.xTerms.map(toSemanticTermKey).filter(Boolean),
          removeKeys: [],
        },
        yKeys: {
          addKeys: rule.yTerms.map(toSemanticTermKey).filter(Boolean),
          removeKeys: [],
        },
      })),
    },
  };
}

function createSemanticTermPatches(
  terms: readonly string[],
): readonly { readonly key: string; readonly addAliases: readonly string[]; readonly removeAliases: readonly string[] }[] {
  const aliasesByKey = new Map<string, string[]>();
  for (const term of terms) {
    const key = toSemanticTermKey(term);
    if (!key) {
      continue;
    }
    const aliases = aliasesByKey.get(key) ?? [];
    if (!aliases.includes(term)) {
      aliases.push(term);
    }
    aliasesByKey.set(key, aliases);
  }
  return [...aliasesByKey].map(([key, addAliases]) => ({
    key,
    addAliases,
    removeAliases: [],
  }));
}

function getTemplateSemanticRulePatch(
  settings: Partial<ConductorSettings> | undefined,
  id: string,
) {
  return settings?.templateSemanticPatches?.rules.find(rule => rule.id === id);
}
