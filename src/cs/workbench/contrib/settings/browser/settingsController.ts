import { localize } from "src/cs/nls";
import {
  DEFAULT_ORIGIN_PLOT_OPTIONS,
  normalizeOriginPlotOptions,
  normalizeOriginPostCommands,
  originPostCommandsToMultiline,
} from "src/cs/workbench/contrib/origin/common/originPlotOptions";
import { normalizePlotAxisSettings } from "src/cs/workbench/contrib/plot/common/plotAxisSettings";
import { normalizeFileNameFieldSeparators } from "src/cs/workbench/contrib/template/common/fileNameMatching";
import type { Feedback, NotificationToastState } from "src/cs/workbench/contrib/settings/common/feedback";
import type { LanguagePreference } from "src/cs/platform/language/common/language";
import type { ThemeMode } from "src/cs/workbench/common/theme";
import type {
  AppearanceSettings,
  AnalysisDefaultSettings,
  AppUpdateSettings,
  FileNameMatchingSettings,
  OriginSettings,
  SettingsSectionId,
  StorageSettings,
  WindowCloseSettings,
} from "src/cs/workbench/contrib/settings/settingsViewTypes";
import {
  IDLE_FEEDBACK,
  normalizeBoundedInt,
  normalizeTrimmedString,
  ORIGIN_CLEANUP_DEFAULTS,
  type AnalysisSettings,
  type PersistencePathInfo,
} from "src/cs/workbench/contrib/settings/settingsShared";
import type { ISettingsService, SettingsServiceOptions } from "src/cs/workbench/contrib/settings/common/settings";
import { SettingsView, type SettingsViewOptions } from "src/cs/workbench/contrib/settings/browser/settingsView";
import {
  DEFAULT_WORKBENCH_BACKGROUND_COLOR,
  normalizeWorkbenchAppearance,
  normalizeWorkbenchBackgroundColor,
} from "src/cs/workbench/browser/appearance";
import { BrowserHelpWindowService } from "src/cs/workbench/contrib/help/browser/helpWindowService";
import type { HelpWindowKind } from "src/cs/workbench/contrib/help/common/helpWindow";

export type SettingsControllerOptions = {
  appUpdateSettings: AppUpdateSettings;
  analysisSettings: AnalysisSettings | null;
  analysisSettingsLoaded: boolean;
  handleLanguageChange: (language: LanguagePreference) => Promise<void> | void;
  handleResetLayoutState: () => Promise<void> | void;
  handleThemeChange: (theme: ThemeMode) => Promise<void> | void;
  handleUpdateAnalysisSettings: (
    updates: unknown,
  ) => Promise<AnalysisSettings | null>;
  isWindowsDesktopShell: boolean;
  language: LanguagePreference;
  mergeAnalysisSettings: (nextSettings: AnalysisSettings | null) => void;
  theme: ThemeMode;
};

type SelectOption = {
  label: string;
  value: string;
};

type SettingsDraftState = {
  activeSettingsSection: SettingsSectionId;
  appUpdateChecking: boolean;
  axisTitleFontSizeDraft: string;
  cleanupToast: NotificationToastState;
  fileNameFieldSeparatorsDraft: string;
  legendFontSizeDraft: string;
  originHealthToast: NotificationToastState;
  plotCommandDraft: string;
  postCommandsDraft: string;
  tickLabelFontSizeDraft: string;
  xyPairsDraft: string;
};

export class SettingsController {
  private readonly service: ISettingsService;
  private readonly helpWindowService = new BrowserHelpWindowService();
  private readonly view: SettingsView;
  private disposed = false;
  private originPathRequested = false;
  private persistencePathInfo: PersistencePathInfo | null = null;
  private persistencePathLoading = false;
  private persistencePathSaving = false;
  private persistencePathFeedback: Feedback = IDLE_FEEDBACK;
  private originExePath = "";
  private originPathLoading = true;
  private originPathSaving = false;
  private originHealthChecking = false;
  private originPathFeedback: Feedback = IDLE_FEEDBACK;
  private originCleanupSaving = false;
  private originCleanupRunning = false;
  private originCleanupFeedback: Feedback = IDLE_FEEDBACK;
  private originPlotSaving = false;
  private originPlotFeedback: Feedback = IDLE_FEEDBACK;
  private fileNameMatchingSaving = false;
  private fileNameMatchingFeedback: Feedback = IDLE_FEEDBACK;
  private analysisDefaultsSaving = false;
  private analysisDefaultsFeedback: Feedback = IDLE_FEEDBACK;
  private appearanceSaving = false;
  private windowCloseSaving = false;
  private drafts: SettingsDraftState;
  private options: SettingsControllerOptions;

