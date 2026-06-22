import { localize } from "src/cs/nls";
import {
  DEFAULT_ORIGIN_PLOT_OPTIONS,
  normalizeOriginPlotOptions,
  normalizeOriginPostCommands,
  originPostCommandsToMultiline,
  type OriginPlotOptions,
} from "src/cs/workbench/services/origin/common/originPlotOptions";
import { normalizePlotAxisSettings } from "src/cs/workbench/services/plot/common/plotSettings";
import { normalizeFileNameFieldSeparators } from "src/cs/workbench/services/template/common/fileNameMatching";
import {
  IDLE_FEEDBACK,
  type Feedback,
  type NotificationFeedbackState,
} from "src/cs/workbench/contrib/settings/common/feedback";
import {
  SettingsView,
  type SettingsViewOptions,
} from "src/cs/workbench/contrib/settings/browser/settingsView";
import type { SettingsSectionId } from "src/cs/workbench/contrib/settings/browser/settingsLayout";
import {
  normalizeBoundedInt,
  normalizeTrimmedString,
  ORIGIN_CLEANUP_DEFAULTS,
} from "src/cs/workbench/services/settings/browser/settingsShared";
import {
  normalizeFilesExplorerDensity,
  normalizeFilesExplorerBadgeColor,
  normalizeFilesExplorerBadgeColors,
  normalizeFilesExplorerShowBadges,
  normalizeNumericDisplayMode,
  type ConductorSettings,
  type FilesExplorerBadgeColor,
  type ISettingsService,
  type SettingsViewInput,
} from "src/cs/workbench/services/settings/common/settings";
import type { ICommandService } from "src/cs/platform/commands/common/commands";
import { WorkbenchCommandId } from "src/cs/workbench/browser/actions/workbenchCommands";
import { WorkbenchLayoutCommandId } from "src/cs/workbench/browser/actions/layoutCommands";
import { UpdateCommandId } from "src/cs/workbench/contrib/update/common/update";
import {
  DEFAULT_WORKBENCH_BACKGROUND_COLOR,
  normalizeWorkbenchAppearance,
  ThemeCommandId,
} from "src/cs/workbench/services/themes/common/themeService";
import {
  Severity,
  type INotificationHandle,
  type INotificationService,
} from "src/cs/workbench/services/notification/common/notificationService";

type SettingsControllerOptions = SettingsViewInput;

type SelectOption = {
  label: string;
  value: string;
};

type SettingsDraftState = {
  activeSettingsSection: SettingsSectionId;
  appUpdateChecking: boolean;
  axisTitleFontSizeDraft: string;
  cleanupNotification: NotificationFeedbackState;
  fileNameFieldSeparatorsDraft: string;
  originLegendFontSizeDraft: string;
  originHealthNotification: NotificationFeedbackState;
  plotCommandDraft: string;
  postCommandsDraft: string;
  tickLabelFontSizeDraft: string;
  xyPairsDraft: string;
};

const ORIGIN_HEALTH_NOTIFICATION_ID = "settings.originHealth";
const CLEANUP_NOTIFICATION_ID = "settings.cleanup";

export class SettingsController {
  private readonly service: ISettingsService;
  private readonly view: SettingsView;
  private disposed = false;
  private originPathLoadRequest: string | null = null;
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
  private defaultsSaving = false;
  private defaultsFeedback: Feedback = IDLE_FEEDBACK;
  private appearanceSaving = false;
  private explorerBadgeSaving = false;
  private explorerBadgeColorSaving = false;
  private explorerAppearanceSaving = false;
  private pendingExplorerBadgeColors: Record<string, FilesExplorerBadgeColor> | null = null;
  private pendingExplorerBadgeVisibility: boolean | null = null;
  private pendingNumericDisplayMode: "raw" | "smart" | null = null;
  private pendingTransparentChrome: boolean | null = null;
  private transparentChromeSaving = false;
  private numericDisplaySaving = false;
  private windowCloseSaving = false;
  private cleanupNotificationSignature: string | null = null;
  private originHealthNotificationSignature: string | null = null;
  private cleanupNotification: INotificationHandle | null = null;
  private originHealthNotification: INotificationHandle | null = null;
  private drafts: SettingsDraftState;
  private options: SettingsControllerOptions;

  constructor(
    container: HTMLElement,
    options: SettingsControllerOptions,
    service: ISettingsService,
    private readonly commandService: ICommandService,
    private readonly notificationService: INotificationService,
  ) {
    this.options = options;
    this.service = service;
    this.originExePath = normalizeTrimmedString(options.conductorSettings?.originExePath);
    this.drafts = this.createDraftState();
    this.view = new SettingsView(container, this.createViewOptions());
    this.syncOriginPath();
  }

