import { localize } from "src/cs/nls";
import {
  DEFAULT_ORIGIN_PLOT_OPTIONS,
  normalizeOriginPlotOptions,
  normalizeOriginPostCommands,
  originPostCommandsToMultiline,
  type OriginPlotOptions,
} from "src/cs/workbench/services/origin/common/originPlotOptions";
import { normalizePlotAxisSettings } from "src/cs/workbench/services/plot/common/plotSettings";
import { normalizeFileNameFieldSeparators } from "src/cs/workbench/services/settings/common/fileNameMatching";
import {
  IDLE_FEEDBACK,
  type Feedback,
  type NotificationFeedbackState,
} from "src/cs/workbench/contrib/settings/common/feedback";
import {
  SettingsNavigationView,
  SettingsView,
  type SettingsContentDescriptorId,
  type SettingsContentItemId,
  type SettingsViewOptions,
  type SettingsViewUpdateTarget,
} from "src/cs/workbench/contrib/settings/browser/settingsView";
import { toDisposable, type IDisposable } from "src/cs/base/common/lifecycle";
import {
  createSettingsSections,
  type SettingsSectionId,
} from "src/cs/workbench/contrib/settings/browser/settingsLayout";
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
  normalizeTableTemplateVisualizationEnabled,
  normalizeTemplateDisabledBuiltinDomainPackIds,
  normalizeTemplateDisabledBuiltinSemanticIds,
  normalizeTemplateSemanticAllowlist,
  normalizeTemplateSemanticTermOrder,
  normalizeTemplateXAxisIntentPriority,
  type ConductorSettings,
  type FilesExplorerBadgeColor,
  type ISettingsService,
  type SettingsViewInput,
  type TemplateSemanticTermRule,
  type TemplateSemanticAxisTendency,
  type TemplateSemanticColumnRole,
  type TemplateSemanticFamily,
  type TemplateSemanticIvMode,
  type TemplateSemanticMatchPolicy,
  type TemplateSemanticUnit,
  type TemplateXAxisIntent,
} from "src/cs/workbench/services/settings/common/settings";
import {
  dataResourceBuiltinSemanticTerms,
  dataResourceBuiltinSemanticDomainPacks,
  type DataResourceBuiltinSemanticTerm,
} from "src/cs/workbench/services/dataResource/common/semanticLibrary";
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

const settingsContentUpdateTarget: SettingsViewUpdateTarget = { type: "content" };
const chartDefaultsItemIds = [
  "settings-default-transfer-y-scale-card",
  "settings-default-output-y-scale-card",
  "settings-default-cv-y-scale-card",
  "settings-default-cf-y-scale-card",
  "settings-default-pv-y-scale-card",
  "settings-chart-scale-feedback-card",
  "settings-chart-defaults-card",
] as const satisfies readonly SettingsContentItemId[];
const originAllItemIds = [
  "settings-origin-path-card",
  "settings-origin-cleanup-card",
  "settings-origin-plot-card",
] as const satisfies readonly SettingsContentItemId[];
const appearanceBackgroundItemIds = [
  "settings-background-card",
] as const satisfies readonly SettingsContentItemId[];
const templateSemanticCustomTermItemIds = [
  "settings-template-semantic-active-terms-card",
  "settings-template-semantic-term-input-card",
  "settings-template-semantic-feedback-card",
] as const satisfies readonly SettingsContentItemId[];
const templateSemanticBuiltinTermItemIds = [
  "settings-template-semantic-active-terms-card",
  "settings-template-semantic-recommended-terms-card",
  "settings-template-semantic-feedback-card",
] as const satisfies readonly SettingsContentItemId[];
const templateSemanticBuiltinTermFromInputItemIds = [
  "settings-template-semantic-active-terms-card",
  "settings-template-semantic-term-input-card",
  "settings-template-semantic-recommended-terms-card",
  "settings-template-semantic-feedback-card",
] as const satisfies readonly SettingsContentItemId[];
const templateSemanticListItemIds = [
  "settings-template-semantic-active-terms-card",
  "settings-template-semantic-recommended-terms-card",
] as const satisfies readonly SettingsContentItemId[];

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
  searchQuery: string;
  templateSemanticTermDraft: string;
  templateSemanticAxisDraft: TemplateSemanticAxisTendency;
  templateSemanticFamilyDraft: TemplateSemanticFamily | "";
  templateSemanticIntentDraft: TemplateXAxisIntent | "";
  templateSemanticIvModeDraft: TemplateSemanticIvMode | "";
  templateSemanticMatchPolicyDraft: TemplateSemanticMatchPolicy;
  templateSemanticRoleDraft: TemplateSemanticColumnRole;
  templateSemanticUnitDraft: TemplateSemanticUnit | "";
  tickLabelFontSizeDraft: string;
  xyPairsDraft: string;
};

const ORIGIN_HEALTH_NOTIFICATION_ID = "settings.originHealth";
const CLEANUP_NOTIFICATION_ID = "settings.cleanup";

export class SettingsController {
  private readonly service: ISettingsService;
  private contentAttachment: IDisposable | null = null;
  private contentView: SettingsView | null = null;
  private navigationAttachment: IDisposable | null = null;
  private navigationView: SettingsNavigationView | null = null;
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
  private templateSettingsSaving = false;
  private templateSettingsFeedback: Feedback = IDLE_FEEDBACK;
  private defaultsSaving = false;
  private defaultsFeedback: Feedback = IDLE_FEEDBACK;
  private appearanceSaving = false;
  private explorerBadgeSaving = false;
  private explorerBadgeColorSaving = false;
  private explorerAppearanceSaving = false;
  private pendingExplorerBadgeColors: Record<string, FilesExplorerBadgeColor> | null = null;
  private pendingExplorerBadgeVisibility: boolean | null = null;
  private pendingNumericDisplayMode: "raw" | "smart" | null = null;
  private pendingTableTemplateVisualizationEnabled: boolean | null = null;
  private pendingTransparentChrome: boolean | null = null;
  private transparentChromeSaving = false;
  private numericDisplaySaving = false;
  private tableTemplateVisualizationSaving = false;
  private windowCloseSaving = false;
  private cleanupNotificationSignature: string | null = null;
  private originHealthNotificationSignature: string | null = null;
  private cleanupNotification: INotificationHandle | null = null;
  private originHealthNotification: INotificationHandle | null = null;
  private drafts: SettingsDraftState;
  private options: SettingsControllerOptions;

