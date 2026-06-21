import { localize } from "src/cs/nls";
import { append, reset } from "src/cs/base/browser/dom";
import { createButton as createActionButton, updateButton as updateActionButton } from "src/cs/base/browser/ui/button/button";
import { createLxIcon } from "src/cs/base/browser/ui/lxicon/lxicon";
import { createInputBox } from "src/cs/base/browser/ui/inputbox/inputBox";
import { createSelectBox, type SelectBox, type SelectBoxOption } from "src/cs/base/browser/ui/selectBox/selectBox";
import Scrollbar from "src/cs/base/browser/ui/scrollbar/scrollbar";
import { SwitchWidget } from "src/cs/base/browser/ui/switch/switchWidget";
import { DisposableStore } from "src/cs/base/common/lifecycle";
import { LxIcon } from "src/cs/base/common/lxicon";
import { DEFAULT_FILE_NAME_FIELD_SEPARATORS } from "src/cs/workbench/services/template/common/fileNameMatching";
import {
  createSettingsNavGroups,
  getSettingsSectionIcon,
  type SettingsSectionEntry,
  type SettingsSectionId,
} from "src/cs/workbench/contrib/settings/browser/settingsLayout";
import { SettingsTree, type SettingsTreeSection } from "src/cs/workbench/contrib/settings/browser/settingsTree";
import type { LanguagePreference } from "src/cs/base/common/platform";
import type { ThemeMode } from "src/cs/workbench/common/theme";
import type {
  Feedback,
} from "src/cs/workbench/contrib/settings/common/feedback";
import "src/cs/base/browser/ui/inputbox/inputBox.css";
import "src/cs/workbench/contrib/settings/browser/media/settingsView.css";

type SelectOption = {
  disabled?: boolean;
  label: string;
  value: string;
};

type OriginSettingsSectionProps = {
  currentPath: string;
  cleanupEnabled: boolean;
  cleanupFailedRetentionDays: number;
  cleanupFeedback?: Feedback;
  cleanupKeepSuccessJobs: number;
  cleanupRunning: boolean;
  cleanupSaving: boolean;
  feedback: Feedback;
  isConfigurable: boolean;
  isHealthCheckAvailable: boolean;
  isCleanupAvailable: boolean;
  isHealthChecking: boolean;
  isLoading: boolean;
  plotCommand: string;
  plotFeedback?: Feedback;
  plotPostCommandsText: string;
  plotSaving: boolean;
  plotType: number;
  plotLineWidth: number;
  plotLegendFontSize: number | "";
  plotXyPairs: string;
  isSaving: boolean;
  onCheckHealth: () => Promise<void> | void;
  onChoosePath: () => Promise<void> | void;
  onCleanupEnabledChange: (enabled: boolean) => Promise<void> | void;
  onCleanupFailedRetentionDaysChange: (
    value: string | number,
  ) => Promise<void> | void;
  onCleanupKeepSuccessJobsChange: (
    value: string | number,
  ) => Promise<void> | void;
  onPlotCommandChange: (value: string) => Promise<void> | void;
  onPlotPostCommandsChange: (value: string) => Promise<void> | void;
  onPlotTypeChange: (value: string | number) => Promise<void> | void;
  onPlotLineWidthChange: (value: string | number) => Promise<void> | void;
  onPlotLegendFontSizeChange: (value: string | number) => Promise<void> | void;
  onPlotXyPairsChange: (value: string) => Promise<void> | void;
  onRunCleanupNow: () => Promise<void> | void;
};

type AppUpdateSettings = {
  currentVersion?: string | null;
  isAvailable: boolean;
};

type WindowCloseSettings = {
  behavior: "minimizeToTray" | "quit";
  isSaving: boolean;
  onBehaviorChange: (
    behavior: "minimizeToTray" | "quit",
  ) => Promise<void> | void;
};

type NumericDisplaySettings = {
  optimized: boolean;
  isSaving: boolean;
  onOptimizedChange: (optimized: boolean) => Promise<void> | void;
};

type AppearanceSettings = {
  backgroundColor: string;
  backgroundColorDefault: string;
  backgroundColorOptions: readonly string[];
  explorerBadgeColors: Readonly<Record<string, string>>;
  explorerBadgeColorLabels: readonly SelectOption[];
  explorerBadgeColorOptions: readonly SelectOption[];
  explorerDensity: string;
  explorerDensityOptions: readonly SelectOption[];
  isExplorerBadgeColorSaving: boolean;
  isExplorerBadgeSaving: boolean;
  isExplorerDensitySaving: boolean;
  isSaving: boolean;
  showExplorerBadges: boolean;
  transparentChrome: boolean;
  onBackgroundColorChange: (value: string) => Promise<void> | void;
  onBackgroundColorReset: () => Promise<void> | void;
  onExplorerBadgeColorChange: (badge: string, color: string) => Promise<void> | void;
  onExplorerBadgeVisibilityChange: (enabled: boolean) => Promise<void> | void;
  onExplorerDensityChange: (value: string) => Promise<void> | void;
  onTransparentChromeChange: (enabled: boolean) => Promise<void> | void;
};

type FileNameMatchingSettings = {
  feedback: Feedback;
  fieldSeparators: string;
  isSaving: boolean;
  onFieldSeparatorsChange: (value: string) => Promise<void> | void;
};

type ChartDefaultSettings = {
  defaultYScaleForCf: "linear" | "log";
  defaultYScaleForCv: "linear" | "log";
  defaultYScaleForOutput: "linear" | "log";
  defaultYScaleForPv: "linear" | "log";
  defaultYScaleForTransfer: "linear" | "log";
  tickLabelFontSize: number | "";
  axisTitleFontSize: number | "";
  feedback: Feedback;
  isSaving: boolean;
  onDefaultYScaleForCfChange: (value: string) => Promise<void> | void;
  onDefaultYScaleForCvChange: (value: string) => Promise<void> | void;
  onDefaultYScaleForOutputChange: (value: string) => Promise<void> | void;
  onDefaultYScaleForPvChange: (value: string) => Promise<void> | void;
  onDefaultYScaleForTransferChange: (value: string) => Promise<void> | void;
  onTickLabelFontSizeChange: (value: string | number) => Promise<void> | void;
  onAxisTitleFontSizeChange: (value: string | number) => Promise<void> | void;
};

type SettingsViewProps = {
  appearanceSettings: AppearanceSettings;
  appUpdateSettings: AppUpdateSettings;
  chartDefaultSettings: ChartDefaultSettings;
  fileNameMatchingSettings: FileNameMatchingSettings;
  language: LanguagePreference;
  numericDisplaySettings: NumericDisplaySettings;
  onLanguageChange: (language: LanguagePreference) => Promise<void> | void;
  onNavigateBack: () => Promise<void> | void;
  onResetLayoutState: () => Promise<void> | void;
  theme: ThemeMode;
  onThemeChange: (theme: ThemeMode) => Promise<void> | void;
  originSettings: OriginSettingsSectionProps;
  windowCloseSettings: WindowCloseSettings;
};

