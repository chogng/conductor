import { localize } from "src/cs/nls";
import { addDisposableListener, append, EventType, reset } from "src/cs/base/browser/dom";
import { createButton as createActionButton } from "src/cs/base/browser/ui/button/button";
import { ActionViewItem } from "src/cs/base/browser/ui/actionbar/actionViewItem";
import { createLxIcon } from "src/cs/base/browser/ui/lxicon/lxicon";
import {
  MODAL_BODY_SCROLL_CLASS,
  createModalCloseActionBar,
  getModalDialogClassName,
  getModalDialogId,
  getModalTitleId,
  MODAL_BACKDROP_CLASS,
  MODAL_OVERLAY_CLASS,
} from "src/cs/base/browser/ui/modal/modal";
import { createInputBox } from "src/cs/base/browser/ui/inputbox/inputBox";
import { createSelectBox, type SelectBox, type SelectBoxOption } from "src/cs/base/browser/ui/selectBox/selectBox";
import Scrollbar from "src/cs/base/browser/ui/scrollbar/scrollableElement";
import { SwitchWidget } from "src/cs/base/browser/ui/switch/switchWidget";
import { Action, type IAction } from "src/cs/base/common/actions";
import { DisposableStore } from "src/cs/base/common/lifecycle";
import { LxIcon } from "src/cs/base/common/lxicon";
import { DEFAULT_FILE_NAME_FIELD_SEPARATORS } from "src/cs/workbench/services/settings/common/fileNameMatching";
import {
  createSettingsNavGroups,
  getSettingsSectionIcon,
  type SettingsSectionEntry,
  type SettingsSectionId,
} from "src/cs/workbench/contrib/settings/browser/settingsLayout";
import { renderWorkbenchMarkdown } from "src/cs/workbench/browser/markdownRenderer";
import { readBundledUserGuideMarkdown } from "src/cs/workbench/contrib/settings/browser/userGuideReader";
import {
  getSettingsSearchWords,
  hasSettingsSearchQuery,
  normalizeSettingsSearchText,
  setSettingsSearchText,
  type SettingsSearchTerm,
  settingsSearchMatches,
} from "src/cs/workbench/contrib/settings/browser/settingsSearch";
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

class SettingsResetActionViewItem extends ActionViewItem {
  constructor(action: IAction) {
    super(undefined, action, {
      className: "settings-reset-button",
      icon: true,
      label: false,
    });
  }

  protected override updateLabel(): void {
    if (!this.label) {
      return;
    }

    this.label.replaceChildren(createLxIcon({
      className: "settings-reset-button__icon",
      icon: LxIcon.refresh,
    }));
  }
}

