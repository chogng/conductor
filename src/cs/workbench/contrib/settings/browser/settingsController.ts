import { localize } from "src/cs/nls";
import {
  DEFAULT_ORIGIN_PLOT_OPTIONS,
  normalizeOriginPlotOptions,
  normalizeOriginPostCommands,
  originPostCommandsToMultiline,
  type OriginPlotOptions,
} from "src/cs/workbench/services/origin/common/originPlotOptions";
import { normalizePlotAxisSettings } from "src/cs/workbench/services/plot/common/plotSettings";
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
  normalizeTableAutoFitColumnWidthsEnabled,
  normalizeTableTemplateVisualizationEnabled,
  normalizeTemplateSemanticPatches,
  type ConductorSettings,
  type FilesExplorerBadgeColor,
  type ISettingsService,
  type SettingsViewInput,
  type TemplateSemanticPatches,
  type TemplateSemanticRulePatch,
  type TemplateSemanticTermPatch,
} from "src/cs/workbench/services/settings/common/settings";
import {
  builtinRules,
  createEffectiveSemanticRules,
  type EffectiveSemanticRule,
  type BuiltinRule,
  isCustomSemanticMatchTermAllowed,
  toSemanticTermKey,
} from "src/cs/workbench/services/dataResource/common/semanticRules";
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
  type INotificationService,
} from "src/cs/workbench/services/notification/common/notificationService";

type SettingsControllerOptions = SettingsViewInput;

const settingsContentUpdateTarget: SettingsViewUpdateTarget = { type: "content" };
const chartDefaultsItemIds = [
  "settings-default-transfer-y-scale-item",
  "settings-default-output-y-scale-item",
  "settings-default-cv-y-scale-item",
  "settings-default-cf-y-scale-item",
  "settings-default-pv-y-scale-item",
  "settings-chart-defaults-item",
] as const satisfies readonly SettingsContentItemId[];
const originAllItemIds = [
  "settings-origin-path-item",
  "settings-origin-cleanup-item",
  "settings-origin-plot-item",
] as const satisfies readonly SettingsContentItemId[];
const appearanceBackgroundItemIds = [
  "settings-background-item",
] as const satisfies readonly SettingsContentItemId[];
type SelectOption = {
  label: string;
  value: string;
};

type SettingsDraftState = {
  activeSettingsSection: SettingsSectionId;
  appUpdateChecking: boolean;
  axisTitleFontSizeDraft: string;
  originLegendFontSizeDraft: string;
  plotCommandDraft: string;
  postCommandsDraft: string;
  searchQuery: string;
  templateSemanticSectionItemDrafts: TemplateSemanticSectionItemDraft[];
  tickLabelFontSizeDraft: string;
  xyPairsDraft: string;
};

type TemplateSemanticSectionItemDraft = {
  readonly id: SettingsContentItemId;
  readonly ruleId: string;
  readonly source: "builtin" | "custom" | "draft";
  title: string;
  badge: string;
  xDraft: string;
  xTerms: string[];
  yDraft: string;
  yTerms: string[];
};

type TemplateSemanticComparableRule = {
  readonly id: string;
  readonly label: string;
  readonly badge?: string;
  readonly priority: number;
  readonly xTerms: readonly string[];
  readonly yTerms: readonly string[];
};

type TemplateSemanticSectionItemDraftField = "title" | "badge" | "xDraft" | "yDraft";