export type { SettingsSectionId };

export type SettingsViewOptions = SettingsViewProps & {
  activeSettingsSection: SettingsSectionId;
  appUpdateChecking: boolean;
  axisTitleFontSizeDraft: string;
  cleanupEnabledOptions: SelectOption[];
  cleanupFailedDaysOptions: SelectOption[];
  cleanupKeepSuccessOptions: SelectOption[];
  fileNameFieldSeparatorsDraft: string;
  handleCheckForUpdates: () => void;
  originLegendFontSizeDraft: string;
  plotCommandDraft: string;
  postCommandsDraft: string;
  setActiveSettingsSection: (section: SettingsSectionId) => void;
  setAxisTitleFontSizeDraft: (value: string) => void;
  setFileNameFieldSeparatorsDraft: (value: string) => void;
  setOriginLegendFontSizeDraft: (value: string) => void;
  setPlotCommandDraft: (value: string) => void;
  setPostCommandsDraft: (value: string) => void;
  setTickLabelFontSizeDraft: (value: string) => void;
  setXyPairsDraft: (value: string) => void;
  settingsSections: SettingsSectionEntry[];
  themeModeOptions: SelectOption[];
  tickLabelFontSizeDraft: string;
  windowCloseBehaviorOptions: SelectOption[];
  xyPairsDraft: string;
  yScaleOptions: SelectOption[];
};

type FieldOptions = {
  disabled?: boolean;
  id: string;
  onChange: (value: string) => void;
  options: readonly SelectOption[];
  value: string;
};

type TextInputOptions = {
  disabled?: boolean;
  id: string;
  inputClassName?: string;
  onBlur?: () => void;
  onChange: (value: string) => void;
  placeholder?: string;
  value: string;
};

type AppearanceSectionTemplate = {
  readonly backgroundResetButton: HTMLButtonElement;
  readonly badgeColorButtons: Map<string, HTMLButtonElement>;
  readonly badgeColorSwatches: HTMLElement;
  readonly colorInput: HTMLInputElement;
  readonly colorSwatches: HTMLElement;
  readonly element: HTMLElement;
  readonly explorerBadgesSwitch: SwitchWidget;
  readonly explorerDensitySelect: SelectBox<string>;
  readonly swatchButtons: Map<string, HTMLButtonElement>;
  readonly themeSelect: SelectBox<string>;
  readonly transparentChromeSwitch: SwitchWidget;
  readonly badgeLabelSelect: SelectBox<string>;
  readonly badgePreview: HTMLElement;
};

export class SettingsView {
  private readonly renderDisposables = new DisposableStore();
  private readonly root: HTMLElement;
  private readonly contentScroll = new Scrollbar({
    className: "settings-view-content-scroll",
    viewportClassName: "settings-view-content-scroll-viewport",
  });
  private appearanceSection: AppearanceSectionTemplate | null = null;
  private generalTree: SettingsTree | null = null;
  private options: SettingsViewOptions;
  private activeBadgeLabelValue = "transfer";

  constructor(container: HTMLElement, options: SettingsViewOptions) {
    this.root = document.createElement("section");
    this.root.className = "settings-view";
    this.root.setAttribute("aria-label", localize("settings.section.ariaLabel", "Settings"));
    container.appendChild(this.root);
    this.options = options;
    this.render();
  }

  update(options: SettingsViewOptions): void {
    if (canReuseAppearanceSectionTemplate(this.options, options)) {
      const current = this.options;
      this.options = options;
      this.updateAppearanceSection(current, options);
      return;
    }

    if (canReuseGeneralSectionTemplate(this.options, options)) {
      this.options = options;
      this.updateGeneralSection();
      return;
    }

    this.options = options;
    this.root.setAttribute("aria-label", localize("settings.section.ariaLabel", "Settings"));
    this.render();
  }

  dispose(): void {
    this.renderDisposables.dispose();
    this.contentScroll.dispose();
    this.root.remove();
  }

  private render(): void {
    this.renderDisposables.clear();
    this.appearanceSection = null;
    this.generalTree = null;
    reset(this.root);
    this.root.appendChild(this.createLayout());
    queueMicrotask(() => this.contentScroll.layout());
  }

  private createLayout(): HTMLElement {
    const layout = div("settings-view-layout");
    layout.append(this.createNav(), this.createContentScroll());
    return layout;
  }

  private createContentScroll(): HTMLElement {
    this.contentScroll.viewport.replaceChildren(this.createContent());
    return this.contentScroll.element;
  }

  private createNav(): HTMLElement {
    const aside = document.createElement("aside");
    aside.className = "settings-view-nav";
    aside.setAttribute("aria-label", localize("settings.nav.ariaLabel", "Settings sections"));

    const backButton = document.createElement("button");
    backButton.type = "button";
    backButton.className = "settings-view-nav-back";
    backButton.addEventListener("click", () => void this.options.onNavigateBack());
    backButton.append(
      createLxIcon({ className: "settings-view-nav-back-icon", icon: LxIcon.arrowLeft, size: 14 }),
      text("span", "settings-view-nav-back-label", localize("settings.nav.back", "Back")),
    );

    const search = document.createElement("label");
    search.className = "settings-view-search";
    search.appendChild(createLxIcon({ className: "settings-view-search-icon", icon: LxIcon.search, size: 14 }));
    const searchInput = createInputBox({
      ariaLabel: localize("settings.nav.searchPlaceholder", "Search settings..."),
      inputClassName: "settings-view-search-input",
      placeholder: localize("settings.nav.searchPlaceholder", "Search settings..."),
      type: "search",
    });
    search.appendChild(searchInput);

    const nav = document.createElement("nav");
    nav.className = "settings-view-nav-list";
    const buttons: HTMLButtonElement[] = [];
    const groups = createSettingsNavGroups();
    for (const group of groups) {
      const groupElement = div("settings-view-nav-group");
      const groupLabel = text("p", "settings-view-nav-group-label", group.label);
      const groupItems = div("settings-view-nav-group-items");
      for (const sectionId of group.sectionIds) {
        const section = this.options.settingsSections.find(item => item.id === sectionId);
        if (!section) {
          continue;
        }

        const isActive = this.options.activeSettingsSection === section.id;
        const button = document.createElement("button");
        button.type = "button";
        button.className = "settings-view-nav-item";
        button.dataset.selected = String(isActive);
        button.dataset.label = section.label.toLocaleLowerCase();
        if (isActive) {
          button.setAttribute("aria-current", "page");
        }
        button.append(
          createLxIcon({ className: "settings-view-nav-item-icon", icon: getSettingsSectionIcon(section.id), size: 16 }),
          text("span", "settings-view-nav-item-label", section.label),
        );
        button.addEventListener("click", () => this.options.setActiveSettingsSection(section.id));
        buttons.push(button);
        groupItems.appendChild(button);
      }
      groupElement.append(groupLabel, groupItems);
      nav.appendChild(groupElement);
    }

    searchInput.addEventListener("input", () => {
      const query = searchInput.value.trim().toLocaleLowerCase();
      for (const button of buttons) {
        button.hidden = Boolean(query) && !(button.dataset.label ?? "").includes(query);
      }
      for (const group of Array.from(nav.querySelectorAll<HTMLElement>(".settings-view-nav-group"))) {
        const hasVisibleItem = Array.from(group.querySelectorAll<HTMLButtonElement>(".settings-view-nav-item"))
          .some(button => !button.hidden);
        group.hidden = !hasVisibleItem;
      }
    });

    aside.append(div("settings-view-nav-header", backButton), search, nav);
    return aside;
  }

