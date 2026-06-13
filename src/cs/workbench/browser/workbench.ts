/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

//#region imports

import {
  DisposableStore,
  type IDisposable,
} from "src/cs/base/common/lifecycle";
import type { LanguagePreference } from "src/cs/platform/language/common/language";
import type { IFileDialogService } from "src/cs/platform/dialogs/common/dialogs";
import type { IFileService } from "src/cs/platform/files/common/files";
import type { INativeHostService } from "src/cs/platform/native/common/native";
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
} from "src/cs/workbench/contrib/files/browser/files";
import type { IParametersService } from "src/cs/workbench/services/parameters/common/parameters";
import type { IPlotService } from "src/cs/workbench/services/plot/common/plot";
import type { ISearchService } from "src/cs/workbench/services/search/common/search";
import {
  SettingsViewId,
  type ISettingsService,
  type SettingsServiceOptions,
} from "src/cs/workbench/services/settings/common/settings";
import {
  type IWorkbenchLayoutService,
  type WorkbenchMainPart,
} from "src/cs/workbench/services/layout/browser/layoutService";
import type { IViewsService } from "src/cs/workbench/services/views/common/viewsService";
import {
  isLanguagePreference,
} from "src/cs/platform/language/common/language";
import { localize } from "src/cs/nls";
import { isThemeMode } from "src/cs/workbench/common/theme";
import { WorkbenchViewContainers } from "src/cs/workbench/common/workbenchViewContainers";
import {
  ActiveAuxiliaryBarViewContext,
  ActiveWorkbenchMainPartContext,
  ActiveWorkbenchViewContext,
} from "src/cs/workbench/browser/contextkeys";
import { Layout } from "src/cs/workbench/browser/layout";
import {
  getWorkbenchWindowState,
  type ITitleService,
  type WorkbenchTitlebarState,
} from "src/cs/workbench/services/title/browser/titleService";
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
import {
  TableViewId,
  type ITableService,
} from "src/cs/workbench/services/table/common/table";
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
  type SessionReadModel,
} from "src/cs/workbench/services/session/common/sessionReadModel";
import type {
  ITemplateApplyWorkflowService,
  ITemplateService,
} from "src/cs/workbench/services/template/common/template";
import {
  type IExportService,
} from "src/cs/workbench/services/export/common/export";
import type {
  ProcessedEntry,
} from "src/cs/workbench/services/session/common/sessionTypes";
import { notificationService } from "src/cs/workbench/services/notification/common/notificationService";
import { NotificationToasts } from "src/cs/workbench/browser/parts/notifications/notificationsToasts";
import { registerNotificationCommands } from "src/cs/workbench/browser/parts/notifications/notificationsCommands";

//#endregion

