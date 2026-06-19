/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

//#region imports

import {
  DisposableStore,
  type IDisposable,
} from "src/cs/base/common/lifecycle";
import type { LanguagePreference } from "src/cs/base/common/platform";
import type { IFileDialogService } from "src/cs/platform/dialogs/common/dialogs";
import type { IFileService } from "src/cs/platform/files/common/files";
import type { INativeHostService } from "src/cs/platform/native/common/native";
import type { ICommandService } from "src/cs/platform/commands/common/commands";
import type { IMenuService } from "src/cs/platform/actions/common/actions";
import type { IStorageService } from "src/cs/platform/storage/common/storage";
import type {
  IContextKey,
  IContextKeyService,
} from "src/cs/platform/contextkey/common/contextkey";
import type { IPathService } from "src/cs/workbench/services/path/common/pathService";
import {
  ChartViewId,
  type IChartService,
} from "src/cs/workbench/services/chart/common/chart";
import type { ICalculationService } from "src/cs/workbench/services/calculation/common/calculation";
import type {
  IAssessmentQueueService,
} from "src/cs/workbench/services/assessment/common/assessment";
import {
  ExplorerViewId,
  type IExplorerService,
} from "src/cs/workbench/contrib/files/browser/files";
import {
  type IParametersService,
} from "src/cs/workbench/services/parameters/common/parameters";
import type { IPlotService } from "src/cs/workbench/services/plot/common/plot";
import type { IThumbnailPreviewService } from "src/cs/workbench/services/thumbnail/common/thumbnail";
import {
  SettingsViewId,
  type ISettingsService,
  type SettingsServiceOptions,
} from "src/cs/workbench/services/settings/common/settings";
import {
  Parts,
  type IWorkbenchLayoutService,
  type WorkbenchMainPart,
} from "src/cs/workbench/services/layout/browser/layoutService";
import type { IViewsService } from "src/cs/workbench/services/views/common/viewsService";
import {
  isLanguagePreference,
} from "src/cs/base/common/platform";
import { localize } from "src/cs/nls";
import { isThemeMode } from "src/cs/workbench/common/theme";
import { startPerf } from "src/cs/workbench/common/perf";
import { WorkbenchViewContainers } from "src/cs/workbench/common/workbenchViewContainers";
import {
  ActiveAuxiliaryBarViewContext,
  ActiveWorkbenchMainPartContext,
  ActiveWorkbenchViewContext,
} from "src/cs/workbench/browser/contextkeys";
import { Layout } from "src/cs/workbench/browser/layout";
import {
  type ITitleService,
  type WorkbenchTitlebarState,
} from "src/cs/workbench/services/title/browser/titleService";
import { getWorkbenchWindowState } from "src/cs/workbench/browser/parts/titlebar/windowTitle";
import {
  AuxiliaryBarViews,
} from "src/cs/workbench/browser/parts/auxiliarybar/auxiliaryBarActions";
import { AuxiliaryBarModel } from "src/cs/workbench/browser/parts/auxiliarybar/auxiliaryBarModel";
import type { WorkbenchStyle } from "src/cs/workbench/browser/style";
import {
  WorkbenchWindow,
} from "src/cs/workbench/browser/window";
import {
  WorkbenchDomainBridge,
  resolveExplorerSessionSelection,
} from "src/cs/workbench/browser/workbenchDomainBridge";
import type { ITableService } from "src/cs/workbench/services/table/common/table";
import { TableViewId } from "src/cs/workbench/contrib/table/common/table";
import type {
  ISessionService as ISessionServiceType,
  SessionSnapshot,
} from "src/cs/workbench/services/session/common/session";
import type {
  SessionChangeEvent,
} from "src/cs/workbench/services/session/common/sessionEvents";
import {
  type FileRecord,
} from "src/cs/workbench/services/session/common/sessionModel";
import {
  createProcessedEntryFromFileRecord,
  createSessionReadModel,
  type SessionReadModel,
} from "src/cs/workbench/services/session/common/sessionReadModel";
import type {
  ITemplateApplyWorkflowService,
  ITemplateService,
} from "src/cs/workbench/services/template/common/template";
import type {
  ExportState,
  IExportService,
} from "src/cs/workbench/services/export/common/export";
import type {
  ProcessedEntry,
} from "src/cs/workbench/services/session/common/sessionTypes";
import { NotificationService } from "src/cs/workbench/services/notification/common/notificationService";
import { NotificationToasts } from "src/cs/workbench/browser/parts/notifications/notificationsToasts";
import { registerNotificationCommands } from "src/cs/workbench/browser/parts/notifications/notificationsCommands";

