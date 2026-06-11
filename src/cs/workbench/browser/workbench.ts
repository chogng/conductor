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
  type ExplorerImportedSessionFile,
  type ExplorerPaneInput,
  type ExplorerSelectionKind,
  type ExplorerThumbnailPlotModel,
  ExplorerViewId,
  type IExplorerService,
} from "src/cs/workbench/contrib/files/browser/files";
import {
  createChartExplorerFilesFromRecords,
  resolveExplorerSelectionAfterRemoval,
  resolveExplorerSelectedFileId,
} from "src/cs/workbench/contrib/files/common/explorerModel";
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
  applyWorkbenchAppearance,
  normalizeWorkbenchAppearance,
  type WorkbenchAppearance,
} from "src/cs/workbench/browser/appearance";
import {
  WorkbenchWindow,
} from "src/cs/workbench/browser/window";
import { TableViewId } from "src/cs/workbench/services/table/common/table";
import { createChartFileOptionsFromRecords } from "src/cs/workbench/services/chart/common/chartFileOptions";
import {
  TemplateApplyController,
} from "src/cs/workbench/services/template/browser/templateApplyController";
import { createTemplateApplyInput } from "src/cs/workbench/services/template/browser/templateApplyInput";
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
  TableSource,
} from "src/cs/workbench/services/table/common/table";
import type {
  ITemplateApplyService,
  ITemplateService,
  TemplateState,
} from "src/cs/workbench/services/template/common/template";
import {
  createCurrentTemplateSelectionDisplay,
} from "src/cs/workbench/services/template/common/templateSelection";
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
import type { PlotAxisSettings } from "src/cs/workbench/services/plot/common/plotSettings";
import type { XUnit, YUnit } from "src/cs/workbench/services/plot/common/units";
import type {
  ProcessingStatus,
  ProcessedEntry,
  ProcessedSeries,
  SessionFile,
} from "src/cs/workbench/services/session/common/sessionTypes";
import type {
  FileImportResult,
  ImportedFileRecord,
} from "src/cs/workbench/services/files/common/files";
import {
  createFileImportResultFromRecords,
} from "src/cs/workbench/services/files/common/files";
import {
  getFileAxisSettingsByFileId,
  type FileAxisSettingsByFileId,
} from "src/cs/workbench/services/session/browser/fileSemanticsSync";
import { createChartViewInput } from "src/cs/workbench/services/chart/browser/chartViewInput";
import { workbenchIpcChannels } from "src/cs/workbench/common/ipcChannels";
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
  readonly templateApplyService?: ITemplateApplyService;
  readonly templateProcessingBackendService?: ITemplateProcessingBackendService;
  readonly templateService?: ITemplateService;
  readonly tableService?: ITableService;
  readonly titleService?: ITitleService;
  readonly titlebarState?: WorkbenchTitlebarState;
};

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
  private readonly nativeHostService?: INativeHostService;
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
  private readonly titleService: ITitleService;
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
    if (!options.templateApplyService) {
      throw new Error("Workbench requires ITemplateApplyService.");
    }
    if (!options.templateProcessingBackendService) {
      throw new Error("Workbench requires ITemplateProcessingBackendService.");
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
    this.nativeHostService = options.nativeHostService;
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
    this.titleService = options.titleService;
    this.titleService.updateTitlebarState(options.titlebarState);
    const initialViewMode = resolveInitialWorkbenchViewMode(this.session.getSnapshot());
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
    this._register(this.layoutService.onDidChangeWorkbenchNavigation(() => {
      this.renderWorkbench();
    }));
    this._register(this.session.onDidChangeSession(() => this.renderWorkbench()));
    this.coreSettingsState = this.coreSettingsController.getState();
    this.resetToView(initialViewMode);
    this.renderWorkbench();
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
      id: "analysis-page",
      className: "workbench_root",
      showDesktopCommandBar: getWorkbenchWindowState().isDesktopChromePreviewEnabled,
      showSkeleton: false,
      titleService: this.titleService,
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
    const isAnalysisActive = this.activeWorkbenchMainPart === "chart";

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
      mode: this.activeWorkbenchMainPart,
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

  private readonly handleProcessedFileSelected = (fileId: string | null): void => {
    const nextFileId = String(fileId ?? "").trim() || null;
    const snapshot = this.session.getSnapshot();
    if (!nextFileId) {
      this.explorerService.select({ kind: "chart", fileId: null });
      return;
    }

    if (!hasFileRecordAnalysisData(snapshot.filesById[nextFileId])) {
      return;
    }

    this.explorerService.select({
      candidateFileIds: createSessionReadModel(snapshot).processedFileIds,
      fileId: nextFileId,
      kind: "chart",
    }, "force");
  };

  private showWorkbenchViewMode(viewMode: WorkbenchMainPart): void {
    const previousViewMode = this.activeWorkbenchMainPart;
    if (this.activeView !== viewMode) {
      this.navigateToView(viewMode);
    }
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
    processing = this.templateApply,
  ) {
    return createExplorerPaneInput({
      activePlotType: this.activePlotType,
      explorerService: this.explorerService,
      mode: this.activeWorkbenchMainPart,
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
      chartFileOptions: createChartFileOptionsFromRecords(
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
      chartFileOptions: createChartFileOptionsFromRecords(
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
    const selectedRawFileId = resolveExplorerSessionSelection(this.explorerService, readModel).selectedRawFileId;
    return this.tableService.update({
      rawFiles: readModel.rawFiles,
      source: createRawTableSource(selectedRawFileId),
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
        this.resetLayoutState();
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
    if (this.nativeHostService) {
      this.nativeHostService.reloadWindow();
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

type ExplorerPaneSessionInput = {
  readonly clearSession: () => void;
  readonly commitFileImport: (result: FileImportResult) => void;
  readonly removeFiles: (fileIds: readonly string[]) => void;
};

type ExplorerPaneProcessingInput = {
  readonly processingStatus?: Partial<ProcessingStatus>;
  readonly removeQueuedProcessingFile: (fileId: string) => void;
  readonly resetProcessingWorker: () => void;
};

type CreateExplorerPaneInputOptions = {
  readonly activePlotType: PlotType;
  readonly explorerService: IExplorerService;
  readonly mode: WorkbenchMainPart;
  readonly originOpenPlotOptions?: OriginPlotOptions;
  readonly plotAxisSettings?: Partial<PlotAxisSettings> | Record<string, unknown>;
  readonly plotService: Pick<IPlotService, "getCalculatedData">;
  readonly processing: ExplorerPaneProcessingInput;
  readonly readModel: SessionReadModel;
  readonly session: ExplorerPaneSessionInput;
  readonly snapshot: SessionSnapshot;
  readonly templateState: TemplateState;
};

type ExplorerSelectionService = Pick<
  IExplorerService,
  | "selectedProcessedFileId"
  | "select"
  | "selectedRawFileId"
>;

type ExplorerSessionSelection = {
  readonly selectedRawFileId: string | null;
  readonly selectedProcessedFileId: string | null;
};

type ExplorerSessionSelectionInput = {
  readonly rawFileIds: readonly string[];
  readonly processedFileIds: readonly string[];
};

type ExplorerSelectionState = Pick<
  IExplorerService,
  | "selectedProcessedFileId"
  | "selectedRawFileId"
>;

type ExplorerSessionWorkflowOptions = {
  clearSession: () => void;
  commitFileImport: (result: FileImportResult) => void;
  explorerService: ExplorerSelectionService;
  hasSessionData?: boolean;
  processingStatus?: Partial<ProcessingStatus>;
  rawFiles?: SessionFile[];
  removeQueuedProcessingFile: (fileId: string) => void;
  resetProcessingWorker: () => void;
  removeFiles: (fileIds: readonly string[]) => void;
};

const createExplorerSessionSelectionInput = (
  readModel: SessionReadModel,
): ExplorerSessionSelectionInput => ({
  processedFileIds: readModel.processedFileIds,
  rawFileIds: readModel.rawFiles.flatMap(file => file.fileId ? [file.fileId] : []),
});

const resolveExplorerSessionSelection = (
  explorerService: ExplorerSelectionState,
  readModel: SessionReadModel,
): ExplorerSessionSelection => {
  const input = createExplorerSessionSelectionInput(readModel);
  return {
    selectedProcessedFileId: resolveExplorerSelectedFileId(
      explorerService.selectedProcessedFileId,
      input.processedFileIds,
    ),
    selectedRawFileId: resolveExplorerSelectedFileId(
      explorerService.selectedRawFileId,
      input.rawFileIds,
    ),
  };
};

const reconcileExplorerSessionSelection = (
  explorerService: IExplorerService,
  readModel: SessionReadModel,
): ExplorerSessionSelection => {
  const input = createExplorerSessionSelectionInput(readModel);
  const selectedProcessedFileId = reconcileExplorerSelectedFileId(
    explorerService,
    "chart",
    explorerService.selectedProcessedFileId,
    input.processedFileIds,
  );
  const selectedRawFileId = reconcileExplorerSelectedFileId(
    explorerService,
    "table",
    explorerService.selectedRawFileId,
    input.rawFileIds,
  );

  return {
    selectedProcessedFileId,
    selectedRawFileId,
  };
};

export function createExplorerSessionWorkflow({
  clearSession,
  commitFileImport,
  explorerService,
  hasSessionData = false,
  processingStatus = { state: "idle" },
  rawFiles = [],
  removeQueuedProcessingFile,
  resetProcessingWorker,
  removeFiles,
}: ExplorerSessionWorkflowOptions) {
  const getRawFileIds = (files: readonly SessionFile[] = rawFiles): readonly string[] =>
    files
      .map(file => String(file.fileId ?? "").trim())
      .filter(fileId => fileId.length > 0);
  const getSelectedRawFileId = (files: readonly SessionFile[] = rawFiles): string | null =>
    explorerService.selectedRawFileId ??
    resolveExplorerSelectedFileId(null, getRawFileIds(files));

  const hasData = hasSessionData || rawFiles.length > 0;

  const commitImportedFiles = (
    files: readonly ExplorerImportedSessionFile[],
    mode: "append" | "replace",
  ): void => {
    const importRecords = getImportedFileRecords(files);
    if (mode === "replace") {
      clearSession();
    }
    commitFileImport(createFileImportResultFromRecords(importRecords));
  };

  const handleClearSession = () => {
    if (!hasData) {
      return;
    }

    resetProcessingWorker();
    clearSession();
    explorerService.select({ kind: "table", fileId: null });
  };

  const handleFileImported = (fileInfo: ExplorerImportedSessionFile) => {
    const importedFileId = fileInfo?.fileId ?? null;
    const selectedRawFileId = getSelectedRawFileId();
    commitImportedFiles([fileInfo], "append");
    if (importedFileId && !selectedRawFileId) {
      explorerService.select({
        candidateFileIds: getRawFileIds([...rawFiles, fileInfo]),
        fileId: importedFileId,
        kind: "table",
      }, "force");
    }
  };

  const handleFilesAdded = (files: ExplorerImportedSessionFile[]) => {
    if (!files.length) {
      return;
    }

    const selectedRawFileId = getSelectedRawFileId();
    const nextSelectedFileId = selectedRawFileId ?? files[0]?.fileId ?? null;
    commitImportedFiles(files, "append");
    if (!selectedRawFileId && nextSelectedFileId) {
      explorerService.select({
        candidateFileIds: getRawFileIds([...rawFiles, ...files]),
        fileId: nextSelectedFileId,
        kind: "table",
      }, "force");
    }
  };

  const handleFilesReplaced = (files: ExplorerImportedSessionFile[]) => {
    resetProcessingWorker();

    const nextSelectedFileId = files[0]?.fileId ?? null;
    commitImportedFiles(files, "replace");
    explorerService.select({
      candidateFileIds: getRawFileIds(files),
      fileId: nextSelectedFileId,
      kind: "table",
    }, "force");
  };

  const handleFileRemoved = (fileId: string) => {
    handleFilesRemoved([fileId]);
  };

  const handleFilesRemoved = (fileIds: readonly string[]) => {
    const removedFileIds = new Set(
      fileIds
        .map((fileId) => String(fileId ?? "").trim())
        .filter((fileId) => fileId.length > 0),
    );
    if (removedFileIds.size === 0) {
      return;
    }

    const remainingFiles = rawFiles.filter(entry =>
      !removedFileIds.has(String(entry.fileId ?? "").trim())
    );
    const remainingFileIds = getRawFileIds(remainingFiles);

    removeFiles([...removedFileIds]);
    const nextSelectedFileId = resolveExplorerSelectionAfterRemoval({
      currentFileId: explorerService.selectedRawFileId,
      remainingFileIds,
      removedFileIds: [...removedFileIds],
    });
    explorerService.select({
      candidateFileIds: remainingFileIds,
      fileId: nextSelectedFileId,
      kind: "table",
    }, "force");

    if (processingStatus.state === "processing") {
      for (const fileId of removedFileIds) {
        removeQueuedProcessingFile(fileId);
      }
    }
  };

  return {
    handleClearSession,
    handleFileImported,
    handleFilesAdded,
    handleFilesReplaced,
    handleFileRemoved,
    handleFilesRemoved,
    hasSessionData: hasData,
  };
}

export const createExplorerPaneInput = ({
  activePlotType,
  explorerService,
  mode,
  originOpenPlotOptions,
  plotAxisSettings,
  plotService,
  processing,
  readModel,
  session,
  snapshot,
  templateState,
}: CreateExplorerPaneInputOptions): ExplorerPaneInput => {
  const rawFiles = readModel.rawFiles;
  const sessionWorkflow = createExplorerSessionWorkflow({
    clearSession: session.clearSession,
    commitFileImport: session.commitFileImport,
    explorerService,
    hasSessionData: readModel.hasSessionData,
    processingStatus: processing.processingStatus,
    rawFiles,
    removeQueuedProcessingFile: processing.removeQueuedProcessingFile,
    resetProcessingWorker: processing.resetProcessingWorker,
    removeFiles: session.removeFiles,
  });
  const isChartMode = mode === "chart";
  const selectionKind: ExplorerSelectionKind = isChartMode ? "chart" : "table";
  const files = isChartMode
    ? createChartExplorerFilesFromRecords(
      snapshot.filesById,
      snapshot.fileOrder,
      rawFiles,
    )
    : rawFiles;
  const fileIds = getExplorerPaneFileIds(files);
  const thumbnailPlotModelsByFileId = isChartMode
    ? createThumbnailPlotModelsByFileId({
      activePlotType,
      fileIds: readModel.processedFileIds,
      plotService,
      snapshot,
    })
    : undefined;
  const selectedFileId = resolveExplorerSelectedFileId(
    selectionKind === "chart"
      ? explorerService.selectedProcessedFileId
      : explorerService.selectedRawFileId,
    fileIds,
  );
  const currentTemplate = createCurrentTemplateSelectionDisplay({
    formName: templateState.formState.name,
    selectedTemplateId: templateState.selectedTemplateId,
  });
  return {
    activePlotType,
    currentTemplateLabel: currentTemplate.label,
    currentTemplateSelection: currentTemplate.selection,
    fileTemplateSelectionsByFileId: templateState.selectionsByFileId,
    files,
    mode,
    onFileImported: sessionWorkflow.handleFileImported,
    onFileRemoved: sessionWorkflow.handleFileRemoved,
    onFilesAdded: sessionWorkflow.handleFilesAdded,
    onFilesRemoved: sessionWorkflow.handleFilesRemoved,
    onFilesReplaced: sessionWorkflow.handleFilesReplaced,
    originOpenPlotOptions,
    plotAxisSettings,
    selectedFileId,
    selectionKind,
    thumbnailFiles: readModel.processedFiles,
    thumbnailPlotModelsByFileId,
  };
};

const getImportedFileRecords = (
  files: readonly ExplorerImportedSessionFile[],
): readonly ImportedFileRecord[] => {
  return files.map(file => file.importRecord);
};

const reconcileExplorerSelectedFileId = (
  explorerService: Pick<IExplorerService, "select">,
  kind: ExplorerSelectionKind,
  selectedFileId: string | null,
  fileIds: readonly string[],
): string | null => {
  const nextSelectedFileId = resolveExplorerSelectedFileId(selectedFileId, fileIds);
  explorerService.select({
    candidateFileIds: fileIds,
    fileId: nextSelectedFileId,
    kind,
  });
  return nextSelectedFileId;
};

const getExplorerPaneFileIds = (
  files: readonly { readonly fileId?: string | null }[],
): readonly string[] => {
  return files
    .map(file => String(file.fileId ?? "").trim())
    .filter(fileId => fileId.length > 0);
};

const createThumbnailPlotModelsByFileId = ({
  activePlotType,
  fileIds,
  plotService,
  snapshot,
}: {
  readonly activePlotType: PlotType;
  readonly fileIds: readonly string[];
  readonly plotService: Pick<IPlotService, "getCalculatedData">;
  readonly snapshot: SessionSnapshot;
}): Readonly<Record<string, ExplorerThumbnailPlotModel>> => {
  const modelsByFileId: Record<string, ExplorerThumbnailPlotModel> = {};
  for (const fileId of fileIds) {
    const normalizedFileId = String(fileId ?? "").trim();
    if (!normalizedFileId) {
      continue;
    }

    const model = plotService.getCalculatedData({
      fileId: normalizedFileId,
      plotType: activePlotType,
      snapshot,
    });
    if (model) {
      modelsByFileId[normalizedFileId] = model;
    }
  }

  return modelsByFileId;
};

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

const createRawTableSource = (fileId: string | null): TableSource | null => {
  const normalizedFileId = String(fileId ?? "").trim();
  return normalizedFileId ? { fileId: normalizedFileId } : null;
};

//#endregion