  update(options: SettingsControllerOptions): void {
    const previous = this.options;
    this.options = options;
    this.syncDrafts(previous);
    this.syncOriginFeedback();
    this.syncOriginPath();
    this.render();
  }

  dispose(): void {
    this.disposed = true;
    this.originHealthNotification?.close();
    this.cleanupNotification?.close();
    this.view.dispose();
  }

  private createDraftState(): SettingsDraftState {
    const axisSettings = this.axisSettings;
    return {
      activeSettingsSection: "general",
      appUpdateChecking: false,
      axisTitleFontSizeDraft: String(axisSettings.axisTitleFontSize ?? ""),
      cleanupNotification: { isVisible: false, message: "", type: "success" },
      fileNameFieldSeparatorsDraft: this.fileNameFieldSeparators,
      originLegendFontSizeDraft: String(this.originPlotConfig.legendFontSize ?? ""),
      originHealthNotification: { isVisible: false, message: "", type: "success" },
      plotCommandDraft: this.originPlotConfig.command ?? "",
      postCommandsDraft: originPostCommandsToMultiline(this.originPlotConfig.postCommands),
      tickLabelFontSizeDraft: String(axisSettings.tickLabelFontSize ?? ""),
      xyPairsDraft: this.originPlotConfig.xyPairs ?? "",
    };
  }

  private syncDrafts(previous: SettingsControllerOptions): void {
    if (previous.conductorSettings === this.options.conductorSettings) {
      return;
    }

    const axisSettings = this.axisSettings;
    this.drafts.axisTitleFontSizeDraft = String(axisSettings.axisTitleFontSize ?? "");
    this.drafts.tickLabelFontSizeDraft = String(axisSettings.tickLabelFontSize ?? "");
    this.drafts.fileNameFieldSeparatorsDraft = this.fileNameFieldSeparators;
    this.drafts.originLegendFontSizeDraft = String(this.originPlotConfig.legendFontSize ?? "");
    this.drafts.plotCommandDraft = this.originPlotConfig.command ?? "";
    this.drafts.postCommandsDraft = originPostCommandsToMultiline(this.originPlotConfig.postCommands);
    this.drafts.xyPairsDraft = this.originPlotConfig.xyPairs ?? "";
  }

  private syncOriginFeedback(): void {
    this.showNotificationFromFeedback(this.options.conductorSettings ? this.originPathFeedback : IDLE_FEEDBACK, "originHealthNotification");
    this.showNotificationFromFeedback(this.originCleanupFeedback, "cleanupNotification");
  }

  private showNotificationFromFeedback(feedback: Feedback, key: "originHealthNotification" | "cleanupNotification"): void {
    if (!feedback.message || feedback.type === "idle") {
      this.drafts[key] = { ...this.drafts[key], isVisible: false };
      return;
    }

    this.drafts[key] = {
      isVisible: true,
      message: feedback.message,
      type: feedback.type === "error" ? "error" : "success",
    };
  }

  private syncOriginPath(): void {
    if (!this.options.conductorSettingsLoaded) {
      this.originPathLoading = true;
      return;
    }

    const settingsOriginExePath = normalizeTrimmedString(this.options.conductorSettings?.originExePath);
    if (settingsOriginExePath) {
      this.originExePath = settingsOriginExePath;
      this.originPathLoading = false;
      this.originPathLoadRequest = null;
      return;
    }

    if (!this.service.canManageOrigin()) {
      this.originPathLoading = false;
      this.originPathLoadRequest = null;
      return;
    }

    const loadRequest = `${this.options.isWindowsDesktopShell}`;
    if (this.originPathLoadRequest === loadRequest) {
      return;
    }

    this.originPathLoadRequest = loadRequest;
    void this.loadOriginPath(loadRequest);
  }

