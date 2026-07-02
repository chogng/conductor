import assert from "assert";

import { renderWorkbenchMarkdown } from "src/cs/workbench/browser/markdownRenderer";
import { SettingsView, type SettingsViewOptions } from "src/cs/workbench/contrib/settings/browser/settingsView";
import { createSettingsSections } from "src/cs/workbench/contrib/settings/browser/settingsLayout";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";

type SettingsViewOptionOverrides = Partial<Omit<SettingsViewOptions, "appearanceSettings" | "chartDefaultSettings" | "originSettings" | "templateSettings">> & {
  appearanceSettings?: Partial<SettingsViewOptions["appearanceSettings"]>;
  chartDefaultSettings?: Partial<SettingsViewOptions["chartDefaultSettings"]>;
  originSettings?: Partial<SettingsViewOptions["originSettings"]>;
  templateSettings?: Partial<SettingsViewOptions["templateSettings"]>;
};

const noop = () => undefined;

suite("workbench/contrib/settings/browser/settingsView", () => {
  ensureNoDisposablesAreLeakedInTestSuite();

  test("renders numeric display as an optimization switch with description", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const view = new SettingsView(container, createSettingsViewOptions({ activeSettingsSection: "general" }));

    try {
      assert.equal(getElement(container, ".settings-content-title").textContent, "General");
      const switchButton = getButton(container, "settings-numeric-display-toggle");
      assert.equal(switchButton.getAttribute("aria-checked"), "false");
      assert.equal(switchButton.getAttribute("aria-label"), "优化表格数值显示");
      assert.ok(container.textContent?.includes("优化表格数值显示"));
      assert.ok(container.textContent?.includes("优化科学计数法以合适小数位显示以更好的预览"));
      assert.equal(container.querySelector("#settings-numeric-display-dropdown"), null);
    }
    finally {
      view.dispose();
      container.remove();
    }
  });

  test("patches general items without replacing unrelated controls", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const view = new SettingsView(container, createSettingsViewOptions({ activeSettingsSection: "general" }));

    try {
      const content = getElement(container, ".settings-view-content");
      const contentTitle = getElement(container, ".settings-content-title");
      const tree = getElement(container, ".settings-view-content > .settings-section-list");
      const languageSelect = getButton(container, "settings-language-dropdown");
      const closeBehaviorSelect = getButton(container, "settings-close-behavior-dropdown");
      const numericDisplaySwitch = getButton(container, "settings-numeric-display-toggle");

      view.update(createSettingsViewOptions({
        activeSettingsSection: "general",
        windowCloseBehaviorOptions: [
          { label: "Minimize to Tray", value: "minimizeToTray" },
          { label: "Quit", value: "quit" },
        ],
        windowCloseSettings: {
          behavior: "minimizeToTray",
          isSaving: true,
          onBehaviorChange: noop,
        },
        numericDisplaySettings: {
          isSaving: true,
          optimized: true,
          onOptimizedChange: noop,
        },
      }), {
        type: "partial",
        descriptorIds: [],
        itemTargets: [{ descriptorId: "general-preferences", itemIds: ["settings-close-behavior-item", "settings-numeric-display-item"] }],
      });

      assert.equal(getElement(container, ".settings-view-content"), content);
      assert.equal(getElement(container, ".settings-content-title"), contentTitle);
      assert.equal(contentTitle.textContent, "General");
      assert.equal(getElement(container, ".settings-view-content > .settings-section-list"), tree);
      assert.equal(getButton(container, "settings-language-dropdown"), languageSelect);
      const nextCloseBehaviorSelect = getButton(container, "settings-close-behavior-dropdown");
      const nextNumericDisplaySwitch = getButton(container, "settings-numeric-display-toggle");
      assert.equal(nextCloseBehaviorSelect, closeBehaviorSelect);
      assert.equal(nextNumericDisplaySwitch, numericDisplaySwitch);
      assert.equal(getSelectLabel(nextCloseBehaviorSelect), "Minimize to Tray");
      assert.equal(nextCloseBehaviorSelect.disabled, true);
      assert.equal(nextNumericDisplaySwitch.getAttribute("aria-checked"), "true");
      assert.equal(nextNumericDisplaySwitch.disabled, false);
    }
    finally {
      view.dispose();
      container.remove();
    }
  });

  test("renders search results without a content page header", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const view = new SettingsView(container, createSettingsViewOptions({
      activeSettingsSection: "general",
      searchQuery: "language",
    }));

    try {
      const content = getElement(container, ".settings-view-content");
      const languageItem = getElement(container, "#settings-language-item");

      assert.equal(content.classList.contains("settings-view-content--search"), true);
      assert.equal(container.querySelector(".settings-content-title"), null);
      assert.equal(getClosestSettingsListItem(languageItem).hidden, false);
    }
    finally {
      view.dispose();
      container.remove();
    }
  });

  test("patches a targeted item without replacing sibling content", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const view = new SettingsView(container, createSettingsViewOptions({ activeSettingsSection: "general" }));

    try {
      const content = getElement(container, ".settings-view-content");
      const tree = getElement(container, ".settings-view-content > .settings-section-list");
      const languageSelect = getButton(container, "settings-language-dropdown");
      const numericDisplaySwitch = getButton(container, "settings-numeric-display-toggle");
      const transferScaleSelect = getButton(container, "settings-default-transfer-y-scale-select");
      const outputScaleSelect = getButton(container, "settings-default-output-y-scale-select");
      const chartDefaultsItem = getElement(container, "#settings-chart-defaults-item");

      view.update(createSettingsViewOptions({
        activeSettingsSection: "general",
        chartDefaultSettings: {
          defaultYScaleForTransfer: "linear",
        },
      }), {
        type: "partial",
        descriptorIds: [],
        itemTargets: [{ descriptorId: "chart-defaults", itemIds: ["settings-default-transfer-y-scale-item"] }],
      });

      const nextTransferScaleSelect = getButton(container, "settings-default-transfer-y-scale-select");
      assert.equal(getElement(container, ".settings-view-content"), content);
      assert.equal(getElement(container, ".settings-view-content > .settings-section-list"), tree);
      assert.equal(getButton(container, "settings-language-dropdown"), languageSelect);
      assert.equal(getButton(container, "settings-numeric-display-toggle"), numericDisplaySwitch);
      assert.equal(getButton(container, "settings-default-output-y-scale-select"), outputScaleSelect);
      assert.equal(getElement(container, "#settings-chart-defaults-item"), chartDefaultsItem);
      assert.equal(nextTransferScaleSelect, transferScaleSelect);
      assert.equal(getSelectLabel(nextTransferScaleSelect), "Linear");
      assert.equal(nextTransferScaleSelect.disabled, false);

      const titleFontSizeInput = getInput(container, "settings-default-title-font-size-input");
      view.update(createSettingsViewOptions({
        activeSettingsSection: "general",
        axisTitleFontSizeDraft: "24",
        chartDefaultSettings: {
          isSaving: true,
        },
      }), {
        type: "partial",
        descriptorIds: [],
        itemTargets: [{ descriptorId: "chart-defaults", itemIds: ["settings-chart-defaults-item"] }],
      });

      assert.equal(getElement(container, "#settings-chart-defaults-item"), chartDefaultsItem);
      assert.equal(getInput(container, "settings-default-title-font-size-input"), titleFontSizeInput);
      assert.equal(titleFontSizeInput.value, "24");
      assert.equal(titleFontSizeInput.disabled, true);
    }
    finally {
      view.dispose();
      container.remove();
    }
  });

  test("patches a targeted tree element item without replacing sibling items", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const view = new SettingsView(container, createSettingsViewOptions({ activeSettingsSection: "origin" }));

    try {
      const pathItem = getElement(container, "#settings-origin-path-item");
      const pathInput = getInput(container, "settings-origin-path-value-input");
      const cleanupItem = getElement(container, "#settings-origin-cleanup-item");
      const plotItem = getElement(container, "#settings-origin-plot-item");

      view.update(createSettingsViewOptions({
        activeSettingsSection: "origin",
        originSettings: {
          currentPath: "C:\\Origin\\Origin.exe",
          isConfigurable: true,
          isHealthCheckAvailable: true,
        },
      }), {
        type: "partial",
        descriptorIds: [],
        itemTargets: [{ descriptorId: "origin-integration", itemIds: ["settings-origin-path-item"] }],
      });

      assert.equal(getElement(container, "#settings-origin-path-item"), pathItem);
      assert.equal(getInput(container, "settings-origin-path-value-input"), pathInput);
      assert.equal(getElement(container, "#settings-origin-cleanup-item"), cleanupItem);
      assert.equal(getElement(container, "#settings-origin-plot-item"), plotItem);
      assert.equal(getInput(container, "settings-origin-path-value-input").value, "C:\\Origin\\Origin.exe");
    }
    finally {
      view.dispose();
      container.remove();
    }
  });

  test("patches appearance items without replacing untargeted controls", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const view = new SettingsView(container, createSettingsViewOptions());

    try {
      const themeSelect = getButton(container, "settings-theme-dropdown");
      const explorerDensitySelect = getButton(container, "settings-explorer-density-dropdown");
      const explorerBadgesSwitch = getButton(container, "settings-explorer-badges-toggle");
      const transferBlueSwatch = getBadgeColorSwatch(container, "blue");
      const colorInput = getInput(container, "settings-background-color-input");
      const backgroundResetButton = getBackgroundResetButton(container);
      const whiteSwatch = getButtonByAriaLabel(container, "#ffffff");
      const darkSwatch = getButtonByAriaLabel(container, "#111827");
      const transparentChromeSwitch = getButton(container, "settings-transparent-chrome-toggle");

      explorerBadgesSwitch.click();
      transparentChromeSwitch.click();

      assert.ok(explorerBadgesSwitch.classList.contains("ui-switch--animate"));
      assert.ok(transparentChromeSwitch.classList.contains("ui-switch--animate"));

      view.update(createSettingsViewOptions({
        theme: "dark",
        themeModeOptions: [
          { label: "System", value: "system" },
          { label: "Dark", value: "dark" },
        ],
        appearanceSettings: {
          backgroundColor: "#111827",
          explorerDensity: "compact",
          explorerDensityOptions: [
            { label: "Default", value: "default" },
            { label: "Compact", value: "compact" },
          ],
          explorerBadgeColors: {
            cf: "cyan",
            cv: "purple",
            mixed: "neutral",
            output: "blue",
            pv: "red",
            transfer: "green",
            unknown: "orange",
          },
          isExplorerBadgeColorSaving: true,
          isExplorerBadgeSaving: true,
          isExplorerDensitySaving: true,
          isSaving: true,
          showExplorerBadges: false,
          transparentChrome: false,
        },
      }), {
        type: "partial",
        descriptorIds: [],
        itemTargets: [{ descriptorId: "appearance-preferences", itemIds: ["settings-theme-item", "settings-explorer-density-item", "settings-explorer-badge-colors-item", "settings-background-item"] }],
      });

      const nextThemeSelect = getButton(container, "settings-theme-dropdown");
      const nextExplorerDensitySelect = getButton(container, "settings-explorer-density-dropdown");
      const nextTransferBlueSwatch = getBadgeColorSwatch(container, "blue");
      const nextColorInput = getInput(container, "settings-background-color-input");
      const nextBackgroundResetButton = getBackgroundResetButton(container);
      const nextWhiteSwatch = getButtonByAriaLabel(container, "#ffffff");
      const nextDarkSwatch = getButtonByAriaLabel(container, "#111827");

      assert.equal(nextThemeSelect, themeSelect);
      assert.equal(nextExplorerDensitySelect, explorerDensitySelect);
      assert.equal(getButton(container, "settings-explorer-badges-toggle"), explorerBadgesSwitch);
      assert.equal(nextTransferBlueSwatch, transferBlueSwatch);
      assert.equal(nextColorInput, colorInput);
      assert.equal(nextBackgroundResetButton, backgroundResetButton);
      assert.equal(nextWhiteSwatch, whiteSwatch);
      assert.equal(nextDarkSwatch, darkSwatch);
      assert.equal(getButton(container, "settings-transparent-chrome-toggle"), transparentChromeSwitch);

      assert.equal(getSelectLabel(nextThemeSelect), "Dark");
      assert.equal(getSelectLabel(nextExplorerDensitySelect), "Compact");
      assert.equal(nextExplorerDensitySelect.disabled, true);
      assert.equal(nextTransferBlueSwatch.disabled, true);
      assert.equal(nextTransferBlueSwatch.dataset.selected, "false");
      assert.equal(getBadgeColorSwatch(container, "green").dataset.selected, "true");
      assert.ok(explorerBadgesSwitch.classList.contains("ui-switch--animate"));
      assert.ok(transparentChromeSwitch.classList.contains("ui-switch--animate"));
      assert.equal(explorerBadgesSwitch.disabled, false);
      assert.equal(transparentChromeSwitch.disabled, false);
      assert.equal(getComputedStyle(explorerBadgesSwitch).opacity, "1");
      assert.equal(getComputedStyle(transparentChromeSwitch).opacity, "1");
      assert.equal(explorerBadgesSwitch.getAttribute("aria-checked"), "false");
      assert.equal(transparentChromeSwitch.getAttribute("aria-checked"), "false");
      assert.equal(nextColorInput.value, "#111827");
      assert.equal(nextColorInput.disabled, true);
      assert.equal(nextBackgroundResetButton.disabled, true);
      assert.equal(nextWhiteSwatch.dataset.selected, "false");
      assert.equal(nextDarkSwatch.dataset.selected, "true");
      assert.ok(Array.from(container.querySelectorAll<HTMLButtonElement>(".settings-color-swatch")).every(swatch => swatch.disabled));

      const currentExplorerBadgesSwitch = getButton(container, "settings-explorer-badges-toggle");
      const currentTransparentChromeSwitch = getButton(container, "settings-transparent-chrome-toggle");
      view.update(createSettingsViewOptions({
        appearanceSettings: {
          showExplorerBadges: false,
          transparentChrome: false,
        },
      }), {
        type: "partial",
        descriptorIds: [],
        itemTargets: [{ descriptorId: "appearance-preferences", itemIds: ["settings-explorer-badges-item", "settings-transparent-chrome-item"] }],
      });

      const nextExplorerBadgesSwitch = getButton(container, "settings-explorer-badges-toggle");
      const nextTransparentChromeSwitch = getButton(container, "settings-transparent-chrome-toggle");
      assert.equal(nextExplorerBadgesSwitch, currentExplorerBadgesSwitch);
      assert.equal(nextTransparentChromeSwitch, currentTransparentChromeSwitch);
      assert.equal(nextExplorerBadgesSwitch.disabled, false);
      assert.equal(nextTransparentChromeSwitch.disabled, false);
      assert.equal(nextExplorerBadgesSwitch.getAttribute("aria-checked"), "false");
      assert.equal(nextTransparentChromeSwitch.getAttribute("aria-checked"), "false");
    }
    finally {
      view.dispose();
      container.remove();
    }
  });

  test("dispatches release notes intent from about section", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    let showReleaseNotesCount = 0;
    const view = new SettingsView(container, createSettingsViewOptions({
      activeSettingsSection: "about",
      handleShowReleaseNotes: () => {
        showReleaseNotesCount++;
      },
    }));

    try {
      getButton(container, "settings-release-notes-show-btn").click();

      assert.equal(showReleaseNotesCount, 1);
      assert.equal(document.querySelector(".settings-document-modal"), null);
    }
    finally {
      view.dispose();
      container.remove();
    }
  });

  test("renders template semantic rules as section items with header actions", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    let createCount = 0;
    let resetCount = 0;
    const view = new SettingsView(container, createSettingsViewOptions({
      activeSettingsSection: "template",
      templateSettings: {
        onCreateSemanticSectionItem: () => {
          createCount++;
        },
        onResetSemanticDomainRules: () => {
          resetCount++;
        },
        semanticSectionItems: [
          {
            id: "settings-template-semantic-section-item:draft:2",
            isSaving: false,
            ruleId: "draft-2",
            source: "draft",
            title: "",
            xDraft: "",
            xTerms: ["Vg"],
            yDraft: "",
            yTerms: ["Id"],
          },
          {
            id: "settings-template-semantic-section-item:custom:custom-gate",
            isSaving: false,
            ruleId: "custom-gate",
            source: "custom",
            title: "iv",
            xDraft: "",
            xTerms: ["Custom Gate"],
            yDraft: "",
            yTerms: ["Id"],
          },
        ],
        domainPriorityItems: [
          {
            id: "custom-gate",
            source: "custom",
            title: "iv",
            xTerms: ["Custom Gate"],
            yTerms: ["Id"],
          },
          {
            id: "builtin-domain:iv",
            source: "builtin",
            title: "builtin iv",
            xTerms: ["Vg"],
            yTerms: ["Id"],
          },
        ],
      },
    }));

    try {
      const templatePreferencesItem = getElement(container, "#settings-table-template-visualization-item");
      const templatePreferencesSection = templatePreferencesItem.closest<HTMLElement>(".settings-section");
      const semanticSection = getElement(container, "#settings-template-semantic-library-section");
      const semanticTree = semanticSection.closest(".settings-section-list");
      const resetButton = getButton(container, "settings-template-semantic-reset-rules");
      const newButton = getButton(container, "settings-template-semantic-new-rule");
      const draftItem = getElement(container, "#settings-template-semantic-section-item\\:draft\\:2");
      const customItem = getElement(container, "#settings-template-semantic-section-item\\:custom\\:custom-gate");
      const domainPriorityItem = getElement(container, "#settings-template-semantic-domain-priority-item");
      const semanticItems = [
        getClosestSettingsListItem(draftItem),
        getClosestSettingsListItem(customItem),
      ];

      assert.ok(semanticTree);
      assert.ok(domainPriorityItem);
      assert.equal(templatePreferencesSection?.querySelector(".settings-section-header"), null);
      assert.equal(container.querySelectorAll(".settings-view-content > .settings-section-list").length, 1);
      assert.equal(draftItem.closest(".settings-section"), semanticSection);
      assert.equal(getElement(semanticSection, ".settings-section-header .settings-title").textContent, "Rules");
      assert.ok(getElement(semanticSection, ".settings-section-header-actions .ui-actionbar"));
      assert.equal(resetButton.textContent?.trim(), "Reset");
      resetButton.click();
      assert.equal(resetCount, 1);
      assert.equal(newButton.textContent?.trim(), "New");
      newButton.click();
      assert.equal(createCount, 1);
      assert.equal(container.querySelector("#settings-template-semantic-library-item"), null);
      assert.equal(container.querySelector(".ui-list__row"), null);
      assert.equal(draftItem.closest(".settings-composite-child"), null);
      assert.equal(container.querySelector("#settings-template-semantic-recommended-terms-item"), null);
      assert.equal(semanticItems[0]!.parentElement, semanticItems[1]!.parentElement);
      assert.equal(semanticItems[1]!.previousElementSibling, semanticItems[0]);
      assert.deepEqual(
        semanticItems.map(item => item.dataset.groupId),
        [
          "settings-template-semantic-library",
          "settings-template-semantic-library",
        ],
      );
      assert.equal(semanticItems[0]!.classList.contains("settings-list-item--first"), true);
      assert.equal(semanticItems[0]!.classList.contains("settings-list-item--last"), false);
      assert.equal(semanticItems[1]!.classList.contains("settings-list-item--first"), false);
      assert.equal(semanticItems[1]!.classList.contains("settings-list-item--last"), true);
      assert.equal(draftItem.classList.contains("settings-list-item-cell--vertical"), true);
      assert.equal(customItem.classList.contains("settings-list-item-cell--vertical"), true);
      assert.equal(draftItem.querySelectorAll(".inputbox_widget").length, 2);
      assert.equal(getSemanticRuleInput(draftItem, "Domain scope, for example iv").value, "");
      assert.equal(getSemanticRuleInput(draftItem, "X representative").value, "");
      assert.equal(getSemanticRuleInput(draftItem, "Y representative").value, "");
      assert.equal(getSemanticRuleSourceText(draftItem), "User");
      assert.equal(getSemanticRuleActionNames(draftItem).includes("Remove domain rule"), true);
      assert.equal(draftItem.querySelectorAll(".settings-template-semantic-axis-field .settings-label").length, 0);
      assert.ok(draftItem.textContent?.includes("Vg"));
      assert.ok(draftItem.textContent?.includes("Id"));
      assert.equal(customItem.classList.contains("settings-list-item-cell--editable-display"), false);
      assert.equal(getSemanticRuleInput(customItem, "Domain scope, for example iv").readOnly, false);
      assert.equal(getSemanticRuleInput(customItem, "X representative").hidden, false);
      assert.equal(getSemanticRuleSourceText(customItem), "User");
      assert.equal(getSemanticRuleActionNames(customItem).includes("Remove domain rule iv"), true);
      assert.equal(getSemanticRuleActionNames(customItem).includes("Cancel"), false);
      assert.equal(getSemanticRuleActionNames(customItem).includes("Done"), false);
      assert.ok(customItem.textContent?.includes("Custom Gate"));
      assert.ok(customItem.textContent?.includes("Id"));
    }
    finally {
      view.dispose();
      container.remove();
    }
  });

  test("renders built-in semantic rule source as home", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const view = new SettingsView(container, createSettingsViewOptions({
      activeSettingsSection: "template",
      templateSettings: {
        semanticSectionItems: [
          {
            id: "settings-template-semantic-section-item:builtin:builtin-domain:iv",
            isSaving: false,
            ruleId: "builtin-domain:iv",
            source: "builtin",
            title: "iv",
            xDraft: "",
            xTerms: ["Vg"],
            yDraft: "",
            yTerms: ["Id"],
          },
        ],
      },
    }));

    try {
      const builtinItem = getElement(container, "#settings-template-semantic-section-item\\:builtin\\:builtin-domain\\:iv");
      assert.equal(getSemanticRuleSourceText(builtinItem), "Home");
    }
    finally {
      view.dispose();
      container.remove();
    }
  });

  test("commits a semantic term once when Enter is followed by blur", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const addCalls: string[] = [];
    const itemId = "settings-template-semantic-section-item:draft:2";
    const view = new SettingsView(container, createSettingsViewOptions({
      activeSettingsSection: "template",
      templateSettings: {
        onAddSemanticSectionItemTerm: (id, axis, value) => {
          addCalls.push(`${id}:${axis}:${value}`);
        },
        semanticSectionItems: [
          {
            id: itemId,
            isSaving: false,
            ruleId: "draft-2",
            source: "draft",
            title: "frequency",
            xDraft: "",
            xTerms: ["Frequency"],
            yDraft: "",
            yTerms: ["Capacitance"],
          },
        ],
      },
    }));

    try {
      const input = getSemanticRuleInput(container, "X representative");
      input.value = "Overlay";
      input.dispatchEvent(new globalThis.Event("input", { bubbles: true }));
      input.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Enter" }));
      input.dispatchEvent(new FocusEvent("blur", { bubbles: true }));

      assert.deepEqual(addCalls, [`${itemId}:x:Overlay`]);
    }
    finally {
      view.dispose();
      container.remove();
    }
  });

  test("prepends a new semantic draft item without replacing existing sibling items", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const firstItem = {
      id: "settings-template-semantic-section-item:draft:first" as const,
      isSaving: false,
      ruleId: "first",
      source: "draft" as const,
      title: "First",
      xDraft: "",
      xTerms: ["Vg"],
      yDraft: "",
      yTerms: ["Id"],
    };
    const secondItem = {
      id: "settings-template-semantic-section-item:draft:second" as const,
      isSaving: false,
      ruleId: "second",
      source: "draft" as const,
      title: "Second",
      xDraft: "",
      xTerms: ["Vd"],
      yDraft: "",
      yTerms: ["Id2"],
    };
    const view = new SettingsView(container, createSettingsViewOptions({
      activeSettingsSection: "template",
      templateSettings: {
        semanticSectionItems: [firstItem],
      },
    }));

    try {
      view.update(createSettingsViewOptions({
        activeSettingsSection: "template",
        templateSettings: {
          semanticSectionItems: [secondItem, firstItem],
        },
      }), {
        type: "partial",
        descriptorIds: ["template-semantic-library"],
        itemTargets: [],
      });

      const secondElement = getElement(container, "#settings-template-semantic-section-item\\:draft\\:second");
      const nextFirstElement = getElement(container, "#settings-template-semantic-section-item\\:draft\\:first");
      assert.equal(getClosestSettingsListItem(nextFirstElement).previousElementSibling, getClosestSettingsListItem(secondElement));
      assert.equal(getSemanticRuleInput(secondElement, "Domain scope, for example iv").value, "Second");
    }
    finally {
      view.dispose();
      container.remove();
    }
  });

  test("patches semantic domain priority item", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const domainPriorityItems = [
      {
        id: "domain-iv",
        source: "custom" as const,
        title: "iv",
        xTerms: ["Vg"],
        yTerms: ["Id"],
      },
      {
        id: "domain-cv",
        source: "builtin" as const,
        title: "cv",
        xTerms: ["Vg"],
        yTerms: ["Cp"],
      },
      {
        id: "domain-frequency",
        source: "builtin" as const,
        title: "frequency",
        xTerms: ["Frequency"],
        yTerms: ["Cp"],
      },
    ];
    const removedPriorityItems: string[] = [];
    const view = new SettingsView(container, createSettingsViewOptions({
      activeSettingsSection: "template",
      templateSettings: {
        domainPriorityItems: domainPriorityItems.slice(0, 2),
        onRemoveSemanticDomainPriorityItem: (id, source) => {
          removedPriorityItems.push(`${source}:${id}`);
        },
      },
    }));

    try {
      const priorityItem = getElement(container, "#settings-template-semantic-domain-priority-item");
      assert.equal(priorityItem.classList.contains("inputbox_widget"), true);
      assert.equal(priorityItem.parentElement?.classList.contains("settings-list-item-body"), true);
      assert.ok(priorityItem.closest(".settings-list-item"));
      assert.equal(priorityItem.closest(".settings-section")?.id, "settings-template-domain-priority-section");
      const priorityLabels = getInputBoxItemLabels(priorityItem);
      getInputBoxItemAction(priorityItem, "Remove domain iv").click();
      getInputBoxItemAction(priorityItem, "Remove domain cv").click();
      assert.deepEqual(removedPriorityItems, [
        "custom:domain-iv",
        "builtin:domain-cv",
      ]);

      view.update(createSettingsViewOptions({
        activeSettingsSection: "template",
        templateSettings: {
          domainPriorityItems: domainPriorityItems.slice(1),
          onRemoveSemanticDomainPriorityItem: (id, source) => {
            removedPriorityItems.push(`${source}:${id}`);
          },
        },
      }), {
        type: "partial",
        descriptorIds: [],
        itemTargets: [{
          descriptorId: "template-domain-priority",
          itemIds: ["settings-template-semantic-domain-priority-item"],
        }],
      });

      const nextPriorityItem = getElement(container, "#settings-template-semantic-domain-priority-item");
      assert.equal(nextPriorityItem.classList.contains("inputbox_widget"), true);
      assert.equal(nextPriorityItem.parentElement?.classList.contains("settings-list-item-body"), true);
      assert.ok(nextPriorityItem.closest(".settings-list-item"));
      assert.equal(nextPriorityItem.closest(".settings-section")?.id, "settings-template-domain-priority-section");
      const nextPriorityLabels = getInputBoxItemLabels(nextPriorityItem);
      assert.ok(nextPriorityLabels.join("\n") !== priorityLabels.join("\n"));
      assert.equal(nextPriorityLabels.includes("iv"), false);
      assert.equal(nextPriorityLabels.includes("frequency"), true);
      assert.deepEqual(
        nextPriorityLabels,
        ["cv", "frequency"],
      );
    }
    finally {
      view.dispose();
      container.remove();
    }
  });

  test("opens user guide modal from about section", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const view = new SettingsView(container, createSettingsViewOptions({ activeSettingsSection: "about" }));

    try {
      getButton(container, "settings-user-guide-show-btn").click();

      const dialog = document.querySelector<HTMLElement>("#settings-user-guide-dialog");
      assert.ok(dialog);
      assert.equal(dialog.getAttribute("role"), "dialog");
      assert.ok(dialog.textContent?.includes("Conductor Studio"));
      assert.ok(dialog.querySelector(".settings-markdown h1"));
      assert.ok(dialog.querySelector(".modal_body--scroll.settings-document-modal__body"));

      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
      assert.equal(document.querySelector("#settings-user-guide-dialog"), null);
    }
    finally {
      view.dispose();
      container.remove();
    }
  });

  test("renders settings markdown as safe DOM", () => {
    const root = renderWorkbenchMarkdown(`# Title

Paragraph with **strong text**, *emphasis*, \`code\`, [safe](https://example.com), [relative](docs/release.md), and [unsafe](javascript:alert(1)).

![Alt text](https://example.com/image.png)
![Bad image](data:image/svg+xml;base64,AAAA)

| Content | Status |
| --- | --- |
| Tables | Supported |

@[video](https://example.com/demo.mp4 "Demo video")

<script>alert(1)</script>`);

    assert.equal(root.querySelector("h1")?.textContent, "Title");
    assert.equal(root.querySelector("strong")?.textContent, "strong text");
    assert.equal(root.querySelector("em")?.textContent, "emphasis");
    assert.equal(root.querySelector("code")?.textContent, "code");
    assert.equal(root.querySelector("a")?.getAttribute("href"), "https://example.com");
    assert.equal(root.querySelectorAll("a").length, 1);
    assert.ok(root.textContent?.includes("relative"));
    assert.equal(root.querySelector("img")?.getAttribute("src"), "https://example.com/image.png");
    assert.equal(root.querySelectorAll("img").length, 1);
    assert.equal(root.querySelector("video source")?.getAttribute("src"), "https://example.com/demo.mp4");
    assert.equal(root.querySelector("video")?.getAttribute("preload"), "metadata");
    assert.ok(root.textContent?.includes("Demo video"));
    assert.equal(root.querySelector("script"), null);
    assert.ok(root.textContent?.includes("<script>alert(1)</script>"));
  });
});