  constructor(
    container: HTMLElement | null,
    options: SettingsControllerOptions,
    service: ISettingsService,
    private readonly commandService: ICommandService,
    private readonly notificationService: INotificationService,
  ) {
    this.options = options;
    this.service = service;
    this.originExePath = normalizeTrimmedString(options.conductorSettings?.originExePath);
    this.drafts = this.createDraftState();
    if (container) {
      this.attachContent(container);
    }
    this.syncOriginPath();
  }

  public attachContent(container: HTMLElement): IDisposable {
    this.contentAttachment?.dispose();
    const view = new SettingsView(container, this.createViewOptions());
    this.contentView = view;
    const attachment = toDisposable(() => {
      if (this.contentView === view) {
        this.contentView = null;
      }
      view.dispose();
    });
    this.contentAttachment = attachment;
    return attachment;
  }

  public attachNavigation(container: HTMLElement): IDisposable {
    this.navigationAttachment?.dispose();
    const view = new SettingsNavigationView(container, this.createViewOptions());
    this.navigationView = view;
    const attachment = toDisposable(() => {
      if (this.navigationView === view) {
        this.navigationView = null;
      }
      view.dispose();
    });
    this.navigationAttachment = attachment;
    return attachment;
  }

  update(options: SettingsControllerOptions): void {
    const previous = this.options;
    this.options = options;
    this.syncDrafts(previous);
    this.syncOriginFeedback();
    this.syncOriginPath();
    this.render(getSettingsViewUpdateTarget(previous, options));
  }