  private async loadOriginPath(loadRequest: string): Promise<void> {
    this.originPathLoading = true;
    this.render();
    try {
      const configuredPath = await this.service.getOriginExePath();
      if (configuredPath) {
        this.originExePath = configuredPath;
        this.service.mergeConductorSettings({ originExePath: configuredPath });
      }
      else if (this.originPathLoadRequest === loadRequest) {
        this.originPathLoadRequest = null;
      }
    }
    catch {
      this.originExePath = "";
      if (this.originPathLoadRequest === loadRequest) {
        this.originPathLoadRequest = null;
      }
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
    this.updateNotifications();
    this.view.update(this.createViewOptions());
  }

  private updateNotifications(): void {
    this.updateNotification(ORIGIN_HEALTH_NOTIFICATION_ID, this.drafts.originHealthNotification, "settings-origin-health-notification", () => this.closeOriginHealthNotification());
    this.updateNotification(CLEANUP_NOTIFICATION_ID, this.drafts.cleanupNotification, "settings-origin-cleanup-notification", () => this.closeCleanupNotification());
  }

  private updateNotification(id: string, state: NotificationFeedbackState, dataUi: string, onClose: () => void): void {
    const currentNotification = id === ORIGIN_HEALTH_NOTIFICATION_ID
      ? this.originHealthNotification
      : this.cleanupNotification;

    if (!state.isVisible) {
      this.setNotificationHandle(id, null);
      this.setNotificationSignature(id, null);
      currentNotification?.close();
      return;
    }

    const nextSignature = `${state.message}\u0000${state.type}\u0000${dataUi}`;
    if (currentNotification && this.getNotificationSignature(id) === nextSignature) {
      return;
    }

    if (currentNotification) {
      this.setNotificationHandle(id, null);
      this.setNotificationSignature(id, null);
      currentNotification.close();
    }

    const notification = this.notificationService.notify({
      id,
      message: state.message,
      presentation: {
        dataUi,
        position: "fixed",
        type: state.type,
      },
      severity: state.type === "error" ? Severity.Error : Severity.Info,
    });
    this.setNotificationHandle(id, notification);
    this.setNotificationSignature(id, nextSignature);
    notification.onDidClose(() => {
      if (this.getNotificationHandle(id) === notification) {
        this.setNotificationHandle(id, null);
        this.setNotificationSignature(id, null);
        onClose();
      }
    });
  }

  private getNotificationHandle(id: string): INotificationHandle | null {
    return id === ORIGIN_HEALTH_NOTIFICATION_ID
      ? this.originHealthNotification
      : this.cleanupNotification;
  }

  private setNotificationHandle(id: string, notification: INotificationHandle | null): void {
    if (id === ORIGIN_HEALTH_NOTIFICATION_ID) {
      this.originHealthNotification = notification;
      return;
    }
    this.cleanupNotification = notification;
  }

  private getNotificationSignature(id: string): string | null {
    return id === ORIGIN_HEALTH_NOTIFICATION_ID
      ? this.originHealthNotificationSignature
      : this.cleanupNotificationSignature;
  }

  private setNotificationSignature(id: string, signature: string | null): void {
    if (id === ORIGIN_HEALTH_NOTIFICATION_ID) {
      this.originHealthNotificationSignature = signature;
      return;
    }
    this.cleanupNotificationSignature = signature;
  }

  private closeCleanupNotification(): void {
    this.originCleanupFeedback = IDLE_FEEDBACK;
    this.drafts.cleanupNotification = { ...this.drafts.cleanupNotification, isVisible: false };
    this.render();
  }

  private closeOriginHealthNotification(): void {
    this.originPathFeedback = IDLE_FEEDBACK;
    this.drafts.originHealthNotification = { ...this.drafts.originHealthNotification, isVisible: false };
    this.render();
  }

  private createViewOptions(): SettingsViewOptions {
    return {
      activeSettingsSection: this.drafts.activeSettingsSection,
      appearanceSettings: this.appearanceSettings,
      appUpdateChecking: this.drafts.appUpdateChecking,
      appUpdateSettings: this.options.appUpdateSettings,
      chartDefaultSettings: this.chartDefaultSettings,
      axisTitleFontSizeDraft: this.drafts.axisTitleFontSizeDraft,
      cleanupEnabledOptions: this.cleanupEnabledOptions,
      cleanupFailedDaysOptions: this.cleanupFailedDaysOptions,
      cleanupKeepSuccessOptions: this.cleanupKeepSuccessOptions,
      fileNameFieldSeparatorsDraft: this.drafts.fileNameFieldSeparatorsDraft,
      fileNameMatchingSettings: this.fileNameMatchingSettings,
      handleCheckForUpdates: () => void this.checkForUpdates(),
      handleShowReleaseNotes: () => {
        void this.commandService.executeCommand(
          UpdateCommandId.showCurrentReleaseNotes,
          this.options.appUpdateSettings.currentVersion,
        );
      },
      language: this.options.language,
      numericDisplaySettings: this.numericDisplaySettings,
      originLegendFontSizeDraft: this.drafts.originLegendFontSizeDraft,
      onLanguageChange: language => {
        void this.commandService.executeCommand(WorkbenchCommandId.setLanguage, language);
      },
      onNavigateBack: () => {
        void this.commandService.executeCommand(WorkbenchLayoutCommandId.navigateBack);
      },
      onResetLayoutState: () => {
        void this.commandService.executeCommand(WorkbenchLayoutCommandId.resetLayoutState);
      },
      onThemeChange: theme => {
        void this.commandService.executeCommand(ThemeCommandId.setTheme, theme);
      },
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
      setOriginLegendFontSizeDraft: value => {
        this.drafts.originLegendFontSizeDraft = value;
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
      theme: this.options.theme,
      themeModeOptions: this.themeModeOptions,
      tickLabelFontSizeDraft: this.drafts.tickLabelFontSizeDraft,
      windowCloseBehaviorOptions: this.windowCloseBehaviorOptions,
      windowCloseSettings: this.windowCloseSettings,
      xyPairsDraft: this.drafts.xyPairsDraft,
      yScaleOptions: this.yScaleOptions,
    };
  }

  private get settings(): ConductorSettings {
    return this.options.conductorSettings || {};
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
      symbolShape: this.settings.originPlotSymbolShapeDefault,
      legendFontSize: this.settings.originPlotLegendFontSizeDefault,
      xyPairs: this.settings.originPlotXyPairsDefault,
    }, DEFAULT_ORIGIN_PLOT_OPTIONS);
  }