function getButton(container: HTMLElement, id: string): HTMLButtonElement {
  const button = container.querySelector<HTMLButtonElement>(`#${id}`);
  assert.ok(button, `Expected button #${id}.`);
  return button;
}

function getButtonByAriaLabel(container: HTMLElement, ariaLabel: string): HTMLButtonElement {
  const button = container.querySelector<HTMLButtonElement>(`button[aria-label="${ariaLabel}"]`);
  assert.ok(button, `Expected button with aria-label ${ariaLabel}.`);
  return button;
}

function getBadgeColorSwatch(container: HTMLElement, color: string): HTMLButtonElement {
  const button = container.querySelector<HTMLButtonElement>(`.settings-badge-color-swatch[data-color="${color}"]`);
  assert.ok(button, `Expected badge color swatch ${color}.`);
  return button;
}

function getBackgroundResetButton(container: HTMLElement): HTMLButtonElement {
  const button = container.querySelector<HTMLButtonElement>("#settings-background-item .settings-reset-button");
  assert.ok(button, "Expected background reset button.");
  return button;
}

function getInput(container: HTMLElement, id: string): HTMLInputElement {
  const input = container.querySelector<HTMLInputElement>(`#${id}`);
  assert.ok(input, `Expected input #${id}.`);
  return input;
}

