/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

//#region imports

import {
  DisposableStore,
  type IDisposable,
} from "src/cs/base/common/lifecycle";
import type {
  LanguageCode,
  LanguagePreference,
} from "src/cs/platform/language/common/language";
import type { IFileDialogService } from "src/cs/platform/dialogs/common/dialogs";
import type { IFileService } from "src/cs/platform/files/common/files";
import type { ICommandService } from "src/cs/platform/commands/common/commands";
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
import {
  ExplorerViewId,
  type IExplorerService,
} from "src/cs/workbench/contrib/files/common/explorer";
import type { IParametersService } from "src/cs/workbench/services/parameters/common/parameters";
import type { IPlotService } from "src/cs/workbench/services/plot/common/plot";
import type { ISearchService } from "src/cs/workbench/services/search/common/search";
import {
  SettingsViewId,
  type ISettingsService,
} from "src/cs/workbench/services/settings/common/settings";
import type {
  ITemplateProcessingBackendService,
} from "src/cs/workbench/services/template/common/templateProcessingBackend";
import {
  Parts,
  type IWorkbenchLayoutService,
} from "src/cs/workbench/services/layout/browser/layoutService";
import type { IViewsService } from "src/cs/workbench/services/views/common/viewsService";
import {
  isLanguageCode,
  isLanguagePreference,
  resolveLanguageCode,
} from "src/cs/platform/language/common/language";
import { localize } from "src/cs/nls";
import type { ThemeMode } from "src/cs/workbench/common/theme";
import { WorkbenchViewContainers } from "src/cs/workbench/common/workbenchViewContainers";
import {
  ActiveAuxiliaryBarViewContext,
  ActiveWorkbenchMainPartContext,
  ActiveWorkbenchViewContext,
  type WorkbenchMainPart,
} from "src/cs/workbench/common/contextkeys";
import { Layout, type LayoutView } from "src/cs/workbench/browser/layout";
import {
  WORKBENCH_TITLEBAR_ID,
  type WorkbenchTitlebarProps,
} from "src/cs/workbench/browser/parts/titlebar/titlebarPart";
import {
  AuxiliaryBarViews,
} from "src/cs/workbench/browser/parts/auxiliarybar/auxiliaryBarActions";
import { AuxiliaryBarModel } from "src/cs/workbench/browser/parts/auxiliarybar/auxiliaryBarModel";
import type { WorkbenchStyle } from "src/cs/workbench/browser/style";
import {
  applyWorkbenchAppearance,
  normalizeWorkbenchAppearance,
  type WorkbenchAppearance,
} from "src/cs/workbench/browser/appearance";
import {
  getWorkbenchWindowState,
  WorkbenchWindow,
} from "src/cs/workbench/browser/window";
import { TableViewId } from "src/cs/workbench/services/table/common/table";
import { createExplorerFileOptionsFromRecords } from "src/cs/workbench/contrib/files/common/explorerFileOptions";
import {
  TemplateApplyController,
} from "src/cs/workbench/services/template/browser/templateApplyController";
import { createTemplateApplyInput } from "src/cs/workbench/services/template/browser/templateApplyInput";
import { createExplorerPaneInput } from "src/cs/workbench/contrib/files/browser/explorerPaneInput";
import {
  reconcileExplorerSessionSelection,
  resolveExplorerSessionSelection,
} from "src/cs/workbench/contrib/files/browser/explorerSessionWorkflow";
import type {
  ISessionService as ISessionServiceType,
  SessionSnapshot,
} from "src/cs/workbench/services/session/common/session";
import {
  type FileRecord,
} from "src/cs/workbench/services/session/common/sessionModel";
import {
  createProcessedEntryFromFileRecord,
  createSessionReadModel,
  hasFileRecordAnalysisData,
  type SessionReadModel,
} from "src/cs/workbench/services/session/common/sessionReadModel";
import type {
  ITableService,
  TableModel,
} from "src/cs/workbench/services/table/common/table";
import type {
  ITemplateApplyService,
  ITemplateService,
} from "src/cs/workbench/services/template/common/template";
import type { TemplateSelection } from "src/cs/workbench/services/template/common/templateSelection";
import {
  CoreSettingsController,
  createCoreSettingsState,
  type CoreSettingsControllerOptions,
  type CoreSettingsState,
} from "src/cs/workbench/services/settings/browser/coreSettingsController";
import type { OriginExportPlan } from "src/cs/workbench/services/export/common/originExport";
import {
  type IExportService,
} from "src/cs/workbench/services/export/common/export";
import {
  exportOriginZip,
  type OriginDisplayRange,
} from "src/cs/workbench/services/origin/browser/originController";
import type { OriginPlotOptions } from "src/cs/workbench/services/origin/common/originPlotOptions";
import type {
  PlotAxisTitleContext,
  PlotType,
} from "src/cs/workbench/services/plot/common/plot";
import type { XUnit, YUnit } from "src/cs/workbench/services/plot/common/units";
import type {
  ProcessedEntry,
  ProcessedSeries,
} from "src/cs/workbench/services/session/common/sessionTypes";
import {
  getFileAxisSettingsByFileId,
  type FileAxisSettingsByFileId,
} from "src/cs/workbench/services/session/browser/fileSemanticsSync";
import { createChartViewInput } from "src/cs/workbench/services/chart/browser/chartViewInput";
import { workbenchIpcChannels } from "src/cs/workbench/common/ipcChannels";
import {
  closeWindow,
  minimizeWindow,
  reloadWindow,
  toggleWindowMaximized,
} from "src/cs/workbench/browser/actions/windowActions";
import { notificationService } from "src/cs/workbench/services/notification/common/notificationService";
import { NotificationToasts } from "src/cs/workbench/browser/parts/notifications/notificationsToasts";
import { registerNotificationCommands } from "src/cs/workbench/browser/parts/notifications/notificationsCommands";
import { ResetLayoutStateCommandId } from "src/cs/workbench/services/layout/browser/layoutConstants";