//#endregion

//#region types and startup helpers

type WorkbenchSessionSnapshot = SessionSnapshot;

type WorkbenchFullRefreshReason =
  | "initial"
  | "resetLayout"
  | "sameViewMode"
  | "navigation"
  | "activeAuxiliaryBarView";

type WorkbenchAuxiliaryRefreshReason =
  | "chartState"
  | "explorerSelection"
  | "settings"
  | "plotState"
  | "plotDisplayModelCache"
  | "exportState"
  | "templateState"
  | `session:${string}`;

export type WorkbenchOptions = {
  readonly assessmentQueueService?: IAssessmentQueueService;
  readonly className?: string;
  readonly calculationService?: ICalculationService;
  readonly chartService?: IChartService;
  readonly commandService?: ICommandService;
  readonly contextKeyService?: IContextKeyService;
  readonly dialogsService?: IFileDialogService;
  readonly explorerService?: IExplorerService;
  readonly exportService?: IExportService;
  readonly filesService?: IFileService;
  readonly pathService?: IPathService;
  readonly sessionService?: ISessionServiceType;
  readonly storageService?: IStorageService;
  readonly layoutService?: IWorkbenchLayoutService;
  readonly menuService?: IMenuService;
  readonly nativeHostService?: INativeHostService;
  readonly notificationService?: NotificationService;
  readonly parametersService?: IParametersService;
  readonly plotService?: IPlotService;
  readonly settingsService?: ISettingsService;
  readonly viewsService?: IViewsService;
  readonly id?: string;
  readonly showDesktopCommandBar?: boolean;
  readonly showSkeleton?: boolean;
  readonly style?: WorkbenchStyle;
  readonly templateApplyWorkflowService?: ITemplateApplyWorkflowService;
  readonly templateService?: ITemplateService;
  readonly thumbnailPreviewService?: IThumbnailPreviewService;
  readonly tableService?: ITableService;
  readonly titleService?: ITitleService;
  readonly titlebarState?: WorkbenchTitlebarState;
};

const getInitialLanguagePreference = (): LanguagePreference => {
  const settings = window.__CONDUCTOR_INITIAL_SETTINGS__;
  return settings &&
    typeof settings === "object" &&
    isLanguagePreference(settings.language)
    ? settings.language
    : "system";
};

export const resolveInitialWorkbenchViewMode = (
  _snapshot: WorkbenchSessionSnapshot,
): WorkbenchMainPart => "table";

//#endregion

export class Workbench extends Layout {
  //#region state and dependencies

  private readonly window: WorkbenchWindow;
  private readonly notifications: NotificationToasts;
  private languagePreference: LanguagePreference = getInitialLanguagePreference();
  private readonly session: ISessionServiceType;
  private readonly commandService: ICommandService;
  private readonly contextKeyService: IContextKeyService;
  private readonly activeWorkbenchViewContext: IContextKey<string> | null = null;
  private readonly activeWorkbenchMainPartContext: IContextKey<WorkbenchMainPart | ""> | null = null;
  private readonly activeAuxiliaryBarViewContext: IContextKey<string> | null = null;
  private readonly templateApplyWorkflowService: ITemplateApplyWorkflowService;
  private readonly dialogsService: IFileDialogService;
  private readonly assessmentQueueService: IAssessmentQueueService;
  private readonly calculationService: ICalculationService;
  private readonly chartService: IChartService;
  private readonly explorerService: IExplorerService;
  private readonly filesService: IFileService;
  private readonly layoutService: IWorkbenchLayoutService;
  private readonly menuService: IMenuService;
  private readonly notificationService: NotificationService;
  private readonly parametersService: IParametersService;
  private readonly plotService: IPlotService;
  private readonly settingsService: ISettingsService;
  private readonly pathService: IPathService;
  private readonly viewsService: IViewsService;
  private readonly tableService: ITableService;
  private readonly templateService: ITemplateService;
  private readonly thumbnailPreviewService: IThumbnailPreviewService;
  private readonly titleService: ITitleService;
  private readonly exportService: IExportService;
  private readonly domainBridge: WorkbenchDomainBridge;
  private readonly auxiliaryBarModel = new AuxiliaryBarModel();
  private cancelScheduledAuxiliarySurfacesRefresh: (() => void) | null = null;
  private readonly scheduledAuxiliarySurfacesRefreshReasons = new Set<WorkbenchAuxiliaryRefreshReason>();
  private scheduledAuxiliarySurfacesRefreshNeedsChrome = false;
  private lastObservedExportState: ExportState | null = null;
  //#endregion