  constructor(container: HTMLElement, options: SettingsControllerOptions, service: ISettingsService) {
    this.options = options;
    this.service = service;
    this.service.update(this.createServiceOptions(options));
    this.originExePath = normalizeTrimmedString(options.analysisSettings?.originExePath);
    this.drafts = this.createDraftState();
    this.view = new SettingsView(container, this.createViewOptions());
    void this.loadPersistencePath();
    this.syncOriginPath();
  }

  update(options: SettingsControllerOptions): void {
    const previous = this.options;
    this.options = options;
    this.service.update(this.createServiceOptions(options));
    this.syncDrafts(previous);
    this.syncOriginFeedback();
    this.syncOriginPath();
    this.render();
  }

  dispose(): void {
    this.disposed = true;
    this.view.dispose();
  }

  private createServiceOptions(options: SettingsControllerOptions): SettingsServiceOptions {
    return {
      handleUpdateAnalysisSettings: options.handleUpdateAnalysisSettings,
      isWindowsDesktopShell: options.isWindowsDesktopShell,
      mergeAnalysisSettings: options.mergeAnalysisSettings,
    };
  }

  private createDraftState(): SettingsDraftState {
    const axisSettings = this.axisSettings;
    return {
      activeSettingsSection: "general",
      appUpdateChecking: false,
      axisTitleFontSizeDraft: String(axisSettings.axisTitleFontSize ?? ""),
      cleanupToast: { isVisible: false, message: "", type: "success" },
      fileNameFieldSeparatorsDraft: this.fileNameFieldSeparators,
      legendFontSizeDraft: String(axisSettings.legendFontSize ?? ""),
      originHealthToast: { isVisible: false, message: "", type: "success" },
      plotCommandDraft: this.originPlotConfig.command ?? "",
      postCommandsDraft: originPostCommandsToMultiline(this.originPlotConfig.postCommands),
      tickLabelFontSizeDraft: String(axisSettings.tickLabelFontSize ?? ""),
      xyPairsDraft: this.originPlotConfig.xyPairs ?? "",
    };
  }

  private syncDrafts(previous: SettingsControllerOptions): void {
    if (previous.analysisSettings === this.options.analysisSettings) {
      return;
    }

    const axisSettings = this.axisSettings;
    this.drafts.axisTitleFontSizeDraft = String(axisSettings.axisTitleFontSize ?? "");
    this.drafts.legendFontSizeDraft = String(axisSettings.legendFontSize ?? "");
    this.drafts.tickLabelFontSizeDraft = String(axisSettings.tickLabelFontSize ?? "");
    this.drafts.fileNameFieldSeparatorsDraft = this.fileNameFieldSeparators;
    this.drafts.plotCommandDraft = this.originPlotConfig.command ?? "";
    this.drafts.postCommandsDraft = originPostCommandsToMultiline(this.originPlotConfig.postCommands);
    this.drafts.xyPairsDraft = this.originPlotConfig.xyPairs ?? "";
  }

  private syncOriginFeedback(): void {
    this.showToastFromFeedback(this.options.analysisSettings ? this.originPathFeedback : IDLE_FEEDBACK, "originHealthToast");
    this.showToastFromFeedback(this.originCleanupFeedback, "cleanupToast");
  }

  private showToastFromFeedback(feedback: Feedback, key: "originHealthToast" | "cleanupToast"): void {
    if (!feedback.message || feedback.type === "idle") {
      return;
    }

    this.drafts[key] = {
      isVisible: true,
      message: feedback.message,
      type: feedback.type === "error" ? "error" : "success",
    };
  }