  dispose(): void {
    this.disposed = true;
    this.originHealthNotification?.close();
    this.cleanupNotification?.close();
    this.contentAttachment?.dispose();
    this.navigationAttachment?.dispose();
    this.contentAttachment = null;
    this.navigationAttachment = null;
    this.contentView = null;
    this.navigationView = null;
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
      searchQuery: "",
      templateSemanticTermDraft: "",
      templateSemanticAxisDraft: "x",
      templateSemanticFamilyDraft: "",
      templateSemanticIntentDraft: "",
      templateSemanticIvModeDraft: "",
      templateSemanticMatchPolicyDraft: "exact",
      templateSemanticRoleDraft: "voltage",
      templateSemanticUnitDraft: "",
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
    this.render(itemsUpdateTarget("origin-integration", "settings-origin-path-card"));
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
      this.render(itemsUpdateTarget("origin-integration", "settings-origin-path-card"));
    }
  }

  private render(target: SettingsViewUpdateTarget): void {
    if (this.disposed) {
      return;
    }
    this.updateNotifications();
    const options = this.createViewOptions();
    this.contentView?.update(options, target);
    this.navigationView?.update(options);
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
    this.render(itemsUpdateTarget("origin-integration", "settings-origin-cleanup-card"));
  }

  private closeOriginHealthNotification(): void {
    this.originPathFeedback = IDLE_FEEDBACK;
    this.drafts.originHealthNotification = { ...this.drafts.originHealthNotification, isVisible: false };
    this.render(itemsUpdateTarget("origin-integration", "settings-origin-path-card"));
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
      tableTemplateVisualizationSettings: this.tableTemplateVisualizationSettings,
      templateSettings: this.templateSettings,
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
      searchQuery: this.drafts.searchQuery,
      setActiveSettingsSection: section => {
        this.drafts.activeSettingsSection = section;
        this.render(settingsContentUpdateTarget);
      },
      setSearchQuery: value => {
        this.drafts.searchQuery = value;
        this.render(settingsContentUpdateTarget);
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
      setTemplateSemanticTermDraft: value => {
        this.drafts.templateSemanticTermDraft = value;
      },
      setTemplateSemanticAxisDraft: value => {
        if (value === "x" || value === "dependent" || value === "unknown") {
          this.drafts.templateSemanticAxisDraft = value;
        }
      },
      setTemplateSemanticFamilyDraft: value => {
        if (value === "" || value === "iv" || value === "cv" || value === "cf" || value === "pv" || value === "it" || value === "unknown") {
          this.drafts.templateSemanticFamilyDraft = value;
        }
      },
      setTemplateSemanticIntentDraft: value => {
        if (value === "" || value === "rawTransient" || value === "ivCurve" || value === "pvCurve" || value === "cvCurve" || value === "frequencySweep" || value === "genericXY") {
          this.drafts.templateSemanticIntentDraft = value;
        }
      },
      setTemplateSemanticIvModeDraft: value => {
        if (value === "" || value === "transfer" || value === "output" || value === "unknown") {
          this.drafts.templateSemanticIvModeDraft = value;
        }
      },
      setTemplateSemanticMatchPolicyDraft: value => {
        if (value === "exact" || value === "token" || value === "contains") {
          this.drafts.templateSemanticMatchPolicyDraft = value;
        }
      },
      setTemplateSemanticRoleDraft: value => {
        if (this.templateSemanticRoleOptions.some(option => option.value === value)) {
          this.drafts.templateSemanticRoleDraft = value as TemplateSemanticColumnRole;
        }
      },
      setTemplateSemanticUnitDraft: value => {
        if (value === "" || value === "V" || value === "A" || value === "ohm" || value === "s" || value === "F" || value === "Hz" || value === "S") {
          this.drafts.templateSemanticUnitDraft = value;
        }
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
      templateSemanticTermDraft: this.drafts.templateSemanticTermDraft,
      templateSemanticAxisDraft: this.drafts.templateSemanticAxisDraft,
      templateSemanticFamilyDraft: this.drafts.templateSemanticFamilyDraft,
      templateSemanticIntentDraft: this.drafts.templateSemanticIntentDraft,
      templateSemanticIvModeDraft: this.drafts.templateSemanticIvModeDraft,
      templateSemanticMatchPolicyDraft: this.drafts.templateSemanticMatchPolicyDraft,
      templateSemanticRoleDraft: this.drafts.templateSemanticRoleDraft,
      templateSemanticUnitDraft: this.drafts.templateSemanticUnitDraft,
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

  private get tableTemplateVisualizationSettings(): SettingsViewOptions["tableTemplateVisualizationSettings"] {
    return {
      enabled: this.pendingTableTemplateVisualizationEnabled ?? normalizeTableTemplateVisualizationEnabled(this.settings.tableTemplateVisualizationEnabled),
      isSaving: this.tableTemplateVisualizationSaving,
      onEnabledChange: value => this.setTableTemplateVisualizationEnabled(value),
    };
  }

  private get templateSettings(): SettingsViewOptions["templateSettings"] {
    const customTerms = normalizeTemplateSemanticAllowlist(this.settings.templateSemanticAllowlist).map(toTemplateSemanticTermView);
    const builtinTerms = dataResourceBuiltinSemanticTerms.map(toBuiltinTemplateSemanticTermView);
    const disabledBuiltinTermIds = normalizeTemplateDisabledBuiltinSemanticIds(this.settings.templateDisabledBuiltinSemanticIds);
    return {
      activeTerms: createTemplateActiveSemanticTerms(
        builtinTerms,
        customTerms,
        disabledBuiltinTermIds,
        normalizeTemplateSemanticTermOrder(this.settings.templateSemanticTermOrder),
      ),
      customTerms,
      axisOptions: this.templateSemanticAxisOptions,
      builtinTerms,
      builtinDomainPacks: dataResourceBuiltinSemanticDomainPacks,
      disabledDomainPackIds: normalizeTemplateDisabledBuiltinDomainPackIds(this.settings.templateDisabledBuiltinDomainPackIds),
      disabledBuiltinTermIds,
      familyOptions: this.templateSemanticFamilyOptions,
      feedback: this.templateSettingsFeedback,
      intentOptions: this.templateSemanticIntentOptions,
      isSaving: this.templateSettingsSaving,
      ivModeOptions: this.templateSemanticIvModeOptions,
      matchPolicyOptions: this.templateSemanticMatchPolicyOptions,
      onAddSemanticTerm: () => this.addTemplateSemanticTerm(),
      onDisableBuiltinTerm: id => this.disableTemplateBuiltinTerm(id),
      onDisableDomainPack: id => this.disableTemplateDomainPack(id),
      onEnableBuiltinTerm: id => this.enableTemplateBuiltinTerm(id),
      onEnableDomainPack: id => this.enableTemplateDomainPack(id),
      onMoveXAxisIntent: (sourceIntent, targetIntent) => this.moveTemplateXAxisIntent(sourceIntent, targetIntent),
      onRemoveSemanticTerm: id => this.removeTemplateSemanticTerm(id),
      roleOptions: this.templateSemanticRoleOptions,
      unitOptions: this.templateSemanticUnitOptions,
      xAxisIntentPriority: normalizeTemplateXAxisIntentPriority(this.settings.templateXAxisIntentPriority),
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

  private get templateSemanticRoleOptions(): SelectOption[] {
    return [
      { value: "voltage", label: localize("settings.template.role.voltage", "voltage") },
      { value: "current", label: localize("settings.template.role.current", "current") },
      { value: "time", label: localize("settings.template.role.time", "time") },
      { value: "frequency", label: localize("settings.template.role.frequency", "frequency") },
      { value: "capacitance", label: localize("settings.template.role.capacitance", "capacitance") },
      { value: "conductance", label: localize("settings.template.role.conductance", "conductance") },
      { value: "vg", label: localize("settings.template.role.vg", "vg") },
      { value: "vd", label: localize("settings.template.role.vd", "vd") },
      { value: "vs", label: localize("settings.template.role.vs", "vs") },
      { value: "id", label: localize("settings.template.role.id", "id") },
      { value: "ig", label: localize("settings.template.role.ig", "ig") },
      { value: "is", label: localize("settings.template.role.is", "is") },
      { value: "unknown", label: localize("settings.template.role.unknown", "unknown") },
    ];
  }

  private get templateSemanticAxisOptions(): SelectOption[] {
    return [
      { value: "x", label: "X" },
      { value: "dependent", label: localize("settings.template.axis.dependent", "Y/dependent") },
      { value: "unknown", label: localize("settings.template.axis.unknown", "unknown") },
    ];
  }

  private get templateSemanticMatchPolicyOptions(): SelectOption[] {
    return [
      { value: "exact", label: localize("settings.template.matchPolicy.exact", "exact") },
      { value: "token", label: localize("settings.template.matchPolicy.token", "token") },
      { value: "contains", label: localize("settings.template.matchPolicy.contains", "contains") },
    ];
  }

  private get templateSemanticIntentOptions(): SelectOption[] {
    return [
      { value: "", label: localize("settings.template.intent.none", "none") },
      { value: "pvCurve", label: localize("settings.template.intent.pvCurve", "PV curve") },
      { value: "ivCurve", label: localize("settings.template.intent.ivCurve", "IV curve") },
      { value: "cvCurve", label: localize("settings.template.intent.cvCurve", "CV curve") },
      { value: "frequencySweep", label: localize("settings.template.intent.frequencySweep", "Frequency sweep") },
      { value: "rawTransient", label: localize("settings.template.intent.rawTransient", "Raw transient") },
      { value: "genericXY", label: localize("settings.template.intent.genericXY", "Generic XY") },
    ];
  }

  private get templateSemanticUnitOptions(): SelectOption[] {
    return [
      { value: "", label: localize("settings.template.unit.none", "none") },
      { value: "V", label: "V" },
      { value: "A", label: "A" },
      { value: "s", label: "s" },
      { value: "F", label: "F" },
      { value: "Hz", label: "Hz" },
      { value: "S", label: "S" },
      { value: "ohm", label: "ohm" },
    ];
  }

  private get templateSemanticFamilyOptions(): SelectOption[] {
    return [
      { value: "", label: localize("settings.template.family.none", "none") },
      { value: "iv", label: "iv" },
      { value: "cv", label: "cv" },
      { value: "cf", label: "cf" },
      { value: "pv", label: "pv" },
      { value: "it", label: "it" },
      { value: "unknown", label: localize("settings.template.family.unknown", "unknown") },
    ];
  }

  private get templateSemanticIvModeOptions(): SelectOption[] {
    return [
      { value: "", label: localize("settings.template.ivMode.none", "none") },
      { value: "transfer", label: localize("settings.template.ivMode.transfer", "transfer") },
      { value: "output", label: localize("settings.template.ivMode.output", "output") },
      { value: "unknown", label: localize("settings.template.ivMode.unknown", "unknown") },
    ];
  }

  private get settingsSections() {
    return createSettingsSections();
  }

  private async chooseOriginExePath(): Promise<void> {
    if (!this.service.canManageOrigin() || this.originPathLoading || this.originPathSaving || this.originHealthChecking) {
      return;
    }

    this.originPathSaving = true;
    this.originPathFeedback = IDLE_FEEDBACK;
    this.syncOriginFeedback();
    this.render(itemsUpdateTarget("origin-integration", "settings-origin-path-card"));
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
      this.render(itemsUpdateTarget("origin-integration", "settings-origin-path-card"));
    }
  }

  private async checkOriginHealth(): Promise<void> {
    if (!this.service.canCheckOriginHealth() || this.originPathSaving || this.originHealthChecking || this.originPathLoading) {
      return;
    }

    this.originHealthChecking = true;
    this.originPathFeedback = IDLE_FEEDBACK;
    this.syncOriginFeedback();
    this.render(itemsUpdateTarget("origin-integration", "settings-origin-path-card"));
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
      this.render(itemsUpdateTarget("origin-integration", "settings-origin-path-card"));
    }
  }

  private async updateOriginCleanup(updates: Record<string, unknown>): Promise<void> {
    this.originCleanupSaving = true;
    this.originCleanupFeedback = IDLE_FEEDBACK;
    this.syncOriginFeedback();
    this.render(itemsUpdateTarget("origin-integration", "settings-origin-cleanup-card"));
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
      this.render(itemsUpdateTarget("origin-integration", "settings-origin-cleanup-card"));
    }
  }

  private async setNumericDisplayOptimized(optimized: boolean): Promise<void> {
    const normalizedMode = optimized ? "smart" : "raw";
    const currentMode = this.pendingNumericDisplayMode ?? normalizeNumericDisplayMode(this.settings.numericDisplayMode);
    if (normalizedMode === currentMode) {
      return;
    }

    this.pendingNumericDisplayMode = normalizedMode;
    this.render(itemsUpdateTarget("general-preferences", "settings-numeric-display-card"));
    if (!this.numericDisplaySaving) {
      await this.flushNumericDisplayMode();
    }
  }

  private async flushNumericDisplayMode(): Promise<void> {
    this.numericDisplaySaving = true;
    this.render(itemsUpdateTarget("general-preferences", "settings-numeric-display-card"));
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
        this.render(itemsUpdateTarget("general-preferences", "settings-numeric-display-card"));
      }
    } finally {
      this.numericDisplaySaving = false;
      this.render(itemsUpdateTarget("general-preferences", "settings-numeric-display-card"));
    }
  }

  private async setTableTemplateVisualizationEnabled(enabled: boolean): Promise<void> {
    const normalized = Boolean(enabled);
    const current = this.pendingTableTemplateVisualizationEnabled ?? normalizeTableTemplateVisualizationEnabled(this.settings.tableTemplateVisualizationEnabled);
    if (normalized === current) {
      return;
    }

    this.pendingTableTemplateVisualizationEnabled = normalized;
    this.render(itemsUpdateTarget("template-preferences", "settings-table-template-visualization-card"));
    if (!this.tableTemplateVisualizationSaving) {
      await this.flushTableTemplateVisualizationEnabled();
    }
  }

  private async flushTableTemplateVisualizationEnabled(): Promise<void> {
    this.tableTemplateVisualizationSaving = true;
    this.render(itemsUpdateTarget("template-preferences", "settings-table-template-visualization-card"));
    try {
      while (this.pendingTableTemplateVisualizationEnabled !== null) {
        const enabled = this.pendingTableTemplateVisualizationEnabled;
        try {
          await this.service.updateSettings({ tableTemplateVisualizationEnabled: enabled });
        }
        catch {
          if (this.pendingTableTemplateVisualizationEnabled === enabled) {
            this.pendingTableTemplateVisualizationEnabled = null;
          }
          break;
        }
        if (this.pendingTableTemplateVisualizationEnabled === enabled) {
          this.pendingTableTemplateVisualizationEnabled = null;
        }
        this.render(itemsUpdateTarget("template-preferences", "settings-table-template-visualization-card"));
      }
    } finally {
      this.tableTemplateVisualizationSaving = false;
      this.render(itemsUpdateTarget("template-preferences", "settings-table-template-visualization-card"));
    }
  }

  private async updateOriginPlot(updates: Partial<OriginPlotOptions>): Promise<void> {
    this.originPlotSaving = true;
    this.originPlotFeedback = IDLE_FEEDBACK;
    this.render(itemsUpdateTarget("origin-integration", "settings-origin-plot-card"));
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
      this.render(itemsUpdateTarget("origin-integration", "settings-origin-plot-card"));
    }
  }

  private async runOriginCleanup(): Promise<void> {
    this.originCleanupRunning = true;
    this.originCleanupFeedback = IDLE_FEEDBACK;
    this.syncOriginFeedback();
    this.render(itemsUpdateTarget("origin-integration", "settings-origin-cleanup-card"));
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
      this.render(itemsUpdateTarget("origin-integration", "settings-origin-cleanup-card"));
    }
  }

  private async setFileNameFieldSeparators(value: string): Promise<void> {
    this.fileNameMatchingSaving = true;
    this.fileNameMatchingFeedback = IDLE_FEEDBACK;
    this.render(itemsUpdateTarget("template-matching", "settings-filename-matching-card"));
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
      this.render(itemsUpdateTarget("template-matching", "settings-filename-matching-card"));
    }
  }

  private async addTemplateSemanticTerm(): Promise<void> {
    const termDraft = this.drafts.templateSemanticTermDraft;
    const term = termDraft.trim();
    const builtinTarget = itemsUpdateTarget("template-semantic-library", ...templateSemanticBuiltinTermFromInputItemIds);
    const customTarget = itemsUpdateTarget("template-semantic-library", ...templateSemanticCustomTermItemIds);
    const feedbackTarget = itemsUpdateTarget("template-semantic-library", "settings-template-semantic-feedback-card");
    if (!term) {
      this.templateSettingsFeedback = {
        type: "error",
        message: localize("settings.template.semantic.emptyTerm", "Enter a match term before adding it."),
      };
      this.render(feedbackTarget);
      return;
    }

    const customTerms = normalizeTemplateSemanticAllowlist(this.settings.templateSemanticAllowlist);
    const disabledBuiltinTermIds = normalizeTemplateDisabledBuiltinSemanticIds(this.settings.templateDisabledBuiltinSemanticIds);
    const activeTermOrder = getTemplateActiveSemanticTermOrder(
      dataResourceBuiltinSemanticTerms,
      customTerms,
      disabledBuiltinTermIds,
      normalizeTemplateSemanticTermOrder(this.settings.templateSemanticTermOrder),
    );
    const disabledBuiltinTermIdSet = new Set(disabledBuiltinTermIds);
    const disabledBuiltinTerm = dataResourceBuiltinSemanticTerms.find(candidate =>
      disabledBuiltinTermIdSet.has(candidate.id) && candidate.alias === term
    );
    const duplicatesEnabledTerm = customTerms.some(candidate => candidate.alias === term) ||
      dataResourceBuiltinSemanticTerms.some(candidate =>
        !disabledBuiltinTermIdSet.has(candidate.id) && candidate.alias === term
      );
    if (duplicatesEnabledTerm) {
      this.templateSettingsFeedback = {
        type: "error",
        message: localize("settings.template.semantic.duplicateTerm", "Match term already exists."),
      };
      this.render(feedbackTarget);
      return;
    }

    if (disabledBuiltinTerm) {
      this.drafts.templateSemanticTermDraft = "";
      await this.saveTemplateSettings({
        templateDisabledBuiltinSemanticIds: disabledBuiltinTermIds.filter(id => id !== disabledBuiltinTerm.id),
        templateSemanticTermOrder: [...activeTermOrder, disabledBuiltinTerm.id],
      }, null, builtinTarget);
      if (this.templateSettingsFeedback.type === "error") {
        this.drafts.templateSemanticTermDraft = termDraft;
        this.render(builtinTarget);
      }
      return;
    }

    const nextRule: TemplateSemanticTermRule = {
      id: `template-semantic-${Date.now().toString(36)}`,
      alias: term,
      canonicalRole: this.drafts.templateSemanticRoleDraft,
      ...(this.drafts.templateSemanticUnitDraft ? { canonicalUnit: this.drafts.templateSemanticUnitDraft } : {}),
      axisTendency: this.drafts.templateSemanticAxisDraft,
      ...(this.drafts.templateSemanticFamilyDraft ? { family: this.drafts.templateSemanticFamilyDraft } : {}),
      ...(this.drafts.templateSemanticIvModeDraft ? { ivMode: this.drafts.templateSemanticIvModeDraft } : {}),
      ...(this.drafts.templateSemanticIntentDraft ? { intent: this.drafts.templateSemanticIntentDraft } : {}),
      matchPolicy: this.drafts.templateSemanticMatchPolicyDraft,
      enabled: true,
    };
    const nextCustomTerms = [
      ...customTerms,
      nextRule,
    ];
    this.drafts.templateSemanticTermDraft = "";
    await this.saveTemplateSettings({
      templateSemanticAllowlist: nextCustomTerms,
      templateSemanticTermOrder: [...activeTermOrder, nextRule.id],
    }, localize("settings.template.semantic.saved", "Template semantic library updated."), customTarget);
    if (this.templateSettingsFeedback.type === "error") {
      this.drafts.templateSemanticTermDraft = termDraft;
      this.render(customTarget);
    }
  }

  private async removeTemplateSemanticTerm(id: string): Promise<void> {
    const customTerms = normalizeTemplateSemanticAllowlist(this.settings.templateSemanticAllowlist)
      .filter(rule => rule.id !== id);
    await this.saveTemplateSettings({
      templateSemanticAllowlist: customTerms,
      templateSemanticTermOrder: normalizeTemplateSemanticTermOrder(this.settings.templateSemanticTermOrder)
        .filter(termId => termId !== id),
    }, localize("settings.template.semantic.saved", "Template semantic library updated."), itemsUpdateTarget("template-semantic-library", "settings-template-semantic-active-terms-card", "settings-template-semantic-feedback-card"));
  }

  private async disableTemplateBuiltinTerm(id: string): Promise<void> {
    const disabledTermIds = normalizeTemplateDisabledBuiltinSemanticIds(this.settings.templateDisabledBuiltinSemanticIds);
    if (disabledTermIds.includes(id)) {
      return;
    }
    await this.saveTemplateSettings({
      templateDisabledBuiltinSemanticIds: [...disabledTermIds, id],
      templateSemanticTermOrder: normalizeTemplateSemanticTermOrder(this.settings.templateSemanticTermOrder)
        .filter(termId => termId !== id),
    }, null, itemsUpdateTarget("template-semantic-library", ...templateSemanticBuiltinTermItemIds));
  }

  private async enableTemplateBuiltinTerm(id: string): Promise<void> {
    const disabledTermIds = normalizeTemplateDisabledBuiltinSemanticIds(this.settings.templateDisabledBuiltinSemanticIds);
    const nextDisabledTermIds = disabledTermIds.filter(disabledId => disabledId !== id);
    const activeTermOrder = getTemplateActiveSemanticTermOrder(
      dataResourceBuiltinSemanticTerms,
      normalizeTemplateSemanticAllowlist(this.settings.templateSemanticAllowlist),
      disabledTermIds,
      normalizeTemplateSemanticTermOrder(this.settings.templateSemanticTermOrder),
    );
    await this.saveTemplateSettings({
      templateDisabledBuiltinSemanticIds: nextDisabledTermIds,
      templateSemanticTermOrder: [...activeTermOrder, id],
    }, null, itemsUpdateTarget("template-semantic-library", ...templateSemanticBuiltinTermItemIds));
  }

  private async disableTemplateDomainPack(id: string): Promise<void> {
    const disabledIds = normalizeTemplateDisabledBuiltinDomainPackIds(this.settings.templateDisabledBuiltinDomainPackIds);
    if (disabledIds.includes(id)) {
      return;
    }
    await this.saveTemplateSettings({
      templateDisabledBuiltinDomainPackIds: [...disabledIds, id],
    }, localize("settings.template.domainPack.disabled", "Domain pack disabled for review."), itemsUpdateTarget("template-library", "settings-template-domain-packs-card"));
  }

  private async enableTemplateDomainPack(id: string): Promise<void> {
    const disabledIds = normalizeTemplateDisabledBuiltinDomainPackIds(this.settings.templateDisabledBuiltinDomainPackIds)
      .filter(disabledId => disabledId !== id);
    await this.saveTemplateSettings({
      templateDisabledBuiltinDomainPackIds: disabledIds,
    }, localize("settings.template.domainPack.enabled", "Domain pack enabled for review."), itemsUpdateTarget("template-library", "settings-template-domain-packs-card"));
  }

  private async moveTemplateXAxisIntent(sourceIntent: TemplateXAxisIntent, targetIntent: TemplateXAxisIntent): Promise<void> {
    if (sourceIntent === targetIntent) {
      return;
    }
    const priority = moveItemBefore(
      normalizeTemplateXAxisIntentPriority(this.settings.templateXAxisIntentPriority),
      intent => intent,
      sourceIntent,
      targetIntent,
    );
    await this.saveTemplateSettings({
      templateXAxisIntentPriority: priority,
    }, localize("settings.template.xAxisPriority.saved", "X axis intent priority updated."), itemsUpdateTarget("template-library", "settings-template-x-axis-priority-card"));
  }

  private async saveTemplateSettings(
    updates: Record<string, unknown>,
    successMessage: string | null,
    target: SettingsViewUpdateTarget,
  ): Promise<void> {
    this.templateSettingsSaving = true;
    this.templateSettingsFeedback = IDLE_FEEDBACK;
    this.render(target);
    try {
      await this.service.updateSettings(updates);
      if (successMessage !== null) {
        this.templateSettingsFeedback = {
          type: "success",
          message: successMessage,
        };
      }
    }
    catch (error) {
      this.templateSettingsFeedback = {
        type: "error",
        message: localize("settings.template.saveFailed", "Failed to update template settings: {error}", {
          error: this.service.errorMessage(error),
        }),
      };
    }
    finally {
      this.templateSettingsSaving = false;
      this.render(target);
    }
  }

  private async updateDefault(updates: Record<string, unknown>): Promise<void> {
    await this.saveDefaults(() => this.service.updateSettings(updates));
  }

  private async saveDefaults(operation: () => Promise<unknown>): Promise<void> {
    this.defaultsSaving = true;
    this.defaultsFeedback = IDLE_FEEDBACK;
    this.render(itemsUpdateTarget("chart-defaults", ...chartDefaultsItemIds));
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
      this.render(itemsUpdateTarget("chart-defaults", ...chartDefaultsItemIds));
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
    this.render(itemsUpdateTarget("appearance-preferences", "settings-transparent-chrome-card"));
    if (!this.transparentChromeSaving) {
      await this.flushTransparentChrome();
    }
  }

  private async flushTransparentChrome(): Promise<void> {
    this.transparentChromeSaving = true;
    this.render(itemsUpdateTarget("appearance-preferences", "settings-transparent-chrome-card"));
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
        this.render(itemsUpdateTarget("appearance-preferences", "settings-transparent-chrome-card"));
      }
    }
    finally {
      this.transparentChromeSaving = false;
      this.render(itemsUpdateTarget("appearance-preferences", "settings-transparent-chrome-card"));
    }
  }

  private async setFilesExplorerDensity(value: string): Promise<void> {
    const density = normalizeFilesExplorerDensity(value);
    if (density === normalizeFilesExplorerDensity(this.settings.filesExplorerDensity)) {
      return;
    }

    this.explorerAppearanceSaving = true;
    this.render(itemsUpdateTarget("appearance-preferences", "settings-explorer-density-card"));
    try {
      await this.service.updateSettings({
        filesExplorerDensity: density,
      });
    }
    finally {
      this.explorerAppearanceSaving = false;
      this.render(itemsUpdateTarget("appearance-preferences", "settings-explorer-density-card"));
    }
  }

  private async setFilesExplorerShowBadges(enabled: boolean): Promise<void> {
    const showBadges = normalizeFilesExplorerShowBadges(enabled);
    const currentShowBadges = this.pendingExplorerBadgeVisibility ?? normalizeFilesExplorerShowBadges(this.settings.filesExplorerShowBadges);
    if (showBadges === currentShowBadges) {
      return;
    }

    this.pendingExplorerBadgeVisibility = showBadges;
    this.render(itemsUpdateTarget("appearance-preferences", "settings-explorer-badges-card"));
    if (!this.explorerBadgeSaving) {
      await this.flushFilesExplorerShowBadges();
    }
  }

  private async flushFilesExplorerShowBadges(): Promise<void> {
    this.explorerBadgeSaving = true;
    this.render(itemsUpdateTarget("appearance-preferences", "settings-explorer-badges-card"));
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
        this.render(itemsUpdateTarget("appearance-preferences", "settings-explorer-badges-card"));
      }
    }
    finally {
      this.explorerBadgeSaving = false;
      this.render(itemsUpdateTarget("appearance-preferences", "settings-explorer-badges-card"));
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
    this.render(itemsUpdateTarget("appearance-preferences", "settings-explorer-badge-colors-card"));
    try {
      await this.service.updateSettings({
        filesExplorerBadgeColors: nextColors,
      });
    }
    finally {
      this.explorerBadgeColorSaving = false;
      this.pendingExplorerBadgeColors = null;
      this.render(itemsUpdateTarget("appearance-preferences", "settings-explorer-badge-colors-card"));
    }
  }

  private async saveAppearance(operation: () => Promise<unknown>): Promise<void> {
    this.appearanceSaving = true;
    this.render(itemsUpdateTarget("appearance-preferences", ...appearanceBackgroundItemIds));
    try {
      await operation();
    }
    finally {
      this.appearanceSaving = false;
      this.render(itemsUpdateTarget("appearance-preferences", ...appearanceBackgroundItemIds));
    }
  }

  private async setWindowCloseBehavior(behavior: "minimizeToTray" | "quit"): Promise<void> {
    this.windowCloseSaving = true;
    this.render(itemsUpdateTarget("general-preferences", "settings-close-behavior-card"));
    try {
      await this.service.updateSettings({
        windowCloseBehavior: behavior === "quit" ? "quit" : "minimizeToTray",
      });
    }
    finally {
      this.windowCloseSaving = false;
      this.render(itemsUpdateTarget("general-preferences", "settings-close-behavior-card"));
    }
  }

  private async checkForUpdates(): Promise<void> {
    this.drafts.appUpdateChecking = true;
    this.render(itemsUpdateTarget("about", "settings-app-update-card"));
    try {
      await this.commandService.executeCommand(UpdateCommandId.check);
    }
    catch {
      // Update check result is shown by desktop shell dialogs.
    }
    finally {
      this.drafts.appUpdateChecking = false;
      this.render(itemsUpdateTarget("about", "settings-app-update-card"));
    }
  }
}