const ORIGIN_NOTIFICATION_ID = "settings.origin";
const CLEANUP_NOTIFICATION_ID = "settings.cleanup";
const TEMPLATE_SETTINGS_NOTIFICATION_ID = "settings.templateSettings";

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
  private originCleanupSaving = false;
  private originCleanupRunning = false;
  private originPlotSaving = false;
  private templateSettingsSaving = false;
  private pendingTemplateActionItemId: string | null = null;
  private defaultsSaving = false;
  private appearanceSaving = false;
  private explorerBadgeSaving = false;
  private explorerBadgeColorSaving = false;
  private explorerAppearanceSaving = false;
  private pendingExplorerBadgeColors: Record<string, FilesExplorerBadgeColor> | null = null;
  private pendingExplorerBadgeVisibility: boolean | null = null;
  private pendingNumericDisplayMode: "raw" | "smart" | null = null;
  private pendingTableAutoFitColumnWidthsEnabled: boolean | null = null;
  private pendingTableTemplateVisualizationEnabled: boolean | null = null;
  private pendingTransparentChrome: boolean | null = null;
  private templateSemanticDraftCounter = 0;
  private transparentChromeSaving = false;
  private numericDisplaySaving = false;
  private tableAutoFitColumnWidthsSaving = false;
  private tableTemplateVisualizationSaving = false;
  private windowCloseSaving = false;
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
    this.syncOriginPath();
    this.render(getSettingsViewUpdateTarget(previous, options));
  }

  dispose(): void {
    this.disposed = true;
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
      originLegendFontSizeDraft: String(this.originPlotConfig.legendFontSize ?? ""),
      plotCommandDraft: this.originPlotConfig.command ?? "",
      postCommandsDraft: originPostCommandsToMultiline(this.originPlotConfig.postCommands),
      searchQuery: "",
      templateSemanticSectionItemDrafts: [],
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
    this.drafts.originLegendFontSizeDraft = String(this.originPlotConfig.legendFontSize ?? "");
    this.drafts.plotCommandDraft = this.originPlotConfig.command ?? "";
    this.drafts.postCommandsDraft = originPostCommandsToMultiline(this.originPlotConfig.postCommands);
    this.drafts.xyPairsDraft = this.originPlotConfig.xyPairs ?? "";
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
    this.render(itemsUpdateTarget("origin-integration", "settings-origin-path-item"));
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
      this.render(itemsUpdateTarget("origin-integration", "settings-origin-path-item"));
    }
  }

  private render(target: SettingsViewUpdateTarget): void {
    if (this.disposed) {
      return;
    }
    const options = this.createViewOptions();
    this.contentView?.update(options, target);
    this.navigationView?.update(options);
  }

  private showSettingsNotification(id: string, message: string, type: "success" | "error", dataUi: string): void {
    this.notificationService.notify({
      id,
      message,
      presentation: {
        dataUi,
        position: "fixed",
        type,
      },
      severity: type === "error" ? Severity.Error : Severity.Info,
    });
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
      handleCheckForUpdates: () => void this.checkForUpdates(),
      handleShowReleaseNotes: () => {
        void this.commandService.executeCommand(
          UpdateCommandId.showCurrentReleaseNotes,
          this.options.appUpdateSettings.currentVersion,
        );
      },
      language: this.options.language,
      numericDisplaySettings: this.numericDisplaySettings,
      tableColumnWidthSettings: this.tableColumnWidthSettings,
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

  private get tableColumnWidthSettings(): SettingsViewOptions["tableColumnWidthSettings"] {
    return {
      autoFitEnabled: this.pendingTableAutoFitColumnWidthsEnabled ?? normalizeTableAutoFitColumnWidthsEnabled(this.settings.tableAutoFitColumnWidthsEnabled),
      isSaving: this.tableAutoFitColumnWidthsSaving,
      onAutoFitChange: value => this.setTableAutoFitColumnWidthsEnabled(value),
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
    const semanticRuleItems = this.createTemplateSemanticSectionItems(
      this.matchingTemplateRules.map(toTemplateRuleView),
    );
    return {
      isSaving: this.templateSettingsSaving,
      onAddSemanticSectionItemTerm: (id, axis, value) => this.addTemplateSemanticSectionItemTerm(id, axis, value),
      onCommitSemanticSectionItemTitle: id => this.commitTemplateSemanticSectionItemTitle(id),
      onCreateSemanticSectionItem: () => this.createTemplateSemanticSectionItem(),
      onRemoveSemanticSectionItem: id => this.removeTemplateSemanticSectionItem(id),
      onRemoveSemanticSectionItemTerm: (id, axis, term) => this.removeTemplateSemanticSectionItemTerm(id, axis, term),
      onResetSemanticRules: () => this.resetTemplateSemanticRules(),
      onUpdateSemanticSectionItemDraft: (id, field, value) => this.updateTemplateSemanticSectionItemDraft(id, field, value),
      pendingActionItemId: this.pendingTemplateActionItemId,
      semanticSectionItems: semanticRuleItems,
    };
  }

  private get templateSemanticPatches(): TemplateSemanticPatches {
    return normalizeTemplateSemanticPatches(this.settings.templateSemanticPatches);
  }

  private get matchingTemplateRules(): readonly EffectiveSemanticRule[] {
    return createEffectiveSemanticRules(this.templateSemanticPatches)
      .filter(rule => isCustomSemanticMatchTermAllowed(rule.label));
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
      cleanupKeepSuccessJobs: cleanupConfig.keepSuccessJobs,
      cleanupRunning: this.originCleanupRunning,
      cleanupSaving: this.originCleanupSaving,
      isConfigurable: this.service.canManageOrigin(),
      isHealthCheckAvailable: this.service.canCheckOriginHealth(),
      isCleanupAvailable: this.service.canRunOriginCleanup(),
      isHealthChecking: this.originHealthChecking,
      isLoading: this.originPathLoading,
      plotCommand: originPlotConfig.command,
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
    return createSettingsSections();
  }

  private async chooseOriginExePath(): Promise<void> {
    if (!this.service.canManageOrigin() || this.originPathLoading || this.originPathSaving || this.originHealthChecking) {
      return;
    }

    this.originPathSaving = true;
    this.render(itemsUpdateTarget("origin-integration", "settings-origin-path-item"));
    try {
      const nextPath = await this.service.chooseOriginExePath();
      if (nextPath) {
        this.originExePath = nextPath;
        this.showSettingsNotification(
          ORIGIN_NOTIFICATION_ID,
          localize("settings.origin.chooseSaved", "Origin executable path updated."),
          "success",
          "settings-origin-notification",
        );
      }
    }
    catch (error) {
      this.showSettingsNotification(
        ORIGIN_NOTIFICATION_ID,
        localize("settings.origin.chooseFailed", "Failed to update Origin executable path: {error}", {
          error: this.service.errorMessage(error),
        }),
        "error",
        "settings-origin-notification",
      );
    }
    finally {
      this.originPathSaving = false;
      this.render(itemsUpdateTarget("origin-integration", "settings-origin-path-item"));
    }
  }

  private async checkOriginHealth(): Promise<void> {
    if (!this.service.canCheckOriginHealth() || this.originPathSaving || this.originHealthChecking || this.originPathLoading) {
      return;
    }

    this.originHealthChecking = true;
    this.render(itemsUpdateTarget("origin-integration", "settings-origin-path-item"));
    try {
      const health = await this.service.checkOriginHealth(this.originExePath);
      const nextPath = normalizeTrimmedString(health?.originExePath);
      if (nextPath) {
        this.originExePath = nextPath;
      }
      this.showSettingsNotification(
        ORIGIN_NOTIFICATION_ID,
        localize("settings.origin.checkSuccess", "Origin connection check passed"),
        "success",
        "settings-origin-health-notification",
      );
    }
    catch (error) {
      const detail = this.service.formatOriginError(error);
      this.showSettingsNotification(
        ORIGIN_NOTIFICATION_ID,
        localize("settings.origin.checkFailed", "Origin connection check failed: {error}", { error: detail }),
        "error",
        "settings-origin-health-notification",
      );
    }
    finally {
      this.originHealthChecking = false;
      this.render(itemsUpdateTarget("origin-integration", "settings-origin-path-item"));
    }
  }

  private async updateOriginCleanup(updates: Record<string, unknown>): Promise<void> {
    this.originCleanupSaving = true;
    this.render(itemsUpdateTarget("origin-integration", "settings-origin-cleanup-item"));
    try {
      await this.service.updateSettings(updates);
    }
    catch (error) {
      this.showSettingsNotification(
        CLEANUP_NOTIFICATION_ID,
        localize("settings.origin.cleanup.saveFailed", "Failed to update cleanup settings: {error}", { error: this.service.errorMessage(error) }),
        "error",
        "settings-origin-cleanup-notification",
      );
    }
    finally {
      this.originCleanupSaving = false;
      this.render(itemsUpdateTarget("origin-integration", "settings-origin-cleanup-item"));
    }
  }

  private async setNumericDisplayOptimized(optimized: boolean): Promise<void> {
    const normalizedMode = optimized ? "smart" : "raw";
    const currentMode = this.pendingNumericDisplayMode ?? normalizeNumericDisplayMode(this.settings.numericDisplayMode);
    if (normalizedMode === currentMode) {
      return;
    }

    this.pendingNumericDisplayMode = normalizedMode;
    this.render(itemsUpdateTarget("general-preferences", "settings-numeric-display-item"));
    if (!this.numericDisplaySaving) {
      await this.flushNumericDisplayMode();
    }
  }

  private async flushNumericDisplayMode(): Promise<void> {
    this.numericDisplaySaving = true;
    this.render(itemsUpdateTarget("general-preferences", "settings-numeric-display-item"));
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
        this.render(itemsUpdateTarget("general-preferences", "settings-numeric-display-item"));
      }
    } finally {
      this.numericDisplaySaving = false;
      this.render(itemsUpdateTarget("general-preferences", "settings-numeric-display-item"));
    }
  }

  private async setTableAutoFitColumnWidthsEnabled(enabled: boolean): Promise<void> {
    const normalized = Boolean(enabled);
    const current = this.pendingTableAutoFitColumnWidthsEnabled ?? normalizeTableAutoFitColumnWidthsEnabled(this.settings.tableAutoFitColumnWidthsEnabled);
    if (normalized === current) {
      return;
    }

    this.pendingTableAutoFitColumnWidthsEnabled = normalized;
    this.render(itemsUpdateTarget("general-preferences", "settings-table-auto-fit-columns-item"));
    if (!this.tableAutoFitColumnWidthsSaving) {
      await this.flushTableAutoFitColumnWidthsEnabled();
    }
  }

  private async flushTableAutoFitColumnWidthsEnabled(): Promise<void> {
    this.tableAutoFitColumnWidthsSaving = true;
    this.render(itemsUpdateTarget("general-preferences", "settings-table-auto-fit-columns-item"));
    try {
      while (this.pendingTableAutoFitColumnWidthsEnabled !== null) {
        const enabled = this.pendingTableAutoFitColumnWidthsEnabled;
        try {
          await this.service.updateSettings({ tableAutoFitColumnWidthsEnabled: enabled });
        }
        catch {
          if (this.pendingTableAutoFitColumnWidthsEnabled === enabled) {
            this.pendingTableAutoFitColumnWidthsEnabled = null;
          }
          break;
        }
        if (this.pendingTableAutoFitColumnWidthsEnabled === enabled) {
          this.pendingTableAutoFitColumnWidthsEnabled = null;
        }
        this.render(itemsUpdateTarget("general-preferences", "settings-table-auto-fit-columns-item"));
      }
    } finally {
      this.tableAutoFitColumnWidthsSaving = false;
      this.render(itemsUpdateTarget("general-preferences", "settings-table-auto-fit-columns-item"));
    }
  }

  private async setTableTemplateVisualizationEnabled(enabled: boolean): Promise<void> {
    const normalized = Boolean(enabled);
    const current = this.pendingTableTemplateVisualizationEnabled ?? normalizeTableTemplateVisualizationEnabled(this.settings.tableTemplateVisualizationEnabled);
    if (normalized === current) {
      return;
    }

    this.pendingTableTemplateVisualizationEnabled = normalized;
    this.render(itemsUpdateTarget("template-preferences", "settings-table-template-visualization-item"));
    if (!this.tableTemplateVisualizationSaving) {
      await this.flushTableTemplateVisualizationEnabled();
    }
  }

  private async flushTableTemplateVisualizationEnabled(): Promise<void> {
    this.tableTemplateVisualizationSaving = true;
    this.render(itemsUpdateTarget("template-preferences", "settings-table-template-visualization-item"));
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
        this.render(itemsUpdateTarget("template-preferences", "settings-table-template-visualization-item"));
      }
    } finally {
      this.tableTemplateVisualizationSaving = false;
      this.render(itemsUpdateTarget("template-preferences", "settings-table-template-visualization-item"));
    }
  }

  private async updateOriginPlot(updates: Partial<OriginPlotOptions>): Promise<void> {
    this.originPlotSaving = true;
    this.render(itemsUpdateTarget("origin-integration", "settings-origin-plot-item"));
    try {
      await this.service.updateOriginPlotOptions(updates);
    }
    catch (error) {
      this.showSettingsNotification(
        "settings.originPlot",
        localize("settings.origin.plot.saveFailed", "Failed to update plot settings: {error}", { error: this.service.errorMessage(error) }),
        "error",
        "settings-origin-plot-notification",
      );
    }
    finally {
      this.originPlotSaving = false;
      this.render(itemsUpdateTarget("origin-integration", "settings-origin-plot-item"));
    }
  }

  private async runOriginCleanup(): Promise<void> {
    this.originCleanupRunning = true;
    this.render(itemsUpdateTarget("origin-integration", "settings-origin-cleanup-item"));
    try {
      const result = await this.service.runOriginCleanup();
      const removedTotal = Number(result?.removedTotal);
      this.showSettingsNotification(
        CLEANUP_NOTIFICATION_ID,
        localize("settings.origin.cleanup.runSuccess", "Cleanup completed. Removed {count} job folder(s).", {
          count: Number.isFinite(removedTotal) && removedTotal >= 0 ? removedTotal : 0,
        }),
        "success",
        "settings-origin-cleanup-notification",
      );
    }
    catch (error) {
      this.showSettingsNotification(
        CLEANUP_NOTIFICATION_ID,
        localize("settings.origin.cleanup.runFailed", "Cleanup failed: {error}", { error: this.service.errorMessage(error) }),
        "error",
        "settings-origin-cleanup-notification",
      );
    }
    finally {
      this.originCleanupRunning = false;
      this.render(itemsUpdateTarget("origin-integration", "settings-origin-cleanup-item"));
    }
  }

  private createTemplateSemanticSectionItems(
    rules: readonly TemplateRuleView[],
  ): SettingsViewOptions["templateSettings"]["semanticSectionItems"] {
    const draftByRuleId = new Map(this.drafts.templateSemanticSectionItemDrafts.map(draft => [draft.ruleId, draft]));
    const newDrafts = this.drafts.templateSemanticSectionItemDrafts.filter(draft =>
      !rules.some(rule => rule.id === draft.ruleId)
    );
    const savedRules = [...rules].sort(compareTemplateRuleViews);
    return [
      ...newDrafts.map((draft, index) => this.createTemplateSemanticDraftSectionItem(draft, index === 0)),
      ...savedRules.map(rule => {
        const draft = draftByRuleId.get(rule.id);
        return draft
          ? this.createTemplateSemanticDraftSectionItem(draft, false)
          : this.createSavedTemplateSemanticSectionItem(rule);
      }),
    ];
  }

  private createTemplateSemanticDraftSectionItem(
    draft: TemplateSemanticSectionItemDraft,
    autoFocus: boolean,
  ): SettingsViewOptions["templateSettings"]["semanticSectionItems"][number] {
    return {
      autoFocus,
      id: draft.id,
      isSaving: this.pendingTemplateActionItemId === draft.id,
      ruleId: draft.ruleId,
      title: draft.title,
      badge: draft.badge,
      source: draft.source,
      xDraft: draft.xDraft,
      xTerms: draft.xTerms,
      yDraft: draft.yDraft,
      yTerms: draft.yTerms,
    };
  }

  private createSavedTemplateSemanticSectionItem(
    rule: TemplateRuleView,
  ): SettingsViewOptions["templateSettings"]["semanticSectionItems"][number] {
    return {
      id: createTemplateSemanticSectionItemId(rule.source, rule.id),
      isSaving: this.pendingTemplateActionItemId === rule.id,
      ruleId: rule.id,
      source: rule.source,
      title: rule.title,
      badge: rule.badge ?? "",
      xDraft: "",
      xTerms: rule.xTerms,
      yDraft: "",
      yTerms: rule.yTerms,
    };
  }

  private createTemplateSemanticSectionItem(): void {
    const ruleId = `template-rule-${Date.now().toString(36)}-${this.templateSemanticDraftCounter++}`;
    const id = createTemplateSemanticSectionItemId("draft", ruleId);
    this.drafts.templateSemanticSectionItemDrafts = [{
      id,
      ruleId,
      source: "draft",
      title: "",
      badge: "",
      xDraft: "",
      xTerms: [],
      yDraft: "",
      yTerms: [],
    }, ...this.drafts.templateSemanticSectionItemDrafts];
    this.render(descriptorUpdateTarget("template-semantic-rules"));
  }

  private updateTemplateSemanticSectionItemDraft(
    id: string,
    field: TemplateSemanticSectionItemDraftField,
    value: string,
  ): void {
    const draft = this.getOrCreateTemplateSemanticSectionItemDraft(id);
    if (!draft) {
      return;
    }
    draft[field] = value;
  }

  private async commitTemplateSemanticSectionItemTitle(id: string): Promise<void> {
    const draft = this.getOrCreateTemplateSemanticSectionItemDraft(id);
    if (!draft) {
      return;
    }
    const title = draft.title.trim();
    if (!title) {
      if (draft.source !== "draft" || draft.xTerms.length || draft.yTerms.length) {
        this.showTemplateSettingsNotification(
          localize("settings.template.semantic.emptyRule", "Enter a rule label before saving."),
          "error",
        );
      }
      return;
    }
    if (!isCustomSemanticMatchTermAllowed(title)) {
      this.showTemplateSettingsNotification(
        localize("settings.template.semantic.shortRuleLabel", "Enter at least two letters or digits for the rule label."),
        "error",
      );
      return;
    }
    await this.saveTemplateSemanticSectionItemIfComplete(draft, id);
  }

  private async addTemplateSemanticSectionItemTerm(
    id: string,
    axis: "x" | "y",
    value: string,
  ): Promise<void> {
    const draft = this.getOrCreateTemplateSemanticSectionItemDraft(id);
    if (!draft) {
      return;
    }
    const term = value.trim();
    if (!term) {
      return;
    }
    if (!isCustomSemanticMatchTermAllowed(term)) {
      this.showTemplateSettingsNotification(
        localize("settings.template.semantic.shortTerm", "Enter at least two letters or digits for each character block."),
        "error",
      );
      return;
    }
    const terms = axis === "x" ? draft.xTerms : draft.yTerms;
    const termKey = toSemanticTermKey(term);
    if (terms.some(current => toSemanticTermKey(current) === termKey)) {
      this.showTemplateSettingsNotification(
        localize("settings.template.semantic.duplicateCharacterBlock", "Character block already exists in this input."),
        "error",
      );
      return;
    }
    if (axis === "x") {
      draft.xTerms = [...draft.xTerms, term];
      draft.xDraft = "";
    }
    else {
      draft.yTerms = [...draft.yTerms, term];
      draft.yDraft = "";
    }
    this.render(itemsUpdateTarget("template-semantic-rules", id as SettingsContentItemId));
    await this.saveTemplateSemanticSectionItemIfComplete(draft, id);
  }

  private async removeTemplateSemanticSectionItemTerm(
    id: string,
    axis: "x" | "y",
    term: string,
  ): Promise<void> {
    const draft = this.getOrCreateTemplateSemanticSectionItemDraft(id);
    if (!draft) {
      return;
    }
    const termKey = toSemanticTermKey(term);
    if (axis === "x") {
      const nextTerms = draft.xTerms.filter(current => toSemanticTermKey(current) !== termKey);
      if (!nextTerms.length && draft.source !== "draft") {
        this.showTemplateSettingsNotification(
          localize("settings.template.semantic.incompleteXTerms", "Keep at least one X character block."),
          "error",
        );
        return;
      }
      draft.xTerms = nextTerms;
    }
    else {
      const nextTerms = draft.yTerms.filter(current => toSemanticTermKey(current) !== termKey);
      if (!nextTerms.length && draft.source !== "draft") {
        this.showTemplateSettingsNotification(
          localize("settings.template.semantic.incompleteYTerms", "Keep at least one Y character block."),
          "error",
        );
        return;
      }
      draft.yTerms = nextTerms;
    }
    this.render(itemsUpdateTarget("template-semantic-rules", id as SettingsContentItemId));
    await this.saveTemplateSemanticSectionItemIfComplete(draft, id);
  }

  private getOrCreateTemplateSemanticSectionItemDraft(id: string): TemplateSemanticSectionItemDraft | null {
    const draft = this.drafts.templateSemanticSectionItemDrafts.find(draft => draft.id === id);
    if (draft) {
      return draft;
    }

    const builtinRule = findBuiltinSemanticSectionItemRule(id);
    if (builtinRule) {
      const customRule = this.matchingTemplateRules.find(rule =>
        rule.enabled !== false && rule.id === builtinRule.id
      );
      const rule = customRule ?? builtinRule;
      const sectionItemDraft: TemplateSemanticSectionItemDraft = {
        id: id as SettingsContentItemId,
        ruleId: rule.id,
        source: "builtin",
        title: rule.label,
        badge: rule.badge ?? "",
        xDraft: "",
        xTerms: [...rule.xTerms],
        yDraft: "",
        yTerms: [...rule.yTerms],
      };
      this.drafts.templateSemanticSectionItemDrafts = [...this.drafts.templateSemanticSectionItemDrafts, sectionItemDraft];
      return sectionItemDraft;
    }

    const customRule = this.matchingTemplateRules.find(rule =>
      rule.enabled !== false && createTemplateSemanticSectionItemId("custom", rule.id) === id
    );
    if (!customRule) {
      return null;
    }

    const sectionItemDraft: TemplateSemanticSectionItemDraft = {
      id: id as SettingsContentItemId,
      ruleId: customRule.id,
      source: "custom",
      title: customRule.label,
      badge: customRule.badge ?? "",
      xDraft: "",
      xTerms: [...customRule.xTerms],
      yDraft: "",
      yTerms: [...customRule.yTerms],
    };
    this.drafts.templateSemanticSectionItemDrafts = [...this.drafts.templateSemanticSectionItemDrafts, sectionItemDraft];
    return sectionItemDraft;
  }

  private async saveTemplateSemanticSectionItemIfComplete(
    draft: TemplateSemanticSectionItemDraft,
    id: string,
  ): Promise<void> {
    if (this.templateSettingsSaving) {
      return;
    }
    const xTerms = normalizeDraftSemanticTermList([...draft.xTerms, draft.xDraft]);
    const yTerms = normalizeDraftSemanticTermList([...draft.yTerms, draft.yDraft]);
    if (!xTerms.length || !yTerms.length) {
      return;
    }
    const nextPatches = this.createTemplateSemanticPatchesFromDraft(draft, false);
    if (!nextPatches) {
      return;
    }
    if (this.isTemplateSemanticSectionItemDraftUnchanged(draft, nextPatches)) {
      this.discardTemplateSemanticSectionItemDraft(id);
      return;
    }

    const didSave = await this.saveTemplateSettings({
      templateSemanticPatches: nextPatches,
    }, null, partialSettingsUpdateTarget(["template-semantic-rules"], []), id);
    if (didSave) {
      this.drafts.templateSemanticSectionItemDrafts = this.drafts.templateSemanticSectionItemDrafts.filter(draft => draft.id !== id);
      this.render(descriptorUpdateTarget("template-semantic-rules"));
    }
  }

  private isTemplateSemanticSectionItemDraftUnchanged(
    draft: TemplateSemanticSectionItemDraft,
    nextPatches: TemplateSemanticPatches,
  ): boolean {
    if (draft.source === "draft") {
      return false;
    }

    const sourceRule = createEffectiveSemanticRules(nextPatches).find(rule => rule.id === draft.ruleId);
    const currentRule = this.matchingTemplateRules.find(rule => rule.id === draft.ruleId);
    return Boolean(sourceRule && currentRule && templateSemanticRuleValuesEqual(sourceRule, currentRule));
  }

  private discardTemplateSemanticSectionItemDraft(id: string): void {
    this.drafts.templateSemanticSectionItemDrafts = this.drafts.templateSemanticSectionItemDrafts
      .filter(draft => draft.id !== id);
  }

  private createTemplateSemanticPatchesFromDraft(
    draft: TemplateSemanticSectionItemDraft,
    notifyIncompleteAxes: boolean,
  ): TemplateSemanticPatches | null {
    const title = draft.title.trim();
    if (!title) {
      this.showTemplateSettingsNotification(
        localize("settings.template.semantic.emptyRule", "Enter a rule label before saving."),
        "error",
      );
      return null;
    }
    if (!isCustomSemanticMatchTermAllowed(title)) {
      this.showTemplateSettingsNotification(
        localize("settings.template.semantic.shortRuleLabel", "Enter at least two letters or digits for the rule label."),
        "error",
      );
      return null;
    }

    const xTerms = normalizeDraftSemanticTermList([...draft.xTerms, draft.xDraft]);
    const yTerms = normalizeDraftSemanticTermList([...draft.yTerms, draft.yDraft]);
    if (!xTerms.length || !yTerms.length) {
      if (notifyIncompleteAxes) {
        this.showTemplateSettingsNotification(
          localize("settings.template.semantic.incompleteAxes", "Enter at least one X character block and one Y character block."),
          "error",
        );
      }
      return null;
    }
    return createTemplateSemanticPatchesForDraft({
      current: this.templateSemanticPatches,
      draft: {
        ruleId: draft.ruleId,
        title,
        badge: draft.badge.trim(),
        source: draft.source,
        xTerms,
        yTerms,
      },
      priority: this.getTemplateRulePriority(draft.ruleId),
    });
  }

  private getTemplateRulePriority(ruleId: string): number {
    const storedRule = this.matchingTemplateRules
      .find(rule => rule.id === ruleId);
    if (storedRule) {
      return storedRule.priority;
    }
    const builtinRule = builtinRules.find(rule => rule.id === ruleId);
    if (builtinRule) {
      return builtinRule.priority;
    }
    const priorities = [
      ...builtinRules.map(rule => rule.priority),
      ...this.matchingTemplateRules.map(rule => rule.priority),
    ].filter(priority => Number.isFinite(priority));
    return priorities.length ? Math.min(...priorities) - 1 : 1;
  }

  private async removeTemplateSemanticSectionItem(itemId: string): Promise<void> {
    if (!itemId) {
      return;
    }

    const draft = this.drafts.templateSemanticSectionItemDrafts.find(draft => draft.id === itemId);
    if (draft?.source === "draft") {
      this.discardTemplateSemanticSectionItemDraft(itemId);
      this.render(descriptorUpdateTarget("template-semantic-rules"));
      return;
    }

    const builtinRule = findBuiltinSemanticSectionItemRule(itemId);
    if (builtinRule) {
      await this.hideBuiltinTemplateSemanticSectionItem(builtinRule);
      return;
    }

    const customRule = this.matchingTemplateRules.find(rule =>
      createTemplateSemanticSectionItemId("custom", rule.id) === itemId
    );
    if (!customRule) {
      return;
    }
    this.discardTemplateSemanticSectionItemDraft(itemId);
    const customRules = removeTemplateSemanticRulePatch(this.templateSemanticPatches, customRule.id);
    await this.saveTemplateSettings({
      templateSemanticPatches: customRules,
    }, localize("settings.template.semantic.saved", "Template rules updated."), partialSettingsUpdateTarget(["template-semantic-rules"], []), itemId);
  }

  private async hideBuiltinTemplateSemanticSectionItem(
    builtinRule: BuiltinRule,
  ): Promise<void> {
    this.discardTemplateSemanticSectionItemDraft(createTemplateSemanticSectionItemId("builtin", builtinRule.id));
    this.discardTemplateSemanticSectionItemDraft(createTemplateSemanticSectionItemId("custom", builtinRule.id));
    const hiddenRule: TemplateSemanticRulePatch = {
      id: builtinRule.id,
      enabled: false,
    };
    const nextPatches = upsertTemplateSemanticRulePatch(this.templateSemanticPatches, hiddenRule);
    await this.saveTemplateSettings({
      templateSemanticPatches: nextPatches,
    }, localize("settings.template.semantic.saved", "Template rules updated."), partialSettingsUpdateTarget(["template-semantic-rules"], []), createTemplateSemanticSectionItemId("builtin", builtinRule.id));
  }

  private async resetTemplateSemanticRules(): Promise<void> {
    if (this.templateSettingsSaving) {
      return;
    }
    const builtinRuleIds = new Set(builtinRules.map(rule => rule.id));
    const storedCustomPatches = removeTemplateSemanticRulePatches(this.templateSemanticPatches, builtinRuleIds);
    const didSave = await this.saveTemplateSettings({
      templateSemanticPatches: storedCustomPatches,
    }, localize("settings.template.semantic.reset", "Built-in rules reset."), partialSettingsUpdateTarget(["template-semantic-rules"], []));
    if (didSave) {
      this.drafts.templateSemanticSectionItemDrafts = this.drafts.templateSemanticSectionItemDrafts
        .filter(draft => !builtinRuleIds.has(draft.ruleId));
      this.render(descriptorUpdateTarget("template-semantic-rules"));
    }
  }

  private async saveTemplateSettings(
    updates: Record<string, unknown>,
    successMessage: string | null,
    target: SettingsViewUpdateTarget,
    pendingActionItemId: string | null = null,
  ): Promise<boolean> {
    this.templateSettingsSaving = true;
    this.pendingTemplateActionItemId = pendingActionItemId;
    this.render(target);
    try {
      await this.service.updateSettings(updates);
      if (successMessage !== null) {
        this.showTemplateSettingsNotification(successMessage, "success");
      }
      return true;
    }
    catch (error) {
      this.showTemplateSettingsNotification(
        localize("settings.template.saveFailed", "Failed to update template settings: {error}", {
          error: this.service.errorMessage(error),
        }),
        "error",
      );
      return false;
    }
    finally {
      this.templateSettingsSaving = false;
      this.pendingTemplateActionItemId = null;
      this.render(target);
    }
  }

  private showTemplateSettingsNotification(message: string, type: "success" | "error"): void {
    this.showSettingsNotification(TEMPLATE_SETTINGS_NOTIFICATION_ID, message, type, "settings-template-notification");
  }

  private async updateDefault(updates: Record<string, unknown>): Promise<void> {
    await this.saveDefaults(() => this.service.updateSettings(updates));
  }

  private async saveDefaults(operation: () => Promise<unknown>): Promise<void> {
    this.defaultsSaving = true;
    this.render(itemsUpdateTarget("chart-defaults", ...chartDefaultsItemIds));
    try {
      await operation();
    }
    catch (error) {
      this.showSettingsNotification(
        "settings.chartDefaults",
        localize("conductorSettings.defaultsSaveFailed", "Failed to save chart defaults: {error}", {
          error: this.service.errorMessage(error),
        }),
        "error",
        "settings-chart-defaults-notification",
      );
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
    this.render(itemsUpdateTarget("appearance-preferences", "settings-transparent-chrome-item"));
    if (!this.transparentChromeSaving) {
      await this.flushTransparentChrome();
    }
  }

  private async flushTransparentChrome(): Promise<void> {
    this.transparentChromeSaving = true;
    this.render(itemsUpdateTarget("appearance-preferences", "settings-transparent-chrome-item"));
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
        this.render(itemsUpdateTarget("appearance-preferences", "settings-transparent-chrome-item"));
      }
    }
    finally {
      this.transparentChromeSaving = false;
      this.render(itemsUpdateTarget("appearance-preferences", "settings-transparent-chrome-item"));
    }
  }

  private async setFilesExplorerDensity(value: string): Promise<void> {
    const density = normalizeFilesExplorerDensity(value);
    if (density === normalizeFilesExplorerDensity(this.settings.filesExplorerDensity)) {
      return;
    }

    this.explorerAppearanceSaving = true;
    this.render(itemsUpdateTarget("appearance-preferences", "settings-explorer-density-item"));
    try {
      await this.service.updateSettings({
        filesExplorerDensity: density,
      });
    }
    finally {
      this.explorerAppearanceSaving = false;
      this.render(itemsUpdateTarget("appearance-preferences", "settings-explorer-density-item"));
    }
  }

  private async setFilesExplorerShowBadges(enabled: boolean): Promise<void> {
    const showBadges = normalizeFilesExplorerShowBadges(enabled);
    const currentShowBadges = this.pendingExplorerBadgeVisibility ?? normalizeFilesExplorerShowBadges(this.settings.filesExplorerShowBadges);
    if (showBadges === currentShowBadges) {
      return;
    }

    this.pendingExplorerBadgeVisibility = showBadges;
    this.render(itemsUpdateTarget("appearance-preferences", "settings-explorer-badges-item"));
    if (!this.explorerBadgeSaving) {
      await this.flushFilesExplorerShowBadges();
    }
  }

  private async flushFilesExplorerShowBadges(): Promise<void> {
    this.explorerBadgeSaving = true;
    this.render(itemsUpdateTarget("appearance-preferences", "settings-explorer-badges-item"));
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
        this.render(itemsUpdateTarget("appearance-preferences", "settings-explorer-badges-item"));
      }
    }
    finally {
      this.explorerBadgeSaving = false;
      this.render(itemsUpdateTarget("appearance-preferences", "settings-explorer-badges-item"));
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
    this.render(itemsUpdateTarget("appearance-preferences", "settings-explorer-badge-colors-item"));
    try {
      await this.service.updateSettings({
        filesExplorerBadgeColors: nextColors,
      });
    }
    finally {
      this.explorerBadgeColorSaving = false;
      this.pendingExplorerBadgeColors = null;
      this.render(itemsUpdateTarget("appearance-preferences", "settings-explorer-badge-colors-item"));
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
    this.render(itemsUpdateTarget("general-preferences", "settings-close-behavior-item"));
    try {
      await this.service.updateSettings({
        windowCloseBehavior: behavior === "quit" ? "quit" : "minimizeToTray",
      });
    }
    finally {
      this.windowCloseSaving = false;
      this.render(itemsUpdateTarget("general-preferences", "settings-close-behavior-item"));
    }
  }

  private async checkForUpdates(): Promise<void> {
    this.drafts.appUpdateChecking = true;
    this.render(itemsUpdateTarget("about", "settings-app-update-item"));
    try {
      await this.commandService.executeCommand(UpdateCommandId.check);
    }
    catch {
      // Update check result is shown by desktop shell dialogs.
    }
    finally {
      this.drafts.appUpdateChecking = false;
      this.render(itemsUpdateTarget("about", "settings-app-update-item"));
    }
  }
}