  private syncOriginPath(): void {
    if (!this.options.analysisSettingsLoaded) {
      this.originPathLoading = true;
      return;
    }

    const settingsOriginExePath = normalizeTrimmedString(this.options.analysisSettings?.originExePath);
    if (settingsOriginExePath) {
      this.originExePath = settingsOriginExePath;
      this.originPathLoading = false;
      return;
    }

    if (this.originPathRequested) {
      this.originPathLoading = false;
      return;
    }

    this.originPathRequested = true;
    void this.loadOriginPath();
  }

  private async loadPersistencePath(): Promise<void> {
    this.persistencePathLoading = true;
    this.render();
    try {
      this.persistencePathInfo = await this.service.getPersistencePath();
      this.persistencePathFeedback = IDLE_FEEDBACK;
    }
    catch (error) {
      this.persistencePathInfo = null;
      this.persistencePathFeedback = {
        type: "error",
        message: localize("settings_storage_load_failed", "Failed to load user config path: {error}", {
          error: this.service.errorMessage(error),
        }),
      };
    }
    finally {
      this.persistencePathLoading = false;
      this.render();
    }
  }

  private async loadOriginPath(): Promise<void> {
    this.originPathLoading = true;
    this.render();
    try {
      const configuredPath = await this.service.getOriginExePath();
      if (configuredPath) {
        this.originExePath = configuredPath;
        this.options.mergeAnalysisSettings({ originExePath: configuredPath });
      }
    }
    catch {
      this.originExePath = "";
    }
    finally {
      this.originPathLoading = false;
      this.render();
    }
  }

  private render(): void {
    if (this.disposed) {
      return;
    }
    this.view.update(this.createViewOptions());
  }

  private createViewOptions(): SettingsViewOptions {
    return {
      activeSettingsSection: this.drafts.activeSettingsSection,
      appearanceSettings: this.appearanceSettings,
      appUpdateChecking: this.drafts.appUpdateChecking,
      appUpdateSettings: this.options.appUpdateSettings,
      analysisDefaultSettings: this.analysisDefaultSettings,
      axisTitleFontSizeDraft: this.drafts.axisTitleFontSizeDraft,
      cleanupEnabledOptions: this.cleanupEnabledOptions,
      cleanupFailedDaysOptions: this.cleanupFailedDaysOptions,
      cleanupKeepSuccessOptions: this.cleanupKeepSuccessOptions,
      cleanupToast: this.drafts.cleanupToast,
      closeCleanupToast: () => {
        this.drafts.cleanupToast = { ...this.drafts.cleanupToast, isVisible: false };
        this.render();
      },
      closeOriginHealthToast: () => {
        this.drafts.originHealthToast = { ...this.drafts.originHealthToast, isVisible: false };
        this.render();
      },
      fileNameFieldSeparatorsDraft: this.drafts.fileNameFieldSeparatorsDraft,
      fileNameMatchingSettings: this.fileNameMatchingSettings,
      handleCheckForUpdates: () => void this.checkForUpdates(),
      handleOpenHelpWindow: kind => void this.openHelpWindow(kind),
      canOpenHelpWindow: this.helpWindowService.canOpenHelpWindow(),
      language: this.options.language,
      legendFontSizeDraft: this.drafts.legendFontSizeDraft,
      onLanguageChange: this.options.handleLanguageChange,
      onResetLayoutState: this.options.handleResetLayoutState,
      onThemeChange: this.options.handleThemeChange,
      originHealthToast: this.drafts.originHealthToast,
      originSettings: this.originSettings,
      plotCommandDraft: this.drafts.plotCommandDraft,
      postCommandsDraft: this.drafts.postCommandsDraft,
      setActiveSettingsSection: section => {
        this.drafts.activeSettingsSection = section;
        this.render();
      },
      setAxisTitleFontSizeDraft: value => {
        this.drafts.axisTitleFontSizeDraft = value;
      },
      setFileNameFieldSeparatorsDraft: value => {
        this.drafts.fileNameFieldSeparatorsDraft = value;
      },
      setLegendFontSizeDraft: value => {
        this.drafts.legendFontSizeDraft = value;
      },
      setPlotCommandDraft: value => {
        this.drafts.plotCommandDraft = value;
      },
      setPostCommandsDraft: value => {
        this.drafts.postCommandsDraft = value;
      },
      setTickLabelFontSizeDraft: value => {
        this.drafts.tickLabelFontSizeDraft = value;
      },
      setXyPairsDraft: value => {
        this.drafts.xyPairsDraft = value;
      },
      settingsSections: this.settingsSections,
      storageSettings: this.storageSettings,
      theme: this.options.theme,
      themeModeOptions: this.themeModeOptions,
      tickLabelFontSizeDraft: this.drafts.tickLabelFontSizeDraft,
      windowCloseBehaviorOptions: this.windowCloseBehaviorOptions,
      windowCloseSettings: this.windowCloseSettings,
      xyPairsDraft: this.drafts.xyPairsDraft,
      yScaleOptions: this.yScaleOptions,
    };
  }