//#region types and startup helpers

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
  readonly nativeHostService?: INativeHostService;
  readonly parametersService?: IParametersService;
  readonly plotService?: IPlotService;
  readonly searchService?: ISearchService;
  readonly settingsService?: ISettingsService;
  readonly viewsService?: IViewsService;
  readonly id?: string;
  readonly showDesktopCommandBar?: boolean;
  readonly showSkeleton?: boolean;
  readonly style?: WorkbenchStyle;
  readonly templateApplyWorkflowService?: ITemplateApplyWorkflowService;
  readonly templateService?: ITemplateService;
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
  private readonly activeWorkbenchViewContext: IContextKey<string> | null = null;
  private readonly activeWorkbenchMainPartContext: IContextKey<WorkbenchMainPart | ""> | null = null;
  private readonly activeAuxiliaryBarViewContext: IContextKey<string> | null = null;
  private readonly templateApplyWorkflowService: ITemplateApplyWorkflowService;
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
  private readonly templateService: ITemplateService;
  private readonly titleService: ITitleService;
  private readonly exportService: IExportService;
  private readonly domainBridge: WorkbenchDomainBridge;
  private readonly auxiliaryBarModel = new AuxiliaryBarModel();
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
    if (!options.templateApplyWorkflowService) {
      throw new Error("Workbench requires ITemplateApplyWorkflowService.");
    }
    if (!options.templateService) {
      throw new Error("Workbench requires ITemplateService.");
    }
    if (!options.titleService) {
      throw new Error("Workbench requires ITitleService.");
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
    this.templateApplyWorkflowService = options.templateApplyWorkflowService;
    this.templateService = options.templateService;
    this.titleService = options.titleService;
    this.titleService.updateTitlebarState(options.titlebarState);
    const initialViewMode = resolveInitialWorkbenchViewMode(this.session.getSnapshot());
    this._register(this.createNotificationsHandlers());
    this.settingsService.update(this.getSettingsServiceOptions());
    this.domainBridge = this._register(new WorkbenchDomainBridge({
      chartService: this.chartService,
      explorerService: this.explorerService,
      layoutService: this.layoutService,
      plotService: this.plotService,
      sessionService: this.session,
      settingsService: this.settingsService,
      tableService: this.tableService,
      templateApplyWorkflowService: this.templateApplyWorkflowService,
      templateService: this.templateService,
    }));
    this._register(this.settingsService.onDidChangeConductorSettings(() => {
      this.refreshWorkbench();
    }));
    this._register(this.explorerService.onDidChangeSelection(() => {
      this.refreshWorkbench();
    }));
    this._register(this.parametersService.onDidChangeParametersState(() => {
      this.refreshWorkbench();
    }));
    this._register(this.plotService.onDidChangePlotState(() => {
      this.refreshWorkbench();
    }));
    this._register(this.exportService.onDidChangeExportState(() => {
      this.refreshWorkbench();
    }));
    this._register(this.templateService.onDidChangeTemplateState(() => {
      this.refreshWorkbench();
    }));
    this._register(this.layoutService.onDidChangeWorkbenchNavigation(() => {
      this.refreshWorkbench();
    }));
    this._register(this.layoutService.onDidChangeActiveAuxiliaryBarView(() => {
      this.refreshWorkbench();
    }));
    this._register(this.session.onDidChangeSession(() => {
      this.refreshWorkbench();
    }));
    this.resetToView(initialViewMode);
    this.domainBridge.sync();
    this.refreshWorkbench();
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
    this.refreshWorkbench();
  }

  private refreshWorkbench(): void {
    const snapshot = this.session.getSnapshot();
    const readModel = createSessionReadModel(snapshot);
    this.updateViewContainers();
    this.updateContextKeys();
    this.renderAuxiliaryBarView(snapshot, readModel);
    this.renderWorkbench();
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

  //#endregion

  //#region view containers and visible parts

  private updateViewContainers(): void {
    const isSettingsActive = this.activeView === "settings";
    const isWorkbenchActive = !isSettingsActive;
    const isChartActive = this.activeWorkbenchMainPart === "chart";

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
    this.viewsService.setViewVisible(TableViewId, isWorkbenchActive && !isChartActive);
    this.viewsService.setViewVisible(ChartViewId, isWorkbenchActive && isChartActive);
    this.viewsService.setViewVisible(SettingsViewId, isSettingsActive);
    this.updateSidebar(isWorkbenchActive && this.sidebarVisible);
    this.updateAuxiliaryBar(isWorkbenchActive);
  }

  private updateContextKeys(): void {
    this.activeWorkbenchViewContext?.set(this.activeView);
    this.activeWorkbenchMainPartContext?.set(this.activeWorkbenchMainPart);
    this.activeAuxiliaryBarViewContext?.set(
      this.auxiliaryBarModel.getActiveView(this.activeWorkbenchMainPart),
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
      mode: this.activeWorkbenchMainPart,
      onDidChangeActiveView: view => this.layoutService.selectAuxiliaryBarView(view),
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
        this.renderSearchView(snapshot, readModel);
        break;
      case "settings":
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
      this.refreshWorkbench();
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