function itemsUpdateTarget(
  descriptorId: SettingsContentDescriptorId,
  ...itemIds: readonly SettingsContentItemId[]
): SettingsViewUpdateTarget {
  return partialSettingsUpdateTarget([], [{ descriptorId, itemIds }]);
}

function partialSettingsUpdateTarget(
  descriptorIds: readonly SettingsContentDescriptorId[],
  itemTargets: readonly { readonly descriptorId: SettingsContentDescriptorId; readonly itemIds: readonly SettingsContentItemId[] }[],
): SettingsViewUpdateTarget {
  return {
    type: "partial",
    descriptorIds,
    itemTargets,
  };
}

function getSettingsViewUpdateTarget(
  current: SettingsControllerOptions,
  next: SettingsControllerOptions,
): SettingsViewUpdateTarget {
  if (current.conductorSettingsLoaded !== next.conductorSettingsLoaded) {
    return settingsContentUpdateTarget;
  }

  const descriptorIds = new Set<SettingsContentDescriptorId>();
  const itemTargets = new Map<SettingsContentDescriptorId, Set<SettingsContentItemId>>();
  if (current.appUpdateSettings.currentVersion !== next.appUpdateSettings.currentVersion) {
    addItemTarget(itemTargets, "about", "settings-about-version-card", "settings-release-notes-card");
  }
  if (current.appUpdateSettings.isAvailable !== next.appUpdateSettings.isAvailable) {
    addItemTarget(itemTargets, "about", "settings-app-update-card");
  }
  if (current.isWindowsDesktopShell !== next.isWindowsDesktopShell) {
    addItemTarget(itemTargets, "origin-integration", "settings-origin-path-card", "settings-origin-cleanup-card", "settings-origin-plot-card");
  }
  if (current.theme !== next.theme) {
    addItemTarget(itemTargets, "appearance-preferences", "settings-theme-card");
  }

  for (const key of getChangedConductorSettingsKeys(current.conductorSettings, next.conductorSettings)) {
    const itemTarget = getConductorSettingItemTarget(key);
    if (itemTarget) {
      addItemTarget(itemTargets, itemTarget.descriptorId, ...itemTarget.itemIds);
    }
  }

  return partialSettingsUpdateTarget(
    [...descriptorIds],
    [...itemTargets].map(([descriptorId, itemIds]) => ({ descriptorId, itemIds: [...itemIds] })),
  );
}