  //#region lifecycle and rendering

  public get contentElement(): HTMLElement {
    return this.window.contentElement;
  }

  constructor(parent: HTMLElement, options: WorkbenchOptions = {}) {
    super(undefined, options.layoutService, options.storageService);

    this.window = this._register(new WorkbenchWindow(parent, {
      ...options,
      showSkeleton: false,
      titleService: options.titleService,
    }));
    this.notifications = this._register(new NotificationToasts());
    this.mount(this.window.contentElement);
    if (!options.sessionService) {
      throw new Error("Workbench requires ISessionService.");
    }
    if (!options.tableService) {
      throw new Error("Workbench requires ITableService.");
    }
    if (!options.filesService) {
      throw new Error("Workbench requires IFileService.");
    }
    if (!options.chartService) {
      throw new Error("Workbench requires IChartService.");
    }
    if (!options.assessmentQueueService) {
      throw new Error("Workbench requires IAssessmentQueueService.");
    }
    if (!options.calculationService) {
      throw new Error("Workbench requires ICalculationService.");
    }
    if (!options.dialogsService) {
      throw new Error("Workbench requires IFileDialogService.");
    }
    if (!options.explorerService) {
      throw new Error("Workbench requires IExplorerService.");
    }
    if (!options.exportService) {
      throw new Error("Workbench requires IExportService.");
    }
    if (!options.commandService) {
      throw new Error("Workbench requires ICommandService.");
    }
    if (!options.contextKeyService) {
      throw new Error("Workbench requires IContextKeyService.");
    }
    if (!options.pathService) {
      throw new Error("Workbench requires IPathService.");
    }
    if (!options.storageService) {
      throw new Error("Workbench requires IStorageService.");
    }
    if (!options.layoutService) {
      throw new Error("Workbench requires IWorkbenchLayoutService.");
    }
    if (!options.menuService) {
      throw new Error("Workbench requires IMenuService.");
    }
    if (!options.notificationService) {
      throw new Error("Workbench requires INotificationService.");
    }
    if (!options.parametersService) {
      throw new Error("Workbench requires IParametersService.");
    }
    if (!options.plotService) {
      throw new Error("Workbench requires IPlotService.");
    }
    if (!options.settingsService) {
      throw new Error("Workbench requires ISettingsService.");
    }
    if (!options.viewsService) {
      throw new Error("Workbench requires IViewsService.");
    }
    if (!options.templateApplyWorkflowService) {
      throw new Error("Workbench requires ITemplateApplyWorkflowService.");
    }
    if (!options.templateService) {
      throw new Error("Workbench requires ITemplateService.");
    }
    if (!options.thumbnailPreviewService) {
      throw new Error("Workbench requires IThumbnailPreviewService.");
    }
    if (!options.titleService) {
      throw new Error("Workbench requires ITitleService.");
    }
    this.filesService = options.filesService;
    this.assessmentQueueService = options.assessmentQueueService;
    this.calculationService = options.calculationService;
    this.chartService = options.chartService;
    this.dialogsService = options.dialogsService;
    this.explorerService = options.explorerService;
    this.exportService = options.exportService;
    this.commandService = options.commandService;
    this.contextKeyService = options.contextKeyService;
    this.layoutService = options.layoutService;
    this.menuService = options.menuService;
    this.notificationService = options.notificationService;
    this.parametersService = options.parametersService;
    this.plotService = options.plotService;
    this.settingsService = options.settingsService;
    this.activeWorkbenchViewContext = ActiveWorkbenchViewContext.bindTo(options.contextKeyService);
    this.activeWorkbenchMainPartContext = ActiveWorkbenchMainPartContext.bindTo(options.contextKeyService);
    this.activeAuxiliaryBarViewContext = ActiveAuxiliaryBarViewContext.bindTo(options.contextKeyService);
    this.pathService = options.pathService;
    this.session = options.sessionService;
    this.viewsService = options.viewsService;
    this.tableService = options.tableService;
    this.templateApplyWorkflowService = options.templateApplyWorkflowService;
    this.templateService = options.templateService;
    this.thumbnailPreviewService = options.thumbnailPreviewService;
    this.titleService = options.titleService;
    this.lastObservedExportState = this.exportService.getState();
    this.titleService.updateTitlebarState(options.titlebarState);
    const initialViewMode = resolveInitialWorkbenchViewMode(this.session.getSnapshot());
    this._register(this.createNotificationsHandlers());
    this.settingsService.update(this.getSettingsServiceOptions());
    this.domainBridge = this._register(new WorkbenchDomainBridge({
      assessmentQueueService: this.assessmentQueueService,
      calculationService: this.calculationService,
      chartService: this.chartService,
      explorerService: this.explorerService,
      layoutService: this.layoutService,
      plotService: this.plotService,
      sessionService: this.session,
      settingsService: this.settingsService,
      tableService: this.tableService,
      templateApplyWorkflowService: this.templateApplyWorkflowService,
      templateService: this.templateService,
      thumbnailPreviewService: this.thumbnailPreviewService,
    }));
    this._register(this.settingsService.onDidChangeConductorSettings(() => {
      this.scheduleWorkbenchAuxiliarySurfacesRefresh("settings", true);
    }));
    this._register(this.explorerService.onDidChangeSelection(() => {
      this.scheduleWorkbenchAuxiliarySurfacesRefresh("explorerSelection", false);
    }));
    this._register(this.chartService.onDidChangeChartState(() => {
      this.scheduleWorkbenchAuxiliarySurfacesRefresh("chartState", false);
    }));
    this._register({
      dispose: () => {
        this.cancelScheduledAuxiliarySurfacesRefresh?.();
        this.cancelScheduledAuxiliarySurfacesRefresh = null;
        this.scheduledAuxiliarySurfacesRefreshReasons.clear();
      },
    });
    this._register(this.plotService.onDidChangePlotState(() => {
      this.scheduleWorkbenchAuxiliarySurfacesRefresh("plotState", true);
    }));
    this._register(this.plotService.onDidChangePlotDisplayModelCache(() => {
      this.scheduleWorkbenchAuxiliarySurfacesRefresh("plotDisplayModelCache", false);
    }));
    this._register(this.exportService.onDidChangeExportState(state => {
      if (this.shouldRefreshAuxiliarySurfacesForExportState(state)) {
        this.scheduleWorkbenchAuxiliarySurfacesRefresh("exportState", true);
      }
      this.lastObservedExportState = state;
    }));
    this._register(this.templateService.onDidChangeTemplateState(() => {
      this.scheduleWorkbenchAuxiliarySurfacesRefresh("templateState", true);
    }));
    this._register(this.layoutService.onDidChangeWorkbenchNavigation(() => {
      this.refreshWorkbench("navigation");
    }));
    this._register(this.layoutService.onDidChangeActiveAuxiliaryBarView(() => {
      this.refreshWorkbench("activeAuxiliaryBarView");
    }));
    this._register(this.session.onDidChangeSession(event => {
      if (this.shouldRefreshAuxiliarySurfacesForSessionChange(event)) {
        this.scheduleWorkbenchAuxiliarySurfacesRefresh(`session:${event.reason}`, true);
      }
    }));
    this.resetToView(initialViewMode);
    this.domainBridge.sync();
    this.refreshWorkbench("initial");
  }