  private get settings(): AnalysisSettings {
    return this.options.analysisSettings || {};
  }

  private get cleanupConfig() {
    return {
      enabled: typeof this.settings.originRuntimeCleanupEnabled === "boolean" ? this.settings.originRuntimeCleanupEnabled : ORIGIN_CLEANUP_DEFAULTS.enabled,
      keepSuccessJobs: normalizeBoundedInt(this.settings.originRuntimeKeepSuccessJobs, ORIGIN_CLEANUP_DEFAULTS.keepSuccessJobs, 0, 100),
      failedRetentionDays: normalizeBoundedInt(this.settings.originRuntimeFailedRetentionDays, ORIGIN_CLEANUP_DEFAULTS.failedRetentionDays, 1, 365),
    };
  }

  private get originPlotConfig() {
    return normalizeOriginPlotOptions({
      command: this.settings.originPlotCommandDefault,
      postCommands: this.settings.originPlotPostCommandsDefault,
      type: this.settings.originPlotTypeDefault,
      lineWidth: this.settings.originPlotLineWidthDefault,
      xyPairs: this.settings.originPlotXyPairsDefault,
    }, DEFAULT_ORIGIN_PLOT_OPTIONS);
  }

  private get axisSettings() {
    return normalizePlotAxisSettings(this.settings.analysisPlotAxisSettings);
  }

  private get fileNameFieldSeparators(): string {
    return normalizeFileNameFieldSeparators(this.settings.fileNameFieldSeparators);
  }

  private get defaultYScaleForTransfer(): "linear" | "log" {
    return this.settings.defaultYScaleForTransfer === "linear" ? "linear" : "log";
  }

  private get defaultYScaleForOutput(): "linear" | "log" {
    return this.settings.defaultYScaleForOutput === "log" ? "log" : "linear";
  }

  private resolveSpecialYScale(value: unknown): "linear" | "log" {
    if (value === "linear" || value === "log") {
      return value;
    }
    return this.settings.defaultYScaleForSpecial === "log" ? "log" : "linear";
  }

  private get storageSettings(): StorageSettings {
    return {
      currentPath: String(this.persistencePathInfo?.currentPath ?? ""),
      feedback: this.persistencePathFeedback,
      isLoading: this.persistencePathLoading,
      isConfigurable: Boolean(this.persistencePathInfo) && this.persistencePathInfo?.isConfigurable !== false,
      isSaving: this.persistencePathSaving,
      onChoosePath: () => this.choosePersistencePath(),
    };
  }

  private get fileNameMatchingSettings(): FileNameMatchingSettings {
    return {
      feedback: this.fileNameMatchingFeedback,
      fieldSeparators: this.fileNameFieldSeparators,
      isSaving: this.fileNameMatchingSaving,
      onFieldSeparatorsChange: value => this.setFileNameFieldSeparators(value),
    };
  }