//#endregion

//#region types and startup helpers

export type WorkbenchTitlebarState = {
  readonly enabled?: boolean;
  readonly activePage: LayoutView;
  readonly activeFileId?: string | null;
  readonly fileOptions?: WorkbenchTitlebarProps["fileOptions"];
  readonly canNavigateBack?: boolean;
  readonly canNavigateForward?: boolean;
  readonly isSidebarVisible?: boolean;
  readonly onFileChange?: (fileId: string) => void;
  readonly onAnalysisIntent?: () => void;
  readonly onCloseWindow?: () => void;
  readonly onMinimizeWindow?: () => void;
  readonly onNavigateBack?: () => void;
  readonly onNavigateForward?: () => void;
  readonly onPageChange?: (page: LayoutView) => void;
  readonly onToggleSidebar?: () => void;
  readonly onToggleMaximizeWindow?: () => void;
  readonly showFileSelector?: boolean;
  readonly updateVersion?: string | null;
  readonly isUpdateReadyToInstall?: boolean;
  readonly onInstallUpdate?: () => void;
};

type WorkbenchSessionSnapshot = SessionSnapshot;

export type WorkbenchOptions = {
  readonly className?: string;
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
  readonly parametersService?: IParametersService;
  readonly plotService?: IPlotService;
  readonly searchService?: ISearchService;
  readonly settingsService?: ISettingsService;
  readonly viewsService?: IViewsService;
  readonly id?: string;
  readonly showDesktopCommandBar?: boolean;
  readonly showSkeleton?: boolean;
  readonly style?: WorkbenchStyle;
  readonly templateApplyService?: ITemplateApplyService;
  readonly templateProcessingBackendService?: ITemplateProcessingBackendService;
  readonly templateService?: ITemplateService;
  readonly tableService?: ITableService;
  readonly titlebarState?: WorkbenchTitlebarState;
};

export const createTitlebarState = (
  state: WorkbenchTitlebarState | undefined,
): WorkbenchTitlebarProps | undefined =>
  state && state.enabled !== false
    ? {
        id: WORKBENCH_TITLEBAR_ID,
        activePage: state.activePage,
        activeFileId: state.activeFileId,
        fileOptions: state.fileOptions,
        canNavigateBack: state.canNavigateBack,
        canNavigateForward: state.canNavigateForward,
        isSidebarVisible: state.isSidebarVisible,
        onFileChange: state.onFileChange,
        onAnalysisIntent: state.onAnalysisIntent,
        onCloseWindow: state.onCloseWindow,
        onMinimizeWindow: state.onMinimizeWindow,
        onNavigateBack: state.onNavigateBack,
        onNavigateForward: state.onNavigateForward,
        onPageChange: state.onPageChange,
        onToggleSidebar: state.onToggleSidebar,
        onToggleMaximizeWindow: state.onToggleMaximizeWindow,
        showFileSelector: state.showFileSelector,
        updateAction: {
          isVisible: Boolean(state.isUpdateReadyToInstall),
          isReadyToInstall: state.isUpdateReadyToInstall,
          version: state.updateVersion,
          onClick: state.onInstallUpdate,
        },
      }
    : undefined;

const getSystemLanguage = (): string | undefined =>
  typeof navigator === "undefined" ? undefined : navigator.language;

const getInitialLanguage = (): LanguageCode =>
  isLanguageCode(window.__CONDUCTOR_INITIAL_LANGUAGE__)
    ? window.__CONDUCTOR_INITIAL_LANGUAGE__
    : resolveLanguageCode("system", getSystemLanguage());

const getInitialLanguagePreference = (): LanguagePreference => {
  const settings = window.__CONDUCTOR_INITIAL_SETTINGS__;
  return settings &&
    typeof settings === "object" &&
    isLanguagePreference(settings.language)
    ? settings.language
    : "system";
};

const resolveInitialWorkbenchViewMode = (
  snapshot: WorkbenchSessionSnapshot,
): WorkbenchMainPart =>
  createSessionReadModel(snapshot).hasAnalysisData ? "chart" : "table";

//#endregion

export class Workbench extends Layout {
  //#region state and dependencies

