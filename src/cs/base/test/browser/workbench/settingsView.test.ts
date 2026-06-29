import assert from "assert";

import { renderWorkbenchMarkdown } from "src/cs/workbench/browser/markdownRenderer";
import { SettingsView, type SettingsViewOptions } from "src/cs/workbench/contrib/settings/browser/settingsView";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";

type SettingsViewOptionOverrides = Partial<Omit<SettingsViewOptions, "appearanceSettings" | "templateSettings">> & {
  appearanceSettings?: Partial<SettingsViewOptions["appearanceSettings"]>;
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

  test("updates general setting items without replacing or reinserting their controls", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const view = new SettingsView(container, createSettingsViewOptions({ activeSettingsSection: "general" }));
    let observer: MutationObserver | null = null;
    let labelObserver: MutationObserver | null = null;

    try {
      const languageSelect = getButton(container, "settings-language-dropdown");
      const closeBehaviorSelect = getButton(container, "settings-close-behavior-dropdown");
      const numericDisplaySwitch = getButton(container, "settings-numeric-display-toggle");
      const generalSettingsList = getGeneralSettingsList(container);
      const numericDisplayLabel = getNumericDisplayLabel(container);
      const numericDisplayTitle = getElement(numericDisplayLabel, ".settings-title");
      const numericDisplayDescription = getElement(numericDisplayLabel, ".settings-description");
      const listMutations: MutationRecord[] = [];
      const labelMutations: MutationRecord[] = [];
      observer = new MutationObserver(records => listMutations.push(...records));
      observer.observe(generalSettingsList, { childList: true });
      labelObserver = new MutationObserver(records => labelMutations.push(...records));
      labelObserver.observe(numericDisplayLabel, { childList: true });

      numericDisplaySwitch.click();
      assert.ok(numericDisplaySwitch.classList.contains("ui-switch--animate"));

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
      }));
      await settled();

      assert.equal(getButton(container, "settings-language-dropdown"), languageSelect);
      assert.equal(getButton(container, "settings-close-behavior-dropdown"), closeBehaviorSelect);
      assert.equal(getButton(container, "settings-numeric-display-toggle"), numericDisplaySwitch);
      assert.equal(getElement(getNumericDisplayLabel(container), ".settings-title"), numericDisplayTitle);
      assert.equal(getElement(getNumericDisplayLabel(container), ".settings-description"), numericDisplayDescription);
      assert.equal(getSelectLabel(closeBehaviorSelect), "Minimize to Tray");
      assert.equal(closeBehaviorSelect.disabled, true);
      assert.equal(numericDisplaySwitch.getAttribute("aria-checked"), "true");
      assert.equal(numericDisplaySwitch.disabled, false);
      assert.ok(numericDisplaySwitch.classList.contains("ui-switch--animate"));
      assert.equal(listMutations.length, 0);
      assert.equal(labelMutations.length, 0);
    }
    finally {
      observer?.disconnect();
      labelObserver?.disconnect();
      view.dispose();
      container.remove();
    }
  });

  test("updates appearance controls without replacing the active section template", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const view = new SettingsView(container, createSettingsViewOptions());

    try {
      const themeSelect = getButton(container, "settings-theme-dropdown");
      const explorerDensitySelect = getButton(container, "settings-explorer-density-dropdown");
      const explorerBadgesSwitch = getButton(container, "settings-explorer-badges-toggle");
      const transferBlueSwatch = getButtonByAriaLabel(container, "transfer color: Blue");
      const colorInput = getInput(container, "settings-background-color-input");
      const backgroundResetButton = getButton(container, "settings-background-reset-btn");
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
      }));

      assert.equal(getButton(container, "settings-theme-dropdown"), themeSelect);
      assert.equal(getButton(container, "settings-explorer-density-dropdown"), explorerDensitySelect);
      assert.equal(getButton(container, "settings-explorer-badges-toggle"), explorerBadgesSwitch);
      assert.equal(getButtonByAriaLabel(container, "transfer color: Blue"), transferBlueSwatch);
      assert.equal(getInput(container, "settings-background-color-input"), colorInput);
      assert.equal(getButton(container, "settings-background-reset-btn"), backgroundResetButton);
      assert.equal(getButtonByAriaLabel(container, "#ffffff"), whiteSwatch);
      assert.equal(getButtonByAriaLabel(container, "#111827"), darkSwatch);
      assert.equal(getButton(container, "settings-transparent-chrome-toggle"), transparentChromeSwitch);

      assert.equal(getSelectLabel(themeSelect), "Dark");
      assert.equal(getSelectLabel(explorerDensitySelect), "Compact");
      assert.equal(explorerDensitySelect.disabled, true);
      assert.equal(transferBlueSwatch.disabled, true);
      assert.equal(transferBlueSwatch.dataset.selected, "false");
      assert.equal(getButtonByAriaLabel(container, "transfer color: Green").dataset.selected, "true");
      assert.ok(explorerBadgesSwitch.classList.contains("ui-switch--animate"));
      assert.ok(transparentChromeSwitch.classList.contains("ui-switch--animate"));
      assert.equal(explorerBadgesSwitch.disabled, false);
      assert.equal(transparentChromeSwitch.disabled, false);
      assert.equal(getComputedStyle(explorerBadgesSwitch).opacity, "1");
      assert.equal(getComputedStyle(transparentChromeSwitch).opacity, "1");
      assert.equal(explorerBadgesSwitch.getAttribute("aria-checked"), "false");
      assert.equal(transparentChromeSwitch.getAttribute("aria-checked"), "false");
      assert.equal(colorInput.value, "#111827");
      assert.equal(colorInput.disabled, true);
      assert.equal(backgroundResetButton.disabled, true);
      assert.equal(whiteSwatch.dataset.selected, "false");
      assert.equal(darkSwatch.dataset.selected, "true");
      assert.ok(Array.from(container.querySelectorAll<HTMLButtonElement>(".settings-color-swatch")).every(swatch => swatch.disabled));

      view.update(createSettingsViewOptions({
        appearanceSettings: {
          showExplorerBadges: false,
          transparentChrome: false,
        },
      }));

      assert.equal(getButton(container, "settings-explorer-badges-toggle"), explorerBadgesSwitch);
      assert.equal(getButton(container, "settings-transparent-chrome-toggle"), transparentChromeSwitch);
      assert.equal(explorerBadgesSwitch.disabled, false);
      assert.equal(transparentChromeSwitch.disabled, false);
      assert.equal(explorerBadgesSwitch.getAttribute("aria-checked"), "false");
      assert.equal(transparentChromeSwitch.getAttribute("aria-checked"), "false");
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

  test("renders semantic library as its own template card group", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const view = new SettingsView(container, createSettingsViewOptions({
      activeSettingsSection: "template",
      templateSettings: {
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
      const templateLibrarySection = getElement(container, "#settings-template-domain-packs-card").closest(".settings-section");
      const semanticCard = getElement(container, "#settings-template-semantic-library-card");
      const semanticSection = semanticCard.closest(".settings-section");
      const customTermsCard = getElement(container, "#settings-template-semantic-custom-terms-card");
      const termField = getElement(semanticCard, ".settings-template-term-field");

      assert.ok(templateLibrarySection);
      assert.ok(semanticSection);
      assert.ok(semanticSection !== templateLibrarySection);
      assert.equal(templateLibrarySection.querySelector("#settings-template-semantic-library-card"), null);
      assert.equal(customTermsCard.closest(".settings-section"), semanticSection);
      assert.equal(termField.querySelectorAll(".settings-template-term-token").length, 2);
      assert.ok(termField.querySelector("input.inputbox_native"));
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
  assert.ok(button);
  return button;
}

function getButtonByAriaLabel(container: HTMLElement, ariaLabel: string): HTMLButtonElement {
  const button = container.querySelector<HTMLButtonElement>(`button[aria-label="${ariaLabel}"]`);
  assert.ok(button);
  return button;
}

function getInput(container: HTMLElement, id: string): HTMLInputElement {
  const input = container.querySelector<HTMLInputElement>(`#${id}`);
  assert.ok(input);
  return input;
}

function getGeneralSettingsList(container: HTMLElement): HTMLElement {
  const list = container.querySelector<HTMLElement>("#settings-general-section .settings-list");
  assert.ok(list);
  return list;
}

function getNumericDisplayLabel(container: HTMLElement): HTMLElement {
  const label = container.querySelector<HTMLElement>("#settings-numeric-display-card .settings-heading");
  assert.ok(label);
  return label;
}

function getElement(container: HTMLElement, selector: string): HTMLElement {
  const element = container.querySelector<HTMLElement>(selector);
  assert.ok(element);
  return element;
}

function getSelectLabel(button: HTMLButtonElement): string {
  const label = button.querySelector<HTMLElement>(".ui-selectbox__label");
  assert.ok(label);
  return label.textContent ?? "";
}

async function settled(): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, 0));
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
    settingsSections: [
      { id: "general", label: "General" },
      { id: "template", label: "Template" },
      { id: "appearance", label: "Appearance" },
      { id: "origin", label: "Origin" },
      { id: "about", label: "About" },
    ],
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
      onMoveSemanticTerm: noop,
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
    templateSettings: {
      ...base.templateSettings,
      ...overrides.templateSettings,
    },
  };
}