function itemsUpdateTarget(
  descriptorId: SettingsContentDescriptorId,
  ...itemIds: readonly SettingsContentItemId[]
): SettingsViewUpdateTarget {
  return partialSettingsUpdateTarget([], [{ descriptorId, itemIds }]);
}

function descriptorUpdateTarget(
  descriptorId: SettingsContentDescriptorId,
): SettingsViewUpdateTarget {
  return partialSettingsUpdateTarget([descriptorId], []);
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
    addItemTarget(itemTargets, "about", "settings-about-version-item", "settings-release-notes-item");
  }
  if (current.appUpdateSettings.isAvailable !== next.appUpdateSettings.isAvailable) {
    addItemTarget(itemTargets, "about", "settings-app-update-item");
  }
  if (current.isWindowsDesktopShell !== next.isWindowsDesktopShell) {
    addItemTarget(itemTargets, "origin-integration", "settings-origin-path-item", "settings-origin-cleanup-item", "settings-origin-plot-item");
  }
  if (current.theme !== next.theme) {
    addItemTarget(itemTargets, "appearance-preferences", "settings-theme-item");
  }

  for (const key of getChangedConductorSettingsKeys(current.conductorSettings, next.conductorSettings)) {
    if (key === "templateSemanticPatches") {
      descriptorIds.add("template-semantic-rules");
      continue;
    }
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

function createTemplateSemanticSectionItemId(
  source: "builtin" | "custom" | "draft",
  id: string,
): SettingsContentItemId {
  return `settings-template-semantic-section-item:${source}:${id}`;
}

function findBuiltinSemanticSectionItemRule(itemId: string): BuiltinRule | undefined {
  return builtinRules.find(rule =>
    createTemplateSemanticSectionItemId("builtin", rule.id) === itemId ||
    createTemplateSemanticSectionItemId("custom", rule.id) === itemId
  );
}

function getConductorSettingItemTarget(key: string): { readonly descriptorId: SettingsContentDescriptorId; readonly itemIds: readonly SettingsContentItemId[] } | null {
  switch (key) {
    case "windowCloseBehavior":
      return { descriptorId: "general-preferences", itemIds: ["settings-close-behavior-item"] };
    case "numericDisplayMode":
      return { descriptorId: "general-preferences", itemIds: ["settings-numeric-display-item"] };
    case "tableAutoFitColumnWidthsEnabled":
      return { descriptorId: "general-preferences", itemIds: ["settings-table-auto-fit-columns-item"] };
    case "tableTemplateVisualizationEnabled":
      return { descriptorId: "template-preferences", itemIds: ["settings-table-template-visualization-item"] };
    case "defaultYScaleForCf":
      return { descriptorId: "chart-defaults", itemIds: ["settings-default-cf-y-scale-item"] };
    case "defaultYScaleForCv":
      return { descriptorId: "chart-defaults", itemIds: ["settings-default-cv-y-scale-item"] };
    case "defaultYScaleForOutput":
      return { descriptorId: "chart-defaults", itemIds: ["settings-default-output-y-scale-item"] };
    case "defaultYScaleForPv":
      return { descriptorId: "chart-defaults", itemIds: ["settings-default-pv-y-scale-item"] };
    case "defaultYScaleForTransfer":
      return { descriptorId: "chart-defaults", itemIds: ["settings-default-transfer-y-scale-item"] };
    case "defaultYScaleForSpecial":
      return {
        descriptorId: "chart-defaults",
        itemIds: [
          "settings-default-cv-y-scale-item",
          "settings-default-cf-y-scale-item",
          "settings-default-pv-y-scale-item",
        ],
      };
    case "plotAxisSettings":
      return { descriptorId: "chart-defaults", itemIds: ["settings-chart-defaults-item"] };
    case "backgroundColor":
      return { descriptorId: "appearance-preferences", itemIds: ["settings-background-item"] };
    case "filesExplorerBadgeColors":
      return { descriptorId: "appearance-preferences", itemIds: ["settings-explorer-badge-colors-item"] };
    case "filesExplorerDensity":
      return { descriptorId: "appearance-preferences", itemIds: ["settings-explorer-density-item"] };
    case "filesExplorerShowBadges":
      return { descriptorId: "appearance-preferences", itemIds: ["settings-explorer-badges-item"] };
    case "theme":
      return { descriptorId: "appearance-preferences", itemIds: ["settings-theme-item"] };
    case "transparentChrome":
      return { descriptorId: "appearance-preferences", itemIds: ["settings-transparent-chrome-item"] };
    case "originExePath":
      return { descriptorId: "origin-integration", itemIds: ["settings-origin-path-item"] };
    case "originExportModeDefault":
      return { descriptorId: "origin-integration", itemIds: ["settings-origin-plot-item"] };
    case "originPlotCommandDefault":
    case "originPlotPostCommandsDefault":
    case "originPlotTypeDefault":
    case "originPlotXyPairsDefault":
    case "originPlotLineWidthDefault":
    case "originPlotSymbolShapeDefault":
    case "originPlotLegendFontSizeDefault":
      return { descriptorId: "origin-integration", itemIds: ["settings-origin-plot-item"] };
    case "originRuntimeCleanupEnabled":
    case "originRuntimeFailedRetentionDays":
    case "originRuntimeKeepSuccessJobs":
      return { descriptorId: "origin-integration", itemIds: ["settings-origin-cleanup-item"] };
  }

  return null;
}

type TemplateRuleView = {
  readonly id: string;
  readonly title: string;
  readonly badge?: string;
  readonly priority: number;
  readonly xTerms: readonly string[];
  readonly yTerms: readonly string[];
  readonly source: "builtin" | "custom";
};

function compareTemplateRuleViews(
  left: TemplateRuleView,
  right: TemplateRuleView,
): number {
  return left.priority - right.priority || left.title.localeCompare(right.title);
}

function normalizeDraftSemanticTermList(
  values: readonly string[],
): readonly string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const term = value.trim();
    if (!isCustomSemanticMatchTermAllowed(term)) {
      continue;
    }
    const key = toSemanticTermKey(term);
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(term);
  }
  return result;
}