  private get axisSettings() {
    return normalizePlotAxisSettings(this.settings.plotAxisSettings);
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

  private get fileNameMatchingSettings(): SettingsViewOptions["fileNameMatchingSettings"] {
    return {
      feedback: this.fileNameMatchingFeedback,
      fieldSeparators: this.fileNameFieldSeparators,
      isSaving: this.fileNameMatchingSaving,
      onFieldSeparatorsChange: value => this.setFileNameFieldSeparators(value),
    };
  }

  private get chartDefaultSettings(): SettingsViewOptions["chartDefaultSettings"] {
    const axisSettings = this.axisSettings;
    return {
      defaultYScaleForCf: this.resolveSpecialYScale(this.settings.defaultYScaleForCf),
      defaultYScaleForCv: this.resolveSpecialYScale(this.settings.defaultYScaleForCv),
      defaultYScaleForOutput: this.defaultYScaleForOutput,
      defaultYScaleForPv: this.resolveSpecialYScale(this.settings.defaultYScaleForPv),
      defaultYScaleForTransfer: this.defaultYScaleForTransfer,
      tickLabelFontSize: axisSettings.tickLabelFontSize,
      axisTitleFontSize: axisSettings.axisTitleFontSize,
      feedback: this.defaultsFeedback,
      isSaving: this.defaultsSaving,
      onDefaultYScaleForCfChange: value => this.updateDefault({ defaultYScaleForCf: value === "log" ? "log" : "linear" }),
      onDefaultYScaleForCvChange: value => this.updateDefault({ defaultYScaleForCv: value === "log" ? "log" : "linear" }),
      onDefaultYScaleForOutputChange: value => this.updateDefault({ defaultYScaleForOutput: value === "log" ? "log" : "linear" }),
      onDefaultYScaleForPvChange: value => this.updateDefault({ defaultYScaleForPv: value === "log" ? "log" : "linear" }),
      onDefaultYScaleForTransferChange: value => this.updateDefault({ defaultYScaleForTransfer: value === "linear" ? "linear" : "log" }),
      onTickLabelFontSizeChange: value => this.updateAxisDefaults({ tickLabelFontSize: value }),
      onAxisTitleFontSizeChange: value => this.updateAxisDefaults({ axisTitleFontSize: value }),
    };
  }

  private get windowCloseSettings(): SettingsViewOptions["windowCloseSettings"] {
    return {
      behavior: this.settings.windowCloseBehavior === "quit" ? "quit" : "minimizeToTray",
      isSaving: this.windowCloseSaving,
      onBehaviorChange: value => this.setWindowCloseBehavior(value),
    };
  }

  private get numericDisplaySettings(): SettingsViewOptions["numericDisplaySettings"] {
    const mode = this.pendingNumericDisplayMode ?? normalizeNumericDisplayMode(this.settings.numericDisplayMode);
    return {
      optimized: mode === "smart",
      isSaving: this.numericDisplaySaving,
      onOptimizedChange: value => this.setNumericDisplayOptimized(value),
    };
  }

  private get appearanceSettings(): SettingsViewOptions["appearanceSettings"] {
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
      explorerDensity: normalizeFilesExplorerDensity(this.settings.filesExplorerDensity),
      explorerDensityOptions: this.explorerDensityOptions,
      explorerBadgeColors: this.pendingExplorerBadgeColors ?? normalizeFilesExplorerBadgeColors(this.settings.filesExplorerBadgeColors),
      explorerBadgeColorLabels: this.explorerBadgeColorLabels,
      explorerBadgeColorOptions: this.explorerBadgeColorOptions,
      isExplorerBadgeColorSaving: this.explorerBadgeColorSaving,
      isExplorerBadgeSaving: this.explorerBadgeSaving,
      isExplorerDensitySaving: this.explorerAppearanceSaving,
      isSaving: this.appearanceSaving,
      showExplorerBadges: this.pendingExplorerBadgeVisibility ?? normalizeFilesExplorerShowBadges(this.settings.filesExplorerShowBadges),
      transparentChrome: this.pendingTransparentChrome ?? appearance.transparentChrome,
      onBackgroundColorChange: value => this.setWorkbenchBackground(value),
      onBackgroundColorReset: () => this.resetWorkbenchBackground(),
      onExplorerBadgeColorChange: (badge, color) => this.setFilesExplorerBadgeColor(badge, color),
      onExplorerBadgeVisibilityChange: value => this.setFilesExplorerShowBadges(value),
      onExplorerDensityChange: value => this.setFilesExplorerDensity(value),
      onTransparentChromeChange: value => this.setTransparentChrome(Boolean(value)),
    };
  }