  update(options: WorkbenchOptions = {}): void {
    if ("titlebarState" in options) {
      this.titleService.updateTitlebarState(options.titlebarState);
    }
    this.window.update({
      ...options,
      titleService: options.titleService ?? this.titleService,
    });
  }

  public override resetLayoutState(): void {
    super.resetLayoutState();
    this.refreshWorkbench("resetLayout");
  }

  private refreshWorkbench(reason: WorkbenchFullRefreshReason): void {
    this.cancelScheduledAuxiliarySurfacesRefresh?.();
    this.cancelScheduledAuxiliarySurfacesRefresh = null;
    this.scheduledAuxiliarySurfacesRefreshReasons.clear();
    this.scheduledAuxiliarySurfacesRefreshNeedsChrome = false;
    const endPerf = startPerf("workbench.refreshWorkbench", {
      activeAuxiliaryBarView: this.auxiliaryBarModel.getActiveView(this.activeWorkbenchMainPart),
      activeView: this.activeView,
      mode: this.activeWorkbenchMainPart,
      reason,
    }, { silent: true });
    const snapshot = this.session.getSnapshot();
    const readModel = createSessionReadModel(snapshot);
    this.updateWorkbenchModeContextKeys();
    this.updateViewContainers();
    this.updateContextKeys();
    this.renderAuxiliaryBarView(snapshot, readModel);
    this.renderWorkbench();
    endPerf({
      fileCount: Object.keys(snapshot.filesById).length,
      processedFileCount: readModel.processedFileIds.length,
      rawFileCount: readModel.rawFiles.length,
    });
  }

