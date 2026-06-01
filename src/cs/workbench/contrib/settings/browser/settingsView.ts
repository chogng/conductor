import { append, reset } from "src/cs/base/browser/dom";
import { createButton as createActionButton } from "src/cs/base/browser/ui/button/button";
import Toast from "src/cs/base/browser/ui/toast/toast";
import { DEFAULT_FILE_NAME_FIELD_SEPARATORS } from "src/cs/workbench/common/deviceAnalysis/fileNameFieldMatching";
import type { ToastState } from "src/cs/workbench/common/deviceAnalysis/sharedTypes";
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
import { cx } from "src/utils/cx";
import "src/cs/workbench/contrib/settings/browser/media/settingsView.css";

type SelectOption = {
  label: string;
  value: string;
};

export type SettingsViewOptions = SettingsViewProps & {
  activeSettingsSection: SettingsSectionId;
  appUpdateChecking: boolean;
  axisTitleFontSizeDraft: string;
  cleanupEnabledOptions: SelectOption[];
  cleanupFailedDaysOptions: SelectOption[];
  cleanupKeepSuccessOptions: SelectOption[];
  cleanupToast: ToastState;
  closeCleanupToast: () => void;
  closeOriginHealthToast: () => void;
  fileNameFieldSeparatorsDraft: string;
  handleCheckForUpdates: () => void;
  legendFontSizeDraft: string;
  originHealthToast: ToastState;
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

export class SettingsView {
  private readonly root: HTMLElement;
  private readonly originHealthToast = new Toast();
  private readonly cleanupToast = new Toast();
  private options: SettingsViewOptions;

  constructor(container: HTMLElement, options: SettingsViewOptions) {
    this.root = document.createElement("section");
    this.root.className = "settings-view";
    this.root.setAttribute("aria-label", options.t("da_settings_section_aria_label"));
    container.appendChild(this.root);
    this.options = options;
    this.render();
  }

  update(options: SettingsViewOptions): void {
    this.options = options;
    this.root.setAttribute("aria-label", options.t("da_settings_section_aria_label"));
    this.render();
  }

  dispose(): void {
    this.originHealthToast.dispose();
    this.cleanupToast.dispose();
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
    aside.setAttribute("aria-label", this.options.t("da_settings_nav_aria_label"));

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
    else if (this.options.activeSettingsSection === "about") {
      this.renderAbout(content);
    }
    else {
      this.renderGeneral(content);
    }
    return content;
  }

  private renderGeneral(container: HTMLElement): void {
    const { t } = this.options;
    container.append(
      cardRow("analysis-settings-language-card", t("da_settings_language_title"), this.createSelect({
        id: "analysis-settings-language-dropdown",
        value: this.options.language,
        onChange: value => {
          if (value === "zh" || value === "en") {
            void this.options.onLanguageChange(value);
          }
        },
        options: [
          { value: "zh", label: t("da_settings_language_zh") },
          { value: "en", label: t("da_settings_language_en") },
        ],
      })),
      cardRow("analysis-settings-theme-card", t("da_settings_theme_title"), this.createSelect({
        id: "analysis-settings-theme-dropdown",
        value: this.options.theme,
        onChange: value => {
          if (value === "system" || value === "light" || value === "dark") {
            void this.options.onThemeChange(value);
          }
        },
        options: this.options.themeModeOptions,
      })),
      cardRow("analysis-settings-close-behavior-card", t("da_settings_close_behavior_title"), this.createSelect({
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

  private renderOrigin(container: HTMLElement): void {
    const { originSettings, t } = this.options;
    const pathCard = card("analysis-settings-origin-path-card", "settings-card-block");
    pathCard.append(
      headingBlock(t("da_settings_origin_title"), t("da_settings_origin_desc")),
      this.createPathControls(originSettings),
    );
    if (!originSettings.isConfigurable) {
      pathCard.appendChild(text("p", "settings-description", t("da_settings_origin_not_configurable_hint")));
    }
    container.appendChild(pathCard);

    const cleanupCard = card("analysis-settings-origin-cleanup-card", "settings-card-block");
    cleanupCard.append(
      headingBlock(t("da_settings_origin_cleanup_title"), t("da_settings_origin_cleanup_desc")),
      this.createOriginCleanupGrid(originSettings),
      div("settings-actions-end", this.createButton({
        id: "analysis-settings-origin-cleanup-run-btn",
        label: originSettings.cleanupRunning ? t("da_settings_origin_cleanup_running") : t("da_settings_origin_cleanup_run_btn"),
        onClick: () => void originSettings.onRunCleanupNow(),
        disabled: !originSettings.isCleanupAvailable || originSettings.cleanupRunning || originSettings.cleanupSaving,
        variant: "secondary",
      })),
    );
    container.appendChild(cleanupCard);

    container.appendChild(this.createOriginPlot(originSettings));
  }

  private renderAbout(container: HTMLElement): void {
    const { appUpdateSettings, t } = this.options;
    container.append(
      cardRow("analysis-settings-about-version-card", t("da_settings_about_version_title"), text("p", "settings-code-value", appUpdateSettings.currentVersion || t("da_settings_about_version_unknown"))),
      cardRow("analysis-settings-app-update-card", t("da_settings_app_update_title"), this.createButton({
        id: "analysis-settings-app-update-check-btn",
        label: this.options.appUpdateChecking ? t("da_settings_app_update_checking") : t("da_settings_app_update_check_btn"),
        onClick: this.options.handleCheckForUpdates,
        disabled: !appUpdateSettings.isAvailable || this.options.appUpdateChecking,
        variant: "secondary",
      })),
    );
  }

  private createAnalysisDefaults(settings: AnalysisDefaultSettings): HTMLElement {
    const { t } = this.options;
    const container = card("analysis-settings-analysis-defaults-card", "settings-card-block");
    container.appendChild(title(t("da_settings_analysis_defaults_title")));
    const grid = div("settings-grid settings-grid--five");
    const fields: Array<[string, string, keyof Pick<AnalysisDefaultSettings, "defaultYScaleForTransfer" | "defaultYScaleForOutput" | "defaultYScaleForCv" | "defaultYScaleForCf" | "defaultYScaleForPv">, (value: string) => void]> = [
      ["analysis-settings-default-transfer-y-scale-select", t("da_settings_analysis_defaults_transfer_curve"), "defaultYScaleForTransfer", value => void settings.onDefaultYScaleForTransferChange(value)],
      ["analysis-settings-default-output-y-scale-select", t("da_settings_analysis_defaults_output_curve"), "defaultYScaleForOutput", value => void settings.onDefaultYScaleForOutputChange(value)],
      ["analysis-settings-default-cv-y-scale-select", t("da_settings_analysis_defaults_cv_curve"), "defaultYScaleForCv", value => void settings.onDefaultYScaleForCvChange(value)],
      ["analysis-settings-default-cf-y-scale-select", t("da_settings_analysis_defaults_cf_curve"), "defaultYScaleForCf", value => void settings.onDefaultYScaleForCfChange(value)],
      ["analysis-settings-default-pv-y-scale-select", t("da_settings_analysis_defaults_pv_curve"), "defaultYScaleForPv", value => void settings.onDefaultYScaleForPvChange(value)],
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
    const { t } = this.options;
    const container = card("analysis-settings-chart-defaults-card", "settings-card-block");
    container.appendChild(title(t("da_settings_chart_defaults_title")));
    const grid = div("settings-grid settings-grid--three");
    grid.append(
      field(t("da_settings_chart_defaults_legend"), this.createInput({
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
      field(t("da_settings_chart_defaults_title_size"), this.createInput({
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
      field(t("da_settings_chart_defaults_tick_label"), this.createInput({
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
    const { t } = this.options;
    const container = card("analysis-settings-storage-card", "settings-card-block");
    container.appendChild(headingBlock(t("da_settings_storage_title"), t("da_settings_storage_desc")));
    const controls = div("settings-path-controls");
    controls.id = "analysis-settings-origin-path-controls";
    controls.append(
      div("settings-path-value",
        text("p", "settings-path-text", settings.currentPath || (settings.isLoading ? t("da_settings_storage_loading") : settings.isConfigurable ? t("da_settings_storage_unavailable") : t("da_settings_storage_not_configurable_hint"))),
      ),
      this.createButton({
        id: "analysis-settings-persistence-path-choose-btn",
        label: t("da_settings_storage_choose_path_btn"),
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
    const { t } = this.options;
    const container = card("analysis-settings-filename-matching-card", "settings-card-block");
    container.appendChild(headingBlock(t("da_settings_filename_matching_title"), t("da_settings_filename_matching_desc")));
    const body = div("settings-field");
    body.append(
      label(t("da_settings_filename_matching_label")),
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
      text("p", "settings-hint", t("da_settings_filename_matching_hint", { value: DEFAULT_FILE_NAME_FIELD_SEPARATORS })),
    );
    container.appendChild(body);
    appendFeedback(container, settings.feedback);
    return container;
  }

  private createPathControls(settings: OriginSettings): HTMLElement {
    const { t } = this.options;
    const controls = div("settings-path-controls");
    controls.append(
      div("settings-path-value",
        text("p", "settings-path-text", settings.currentPath || (settings.isLoading ? t("da_settings_origin_loading") : t("da_settings_origin_not_configurable_hint"))),
      ),
      this.createButton({
        id: "analysis-settings-origin-path-choose-btn",
        label: t("da_settings_origin_choose_path_btn"),
        onClick: () => void settings.onChoosePath(),
        disabled: !settings.isConfigurable || settings.isSaving,
        variant: "primary",
      }),
      this.createButton({
        id: "analysis-settings-origin-health-check-btn",
        label: settings.isHealthChecking ? t("da_settings_origin_checking") : t("da_settings_origin_check_btn"),
        onClick: () => void settings.onCheckHealth(),
        disabled: !settings.isHealthCheckAvailable || settings.isLoading || settings.isSaving || settings.isHealthChecking,
        variant: "secondary",
      }),
    );
    return controls;
  }

  private createOriginCleanupGrid(settings: OriginSettings): HTMLElement {
    const { t } = this.options;
    const grid = div("settings-grid settings-grid--three");
    grid.append(
      field(t("da_settings_origin_cleanup_enable_label"), this.createSelect({
        id: "analysis-settings-origin-cleanup-enabled-select",
        value: String(Boolean(settings.cleanupEnabled)),
        onChange: value => void settings.onCleanupEnabledChange(value === "true"),
        options: this.options.cleanupEnabledOptions,
        disabled: settings.cleanupSaving,
      })),
      field(t("da_settings_origin_cleanup_keep_success_label"), this.createSelect({
        id: "analysis-settings-origin-cleanup-keep-success-select",
        value: String(settings.cleanupKeepSuccessJobs ?? 0),
        onChange: value => void settings.onCleanupKeepSuccessJobsChange(value),
        options: this.options.cleanupKeepSuccessOptions,
        disabled: settings.cleanupSaving,
      })),
      field(t("da_settings_origin_cleanup_failed_days_label"), this.createSelect({
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
    const { t } = this.options;
    const container = card("analysis-settings-origin-plot-card", "settings-card-block");
    container.appendChild(headingBlock(t("da_settings_origin_plot_title"), t("da_settings_origin_plot_desc")));
    container.append(
      field(t("da_settings_origin_plot_xy_pairs_label"), this.createInput({
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
      }), t("da_settings_origin_plot_xy_pairs_hint")),
      field(t("da_settings_origin_plot_command_label"), this.createInput({
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
      }), t("da_settings_origin_plot_command_hint")),
      this.createPostCommandsField(settings),
    );
    appendFeedback(container, settings.plotFeedback);
    return container;
  }

  private createPostCommandsField(settings: OriginSettings): HTMLElement {
    const { t } = this.options;
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
      label(t("da_settings_origin_plot_post_commands_label")),
      textarea,
      text("p", "settings-hint", t("da_settings_origin_plot_post_commands_hint")),
    );
    return container;
  }

  private createSelect(options: FieldOptions): HTMLSelectElement {
    const select = document.createElement("select");
    select.id = options.id;
    select.className = "input_field ui-select_field--md settings-select";
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
    input.className = cx("input_native input_field input_field--md", options.inputClassName);
    input.value = options.value;
    input.disabled = options.disabled === true;
    input.placeholder = options.placeholder ?? "";
    input.addEventListener("input", () => options.onChange(input.value));
    if (options.onBlur) {
      input.addEventListener("blur", options.onBlur);
    }
    return input;
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
    this.updateToast(this.originHealthToast, this.options.originHealthToast, "analysis-settings-origin-health-toast", this.options.closeOriginHealthToast);
    this.updateToast(this.cleanupToast, this.options.cleanupToast, "analysis-settings-origin-cleanup-toast", this.options.closeCleanupToast);
  }

  private updateToast(toast: Toast, state: ToastState, dataUi: string, onClose: () => void): void {
    if (!state.isVisible) {
      toast.hide();
      return;
    }

    toast.show({
      container: this.root,
      dataUi,
      message: state.message,
      onClose,
      position: "absolute",
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
  const element = div(cx("settings-card", className));
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