function getChangedConductorSettingsKeys(
  current: ConductorSettings | null,
  next: ConductorSettings | null,
): readonly string[] {
  const keys = new Set<string>([
    ...Object.keys(current ?? {}),
    ...Object.keys(next ?? {}),
  ]);
  const changedKeys: string[] = [];
  for (const key of keys) {
    if (!Object.is(current?.[key], next?.[key])) {
      changedKeys.push(key);
    }
  }
  return changedKeys;
}

function addItemTarget(
  targets: Map<SettingsContentDescriptorId, Set<SettingsContentItemId>>,
  descriptorId: SettingsContentDescriptorId,
  ...itemIds: readonly SettingsContentItemId[]
): void {
  let descriptorItemIds = targets.get(descriptorId);
  if (!descriptorItemIds) {
    descriptorItemIds = new Set();
    targets.set(descriptorId, descriptorItemIds);
  }
  for (const itemId of itemIds) {
    descriptorItemIds.add(itemId);
  }
}

function getConductorSettingItemTarget(key: string): { readonly descriptorId: SettingsContentDescriptorId; readonly itemIds: readonly SettingsContentItemId[] } | null {
  switch (key) {
    case "windowCloseBehavior":
      return { descriptorId: "general-preferences", itemIds: ["settings-close-behavior-card"] };
    case "numericDisplayMode":
      return { descriptorId: "general-preferences", itemIds: ["settings-numeric-display-card"] };
    case "tableTemplateVisualizationEnabled":
      return { descriptorId: "template-preferences", itemIds: ["settings-table-template-visualization-card"] };
    case "fileNameFieldSeparators":
      return { descriptorId: "template-matching", itemIds: ["settings-filename-matching-card"] };
    case "templateDisabledBuiltinDomainPackIds":
      return { descriptorId: "template-library", itemIds: ["settings-template-domain-packs-card"] };
    case "templateXAxisIntentPriority":
      return { descriptorId: "template-library", itemIds: ["settings-template-x-axis-priority-card"] };
    case "templateDisabledBuiltinSemanticIds":
      return { descriptorId: "template-semantic-library", itemIds: templateSemanticListItemIds };
    case "templateSemanticAllowlist":
    case "templateSemanticTermOrder":
      return { descriptorId: "template-semantic-library", itemIds: ["settings-template-semantic-active-terms-card"] };
    case "defaultYScaleForCf":
      return { descriptorId: "chart-defaults", itemIds: ["settings-default-cf-y-scale-card"] };
    case "defaultYScaleForCv":
      return { descriptorId: "chart-defaults", itemIds: ["settings-default-cv-y-scale-card"] };
    case "defaultYScaleForOutput":
      return { descriptorId: "chart-defaults", itemIds: ["settings-default-output-y-scale-card"] };
    case "defaultYScaleForPv":
      return { descriptorId: "chart-defaults", itemIds: ["settings-default-pv-y-scale-card"] };
    case "defaultYScaleForTransfer":
      return { descriptorId: "chart-defaults", itemIds: ["settings-default-transfer-y-scale-card"] };
    case "defaultYScaleForSpecial":
      return {
        descriptorId: "chart-defaults",
        itemIds: [
          "settings-default-cv-y-scale-card",
          "settings-default-cf-y-scale-card",
          "settings-default-pv-y-scale-card",
        ],
      };
    case "plotAxisSettings":
      return { descriptorId: "chart-defaults", itemIds: ["settings-chart-defaults-card"] };
    case "backgroundColor":
      return { descriptorId: "appearance-preferences", itemIds: ["settings-background-card"] };
    case "filesExplorerBadgeColors":
      return { descriptorId: "appearance-preferences", itemIds: ["settings-explorer-badge-colors-card"] };
    case "filesExplorerDensity":
      return { descriptorId: "appearance-preferences", itemIds: ["settings-explorer-density-card"] };
    case "filesExplorerShowBadges":
      return { descriptorId: "appearance-preferences", itemIds: ["settings-explorer-badges-card"] };
    case "theme":
      return { descriptorId: "appearance-preferences", itemIds: ["settings-theme-card"] };
    case "transparentChrome":
      return { descriptorId: "appearance-preferences", itemIds: ["settings-transparent-chrome-card"] };
    case "originExePath":
      return { descriptorId: "origin-integration", itemIds: ["settings-origin-path-card"] };
    case "originExportModeDefault":
      return { descriptorId: "origin-integration", itemIds: ["settings-origin-plot-card"] };
    case "originPlotCommandDefault":
    case "originPlotPostCommandsDefault":
    case "originPlotTypeDefault":
    case "originPlotXyPairsDefault":
    case "originPlotLineWidthDefault":
    case "originPlotSymbolShapeDefault":
    case "originPlotLegendFontSizeDefault":
      return { descriptorId: "origin-integration", itemIds: ["settings-origin-plot-card"] };
    case "originRuntimeCleanupEnabled":
    case "originRuntimeFailedRetentionDays":
    case "originRuntimeKeepSuccessJobs":
      return { descriptorId: "origin-integration", itemIds: ["settings-origin-cleanup-card"] };
  }

  return null;
}