  private scheduleWorkbenchAuxiliarySurfacesRefresh(
    reason: WorkbenchAuxiliaryRefreshReason,
    needsChrome: boolean,
  ): void {
    this.scheduledAuxiliarySurfacesRefreshReasons.add(reason);
    this.scheduledAuxiliarySurfacesRefreshNeedsChrome ||= needsChrome;

    if (this.cancelScheduledAuxiliarySurfacesRefresh) {
      return;
    }

    const run = (): void => {
      const reasons = [...this.scheduledAuxiliarySurfacesRefreshReasons];
      const needsChromeRefresh = this.scheduledAuxiliarySurfacesRefreshNeedsChrome;
      this.cancelScheduledAuxiliarySurfacesRefresh = null;
      this.scheduledAuxiliarySurfacesRefreshReasons.clear();
      this.scheduledAuxiliarySurfacesRefreshNeedsChrome = false;
      this.refreshWorkbenchAuxiliarySurfaces(reasons, needsChromeRefresh);
    };
    if (typeof globalThis.requestAnimationFrame === "function") {
      const handle = globalThis.requestAnimationFrame(run);
      this.cancelScheduledAuxiliarySurfacesRefresh = () => {
        globalThis.cancelAnimationFrame(handle);
      };
      return;
    }

    const handle = globalThis.setTimeout(run, 0);
    this.cancelScheduledAuxiliarySurfacesRefresh = () => {
      globalThis.clearTimeout(handle);
    };
  }

  private refreshWorkbenchAuxiliarySurfaces(
    reasons: readonly WorkbenchAuxiliaryRefreshReason[],
    needsChromeRefresh: boolean,
  ): void {
    const isSelectionOnlyRefresh = !needsChromeRefresh &&
      reasons.length === 1 &&
      reasons[0] === "explorerSelection";
    const stage = isSelectionOnlyRefresh
      ? "workbench.refreshSelectionSurfaces"
      : "workbench.refreshAuxiliarySurfaces";
    const endPerf = startPerf(stage, {
      activeAuxiliaryBarView: this.auxiliaryBarModel.getActiveView(this.activeWorkbenchMainPart),
      activeView: this.activeView,
      mode: this.activeWorkbenchMainPart,
      reason: reasons[0] ?? "unknown",
      reasons: reasons.join(","),
    }, { silent: true });
    const snapshot = this.session.getSnapshot();
    const readModel = createSessionReadModel(snapshot);
    if (needsChromeRefresh) {
      const isWorkbenchActive = this.activeView !== "settings";
      const isAuxiliaryBarVisible = this.layoutService.isVisible(Parts.AUXILIARYBAR_PART);
      this.updateWorkbenchModeContextKeys();
      this.updateAuxiliaryBar(isWorkbenchActive && isAuxiliaryBarVisible);
      this.updateContextKeys();
    }
    this.renderAuxiliaryBarView(snapshot, readModel);
    endPerf({
      fileCount: Object.keys(snapshot.filesById).length,
      needsChromeRefresh,
      processedFileCount: readModel.processedFileIds.length,
      rawFileCount: readModel.rawFiles.length,
    });
  }