  private readonly window: WorkbenchWindow;
  private readonly notifications: NotificationToasts;
  private language: LanguageCode = getInitialLanguage();
  private languagePreference: LanguagePreference = getInitialLanguagePreference();
  private readonly session: ISessionServiceType;
  private readonly commandService: ICommandService;
  private readonly activeWorkbenchViewContext: IContextKey<string> | null = null;
  private readonly activeWorkbenchMainPartContext: IContextKey<WorkbenchMainPart | ""> | null = null;
  private readonly activeAuxiliaryBarViewContext: IContextKey<string> | null = null;
  private readonly templateApply: TemplateApplyController;
  private readonly dialogsService: IFileDialogService;
  private readonly chartService: IChartService;
  private readonly explorerService: IExplorerService;
  private readonly filesService: IFileService;
  private readonly layoutService: IWorkbenchLayoutService;
  private readonly parametersService: IParametersService;
  private readonly plotService: IPlotService;
  private readonly searchService: ISearchService;
  private readonly settingsService: ISettingsService;
  private readonly pathService: IPathService;
  private readonly viewsService: IViewsService;
  private readonly tableService: ITableService;
  private readonly templateApplyService: ITemplateApplyService;
  private readonly templateProcessingBackendService: ITemplateProcessingBackendService;
  private readonly templateService: ITemplateService;
  private readonly exportService: IExportService;
  private readonly originChartXRangeRef: { current: OriginDisplayRange | null } = { current: null };
  private readonly originChartYRangeRef: {
    current: {
      max: number;
      min: number;
      mode: "linear" | "log";
      step?: number | null;
    } | null;
  } = { current: null };
  private readonly auxiliaryBarModel = new AuxiliaryBarModel();
  private readonly coreSettingsController: CoreSettingsController;
  private coreSettingsState: CoreSettingsState = createCoreSettingsState();
  private theme: ThemeMode = isThemeMode(window.__CONDUCTOR_INITIAL_THEME__)
    ? window.__CONDUCTOR_INITIAL_THEME__
    : "system";
  private tableStateListener: (() => void) | null = null;
  private tableStateModel: TableModel | null = null;
  private workbenchViewMode: WorkbenchMainPart = "table";

  //#endregion

  //#region lifecycle and rendering

  public get contentElement(): HTMLElement {
    return this.window.contentElement;
  }

  private get activePlotType(): PlotType {
    return this.plotService.getState().activePlotType;
  }