function moveItemBefore<T>(
  values: readonly T[],
  getId: (value: T) => string,
  sourceId: string,
  targetId: string,
): T[] {
  const result = values.slice();
  const sourceIndex = result.findIndex(value => getId(value) === sourceId);
  const targetIndex = result.findIndex(value => getId(value) === targetId);
  if (sourceIndex === -1 || targetIndex === -1 || sourceIndex === targetIndex) {
    return result;
  }
  const [source] = result.splice(sourceIndex, 1);
  const nextTargetIndex = result.findIndex(value => getId(value) === targetId);
  result.splice(nextTargetIndex === -1 ? result.length : nextTargetIndex, 0, source);
  return result;
}

function createTemplateActiveSemanticTerms(
  builtinTerms: readonly SettingsViewOptions["templateSettings"]["builtinTerms"][number][],
  customTerms: readonly SettingsViewOptions["templateSettings"]["customTerms"][number][],
  disabledBuiltinTermIds: readonly string[],
  termOrder: readonly string[],
): readonly SettingsViewOptions["templateSettings"]["activeTerms"][number][] {
  const disabledBuiltinTermIdSet = new Set(disabledBuiltinTermIds);
  const activeTermsById = new Map<string, SettingsViewOptions["templateSettings"]["activeTerms"][number]>();
  for (const term of builtinTerms) {
    if (!disabledBuiltinTermIdSet.has(term.id)) {
      activeTermsById.set(term.id, { ...term, source: "builtin" });
    }
  }
  for (const term of customTerms) {
    activeTermsById.set(term.id, { ...term, source: "custom" });
  }

  const result: SettingsViewOptions["templateSettings"]["activeTerms"][number][] = [];
  const seen = new Set<string>();
  for (const id of termOrder) {
    const term = activeTermsById.get(id);
    if (!term || seen.has(id)) {
      continue;
    }
    seen.add(id);
    result.push(term);
  }
  for (const term of activeTermsById.values()) {
    if (seen.has(term.id)) {
      continue;
    }
    seen.add(term.id);
    result.push(term);
  }
  return result;
}