function getElement(container: HTMLElement, selector: string): HTMLElement {
  const element = container.querySelector<HTMLElement>(selector);
  assert.ok(element, `Expected element ${selector}.`);
  return element;
}

function getClosestSettingsListItem(element: HTMLElement): HTMLElement {
  const item = element.closest(".settings-list-item") as HTMLElement | null;
  assert.ok(item, `Expected settings list item for #${element.id}.`);
  return item;
}

function getSemanticRuleInput(container: HTMLElement, placeholder: string): HTMLInputElement {
  const input = Array.from(container.querySelectorAll<HTMLInputElement>(".settings-template-semantic-rule-input input.inputbox_native"))
    .find(input => input.placeholder === placeholder);
  assert.ok(input, `Expected semantic rule input ${placeholder}.`);
  return input;
}

function getSemanticRuleActionNames(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll<HTMLButtonElement>(".settings-template-semantic-rule-action"))
    .map(button => button.getAttribute("aria-label") ?? "");
}

function getSemanticRuleSourceText(container: HTMLElement): string {
  const source = container.querySelector<HTMLElement>(".settings-template-semantic-rule-source");
  assert.ok(source, "Expected semantic rule source label.");
  return source.textContent ?? "";
}

function getInputBoxItemLabels(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll<HTMLElement>(".inputbox_widget_item_label"))
    .map(label => label.textContent ?? "");
}