export type SettingsViewOptions = SettingsViewProps & {
  activeSettingsSection: SettingsSectionId;
  appUpdateChecking: boolean;
  axisTitleFontSizeDraft: string;
  cleanupEnabledOptions: SelectOption[];
  cleanupFailedDaysOptions: SelectOption[];
  cleanupKeepSuccessOptions: SelectOption[];
  fileNameFieldSeparatorsDraft: string;
  handleCheckForUpdates: () => void;
  handleShowReleaseNotes: () => void;
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
  readonly backgroundResetAction: Action;
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

type ActiveSettingsDocumentDialog = {
  readonly disposeStore: DisposableStore;
  readonly overlay: HTMLElement;
};

type SettingsDocumentDialogOptions = {
  readonly idBase: string;
  readonly title: string;
  readonly markdown: string;
};

export class SettingsView {
  private readonly renderDisposables = new DisposableStore();
  private readonly generalControlDisposables = new DisposableStore();
  private readonly root: HTMLElement;
  private readonly contentScroll = new Scrollbar({
    className: "settings-view-content-scroll",
    viewportClassName: "settings-view-content-scroll-viewport",
  });
  private appearanceSection: AppearanceSectionTemplate | null = null;
  private generalTree: SettingsTree | null = null;
  private options: SettingsViewOptions;
  private activeBadgeLabelValue = "transfer";
  private searchQuery = "";
  private settingsDocumentDialog: ActiveSettingsDocumentDialog | null = null;

  constructor(container: HTMLElement, options: SettingsViewOptions) {
    this.root = document.createElement("section");
    this.root.className = "settings-view";
    this.root.setAttribute("aria-label", localize("settings.section.ariaLabel", "Settings"));
    container.appendChild(this.root);
    this.options = options;
    this.render();
  }

  update(options: SettingsViewOptions): void {
    if (!hasSettingsSearchQuery(this.searchQuery) && canReuseAppearanceSectionTemplate(this.options, options)) {
      const current = this.options;
      this.options = options;
      this.updateAppearanceSection(current, options);
      return;
    }

    if (!hasSettingsSearchQuery(this.searchQuery) && canReuseGeneralSectionTemplate(this.options, options)) {
      this.options = options;
      this.updateGeneralSection();
      return;
    }

    this.options = options;
    this.root.setAttribute("aria-label", localize("settings.section.ariaLabel", "Settings"));
    this.render();
  }

  dispose(): void {
    this.closeSettingsDocumentDialog();
    this.generalControlDisposables.dispose();
    this.renderDisposables.dispose();
    this.contentScroll.dispose();
    this.root.remove();
  }

  private render(): void {
    this.generalControlDisposables.clear();
    this.renderDisposables.clear();
    this.appearanceSection = null;
    this.generalTree = null;
    reset(this.root);
    this.root.appendChild(this.createLayout());
    queueMicrotask(() => this.contentScroll.layout());
  }

  private refreshContent(): void {
    this.generalControlDisposables.clear();
    this.renderDisposables.clear();
    this.appearanceSection = null;
    this.generalTree = null;
    this.contentScroll.viewport.replaceChildren(this.createContent());
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

    const search = document.createElement("div");
    search.className = "settings-view-search inputbox_field";
    search.dataset.state = "enable";
    search.appendChild(createLxIcon({ className: "settings-view-search-icon", icon: LxIcon.search, size: 14 }));
    const searchInput = createInputBox({
      ariaLabel: localize("settings.nav.searchPlaceholder", "Search settings..."),
      inputClassName: "inputbox_native settings-view-search-input",
      placeholder: localize("settings.nav.searchPlaceholder", "Search settings..."),
      type: "text",
      value: this.searchQuery,
    });
    const clearSearchButton = document.createElement("button");
    clearSearchButton.type = "button";
    clearSearchButton.className = "settings-view-search-clear";
    clearSearchButton.hidden = true;
    clearSearchButton.setAttribute("aria-label", localize("settings.nav.clearSearch", "Clear search"));
    clearSearchButton.appendChild(createLxIcon({ className: "settings-view-search-clear-icon", icon: LxIcon.close, size: 14 }));
    search.append(searchInput, clearSearchButton);

    const nav = document.createElement("nav");
    nav.className = "settings-view-nav-list";
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
        if (isActive) {
          button.setAttribute("aria-current", "page");
        }
        button.append(
          createLxIcon({ className: "settings-view-nav-item-icon", icon: getSettingsSectionIcon(section.id), size: 16 }),
          text("span", "settings-view-nav-item-label", section.label),
        );
        button.addEventListener("click", () => this.options.setActiveSettingsSection(section.id));
        groupItems.appendChild(button);
      }
      groupElement.append(groupLabel, groupItems);
      nav.appendChild(groupElement);
    }

    const updateSearchState = () => {
      const queryWords = getSettingsSearchWords(searchInput.value);
      clearSearchButton.hidden = queryWords.length === 0;
    };

    searchInput.addEventListener("input", () => {
      this.searchQuery = searchInput.value;
      updateSearchState();
      this.refreshContent();
    });
    clearSearchButton.addEventListener("click", () => {
      searchInput.value = "";
      this.searchQuery = "";
      updateSearchState();
      this.refreshContent();
      searchInput.focus();
    });
    updateSearchState();

    aside.append(div("settings-view-nav-header", backButton), search, nav);
    return aside;
  }

  private createContent(): HTMLElement {
    const content = div("settings-view-content");
    const queryWords = getSettingsSearchWords(this.searchQuery);
    if (queryWords.length > 0) {
      this.renderSearchResults(content, queryWords);
      return content;
    }

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

  private renderSearchResults(container: HTMLElement, queryWords: readonly string[]): void {
    container.classList.add("settings-view-content--search");
    this.renderGeneral(container);
    this.renderAppearance(container);
    this.renderOrigin(container);
    this.renderAbout(container);

    const resultCount = this.filterSearchResults(container, queryWords);
    if (resultCount === 0) {
      container.appendChild(this.createEmptySearchResults());
    }
  }

  private filterSearchResults(container: HTMLElement, queryWords: readonly string[]): number {
    let resultCount = 0;
    for (const card of Array.from(container.querySelectorAll<HTMLElement>(".settings-card"))) {
      const isMatch = settingsSearchMatches(card.dataset.search ?? "", queryWords);
      card.hidden = !isMatch;
      if (isMatch) {
        resultCount++;
      }
    }

    for (const section of Array.from(container.querySelectorAll<HTMLElement>(".settings-section"))) {
      section.hidden = !Array.from(section.querySelectorAll<HTMLElement>(".settings-card"))
        .some(card => !card.hidden);
    }

    return resultCount;
  }

  private createEmptySearchResults(): HTMLElement {
    return div(
      "settings-search-empty",
      title(localize("settings.search.noResultsTitle", "No settings found")),
      text("p", "settings-description", localize("settings.search.noResultsDescription", "Try a different search term.")),
    );
  }

  private renderGeneral(container: HTMLElement): void {
    this.generalControlDisposables.clear();
    const generalTree = this.renderDisposables.add(new SettingsTree());
    generalTree.update(this.createGeneralSettingsTree());
    this.generalTree = generalTree;
    container.appendChild(generalTree.element);

    container.append(
      this.createChartSettingsSection(this.options.chartDefaultSettings),
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

    this.generalControlDisposables.clear();
    this.generalTree.update(this.createGeneralSettingsTree());
    queueMicrotask(() => this.contentScroll.layout());
  }

  private createChartSettingsSection(settings: ChartDefaultSettings): HTMLElement {
    const chartTree = this.renderDisposables.add(new SettingsTree());
    chartTree.update(this.createChartSettingsTree(settings));

    const chartList = getSettingsList(chartTree.element);
    if (settings.feedback.message) {
      const feedbackCard = card("settings-chart-scale-feedback-card", "settings-card-block");
      appendFeedback(feedbackCard, settings.feedback);
      chartList.appendChild(feedbackCard);
    }
    chartList.appendChild(this.createChartDefaults(settings));
    return chartTree.element;
  }

  private createGeneralSettingsTree(): readonly SettingsTreeSection[] {
    const languageOptions = [
      { value: "system", label: localize("settings.language.system", "System") },
      { value: "zh", label: localize("settings.language.zh", "Chinese") },
      { value: "en", label: localize("settings.language.en", "English") },
    ];
    return [
      {
        id: "settings-general-section",
        title: localize("settings.nav.general", "General"),
        items: [
          {
            control: this.createSelect({
              id: "settings-language-dropdown",
              value: this.options.language,
              onChange: value => {
                if (value === "system" || value === "zh" || value === "en") {
                  void this.options.onLanguageChange(value);
                }
              },
              options: languageOptions,
            }, this.generalControlDisposables),
            id: "settings-language-card",
            description: localize("settings.language.description", "Choose the display language used by the app."),
            searchText: normalizeSettingsSearchText(optionLabels(languageOptions)),
            title: localize("settings.language.title", "Language"),
          },
          {
            control: this.createSelect({
              id: "settings-close-behavior-dropdown",
              value: this.options.windowCloseSettings.behavior,
              onChange: value => {
                if (value === "minimizeToTray" || value === "quit") {
                  void this.options.windowCloseSettings.onBehaviorChange(value);
                }
              },
              options: this.options.windowCloseBehaviorOptions,
              disabled: this.options.windowCloseSettings.isSaving,
            }, this.generalControlDisposables),
            id: "settings-close-behavior-card",
            description: localize("settings.closeBehavior.description", "Choose what happens when the main window is closed."),
            searchText: normalizeSettingsSearchText(optionLabels(this.options.windowCloseBehaviorOptions)),
            title: localize("settings.closeBehavior.title", "Close Window"),
          },
          {
            control: this.createSwitchWidget({
              ariaLabel: localize("settings.numericDisplay.title", "优化表格数值显示"),
              checked: this.options.numericDisplaySettings.optimized,
              id: "settings-numeric-display-toggle",
              onChange: checked => {
                void this.options.numericDisplaySettings.onOptimizedChange(checked);
              },
            }, this.generalControlDisposables).domNode,
            id: "settings-numeric-display-card",
            description: localize("settings.numericDisplay.description", "优化科学计数法以合适小数位显示以更好的预览"),
            title: localize("settings.numericDisplay.title", "优化表格数值显示"),
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

    const swatchesContainer = div("settings-badge-color-options");
    badgeColorSwatches.append(swatchesContainer, badgePreview, badgeLabelSelect.domNode);

    this.renderBadgeColorSwatches(badgeColorSwatches, badgeColorButtons, appearanceSettings);

    const layoutResetAction = this.renderDisposables.add(new Action(
      "settings.layout.reset",
      localize("settings.layout.resetButton", "Reset Layout"),
      "",
      true,
      () => void this.options.onResetLayoutState(),
    ));
    layoutResetAction.tooltip = localize("settings.layout.resetButton", "Reset Layout");
    layoutResetAction.icon = LxIcon.refresh;
    const layoutResetActionContainer = div("settings-reset-action");
    const layoutResetActionItem = this.renderDisposables.add(new SettingsResetActionViewItem(layoutResetAction));
    layoutResetActionItem.render(layoutResetActionContainer);

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

    const backgroundResetAction = this.renderDisposables.add(new Action(
      "settings.background.reset",
      localize("settings.background.reset", "Reset"),
      "",
      !appearanceSettings.isSaving && appearanceSettings.backgroundColor !== appearanceSettings.backgroundColorDefault,
      () => void this.options.appearanceSettings.onBackgroundColorReset(),
    ));
    backgroundResetAction.tooltip = localize("settings.background.reset", "Reset");
    backgroundResetAction.icon = LxIcon.refresh;
    const backgroundResetActionContainer = div("settings-reset-action");
    const backgroundResetActionItem = this.renderDisposables.add(new SettingsResetActionViewItem(backgroundResetAction));
    backgroundResetActionItem.render(backgroundResetActionContainer);

    const transparentChromeSwitch = this.createSwitchWidget({
      ariaLabel: localize("settings.transparentChrome.title", "Translucent sidebar"),
      checked: appearanceSettings.transparentChrome,
      id: "settings-transparent-chrome-toggle",
      onChange: checked => {
        void this.options.appearanceSettings.onTransparentChromeChange(checked);
      },
    });
    const appearanceTree = this.renderDisposables.add(new SettingsTree());
    appearanceTree.update([
      {
        id: "settings-appearance-section",
        title: localize("settings.nav.appearance", "Appearance"),
        items: [
          {
            control: themeSelect.domNode,
            description: localize("settings.theme.description", "Choose the workbench color theme."),
            id: "settings-theme-card",
            searchText: normalizeSettingsSearchText(optionLabels(this.options.themeModeOptions)),
            title: localize("settings.theme.title", "Theme"),
          },
          {
            control: explorerDensitySelect.domNode,
            description: localize("settings.explorerDensity.description", "Choose how compact file rows appear in Explorer."),
            id: "settings-explorer-density-card",
            searchText: normalizeSettingsSearchText(optionLabels(appearanceSettings.explorerDensityOptions)),
            title: localize("settings.explorerDensity.title", "Explorer Density"),
          },
          {
            control: explorerBadgesSwitch.domNode,
            description: localize("settings.explorerBadges.description", "Show measurement badges beside files in Explorer."),
            id: "settings-explorer-badges-card",
            title: localize("settings.explorerBadges.title", "Explorer Badges"),
          },
          {
            control: badgeColorSwatches,
            description: localize("settings.explorerBadgeColors.description", "Choose Explorer badge colors by measurement label."),
            id: "settings-explorer-badge-colors-card",
            searchText: normalizeSettingsSearchText(
              optionLabels(appearanceSettings.explorerBadgeColorLabels),
              optionLabels(appearanceSettings.explorerBadgeColorOptions),
            ),
            title: localize("settings.explorerBadgeColors.title", "Badge Colors"),
          },
          {
            control: layoutResetActionContainer,
            description: localize("settings.layout.description", "Reset sidebar width and hidden workbench parts."),
            id: "settings-layout-card",
            title: localize("settings.layout.title", "Layout"),
          },
          {
            control: div(
              "settings-color-controls",
              colorInput,
              backgroundResetActionContainer,
              swatches,
            ),
            description: localize("settings.background.description", "Choose the workbench page background color."),
            id: "settings-background-card",
            title: localize("settings.background.title", "Background"),
          },
          {
            control: transparentChromeSwitch.domNode,
            description: localize("settings.transparentChrome.description", "Let the sidebar blend with the desktop window surface."),
            id: "settings-transparent-chrome-card",
            title: localize("settings.transparentChrome.title", "Translucent sidebar"),
          },
        ],
      },
    ]);

    return {
      backgroundResetAction,
      badgeColorButtons,
      badgeColorSwatches,
      colorInput,
      colorSwatches: swatches,
      element: appearanceTree.element,
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
    const originPathTitle = localize("settings.origin.title", "Origin Executable Path");
    const originPathDescription = localize("settings.origin.description", "Choose the Origin app used to open files.");
    const pathCard = card("settings-origin-path-card", "settings-card-block");
    setSettingsSearchText(
      pathCard,
      originPathTitle,
      originPathDescription,
      originSettings.currentPath,
      localize("settings.origin.choosePathButton", "Choose Origin.exe"),
      localize("settings.origin.checkButton", "Check Connection"),
      localize("settings.origin.notConfigurableHint", "Origin path configuration is available in Windows desktop app only."),
    );
    pathCard.append(
      headingBlock(originPathTitle, originPathDescription),
      this.createPathControls(originSettings),
    );
    const originSection = settingsSection(localize("settings.nav.origin", "Origin"), pathCard);
    const originList = getSettingsList(originSection);

    const cleanupTitle = localize("settings.origin.cleanup.title", "Runtime Cleanup");
    const cleanupDescription = localize("settings.origin.cleanup.description", "Manage automatic cleanup for Origin runtime cache.");
    const cleanupCard = card("settings-origin-cleanup-card", "settings-card-block");
    setSettingsSearchText(
      cleanupCard,
      cleanupTitle,
      cleanupDescription,
      localize("settings.origin.cleanup.enableLabel", "Auto cleanup"),
      optionLabels(this.options.cleanupEnabledOptions),
      localize("settings.origin.cleanup.keepSuccessLabel", "Keep successful jobs"),
      optionLabels(this.options.cleanupKeepSuccessOptions),
      localize("settings.origin.cleanup.failedDaysLabel", "Keep failed jobs (days)"),
      optionLabels(this.options.cleanupFailedDaysOptions),
      localize("settings.origin.cleanup.runButton", "Run Cleanup Now"),
    );
    cleanupCard.append(
      headingBlock(cleanupTitle, cleanupDescription),
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
    const aboutTree = this.renderDisposables.add(new SettingsTree());
    aboutTree.update([
      {
        id: "settings-about-section",
        title: localize("settings.nav.about", "About"),
        items: [
          {
            control: text("p", "settings-code-value", appUpdateSettings.currentVersion || localize("settings.about.versionUnknown", "Unknown")),
            description: localize("settings.about.versionDescription", "The installed Conductor Studio version."),
            id: "settings-about-version-card",
            title: localize("settings.about.versionTitle", "Current Version"),
          },
          {
            control: this.createButton({
              id: "settings-release-notes-show-btn",
              label: localize("settings.releaseNotes.showButton", "Show Release Notes"),
              onClick: this.options.handleShowReleaseNotes,
              variant: "secondary",
            }),
            description: localize("settings.releaseNotes.description", "Review recent product changes and fixes."),
            id: "settings-release-notes-card",
            searchText: localize("settings.releaseNotes.showButton", "Show Release Notes"),
            title: localize("settings.releaseNotes.title", "Release Notes"),
          },
          {
            control: this.createButton({
              id: "settings-user-guide-show-btn",
              label: localize("settings.userGuide.showButton", "Show User Guide"),
              onClick: () => this.showUserGuideDialog(),
              variant: "secondary",
            }),
            description: localize("settings.userGuide.description", "Open the bundled guide for common workflows."),
            id: "settings-user-guide-card",
            searchText: localize("settings.userGuide.showButton", "Show User Guide"),
            title: localize("settings.userGuide.title", "User Guide"),
          },
          {
            control: this.createButton({
              id: "settings-app-update-check-btn",
              label: this.options.appUpdateChecking ? localize("settings.appUpdate.checking", "Checking...") : localize("settings.appUpdate.checkButton", "Check for Updates"),
              onClick: this.options.handleCheckForUpdates,
              disabled: !appUpdateSettings.isAvailable || this.options.appUpdateChecking,
              variant: "secondary",
            }),
            description: localize("settings.appUpdate.description", "Check whether a newer version is available."),
            id: "settings-app-update-card",
            searchText: localize("settings.appUpdate.checkButton", "Check for Updates"),
            title: localize("settings.appUpdate.title", "App Updates"),
          },
        ],
      },
    ]);
    container.appendChild(aboutTree.element);
  }

  private showUserGuideDialog(): void {
    this.showSettingsDocumentDialog({
      idBase: "settings-user-guide",
      markdown: readBundledUserGuideMarkdown(),
      title: localize("settings.userGuide.dialogTitle", "User Guide"),
    });
  }

  private showSettingsDocumentDialog(options: SettingsDocumentDialogOptions): void {
    this.closeSettingsDocumentDialog();

    const disposeStore = new DisposableStore();
    const overlay = document.createElement("div");
    overlay.className = MODAL_OVERLAY_CLASS;

    const backdrop = document.createElement("div");
    backdrop.className = MODAL_BACKDROP_CLASS;
    overlay.appendChild(backdrop);

    const dialogId = getModalDialogId(options.idBase) ?? `${options.idBase}-dialog`;
    const titleId = getModalTitleId(options.idBase, options.idBase);
    const panel = document.createElement("section");
    panel.className = getModalDialogClassName({
      className: "settings-document-modal",
      size: "xl",
      variant: "solid",
    });
    panel.id = dialogId;
    panel.tabIndex = -1;
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "true");
    panel.setAttribute("aria-labelledby", titleId);

    const header = document.createElement("header");
    header.className = "modal_header settings-document-modal__header";
    const titleWrap = div("settings-document-modal__titleWrap");
    titleWrap.append(createLxIcon({ className: "settings-document-modal__titleIcon", icon: LxIcon.fileText, size: 18 }));
    const heading = document.createElement("h2");
    heading.className = "modal_title settings-document-modal__title";
    heading.id = titleId;
    heading.textContent = options.title;
    titleWrap.appendChild(heading);

    const closeActionBar = disposeStore.add(createModalCloseActionBar({
      className: "settings-document-modal__close",
      id: "settings.document.close",
      label: localize("settings.document.close", "Close"),
      run: () => this.closeSettingsDocumentDialog(),
    }));
    header.append(titleWrap, closeActionBar.domNode);

    const body = document.createElement("div");
    body.className = `modal_body ${MODAL_BODY_SCROLL_CLASS} settings-document-modal__body`;
    body.appendChild(renderWorkbenchMarkdown(options.markdown, {
      className: "settings-markdown",
    }));

    panel.append(header, body);
    overlay.appendChild(panel);
    document.body.appendChild(overlay);

    this.settingsDocumentDialog = { disposeStore, overlay };
    disposeStore.add(addDisposableListener(backdrop, EventType.MOUSE_DOWN, event => {
      if (event.target === backdrop) {
        this.closeSettingsDocumentDialog();
      }
    }));
    disposeStore.add(addDisposableListener(document, EventType.KEY_DOWN, event => {
      if (event.key === "Escape") {
        this.closeSettingsDocumentDialog();
      }
    }));
    queueMicrotask(() => panel.focus());
  }

  private closeSettingsDocumentDialog(): void {
    const dialog = this.settingsDocumentDialog;
    if (!dialog) {
      return;
    }
    this.settingsDocumentDialog = null;
    dialog.disposeStore.dispose();
    dialog.overlay.remove();
  }

  private createChartSettingsTree(settings: ChartDefaultSettings): readonly SettingsTreeSection[] {
    return [
      {
        id: "settings-chart-section",
        title: localize("settings.chartDefaults.sectionTitle", "Chart"),
        items: [
          {
            control: this.createSelect({
              id: "settings-default-transfer-y-scale-select",
              value: settings.defaultYScaleForTransfer,
              onChange: value => void settings.onDefaultYScaleForTransferChange(value),
              options: this.options.yScaleOptions,
              disabled: settings.isSaving,
            }),
            id: "settings-default-transfer-y-scale-card",
            description: localize("settings.chartScaleDefaults.description", "Choose the default Y-axis scale for each curve family."),
            searchText: normalizeSettingsSearchText(optionLabels(this.options.yScaleOptions)),
            title: localize("settings.chartScaleDefaults.transferCurve", "Transfer"),
          },
          {
            control: this.createSelect({
              id: "settings-default-output-y-scale-select",
              value: settings.defaultYScaleForOutput,
              onChange: value => void settings.onDefaultYScaleForOutputChange(value),
              options: this.options.yScaleOptions,
              disabled: settings.isSaving,
            }),
            id: "settings-default-output-y-scale-card",
            searchText: normalizeSettingsSearchText(
              localize("settings.chartScaleDefaults.description", "Choose the default Y-axis scale for each curve family."),
              optionLabels(this.options.yScaleOptions),
            ),
            title: localize("settings.chartScaleDefaults.outputCurve", "Output"),
          },
          {
            control: this.createSelect({
              id: "settings-default-cv-y-scale-select",
              value: settings.defaultYScaleForCv,
              onChange: value => void settings.onDefaultYScaleForCvChange(value),
              options: this.options.yScaleOptions,
              disabled: settings.isSaving,
            }),
            id: "settings-default-cv-y-scale-card",
            searchText: normalizeSettingsSearchText(
              localize("settings.chartScaleDefaults.description", "Choose the default Y-axis scale for each curve family."),
              optionLabels(this.options.yScaleOptions),
            ),
            title: localize("settings.chartScaleDefaults.cvCurve", "C-V"),
          },
          {
            control: this.createSelect({
              id: "settings-default-cf-y-scale-select",
              value: settings.defaultYScaleForCf,
              onChange: value => void settings.onDefaultYScaleForCfChange(value),
              options: this.options.yScaleOptions,
              disabled: settings.isSaving,
            }),
            id: "settings-default-cf-y-scale-card",
            searchText: normalizeSettingsSearchText(
              localize("settings.chartScaleDefaults.description", "Choose the default Y-axis scale for each curve family."),
              optionLabels(this.options.yScaleOptions),
            ),
            title: localize("settings.chartScaleDefaults.cfCurve", "C-f"),
          },
          {
            control: this.createSelect({
              id: "settings-default-pv-y-scale-select",
              value: settings.defaultYScaleForPv,
              onChange: value => void settings.onDefaultYScaleForPvChange(value),
              options: this.options.yScaleOptions,
              disabled: settings.isSaving,
            }),
            id: "settings-default-pv-y-scale-card",
            searchText: normalizeSettingsSearchText(
              localize("settings.chartScaleDefaults.description", "Choose the default Y-axis scale for each curve family."),
              optionLabels(this.options.yScaleOptions),
            ),
            title: localize("settings.chartScaleDefaults.pvCurve", "P-V"),
          },
        ],
      },
    ];
  }

  private createChartDefaults(settings: ChartDefaultSettings): HTMLElement {
    const container = card("settings-chart-defaults-card", "settings-card-block");
    const titleText = localize("settings.chartTypographyDefaults.title", "Chart Typography Defaults");
    const description = localize("settings.chartTypographyDefaults.description", "Choose default chart title and tick label sizes.");
    setSettingsSearchText(
      container,
      titleText,
      description,
      localize("settings.chartTypographyDefaults.titleSize", "Title"),
      localize("settings.chartTypographyDefaults.tickLabel", "Tick label"),
    );
    container.appendChild(headingBlock(
      titleText,
      description,
    ));
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
    const titleText = localize("settings.filenameMatching.title", "Filename Field Matching");
    const description = localize("settings.filenameMatching.description", "Choose which separator characters split filename fields for template rules.");
    const separatorsLabel = localize("settings.filenameMatching.label", "Field separators");
    const hint = localize("settings.filenameMatching.hint", "Each character acts as a separator. The default is {value}.", { value: DEFAULT_FILE_NAME_FIELD_SEPARATORS });
    setSettingsSearchText(container, titleText, description, separatorsLabel, hint);
    container.appendChild(headingBlock(titleText, description));
    const body = div("settings-field");
    body.append(
      label(separatorsLabel),
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
      text("p", "settings-hint", hint),
    );
    container.appendChild(body);
    appendFeedback(container, settings.feedback);
    return container;
  }

  private createPathControls(settings: OriginSettingsSectionProps): HTMLElement {
    const controls = div("settings-path-controls");
    const pathValue = settings.currentPath || (settings.isLoading
      ? localize("settings.origin.loading", "Loading...")
      : localize("settings.origin.notConfigurableHint", "Origin path configuration is available in Windows desktop app only."));
    controls.append(
      createInputBox({
        ariaLabel: localize("settings.origin.title", "Origin Executable Path"),
        id: "settings-origin-path-value-input",
        inputClassName: "inputbox_native inputbox_field settings-path-input",
        readOnly: true,
        value: pathValue,
      }),
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
    const titleText = localize("settings.origin.plot.title", "Default Plot Settings");
    const description = localize("settings.origin.plot.description", "Used by \"Open in Origin\".");
    setSettingsSearchText(
      container,
      titleText,
      description,
      localize("settings.origin.plot.xyPairsLabel", "XY pairs"),
      localize("settings.origin.plot.xyPairsHint", "LabTalk expression, for example ((1,2)) or ((1,2),(3,4))."),
      localize("settings.origin.plot.commandLabel", "Plot command override"),
      localize("settings.origin.plot.commandHint", "Optional full LabTalk command. If set, it overrides plot type and XY pairs."),
      localize("chart.legend.fontSize", "Legend size"),
      localize("settings.origin.plot.postCommandsLabel", "Post-plot commands"),
      localize("settings.origin.plot.postCommandsHint", "One LabTalk command per line, executed after plotting."),
    );
    container.appendChild(headingBlock(titleText, description));
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

  private createSelectWidget(options: FieldOptions, disposables?: DisposableStore): SelectBox<string> {
    const select = createSelectBox({
      id: options.id,
      className: "settings-select",
      disabled: options.disabled,
      value: options.value,
      options: options.options as readonly SelectBoxOption<string>[],
      onDidSelect: options.onChange,
    });
    (disposables ?? this.renderDisposables).add(select);
    return select;
  }

  private createSelect(options: FieldOptions, disposables?: DisposableStore): HTMLButtonElement {
    return this.createSelectWidget(options, disposables).domNode;
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
  }, disposables?: DisposableStore): SwitchWidget {
    const widget = (disposables ?? this.renderDisposables).add(new SwitchWidget({
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
      template.backgroundResetAction.enabled = !next.isSaving && next.backgroundColor !== next.backgroundColorDefault;
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

function optionLabels(options: readonly SelectOption[]): readonly string[] {
  return options.map(option => option.label);
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