function getTemplateActiveSemanticTermOrder(
  builtinTerms: readonly DataResourceBuiltinSemanticTerm[],
  customTerms: readonly TemplateSemanticTermRule[],
  disabledBuiltinTermIds: readonly string[],
  termOrder: readonly string[],
): string[] {
  return createTemplateActiveSemanticTerms(
    builtinTerms.map(toBuiltinTemplateSemanticTermView),
    customTerms.map(toTemplateSemanticTermView),
    disabledBuiltinTermIds,
    termOrder,
  ).map(term => term.id);
}

const toTemplateSemanticTermView = (
  rule: TemplateSemanticTermRule,
): SettingsViewOptions["templateSettings"]["customTerms"][number] => ({
  id: rule.id,
  term: rule.alias,
  canonicalRole: rule.canonicalRole,
  ...(rule.canonicalUnit ? { canonicalUnit: rule.canonicalUnit } : {}),
  axisTendency: rule.axisTendency,
  ...(rule.family ? { family: rule.family } : {}),
  ...(rule.ivMode ? { ivMode: rule.ivMode } : {}),
  ...(rule.intent ? { intent: rule.intent } : {}),
  matchPolicy: rule.matchPolicy,
  enabled: rule.enabled,
});

const toBuiltinTemplateSemanticTermView = (
  term: DataResourceBuiltinSemanticTerm,
): SettingsViewOptions["templateSettings"]["builtinTerms"][number] => ({
  id: term.id,
  term: term.alias,
  canonicalRole: term.canonicalRole,
  ...(term.canonicalUnit ? { canonicalUnit: term.canonicalUnit } : {}),
  axisTendency: term.axisTendency,
  ...(term.family ? { family: term.family } : {}),
  ...(term.ivMode ? { ivMode: term.ivMode } : {}),
  domainPackIds: term.domainPackIds,
});