  private shouldRefreshAuxiliarySurfacesForExportState(state: ExportState): boolean {
    const previous = this.lastObservedExportState;
    if (!previous) {
      return true;
    }

    return previous.canvasScope !== state.canvasScope ||
      previous.filteredKind !== state.filteredKind;
  }

  private shouldRefreshAuxiliarySurfacesForSessionChange(event: SessionChangeEvent): boolean {
    const activeAuxiliaryView = this.auxiliaryBarModel.getActiveView(this.activeWorkbenchMainPart);
    switch (activeAuxiliaryView) {
      case "export":
        return this.shouldRefreshExportSurfacesForSessionChange(event);
      case "template":
      case "settings":
        return false;
      case "parameters":
      case "search":
      default:
        return true;
    }
  }

  private shouldRefreshExportSurfacesForSessionChange(event: SessionChangeEvent): boolean {
    switch (event.reason) {
      case "assessmentChanged":
        return false;
      case "calculatedRecordsChanged":
      case "metricsChanged":
      case "metricInputsChanged":
        return this.exportService.getState().selectedContentKeys.some(key => key !== "iv");
      default:
        return true;
    }
  }

  private renderWorkbench(): void {
    this.setParts({
      sidebar: this.getViewContainerElement(WorkbenchViewContainers.files, null),
      workbench: this.getViewContainerElement(
        WorkbenchViewContainers.main,
        this.activeWorkbenchMainPart === "chart" ? this.getChartViewElement() : this.getTableViewElement(),
      ),
      auxiliaryBar: this.getViewContainerElement(
        WorkbenchViewContainers.auxiliarybar,
        this.getActiveAuxiliaryBarElement(),
      ),
      overlay: this.notifications.element,
      settings: this.getViewContainerElement(WorkbenchViewContainers.settings, null),
    });
    this.layoutVisibleViewContainers();
    this.window.update({
      id: "workbench-page",
      className: "workbench_root",
      showDesktopCommandBar: getWorkbenchWindowState().isDesktopChromePreviewEnabled,
      showSkeleton: false,
      titleService: this.titleService,
    });
  }

  protected override onDidRenderLayout(): void {
    this.layoutVisibleViewContainers();
    this.window.update({
      id: "workbench-page",
      className: "workbench_root",
      showDesktopCommandBar: getWorkbenchWindowState().isDesktopChromePreviewEnabled,
      showSkeleton: false,
      titleService: this.titleService,
    });
  }

  private createNotificationsHandlers(): IDisposable {
    const disposables = new DisposableStore();

    disposables.add(registerNotificationCommands(this.notifications, this.commandService));

    const registerToastSource = (source: NotificationService): void => {
      for (const toast of source.toasts) {
        this.notifications.show(toast);
      }

      disposables.add(source.onDidChangeToast(event => {
        switch (event.kind) {
          case "show":
            this.notifications.show(event.options);
            break;
          case "hide":
            this.notifications.hideToast(event.id);
            break;
          case "dispose":
            this.notifications.disposeToast(event.id);
            break;
          case "disposeAll":
            this.notifications.disposeToasts();
            break;
        }
      }));
    };

    registerToastSource(this.notificationService);

    return disposables;
  }

  //#endregion

  //#region view containers and visible parts

