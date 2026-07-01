import assert from "assert";

import { renderWorkbenchMarkdown } from "src/cs/workbench/browser/markdownRenderer";
import { SettingsView, type SettingsContentItemTarget, type SettingsViewOptions } from "src/cs/workbench/contrib/settings/browser/settingsView";
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
      const tree = getElement(container, ".settings-view-content > .settings-tree");
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
        itemTargets: [{ descriptorId: "general-preferences", itemIds: ["settings-close-behavior-card", "settings-numeric-display-card"] }],
      });

      assert.equal(getElement(container, ".settings-view-content"), content);
      assert.equal(getElement(container, ".settings-view-content > .settings-tree"), tree);
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

  test("patches a targeted item without replacing sibling content", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const view = new SettingsView(container, createSettingsViewOptions({ activeSettingsSection: "general" }));

    try {
      const content = getElement(container, ".settings-view-content");
      const tree = getElement(container, ".settings-view-content > .settings-tree");
      const languageSelect = getButton(container, "settings-language-dropdown");
      const numericDisplaySwitch = getButton(container, "settings-numeric-display-toggle");
      const transferScaleSelect = getButton(container, "settings-default-transfer-y-scale-select");
      const outputScaleSelect = getButton(container, "settings-default-output-y-scale-select");
      const chartDefaultsCard = getElement(container, "#settings-chart-defaults-card");

      view.update(createSettingsViewOptions({
        activeSettingsSection: "general",
        chartDefaultSettings: {
          defaultYScaleForTransfer: "linear",
        },
      }), {
        type: "partial",
        descriptorIds: [],
        itemTargets: [{ descriptorId: "chart-defaults", itemIds: ["settings-default-transfer-y-scale-card"] }],
      });

      const nextTransferScaleSelect = getButton(container, "settings-default-transfer-y-scale-select");
      assert.equal(getElement(container, ".settings-view-content"), content);
      assert.equal(getElement(container, ".settings-view-content > .settings-tree"), tree);
      assert.equal(getButton(container, "settings-language-dropdown"), languageSelect);
      assert.equal(getButton(container, "settings-numeric-display-toggle"), numericDisplaySwitch);
      assert.equal(getButton(container, "settings-default-output-y-scale-select"), outputScaleSelect);
      assert.equal(getElement(container, "#settings-chart-defaults-card"), chartDefaultsCard);
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
        itemTargets: [{ descriptorId: "chart-defaults", itemIds: ["settings-chart-defaults-card"] }],
      });

      assert.equal(getElement(container, "#settings-chart-defaults-card"), chartDefaultsCard);
      assert.equal(getInput(container, "settings-default-title-font-size-input"), titleFontSizeInput);
      assert.equal(titleFontSizeInput.value, "24");
      assert.equal(titleFontSizeInput.disabled, true);
    }
    finally {
      view.dispose();
      container.remove();
    }
  });

  test("patches a targeted tree element card without replacing sibling cards", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const view = new SettingsView(container, createSettingsViewOptions({ activeSettingsSection: "origin" }));

    try {
      const pathCard = getElement(container, "#settings-origin-path-card");
      const pathInput = getInput(container, "settings-origin-path-value-input");
      const cleanupCard = getElement(container, "#settings-origin-cleanup-card");
      const plotCard = getElement(container, "#settings-origin-plot-card");

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
        itemTargets: [{ descriptorId: "origin-integration", itemIds: ["settings-origin-path-card"] }],
      });

      assert.equal(getElement(container, "#settings-origin-path-card"), pathCard);
      assert.equal(getInput(container, "settings-origin-path-value-input"), pathInput);
      assert.equal(getElement(container, "#settings-origin-cleanup-card"), cleanupCard);
      assert.equal(getElement(container, "#settings-origin-plot-card"), plotCard);
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
        itemTargets: [{ descriptorId: "appearance-preferences", itemIds: ["settings-theme-card", "settings-explorer-density-card", "settings-explorer-badge-colors-card", "settings-background-card"] }],
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
        itemTargets: [{ descriptorId: "appearance-preferences", itemIds: ["settings-explorer-badges-card", "settings-transparent-chrome-card"] }],
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

  test("renders template section in a single settings tree with semantic library as grouped items", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const view = new SettingsView(container, createSettingsViewOptions({
      activeSettingsSection: "template",
      templateSettings: {
        activeTerms: [
          {
            id: "builtin-vgs",
            term: "Vgs",
            canonicalRole: "vg",
            canonicalUnit: "V",
            axisTendency: "x",
            family: "iv",
            ivMode: "transfer",
            domainPackIds: ["semiconductor-ivcv"],
            source: "builtin",
          },
          {
            id: "custom-gate",
            term: "Custom Gate",
            canonicalRole: "vg",
            canonicalUnit: "V",
            axisTendency: "x",
            enabled: true,
            source: "custom",
          },
        ],
        customTerms: [
          {
            id: "custom-gate",
            term: "Custom Gate",
            canonicalRole: "vg",
            canonicalUnit: "V",
            axisTendency: "x",
            enabled: true,
          },
        ],
        disabledBuiltinTermIds: ["builtin-id"],
        builtinTerms: [
          {
            id: "builtin-vgs",
            term: "Vgs",
            canonicalRole: "vg",
            canonicalUnit: "V",
            axisTendency: "x",
            family: "iv",
            ivMode: "transfer",
            domainPackIds: ["semiconductor-ivcv"],
          },
          {
            id: "builtin-id",
            term: "Drain Current",
            canonicalRole: "id",
            canonicalUnit: "A",
            axisTendency: "dependent",
            family: "iv",
            ivMode: "transfer",
            domainPackIds: ["semiconductor-ivcv"],
          },
        ],
      },
    }));

    try {
      const templateLibraryTree = getElement(container, "#settings-template-domain-packs-card").closest(".settings-tree");
      const semanticHeader = getElement(container, "#settings-template-semantic-library-header");
      const activeTermsCard = getElement(container, "#settings-template-semantic-active-terms-card");
      const recommendedTermsCard = getElement(container, "#settings-template-semantic-recommended-terms-card");
      const customFormCard = getElement(container, "#settings-template-semantic-custom-form-card");
      const semanticTree = semanticHeader.closest(".settings-tree");
      const semanticRows = [
        getClosestSettingsTreeItem(semanticHeader),
        getClosestSettingsTreeItem(activeTermsCard),
        getClosestSettingsTreeItem(recommendedTermsCard),
        getClosestSettingsTreeItem(customFormCard),
      ];
      const widgets = activeTermsCard.querySelectorAll<HTMLElement>(".inputbox_widget");
      const activeWidget = widgets[0];
      const recommendedSuggestion = recommendedTermsCard.querySelector<HTMLElement>(".settings-template-term-suggestion");

      assert.ok(templateLibraryTree);
      assert.ok(semanticTree);
      assert.ok(activeWidget);
      assert.ok(recommendedSuggestion);
      assert.equal(container.querySelectorAll(".settings-view-content > .settings-tree").length, 1);
      assert.equal(semanticTree, templateLibraryTree);
      assert.equal(templateLibraryTree.querySelector("#settings-template-semantic-library-header"), semanticHeader);
      assert.equal(container.querySelector("#settings-template-semantic-library-card"), null);
      assert.equal(container.querySelector(".ui-list__row"), null);
      assert.equal(semanticHeader.closest(".settings-tree-composite-child"), null);
      assert.equal(activeTermsCard.closest(".settings-tree-composite-child"), null);
      assert.equal(semanticRows[0]!.parentElement, semanticRows[1]!.parentElement);
      assert.equal(semanticRows[1]!.previousElementSibling, semanticRows[0]);
      assert.equal(semanticRows[2]!.previousElementSibling, semanticRows[1]);
      assert.equal(semanticRows[3]!.previousElementSibling, semanticRows[2]);
      assert.deepEqual(
        semanticRows.map(row => row.dataset.groupId),
        [
          "settings-template-semantic-library",
          "settings-template-semantic-library",
          "settings-template-semantic-library",
          "settings-template-semantic-library",
        ],
      );
      assert.equal(semanticRows[0]!.classList.contains("settings-tree-item--first"), true);
      assert.equal(semanticRows[0]!.classList.contains("settings-tree-item--last"), false);
      assert.equal(semanticRows[1]!.classList.contains("settings-tree-item--first"), false);
      assert.equal(semanticRows[3]!.classList.contains("settings-tree-item--last"), true);
      assert.equal(container.querySelector("#settings-template-semantic-custom-terms-card"), null);
      assert.equal(container.querySelector("#settings-template-semantic-term-input-card"), null);
      assert.equal(semanticHeader.querySelector(".inputbox_widget"), null);
      assert.equal(widgets.length, 1);
      assert.equal(activeWidget.querySelectorAll(".inputbox_widget_item").length, 2);
      assert.equal(activeWidget.querySelector<HTMLElement>('.inputbox_widget_item[data-kind="builtin-enabled"] .inputbox_widget_item_label')?.textContent, "Vgs");
      assert.equal(activeWidget.querySelector<HTMLElement>('.inputbox_widget_item[data-kind="custom"] .inputbox_widget_item_label')?.textContent, "Custom Gate");
      assert.equal(activeWidget.querySelector<HTMLInputElement>("input.inputbox_native:not([hidden])")?.placeholder, "Add match term");
      assert.equal(activeTermsCard.querySelector("#settings-template-semantic-add-button"), null);
      assert.equal(recommendedTermsCard.querySelectorAll(".settings-template-term-suggestion").length, 1);
      assert.equal(recommendedSuggestion.querySelector<HTMLElement>(".settings-template-term-suggestion-label")?.textContent, "Drain Current");
      assert.ok(customFormCard.querySelector("#settings-template-semantic-role-select"));
      assert.equal(customFormCard.querySelector("#settings-template-semantic-policy-select"), null);
      assert.equal(customFormCard.querySelector("#settings-template-semantic-add-button"), null);
      assert.equal(customFormCard.querySelector("#settings-template-semantic-term-input"), null);
    }
    finally {
      view.dispose();
      container.remove();
    }
  });

  test("patches semantic term lists without replacing header or custom form", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const builtinTerms = [
      {
        id: "builtin-vgs",
        term: "Vgs",
        canonicalRole: "vg" as const,
        canonicalUnit: "V" as const,
        axisTendency: "x" as const,
        family: "iv" as const,
        ivMode: "transfer" as const,
        domainPackIds: ["semiconductor-ivcv"],
      },
      {
        id: "builtin-id",
        term: "Drain Current",
        canonicalRole: "id" as const,
        canonicalUnit: "A" as const,
        axisTendency: "dependent" as const,
        family: "iv" as const,
        ivMode: "transfer" as const,
        domainPackIds: ["semiconductor-ivcv"],
      },
    ];
    const view = new SettingsView(container, createSettingsViewOptions({
      activeSettingsSection: "template",
      templateSettings: {
        activeTerms: [{ ...builtinTerms[0]!, source: "builtin" }],
        builtinTerms,
        disabledBuiltinTermIds: ["builtin-id"],
      },
    }));

    try {
      const semanticHeader = getElement(container, "#settings-template-semantic-library-header");
      const activeTermsCard = getElement(container, "#settings-template-semantic-active-terms-card");
      const recommendedTermsCard = getElement(container, "#settings-template-semantic-recommended-terms-card");
      const customFormCard = getElement(container, "#settings-template-semantic-custom-form-card");
      const previousActiveWidget = getElement(activeTermsCard, ".inputbox_widget");
      const previousActiveInput = getElement(previousActiveWidget, "input.inputbox_native");
      const previousActiveTerm = getElement(previousActiveWidget, '.inputbox_widget_item[data-item-id="builtin-vgs"]');
      const recommendedContent = recommendedTermsCard.firstElementChild;
      assert.ok(recommendedContent);
      let settingsTreeUpdateCount = 0;
      const viewInternals = view as unknown as {
        updateSettingsTreeItems: (target: SettingsContentItemTarget) => void;
      };
      const originalUpdateSettingsTreeItems = viewInternals.updateSettingsTreeItems;
      viewInternals.updateSettingsTreeItems = function (target: SettingsContentItemTarget): void {
        settingsTreeUpdateCount++;
        return originalUpdateSettingsTreeItems.call(this, target);
      };

      try {
        view.update(createSettingsViewOptions({
          activeSettingsSection: "template",
          templateSettings: {
            activeTerms: [
              { ...builtinTerms[0]!, source: "builtin" },
              { ...builtinTerms[1]!, source: "builtin" },
            ],
            builtinTerms,
            disabledBuiltinTermIds: [],
          },
        }), {
          type: "partial",
          descriptorIds: [],
          itemTargets: [{
            descriptorId: "template-semantic-library",
            itemIds: [
              "settings-template-semantic-active-terms-list-item",
              "settings-template-semantic-recommended-terms-list-item",
            ],
          }],
        });
      }
      finally {
        viewInternals.updateSettingsTreeItems = originalUpdateSettingsTreeItems;
      }

      const nextActiveTermsCard = getElement(container, "#settings-template-semantic-active-terms-card");
      const nextRecommendedTermsCard = getElement(container, "#settings-template-semantic-recommended-terms-card");
      const nextActiveWidget = nextActiveTermsCard.querySelector<HTMLElement>(".inputbox_widget");
      const nextActiveInput = nextActiveTermsCard.querySelector<HTMLElement>("input.inputbox_native");
      const nextRecommendedContent = nextRecommendedTermsCard.firstElementChild;
      assert.ok(nextActiveWidget);
      assert.ok(nextActiveInput);
      assert.equal(container.querySelector("#settings-template-semantic-library-card"), null);
      assert.equal(getElement(container, "#settings-template-semantic-library-header"), semanticHeader);
      assert.equal(nextActiveTermsCard, activeTermsCard);
      assert.equal(nextRecommendedTermsCard, recommendedTermsCard);
      assert.equal(nextActiveWidget, previousActiveWidget);
      assert.equal(nextActiveInput, previousActiveInput);
      assert.equal(getElement(nextActiveWidget, '.inputbox_widget_item[data-item-id="builtin-vgs"]'), previousActiveTerm);
      assert.equal(container.querySelector("#settings-template-semantic-term-input-card"), null);
      assert.equal(nextRecommendedContent, recommendedContent);
      assert.equal(getElement(container, "#settings-template-semantic-custom-form-card"), customFormCard);
      assert.equal(nextActiveWidget.querySelectorAll(".inputbox_widget_item").length, 2);
      assert.equal(nextRecommendedTermsCard.querySelectorAll(".settings-template-term-suggestion").length, 0);
      assert.equal(settingsTreeUpdateCount, 0);
    }
    finally {
      view.dispose();
      container.remove();
    }
  });

  test("updates semantic header as a tree item while patching active terms locally", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const builtinTerms = [
      {
        id: "builtin-vgs",
        term: "Vgs",
        canonicalRole: "vg" as const,
        canonicalUnit: "V" as const,
        axisTendency: "x" as const,
        family: "iv" as const,
        ivMode: "transfer" as const,
        domainPackIds: ["semiconductor-ivcv"],
      },
      {
        id: "builtin-id",
        term: "Drain Current",
        canonicalRole: "id" as const,
        canonicalUnit: "A" as const,
        axisTendency: "dependent" as const,
        family: "iv" as const,
        ivMode: "transfer" as const,
        domainPackIds: ["semiconductor-ivcv"],
      },
    ];
    const view = new SettingsView(container, createSettingsViewOptions({
      activeSettingsSection: "template",
      templateSettings: {
        activeTerms: [{ ...builtinTerms[0]!, source: "builtin" }],
        builtinTerms,
        disabledBuiltinTermIds: ["builtin-id"],
      },
    }));

    try {
      const activeTermsCard = getElement(container, "#settings-template-semantic-active-terms-card");
      const semanticHeader = getElement(container, "#settings-template-semantic-library-header");
      const semanticHeaderRow = getClosestSettingsTreeItem(semanticHeader);
      const previousActiveWidget = getElement(activeTermsCard, ".inputbox_widget");
      const previousActiveInput = getElement(previousActiveWidget, "input.inputbox_native");
      const treeTargets: SettingsContentItemTarget[] = [];
      const viewInternals = view as unknown as {
        updateSettingsTreeItems: (target: SettingsContentItemTarget) => void;
      };
      const originalUpdateSettingsTreeItems = viewInternals.updateSettingsTreeItems;
      viewInternals.updateSettingsTreeItems = function (target: SettingsContentItemTarget): void {
        treeTargets.push(target);
        return originalUpdateSettingsTreeItems.call(this, target);
      };

      try {
        view.update(createSettingsViewOptions({
          activeSettingsSection: "template",
          templateSettings: {
            activeTerms: [
              { ...builtinTerms[0]!, source: "builtin" },
              { ...builtinTerms[1]!, source: "builtin" },
            ],
            builtinTerms,
            disabledBuiltinTermIds: [],
          },
        }), {
          type: "partial",
          descriptorIds: [],
          itemTargets: [{
            descriptorId: "template-semantic-library",
            itemIds: [
              "settings-template-semantic-library-header",
              "settings-template-semantic-active-terms-list-item",
            ],
          }],
        });
      }
      finally {
        viewInternals.updateSettingsTreeItems = originalUpdateSettingsTreeItems;
      }

      const nextActiveTermsCard = getElement(container, "#settings-template-semantic-active-terms-card");
      const nextSemanticHeader = getElement(container, "#settings-template-semantic-library-header");
      const nextActiveWidget = getElement(nextActiveTermsCard, ".inputbox_widget");
      const nextActiveInput = getElement(nextActiveWidget, "input.inputbox_native");
      assert.equal(nextSemanticHeader === semanticHeader, false);
      assert.equal(getClosestSettingsTreeItem(nextSemanticHeader), semanticHeaderRow);
      assert.equal(nextActiveTermsCard, activeTermsCard);
      assert.equal(nextActiveWidget, previousActiveWidget);
      assert.equal(nextActiveInput, previousActiveInput);
      assert.equal(nextActiveWidget.querySelectorAll(".inputbox_widget_item").length, 2);
      assert.deepEqual(
        treeTargets.map(target => target.itemIds),
        [["settings-template-semantic-library-header"]],
      );
    }
    finally {
      view.dispose();
      container.remove();
    }
  });

  test("patches semantic recommended terms without replacing unchanged suggestions", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const builtinTerms = [
      {
        id: "builtin-vgs",
        term: "Vgs",
        canonicalRole: "vg" as const,
        canonicalUnit: "V" as const,
        axisTendency: "x" as const,
        family: "iv" as const,
        ivMode: "transfer" as const,
        domainPackIds: ["semiconductor-ivcv"],
      },
      {
        id: "builtin-id",
        term: "Drain Current",
        canonicalRole: "id" as const,
        canonicalUnit: "A" as const,
        axisTendency: "dependent" as const,
        family: "iv" as const,
        ivMode: "transfer" as const,
        domainPackIds: ["semiconductor-ivcv"],
      },
      {
        id: "builtin-gate",
        term: "Gate Voltage",
        canonicalRole: "vg" as const,
        canonicalUnit: "V" as const,
        axisTendency: "x" as const,
        family: "iv" as const,
        ivMode: "transfer" as const,
        domainPackIds: ["semiconductor-ivcv"],
      },
    ];
    const view = new SettingsView(container, createSettingsViewOptions({
      activeSettingsSection: "template",
      templateSettings: {
        builtinTerms,
        disabledBuiltinTermIds: ["builtin-vgs", "builtin-id"],
      },
    }));

    try {
      const recommendedTermsCard = getElement(container, "#settings-template-semantic-recommended-terms-card");
      const recommendedList = getElement(recommendedTermsCard, ".settings-template-term-suggestions");
      const drainCurrent = getSemanticSuggestion(recommendedList, "Drain Current");

      view.update(createSettingsViewOptions({
        activeSettingsSection: "template",
        templateSettings: {
          builtinTerms,
          disabledBuiltinTermIds: ["builtin-id", "builtin-gate"],
        },
      }), {
        type: "partial",
        descriptorIds: [],
        itemTargets: [{
          descriptorId: "template-semantic-library",
          itemIds: ["settings-template-semantic-recommended-terms-list-item"],
        }],
      });

      assert.equal(getElement(container, "#settings-template-semantic-recommended-terms-card"), recommendedTermsCard);
      assert.equal(getElement(recommendedTermsCard, ".settings-template-term-suggestions"), recommendedList);
      assert.equal(getSemanticSuggestion(recommendedList, "Drain Current"), drainCurrent);
      assert.equal(querySemanticSuggestion(recommendedList, "Vgs"), null);
      assert.ok(getSemanticSuggestion(recommendedList, "Gate Voltage"));
      assert.deepEqual(
        Array.from(recommendedList.querySelectorAll<HTMLButtonElement>(".settings-template-term-suggestion"))
          .map(button => button.querySelector<HTMLElement>(".settings-template-term-suggestion-label")?.textContent),
        ["Drain Current", "Gate Voltage"],
      );
    }
    finally {
      view.dispose();
      container.remove();
    }
  });

  test("patches semantic custom form without replacing controls", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const view = new SettingsView(container, createSettingsViewOptions({ activeSettingsSection: "template" }));

    try {
      const customFormCard = getElement(container, "#settings-template-semantic-custom-form-card");
      const roleSelect = getButton(container, "settings-template-semantic-role-select");

      view.update(createSettingsViewOptions({
        activeSettingsSection: "template",
        templateSettings: {
          isSaving: true,
        },
      }), {
        type: "partial",
        descriptorIds: [],
        itemTargets: [{
          descriptorId: "template-semantic-library",
          itemIds: ["settings-template-semantic-custom-form-card"],
        }],
      });

      assert.equal(getElement(container, "#settings-template-semantic-custom-form-card"), customFormCard);
      assert.equal(getButton(container, "settings-template-semantic-role-select"), roleSelect);
      assert.equal(customFormCard.querySelector("#settings-template-semantic-add-button"), null);
      assert.equal(roleSelect.disabled, true);
    }
    finally {
      view.dispose();
      container.remove();
    }
  });

  test("patches semantic active terms input without replacing custom form", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const view = new SettingsView(container, createSettingsViewOptions({ activeSettingsSection: "template" }));

    try {
      const activeTermsCard = getElement(container, "#settings-template-semantic-active-terms-card");
      const activeInputWidget = getElement(activeTermsCard, ".inputbox_widget");
      const activeInput = getElement(activeInputWidget, "input.inputbox_native");
      const customFormCard = getElement(container, "#settings-template-semantic-custom-form-card");

      view.update(createSettingsViewOptions({
        activeSettingsSection: "template",
        templateSemanticTermDraft: "New Term",
        templateSettings: {
          isSaving: true,
        },
      }), {
        type: "partial",
        descriptorIds: [],
        itemTargets: [{
          descriptorId: "template-semantic-library",
          itemIds: ["settings-template-semantic-active-terms-input-item"],
        }],
      });

      assert.equal(getElement(container, "#settings-template-semantic-active-terms-card"), activeTermsCard);
      assert.equal(getElement(activeTermsCard, ".inputbox_widget"), activeInputWidget);
      assert.equal(getElement(activeInputWidget, "input.inputbox_native"), activeInput);
      assert.equal(container.querySelector("#settings-template-semantic-term-input-card"), null);
      assert.equal(container.querySelector("#settings-template-semantic-add-button"), null);
      assert.equal(getElement(container, "#settings-template-semantic-custom-form-card"), customFormCard);
      assert.equal((activeInput as HTMLInputElement).value, "New Term");
      assert.equal((activeInput as HTMLInputElement).disabled, false);
      assert.equal((activeInput as HTMLInputElement).readOnly, true);
    }
    finally {
      view.dispose();
      container.remove();
    }
  });

  test("patches only the pending semantic term action state", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const builtinTerms = [
      {
        id: "builtin-vgs",
        term: "Vgs",
        canonicalRole: "vg" as const,
        canonicalUnit: "V" as const,
        axisTendency: "x" as const,
        family: "iv" as const,
        ivMode: "transfer" as const,
        domainPackIds: ["semiconductor-ivcv"],
      },
      {
        id: "builtin-id",
        term: "Drain Current",
        canonicalRole: "id" as const,
        canonicalUnit: "A" as const,
        axisTendency: "dependent" as const,
        family: "iv" as const,
        ivMode: "transfer" as const,
        domainPackIds: ["semiconductor-ivcv"],
      },
    ];
    const activeTerms = builtinTerms.map(term => ({ ...term, source: "builtin" as const }));
    const view = new SettingsView(container, createSettingsViewOptions({
      activeSettingsSection: "template",
      templateSettings: {
        activeTerms,
        builtinTerms,
      },
    }));

    try {
      const activeTermsCard = getElement(container, "#settings-template-semantic-active-terms-card");
      const activeWidget = getElement(activeTermsCard, ".inputbox_widget");
      const vgsItem = getElement(activeWidget, '.inputbox_widget_item[data-item-id="builtin-vgs"]');
      const idItem = getElement(activeWidget, '.inputbox_widget_item[data-item-id="builtin-id"]');
      const vgsAction = getInputBoxWidgetItemAction(vgsItem);
      const idAction = getInputBoxWidgetItemAction(idItem);

      view.update(createSettingsViewOptions({
        activeSettingsSection: "template",
        templateSettings: {
          activeTerms,
          builtinTerms,
          isSaving: true,
          pendingActionItemId: "builtin-id",
        },
      }), {
        type: "partial",
        descriptorIds: [],
        itemTargets: [{
          descriptorId: "template-semantic-library",
          itemIds: ["settings-template-semantic-active-terms-list-item"],
        }],
      });

      assert.equal(getElement(container, "#settings-template-semantic-active-terms-card"), activeTermsCard);
      assert.equal(getElement(activeTermsCard, ".inputbox_widget"), activeWidget);
      assert.equal(getElement(activeWidget, '.inputbox_widget_item[data-item-id="builtin-vgs"]'), vgsItem);
      assert.equal(getElement(activeWidget, '.inputbox_widget_item[data-item-id="builtin-id"]'), idItem);
      assert.equal(getInputBoxWidgetItemAction(vgsItem), vgsAction);
      assert.equal(getInputBoxWidgetItemAction(idItem), idAction);
      assert.equal(vgsAction.disabled, false);
      assert.equal(idAction.disabled, true);
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
  const button = container.querySelector<HTMLButtonElement>("#settings-background-card .settings-reset-button");
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

function getClosestSettingsTreeItem(element: HTMLElement): HTMLElement {
  const item = element.closest(".settings-tree-item") as HTMLElement | null;
  assert.ok(item, `Expected settings tree item for #${element.id}.`);
  return item;
}

function getSemanticSuggestion(container: HTMLElement, label: string): HTMLButtonElement {
  const button = querySemanticSuggestion(container, label);
  assert.ok(button, `Expected semantic suggestion ${label}.`);
  return button;
}

function querySemanticSuggestion(container: HTMLElement, label: string): HTMLButtonElement | null {
  return Array.from(container.querySelectorAll<HTMLButtonElement>(".settings-template-term-suggestion"))
    .find(button => button.querySelector<HTMLElement>(".settings-template-term-suggestion-label")?.textContent === label) ?? null;
}

function getInputBoxWidgetItemAction(item: HTMLElement): HTMLButtonElement {
  const button = item.querySelector<HTMLButtonElement>(".inputbox_widget_item_action");
  assert.ok(button);
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
    fileNameFieldSeparatorsDraft: "_",
    fileNameMatchingSettings: {
      fieldSeparators: "_",
      isSaving: false,
      onFieldSeparatorsChange: noop,
    },
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
    setFileNameFieldSeparatorsDraft: noop,
    setOriginLegendFontSizeDraft: noop,
    setPlotCommandDraft: noop,
    setPostCommandsDraft: noop,
    setTemplateSemanticTermDraft: noop,
    setTemplateSemanticAxisDraft: noop,
    setTemplateSemanticIvModeDraft: noop,
    setTemplateSemanticRoleDraft: noop,
    setTemplateSemanticUnitDraft: noop,
    setTickLabelFontSizeDraft: noop,
    setSearchQuery: noop,
    setXyPairsDraft: noop,
    settingsSections: createSettingsSections(),
    tableTemplateVisualizationSettings: {
      enabled: false,
      isSaving: false,
      onEnabledChange: noop,
    },
    templateSemanticTermDraft: "",
    templateSemanticAxisDraft: "x",
    templateSemanticIvModeDraft: "",
    templateSemanticRoleDraft: "voltage",
    templateSemanticUnitDraft: "",
    templateSettings: {
      activeTerms: [],
      customTerms: [],
      axisOptions: [{ label: "X", value: "x" }],
      builtinTerms: [],
      builtinDomainPacks: [],
      disabledBuiltinTermIds: [],
      disabledDomainPackIds: [],
      isSaving: false,
      ivModeOptions: [{ label: "none", value: "" }],
      onAddSemanticTerm: noop,
      onDisableBuiltinTerm: noop,
      onDisableDomainPack: noop,
      onEnableBuiltinTerm: noop,
      onEnableDomainPack: noop,
      onMoveXAxisIntent: noop,
      onRemoveSemanticTerm: noop,
      pendingActionItemId: null,
      roleOptions: [{ label: "voltage", value: "voltage" }],
      unitOptions: [{ label: "none", value: "" }],
      xAxisIntentPriority: ["genericXY"],
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