  private get analysisDefaultSettings(): AnalysisDefaultSettings {
    const axisSettings = this.axisSettings;
    return {
      defaultYScaleForCf: this.resolveSpecialYScale(this.settings.defaultYScaleForCf),
      defaultYScaleForCv: this.resolveSpecialYScale(this.settings.defaultYScaleForCv),
      defaultYScaleForOutput: this.defaultYScaleForOutput,
      defaultYScaleForPv: this.resolveSpecialYScale(this.settings.defaultYScaleForPv),
      defaultYScaleForTransfer: this.defaultYScaleForTransfer,
      tickLabelFontSize: axisSettings.tickLabelFontSize,
      axisTitleFontSize: axisSettings.axisTitleFontSize,
      legendFontSize: axisSettings.legendFontSize,
      feedback: this.analysisDefaultsFeedback,
      isSaving: this.analysisDefaultsSaving,
      onDefaultYScaleForCfChange: value => this.updateAnalysisDefault({ defaultYScaleForCf: value === "log" ? "log" : "linear" }),
      onDefaultYScaleForCvChange: value => this.updateAnalysisDefault({ defaultYScaleForCv: value === "log" ? "log" : "linear" }),
      onDefaultYScaleForOutputChange: value => this.updateAnalysisDefault({ defaultYScaleForOutput: value === "log" ? "log" : "linear" }),
      onDefaultYScaleForPvChange: value => this.updateAnalysisDefault({ defaultYScaleForPv: value === "log" ? "log" : "linear" }),
      onDefaultYScaleForTransferChange: value => this.updateAnalysisDefault({ defaultYScaleForTransfer: value === "linear" ? "linear" : "log" }),
      onTickLabelFontSizeChange: value => this.updateAxisDefaults({ tickLabelFontSize: value }),
      onAxisTitleFontSizeChange: value => this.updateAxisDefaults({ axisTitleFontSize: value }),
      onLegendFontSizeChange: value => this.updateAxisDefaults({ legendFontSize: value }),
    };
  }

  private get windowCloseSettings(): WindowCloseSettings {
    return {
      behavior: this.settings.windowCloseBehavior === "quit" ? "quit" : "minimizeToTray",
      isSaving: this.windowCloseSaving,
      onBehaviorChange: value => this.setWindowCloseBehavior(value),
    };
  }

  private get appearanceSettings(): AppearanceSettings {
    const appearance = normalizeWorkbenchAppearance(this.settings);
    return {
      backgroundColor: appearance.backgroundColor,
      backgroundColorDefault: DEFAULT_WORKBENCH_BACKGROUND_COLOR,
      backgroundColorOptions: [
        DEFAULT_WORKBENCH_BACKGROUND_COLOR,
        "#f5f4ef",
        "#ffffff",
        "#111827",
      ],
      isSaving: this.appearanceSaving,
      transparentChrome: appearance.transparentChrome,
      onBackgroundColorChange: value => this.updateAppearance({
        backgroundColor: normalizeWorkbenchBackgroundColor(value),
      }),
      onBackgroundColorReset: () => this.updateAppearance({
        backgroundColor: DEFAULT_WORKBENCH_BACKGROUND_COLOR,
      }),
      onTransparentChromeChange: value => this.updateAppearance({
        transparentChrome: Boolean(value),
      }),
    };
  }