  private createContent(): HTMLElement {
    const content = div("settings-view-content");
    if (this.options.activeSettingsSection === "origin") {
      this.renderOrigin(content);
    }
    else if (this.options.activeSettingsSection === "appearance") {
      this.renderAppearance(content);
    }
    else if (this.options.activeSettingsSection === "about") {
      this.renderAbout(content);
    }
    else {
      this.renderGeneral(content);
    }
    return content;
  }

  private renderGeneral(container: HTMLElement): void {
    const generalTree = this.renderDisposables.add(new SettingsTree());
    generalTree.update(this.createGeneralSettingsTree());
    this.generalTree = generalTree;
    container.appendChild(generalTree.element);

    container.append(
      settingsSection(
        localize("settings.chartDefaults.sectionTitle", "Chart"),
        this.createDefaults(this.options.chartDefaultSettings),
        this.createChartDefaults(this.options.chartDefaultSettings),
      ),
      settingsSection(
        localize("settings.filenameMatching.sectionTitle", "Template"),
        this.createFileNameMatching(this.options.fileNameMatchingSettings),
      ),
    );
  }

  private updateGeneralSection(): void {
    if (!this.generalTree) {
      this.render();
      return;
    }

    this.generalTree.update(this.createGeneralSettingsTree());
    queueMicrotask(() => this.contentScroll.layout());
  }

  private createGeneralSettingsTree(): readonly SettingsTreeSection[] {
    return [
      {
        id: "settings-general-section",
        title: localize("settings.nav.general", "General"),
        items: [
          {
            id: "settings-language-card",
            controlId: "settings-language-dropdown",
            kind: "select",
            title: localize("settings.language.title", "Language"),
            value: this.options.language,
            onChange: value => {
              if (value === "system" || value === "zh" || value === "en") {
                void this.options.onLanguageChange(value);
              }
            },
            options: [
              { value: "system", label: localize("settings.language.system", "System") },
              { value: "zh", label: localize("settings.language.zh", "Chinese") },
              { value: "en", label: localize("settings.language.en", "English") },
            ],
          },
          {
            id: "settings-close-behavior-card",
            controlId: "settings-close-behavior-dropdown",
            disabled: this.options.windowCloseSettings.isSaving,
            kind: "select",
            title: localize("settings.closeBehavior.title", "Close Window"),
            value: this.options.windowCloseSettings.behavior,
            onChange: value => {
              if (value === "minimizeToTray" || value === "quit") {
                void this.options.windowCloseSettings.onBehaviorChange(value);
              }
            },
            options: this.options.windowCloseBehaviorOptions,
          },
          {
            id: "settings-numeric-display-card",
            ariaLabel: localize("settings.numericDisplay.title", "优化表格数值显示"),
            checked: this.options.numericDisplaySettings.optimized,
            controlId: "settings-numeric-display-toggle",
            description: localize("settings.numericDisplay.description", "优化科学计数法以合适小数位显示以更好的预览"),
            kind: "switch",
            title: localize("settings.numericDisplay.title", "优化表格数值显示"),
            onChange: checked => {
              void this.options.numericDisplaySettings.onOptimizedChange(checked);
            },
          },
        ],
      },
    ];
  }

  private renderAppearance(container: HTMLElement): void {
    const appearanceSection = this.createAppearanceSection();
    this.appearanceSection = appearanceSection;
    container.appendChild(appearanceSection.element);
  }