  private updateViewContainers(): void {
    const isSettingsActive = this.activeView === "settings";
    const isWorkbenchActive = !isSettingsActive;
    const isChartActive = this.activeWorkbenchMainPart === "chart";
    const isSidebarVisible = this.layoutService.isVisible(Parts.SIDEBAR_PART);
    const isAuxiliaryBarVisible = this.layoutService.isVisible(Parts.AUXILIARYBAR_PART);

    if (isSidebarVisible) {
      void this.viewsService.openViewContainer(WorkbenchViewContainers.files);
    }
    if (isAuxiliaryBarVisible) {
      void this.viewsService.openViewContainer(WorkbenchViewContainers.auxiliarybar);
    }

    if (isWorkbenchActive) {
      void this.viewsService.openViewContainer(WorkbenchViewContainers.main);
      this.viewsService.closeViewContainer(WorkbenchViewContainers.settings);
    } else {
      void this.viewsService.openViewContainer(WorkbenchViewContainers.settings);
    }

    this.viewsService.setViewVisible(ExplorerViewId, isWorkbenchActive && isSidebarVisible);
    this.viewsService.setViewVisible(TableViewId, isWorkbenchActive && !isChartActive);
    this.viewsService.setViewVisible(ChartViewId, isWorkbenchActive && isChartActive);
    this.viewsService.setViewVisible(SettingsViewId, isSettingsActive);
    this.updateSidebar(isWorkbenchActive && isSidebarVisible);
    this.updateAuxiliaryBar(isWorkbenchActive && isAuxiliaryBarVisible);
  }

  private updateContextKeys(): void {
    this.updateWorkbenchModeContextKeys();
    this.activeAuxiliaryBarViewContext?.set(
      this.auxiliaryBarModel.getActiveView(this.activeWorkbenchMainPart),
    );
  }

  private updateWorkbenchModeContextKeys(): void {
    this.activeWorkbenchViewContext?.set(this.activeView);
    this.activeWorkbenchMainPartContext?.set(this.activeWorkbenchMainPart);
  }

  private closeAuxiliaryBarViews(): void {
    for (const view of AuxiliaryBarViews) {
      this.viewsService.closeView(view.viewId);
    }
  }

  private updateSidebar(visible: boolean): void {
    const container = this.viewsService.getActiveViewPaneContainerWithId(WorkbenchViewContainers.files);
    if (!container) {
      return;
    }

    this.updateSidebarPaneContainer({
      actions: [],
      container,
      title: visible ? localize("files.explorerSection", "Explorer") : "",
    });
  }

  private updateAuxiliaryBar(visible: boolean): void {
    const container = this.viewsService.getActiveViewPaneContainerWithId(WorkbenchViewContainers.auxiliarybar);
    if (!container) {
      this.closeAuxiliaryBarViews();
      return;
    }

    const state = this.auxiliaryBarModel.update({
      activeView: this.layoutService.activeAuxiliaryBarView,
      contextKeyService: this.contextKeyService,
      menuService: this.menuService,
      mode: this.activeWorkbenchMainPart,
      templateMode: this.templateService.getState().mode,
      visible,
    });
    this.updateAuxiliaryBarPaneContainer({
      actions: state.actions,
      container,
      title: state.title,
    });

    for (const view of state.views) {
      this.viewsService.setViewVisible(view.viewId, view.visible);
    }
  }

  private renderAuxiliaryBarView(
    snapshot = this.session.getSnapshot(),
    readModel = createSessionReadModel(snapshot),
  ): void {
    if (this.activeView === "settings") {
      return;
    }

    const activeFile = this.getSelectedProcessedFile(snapshot, readModel);
    const activeFileRecord = this.getSelectedProcessedFileRecord(snapshot, readModel);

    switch (this.auxiliaryBarModel.getActiveView(this.activeWorkbenchMainPart)) {
      case "template":
        break;
      case "parameters":
        this.renderParametersView(snapshot, this.getSelectedProcessedFileId(readModel));
        break;
      case "search":
        break;
      case "settings":
        break;
      case "export":
      default:
        this.renderExportView(activeFile, activeFileRecord, snapshot, readModel);
        break;
    }
  }