function templateSemanticRuleValuesEqual(
  current: TemplateSemanticComparableRule,
  next: TemplateSemanticComparableRule,
): boolean {
  return current.label.trim() === next.label.trim() &&
    (current.badge ?? "").trim() === (next.badge ?? "").trim() &&
    current.priority === next.priority &&
    semanticTermListsEqual(current.xTerms, next.xTerms) &&
    semanticTermListsEqual(current.yTerms, next.yTerms);
}

function semanticTermListsEqual(
  current: readonly string[],
  next: readonly string[],
): boolean {
  const normalizedCurrent = normalizeDraftSemanticTermList(current);
  const normalizedNext = normalizeDraftSemanticTermList(next);
  return normalizedCurrent.length === normalizedNext.length &&
    normalizedCurrent.every((term, index) => term === normalizedNext[index]);
}

const toTemplateRuleView = (
  rule: EffectiveSemanticRule,
): TemplateRuleView => ({
  id: rule.id,
  title: rule.label,
  ...(rule.badge ? { badge: rule.badge } : {}),
  priority: rule.priority,
  xTerms: rule.xTerms,
  yTerms: rule.yTerms,
  source: rule.source === "builtin" ? "builtin" : "custom",
});

function createTemplateSemanticPatchesForDraft({
  current,
  draft,
  priority,
}: {
  readonly current: TemplateSemanticPatches;
  readonly draft: {
    readonly ruleId: string;
    readonly title: string;
    readonly badge: string;
    readonly source: "builtin" | "custom" | "draft";
    readonly xTerms: readonly string[];
    readonly yTerms: readonly string[];
  };
  readonly priority: number;
}): TemplateSemanticPatches {
  const builtinRule = builtinRules.find(rule => rule.id === draft.ruleId);
  const xKeys = draft.xTerms.map(toSemanticTermKey).filter(Boolean);
  const yKeys = draft.yTerms.map(toSemanticTermKey).filter(Boolean);
  const baseXKeys = builtinRule ? builtinRule.xTerms.map(toSemanticTermKey).filter(Boolean) : [];
  const baseYKeys = builtinRule ? builtinRule.yTerms.map(toSemanticTermKey).filter(Boolean) : [];
  const rulePatch: TemplateSemanticRulePatch = {
    id: draft.ruleId,
    label: draft.title,
    priority,
    ...(draft.badge ? { badge: draft.badge } : {}),
    enabled: true,
    xKeys: {
      addKeys: xKeys.filter(key => !baseXKeys.includes(key)),
      removeKeys: baseXKeys.filter(key => !xKeys.includes(key)),
    },
    yKeys: {
      addKeys: yKeys.filter(key => !baseYKeys.includes(key)),
      removeKeys: baseYKeys.filter(key => !yKeys.includes(key)),
    },
  };

  let patches = upsertTemplateSemanticRulePatch(current, rulePatch);
  for (const term of [...draft.xTerms, ...draft.yTerms]) {
    patches = upsertTemplateSemanticTermAliasPatch(patches, toSemanticTermKey(term), term);
  }
  const currentRule = createEffectiveSemanticRules(current).find(rule => rule.id === draft.ruleId);
  for (const term of [...(currentRule?.xTerms ?? []), ...(currentRule?.yTerms ?? [])]) {
    if (![...draft.xTerms, ...draft.yTerms].some(nextTerm => nextTerm === term) && !isBuiltinSemanticRuleAlias(term)) {
      patches = removeTemplateSemanticTermAliasPatch(patches, toSemanticTermKey(term), term);
    }
  }
  return patches;
}