  private createAppearanceSection(): AppearanceSectionTemplate {
    const { appearanceSettings } = this.options;

    const themeSelect = this.createSelectWidget({
      id: "settings-theme-dropdown",
      value: this.options.theme,
      onChange: value => {
        if (value === "system" || value === "light" || value === "dark") {
          void this.options.onThemeChange(value);
        }
      },
      options: this.options.themeModeOptions,
    });
    const explorerDensitySelect = this.createSelectWidget({
      id: "settings-explorer-density-dropdown",
      value: appearanceSettings.explorerDensity,
      onChange: value => {
        if (value === "compact" || value === "default" || value === "comfortable") {
          void this.options.appearanceSettings.onExplorerDensityChange(value);
        }
      },
      options: appearanceSettings.explorerDensityOptions,
      disabled: appearanceSettings.isExplorerDensitySaving,
    });
    const explorerBadgesSwitch = this.createSwitchWidget({
      ariaLabel: localize("settings.explorerBadges.title", "Explorer Badges"),
      checked: appearanceSettings.showExplorerBadges,
      id: "settings-explorer-badges-toggle",
      onChange: checked => {
        void this.options.appearanceSettings.onExplorerBadgeVisibilityChange(checked);
      },
    });

    const appearanceSection = settingsSection(localize("settings.nav.appearance", "Appearance"),
      cardRow("settings-theme-card", localize("settings.theme.title", "Theme"), themeSelect.domNode),
      cardRow("settings-explorer-density-card", localize("settings.explorerDensity.title", "Explorer Density"), explorerDensitySelect.domNode),
      cardRow(
        "settings-explorer-badges-card",
        localize("settings.explorerBadges.title", "Explorer Badges"),
        explorerBadgesSwitch.domNode,
      ),
    );
    const appearanceList = getSettingsList(appearanceSection);

    const badgeColorSwatches = div("settings-badge-colors");
    const badgeColorButtons = new Map<string, HTMLButtonElement>();

    const badgeLabelSelect = this.createSelectWidget({
      id: "settings-explorer-badge-label-dropdown",
      value: this.activeBadgeLabelValue,
      onChange: value => {
        this.activeBadgeLabelValue = value;
        this.renderBadgeColorSwatches(badgeColorSwatches, badgeColorButtons, appearanceSettings);
      },
      options: appearanceSettings.explorerBadgeColorLabels,
    });

    const badgePreview = document.createElement("span");
    badgePreview.className = "settings-badge-preview";

    const selectorRow = div("settings-badge-color-selector-row");
    selectorRow.appendChild(badgeLabelSelect.domNode);

    const swatchesContainer = div("settings-badge-color-options");
    const optionsRow = div("settings-badge-color-options-row");
    optionsRow.appendChild(swatchesContainer);
    optionsRow.appendChild(badgePreview);

    badgeColorSwatches.append(selectorRow, optionsRow);

    this.renderBadgeColorSwatches(badgeColorSwatches, badgeColorButtons, appearanceSettings);

    const badgeColorsCard = card("settings-explorer-badge-colors-card", "settings-card-row");
    badgeColorsCard.appendChild(settingsSplitRow(
      headingBlock(
        localize("settings.explorerBadgeColors.title", "Badge Colors"),
        localize("settings.explorerBadgeColors.description", "Choose Explorer badge colors by measurement label."),
      ),
      div("settings-split-row-control settings-split-row-control--stack", badgeColorSwatches),
    ));
    appearanceList.appendChild(badgeColorsCard);

    const layoutResetButton = this.createButton({
      id: "settings-layout-reset-btn",
      label: localize("settings.layout.resetButton", "Reset Layout"),
      onClick: () => void this.options.onResetLayoutState(),
      variant: "secondary",
    });
    const layoutCard = card("settings-layout-card", "settings-card-row");
    layoutCard.appendChild(settingsSplitRow(
      headingBlock(
        localize("settings.layout.title", "Layout"),
        localize("settings.layout.description", "Reset sidebar width and hidden workbench parts."),
      ),
      div("settings-split-row-control settings-split-row-control--actions", layoutResetButton),
    ));
    appearanceList.appendChild(layoutCard);

    const backgroundCard = card("settings-background-card", "settings-card-row");
    const colorInput = document.createElement("input");
    colorInput.id = "settings-background-color-input";
    colorInput.className = "settings-color-input";
    colorInput.type = "color";
    colorInput.value = appearanceSettings.backgroundColor;
    colorInput.disabled = appearanceSettings.isSaving;
    colorInput.addEventListener("change", () => {
      void this.options.appearanceSettings.onBackgroundColorChange(colorInput.value);
    });

    const swatches = div("settings-color-swatches");
    const swatchButtons = new Map<string, HTMLButtonElement>();
    this.renderBackgroundSwatches(swatches, swatchButtons, appearanceSettings);

    const backgroundResetButton = createActionButton({
      className: "settings-button settings-reset-button",
      disabled:
        appearanceSettings.isSaving ||
        appearanceSettings.backgroundColor === appearanceSettings.backgroundColorDefault,
      id: "settings-background-reset-btn",
      ariaLabel: localize("settings.background.reset", "Reset"),
      title: localize("settings.background.reset", "Reset"),
      size: "iconSm",
      variant: "icon",
      content: createLxIcon({ icon: LxIcon.refresh, size: 14 }),
    });
    backgroundResetButton.addEventListener("click", () => void this.options.appearanceSettings.onBackgroundColorReset());

    backgroundCard.appendChild(settingsSplitRow(
      headingBlock(
        localize("settings.background.title", "Background"),
        localize("settings.background.description", "Choose the workbench page background color."),
      ),
      div("settings-split-row-control settings-split-row-control--stack", div(
        "settings-color-controls",
        colorInput,
        swatches,
        backgroundResetButton,
      )),
    ));
    appearanceList.appendChild(backgroundCard);

    const transparentChromeSwitch = this.createSwitchWidget({
      ariaLabel: localize("settings.transparentChrome.title", "Translucent sidebar"),
      checked: appearanceSettings.transparentChrome,
      id: "settings-transparent-chrome-toggle",
      onChange: checked => {
        void this.options.appearanceSettings.onTransparentChromeChange(checked);
      },
    });
    appearanceList.appendChild(
      cardRow(
        "settings-transparent-chrome-card",
        localize("settings.transparentChrome.title", "Translucent sidebar"),
        transparentChromeSwitch.domNode,
      ),
    );

    return {
      backgroundResetButton,
      badgeColorButtons,
      badgeColorSwatches,
      colorInput,
      colorSwatches: swatches,
      element: appearanceSection,
      explorerBadgesSwitch,
      explorerDensitySelect,
      swatchButtons,
      themeSelect,
      transparentChromeSwitch,
      badgeLabelSelect,
      badgePreview,
    };
  }

  private renderOrigin(container: HTMLElement): void {
    const { originSettings } = this.options;
    const pathCard = card("settings-origin-path-card", "settings-card-block");
    pathCard.append(
      headingBlock(localize("settings.origin.title", "Origin Executable Path"), localize("settings.origin.description", "Choose the Origin app used to open files.")),
      this.createPathControls(originSettings),
    );
    if (!originSettings.isConfigurable) {
      pathCard.appendChild(text("p", "settings-description", localize("settings.origin.notConfigurableHint", "Origin path configuration is available in Windows desktop app only.")));
    }
    const originSection = settingsSection(localize("settings.nav.origin", "Origin"), pathCard);
    const originList = getSettingsList(originSection);

    const cleanupCard = card("settings-origin-cleanup-card", "settings-card-block");
    cleanupCard.append(
      headingBlock(localize("settings.origin.cleanup.title", "Runtime Cleanup"), localize("settings.origin.cleanup.description", "Manage automatic cleanup for Origin runtime cache.")),
      this.createOriginCleanupGrid(originSettings),
      div("settings-actions-end", this.createButton({
        id: "settings-origin-cleanup-run-btn",
        label: originSettings.cleanupRunning ? localize("settings.origin.cleanup.running", "Cleaning...") : localize("settings.origin.cleanup.runButton", "Run Cleanup Now"),
        onClick: () => void originSettings.onRunCleanupNow(),
        disabled: !originSettings.isCleanupAvailable || originSettings.cleanupRunning || originSettings.cleanupSaving,
        variant: "secondary",
      })),
    );
    originList.appendChild(cleanupCard);

    originList.appendChild(this.createOriginPlot(originSettings));
    container.appendChild(originSection);
  }

  private renderAbout(container: HTMLElement): void {
    const { appUpdateSettings } = this.options;
    container.appendChild(settingsSection(localize("settings.nav.about", "About"),
      cardRow("settings-about-version-card", localize("settings.about.versionTitle", "Current Version"), text("p", "settings-code-value", appUpdateSettings.currentVersion || localize("settings.about.versionUnknown", "Unknown"))),
      cardRow("settings-app-update-card", localize("settings.appUpdate.title", "App Updates"), this.createButton({
        id: "settings-app-update-check-btn",
        label: this.options.appUpdateChecking ? localize("settings.appUpdate.checking", "Checking...") : localize("settings.appUpdate.checkButton", "Check for Updates"),
        onClick: this.options.handleCheckForUpdates,
        disabled: !appUpdateSettings.isAvailable || this.options.appUpdateChecking,
        variant: "secondary",
      })),
    ));
  }