  private get originSettings(): SettingsViewOptions["originSettings"] {
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
      plotLegendFontSize: originPlotConfig.legendFontSize,
      plotXyPairs: originPlotConfig.xyPairs,
      isSaving: this.originPathSaving,
      onCheckHealth: () => this.checkOriginHealth(),
      onChoosePath: () => this.chooseOriginExePath(),
      onCleanupEnabledChange: value => this.updateOriginCleanup({ originRuntimeCleanupEnabled: Boolean(value) }),
      onCleanupFailedRetentionDaysChange: value => this.updateOriginCleanup({ originRuntimeFailedRetentionDays: normalizeBoundedInt(value, ORIGIN_CLEANUP_DEFAULTS.failedRetentionDays, 1, 365) }),
      onCleanupKeepSuccessJobsChange: value => this.updateOriginCleanup({ originRuntimeKeepSuccessJobs: normalizeBoundedInt(value, ORIGIN_CLEANUP_DEFAULTS.keepSuccessJobs, 0, 100) }),
      onPlotCommandChange: value => this.updateOriginPlot({ command: normalizeOriginPlotOptions({ command: value }).command }),
      onPlotPostCommandsChange: value => this.updateOriginPlot({ postCommands: normalizeOriginPostCommands(value) }),
      onPlotTypeChange: value => this.updateOriginPlot({ type: normalizeOriginPlotOptions({ type: value }, DEFAULT_ORIGIN_PLOT_OPTIONS).type }),
      onPlotLineWidthChange: value => this.updateOriginPlot({ lineWidth: normalizeOriginPlotOptions({ lineWidth: value }, DEFAULT_ORIGIN_PLOT_OPTIONS).lineWidth }),
      onPlotLegendFontSizeChange: value => this.updateOriginPlot({ legendFontSize: normalizeOriginPlotOptions({ legendFontSize: value }, DEFAULT_ORIGIN_PLOT_OPTIONS).legendFontSize }),
      onPlotXyPairsChange: value => this.updateOriginPlot({ xyPairs: normalizeOriginPlotOptions({ xyPairs: value }, DEFAULT_ORIGIN_PLOT_OPTIONS).xyPairs }),
      onRunCleanupNow: () => this.runOriginCleanup(),
    };
  }

  private get cleanupEnabledOptions(): SelectOption[] {
    return [
      { value: "true", label: localize("settings.origin.cleanup.enableOn", "Enabled") },
      { value: "false", label: localize("settings.origin.cleanup.enableOff", "Disabled") },
    ];
  }

  private get cleanupKeepSuccessOptions(): SelectOption[] {
    return [
      { value: "0", label: `0 (${localize("common.clear", "Clear")})` },
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
      { value: "system", label: localize("settings.theme.system", "System") },
      { value: "light", label: localize("settings.theme.light", "Light") },
      { value: "dark", label: localize("settings.theme.dark", "Dark") },
    ];
  }

  private get explorerDensityOptions(): SelectOption[] {
    return [
      { value: "compact", label: localize("settings.explorerDensity.compact", "Compact") },
      { value: "default", label: localize("settings.explorerDensity.default", "Default") },
      { value: "comfortable", label: localize("settings.explorerDensity.comfortable", "Comfortable") },
    ];
  }

  private get explorerBadgeColorLabels(): SelectOption[] {
    return [
      { value: "transfer", label: localize("settings.explorerBadge.transfer", "transfer") },
      { value: "output", label: localize("settings.explorerBadge.output", "output") },
      { value: "cv", label: localize("settings.explorerBadge.cv", "cv") },
      { value: "cf", label: localize("settings.explorerBadge.cf", "cf") },
      { value: "pv", label: localize("settings.explorerBadge.pv", "pv") },
      { value: "mixed", label: localize("settings.explorerBadge.mixed", "mixed") },
      { value: "unknown", label: localize("settings.explorerBadge.unknown", "Unknown") },
    ];
  }

  private get explorerBadgeColorOptions(): SelectOption[] {
    return [
      { value: "neutral", label: localize("settings.explorerBadgeColor.neutral", "Neutral") },
      { value: "blue", label: localize("settings.explorerBadgeColor.blue", "Blue") },
      { value: "green", label: localize("settings.explorerBadgeColor.green", "Green") },
      { value: "purple", label: localize("settings.explorerBadgeColor.purple", "Purple") },
      { value: "orange", label: localize("settings.explorerBadgeColor.orange", "Orange") },
      { value: "red", label: localize("settings.explorerBadgeColor.red", "Red") },
      { value: "cyan", label: localize("settings.explorerBadgeColor.cyan", "Cyan") },
    ];
  }

  private get windowCloseBehaviorOptions(): SelectOption[] {
    return [
      { value: "minimizeToTray", label: localize("settings.closeBehavior.minimizeToTray", "Minimize to Tray") },
      { value: "quit", label: localize("settings.closeBehavior.quit", "Quit App") },
    ];
  }

  private get yScaleOptions(): SelectOption[] {
    return [
      { value: "linear", label: localize("settings.yScale.linear", "Linear") },
      { value: "log", label: localize("settings.yScale.log", "Log") },
    ];
  }

  private get settingsSections() {
    return [
      { id: "general" as const, label: localize("settings.nav.general", "General") },
      { id: "appearance" as const, label: localize("settings.nav.appearance", "Appearance") },
      { id: "origin" as const, label: localize("settings.nav.origin", "Origin") },
      { id: "about" as const, label: localize("settings.nav.about", "About") },
    ];
  }

  private async chooseOriginExePath(): Promise<void> {
    if (!this.service.canManageOrigin() || this.originPathLoading || this.originPathSaving || this.originHealthChecking) {
      return;
    }

    this.originPathSaving = true;
    this.originPathFeedback = IDLE_FEEDBACK;
    this.syncOriginFeedback();
    this.render();
    try {
      const nextPath = await this.service.chooseOriginExePath();
      if (nextPath) {
        this.originExePath = nextPath;
        this.originPathFeedback = {
          type: "success",
          message: localize("settings.origin.chooseSaved", "Origin executable path updated."),
        };
      }
    }
    catch (error) {
      this.originPathFeedback = {
        type: "error",
        message: localize("settings.origin.chooseFailed", "Failed to update Origin executable path: {error}", {
          error: this.service.errorMessage(error),
        }),
      };
    }
    finally {
      this.originPathSaving = false;
      this.syncOriginFeedback();
      this.render();
    }
  }

  private async checkOriginHealth(): Promise<void> {
    if (!this.service.canCheckOriginHealth() || this.originPathSaving || this.originHealthChecking || this.originPathLoading) {
      return;
    }

    this.originHealthChecking = true;
    this.originPathFeedback = IDLE_FEEDBACK;
    this.syncOriginFeedback();
    this.render();
    try {
      const health = await this.service.checkOriginHealth(this.originExePath);
      const nextPath = normalizeTrimmedString(health?.originExePath);
      if (nextPath) {
        this.originExePath = nextPath;
      }
      this.originPathFeedback = {
        type: "success",
        message: localize("settings.origin.checkSuccess", "Origin connection check passed"),
      };
    }
    catch (error) {
      const detail = this.service.formatOriginError(error);
      this.originPathFeedback = {
        type: "error",
        message: localize("settings.origin.checkFailed", "Origin connection check failed: {error}", { error: detail }),
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
    this.syncOriginFeedback();
    this.render();
    try {
      await this.service.updateSettings(updates);
      this.originCleanupFeedback = {
        type: "success",
        message: localize("settings.origin.cleanup.saved", "Origin cleanup settings updated."),
      };
    }
    catch (error) {
      this.originCleanupFeedback = {
        type: "error",
        message: localize("settings.origin.cleanup.saveFailed", "Failed to update cleanup settings: {error}", { error: this.service.errorMessage(error) }),
      };
    }
    finally {
      this.originCleanupSaving = false;
      this.syncOriginFeedback();
      this.render();
    }
  }

  private async setNumericDisplayOptimized(optimized: boolean): Promise<void> {
    const normalizedMode = optimized ? "smart" : "raw";
    const currentMode = this.pendingNumericDisplayMode ?? normalizeNumericDisplayMode(this.settings.numericDisplayMode);
    if (normalizedMode === currentMode) {
      return;
    }

    this.pendingNumericDisplayMode = normalizedMode;
    this.render();
    if (!this.numericDisplaySaving) {
      await this.flushNumericDisplayMode();
    }
  }

  private async flushNumericDisplayMode(): Promise<void> {
    this.numericDisplaySaving = true;
    this.render();
    try {
      while (this.pendingNumericDisplayMode !== null) {
        const mode = this.pendingNumericDisplayMode;
        try {
          await this.service.updateSettings({ numericDisplayMode: mode });
        }
        catch {
          if (this.pendingNumericDisplayMode === mode) {
            this.pendingNumericDisplayMode = null;
          }
          break;
        }
        if (this.pendingNumericDisplayMode === mode) {
          this.pendingNumericDisplayMode = null;
        }
        this.render();
      }
    } finally {
      this.numericDisplaySaving = false;
      this.render();
    }
  }

  private async updateOriginPlot(updates: Partial<OriginPlotOptions>): Promise<void> {
    this.originPlotSaving = true;
    this.originPlotFeedback = IDLE_FEEDBACK;
    this.render();
    try {
      await this.service.updateOriginPlotOptions(updates);
      this.originPlotFeedback = {
        type: "success",
        message: localize("settings.origin.plot.saved", "Origin plot settings updated."),
      };
    }
    catch (error) {
      this.originPlotFeedback = {
        type: "error",
        message: localize("settings.origin.plot.saveFailed", "Failed to update plot settings: {error}", { error: this.service.errorMessage(error) }),
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
    this.syncOriginFeedback();
    this.render();
    try {
      const result = await this.service.runOriginCleanup();
      const removedTotal = Number(result?.removedTotal);
      this.originCleanupFeedback = {
        type: "success",
        message: localize("settings.origin.cleanup.runSuccess", "Cleanup completed. Removed {count} job folder(s).", {
          count: Number.isFinite(removedTotal) && removedTotal >= 0 ? removedTotal : 0,
        }),
      };
    }
    catch (error) {
      this.originCleanupFeedback = {
        type: "error",
        message: localize("settings.origin.cleanup.runFailed", "Cleanup failed: {error}", { error: this.service.errorMessage(error) }),
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
        message: localize("settings.filenameMatching.saved", "Filename field separators updated."),
      };
    }
    catch (error) {
      this.fileNameMatchingFeedback = {
        type: "error",
        message: localize("settings.filenameMatching.saveFailed", "Failed to update filename field separators: {error}", { error: this.service.errorMessage(error) }),
      };
    }
    finally {
      this.fileNameMatchingSaving = false;
      this.render();
    }
  }

  private async updateDefault(updates: Record<string, unknown>): Promise<void> {
    await this.saveDefaults(() => this.service.updateSettings(updates));
  }

  private async saveDefaults(operation: () => Promise<unknown>): Promise<void> {
    this.defaultsSaving = true;
    this.defaultsFeedback = IDLE_FEEDBACK;
    this.render();
    try {
      await operation();
      this.defaultsFeedback = {
        type: "success",
        message: localize("conductorSettings.defaultsSaved", "Chart defaults saved."),
      };
    }
    catch (error) {
      this.defaultsFeedback = {
        type: "error",
        message: localize("conductorSettings.defaultsSaveFailed", "Failed to save chart defaults: {error}", {
          error: this.service.errorMessage(error),
        }),
      };
    }
    finally {
      this.defaultsSaving = false;
      this.render();
    }
  }

  private async updateAxisDefaults(updates: Record<string, unknown>): Promise<void> {
    await this.saveDefaults(() => this.service.updatePlotAxisSettings(normalizePlotAxisSettings({
      ...this.axisSettings,
      ...updates,
    }, this.axisSettings)));
  }

  private async setWorkbenchBackground(backgroundColor: string): Promise<void> {
    await this.saveAppearance(() => this.commandService.executeCommand(ThemeCommandId.setWorkbenchBackground, backgroundColor));
  }

  private async resetWorkbenchBackground(): Promise<void> {
    await this.saveAppearance(() => this.commandService.executeCommand(ThemeCommandId.resetWorkbenchBackground));
  }

  private async setTransparentChrome(enabled: boolean): Promise<void> {
    const transparentChrome = Boolean(enabled);
    const currentTransparentChrome = this.pendingTransparentChrome ?? normalizeWorkbenchAppearance(this.settings).transparentChrome;
    if (transparentChrome === currentTransparentChrome) {
      return;
    }

    this.pendingTransparentChrome = transparentChrome;
    this.render();
    if (!this.transparentChromeSaving) {
      await this.flushTransparentChrome();
    }
  }

  private async flushTransparentChrome(): Promise<void> {
    this.transparentChromeSaving = true;
    this.render();
    try {
      while (this.pendingTransparentChrome !== null) {
        const transparentChrome = this.pendingTransparentChrome;
        try {
          await this.commandService.executeCommand(ThemeCommandId.setTransparentChrome, transparentChrome);
        }
        catch {
          if (this.pendingTransparentChrome === transparentChrome) {
            this.pendingTransparentChrome = null;
          }
          break;
        }
        if (this.pendingTransparentChrome === transparentChrome) {
          this.pendingTransparentChrome = null;
        }
        this.render();
      }
    }
    finally {
      this.transparentChromeSaving = false;
      this.render();
    }
  }

  private async setFilesExplorerDensity(value: string): Promise<void> {
    const density = normalizeFilesExplorerDensity(value);
    if (density === normalizeFilesExplorerDensity(this.settings.filesExplorerDensity)) {
      return;
    }

    this.explorerAppearanceSaving = true;
    this.render();
    try {
      await this.service.updateSettings({
        filesExplorerDensity: density,
      });
    }
    finally {
      this.explorerAppearanceSaving = false;
      this.render();
    }
  }

  private async setFilesExplorerShowBadges(enabled: boolean): Promise<void> {
    const showBadges = normalizeFilesExplorerShowBadges(enabled);
    const currentShowBadges = this.pendingExplorerBadgeVisibility ?? normalizeFilesExplorerShowBadges(this.settings.filesExplorerShowBadges);
    if (showBadges === currentShowBadges) {
      return;
    }

    this.pendingExplorerBadgeVisibility = showBadges;
    this.render();
    if (!this.explorerBadgeSaving) {
      await this.flushFilesExplorerShowBadges();
    }
  }

  private async flushFilesExplorerShowBadges(): Promise<void> {
    this.explorerBadgeSaving = true;
    this.render();
    try {
      while (this.pendingExplorerBadgeVisibility !== null) {
        const showBadges = this.pendingExplorerBadgeVisibility;
        try {
          await this.service.updateSettings({
            filesExplorerShowBadges: showBadges,
          });
        }
        catch {
          if (this.pendingExplorerBadgeVisibility === showBadges) {
            this.pendingExplorerBadgeVisibility = null;
          }
          break;
        }
        if (this.pendingExplorerBadgeVisibility === showBadges) {
          this.pendingExplorerBadgeVisibility = null;
        }
        this.render();
      }
    }
    finally {
      this.explorerBadgeSaving = false;
      this.render();
    }
  }

  private async setFilesExplorerBadgeColor(
    badge: string,
    color: string,
  ): Promise<void> {
    if (this.explorerBadgeColorSaving) {
      return;
    }

    const currentColors = normalizeFilesExplorerBadgeColors(this.settings.filesExplorerBadgeColors);
    if (!Object.prototype.hasOwnProperty.call(currentColors, badge)) {
      return;
    }

    const nextColor = normalizeFilesExplorerBadgeColor(color);
    if (currentColors[badge] === nextColor) {
      return;
    }

    const nextColors = {
      ...currentColors,
      [badge]: nextColor,
    };
    this.pendingExplorerBadgeColors = nextColors;
    this.explorerBadgeColorSaving = true;
    this.render();
    try {
      await this.service.updateSettings({
        filesExplorerBadgeColors: nextColors,
      });
    }
    finally {
      this.explorerBadgeColorSaving = false;
      this.pendingExplorerBadgeColors = null;
      this.render();
    }
  }

  private async saveAppearance(operation: () => Promise<unknown>): Promise<void> {
    this.appearanceSaving = true;
    this.render();
    try {
      await operation();
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
      await this.commandService.executeCommand(UpdateCommandId.check);
    }
    catch {
      // Update check result is shown by desktop shell dialogs.
    }
    finally {
      this.drafts.appUpdateChecking = false;
      this.render();
    }
  }
}