  private renderExportView(
    activeFile: ProcessedEntry | null,
    activeFileRecord: FileRecord | null,
    snapshot = this.session.getSnapshot(),
    readModel = createSessionReadModel(snapshot),
  ): void {
    this.exportService.updateViewState({
      activeFile,
      activeFileId: this.getSelectedProcessedFileId(readModel),
      activeFileRecord,
      snapshot,
    });
  }

  private renderParametersView(
    snapshot: WorkbenchSessionSnapshot,
    activeFileId: string | null,
  ): void {
    this.parametersService.updateViewState({
      fileId: activeFileId,
      snapshot,
    });
  }

  private getActiveAuxiliaryBarElement(): HTMLElement | null {
    const viewId = this.auxiliaryBarModel.getActiveViewId(this.activeWorkbenchMainPart);
    return viewId ? this.viewsService.getViewWithId(viewId)?.element ?? null : null;
  }

  private getTableViewElement(): HTMLElement | null {
    return this.viewsService.getViewWithId(TableViewId)?.element ?? null;
  }

  private getChartViewElement(): HTMLElement | null {
    return this.viewsService.getViewWithId(ChartViewId)?.element ?? null;
  }

  private layoutVisibleViewContainers(): void {
    for (const id of Object.values(WorkbenchViewContainers)) {
      this.viewsService.getActiveViewPaneContainerWithId(id)?.layout?.();
    }
  }

  private getViewContainerElement(containerId: string, fallback: HTMLElement | null): HTMLElement | null {
    const element = this.viewsService.getViewContainerElement(containerId);
    return element instanceof HTMLElement ? element : fallback;
  }

  //#endregion

  //#region navigation

  private showWorkbenchViewMode(viewMode: WorkbenchMainPart): void {
    const previousViewMode = this.activeWorkbenchMainPart;
    if (this.activeView !== viewMode) {
      this.navigateToView(viewMode);
    }
    if (previousViewMode === viewMode) {
      this.refreshWorkbench("sameViewMode");
    }
  }

  //#endregion

  //#region view inputs and selection

  private getSelectedProcessedFileId(readModel: SessionReadModel): string | null {
    return resolveExplorerSessionSelection(this.explorerService, readModel).selectedProcessedFileId;
  }

  private getSelectedProcessedFileRecord(
    snapshot: WorkbenchSessionSnapshot,
    readModel = createSessionReadModel(snapshot),
  ): FileRecord | null {
    const activeFileId = this.getSelectedProcessedFileId(readModel);
    return activeFileId ? snapshot.filesById[activeFileId] ?? null : null;
  }

  private getSelectedProcessedFile(
    snapshot: WorkbenchSessionSnapshot,
    readModel = createSessionReadModel(snapshot),
  ): ProcessedEntry | null {
    const fileRecord = this.getSelectedProcessedFileRecord(snapshot, readModel);
    return fileRecord ? createProcessedEntryFromFileRecord(fileRecord) : null;
  }

  //#endregion

  //#region settings

  private getSettingsServiceOptions(): SettingsServiceOptions {
    const windowState = getWorkbenchWindowState();
    return {
      appUpdateSettings: {
        currentVersion:
          typeof windowState.environment?.appVersion === "string"
            ? windowState.environment.appVersion
            : null,
        isAvailable: windowState.isAppUpdatePreviewEnabled,
      },
      isWindowsDesktopShell: windowState.isWindowsDesktopShell,
      language: this.languagePreference,
      theme: isThemeMode(window.__CONDUCTOR_INITIAL_THEME__)
        ? window.__CONDUCTOR_INITIAL_THEME__
        : "system",
    };
  }

  private createMessagePane(titleText: string, descriptionText: string): HTMLElement {
    const root = document.createElement("div");
    root.className = "workbench_message_pane";

    const title = document.createElement("h2");
    title.className = "workbench_message_title";
    title.textContent = titleText;

    const description = document.createElement("p");
    description.className = "workbench_message_description";
    description.textContent = descriptionText;

    root.append(title, description);
    return root;
  }

//#endregion
}