function upsertTemplateSemanticRulePatch(
  patches: TemplateSemanticPatches,
  patch: TemplateSemanticRulePatch,
): TemplateSemanticPatches {
  return {
    ...patches,
    rules: patches.rules.some(rule => rule.id === patch.id)
      ? patches.rules.map(rule => rule.id === patch.id ? mergeTemplateSemanticRulePatch(rule, patch) : rule)
      : [patch, ...patches.rules],
  };
}

function mergeTemplateSemanticRulePatch(
  current: TemplateSemanticRulePatch,
  next: TemplateSemanticRulePatch,
): TemplateSemanticRulePatch {
  return {
    ...current,
    ...next,
    xKeys: next.xKeys ?? current.xKeys,
    yKeys: next.yKeys ?? current.yKeys,
  };
}

function removeTemplateSemanticRulePatch(
  patches: TemplateSemanticPatches,
  ruleId: string,
): TemplateSemanticPatches {
  return {
    ...patches,
    rules: patches.rules.filter(rule => rule.id !== ruleId),
  };
}

function removeTemplateSemanticRulePatches(
  patches: TemplateSemanticPatches,
  ruleIds: ReadonlySet<string>,
): TemplateSemanticPatches {
  return {
    ...patches,
    rules: patches.rules.filter(rule => !ruleIds.has(rule.id)),
  };
}

