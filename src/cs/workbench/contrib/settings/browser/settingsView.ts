import { localize } from "src/cs/nls";
import { append, reset } from "src/cs/base/browser/dom";
import { createButton as createActionButton } from "src/cs/base/browser/ui/button/button";
import { DEFAULT_FILE_NAME_FIELD_SEPARATORS } from "src/cs/workbench/services/template/common/fileNameMatching";
import type { LanguagePreference } from "src/cs/platform/language/common/language";
import type { ThemeMode } from "src/cs/workbench/common/theme";
import type {
  Feedback,
  NotificationToastState,
} from "src/cs/workbench/contrib/settings/common/feedback";
import { notificationService } from "src/cs/workbench/services/notification/common/notificationService";
import "src/cs/base/browser/ui/inputbox/inputBox.css";
import "src/cs/workbench/contrib/settings/browser/media/settingsView.css";

type SelectOption = {
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

type AppearanceSettings = {
  backgroundColor: string;
  backgroundColorDefault: string;
  backgroundColorOptions: readonly string[];
  isSaving: boolean;
  transparentChrome: boolean;
  onBackgroundColorChange: (value: string) => Promise<void> | void;
  onBackgroundColorReset: () => Promise<void> | void;
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
  onLanguageChange: (language: LanguagePreference) => Promise<void> | void;
  onResetLayoutState: () => Promise<void> | void;
  theme: ThemeMode;
  onThemeChange: (theme: ThemeMode) => Promise<void> | void;
  originSettings: OriginSettingsSectionProps;
  windowCloseSettings: WindowCloseSettings;
};

export type SettingsSectionId = "general" | "appearance" | "origin" | "about";

export type SettingsViewOptions = SettingsViewProps & {
  activeSettingsSection: SettingsSectionId;
  appUpdateChecking: boolean;
  axisTitleFontSizeDraft: string;
  cleanupEnabledOptions: SelectOption[];
  cleanupFailedDaysOptions: SelectOption[];
  cleanupKeepSuccessOptions: SelectOption[];
  cleanupToast: NotificationToastState;
  closeCleanupToast: () => void;
  closeOriginHealthToast: () => void;
  fileNameFieldSeparatorsDraft: string;
  handleCheckForUpdates: () => void;
  originLegendFontSizeDraft: string;
  originHealthToast: NotificationToastState;
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
  settingsSections: SelectOptionWithId[];
  themeModeOptions: SelectOption[];
  tickLabelFontSizeDraft: string;
  windowCloseBehaviorOptions: SelectOption[];
  xyPairsDraft: string;
  yScaleOptions: SelectOption[];
};

type SelectOptionWithId = {
  id: SettingsSectionId;
  label: string;
};

type FieldOptions = {
  disabled?: boolean;
  id: string;
  onChange: (value: string) => void;
  options: SelectOption[];
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

const ORIGIN_HEALTH_TOAST_ID = "settings.originHealth";
const CLEANUP_TOAST_ID = "settings.cleanup";

export class SettingsView {
  private readonly root: HTMLElement;
  private options: SettingsViewOptions;

  constructor(container: HTMLElement, options: SettingsViewOptions) {
    this.root = document.createElement("section");
    this.root.className = "settings-view";
    this.root.setAttribute("aria-label", localize("settings.section.ariaLabel", "Settings"));
    container.appendChild(this.root);
    this.options = options;
    this.render();
  }

  update(options: SettingsViewOptions): void {
    this.options = options;
    this.root.setAttribute("aria-label", localize("settings.section.ariaLabel", "Settings"));
    this.render();
  }

  dispose(): void {
    notificationService.disposeToast(ORIGIN_HEALTH_TOAST_ID);
    notificationService.disposeToast(CLEANUP_TOAST_ID);
    this.root.remove();
  }

  private render(): void {
    reset(this.root);
    this.root.appendChild(this.createLayout());
    this.updateToasts();
  }

  private createLayout(): HTMLElement {
    const layout = div("settings-view-layout");
    layout.append(this.createNav(), this.createContent());
    return layout;
  }

  private createNav(): HTMLElement {
    const aside = document.createElement("aside");
    aside.className = "settings-view-nav";
    aside.setAttribute("aria-label", localize("settings.nav.ariaLabel", "Settings sections"));

    const nav = document.createElement("nav");
    nav.className = "settings-view-nav-list";
    for (const section of this.options.settingsSections) {
      const isActive = this.options.activeSettingsSection === section.id;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "settings-view-nav-item";
      button.dataset.selected = String(isActive);
      if (isActive) {
        button.setAttribute("aria-current", "page");
      }
      button.textContent = section.label;
      button.addEventListener("click", () => this.options.setActiveSettingsSection(section.id));
      nav.appendChild(button);
    }

    aside.appendChild(nav);
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
    container.append(
      cardRow("settings-language-card", localize("settings.language.title", "Language"), this.createSelect({
        id: "settings-language-dropdown",
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
      })),
      cardRow("settings-close-behavior-card", localize("settings.closeBehavior.title", "Close Window"), this.createSelect({
        id: "settings-close-behavior-dropdown",
        value: this.options.windowCloseSettings.behavior,
        onChange: value => {
          if (value === "minimizeToTray" || value === "quit") {
            void this.options.windowCloseSettings.onBehaviorChange(value);
          }
        },
        options: this.options.windowCloseBehaviorOptions,
        disabled: this.options.windowCloseSettings.isSaving,
      })),
    );

    container.append(
      this.createDefaults(this.options.chartDefaultSettings),
      this.createChartDefaults(this.options.chartDefaultSettings),
      this.createFileNameMatching(this.options.fileNameMatchingSettings),
    );
  }

  private renderAppearance(container: HTMLElement): void {
    const { appearanceSettings } = this.options;

    container.append(
      cardRow("settings-theme-card", localize("settings.theme.title", "Theme"), this.createSelect({
        id: "settings-theme-dropdown",
        value: this.options.theme,
        onChange: value => {
          if (value === "system" || value === "light" || value === "dark") {
            void this.options.onThemeChange(value);
          }
        },
        options: this.options.themeModeOptions,
      })),
    );

    const layoutCard = card("settings-layout-card", "settings-card-block");
    layoutCard.append(
      headingBlock(
        localize("settings.layout.title", "Layout"),
        localize("settings.layout.description", "Reset sidebar width and hidden workbench parts."),
      ),
      div("settings-actions-end", this.createButton({
        id: "settings-layout-reset-btn",
        label: localize("settings.layout.resetButton", "Reset Layout"),
        onClick: () => void this.options.onResetLayoutState(),
        variant: "secondary",
      })),
    );
    container.append(layoutCard);

    const backgroundCard = card("settings-background-card", "settings-card-block");
    const colorInput = document.createElement("input");
    colorInput.id = "settings-background-color-input";
    colorInput.className = "settings-color-input";
    colorInput.type = "color";
    colorInput.value = appearanceSettings.backgroundColor;
    colorInput.disabled = appearanceSettings.isSaving;
    colorInput.addEventListener("change", () => {
      void appearanceSettings.onBackgroundColorChange(colorInput.value);
    });

    const swatches = div("settings-color-swatches");
    for (const color of appearanceSettings.backgroundColorOptions) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "settings-color-swatch";
      button.disabled = appearanceSettings.isSaving;
      button.dataset.selected = String(color === appearanceSettings.backgroundColor);
      button.style.setProperty("--settings-swatch-color", color);
      button.setAttribute("aria-label", color);
      button.title = color;
      button.addEventListener("click", () => {
        void appearanceSettings.onBackgroundColorChange(color);
      });
      swatches.append(button);
    }

    backgroundCard.append(
      headingBlock(
        localize("settings.background.title", "Background"),
        localize("settings.background.description", "Choose the workbench page background color."),
      ),
      div("settings-color-controls", colorInput, swatches, this.createButton({
        id: "settings-background-reset-btn",
        label: localize("settings.background.reset", "Reset"),
        onClick: () => void appearanceSettings.onBackgroundColorReset(),
        disabled:
          appearanceSettings.isSaving ||
          appearanceSettings.backgroundColor === appearanceSettings.backgroundColorDefault,
        variant: "secondary",
      })),
    );
    container.append(backgroundCard);

    container.append(
      cardRow(
        "settings-transparent-chrome-card",
        localize("settings.transparentChrome.title", "Transparent page"),
        this.createToggle({
          checked: appearanceSettings.transparentChrome,
          disabled: appearanceSettings.isSaving,
          id: "settings-transparent-chrome-toggle",
          label: localize("settings.transparentChrome.toggle", "Use Mica/transparent page"),
          onChange: checked => void appearanceSettings.onTransparentChromeChange(checked),
        }),
      ),
    );
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
    container.appendChild(pathCard);

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
    container.appendChild(cleanupCard);

    container.appendChild(this.createOriginPlot(originSettings));
  }

  private renderAbout(container: HTMLElement): void {
    const { appUpdateSettings } = this.options;
    container.append(
      cardRow("settings-about-version-card", localize("settings.about.versionTitle", "Current Version"), text("p", "settings-code-value", appUpdateSettings.currentVersion || localize("settings.about.versionUnknown", "Unknown"))),
      cardRow("settings-app-update-card", localize("settings.appUpdate.title", "App Updates"), this.createButton({
        id: "settings-app-update-check-btn",
        label: this.options.appUpdateChecking ? localize("settings.appUpdate.checking", "Checking...") : localize("settings.appUpdate.checkButton", "Check for Updates"),
        onClick: this.options.handleCheckForUpdates,
        disabled: !appUpdateSettings.isAvailable || this.options.appUpdateChecking,
        variant: "secondary",
      })),
    );
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
        disabled: !settings.isConfigurable || settings.isSaving,
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

  private createSelect(options: FieldOptions): HTMLSelectElement {
    const select = document.createElement("select");
    select.id = options.id;
    select.className = "inputbox_field settings-select";
    select.value = options.value;
    select.disabled = options.disabled === true;
    for (const option of options.options) {
      const element = document.createElement("option");
      element.value = option.value;
      element.textContent = option.label;
      select.appendChild(element);
    }
    select.addEventListener("change", () => options.onChange(select.value));
    return select;
  }

  private createInput(options: TextInputOptions): HTMLInputElement {
    const input = document.createElement("input");
    input.id = options.id;
    input.className = options.inputClassName
      ? `inputbox_native inputbox_field ${options.inputClassName}`
      : "inputbox_native inputbox_field";
    input.value = options.value;
    input.disabled = options.disabled === true;
    input.placeholder = options.placeholder ?? "";
    input.addEventListener("input", () => options.onChange(input.value));
    if (options.onBlur) {
      input.addEventListener("blur", options.onBlur);
    }
    return input;
  }

  private createToggle(options: {
    checked: boolean;
    disabled?: boolean;
    id: string;
    label: string;
    onChange: (checked: boolean) => void;
  }): HTMLLabelElement {
    const labelElement = document.createElement("label");
    labelElement.className = "settings-toggle";
    const input = document.createElement("input");
    input.id = options.id;
    input.type = "checkbox";
    input.checked = options.checked;
    input.disabled = options.disabled === true;
    input.addEventListener("change", () => options.onChange(input.checked));
    labelElement.append(
      input,
      text("span", "settings-toggle-label", options.label),
    );
    return labelElement;
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

  private updateToasts(): void {
    this.updateToast(ORIGIN_HEALTH_TOAST_ID, this.options.originHealthToast, "settings-origin-health-toast", this.options.closeOriginHealthToast);
    this.updateToast(CLEANUP_TOAST_ID, this.options.cleanupToast, "settings-origin-cleanup-toast", this.options.closeCleanupToast);
  }

  private updateToast(id: string, state: NotificationToastState, dataUi: string, onClose: () => void): void {
    if (!state.isVisible) {
      notificationService.hideToast(id);
      return;
    }

    notificationService.showToast({
      dataUi,
      id,
      message: state.message,
      onClose,
      position: "fixed",
      type: state.type,
    });
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
  element.appendChild(div("settings-row",
    div("settings-row-title", title(titleText)),
    div("settings-row-control", control),
  ));
  return element;
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