  private createDefaults(settings: ChartDefaultSettings): HTMLElement {
    const container = card("settings-defaults-card", "settings-card-block");
    container.appendChild(title(localize("settings.chartScaleDefaults.title", "Chart Scale Defaults")));
    const grid = div("settings-grid settings-grid--five");
    const fields: Array<[string, string, keyof Pick<ChartDefaultSettings, "defaultYScaleForTransfer" | "defaultYScaleForOutput" | "defaultYScaleForCv" | "defaultYScaleForCf" | "defaultYScaleForPv">, (value: string) => void]> = [
      ["settings-default-transfer-y-scale-select", localize("settings.chartScaleDefaults.transferCurve", "Transfer"), "defaultYScaleForTransfer", value => void settings.onDefaultYScaleForTransferChange(value)],
      ["settings-default-output-y-scale-select", localize("settings.chartScaleDefaults.outputCurve", "Output"), "defaultYScaleForOutput", value => void settings.onDefaultYScaleForOutputChange(value)],
      ["settings-default-cv-y-scale-select", localize("settings.chartScaleDefaults.cvCurve", "C-V"), "defaultYScaleForCv", value => void settings.onDefaultYScaleForCvChange(value)],
      ["settings-default-cf-y-scale-select", localize("settings.chartScaleDefaults.cfCurve", "C-f"), "defaultYScaleForCf", value => void settings.onDefaultYScaleForCfChange(value)],
      ["settings-default-pv-y-scale-select", localize("settings.chartScaleDefaults.pvCurve", "P-V"), "defaultYScaleForPv", value => void settings.onDefaultYScaleForPvChange(value)],
    ];
    for (const [id, label, key, onChange] of fields) {
      grid.appendChild(field(label, this.createSelect({
        id,
        value: settings[key],
        onChange,
        options: this.options.yScaleOptions,
        disabled: settings.isSaving,
      })));
    }
    container.appendChild(grid);
    appendFeedback(container, settings.feedback);
    return container;
  }

  private createChartDefaults(settings: ChartDefaultSettings): HTMLElement {
    const container = card("settings-chart-defaults-card", "settings-card-block");
    container.appendChild(title(localize("settings.chartTypographyDefaults.title", "Chart Typography Defaults")));
    const grid = div("settings-grid settings-grid--three");
    grid.append(
      field(localize("settings.chartTypographyDefaults.titleSize", "Title"), this.createInput({
        id: "settings-default-title-font-size-input",
        value: this.options.axisTitleFontSizeDraft,
        onChange: this.options.setAxisTitleFontSizeDraft,
        onBlur: () => {
          if (this.options.axisTitleFontSizeDraft !== String(settings.axisTitleFontSize ?? "")) {
            void settings.onAxisTitleFontSizeChange(this.options.axisTitleFontSizeDraft.trim());
          }
        },
        placeholder: "22",
        disabled: settings.isSaving,
      })),
      field(localize("settings.chartTypographyDefaults.tickLabel", "Tick label"), this.createInput({
        id: "settings-default-tick-label-font-size-input",
        value: this.options.tickLabelFontSizeDraft,
        onChange: this.options.setTickLabelFontSizeDraft,
        onBlur: () => {
          if (this.options.tickLabelFontSizeDraft !== String(settings.tickLabelFontSize ?? "")) {
            void settings.onTickLabelFontSizeChange(this.options.tickLabelFontSizeDraft.trim());
          }
        },
        placeholder: "18",
        disabled: settings.isSaving,
      })),
    );
    container.appendChild(grid);
    return container;
  }

  private createFileNameMatching(settings: FileNameMatchingSettings): HTMLElement {
    const container = card("settings-filename-matching-card", "settings-card-block");
    container.appendChild(headingBlock(localize("settings.filenameMatching.title", "Filename Field Matching"), localize("settings.filenameMatching.description", "Choose which separator characters split filename fields for template rules.")));
    const body = div("settings-field");
    body.append(
      label(localize("settings.filenameMatching.label", "Field separators")),
      this.createInput({
        id: "settings-filename-separators-input",
        value: this.options.fileNameFieldSeparatorsDraft,
        onChange: this.options.setFileNameFieldSeparatorsDraft,
        onBlur: () => {
          if (this.options.fileNameFieldSeparatorsDraft !== settings.fieldSeparators) {
            void settings.onFieldSeparatorsChange(this.options.fileNameFieldSeparatorsDraft);
          }
        },
        disabled: settings.isSaving,
        inputClassName: "font-mono",
      }),
      text("p", "settings-hint", localize("settings.filenameMatching.hint", "Each character acts as a separator. The default is {value}.", { value: DEFAULT_FILE_NAME_FIELD_SEPARATORS })),
    );
    container.appendChild(body);
    appendFeedback(container, settings.feedback);
    return container;
  }

  private createPathControls(settings: OriginSettingsSectionProps): HTMLElement {
    const controls = div("settings-path-controls");
    controls.append(
      div("settings-path-value",
        text("p", "settings-path-text", settings.currentPath || (settings.isLoading ? localize("settings.origin.loading", "Loading...") : localize("settings.origin.notConfigurableHint", "Origin path configuration is available in Windows desktop app only."))),
      ),
      this.createButton({
        id: "settings-origin-path-choose-btn",
        label: localize("settings.origin.choosePathButton", "Choose Origin.exe"),
        onClick: () => void settings.onChoosePath(),
        disabled: !settings.isConfigurable || settings.isLoading || settings.isSaving || settings.isHealthChecking,
        variant: "primary",
      }),
      this.createButton({
        id: "settings-origin-health-check-btn",
        label: settings.isHealthChecking ? localize("settings.origin.checking", "Checking...") : localize("settings.origin.checkButton", "Check Connection"),
        onClick: () => void settings.onCheckHealth(),
        disabled: !settings.isHealthCheckAvailable || settings.isLoading || settings.isSaving || settings.isHealthChecking,
        variant: "secondary",
      }),
    );
    return controls;
  }

  private createOriginCleanupGrid(settings: OriginSettingsSectionProps): HTMLElement {
    const grid = div("settings-grid settings-grid--three");
    grid.append(
      field(localize("settings.origin.cleanup.enableLabel", "Auto cleanup"), this.createSelect({
        id: "settings-origin-cleanup-enabled-select",
        value: String(Boolean(settings.cleanupEnabled)),
        onChange: value => void settings.onCleanupEnabledChange(value === "true"),
        options: this.options.cleanupEnabledOptions,
        disabled: settings.cleanupSaving,
      })),
      field(localize("settings.origin.cleanup.keepSuccessLabel", "Keep successful jobs"), this.createSelect({
        id: "settings-origin-cleanup-keep-success-select",
        value: String(settings.cleanupKeepSuccessJobs ?? 0),
        onChange: value => void settings.onCleanupKeepSuccessJobsChange(value),
        options: this.options.cleanupKeepSuccessOptions,
        disabled: settings.cleanupSaving,
      })),
      field(localize("settings.origin.cleanup.failedDaysLabel", "Keep failed jobs (days)"), this.createSelect({
        id: "settings-origin-cleanup-failed-days-select",
        value: String(settings.cleanupFailedRetentionDays ?? 7),
        onChange: value => void settings.onCleanupFailedRetentionDaysChange(value),
        options: this.options.cleanupFailedDaysOptions,
        disabled: settings.cleanupSaving,
      })),
    );
    return grid;
  }