  private get originSettings(): OriginSettings {
    const cleanupConfig = this.cleanupConfig;
    const originPlotConfig = this.originPlotConfig;
    return {
      currentPath: String(this.originExePath ?? ""),
      cleanupEnabled: cleanupConfig.enabled,
      cleanupFailedRetentionDays: cleanupConfig.failedRetentionDays,
      cleanupFeedback: this.originCleanupFeedback,
      cleanupKeepSuccessJobs: cleanupConfig.keepSuccessJobs,
      cleanupRunning: this.originCleanupRunning,
      cleanupSaving: this.originCleanupSaving,
      feedback: this.originPathFeedback,
      isConfigurable: this.service.canManageOrigin(),
      isHealthCheckAvailable: this.service.canCheckOriginHealth(),
      isCleanupAvailable: this.service.canRunOriginCleanup(),
      isHealthChecking: this.originHealthChecking,
      isLoading: this.originPathLoading,
      plotCommand: originPlotConfig.command,
      plotFeedback: this.originPlotFeedback,
      plotPostCommandsText: originPostCommandsToMultiline(originPlotConfig.postCommands),
      plotSaving: this.originPlotSaving,
      plotType: originPlotConfig.type,
      plotLineWidth: originPlotConfig.lineWidth,
      plotXyPairs: originPlotConfig.xyPairs,
      isSaving: this.originPathSaving,
      onCheckHealth: () => this.checkOriginHealth(),
      onChoosePath: () => this.chooseOriginExePath(),
      onCleanupEnabledChange: value => this.updateOriginCleanup({ originRuntimeCleanupEnabled: Boolean(value) }),
      onCleanupFailedRetentionDaysChange: value => this.updateOriginCleanup({ originRuntimeFailedRetentionDays: normalizeBoundedInt(value, ORIGIN_CLEANUP_DEFAULTS.failedRetentionDays, 1, 365) }),
      onCleanupKeepSuccessJobsChange: value => this.updateOriginCleanup({ originRuntimeKeepSuccessJobs: normalizeBoundedInt(value, ORIGIN_CLEANUP_DEFAULTS.keepSuccessJobs, 0, 100) }),
      onPlotCommandChange: value => this.updateOriginPlot({ originPlotCommandDefault: normalizeOriginPlotOptions({ command: value }).command }),
      onPlotPostCommandsChange: value => this.updateOriginPlot({ originPlotPostCommandsDefault: normalizeOriginPostCommands(value) }),
      onPlotTypeChange: value => this.updateOriginPlot({ originPlotTypeDefault: normalizeOriginPlotOptions({ type: value }, DEFAULT_ORIGIN_PLOT_OPTIONS).type }),
      onPlotLineWidthChange: value => this.updateOriginPlot({ originPlotLineWidthDefault: normalizeOriginPlotOptions({ lineWidth: value }, DEFAULT_ORIGIN_PLOT_OPTIONS).lineWidth }),
      onPlotXyPairsChange: value => this.updateOriginPlot({ originPlotXyPairsDefault: normalizeOriginPlotOptions({ xyPairs: value }, DEFAULT_ORIGIN_PLOT_OPTIONS).xyPairs }),
      onRunCleanupNow: () => this.runOriginCleanup(),
    };
  }

  private get cleanupEnabledOptions(): SelectOption[] {
    return [
      { value: "true", label: localize("settings_origin_cleanup_enable_on", "Enabled") },
      { value: "false", label: localize("settings_origin_cleanup_enable_off", "Disabled") },
    ];
  }

  private get cleanupKeepSuccessOptions(): SelectOption[] {
    return [
      { value: "0", label: `0 (${localize("common_clear", "Clear")})` },
      { value: "1", label: "1" },
      { value: "3", label: "3" },
      { value: "5", label: "5" },
      { value: "10", label: "10" },
    ];
  }

  private get cleanupFailedDaysOptions(): SelectOption[] {
    return [
      { value: "1", label: "1" },
      { value: "3", label: "3" },
      { value: "7", label: "7" },
      { value: "14", label: "14" },
      { value: "30", label: "30" },
    ];
  }

  private get themeModeOptions(): SelectOption[] {
    return [
      { value: "system", label: localize("settings_theme_system", "System") },
      { value: "light", label: localize("settings_theme_light", "Light") },
      { value: "dark", label: localize("settings_theme_dark", "Dark") },
    ];
  }

  private get windowCloseBehaviorOptions(): SelectOption[] {
    return [
      { value: "minimizeToTray", label: localize("settings_close_behavior_minimize_to_tray", "Minimize to Tray") },
      { value: "quit", label: localize("settings_close_behavior_quit", "Quit App") },
    ];
  }

  private get yScaleOptions(): SelectOption[] {
    return [
      { value: "linear", label: localize("settings_y_scale_linear", "Linear") },
      { value: "log", label: localize("settings_y_scale_log", "Log") },
    ];
  }