  constructor(parent: HTMLElement, options: WorkbenchOptions = {}) {
    super(undefined, options.layoutService, options.storageService);

    this.window = this._register(new WorkbenchWindow(parent, {
      ...options,
      titlebarState: createTitlebarState(options.titlebarState),
      showSkeleton: false,
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
    if (!options.parametersService) {
      throw new Error("Workbench requires IParametersService.");
    }
    if (!options.plotService) {
      throw new Error("Workbench requires IPlotService.");
    }
    if (!options.searchService) {
      throw new Error("Workbench requires ISearchService.");
    }
    if (!options.settingsService) {
      throw new Error("Workbench requires ISettingsService.");
    }
    if (!options.viewsService) {
      throw new Error("Workbench requires IViewsService.");
    }
    if (!options.templateApplyService) {
      throw new Error("Workbench requires ITemplateApplyService.");
    }
    if (!options.templateProcessingBackendService) {
      throw new Error("Workbench requires ITemplateProcessingBackendService.");
    }
    if (!options.templateService) {
      throw new Error("Workbench requires ITemplateService.");
    }
    this.filesService = options.filesService;
    this.chartService = options.chartService;
    this.dialogsService = options.dialogsService;
    this.explorerService = options.explorerService;
    this.exportService = options.exportService;
    this.commandService = options.commandService;
    this.layoutService = options.layoutService;
    this.parametersService = options.parametersService;
    this.plotService = options.plotService;
    this.searchService = options.searchService;
    this.settingsService = options.settingsService;
    this.activeWorkbenchViewContext = ActiveWorkbenchViewContext.bindTo(options.contextKeyService);
    this.activeWorkbenchMainPartContext = ActiveWorkbenchMainPartContext.bindTo(options.contextKeyService);
    this.activeAuxiliaryBarViewContext = ActiveAuxiliaryBarViewContext.bindTo(options.contextKeyService);
    this.pathService = options.pathService;
    this.session = options.sessionService;
    this.viewsService = options.viewsService;
    this.tableService = options.tableService;
    this._register({
      dispose: () => {
        this.tableStateListener?.();
        this.tableStateListener = null;
        this.tableStateModel = null;
      },
    });
    this.templateApplyService = options.templateApplyService;
    this.templateProcessingBackendService = options.templateProcessingBackendService;
    this.templateService = options.templateService;
    const initialViewMode = resolveInitialWorkbenchViewMode(this.session.getSnapshot());
    this.workbenchViewMode = initialViewMode;
    this._register(this.createNotificationsHandlers());
    this.templateApply = this._register(new TemplateApplyController({
      sessionService: this.session,
      templateProcessingBackendService: this.templateProcessingBackendService,
      templateApplyService: this.templateApplyService,
      onExtractionError: () => undefined,
      showResults: () => this.showWorkbenchViewMode("chart"),
    }));
    this.templateApply.update(this.getTemplateApplyInput());
    this.coreSettingsController = this._register(
      new CoreSettingsController(this.getCoreSettingsOptions()),
    );
    this._register(this.coreSettingsController.onDidChangeState((state) => {
      this.coreSettingsState = state;
      this.settingsService.updateSettingsViewInput(this.getSettingsProps());
    }));
    this._register(this.explorerService.onDidChangeSelection(() => {
      this.renderWorkbench();
    }));
    this._register(this.parametersService.onDidChangeParametersState(() => {
      this.renderWorkbench();
    }));
    this._register(this.plotService.onDidChangePlotState(() => {
      this.renderWorkbench();
    }));
    this._register(this.exportService.onDidChangeExportState(() => {
      this.renderWorkbench();
    }));
    this._register(this.templateService.onDidChangeTemplateState(() => {
      this.renderWorkbench();
    }));
    this._register(this.session.onDidChangeSession(() => this.renderWorkbench()));
    this.coreSettingsState = this.coreSettingsController.getState();
    this.resetToView(initialViewMode);
    this.renderWorkbench();
  }

  update(options: WorkbenchOptions = {}): void {
    this.window.update({
      ...options,
      titlebarState: createTitlebarState(options.titlebarState),
    });
  }

  public override resetLayoutState(): void {
    super.resetLayoutState();
    this.renderWorkbench();
  }

  private renderWorkbench(): void {
    const snapshot = this.session.getSnapshot();
    const readModel = createSessionReadModel(snapshot);
    reconcileExplorerSessionSelection(this.explorerService, readModel);
    const tableModel = this.getTableModel(snapshot, readModel);
    this.bindTableModelState(tableModel);
    this.templateApply.update(this.getTemplateApplyInput(
      snapshot,
      readModel,
      tableModel,
    ));

    this.explorerService.updatePaneInput(this.getExplorerPaneInput(
      snapshot,
      readModel,
      tableModel,
      this.templateApply,
    ));
    this.tableService.updateViewInput(this.getTableProps(tableModel));
    this.templateService.updateViewInput(this.getTemplateViewInput(
      snapshot,
      readModel,
      tableModel,
      this.templateApply,
    ));
    this.chartService.updateViewInput(this.getAnalysisProps(
      snapshot,
      this.templateApply,
      readModel,
    ));
    this.settingsService.updateSettingsViewInput(this.getSettingsProps());
    this.updateContextKeys();
    this.updateViewContainers();
    this.renderAuxiliaryBarView(snapshot, readModel);
    this.setParts({
      sidebar: this.getViewContainerElement(WorkbenchViewContainers.files, null),
      workbench: this.getViewContainerElement(
        WorkbenchViewContainers.main,
        this.workbenchViewMode === "chart" ? this.getChartViewElement() : this.getTableViewElement(),
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
      id: "analysis-page",
      className: "workbench_root",
      showDesktopCommandBar: getWorkbenchWindowState().isDesktopChromePreviewEnabled,
      showSkeleton: false,
      titlebarState: createTitlebarState(this.getTitlebarState()),
    });
  }

  private bindTableModelState(tableModel: TableModel): void {
    if (this.tableStateModel === tableModel) {
      return;
    }

    this.tableStateListener?.();
    this.tableStateModel = tableModel;
    this.tableStateListener = tableModel.onDidChangeState(() => {
      this.renderWorkbench();
    });
  }

  protected override onDidRenderLayout(): void {
    this.layoutVisibleViewContainers();
    this.window.update({
      id: "analysis-page",
      className: "workbench_root",
      showDesktopCommandBar: getWorkbenchWindowState().isDesktopChromePreviewEnabled,
      showSkeleton: false,
      titlebarState: createTitlebarState(this.getTitlebarState()),
    });
  }

  private createNotificationsHandlers(): IDisposable {
    const disposables = new DisposableStore();

    disposables.add(registerNotificationCommands(this.notifications, this.commandService));

    for (const toast of notificationService.toasts) {
      this.notifications.show(toast);
    }

    disposables.add(notificationService.onDidChangeToast(event => {
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

    return disposables;
  }

  private getTitlebarState(): WorkbenchTitlebarState {
    const state = this.state;
    const activePage = state.activeView === "settings"
      ? "settings"
      : this.workbenchViewMode;
    return {
      activePage,
      canNavigateBack: state.layoutState.canNavigateBack,
      canNavigateForward: state.layoutState.canNavigateForward,
      enabled: getWorkbenchWindowState().isDesktopChromePreviewEnabled,
      isSidebarVisible: this.sidebarVisible,
      onCloseWindow: () => closeWindow(),
      onMinimizeWindow: () => minimizeWindow(),
      onNavigateBack: () => this.handleNavigateBack(),
      onNavigateForward: () => this.handleNavigateForward(),
      onPageChange: (page) => this.handlePageAction(page),
      onToggleSidebar: () => this.handleToggleSidebar(),
      onToggleMaximizeWindow: () => toggleWindowMaximized(),
    };
  }

  //#endregion

  //#region view containers and visible parts

  private updateViewContainers(): void {
    const isSettingsActive = this.activeView === "settings";
    const isWorkbenchActive = !isSettingsActive;
    const isAnalysisActive = this.workbenchViewMode === "chart";

    if (isWorkbenchActive) {
      if (this.sidebarVisible) {
        void this.viewsService.openViewContainer(WorkbenchViewContainers.files);
      }
      void this.viewsService.openViewContainer(WorkbenchViewContainers.main);
      void this.viewsService.openViewContainer(WorkbenchViewContainers.auxiliarybar);
      this.viewsService.closeViewContainer(WorkbenchViewContainers.settings);
    } else {
      this.viewsService.closeViewContainer(WorkbenchViewContainers.main);
      this.viewsService.closeViewContainer(WorkbenchViewContainers.auxiliarybar);
      void this.viewsService.openViewContainer(WorkbenchViewContainers.settings);
    }

    this.viewsService.setViewVisible(ExplorerViewId, isWorkbenchActive && this.sidebarVisible);
    this.viewsService.setViewVisible(TableViewId, isWorkbenchActive && !isAnalysisActive);
    this.viewsService.setViewVisible(ChartViewId, isWorkbenchActive && isAnalysisActive);
    this.viewsService.setViewVisible(SettingsViewId, isSettingsActive);
    this.updateSidebar(isWorkbenchActive && this.sidebarVisible);
    this.updateAuxiliaryBar(isWorkbenchActive);
  }

  private updateContextKeys(): void {
    this.activeWorkbenchViewContext?.set(this.activeView);
    this.activeWorkbenchMainPartContext?.set(this.workbenchViewMode);
    this.activeAuxiliaryBarViewContext?.set(
      this.auxiliaryBarModel.getActiveView(this.workbenchViewMode),
    );
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
      actions: visible ? this.getFilesViewActions() : [],
      container,
      title: visible ? localize("files.explorerSection", "Explorer") : "",
    });
  }

  private getFilesViewActions() {
    const filesView = this.viewsService.getViewWithId(ExplorerViewId) as
      | { getActions?: () => readonly never[] }
      | null;
    return filesView?.getActions?.() ?? [];
  }

  private updateAuxiliaryBar(visible: boolean): void {
    const container = this.viewsService.getActiveViewPaneContainerWithId(WorkbenchViewContainers.auxiliarybar);
    if (!container) {
      this.closeAuxiliaryBarViews();
      return;
    }

    const state = this.auxiliaryBarModel.update({
      mode: this.workbenchViewMode,
      onDidChangeActiveView: () => this.handleAuxiliaryBarActiveViewChange(),
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

  private handleAuxiliaryBarActiveViewChange(): void {
    this.updateContextKeys();
    this.updateViewContainers();
    this.renderAuxiliaryBarView();
    this.layoutVisibleViewContainers();
  }

  private renderAuxiliaryBarView(
    snapshot = this.session.getSnapshot(),
    readModel = createSessionReadModel(snapshot),
  ): void {
    if (this.activeView === "settings") {
      return;
    }

    const props = this.getAuxiliaryBarViewInput(snapshot, readModel);
    const activeFile = this.getSelectedProcessedFile(snapshot, readModel);
    const activeFileRecord = this.getSelectedProcessedFileRecord(snapshot, readModel);

    switch (this.auxiliaryBarModel.getActiveView(this.workbenchViewMode)) {
      case "template":
        break;
      case "parameters":
        this.renderParametersView(snapshot, this.getSelectedProcessedFileId(readModel));
        break;
      case "search":
        this.renderSearchView(snapshot, readModel);
        break;
      case "settings":
        this.settingsService.updateOriginSettingsViewInput({
          axisSettings: props.plotAxisSettings,
          onAxisChange: props.onPlotAxisSettingsChange,
          onChange: props.onOriginOpenPlotOptionsChange,
          options: props.originOpenPlotOptions,
        });
        break;
      case "export":
      default:
        this.renderExportView(activeFile, activeFileRecord, snapshot, readModel);
        break;
    }
  }

  private renderSearchView(
    snapshot = this.session.getSnapshot(),
    readModel = createSessionReadModel(snapshot),
  ): void {
    this.searchService.setPlotModel(this.plotService.getPlotMainRenderModel({
      fileId: this.getSelectedProcessedFileId(readModel),
      snapshot,
    }));
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
      axisSettings: this.getFileAxisSettingsByFileId(snapshot),
      resolveProcessedSeriesLabel: this.resolveCurveLabelForSeries,
      resolveRecordSeriesLabel: (fileId, seriesId, fallback) =>
        this.getSeriesLabel(snapshot, fileId, seriesId) ?? fallback,
      snapshot,
    });
    this.exportService.updateOriginExportExecutionContext({
      buildCsvExportRequest: () => null,
      buildPayloads: () => this.buildOriginExportPayloads(snapshot, readModel),
      exportOriginZipFallback: () =>
        exportOriginZip({
          buildCsvExportRequest: () => null,
          buildPayloads: () => this.buildOriginExportPayloads(snapshot, readModel),
        }),
      originAxisSettings: this.coreSettingsState.conductorSettings?.plotAxisSettings,
      originChartXRangeRef: this.originChartXRangeRef,
      originChartYRangeRef: this.originChartYRangeRef,
      originOpenPlotOptions: this.coreSettingsState.originOpenPlotOptions,
      showToast: this.showOriginExportToast,
    });
  }

  private buildOriginExportPayloads(
    snapshot: WorkbenchSessionSnapshot,
    readModel: SessionReadModel,
  ): OriginExportPlan {
    return this.exportService.buildOriginExportPlan({
      activeFileId: this.getSelectedProcessedFileId(readModel),
      axisSettings: this.getFileAxisSettingsByFileId(snapshot),
      resolveSeriesLabel: (fileId, seriesId, fallback) =>
        this.getSeriesLabel(snapshot, fileId, seriesId) ?? fallback,
      snapshot,
    });
  }

  private readonly showOriginExportToast = (
    message: string,
    type?: unknown,
  ): void => {
    const toastType =
      type === "error" || type === "warning" || type === "info" || type === "success"
        ? type
        : "success";
    notificationService.showToast({
      id: "workbench.originExport",
      message,
      type: toastType,
    });
  };

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
    const viewId = this.auxiliaryBarModel.getActiveViewId(this.workbenchViewMode);
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

  private handleNavigateBack(): void {
    this.navigateBack();
    this.renderWorkbench();
  }

  private handleNavigateForward(): void {
    this.navigateForward();
    this.renderWorkbench();
  }

  private handlePageAction(page: LayoutView): void {
    if (page === "settings") {
      this.navigateToView(page);
      this.renderWorkbench();
      return;
    }

    this.showWorkbenchViewMode(page);
  }

  private handleToggleSidebar(): void {
    this.layoutService.setPartHidden(
      this.layoutService.isVisible(Parts.SIDEBAR_PART),
      Parts.SIDEBAR_PART,
    );
    this.renderWorkbench();
  }

  private readonly handleProcessedFileSelected = (fileId: string | null): void => {
    const nextFileId = String(fileId ?? "").trim() || null;
    const snapshot = this.session.getSnapshot();
    if (!nextFileId) {
      this.explorerService.select({ kind: "analysis", fileId: null });
      return;
    }

    if (!hasFileRecordAnalysisData(snapshot.filesById[nextFileId])) {
      return;
    }

    this.explorerService.select({
      candidateFileIds: createSessionReadModel(snapshot).processedFileIds,
      fileId: nextFileId,
      kind: "analysis",
    }, "force");
  };

  private showWorkbenchViewMode(viewMode: WorkbenchMainPart): void {
    const previousViewMode = this.workbenchViewMode;
    if (this.activeView !== viewMode) {
      this.navigateToView(viewMode);
    }
    this.workbenchViewMode = viewMode;
    if (previousViewMode === viewMode) {
      this.renderWorkbench();
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

  private getExplorerPaneInput(
    snapshot = this.session.getSnapshot(),
    readModel = createSessionReadModel(snapshot),
    tableModel = this.getTableModel(snapshot, readModel),
    processing = this.templateApply,
  ) {
    return createExplorerPaneInput({
      activePlotType: this.activePlotType,
      explorerService: this.explorerService,
      mode: this.workbenchViewMode,
      originOpenPlotOptions: this.coreSettingsState.originOpenPlotOptions,
      plotAxisSettings: this.coreSettingsState.conductorSettings?.plotAxisSettings,
      plotService: this.plotService,
      processing: {
        processingStatus: processing.processingStatus,
        removeQueuedProcessingFile: processing.removeQueuedProcessingFile,
        resetProcessingWorker: processing.resetProcessingWorker,
      },
      readModel,
      session: {
        clearSession: this.session.clearSession,
        commitFileImport: this.session.commitFileImport,
        removeFiles: this.session.removeFiles,
      },
      snapshot,
      tableModel,
      templateState: this.templateService.getState(),
    });
  }

  private getTemplateViewInput(
    snapshot = this.session.getSnapshot(),
    readModel = createSessionReadModel(snapshot),
    tableModel = this.getTableModel(snapshot, readModel),
    processing = this.templateApply,
  ) {
    return {
      conductorSettings: this.coreSettingsState.conductorSettings,
      onTemplateApplied: processing.handleTemplateApplied,
      onTemplateAppliedIncremental: processing.handleTemplateAppliedIncremental,
      onUpdateSettings: this.coreSettingsState.updateConductorSettings,
      rawFiles: readModel.rawFiles,
      tableModel,
    };
  }

  private getTableProps(tableModel = this.getTableModel()) {
    return {
      tableModel,
      tableState: tableModel.getState(),
    };
  }

  private getFileAxisSettingsByFileId(
    snapshot: WorkbenchSessionSnapshot,
  ): FileAxisSettingsByFileId {
    return getFileAxisSettingsByFileId({
      conductorSettings: this.coreSettingsState.conductorSettings,
      snapshot,
    });
  }

  private getAnalysisProps(
    snapshot = this.session.getSnapshot(),
    processing = this.templateApply,
    readModel = createSessionReadModel(snapshot),
  ) {
    const activeFileId = this.getSelectedProcessedFileId(readModel);
    return createChartViewInput({
      activeFileId,
      activePlotType: this.activePlotType,
      axisSettings: this.getFileAxisSettingsByFileId(snapshot),
      chartFileOptions: createExplorerFileOptionsFromRecords(
        snapshot.filesById,
        snapshot.fileOrder,
      ),
      legendLabels: this.getLegendLabelsForFile(snapshot, activeFileId ?? ""),
      onActiveFileIdChange: this.handleProcessedFileSelected,
      onActivePlotTypeChange: this.setActivePlotType,
      onLegendLabelChange: this.updateLegendLabel,
      onPlotAxisTitleChange: this.updatePlotAxisTitle,
      onPlotUnitChange: this.updatePlotUnit,
      onPlotYScaleChange: this.updatePlotYScale,
      onPlotAxisSettingsChange: this.updatePlotAxisSettings,
      onOriginOpenPlotOptionsChange: this.updateOriginPlotOptions,
      originOpenPlotOptions: this.coreSettingsState.originOpenPlotOptions,
      plotAxisSettings: this.coreSettingsState.conductorSettings?.plotAxisSettings,
      plotService: this.plotService,
      processingStatus: processing.processingStatus,
      showFileSelect: false,
      shouldMountCharts: false,
    });
  }

  private getAuxiliaryBarViewInput(
    snapshot = this.session.getSnapshot(),
    readModel = createSessionReadModel(snapshot),
  ) {
    const activeFileId = this.getSelectedProcessedFileId(readModel);
    return createChartViewInput({
      activeFileId,
      activePlotType: this.activePlotType,
      axisSettings: this.getFileAxisSettingsByFileId(snapshot),
      chartFileOptions: createExplorerFileOptionsFromRecords(
        snapshot.filesById,
        snapshot.fileOrder,
      ),
      onPlotAxisTitleChange: this.updatePlotAxisTitle,
      onPlotAxisSettingsChange: this.updatePlotAxisSettings,
      onOriginOpenPlotOptionsChange: this.updateOriginPlotOptions,
      originOpenPlotOptions: this.coreSettingsState.originOpenPlotOptions,
      plotAxisSettings: this.coreSettingsState.conductorSettings?.plotAxisSettings,
      plotService: this.plotService,
    });
  }

  //#endregion

  //#region plot and settings mutations

  private readonly setActivePlotType = (plotType: PlotType): void => {
    this.plotService.setActivePlotType(plotType);
  };

  private readonly updatePlotAxisTitle = (
    context: PlotAxisTitleContext,
    title: string,
    defaultTitle: string,
  ): void => {
    this.plotService.setAxisTitleOverride(context, title, defaultTitle);
  };

  private readonly updateLegendLabel = (
    fileId: string,
    seriesId: string,
    label: string | null,
  ): void => {
    this.plotService.setLegendLabel(fileId, seriesId, label);
  };

  private getLegendLabelsForFile(
    snapshot: WorkbenchSessionSnapshot,
    fileId: string,
  ): Readonly<Record<string, string>> {
    const normalizedFileId = String(fileId ?? "").trim();
    if (!normalizedFileId) {
      return {};
    }

    const legacyLabels = getSeriesLabelsFromRecord(snapshot.filesById[normalizedFileId]);
    return {
      ...legacyLabels,
      ...this.plotService.getLegendLabels(normalizedFileId),
    };
  }

  private getSeriesLabel(
    snapshot: WorkbenchSessionSnapshot,
    fileId: string,
    seriesId: string,
  ): string | undefined {
    const normalizedFileId = String(fileId ?? "").trim();
    const normalizedSeriesId = String(seriesId ?? "").trim();
    if (!normalizedFileId || !normalizedSeriesId) {
      return undefined;
    }

    return this.plotService.getLegendLabels(normalizedFileId)[normalizedSeriesId] ??
      snapshot.filesById[normalizedFileId]?.seriesById[normalizedSeriesId]?.labelOverride;
  }

  private readonly resolveCurveLabelForSeries = (
    file: ProcessedEntry | null | undefined,
    series: ProcessedSeries | null | undefined,
    index: number,
  ): string => {
    const fallback = resolveFallbackSeriesLabel(series, index);
    const fileId = String(file?.fileId ?? "").trim();
    const seriesId = String(series?.id ?? "").trim();
    return fileId && seriesId
      ? this.getSeriesLabel(this.session.getSnapshot(), fileId, seriesId) ?? fallback
      : fallback;
  };

  private readonly updateOriginPlotOptions = async (updates: Partial<OriginPlotOptions>): Promise<void> => {
    if (!updates || typeof updates !== "object") {
      return;
    }

    const plotUpdates = updates;
    const settingsUpdates: Record<string, unknown> = {};
    if (plotUpdates.type !== undefined) {
      settingsUpdates.originPlotTypeDefault = plotUpdates.type;
    }
    if (plotUpdates.lineWidth !== undefined) {
      settingsUpdates.originPlotLineWidthDefault = plotUpdates.lineWidth;
    }
    if (plotUpdates.legendFontSize !== undefined) {
      settingsUpdates.originPlotLegendFontSizeDefault = plotUpdates.legendFontSize;
    }
    if (plotUpdates.command !== undefined) {
      settingsUpdates.originPlotCommandDefault = plotUpdates.command;
    }
    if (plotUpdates.postCommands !== undefined) {
      settingsUpdates.originPlotPostCommandsDefault = plotUpdates.postCommands;
    }
    if (plotUpdates.xyPairs !== undefined) {
      settingsUpdates.originPlotXyPairsDefault = plotUpdates.xyPairs;
    }

    await this.coreSettingsState.updateConductorSettings(settingsUpdates);
  };

  private readonly updatePlotAxisSettings = async (updates: Record<string, unknown>): Promise<void> => {
    if (!updates || typeof updates !== "object") {
      return;
    }

    await this.coreSettingsState.updateConductorSettings({
      plotAxisSettings: {
        ...(this.coreSettingsState.conductorSettings?.plotAxisSettings ?? {}),
        ...(updates as Record<string, unknown>),
      },
    });
  };

  private readonly updatePlotUnit = async (
    fileId: string,
    axis: "x" | "y",
    unit: XUnit | YUnit,
  ): Promise<void> => {
    const normalizedFileId = String(fileId ?? "").trim();
    if (!normalizedFileId) {
      return;
    }

    const key = axis === "x" ? "xUnitByFileId" : "yUnitByFileId";
    await this.coreSettingsState.updateConductorSettings({
      [key]: {
        ...(this.coreSettingsState.conductorSettings?.[key] ?? {}),
        [normalizedFileId]: unit,
      },
    });
    this.renderWorkbench();
  };

  private readonly updatePlotYScale = async (
    fileId: string,
    scale: "linear" | "log",
  ): Promise<void> => {
    const normalizedFileId = String(fileId ?? "").trim();
    if (!normalizedFileId) {
      return;
    }

    await this.coreSettingsState.updateConductorSettings({
      yScaleByFileId: {
        ...(this.coreSettingsState.conductorSettings?.yScaleByFileId ?? {}),
        [normalizedFileId]: scale === "log" ? "log" : "linear",
      },
    });
    this.renderWorkbench();
  };

  //#endregion

  //#region derived models and settings

  private getTableModel(
    snapshot = this.session.getSnapshot(),
    readModel = createSessionReadModel(snapshot),
  ) {
    return this.tableService.update({
      rawFiles: readModel.rawFiles,
      selectedFileId: resolveExplorerSessionSelection(this.explorerService, readModel).selectedRawFileId,
    });
  }

  private getTemplateApplyInput(
    snapshot = this.session.getSnapshot(),
    readModel = createSessionReadModel(snapshot),
    tableModel: TableModel = this.getTableModel(snapshot, readModel),
  ) {
    return createTemplateApplyInput({
      readModel,
      tableModel,
      templateState: this.templateService.getState(),
    });
  }

  private getSettingsProps() {
    const state = this.coreSettingsState;
    const windowState = getWorkbenchWindowState();
    return {
      appUpdateSettings: {
        currentVersion:
          typeof windowState.environment?.appVersion === "string"
            ? windowState.environment.appVersion
            : null,
        isAvailable: windowState.isAppUpdatePreviewEnabled,
        onCheckForUpdates: async () => false,
      },
      conductorSettings: state.conductorSettings,
      conductorSettingsLoaded: state.conductorSettingsLoaded,
      handleLanguageChange: state.handleLanguageChange,
      handleResetLayoutState: async () => {
        await this.commandService.executeCommand(ResetLayoutStateCommandId);
      },
      handleThemeChange: state.handleThemeChange,
      updateConductorSettings: state.updateConductorSettings,
      isWindowsDesktopShell: windowState.isWindowsDesktopShell,
      language: this.languagePreference,
      mergeConductorSettings: state.mergeConductorSettings,
      theme: this.theme,
    };
  }

  private getCoreSettingsOptions(): CoreSettingsControllerOptions {
    return {
      applyAppearanceSettings: (settings) =>
        this.setAppearance(normalizeWorkbenchAppearance(settings)),
      language: this.languagePreference,
      reloadWorkbench: this.reloadWorkbench,
      setIonIoffMethod: method => this.parametersService.setIonIoffMethod(method),
      setSsMethod: method => this.parametersService.setSsMethod(method),
      setSsShowFitLine: enabled => this.parametersService.setShowFitLine(enabled),
      setTheme: this.setTheme,
      theme: this.theme,
    };
  }

  private readonly reloadWorkbench = (): void => {
    const conductor = window.conductor as
      | { ipcRenderer?: { send?: (channel: string, ...args: unknown[]) => void } }
      | undefined;
    if (typeof conductor?.ipcRenderer?.send === "function") {
      reloadWindow();
      return;
    }

    window.location.reload();
  };

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

  private readonly setTheme = (theme: ThemeMode): void => {
    if (this.theme === theme) {
      return;
    }

    this.theme = theme;
    window.__CONDUCTOR_INITIAL_THEME__ = theme;
    applyThemeMode(theme);
    this.coreSettingsController?.update(this.getCoreSettingsOptions());
    this.renderWorkbench();
  };

  private readonly setAppearance = (appearance: WorkbenchAppearance): void => {
    const normalizedAppearance = normalizeWorkbenchAppearance(appearance);
    applyWorkbenchAppearance(normalizedAppearance);
    const ipcRenderer = window.conductor?.ipcRenderer as
      | { invoke?: (channel: string, ...args: unknown[]) => Promise<unknown> }
      | undefined;
    if (typeof ipcRenderer?.invoke === "function") {
      try {
        void ipcRenderer.invoke(workbenchIpcChannels.desktopAppearanceSet, normalizedAppearance).catch(() => {
          // Web and older desktop shells fall back to CSS-only appearance.
        });
      } catch {
        // Web and older desktop shells fall back to CSS-only appearance.
      }
    }
  };

  //#endregion
}

//#region local helpers

const getSeriesLabelsFromRecord = (
  file: FileRecord | null | undefined,
): Readonly<Record<string, string>> => {
  const labels: Record<string, string> = {};
  for (const [seriesId, series] of Object.entries(file?.seriesById ?? {})) {
    const label = String(series.labelOverride ?? "").trim();
    if (label) {
      labels[seriesId] = label;
    }
  }
  return labels;
};

const resolveFallbackSeriesLabel = (
  series: ProcessedSeries | null | undefined,
  index: number,
): string => {
  const legendValue = String(series?.legendValue ?? "").trim();
  if (legendValue) {
    return legendValue;
  }

  const name = String(series?.name ?? "").trim();
  return name || `Series ${index + 1}`;
};

const isThemeMode = (value: unknown): value is ThemeMode =>
  value === "light" || value === "dark" || value === "system";

const resolveThemeMode = (theme: ThemeMode): "light" | "dark" => {
  if (theme === "light" || theme === "dark") {
    return theme;
  }

  return window.matchMedia?.("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
};

const applyThemeMode = (theme: ThemeMode): void => {
  const resolvedTheme = resolveThemeMode(theme);
  document.documentElement.classList.remove("light", "dark");
  document.documentElement.classList.add(resolvedTheme);
  document.documentElement.style.colorScheme = resolvedTheme;
};

//#endregion