  private createOriginPlot(settings: OriginSettingsSectionProps): HTMLElement {
    const container = card("settings-origin-plot-card", "settings-card-block");
    container.appendChild(headingBlock(localize("settings.origin.plot.title", "Default Plot Settings"), localize("settings.origin.plot.description", "Used by \"Open in Origin\".")));
    container.append(
      field(localize("settings.origin.plot.xyPairsLabel", "XY pairs"), this.createInput({
        id: "settings-origin-plot-xy-pairs-input",
        value: this.options.xyPairsDraft,
        onChange: this.options.setXyPairsDraft,
        onBlur: () => {
          const nextValue = this.options.xyPairsDraft.trim();
          if (nextValue !== (settings.plotXyPairs ?? "")) {
            void settings.onPlotXyPairsChange(nextValue);
          }
        },
        disabled: settings.plotSaving || !settings.isConfigurable,
      }), localize("settings.origin.plot.xyPairsHint", "LabTalk expression, for example ((1,2)) or ((1,2),(3,4)).")),
      field(localize("settings.origin.plot.commandLabel", "Plot command override"), this.createInput({
        id: "settings-origin-plot-command-input",
        value: this.options.plotCommandDraft,
        onChange: this.options.setPlotCommandDraft,
        onBlur: () => {
          const nextValue = this.options.plotCommandDraft.trim();
          if (nextValue !== (settings.plotCommand ?? "")) {
            void settings.onPlotCommandChange(nextValue);
          }
        },
        disabled: settings.plotSaving || !settings.isConfigurable,
      }), localize("settings.origin.plot.commandHint", "Optional full LabTalk command. If set, it overrides plot type and XY pairs.")),
      field(localize("chart.legend.fontSize", "Legend size"), this.createInput({
        id: "settings-origin-legend-font-size-input",
        value: this.options.originLegendFontSizeDraft,
        onChange: this.options.setOriginLegendFontSizeDraft,
        onBlur: () => {
          if (this.options.originLegendFontSizeDraft !== String(settings.plotLegendFontSize ?? "")) {
            void settings.onPlotLegendFontSizeChange(this.options.originLegendFontSizeDraft.trim());
          }
        },
        placeholder: localize("chart.axis.auto", "auto"),
        disabled: settings.plotSaving || !settings.isConfigurable,
      })),
      this.createPostCommandsField(settings),
    );
    appendFeedback(container, settings.plotFeedback);
    return container;
  }

  private createPostCommandsField(settings: OriginSettingsSectionProps): HTMLElement {
    const container = div("settings-field");
    const textarea = document.createElement("textarea");
    textarea.id = "settings-origin-plot-post-commands-input";
    textarea.className = "settings-textarea";
    textarea.value = this.options.postCommandsDraft;
    textarea.disabled = settings.plotSaving || !settings.isConfigurable;
    textarea.addEventListener("input", () => this.options.setPostCommandsDraft(textarea.value));
    textarea.addEventListener("blur", () => {
      const nextValue = this.options.postCommandsDraft.trim();
      const currentValue = String(settings.plotPostCommandsText ?? "").trim();
      if (nextValue !== currentValue) {
        void settings.onPlotPostCommandsChange(nextValue);
      }
    });
    container.append(
      label(localize("settings.origin.plot.postCommandsLabel", "Post-plot commands")),
      textarea,
      text("p", "settings-hint", localize("settings.origin.plot.postCommandsHint", "One LabTalk command per line, executed after plotting.")),
    );
    return container;
  }

  private createSelectWidget(options: FieldOptions): SelectBox<string> {
    const select = createSelectBox({
      id: options.id,
      className: "settings-select",
      disabled: options.disabled,
      value: options.value,
      options: options.options as readonly SelectBoxOption<string>[],
      onDidSelect: options.onChange,
    });
    this.renderDisposables.add(select);
    return select;
  }

  private createSelect(options: FieldOptions): HTMLButtonElement {
    return this.createSelectWidget(options).domNode;
  }

  private updateSelectWidget(widget: SelectBox<string>, options: FieldOptions): void {
    widget.update({
      id: options.id,
      className: "settings-select",
      disabled: options.disabled,
      value: options.value,
      options: options.options as readonly SelectBoxOption<string>[],
      onDidSelect: options.onChange,
    });
  }

  private createInput(options: TextInputOptions): HTMLInputElement {
    const input = createInputBox({
      disabled: options.disabled,
      id: options.id,
      inputClassName: options.inputClassName
        ? `inputbox_native inputbox_field ${options.inputClassName}`
        : "inputbox_native inputbox_field",
      placeholder: options.placeholder,
      value: options.value,
    });
    input.addEventListener("input", () => options.onChange(input.value));
    if (options.onBlur) {
      input.addEventListener("blur", options.onBlur);
    }
    return input;
  }

  private createSwitchWidget(options: {
    ariaLabel: string;
    checked: boolean;
    disabled?: boolean;
    id: string;
    onChange: (checked: boolean) => void;
  }): SwitchWidget {
    const widget = this.renderDisposables.add(new SwitchWidget({
      checked: options.checked,
      className: "settings-switch",
      disabled: options.disabled,
      id: options.id,
      onDidChangeChecked: options.onChange,
    }));
    widget.domNode.setAttribute("aria-label", options.ariaLabel);
    return widget;
  }

  private updateAppearanceSection(current: SettingsViewOptions, next: SettingsViewOptions): void {
    const template = this.appearanceSection;
    if (!template) {
      this.render();
      return;
    }

    const currentAppearance = current.appearanceSettings;
    const nextAppearance = next.appearanceSettings;

    if (current.theme !== next.theme || !selectOptionsEqual(current.themeModeOptions, next.themeModeOptions)) {
      this.updateSelectWidget(template.themeSelect, {
        id: "settings-theme-dropdown",
        value: next.theme,
        options: next.themeModeOptions,
        onChange: value => {
          if (value === "system" || value === "light" || value === "dark") {
            void this.options.onThemeChange(value);
          }
        },
      });
    }

    if (
      currentAppearance.explorerDensity !== nextAppearance.explorerDensity ||
      currentAppearance.isExplorerDensitySaving !== nextAppearance.isExplorerDensitySaving ||
      !selectOptionsEqual(currentAppearance.explorerDensityOptions, nextAppearance.explorerDensityOptions)
    ) {
      this.updateSelectWidget(template.explorerDensitySelect, {
        id: "settings-explorer-density-dropdown",
        disabled: nextAppearance.isExplorerDensitySaving,
        value: nextAppearance.explorerDensity,
        options: nextAppearance.explorerDensityOptions,
        onChange: value => {
          if (value === "compact" || value === "default" || value === "comfortable") {
            void this.options.appearanceSettings.onExplorerDensityChange(value);
          }
        },
      });
    }

    if (
      currentAppearance.showExplorerBadges !== nextAppearance.showExplorerBadges
    ) {
      template.explorerBadgesSwitch.update({
        checked: nextAppearance.showExplorerBadges,
        className: "settings-switch",
        id: "settings-explorer-badges-toggle",
      });
      template.explorerBadgesSwitch.domNode.setAttribute("aria-label", localize("settings.explorerBadges.title", "Explorer Badges"));
    }

    if (
      !selectOptionsEqual(currentAppearance.explorerBadgeColorLabels, nextAppearance.explorerBadgeColorLabels) ||
      currentAppearance.isExplorerBadgeColorSaving !== nextAppearance.isExplorerBadgeColorSaving
    ) {
      if (!nextAppearance.explorerBadgeColorLabels.some(l => l.value === this.activeBadgeLabelValue)) {
        this.activeBadgeLabelValue = nextAppearance.explorerBadgeColorLabels[0]?.value ?? "transfer";
      }
      this.updateSelectWidget(template.badgeLabelSelect, {
        id: "settings-explorer-badge-label-dropdown",
        disabled: nextAppearance.isExplorerBadgeColorSaving,
        value: this.activeBadgeLabelValue,
        options: nextAppearance.explorerBadgeColorLabels,
        onChange: value => {
          this.activeBadgeLabelValue = value;
          this.renderBadgeColorSwatches(template.badgeColorSwatches, template.badgeColorButtons, nextAppearance);
        },
      });
    }

    this.updateBadgeColorControls(template, currentAppearance, nextAppearance);
    this.updateBackgroundControls(template, currentAppearance, nextAppearance);

    if (
      currentAppearance.transparentChrome !== nextAppearance.transparentChrome
    ) {
      template.transparentChromeSwitch.update({
        checked: nextAppearance.transparentChrome,
        className: "settings-switch",
        id: "settings-transparent-chrome-toggle",
      });
      template.transparentChromeSwitch.domNode.setAttribute("aria-label", localize("settings.transparentChrome.title", "Translucent sidebar"));
    }

    queueMicrotask(() => this.contentScroll.layout());
  }