function upsertTemplateSemanticTermAliasPatch(
  patches: TemplateSemanticPatches,
  key: string,
  alias: string,
): TemplateSemanticPatches {
  if (!key || toSemanticTermKey(alias) !== key) {
    return patches;
  }
  const nextTermPatch = mergeTemplateSemanticTermPatch(
    patches.terms.find(term => term.key === key) ?? {
      key,
      addAliases: [],
      removeAliases: [],
    },
    {
      key,
      addAliases: [alias],
      removeAliases: [],
    },
  );
  return {
    ...patches,
    terms: patches.terms.some(term => term.key === key)
      ? patches.terms.map(term => term.key === key ? nextTermPatch : term)
      : [nextTermPatch, ...patches.terms],
  };
}

function removeTemplateSemanticTermAliasPatch(
  patches: TemplateSemanticPatches,
  key: string,
  alias: string,
): TemplateSemanticPatches {
  if (!key || !alias) {
    return patches;
  }
  return {
    ...patches,
    terms: patches.terms
      .map(term => term.key === key
        ? {
          ...term,
          addAliases: term.addAliases.filter(current => current !== alias),
          removeAliases: term.removeAliases.includes(alias)
            ? term.removeAliases
            : [...term.removeAliases, alias],
        }
        : term)
      .filter(term => term.addAliases.length || term.removeAliases.length),
  };
}

function mergeTemplateSemanticTermPatch(
  current: TemplateSemanticTermPatch,
  next: TemplateSemanticTermPatch,
): TemplateSemanticTermPatch {
  const removeAliases = current.removeAliases.filter(alias => !next.addAliases.includes(alias));
  return {
    key: current.key,
    addAliases: mergeAliasList(current.addAliases, next.addAliases),
    removeAliases: mergeAliasList(removeAliases, next.removeAliases),
  };
}

function mergeAliasList(
  current: readonly string[],
  next: readonly string[],
): readonly string[] {
  const values = current.slice();
  for (const value of next) {
    if (!values.includes(value)) {
      values.push(value);
    }
  }
  return values;
}

function isBuiltinSemanticRuleAlias(
  alias: string,
): boolean {
  return builtinRules.some(rule => rule.xTerms.includes(alias) || rule.yTerms.includes(alias));
}
