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

const idleFeedback = {
  message: "",
  type: "idle" as const,
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

      assert.equal(getButton(container, "settings-language-dropdown"), languageSelect);
      const nextCloseBehaviorSelect = getButton(container, "settings-close-behavior-dropdown");
      const nextNumericDisplaySwitch = getButton(container, "settings-numeric-display-toggle");
      assert.ok(nextCloseBehaviorSelect !== closeBehaviorSelect);
      assert.ok(nextNumericDisplaySwitch !== numericDisplaySwitch);
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
      assert.equal(getButton(container, "settings-language-dropdown"), languageSelect);
      assert.equal(getButton(container, "settings-numeric-display-toggle"), numericDisplaySwitch);
      assert.equal(getButton(container, "settings-default-output-y-scale-select"), outputScaleSelect);
      assert.equal(getElement(container, "#settings-chart-defaults-card"), chartDefaultsCard);
      assert.ok(nextTransferScaleSelect !== transferScaleSelect);
      assert.equal(getSelectLabel(nextTransferScaleSelect), "Linear");
      assert.equal(nextTransferScaleSelect.disabled, false);
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

      assert.ok(getElement(container, "#settings-origin-path-card") !== pathCard);
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

      assert.ok(nextThemeSelect !== themeSelect);
      assert.ok(nextExplorerDensitySelect !== explorerDensitySelect);
      assert.equal(getButton(container, "settings-explorer-badges-toggle"), explorerBadgesSwitch);
      assert.ok(nextTransferBlueSwatch !== transferBlueSwatch);
      assert.ok(nextColorInput !== colorInput);
      assert.ok(nextBackgroundResetButton !== backgroundResetButton);
      assert.ok(nextWhiteSwatch !== whiteSwatch);
      assert.ok(nextDarkSwatch !== darkSwatch);
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
      assert.ok(nextExplorerBadgesSwitch !== currentExplorerBadgesSwitch);
      assert.ok(nextTransparentChromeSwitch !== currentTransparentChromeSwitch);
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

  test("renders semantic library as its own template tree item group", () => {
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
            matchPolicy: "exact",
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
            matchPolicy: "exact",
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
      const semanticCard = getElement(container, "#settings-template-semantic-library-card");
      const semanticTree = semanticCard.closest(".settings-tree");
      const widgets = semanticCard.querySelectorAll<HTMLElement>(".inputbox_widget");
      const activeWidget = widgets[0];
      const recommendedSuggestion = semanticCard.querySelector<HTMLElement>(".settings-template-term-suggestion");

      assert.ok(templateLibraryTree);
      assert.ok(semanticTree);
      assert.ok(activeWidget);
      assert.ok(recommendedSuggestion);
      assert.ok(semanticTree !== templateLibraryTree);
      assert.equal(templateLibraryTree.querySelector("#settings-template-semantic-library-card"), null);
      assert.equal(container.querySelector("#settings-template-semantic-custom-terms-card"), null);
      assert.equal(widgets.length, 1);
      assert.equal(activeWidget.querySelectorAll(".inputbox_widget_item").length, 2);
      assert.equal(activeWidget.querySelector<HTMLElement>('.inputbox_widget_item[data-kind="builtin-enabled"] .inputbox_widget_item_label')?.textContent, "Vgs");
      assert.equal(activeWidget.querySelector<HTMLElement>('.inputbox_widget_item[data-kind="custom"] .inputbox_widget_item_label')?.textContent, "Custom Gate");
      assert.ok(activeWidget.querySelector("input.inputbox_native"));
      assert.equal(semanticCard.querySelectorAll(".settings-template-term-suggestion").length, 1);
      assert.equal(recommendedSuggestion.querySelector<HTMLElement>(".settings-template-term-suggestion-label")?.textContent, "Drain Current");
      assert.ok(semanticCard.querySelector("#settings-template-semantic-role-select"));
      assert.equal(semanticCard.querySelector("#settings-template-semantic-term-input"), null);
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
      feedback: idleFeedback,
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
      feedback: idleFeedback,
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
      cleanupFeedback: idleFeedback,
      cleanupKeepSuccessJobs: 0,
      cleanupRunning: false,
      cleanupSaving: false,
      currentPath: "",
      feedback: idleFeedback,
      isCleanupAvailable: false,
      isConfigurable: false,
      isHealthCheckAvailable: false,
      isHealthChecking: false,
      isLoading: false,
      isSaving: false,
      plotCommand: "",
      plotFeedback: idleFeedback,
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
    setActiveSettingsSection: noop,
    setAxisTitleFontSizeDraft: noop,
    setFileNameFieldSeparatorsDraft: noop,
    setOriginLegendFontSizeDraft: noop,
    setPlotCommandDraft: noop,
    setPostCommandsDraft: noop,
    setTemplateSemanticTermDraft: noop,
    setTemplateSemanticAxisDraft: noop,
    setTemplateSemanticFamilyDraft: noop,
    setTemplateSemanticIntentDraft: noop,
    setTemplateSemanticIvModeDraft: noop,
    setTemplateSemanticMatchPolicyDraft: noop,
    setTemplateSemanticRoleDraft: noop,
    setTemplateSemanticUnitDraft: noop,
    setTickLabelFontSizeDraft: noop,
    setXyPairsDraft: noop,
    settingsSections: createSettingsSections(),
    tableTemplateVisualizationSettings: {
      enabled: false,
      isSaving: false,
      onEnabledChange: noop,
    },
    templateSemanticTermDraft: "",
    templateSemanticAxisDraft: "x",
    templateSemanticFamilyDraft: "",
    templateSemanticIntentDraft: "",
    templateSemanticIvModeDraft: "",
    templateSemanticMatchPolicyDraft: "exact",
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
      familyOptions: [{ label: "none", value: "" }],
      feedback: idleFeedback,
      intentOptions: [{ label: "Generic XY", value: "genericXY" }],
      isSaving: false,
      ivModeOptions: [{ label: "none", value: "" }],
      matchPolicyOptions: [{ label: "exact", value: "exact" }],
      onAddSemanticTerm: noop,
      onDisableBuiltinTerm: noop,
      onDisableDomainPack: noop,
      onEnableBuiltinTerm: noop,
      onEnableDomainPack: noop,
      onMoveXAxisIntent: noop,
      onRemoveSemanticTerm: noop,
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