function getInputBoxItemAction(container: HTMLElement, ariaLabel: string): HTMLButtonElement {
  const button = container.querySelector<HTMLButtonElement>(`.inputbox_widget_item_action[aria-label="${ariaLabel}"]`);
  assert.ok(button, `Expected input box item action ${ariaLabel}.`);
  return button;
}

function getSelectLabel(button: HTMLButtonElement): string {
  const label = button.querySelector<HTMLElement>(".ui-selectbox__label");
  assert.ok(label);
  return label.textContent ?? "";
}

function createSettingsViewOptions(overrides: SettingsViewOptionOverrides = {}): SettingsViewOptions {
  const base: SettingsViewOptions = {
    activeSettingsSection: "appearance",
    appearanceSettings: {
      backgroundColor: "#ffffff",
      backgroundColorDefault: "#ffffff",
      backgroundColorOptions: ["#ffffff", "#111827"],
      explorerDensity: "default",
      explorerDensityOptions: [{ label: "Default", value: "default" }],
      explorerBadgeColors: {
        cf: "cyan",
        cv: "purple",
        mixed: "neutral",
        output: "green",
        pv: "red",
        transfer: "blue",
        unknown: "orange",
      },
      explorerBadgeColorLabels: [
        { label: "transfer", value: "transfer" },
        { label: "output", value: "output" },
        { label: "cv", value: "cv" },
        { label: "cf", value: "cf" },
        { label: "pv", value: "pv" },
        { label: "mixed", value: "mixed" },
        { label: "Unknown", value: "unknown" },
      ],
      explorerBadgeColorOptions: [
        { label: "Neutral", value: "neutral" },
        { label: "Blue", value: "blue" },
        { label: "Green", value: "green" },
        { label: "Purple", value: "purple" },
        { label: "Orange", value: "orange" },
        { label: "Red", value: "red" },
        { label: "Cyan", value: "cyan" },
      ],
      isExplorerBadgeColorSaving: false,
      isExplorerBadgeSaving: false,
      isExplorerDensitySaving: false,
      isSaving: false,
      showExplorerBadges: true,
      transparentChrome: true,
      onBackgroundColorChange: noop,
      onBackgroundColorReset: noop,
      onExplorerBadgeColorChange: noop,
      onExplorerBadgeVisibilityChange: noop,
      onExplorerDensityChange: noop,
      onTransparentChromeChange: noop,
    },
    appUpdateChecking: false,
    appUpdateSettings: {
      currentVersion: "0.0.0",
      isAvailable: false,
    },
    axisTitleFontSizeDraft: "22",
    chartDefaultSettings: {
      axisTitleFontSize: 22,
      defaultYScaleForCf: "linear",
      defaultYScaleForCv: "linear",
      defaultYScaleForOutput: "linear",
      defaultYScaleForPv: "linear",
      defaultYScaleForTransfer: "log",
      isSaving: false,
      tickLabelFontSize: 18,
      onAxisTitleFontSizeChange: noop,
      onDefaultYScaleForCfChange: noop,
      onDefaultYScaleForCvChange: noop,
      onDefaultYScaleForOutputChange: noop,
      onDefaultYScaleForPvChange: noop,
      onDefaultYScaleForTransferChange: noop,
      onTickLabelFontSizeChange: noop,
    },
    cleanupEnabledOptions: [{ label: "Disabled", value: "false" }],
    cleanupFailedDaysOptions: [{ label: "7", value: "7" }],
    cleanupKeepSuccessOptions: [{ label: "0", value: "0" }],
    handleCheckForUpdates: noop,
    handleShowReleaseNotes: noop,
    language: "system",
    numericDisplaySettings: {
      isSaving: false,
      optimized: false,
      onOptimizedChange: noop,
    },
    onLanguageChange: noop,
    onNavigateBack: noop,
    onResetLayoutState: noop,
    onThemeChange: noop,
    originLegendFontSizeDraft: "",
    originSettings: {
      cleanupEnabled: false,
      cleanupFailedRetentionDays: 7,
      cleanupKeepSuccessJobs: 0,
      cleanupRunning: false,
      cleanupSaving: false,
      currentPath: "",
      isCleanupAvailable: false,
      isConfigurable: false,
      isHealthCheckAvailable: false,
      isHealthChecking: false,
      isLoading: false,
      isSaving: false,
      plotCommand: "",
      plotLegendFontSize: "",
      plotLineWidth: 2,
      plotPostCommandsText: "",
      plotSaving: false,
      plotType: 201,
      plotXyPairs: "",
      onCheckHealth: noop,
      onChoosePath: noop,
      onCleanupEnabledChange: noop,
      onCleanupFailedRetentionDaysChange: noop,
      onCleanupKeepSuccessJobsChange: noop,
      onPlotCommandChange: noop,
      onPlotLegendFontSizeChange: noop,
      onPlotLineWidthChange: noop,
      onPlotPostCommandsChange: noop,
      onPlotTypeChange: noop,
      onPlotXyPairsChange: noop,
      onRunCleanupNow: noop,
    },
    plotCommandDraft: "",
    postCommandsDraft: "",
    searchQuery: "",
    setActiveSettingsSection: noop,
    setAxisTitleFontSizeDraft: noop,
    setOriginLegendFontSizeDraft: noop,
    setPlotCommandDraft: noop,
    setPostCommandsDraft: noop,
    setTickLabelFontSizeDraft: noop,
    setSearchQuery: noop,
    setXyPairsDraft: noop,
    settingsSections: createSettingsSections(),
    tableColumnWidthSettings: {
      autoFitEnabled: false,
      isSaving: false,
      onAutoFitChange: noop,
    },
    tableTemplateVisualizationSettings: {
      enabled: false,
      isSaving: false,
      onEnabledChange: noop,
    },
    templateSettings: {
      domainPriorityItems: [],
      isSaving: false,
      onAddSemanticSectionItemTerm: noop,
      onCommitSemanticSectionItemTitle: noop,
      onCreateSemanticSectionItem: noop,
      onMoveSemanticDomainPriority: noop,
      onRemoveSemanticDomainPriorityItem: noop,
      onRemoveSemanticSectionItem: noop,
      onRemoveSemanticSectionItemTerm: noop,
      onResetSemanticDomainRules: noop,
      onUpdateSemanticSectionItemDraft: noop,
      pendingActionItemId: null,
      semanticSectionItems: [],
    },
    theme: "system",
    themeModeOptions: [{ label: "System", value: "system" }],
    tickLabelFontSizeDraft: "18",
    windowCloseBehaviorOptions: [{ label: "Quit", value: "quit" }],
    windowCloseSettings: {
      behavior: "quit",
      isSaving: false,
      onBehaviorChange: noop,
    },
    xyPairsDraft: "",
    yScaleOptions: [
      { label: "Linear", value: "linear" },
      { label: "Log", value: "log" },
    ],
  };

  return {
    ...base,
    ...overrides,
    appearanceSettings: {
      ...base.appearanceSettings,
      ...overrides.appearanceSettings,
    },
    chartDefaultSettings: {
      ...base.chartDefaultSettings,
      ...overrides.chartDefaultSettings,
    },
    originSettings: {
      ...base.originSettings,
      ...overrides.originSettings,
    },
    templateSettings: {
      ...base.templateSettings,
      ...overrides.templateSettings,
    },
  };
}