  private get settingsSections() {
    return [
      { id: "general" as const, label: this.label("settings_nav_general", "General") },
      { id: "appearance" as const, label: this.label("settings_nav_appearance", "Appearance") },
      { id: "origin" as const, label: this.label("settings_nav_origin", "Origin") },
      { id: "about" as const, label: this.label("settings_nav_about", "About") },
    ];
  }

  private label(key: string, fallback: string): string {
    return localize(key, fallback);
  }

  private async choosePersistencePath(): Promise<void> {
    this.persistencePathSaving = true;
    this.persistencePathFeedback = IDLE_FEEDBACK;
    this.render();
    try {
      const info = await this.service.choosePersistencePath();
      this.persistencePathInfo = info;
      if (!info?.cancelled) {
        this.persistencePathFeedback = {
          type: "success",
          message: localize("settings_storage_choose_saved", "User config path updated."),
        };
      }
    }
    catch (error) {
      this.persistencePathFeedback = {
        type: "error",
        message: localize("settings_storage_choose_failed", "Failed to update user config path: {error}", {
          error: this.service.errorMessage(error),
        }),
      };
    }
    finally {
      this.persistencePathSaving = false;
      this.render();
    }
  }

  private async chooseOriginExePath(): Promise<void> {
    this.originPathSaving = true;
    this.originPathFeedback = IDLE_FEEDBACK;
    this.render();
    try {
      const nextPath = await this.service.chooseOriginExePath();
      if (nextPath) {
        this.originExePath = nextPath;
        this.originPathFeedback = {
          type: "success",
          message: localize("settings_origin_choose_saved", "Origin executable path updated."),
        };
      }
    }
    catch (error) {
      this.originPathFeedback = {
        type: "error",
        message: localize("settings_origin_choose_failed", "Failed to update Origin executable path: {error}", {
          error: this.service.errorMessage(error),
        }),
      };
    }
    finally {
      this.originPathSaving = false;
      this.render();
    }
  }

  private async checkOriginHealth(): Promise<void> {
    this.originHealthChecking = true;
    this.originPathFeedback = IDLE_FEEDBACK;
    this.render();
    try {
      const health = await this.service.checkOriginHealth(this.originExePath);
      const nextPath = normalizeTrimmedString(health?.originExePath);
      if (nextPath) {
        this.originExePath = nextPath;
      }
      this.originPathFeedback = {
        type: "success",
        message: localize("settings_origin_check_success", "Origin connection check passed"),
      };
    }
    catch (error) {
      const detail = this.service.formatOriginError(error);
      this.originPathFeedback = {
        type: "error",
        message: localize("settings_origin_check_failed", "Origin connection check failed: {error}", { error: detail }),
      };
    }
    finally {
      this.originHealthChecking = false;
      this.syncOriginFeedback();
      this.render();
    }
  }

  private async updateOriginCleanup(updates: Record<string, unknown>): Promise<void> {
    this.originCleanupSaving = true;
    this.originCleanupFeedback = IDLE_FEEDBACK;
    this.render();
    try {
      await this.service.updateSettings(updates);
      this.originCleanupFeedback = {
        type: "success",
        message: localize("settings_origin_cleanup_saved", "Origin cleanup settings updated."),
      };
    }
    catch (error) {
      this.originCleanupFeedback = {
        type: "error",
        message: localize("settings_origin_cleanup_save_failed", "Failed to update cleanup settings: {error}", { error: this.service.errorMessage(error) }),
      };
    }
    finally {
      this.originCleanupSaving = false;
      this.syncOriginFeedback();
      this.render();
    }
  }

  private async updateOriginPlot(updates: Record<string, unknown>): Promise<void> {
    this.originPlotSaving = true;
    this.originPlotFeedback = IDLE_FEEDBACK;
    this.render();
    try {
      await this.service.updateSettings(updates);
      this.originPlotFeedback = {
        type: "success",
        message: localize("settings_origin_plot_saved", "Origin plot settings updated."),
      };
    }
    catch (error) {
      this.originPlotFeedback = {
        type: "error",
        message: localize("settings_origin_plot_save_failed", "Failed to update plot settings: {error}", { error: this.service.errorMessage(error) }),
      };
    }
    finally {
      this.originPlotSaving = false;
      this.render();
    }
  }