  private renderBadgeColorSwatches(
    container: HTMLElement,
    buttons: Map<string, HTMLButtonElement>,
    settings: AppearanceSettings,
  ): void {
    buttons.clear();

    const swatchesContainer = container.querySelector<HTMLElement>(".settings-badge-color-options");
    const preview = container.querySelector<HTMLElement>(".settings-badge-preview");
    if (!swatchesContainer || !preview) {
      return;
    }

    reset(swatchesContainer);

    const activeBadge = settings.explorerBadgeColorLabels.find(l => l.value === this.activeBadgeLabelValue) || settings.explorerBadgeColorLabels[0];
    const selectedColor = settings.explorerBadgeColors[this.activeBadgeLabelValue] ?? "neutral";

    preview.textContent = activeBadge ? activeBadge.label : this.activeBadgeLabelValue;
    preview.dataset.color = selectedColor;

    for (const option of settings.explorerBadgeColorOptions) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "settings-badge-color-swatch";
      button.dataset.color = option.value;
      button.title = option.label;
      button.setAttribute(
        "aria-label",
        localize("settings.explorerBadgeColor.aria", "{badge} color: {color}", {
          badge: activeBadge ? activeBadge.label : this.activeBadgeLabelValue,
          color: option.label,
        }),
      );
      button.addEventListener("click", () => {
        void this.options.appearanceSettings.onExplorerBadgeColorChange(this.activeBadgeLabelValue, option.value);
      });
      buttons.set(badgeColorButtonKey(this.activeBadgeLabelValue, option.value), button);
      swatchesContainer.appendChild(button);
    }

    this.updateBadgeColorSwatches(preview, buttons, settings);
  }

  private updateBadgeColorControls(
    template: AppearanceSectionTemplate,
    current: AppearanceSettings,
    next: AppearanceSettings,
  ): void {
    if (
      !selectOptionsEqual(current.explorerBadgeColorLabels, next.explorerBadgeColorLabels) ||
      !selectOptionsEqual(current.explorerBadgeColorOptions, next.explorerBadgeColorOptions)
    ) {
      this.renderBadgeColorSwatches(template.badgeColorSwatches, template.badgeColorButtons, next);
      return;
    }

    if (
      current.isExplorerBadgeColorSaving !== next.isExplorerBadgeColorSaving ||
      !badgeColorsEqual(current.explorerBadgeColors, next.explorerBadgeColors)
    ) {
      this.updateBadgeColorSwatches(template.badgePreview, template.badgeColorButtons, next);
    }
  }

  private updateBadgeColorSwatches(
    preview: HTMLElement | null,
    buttons: Map<string, HTMLButtonElement>,
    settings: AppearanceSettings,
  ): void {
    const selectedColor = settings.explorerBadgeColors[this.activeBadgeLabelValue] ?? "neutral";
    if (preview) {
      preview.dataset.color = selectedColor;
    }
    for (const option of settings.explorerBadgeColorOptions) {
      const button = buttons.get(badgeColorButtonKey(this.activeBadgeLabelValue, option.value));
      if (!button) {
        continue;
      }
      button.disabled = settings.isExplorerBadgeColorSaving;
      button.dataset.selected = String(option.value === selectedColor);
    }
  }

  private updateBackgroundControls(
    template: AppearanceSectionTemplate,
    current: AppearanceSettings,
    next: AppearanceSettings,
  ): void {
    if (current.backgroundColor !== next.backgroundColor) {
      template.colorInput.value = next.backgroundColor;
    }

    if (current.isSaving !== next.isSaving) {
      template.colorInput.disabled = next.isSaving;
    }

    if (!stringArrayEqual(current.backgroundColorOptions, next.backgroundColorOptions)) {
      this.renderBackgroundSwatches(template.colorSwatches, template.swatchButtons, next);
    }

    if (
      current.backgroundColor !== next.backgroundColor ||
      current.isSaving !== next.isSaving ||
      !stringArrayEqual(current.backgroundColorOptions, next.backgroundColorOptions)
    ) {
      this.updateBackgroundSwatches(template.swatchButtons, next);
    }

    if (
      current.backgroundColor !== next.backgroundColor ||
      current.backgroundColorDefault !== next.backgroundColorDefault ||
      current.isSaving !== next.isSaving
    ) {
      updateActionButton(template.backgroundResetButton, {
        className: "settings-button settings-reset-button",
        disabled: next.isSaving || next.backgroundColor === next.backgroundColorDefault,
        id: "settings-background-reset-btn",
        ariaLabel: localize("settings.background.reset", "Reset"),
        title: localize("settings.background.reset", "Reset"),
        size: "iconSm",
        variant: "icon",
        content: createLxIcon({ icon: LxIcon.refresh, size: 14 }),
      });
    }
  }

  private renderBackgroundSwatches(
    container: HTMLElement,
    swatchButtons: Map<string, HTMLButtonElement>,
    settings: AppearanceSettings,
  ): void {
    swatchButtons.clear();
    reset(container);

    for (const color of settings.backgroundColorOptions) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "settings-color-swatch";
      button.style.setProperty("--settings-swatch-color", color);
      button.setAttribute("aria-label", color);
      button.title = color;
      button.addEventListener("click", () => {
        void this.options.appearanceSettings.onBackgroundColorChange(color);
      });
      swatchButtons.set(color, button);
      container.append(button);
    }

    this.updateBackgroundSwatches(swatchButtons, settings);
  }

  private updateBackgroundSwatches(
    swatchButtons: Map<string, HTMLButtonElement>,
    settings: AppearanceSettings,
  ): void {
    for (const [color, button] of swatchButtons) {
      button.disabled = settings.isSaving;
      button.dataset.selected = String(color === settings.backgroundColor);
    }
  }

  private createButton(options: {
    disabled?: boolean;
    id: string;
    label: string;
    onClick: () => void;
    variant: "primary" | "secondary";
  }): HTMLButtonElement {
    const button = createActionButton({
      className: "settings-button",
      disabled: options.disabled === true,
      id: options.id,
      label: options.label,
      size: "sm",
      variant: options.variant,
    });
    button.addEventListener("click", options.onClick);
    return button;
  }

}

