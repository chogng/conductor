import { localize } from "src/cs/nls";
import { append, reset } from "src/cs/base/browser/dom";
import { createButton as createActionButton } from "src/cs/base/browser/ui/button/button";
import { DEFAULT_FILE_NAME_FIELD_SEPARATORS } from "src/cs/workbench/contrib/template/common/fileNameMatching";
import type { NotificationToastState } from "src/cs/workbench/contrib/settings/common/feedback";
import { notificationService } from "src/cs/workbench/services/notification/common/notificationService";
import type {
  AnalysisDefaultSettings,
  AppUpdateSettings,
  FileNameMatchingSettings,
  OriginSettings,
  SettingsViewProps,
  SettingsSectionId,
  StorageSettings,
  WindowCloseSettings,
} from "src/cs/workbench/contrib/settings/settingsViewTypes";
import type { HelpWindowKind } from "src/cs/workbench/contrib/help/common/helpWindow";
import "src/cs/base/browser/ui/inputbox/inputBox.css";
import "src/cs/workbench/contrib/settings/browser/media/settingsView.css";

type SelectOption = {
  label: string;
  value: string;
};

export type SettingsViewOptions = SettingsViewProps & {
  activeSettingsSection: SettingsSectionId;
  appUpdateChecking: boolean;
  axisTitleFontSizeDraft: string;
  canOpenHelpWindow: boolean;
  cleanupEnabledOptions: SelectOption[];
  cleanupFailedDaysOptions: SelectOption[];
  cleanupKeepSuccessOptions: SelectOption[];
  cleanupToast: NotificationToastState;
  closeCleanupToast: () => void;
  closeOriginHealthToast: () => void;
  fileNameFieldSeparatorsDraft: string;
  handleCheckForUpdates: () => void;
  handleOpenHelpWindow: (kind: HelpWindowKind) => void;
  legendFontSizeDraft: string;
  originHealthToast: NotificationToastState;
  plotCommandDraft: string;
  postCommandsDraft: string;
  setActiveSettingsSection: (section: SettingsSectionId) => void;
  setAxisTitleFontSizeDraft: (value: string) => void;
  setFileNameFieldSeparatorsDraft: (value: string) => void;
  setLegendFontSizeDraft: (value: string) => void;
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
    this.root.setAttribute("aria-label", localize("settings_section_aria_label", "Settings"));
    container.appendChild(this.root);
    this.options = options;
    this.render();
  }

  update(options: SettingsViewOptions): void {
    this.options = options;
    this.root.setAttribute("aria-label", localize("settings_section_aria_label", "Settings"));
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
    aside.setAttribute("aria-label", localize("settings_nav_aria_label", "Settings sections"));

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
      cardRow("analysis-settings-language-card", localize("settings_language_title", "Language"), this.createSelect({
        id: "analysis-settings-language-dropdown",
        value: this.options.language,
        onChange: value => {
          if (value === "system" || value === "zh" || value === "en") {
            void this.options.onLanguageChange(value);
          }
        },
        options: [
          { value: "system", label: localize("settings_language_system", "System") },
          { value: "zh", label: localize("settings_language_zh", "中文") },
          { value: "en", label: localize("settings_language_en", "English") },
        ],
      })),
      cardRow("analysis-settings-close-behavior-card", localize("settings_close_behavior_title", "Close Window"), this.createSelect({
        id: "analysis-settings-close-behavior-dropdown",
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
      this.createAnalysisDefaults(this.options.analysisDefaultSettings),
      this.createChartDefaults(this.options.analysisDefaultSettings),
      this.createStorage(this.options.storageSettings),
      this.createFileNameMatching(this.options.fileNameMatchingSettings),
    );
  }

  private renderAppearance(container: HTMLElement): void {
    const { appearanceSettings } = this.options;

    container.append(
      cardRow("analysis-settings-theme-card", displayText(localize("settings_theme_title", "Theme"), "Theme"), this.createSelect({
        id: "analysis-settings-theme-dropdown",
        value: this.options.theme,
        onChange: value => {
          if (value === "system" || value === "light" || value === "dark") {
            void this.options.onThemeChange(value);
          }
        },
        options: this.options.themeModeOptions,
      })),
    );

    const backgroundCard = card("analysis-settings-background-card", "settings-card-block");
    const colorInput = document.createElement("input");
    colorInput.id = "analysis-settings-background-color-input";
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
        displayText(localize("settings_background_title", "Background"), "Background"),
        displayText(localize("settings_background_desc", "Choose the workbench page background color."), "Choose the workbench page background color."),
      ),
      div("settings-color-controls", colorInput, swatches, this.createButton({
        id: "analysis-settings-background-reset-btn",
        label: displayText(localize("settings_background_reset", "Reset"), "Reset"),
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
        "analysis-settings-transparent-chrome-card",
        displayText(localize("settings_transparent_chrome_title", "Transparent page"), "Transparent page"),
        this.createToggle({
          checked: appearanceSettings.transparentChrome,
          disabled: appearanceSettings.isSaving,
          id: "analysis-settings-transparent-chrome-toggle",
          label: displayText(localize("settings_transparent_chrome_toggle", "Use Mica/transparent page"), "Use Mica/transparent page"),
          onChange: checked => void appearanceSettings.onTransparentChromeChange(checked),
        }),
      ),
    );
  }

  private renderOrigin(container: HTMLElement): void {
    const { originSettings } = this.options;
    const pathCard = card("analysis-settings-origin-path-card", "settings-card-block");
    pathCard.append(
      headingBlock(localize("settings_origin_title", "Origin Executable Path"), localize("settings_origin_desc", "Choose the Origin app used to open files.")),
      this.createPathControls(originSettings),
    );
    if (!originSettings.isConfigurable) {
      pathCard.appendChild(text("p", "settings-description", localize("settings_origin_not_configurable_hint", "Origin path configuration is available in Windows desktop app only.")));
    }
    container.appendChild(pathCard);

    const cleanupCard = card("analysis-settings-origin-cleanup-card", "settings-card-block");
    cleanupCard.append(
      headingBlock(localize("settings_origin_cleanup_title", "Runtime Cleanup"), localize("settings_origin_cleanup_desc", "Manage automatic cleanup for Origin runtime cache.")),
      this.createOriginCleanupGrid(originSettings),
      div("settings-actions-end", this.createButton({
        id: "analysis-settings-origin-cleanup-run-btn",
        label: originSettings.cleanupRunning ? localize("settings_origin_cleanup_running", "Cleaning...") : localize("settings_origin_cleanup_run_btn", "Run Cleanup Now"),
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
      cardRow("analysis-settings-about-version-card", localize("settings_about_version_title", "Current Version"), text("p", "settings-code-value", appUpdateSettings.currentVersion || localize("settings_about_version_unknown", "Unknown"))),
      cardRow("analysis-settings-app-update-card", localize("settings_app_update_title", "App Updates"), this.createButton({
        id: "analysis-settings-app-update-check-btn",
        label: this.options.appUpdateChecking ? localize("settings_app_update_checking", "Checking...") : localize("settings_app_update_check_btn", "Check for Updates"),
        onClick: this.options.handleCheckForUpdates,
        disabled: !appUpdateSettings.isAvailable || this.options.appUpdateChecking,
        variant: "secondary",
      })),
      cardRow("analysis-settings-help-card", localize("settings_help_title", "Help"), div("settings-button-row",
        this.createButton({
          id: "analysis-settings-update-log-btn",
          label: localize("settings_help_update_log", "Update Log"),
          onClick: () => this.options.handleOpenHelpWindow("changelog"),
          disabled: !this.options.canOpenHelpWindow,
          variant: "secondary",
        }),
        this.createButton({
          id: "analysis-settings-user-guide-btn",
          label: localize("settings_help_user_guide", "User Guide"),
          onClick: () => this.options.handleOpenHelpWindow("guide"),
          disabled: !this.options.canOpenHelpWindow,
          variant: "secondary",
        }),
      )),
    );
  }

  private createAnalysisDefaults(settings: AnalysisDefaultSettings): HTMLElement {
    const container = card("analysis-settings-analysis-defaults-card", "settings-card-block");
    container.appendChild(title(localize("settings_analysis_defaults_title", "Analysis Defaults")));
    const grid = div("settings-grid settings-grid--five");
    const fields: Array<[string, string, keyof Pick<AnalysisDefaultSettings, "defaultYScaleForTransfer" | "defaultYScaleForOutput" | "defaultYScaleForCv" | "defaultYScaleForCf" | "defaultYScaleForPv">, (value: string) => void]> = [
      ["analysis-settings-default-transfer-y-scale-select", localize("settings_analysis_defaults_transfer_curve", "Transfer"), "defaultYScaleForTransfer", value => void settings.onDefaultYScaleForTransferChange(value)],
      ["analysis-settings-default-output-y-scale-select", localize("settings_analysis_defaults_output_curve", "Output"), "defaultYScaleForOutput", value => void settings.onDefaultYScaleForOutputChange(value)],
      ["analysis-settings-default-cv-y-scale-select", localize("settings_analysis_defaults_cv_curve", "C-V"), "defaultYScaleForCv", value => void settings.onDefaultYScaleForCvChange(value)],
      ["analysis-settings-default-cf-y-scale-select", localize("settings_analysis_defaults_cf_curve", "C-f"), "defaultYScaleForCf", value => void settings.onDefaultYScaleForCfChange(value)],
      ["analysis-settings-default-pv-y-scale-select", localize("settings_analysis_defaults_pv_curve", "P-V"), "defaultYScaleForPv", value => void settings.onDefaultYScaleForPvChange(value)],
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

  private createChartDefaults(settings: AnalysisDefaultSettings): HTMLElement {
    const container = card("analysis-settings-chart-defaults-card", "settings-card-block");
    container.appendChild(title(localize("settings_chart_defaults_title", "Chart Typography Defaults")));
    const grid = div("settings-grid settings-grid--three");
    grid.append(
      field(localize("settings_chart_defaults_legend", "Legend"), this.createInput({
        id: "analysis-settings-default-legend-font-size-input",
        value: this.options.legendFontSizeDraft,
        onChange: this.options.setLegendFontSizeDraft,
        onBlur: () => {
          if (this.options.legendFontSizeDraft !== String(settings.legendFontSize ?? "")) {
            void settings.onLegendFontSizeChange(this.options.legendFontSizeDraft.trim());
          }
        },
        placeholder: "18",
        disabled: settings.isSaving,
      })),
      field(localize("settings_chart_defaults_title_size", "Title"), this.createInput({
        id: "analysis-settings-default-title-font-size-input",
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
      field(localize("settings_chart_defaults_tick_label", "Tick label"), this.createInput({
        id: "analysis-settings-default-tick-label-font-size-input",
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

  private createStorage(settings: StorageSettings): HTMLElement {
    const container = card("analysis-settings-storage-card", "settings-card-block");
    container.appendChild(headingBlock(localize("settings_storage_title", "User Configuration Path"), localize("settings_storage_desc", "Choose where templates and settings are stored.")));
    const controls = div("settings-path-controls");
    controls.id = "analysis-settings-origin-path-controls";
    controls.append(
      div("settings-path-value",
        text("p", "settings-path-text", settings.currentPath || (settings.isLoading ? localize("settings_storage_loading", "Loading...") : settings.isConfigurable ? localize("settings_storage_unavailable", "User config path unavailable.") : localize("settings_storage_not_configurable_hint", "Path configuration is available in desktop app only."))),
      ),
      this.createButton({
        id: "analysis-settings-persistence-path-choose-btn",
        label: localize("settings_storage_choose_path_btn", "Choose Path"),
        onClick: settings.onChoosePath,
        disabled: !settings.isConfigurable || settings.isSaving,
        variant: "primary",
      }),
    );
    container.appendChild(controls);
    appendFeedback(container, settings.feedback);
    return container;
  }

  private createFileNameMatching(settings: FileNameMatchingSettings): HTMLElement {
    const container = card("analysis-settings-filename-matching-card", "settings-card-block");
    container.appendChild(headingBlock(localize("settings_filename_matching_title", "Filename Field Matching"), localize("settings_filename_matching_desc", "Choose which separator characters split filename fields for template rules.")));
    const body = div("settings-field");
    body.append(
      label(localize("settings_filename_matching_label", "Field separators")),
      this.createInput({
        id: "analysis-settings-filename-separators-input",
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
      text("p", "settings-hint", localize("settings_filename_matching_hint", "Each character acts as a separator. The default is {value}.", { value: DEFAULT_FILE_NAME_FIELD_SEPARATORS })),
    );
    container.appendChild(body);
    appendFeedback(container, settings.feedback);
    return container;
  }

  private createPathControls(settings: OriginSettings): HTMLElement {
    const controls = div("settings-path-controls");
    controls.append(
      div("settings-path-value",
        text("p", "settings-path-text", settings.currentPath || (settings.isLoading ? localize("settings_origin_loading", "Loading...") : localize("settings_origin_not_configurable_hint", "Origin path configuration is available in Windows desktop app only."))),
      ),
      this.createButton({
        id: "analysis-settings-origin-path-choose-btn",
        label: localize("settings_origin_choose_path_btn", "Choose Origin.exe"),
        onClick: () => void settings.onChoosePath(),
        disabled: !settings.isConfigurable || settings.isSaving,
        variant: "primary",
      }),
      this.createButton({
        id: "analysis-settings-origin-health-check-btn",
        label: settings.isHealthChecking ? localize("settings_origin_checking", "Checking...") : localize("settings_origin_check_btn", "Check Connection"),
        onClick: () => void settings.onCheckHealth(),
        disabled: !settings.isHealthCheckAvailable || settings.isLoading || settings.isSaving || settings.isHealthChecking,
        variant: "secondary",
      }),
    );
    return controls;
  }

  private createOriginCleanupGrid(settings: OriginSettings): HTMLElement {
    const grid = div("settings-grid settings-grid--three");
    grid.append(
      field(localize("settings_origin_cleanup_enable_label", "Auto cleanup"), this.createSelect({
        id: "analysis-settings-origin-cleanup-enabled-select",
        value: String(Boolean(settings.cleanupEnabled)),
        onChange: value => void settings.onCleanupEnabledChange(value === "true"),
        options: this.options.cleanupEnabledOptions,
        disabled: settings.cleanupSaving,
      })),
      field(localize("settings_origin_cleanup_keep_success_label", "Keep successful jobs"), this.createSelect({
        id: "analysis-settings-origin-cleanup-keep-success-select",
        value: String(settings.cleanupKeepSuccessJobs ?? 0),
        onChange: value => void settings.onCleanupKeepSuccessJobsChange(value),
        options: this.options.cleanupKeepSuccessOptions,
        disabled: settings.cleanupSaving,
      })),
      field(localize("settings_origin_cleanup_failed_days_label", "Keep failed jobs (days)"), this.createSelect({
        id: "analysis-settings-origin-cleanup-failed-days-select",
        value: String(settings.cleanupFailedRetentionDays ?? 7),
        onChange: value => void settings.onCleanupFailedRetentionDaysChange(value),
        options: this.options.cleanupFailedDaysOptions,
        disabled: settings.cleanupSaving,
      })),
    );
    return grid;
  }

  private createOriginPlot(settings: OriginSettings): HTMLElement {
    const container = card("analysis-settings-origin-plot-card", "settings-card-block");
    container.appendChild(headingBlock(localize("settings_origin_plot_title", "Default Plot Settings"), localize("settings_origin_plot_desc", "Used by \"Open in Origin\".")));
    container.append(
      field(localize("settings_origin_plot_xy_pairs_label", "XY pairs"), this.createInput({
        id: "analysis-settings-origin-plot-xy-pairs-input",
        value: this.options.xyPairsDraft,
        onChange: this.options.setXyPairsDraft,
        onBlur: () => {
          const nextValue = this.options.xyPairsDraft.trim();
          if (nextValue !== (settings.plotXyPairs ?? "")) {
            void settings.onPlotXyPairsChange(nextValue);
          }
        },
        disabled: settings.plotSaving || !settings.isConfigurable,
      }), localize("settings_origin_plot_xy_pairs_hint", "LabTalk expression, for example ((1,2)) or ((1,2),(3,4)).")),
      field(localize("settings_origin_plot_command_label", "Plot command override"), this.createInput({
        id: "analysis-settings-origin-plot-command-input",
        value: this.options.plotCommandDraft,
        onChange: this.options.setPlotCommandDraft,
        onBlur: () => {
          const nextValue = this.options.plotCommandDraft.trim();
          if (nextValue !== (settings.plotCommand ?? "")) {
            void settings.onPlotCommandChange(nextValue);
          }
        },
        disabled: settings.plotSaving || !settings.isConfigurable,
      }), localize("settings_origin_plot_command_hint", "Optional full LabTalk command. If set, it overrides plot type and XY pairs.")),
      this.createPostCommandsField(settings),
    );
    appendFeedback(container, settings.plotFeedback);
    return container;
  }

  private createPostCommandsField(settings: OriginSettings): HTMLElement {
    const container = div("settings-field");
    const textarea = document.createElement("textarea");
    textarea.id = "analysis-settings-origin-plot-post-commands-input";
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
      label(localize("settings_origin_plot_post_commands_label", "Post-plot commands")),
      textarea,
      text("p", "settings-hint", localize("settings_origin_plot_post_commands_hint", "One LabTalk command per line, executed after plotting.")),
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
    this.updateToast(ORIGIN_HEALTH_TOAST_ID, this.options.originHealthToast, "analysis-settings-origin-health-toast", this.options.closeOriginHealthToast);
    this.updateToast(CLEANUP_TOAST_ID, this.options.cleanupToast, "analysis-settings-origin-cleanup-toast", this.options.closeCleanupToast);
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

function displayText(value: string, fallback: string): string {
  return value.includes("_") ? fallback : value;
}

function appendFeedback(container: HTMLElement, feedback: { type: "idle" | "success" | "error"; message: string } | undefined): void {
  if (!feedback?.message) {
    return;
  }

  container.appendChild(text("p", feedback.type === "error" ? "settings-feedback settings-feedback--error" : "settings-feedback settings-feedback--success", feedback.message));
}