  private async runOriginCleanup(): Promise<void> {
    this.originCleanupRunning = true;
    this.originCleanupFeedback = IDLE_FEEDBACK;
    this.render();
    try {
      const result = await this.service.runOriginCleanup();
      const removedTotal = Number(result?.removedTotal);
      this.originCleanupFeedback = {
        type: "success",
        message: localize("settings_origin_cleanup_run_success", "Cleanup completed. Removed {count} job folder(s).", {
          count: Number.isFinite(removedTotal) && removedTotal >= 0 ? removedTotal : 0,
        }),
      };
    }
    catch (error) {
      this.originCleanupFeedback = {
        type: "error",
        message: localize("settings_origin_cleanup_run_failed", "Cleanup failed: {error}", { error: this.service.errorMessage(error) }),
      };
    }
    finally {
      this.originCleanupRunning = false;
      this.syncOriginFeedback();
      this.render();
    }
  }

  private async setFileNameFieldSeparators(value: string): Promise<void> {
    this.fileNameMatchingSaving = true;
    this.fileNameMatchingFeedback = IDLE_FEEDBACK;
    this.render();
    try {
      await this.service.updateSettings({ fileNameFieldSeparators: normalizeFileNameFieldSeparators(value) });
      this.fileNameMatchingFeedback = {
        type: "success",
        message: localize("settings_filename_matching_saved", "Filename field separators updated."),
      };
    }
    catch (error) {
      this.fileNameMatchingFeedback = {
        type: "error",
        message: localize("settings_filename_matching_save_failed", "Failed to update filename field separators: {error}", { error: this.service.errorMessage(error) }),
      };
    }
    finally {
      this.fileNameMatchingSaving = false;
      this.render();
    }
  }

  private async updateAnalysisDefault(updates: Record<string, unknown>): Promise<void> {
    this.analysisDefaultsSaving = true;
    this.analysisDefaultsFeedback = IDLE_FEEDBACK;
    this.render();
    try {
      await this.service.updateSettings(updates);
      this.analysisDefaultsFeedback = {
        type: "success",
        message: localize("analysisSettings.defaultsSaved", "Analysis defaults saved."),
      };
    }
    catch (error) {
      this.analysisDefaultsFeedback = {
        type: "error",
        message: localize("analysisSettings.defaultsSaveFailed", "Failed to save analysis defaults: {error}", {
          error: this.service.errorMessage(error),
        }),
      };
    }
    finally {
      this.analysisDefaultsSaving = false;
      this.render();
    }
  }

  private async updateAxisDefaults(updates: Record<string, unknown>): Promise<void> {
    await this.updateAnalysisDefault({
      analysisPlotAxisSettings: normalizePlotAxisSettings({
        ...this.axisSettings,
        ...updates,
      }, this.axisSettings),
    });
  }

  private async updateAppearance(updates: Record<string, unknown>): Promise<void> {
    this.appearanceSaving = true;
    this.render();
    try {
      await this.service.updateSettings(updates);
    }
    finally {
      this.appearanceSaving = false;
      this.render();
    }
  }

  private async setWindowCloseBehavior(behavior: "minimizeToTray" | "quit"): Promise<void> {
    this.windowCloseSaving = true;
    this.render();
    try {
      await this.service.updateSettings({
        windowCloseBehavior: behavior === "quit" ? "quit" : "minimizeToTray",
      });
    }
    finally {
      this.windowCloseSaving = false;
      this.render();
    }
  }

  private async checkForUpdates(): Promise<void> {
    this.drafts.appUpdateChecking = true;
    this.render();
    try {
      await this.options.appUpdateSettings.onCheckForUpdates();
    }
    catch {
      // Update check result is shown by desktop shell dialogs.
    }
    finally {
      this.drafts.appUpdateChecking = false;
      this.render();
    }
  }

  private async openHelpWindow(kind: HelpWindowKind): Promise<void> {
    await this.helpWindowService.openHelpWindow(kind);
  }
}