function div(className: string, ...children: Array<Node | string>): HTMLDivElement {
  const element = document.createElement("div");
  element.className = className;
  append(element, ...children);
  return element;
}

function card(id: string, className: string): HTMLDivElement {
  const element = div(className ? `settings-card ${className}` : "settings-card");
  element.id = id;
  return element;
}

function cardRow(id: string, titleText: string, control: Node): HTMLElement {
  const element = card(id, "settings-card-row");
  element.appendChild(settingsSplitRow(
    div("settings-row-title", title(titleText)),
    div("settings-row-control", control),
  ));
  return element;
}

function settingsSplitRow(content: Node, control: Node): HTMLElement {
  return div("settings-row settings-split-row", content, control);
}

function settingsSection(titleText: string, ...rows: HTMLElement[]): HTMLElement {
  return div("settings-section", title(titleText), div("settings-list", ...rows));
}

function getSettingsList(section: HTMLElement): HTMLElement {
  const list = section.querySelector<HTMLElement>(".settings-list");
  if (!list) {
    throw new Error("Settings section is missing its list container.");
  }
  return list;
}

function title(value: string): HTMLElement {
  return text("h3", "settings-title", value);
}

function headingBlock(titleText: string, description: string): HTMLElement {
  return div("settings-heading", title(titleText), text("p", "settings-description", description));
}

function field(labelText: string, control: Node, hint?: string): HTMLElement {
  const element = div("settings-field");
  element.append(label(labelText), control);
  if (hint) {
    element.appendChild(text("p", "settings-hint", hint));
  }
  return element;
}

function label(value: string): HTMLElement {
  return text("p", "settings-label", value);
}

function text<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, value: string): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  element.className = className;
  element.textContent = value;
  return element;
}

function appendFeedback(container: HTMLElement, feedback: { type: "idle" | "success" | "error"; message: string } | undefined): void {
  if (!feedback?.message) {
    return;
  }

  container.appendChild(text("p", feedback.type === "error" ? "settings-feedback settings-feedback--error" : "settings-feedback settings-feedback--success", feedback.message));
}

const canReuseAppearanceSectionTemplate = (
  current: SettingsViewOptions,
  next: SettingsViewOptions,
): boolean => {
  if (current.activeSettingsSection !== "appearance" || next.activeSettingsSection !== "appearance") {
    return false;
  }

  if (current.language !== next.language || !settingsSectionsEqual(current.settingsSections, next.settingsSections)) {
    return false;
  }

  return true;
};

const canReuseGeneralSectionTemplate = (
  current: SettingsViewOptions,
  next: SettingsViewOptions,
): boolean => {
  if (current.activeSettingsSection !== "general" || next.activeSettingsSection !== "general") {
    return false;
  }

  if (current.language !== next.language || !settingsSectionsEqual(current.settingsSections, next.settingsSections)) {
    return false;
  }

  return chartDefaultSettingsEqual(current, next) && fileNameMatchingSettingsEqual(current, next);
};

function chartDefaultSettingsEqual(current: SettingsViewOptions, next: SettingsViewOptions): boolean {
  const currentSettings = current.chartDefaultSettings;
  const nextSettings = next.chartDefaultSettings;
  return current.axisTitleFontSizeDraft === next.axisTitleFontSizeDraft &&
    current.tickLabelFontSizeDraft === next.tickLabelFontSizeDraft &&
    selectOptionsEqual(current.yScaleOptions, next.yScaleOptions) &&
    currentSettings.axisTitleFontSize === nextSettings.axisTitleFontSize &&
    currentSettings.defaultYScaleForCf === nextSettings.defaultYScaleForCf &&
    currentSettings.defaultYScaleForCv === nextSettings.defaultYScaleForCv &&
    currentSettings.defaultYScaleForOutput === nextSettings.defaultYScaleForOutput &&
    currentSettings.defaultYScaleForPv === nextSettings.defaultYScaleForPv &&
    currentSettings.defaultYScaleForTransfer === nextSettings.defaultYScaleForTransfer &&
    currentSettings.isSaving === nextSettings.isSaving &&
    currentSettings.tickLabelFontSize === nextSettings.tickLabelFontSize &&
    feedbackEqual(currentSettings.feedback, nextSettings.feedback);
}

function fileNameMatchingSettingsEqual(current: SettingsViewOptions, next: SettingsViewOptions): boolean {
  const currentSettings = current.fileNameMatchingSettings;
  const nextSettings = next.fileNameMatchingSettings;
  return current.fileNameFieldSeparatorsDraft === next.fileNameFieldSeparatorsDraft &&
    currentSettings.fieldSeparators === nextSettings.fieldSeparators &&
    currentSettings.isSaving === nextSettings.isSaving &&
    feedbackEqual(currentSettings.feedback, nextSettings.feedback);
}

function feedbackEqual(
  current: { readonly message: string; readonly type: string },
  next: { readonly message: string; readonly type: string },
): boolean {
  return current.message === next.message && current.type === next.type;
}

function settingsSectionsEqual(
  current: readonly SettingsSectionEntry[],
  next: readonly SettingsSectionEntry[],
): boolean {
  if (current.length !== next.length) {
    return false;
  }

  return current.every((option, index) => {
    const nextOption = next[index];
    return option.id === nextOption?.id && option.label === nextOption.label;
  });
}

function selectOptionsEqual(
  current: readonly SelectOption[],
  next: readonly SelectOption[],
): boolean {
  if (current.length !== next.length) {
    return false;
  }

  return current.every((option, index) => {
    const nextOption = next[index];
    return option.value === nextOption?.value &&
      option.label === nextOption.label &&
      option.disabled === nextOption.disabled;
  });
}

function stringArrayEqual(
  current: readonly string[],
  next: readonly string[],
): boolean {
  if (current.length !== next.length) {
    return false;
  }

  return current.every((value, index) => value === next[index]);
}

function badgeColorButtonKey(badge: string, color: string): string {
  return `${badge}\u001f${color}`;
}

function badgeColorsEqual(
  current: Readonly<Record<string, string>>,
  next: Readonly<Record<string, string>>,
): boolean {
  const keys = new Set([...Object.keys(current), ...Object.keys(next)]);
  for (const key of keys) {
    if (current[key] !== next[key]) {
      return false;
    }
  }

  return true;
}
