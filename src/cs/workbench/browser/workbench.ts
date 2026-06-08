import {
  DisposableStore,
  toDisposable,
  type IDisposable,
} from "src/cs/base/common/lifecycle";
import type {
  LanguageCode,
  LanguagePreference,
} from "src/cs/platform/language/common/language";
import type { IFileDialogService } from "src/cs/platform/dialogs/common/dialogs";
import type { IFileService } from "src/cs/platform/files/common/files";
import type {
  IContextMenuService,
  IContextViewService,
} from "src/cs/platform/contextview/browser/contextView";
import type { ICommandService } from "src/cs/platform/commands/common/commands";
import type { IStorageService } from "src/cs/platform/storage/common/storage";
import type {
  IContextKey,
  IContextKeyService,
} from "src/cs/platform/contextkey/common/contextkey";
import type { IPathService } from "src/cs/workbench/services/path/common/pathService";
import type { IAnalysisFileService } from "src/cs/workbench/services/analysisFile/common/analysisFile";
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
import {
  getCalculatedData,
} from "src/cs/workbench/contrib/calculation/common/calculatedData";
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
  getAuxiliaryBarTitleForMode,
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
import ChartViewPane from "src/cs/workbench/contrib/chart/browser/chartViewPane";
import { createChartFileOptionsFromRecords } from "src/cs/workbench/contrib/chart/browser/chartFileSelect";
import {
  createOriginCurveOptions,
  createOriginCurveOptionsFromRecord,
  ORIGIN_EXPORT_CONTENT_OPTIONS,
} from "src/cs/workbench/contrib/export/browser/exportModel";
import {
  createExportProcessedFilesFromRecords,
} from "src/cs/workbench/contrib/export/browser/export";
import {
  BrowserExportService,
} from "src/cs/workbench/contrib/export/browser/exportService";
import { TemplateAuxiliaryBarViewPane } from "src/cs/workbench/contrib/template/browser/templateAuxiliaryBarViewPane";
import TemplateViewPane from "src/cs/workbench/contrib/template/browser/templateViewPane";
import { TemplateImportController } from "src/cs/workbench/contrib/template/browser/templateImportController";
import { getWorkbenchContribution } from "src/cs/workbench/common/contributions";
import type { TableContribution } from "src/cs/workbench/contrib/table/browser/table.contribution";
import { TableContributionId } from "src/cs/workbench/contrib/table/common/table";
import { FilesPaneHost } from "src/cs/workbench/contrib/files/browser/filesPaneHost";
import type { FilesPaneRef } from "src/cs/workbench/contrib/files/common/files";
import { createChartExplorerFilesFromRecords } from "src/cs/workbench/contrib/files/common/explorerInput";
import {
  TemplateApplyController,
  type TemplateApplyControllerInput,
} from "src/cs/workbench/contrib/template/browser/templateApplyController";
import { createSessionActions } from "src/cs/workbench/browser/sessionActions";
import type {
  ISessionService as ISessionServiceType,
  SessionSnapshot,
} from "src/cs/workbench/services/session/common/session";
import {
  getSelectedTemplateIdFromViewState,
  getTemplateFormStateFromViewState,
  getTemplateModeFromViewState,
  getTemplateSelectionsFromViewState,
  resolveFileIdFromTarget,
  type FileRecord,
} from "src/cs/workbench/services/session/common/sessionModel";
import {
  createSessionReadModel,
  hasFileRecordAnalysisData,
  type SessionReadModel,
} from "src/cs/workbench/services/session/common/sessionReadModel";
import type {
  ITableService,
  TableModel,
} from "src/cs/workbench/contrib/table/common/tableService";
import type {
  ITemplateApplyService,
  ITemplateService,
} from "src/cs/workbench/contrib/template/common/template";
import {
  createTemplateSelection,
  type TemplateSelection,
} from "src/cs/workbench/contrib/template/common/templateSelection";
import type { IThumbnailService } from "src/cs/workbench/contrib/thumbnail/browser/thumbnailService";
import {
  CoreSettingsController,
  createCoreSettingsState,
  type CoreSettingsState,
} from "src/cs/workbench/contrib/settings/browser/coreSettingsController";
import { SettingsViewPane } from "src/cs/workbench/contrib/settings/browser/settingsViewPane";
import { ExportViewPane } from "src/cs/workbench/contrib/export/browser/exportViewPane";
import type {
  OriginCanvasExportScope,
  OriginCurveExportMode,
  OriginFilteredCanvasKind,
} from "src/cs/workbench/contrib/export/browser/originCanvasExport";
import {
  buildOriginExportPlan,
  type OriginYAxisScaleMode,
  type OriginExportPlan,
  OriginExportContentKey,
  OriginExportMode,
} from "src/cs/workbench/contrib/export/common/originSelectionExport";
import { ExportViewId } from "src/cs/workbench/contrib/export/common/export";
import {
  exportOriginZip,
  type OriginDisplayRange,
} from "src/cs/workbench/contrib/origin/browser/originController";
import { ParametersViewPane } from "src/cs/workbench/contrib/parameters/browser/parametersViewPane";
import { createParametersViewState } from "src/cs/workbench/contrib/parameters/browser/parametersModel";
import { ParametersViewId } from "src/cs/workbench/contrib/parameters/common/parameters";
import { OriginSettingsViewPane } from "src/cs/workbench/contrib/origin/browser/originSettingsViewPane";
import { OriginExportSettingsViewId } from "src/cs/workbench/contrib/origin/common/origin";
import { SearchViewPane } from "src/cs/workbench/contrib/search/browser/searchViewPane";
import { SearchViewId } from "src/cs/workbench/contrib/search/common/search";
import { createPlotMainRenderModel } from "src/cs/workbench/contrib/plot/browser/plotMainRenderModel";
import type { PlotType } from "src/cs/workbench/contrib/plot/common/plot";
import {
  getXUnitMeta,
  getYUnitMeta,
  normalizeXUnit,
  normalizeYUnit,
  type XUnit,
  type YUnit,
} from "src/cs/workbench/contrib/plot/common/units";
import type { ProcessedEntry } from "src/cs/workbench/services/session/common/sessionTypes";
import type { CurveYScale } from "src/cs/workbench/services/session/common/fileSemantics";
import type { IWorkbenchViewModeService } from "src/cs/workbench/services/views/common/workbenchViewModeService";
import { workbenchIpcChannels } from "src/cs/workbench/common/ipcChannels";
import {
  closeWindow,
  minimizeWindow,
  toggleWindowMaximized,
} from "src/cs/workbench/browser/actions/windowActions";
import { notificationService } from "src/cs/workbench/services/notification/common/notificationService";
import { NotificationToasts } from "src/cs/workbench/browser/parts/notifications/notificationsToasts";
import { registerNotificationCommands } from "src/cs/workbench/browser/parts/notifications/notificationsCommands";
import { ResetLayoutStateCommandId } from "src/cs/workbench/services/layout/browser/layoutConstants";

export type WorkbenchTitlebarState = {
  readonly enabled?: boolean;
  readonly activePage: LayoutView;
  readonly analysisActiveFileId?: string | null;
  readonly analysisFileOptions?: WorkbenchTitlebarProps["analysisFileOptions"];
  readonly canNavigateBack?: boolean;
  readonly canNavigateForward?: boolean;
  readonly isSidebarVisible?: boolean;
  readonly onAnalysisFileChange?: (fileId: string) => void;
  readonly onAnalysisIntent?: () => void;
  readonly onCloseWindow?: () => void;
  readonly onMinimizeWindow?: () => void;
  readonly onNavigateBack?: () => void;
  readonly onNavigateForward?: () => void;
  readonly onPageChange?: (page: LayoutView) => void;
  readonly onToggleSidebar?: () => void;
  readonly onToggleMaximizeWindow?: () => void;
  readonly showAnalysisFileSelector?: boolean;
  readonly updateVersion?: string | null;
  readonly isUpdateReadyToInstall?: boolean;
  readonly onInstallUpdate?: () => void;
};

type WorkbenchSessionSnapshot = SessionSnapshot;

type FileAxisSettingsByFileId = {
  readonly xUnitByFileId: Record<string, string>;
  readonly yScaleByFileId: Record<string, CurveYScale>;
  readonly yUnitByFileId: Record<string, string>;
};

type OriginExportFile = {
  readonly calculationCache?: unknown;
  readonly curveType?: string;
  readonly fileId?: string;
  readonly fileName?: string;
  readonly series?: ProcessedEntry["series"];
  readonly xAxisRole?: string;
  readonly xGroups?: number[][];
  readonly xLabel?: string;
  readonly xUnit?: string;
  readonly yLabel?: string;
  readonly yUnit?: string;
  readonly [key: string]: unknown;
};

type OriginExportSeries = NonNullable<OriginExportFile["series"]>[number];

export type WorkbenchOptions = {
  readonly className?: string;
  readonly analysisFileService?: IAnalysisFileService;
  readonly commandService?: ICommandService;
  readonly contextKeyService?: IContextKeyService;
  readonly contextMenuService?: IContextMenuService;
  readonly contextViewService?: IContextViewService;
  readonly dialogsService?: IFileDialogService;
  readonly filesService?: IFileService;
  readonly pathService?: IPathService;
  readonly sessionService?: ISessionServiceType;
  readonly storageService?: IStorageService;
  readonly layoutService?: IWorkbenchLayoutService;
  readonly viewsService?: IViewsService;
  readonly id?: string;
  readonly showDesktopCommandBar?: boolean;
  readonly showSkeleton?: boolean;
  readonly style?: WorkbenchStyle;
  readonly templateApplyService?: ITemplateApplyService;
  readonly templateService?: ITemplateService;
  readonly thumbnailService?: IThumbnailService;
  readonly tableService?: ITableService;
  readonly workbenchViewModeService?: IWorkbenchViewModeService;
  readonly titlebarState?: WorkbenchTitlebarState;
};

export const createTitlebarState = (
  state: WorkbenchTitlebarState | undefined,
): WorkbenchTitlebarProps | undefined =>
  state && state.enabled !== false
    ? {
        id: WORKBENCH_TITLEBAR_ID,
        activePage: state.activePage,
        analysisActiveFileId: state.analysisActiveFileId,
        analysisFileOptions: state.analysisFileOptions,
        canNavigateBack: state.canNavigateBack,
        canNavigateForward: state.canNavigateForward,
        isSidebarVisible: state.isSidebarVisible,
        onAnalysisFileChange: state.onAnalysisFileChange,
        onAnalysisIntent: state.onAnalysisIntent,
        onCloseWindow: state.onCloseWindow,
        onMinimizeWindow: state.onMinimizeWindow,
        onNavigateBack: state.onNavigateBack,
        onNavigateForward: state.onNavigateForward,
        onPageChange: state.onPageChange,
        onToggleSidebar: state.onToggleSidebar,
        onToggleMaximizeWindow: state.onToggleMaximizeWindow,
        showAnalysisFileSelector: state.showAnalysisFileSelector,
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

export class Workbench extends Layout {
  private readonly window: WorkbenchWindow;
  private readonly notifications: NotificationToasts;
  private language: LanguageCode = getInitialLanguage();
  private languagePreference: LanguagePreference = getInitialLanguagePreference();
  private readonly filesPaneRef: { current: FilesPaneRef | null } = { current: null };
  private readonly session: ISessionServiceType;
  private readonly filesPane: FilesPaneHost;
  private readonly commandService: ICommandService;
  private readonly activeWorkbenchViewContext: IContextKey<string> | null = null;
  private readonly activeWorkbenchMainPartContext: IContextKey<WorkbenchMainPart | ""> | null = null;
  private readonly activeAuxiliaryBarViewContext: IContextKey<string> | null = null;
  private readonly table: TableContribution;
  private readonly templateViewPane: TemplateViewPane;
  private readonly templateAuxiliaryBarViewPane: TemplateAuxiliaryBarViewPane;
  private readonly exportViewPane: ExportViewPane;
  private readonly searchViewPane: SearchViewPane;
  private readonly parametersViewPane: ParametersViewPane;
  private readonly originSettingsViewPane: OriginSettingsViewPane;
  private readonly analysis: ChartViewPane;
  private readonly settings: SettingsViewPane;
  private readonly templateApply: TemplateApplyController;
  private readonly dialogsService: IFileDialogService;
  private readonly analysisFileService: IAnalysisFileService;
  private readonly filesService: IFileService;
  private readonly contextMenuService: IContextMenuService;
  private readonly contextViewService: IContextViewService;
  private readonly layoutService: IWorkbenchLayoutService;
  private readonly pathService: IPathService;
  private readonly viewsService: IViewsService;
  private readonly tableService: ITableService;
  private readonly templateApplyService: ITemplateApplyService;
  private readonly templateService: ITemplateService;
  private readonly thumbnailService: IThumbnailService;
  private readonly workbenchViewModeService: IWorkbenchViewModeService;
  private readonly templateImportController: TemplateImportController;
  private readonly exportService = new BrowserExportService();
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
  private activePlotType: PlotType = "iv";
  private originMode: OriginExportMode = "merged";
  private canvasScope: OriginCanvasExportScope = "current";
  private filteredKind: OriginFilteredCanvasKind = "output";
  private curveMode: OriginCurveExportMode = "all";
  private selectedContentKeys: OriginExportContentKey[] = ["iv"];
  private selectedCurveKeys = new Set<string>();
  private isSyncingFileSemantics = false;

  public get contentElement(): HTMLElement {
    return this.window.contentElement;
  }

  private get workbenchViewMode(): WorkbenchMainPart {
    return this.workbenchViewModeService.viewMode;
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
    if (!options.analysisFileService) {
      throw new Error("Workbench requires IAnalysisFileService.");
    }
    if (!options.filesService) {
      throw new Error("Workbench requires IFileService.");
    }
    if (!options.dialogsService) {
      throw new Error("Workbench requires IFileDialogService.");
    }
    if (!options.contextMenuService) {
      throw new Error("Workbench requires IContextMenuService.");
    }
    if (!options.contextViewService) {
      throw new Error("Workbench requires IContextViewService.");
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
    if (!options.viewsService) {
      throw new Error("Workbench requires IViewsService.");
    }
    if (!options.templateApplyService) {
      throw new Error("Workbench requires ITemplateApplyService.");
    }
    if (!options.templateService) {
      throw new Error("Workbench requires ITemplateService.");
    }
    if (!options.thumbnailService) {
      throw new Error("Workbench requires IThumbnailService.");
    }
    if (!options.workbenchViewModeService) {
      throw new Error("Workbench requires IWorkbenchViewModeService.");
    }
    this.filesService = options.filesService;
    this.analysisFileService = options.analysisFileService;
    this.dialogsService = options.dialogsService;
    this.contextMenuService = options.contextMenuService;
    this.contextViewService = options.contextViewService;
    this.commandService = options.commandService;
    this.layoutService = options.layoutService;
    this.activeWorkbenchViewContext = ActiveWorkbenchViewContext.bindTo(options.contextKeyService);
    this.activeWorkbenchMainPartContext = ActiveWorkbenchMainPartContext.bindTo(options.contextKeyService);
    this.activeAuxiliaryBarViewContext = ActiveAuxiliaryBarViewContext.bindTo(options.contextKeyService);
    this.pathService = options.pathService;
    this.session = options.sessionService;
    this._register(toDisposableSession(this.session));
    this.viewsService = options.viewsService;
    this.tableService = options.tableService;
    this.templateApplyService = options.templateApplyService;
    this.templateService = options.templateService;
    this.thumbnailService = options.thumbnailService;
    this.workbenchViewModeService = options.workbenchViewModeService;
    const initialViewMode = resolveInitialWorkbenchViewMode(this.session.getSnapshot());
    this.workbenchViewModeService.setViewMode(initialViewMode);
    this._register(this.createNotificationsHandlers());
    this.templateImportController = new TemplateImportController(
      this.dialogsService,
      this.filesService,
      this.pathService,
    );
    this.templateApply = this._register(new TemplateApplyController({
      analysisFileService: this.analysisFileService,
      templateApplyService: this.templateApplyService,
      batchSessionUpdate: this.session.batch,
      commitProcessedFile: this.session.commitProcessedFile,
      onExtractionError: () => undefined,
      resetProcessedData: this.session.resetProcessedData,
      showResults: () => this.showWorkbenchViewMode("chart"),
    }));
    this.templateApply.update(this.getTemplateApplyInput());
    this.filesPane = this._register(new FilesPaneHost(this.getFilesPaneProps()));
    this.table = getWorkbenchContribution<TableContribution>(TableContributionId);
    this.templateViewPane = this._register(new TemplateViewPane(this.getTemplateViewPaneProps()));
    this.templateAuxiliaryBarViewPane = this._register(new TemplateAuxiliaryBarViewPane(
      this.templateViewPane.configElement,
    ));
    this.exportViewPane = this._register(new ExportViewPane());
    this.searchViewPane = this._register(new SearchViewPane());
    this.parametersViewPane = this._register(new ParametersViewPane());
    this.originSettingsViewPane = this._register(new OriginSettingsViewPane());
    this.analysis = this._register(new ChartViewPane(this.getAnalysisProps()));
    this.settings = this._register(new SettingsViewPane(this.getSettingsProps()));
    this.coreSettingsController = this._register(
      new CoreSettingsController(this.getCoreSettingsOptions()),
    );
    this._register(this.coreSettingsController.onDidChangeState((state) => {
      this.coreSettingsState = state;
      this.settings.update(this.getSettingsProps());
    }));
    this._register(this.workbenchViewModeService.onDidChangeViewMode(() => {
      this.renderWorkbench();
    }));
    this._register({
      dispose: this.session.subscribe(() => this.renderWorkbench()),
    });
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
    this.syncFileSemantics(snapshot, readModel);
    const tableModel = this.getTableModel(snapshot, readModel);
    this.templateApply.update(this.getTemplateApplyInput(
      snapshot,
      readModel,
      tableModel,
    ));

    this.filesPane.update(this.getFilesPaneProps(
      snapshot,
      readModel,
      tableModel,
      this.templateApply,
    ));
    this.table.update(this.getTableProps(tableModel));
    this.templateViewPane.update(this.getTemplateViewPaneProps(
      snapshot,
      readModel,
      tableModel,
      this.templateApply,
    ));
    this.templateAuxiliaryBarViewPane.update(
      this.templateViewPane.configElement,
      getAuxiliaryBarTitleForMode(this.workbenchViewMode, getTemplateModeFromViewState(snapshot.viewState)),
    );
    this.analysis.update(this.getAnalysisProps(
      snapshot,
      this.templateApply,
      readModel,
    ));
    this.settings.update(this.getSettingsProps());
    this.updateViewContainers();
    this.updateContextKeys();
    this.renderAuxiliaryBarView(snapshot, readModel);
    this.setParts({
      sidebar: this.getViewContainerElement(WorkbenchViewContainers.files, this.filesPane.element),
      workbench: this.getViewContainerElement(
        WorkbenchViewContainers.main,
        this.workbenchViewMode === "chart" ? this.analysis.element : this.table.element,
      ),
      auxiliaryBar: this.getViewContainerElement(
        WorkbenchViewContainers.auxiliarybar,
        this.getActiveAuxiliaryBarElement(),
      ),
      overlay: this.notifications.element,
      settings: this.getViewContainerElement(WorkbenchViewContainers.settings, this.settings.element),
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

  private updateViewContainers(): void {
    this.viewsService.addViewToContainer(WorkbenchViewContainers.files, this.filesPane);
    if (this.table.view) {
      this.viewsService.addViewToContainer(WorkbenchViewContainers.main, this.table.view);
    }
    this.viewsService.addViewToContainer(WorkbenchViewContainers.main, this.analysis);
    this.viewsService.addViewToContainer(WorkbenchViewContainers.auxiliarybar, this.templateAuxiliaryBarViewPane);
    this.viewsService.addViewToContainer(WorkbenchViewContainers.auxiliarybar, this.exportViewPane);
    this.viewsService.addViewToContainer(WorkbenchViewContainers.auxiliarybar, this.searchViewPane);
    this.viewsService.addViewToContainer(WorkbenchViewContainers.auxiliarybar, this.parametersViewPane);
    this.viewsService.addViewToContainer(WorkbenchViewContainers.auxiliarybar, this.originSettingsViewPane);
    this.viewsService.addViewToContainer(WorkbenchViewContainers.settings, this.settings);

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

    this.viewsService.setViewVisible(this.filesPane.id, isWorkbenchActive && this.sidebarVisible);
    if (this.table.view) {
      this.viewsService.setViewVisible(this.table.view.id, isWorkbenchActive && !isAnalysisActive);
    }
    this.viewsService.setViewVisible(this.analysis.id, isWorkbenchActive && isAnalysisActive);
    this.viewsService.setViewVisible(this.settings.id, isSettingsActive);
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
      actions: visible ? this.filesPane.getActions() : [],
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
      mode: this.workbenchViewMode,
      onDidChangeActiveView: () => this.handleAuxiliaryBarActiveViewChange(),
      templateMode: getTemplateModeFromViewState(this.session.getSnapshot().viewState),
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
    const activeFile = readModel.activeProcessedFile;
    const activeFileRecord = readModel.activeAnalysisFileRecord;

    switch (this.auxiliaryBarModel.getActiveView(this.workbenchViewMode)) {
      case "template":
        break;
      case "parameters":
        this.renderParametersView(activeFile, activeFileRecord);
        break;
      case "search":
        this.renderSearchView(snapshot, readModel);
        break;
      case "settings":
        this.viewsService.getViewWithId<OriginSettingsViewPane>(OriginExportSettingsViewId)?.update({
          axisSettings: props.plotAxisSettings,
          contextMenuService: this.contextMenuService,
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
    const view = this.viewsService.getViewWithId<SearchViewPane>(SearchViewId);
    if (!view) {
      return;
    }

    const model = getCalculatedData(
      readModel.calculatedPlotsByKey,
      this.activePlotType,
      readModel.activeAnalysisFileId,
    );
    view.renderSearch(model ? createPlotMainRenderModel(model) : null);
  }

  private renderExportView(
    activeFile: ProcessedEntry | null,
    activeFileRecord: FileRecord | null,
    snapshot = this.session.getSnapshot(),
    readModel = createSessionReadModel(snapshot),
  ): void {
    const view = this.viewsService.getViewWithId<ExportViewPane>(ExportViewId);
    if (!view) {
      return;
    }

    const curveOptions = activeFileRecord
      ? createOriginCurveOptionsFromRecord(
        activeFileRecord,
        (fileId, seriesId, fallback) =>
          this.session.getSeriesLabel(fileId, seriesId) ?? fallback,
      )
      : activeFile
      ? createOriginCurveOptions(activeFile, this.resolveCurveLabelForSeries)
      : [];
    this.syncCurveSelection(curveOptions);
    const scopedFiles = this.resolveOriginExportFiles(snapshot, readModel);
    const scopedFileIds = scopedFiles
      .map((file) => String(file?.fileId ?? "").trim())
      .filter(Boolean);
    const hasMixedExportYScales = new Set(
      scopedFiles.map((file) => this.resolveOriginYScaleForFile(snapshot, file)),
    ).size > 1;
    view.render({
      curveOptions,
      hasMixedExportYScales,
      mode: this.originMode,
      onExportOriginZip: this.handleExportOriginZip,
      onModeChange: (next) => {
        this.originMode = next;
        this.renderWorkbench();
      },
      onOpenInOrigin: this.handleOpenInOrigin,
      onSelectedCurveOptionKeysChange: (nextKeys) => {
        this.selectedCurveKeys = new Set(nextKeys);
        this.renderWorkbench();
      },
      originCanvasExportScope: this.canvasScope,
      originExportContentOptions: ORIGIN_EXPORT_CONTENT_OPTIONS,
      originFilteredCanvasKind: this.filteredKind,
      replaceMatchingOriginSeriesAcrossFiles: () => ({
        matchedFileCount: 0,
        matchedSeriesCount: 0,
      }),
      resolvedCurveExportMode: this.curveMode,
      scopedFileIds,
      selectedContentKeys: this.selectedContentKeys,
      selectedCurveOptionKeySet: this.selectedCurveKeys,
      setContentKeys: (next) => {
        this.selectedContentKeys =
          typeof next === "function" ? next(this.selectedContentKeys) : next;
        this.renderWorkbench();
      },
      setOriginCanvasExportScope: (next) => {
        this.canvasScope =
          typeof next === "function" ? next(this.canvasScope) : next;
        this.renderWorkbench();
      },
      setOriginFilteredCanvasKind: (next) => {
        this.filteredKind =
          typeof next === "function" ? next(this.filteredKind) : next;
        this.renderWorkbench();
      },
      setResolvedCurveExportMode: (next) => {
        this.curveMode = next;
        this.renderWorkbench();
      },
      showFilteredCanvasKindSelect: true,
    });
  }

  private readonly handleOpenInOrigin = async (): Promise<void> => {
    const snapshot = this.session.getSnapshot();
    const readModel = createSessionReadModel(snapshot);
    await this.exportService.openInOrigin({
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
  };

  private readonly handleExportOriginZip = async (): Promise<void> => {
    const snapshot = this.session.getSnapshot();
    const readModel = createSessionReadModel(snapshot);
    await this.exportService.exportOriginZip({
      exportOriginZipFallback: () =>
        exportOriginZip({
          buildCsvExportRequest: () => null,
          buildPayloads: () => this.buildOriginExportPayloads(snapshot, readModel),
        }),
      showToast: this.showOriginExportToast,
    });
  };

  private buildOriginExportPayloads(
    snapshot: WorkbenchSessionSnapshot,
    readModel: SessionReadModel,
  ): OriginExportPlan {
    const files = this.resolveOriginExportFiles(snapshot, readModel);
    if (!files.length) {
      throw new Error(localize("origin_select_canvas", "Please select at least one thumbnail first."));
    }

    const plan = buildOriginExportPlan(
      files,
      this.createSelectedOriginSeriesIdsByFile(files),
      this.originMode,
      (file) => this.resolveOriginYScaleForFile(snapshot, file),
      (file) => getXUnitMeta(this.resolveOriginXUnitForFile(snapshot, file)).factor,
      (file) => getYUnitMeta(this.resolveOriginYUnitForFile(snapshot, file)).factor,
      (file) => getYUnitMeta(this.resolveOriginYUnitForFile(snapshot, file)).label,
      (file, series, index) =>
        this.resolveOriginCurveLabel(file as OriginExportFile, series, index),
      (file, axis) => this.resolveOriginAxisTitleForFile(snapshot, file, axis),
      (file, y) =>
        this.resolveOriginYScaleForFile(snapshot, file) === "log"
          ? Math.abs(y)
          : y,
      this.selectedContentKeys.length ? this.selectedContentKeys : ["iv"],
    );
    if (!plan.payloads.length) {
      throw new Error(localize("origin_select_curve", "Please select a curve first."));
    }
    return plan;
  }

  private resolveOriginExportFiles(
    snapshot: WorkbenchSessionSnapshot,
    readModel: SessionReadModel,
  ): OriginExportFile[] {
    const processedFiles = createExportProcessedFilesFromRecords(
      snapshot.filesById,
      snapshot.fileOrder,
    ).map((file) => this.createOriginExportFile(file));
    if (!processedFiles.length) {
      return [];
    }

    if (this.canvasScope === "all") {
      return processedFiles;
    }

    if (this.canvasScope === "filtered") {
      return processedFiles.filter((file) => this.isOriginFilteredCanvas(file));
    }

    const activeFileId = String(readModel.activeAnalysisFileId ?? "").trim();
    const activeFile = activeFileId
      ? processedFiles.find((file) => String(file.fileId ?? "") === activeFileId)
      : null;
    return activeFile ? [activeFile] : [];
  }

  private createOriginExportFile(file: ProcessedEntry): OriginExportFile {
    const xAxisRole = String(file.xAxisRole ?? "").trim();
    return {
      ...file,
      curveType: file.curveType ? String(file.curveType) : undefined,
      xAxisRole: xAxisRole || undefined,
    };
  }

  private resolveOriginCurveLabel(
    file: OriginExportFile | null | undefined,
    series: OriginExportSeries | null | undefined,
    index: number,
  ): string {
    const override = this.session.getSeriesLabel(
      String(file?.fileId ?? ""),
      String(series?.id ?? ""),
    );
    if (override) {
      return override;
    }

    const legendValue = String(series?.legendValue ?? "").trim();
    if (legendValue) {
      return legendValue;
    }

    const name = String(series?.name ?? series?.label ?? "").trim();
    return name || `Series ${index + 1}`;
  }

  private createSelectedOriginSeriesIdsByFile(
    files: readonly OriginExportFile[],
  ): Record<string, string[]> {
    if (this.curveMode !== "select") {
      return {};
    }

    const selectedByFile: Record<string, string[]> = {};
    for (const file of files) {
      const fileId = String(file.fileId ?? "").trim();
      if (!fileId) {
        continue;
      }
      selectedByFile[fileId] = (Array.isArray(file.series) ? file.series : [])
        .map((series) => String(series.id ?? "").trim())
        .filter((seriesId) => Boolean(seriesId) && this.selectedCurveKeys.has(seriesId));
    }
    return selectedByFile;
  }

  private resolveOriginXUnitForFile(
    snapshot: WorkbenchSessionSnapshot,
    file: OriginExportFile | null | undefined,
  ): string {
    const fileId = String(file?.fileId ?? "").trim();
    if (!fileId) {
      return String(file?.xUnit ?? "V");
    }

    const axisSettings = this.getFileAxisSettingsByFileId(snapshot);
    return axisSettings.xUnitByFileId[fileId] ?? String(file?.xUnit ?? "V");
  }

  private resolveOriginYUnitForFile(
    snapshot: WorkbenchSessionSnapshot,
    file: OriginExportFile | null | undefined,
  ): string {
    const fileId = String(file?.fileId ?? "").trim();
    if (!fileId) {
      return String(file?.yUnit ?? "A");
    }

    const axisSettings = this.getFileAxisSettingsByFileId(snapshot);
    return axisSettings.yUnitByFileId[fileId] ?? String(file?.yUnit ?? "A");
  }

  private resolveOriginYScaleForFile(
    snapshot: WorkbenchSessionSnapshot,
    file: OriginExportFile | null | undefined,
  ): OriginYAxisScaleMode {
    const fileId = String(file?.fileId ?? "").trim();
    if (!fileId) {
      return "linear";
    }

    const axisSettings = this.getFileAxisSettingsByFileId(snapshot);
    return axisSettings.yScaleByFileId[fileId] === "log" ? "log" : "linear";
  }

  private resolveOriginAxisTitleForFile(
    snapshot: WorkbenchSessionSnapshot,
    file: OriginExportFile | null | undefined,
    axis: "x" | "y",
  ): string {
    const fileId = String(file?.fileId ?? "").trim();
    const record = fileId ? snapshot.filesById[fileId] : undefined;
    if (axis === "x") {
      return String(
        record?.axis?.x.label ??
          record?.templateRun?.config.bottomTitle ??
          file?.xLabel ??
          "",
      );
    }

    return String(
      record?.axis?.y.label ??
        record?.templateRun?.config.leftTitle ??
        file?.yLabel ??
        "",
    );
  }

  private isOriginFilteredCanvas(file: OriginExportFile): boolean {
    const targetFamily = this.filteredKind;
    const xAxisRole = String(file.xAxisRole ?? "").trim().toLowerCase();
    if (targetFamily === "transfer" && xAxisRole === "vg") {
      return true;
    }
    if (targetFamily === "output" && xAxisRole === "vd") {
      return true;
    }

    const curveType = String(file.curveType ?? "").trim().toLowerCase();
    return Boolean(curveType && curveType.includes(targetFamily));
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
    activeFile: ProcessedEntry | null,
    activeFileRecord: FileRecord | null,
  ): void {
    const view = this.viewsService.getViewWithId<ParametersViewPane>(ParametersViewId);
    if (!view) {
      return;
    }

    const state = createParametersViewState(activeFile, activeFileRecord);
    if (state.kind === "empty") {
      view.renderEmpty(state.message);
      return;
    }

    view.renderParameters(state);
  }

  private getActiveAuxiliaryBarElement(): HTMLElement | null {
    const viewId = this.auxiliaryBarModel.getActiveViewId(this.workbenchViewMode);
    return viewId ? this.viewsService.getViewWithId(viewId)?.element ?? null : null;
  }

  private syncCurveSelection(
    curveOptions: ReturnType<typeof createOriginCurveOptions>,
  ): void {
    const curveKeys = new Set(curveOptions.map((option) => option.key));
    this.selectedCurveKeys = new Set(
      this.selectedCurveKeys.size > 0
        ? [...this.selectedCurveKeys].filter((key) => curveKeys.has(key))
        : [...curveKeys],
    );
  }

  private layoutVisibleViewContainers(): void {
    for (const id of Object.values(WorkbenchViewContainers)) {
      this.viewsService.getActiveViewPaneContainerWithId(id)?.layout?.();
    }
  }

  private getViewContainerElement(containerId: string, fallback: HTMLElement | null): HTMLElement | null {
    return this.viewsService.getViewContainerElement(containerId) ?? fallback;
  }

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

  private readonly handleAnalysisFileSelected = (fileId: string | null): void => {
    const nextFileId = String(fileId ?? "").trim() || null;
    const snapshot = this.session.getSnapshot();
    if (!nextFileId) {
      if (snapshot.activeTarget.kind !== "none") {
        this.session.setActiveTarget({ kind: "none" });
      }
      return;
    }

    if (!hasFileRecordAnalysisData(snapshot.filesById[nextFileId])) {
      return;
    }

    if (resolveFileIdFromTarget(snapshot.activeTarget) === nextFileId) {
      return;
    }

    this.session.setActiveTarget({ kind: "file", fileId: nextFileId });
  };

  private readonly handleFileTemplateSelectionChanged = (
    fileId: string,
    selection: TemplateSelection,
  ): void => {
    const normalizedFileId = String(fileId ?? "").trim();
    if (!normalizedFileId) {
      return;
    }

    this.session.setFileTemplateSelectionsByFileId((previous) => ({
      ...previous,
      [normalizedFileId]: selection,
    }));
  };

  private showWorkbenchViewMode(viewMode: WorkbenchMainPart): void {
    const previousViewMode = this.workbenchViewMode;
    if (this.activeView !== viewMode) {
      this.navigateToView(viewMode);
    }
    this.workbenchViewModeService.setViewMode(viewMode);
    if (previousViewMode === viewMode) {
      this.renderWorkbench();
    }
  }

  private getFilesPaneProps(
    snapshot = this.session.getSnapshot(),
    readModel = createSessionReadModel(snapshot),
    tableModel = this.getTableModel(snapshot, readModel),
    processing = this.templateApply,
  ) {
    const rawFiles = readModel.rawFiles;
    const sessionActions = createSessionActions({
      addRawFiles: this.session.addRawFiles,
      clearSessionData: this.session.clearSessionData,
      clearPreviewState: tableModel.clearState,
      disposePreviewFileCache: tableModel.disposeFileCache,
      invalidatePreviewRequests: tableModel.invalidateRequests,
      previewFile: readModel.previewFile,
      previewLoadingMessage: localize("preview_loading", "Loading preview..."),
      hasSessionData: readModel.hasSessionData,
      processingStatus: processing.processingStatus,
      rawFiles,
      removeQueuedProcessingFile: processing.removeQueuedProcessingFile,
      runInBatch: this.session.batch,
      resetPreviewWorker: tableModel.resetWorker,
      resetProcessingWorker: processing.resetProcessingWorker,
      removeFiles: this.session.removeFiles,
      replaceRawFiles: this.session.replaceRawFiles,
      activeTarget: snapshot.activeTarget,
      setActiveTarget: this.session.setActiveTarget,
      setPreviewStatus: this.session.setPreviewStatus,
    });
    const isChartMode = this.workbenchViewMode === "chart";
    const templateFormState = getTemplateFormStateFromViewState(snapshot.viewState);
    const fileTemplateSelectionsByFileId = getTemplateSelectionsFromViewState(snapshot.viewState);
    const currentTemplateSelection = createTemplateSelection(getSelectedTemplateIdFromViewState(snapshot.viewState));
    const currentTemplateLabel = currentTemplateSelection.kind === "auto"
      ? localize("template_auto_extraction", "Auto extraction")
      : templateFormState.name || currentTemplateSelection.templateId;

    return {
      analysisFileService: this.analysisFileService,
      activePlotType: this.activePlotType,
      calculatedPlotsByKey: readModel.calculatedPlotsByKey,
      commandService: this.commandService,
      contextMenuService: this.contextMenuService,
      contextViewService: this.contextViewService,
      filesPaneRef: this.filesPaneRef,
      files: isChartMode
        ? createChartExplorerFilesFromRecords(
          snapshot.filesById,
          snapshot.fileOrder,
          rawFiles,
        )
        : rawFiles,
      filesService: this.filesService,
      mode: this.workbenchViewMode,
      originOpenPlotOptions: this.coreSettingsState.originOpenPlotOptions,
      plotAxisSettings: this.coreSettingsState.conductorSettings?.plotAxisSettings,
      thumbnailService: this.thumbnailService,
      templateService: this.templateService,
      currentTemplateLabel,
      currentTemplateSelection,
      fileTemplateSelectionsByFileId,
      thumbnailFiles: readModel.processedFiles,
      onFileImported: sessionActions.handleFileImported,
      onFilesAdded: sessionActions.handleFilesAdded,
      onFilesReplaced: sessionActions.handleFilesReplaced,
      onFileRemoved: sessionActions.handleFileRemoved,
      onFilesRemoved: sessionActions.handleFilesRemoved,
      onFileTemplateSelectionChanged: this.handleFileTemplateSelectionChanged,
      onFileSelected: isChartMode
        ? this.handleAnalysisFileSelected
        : sessionActions.handleFileSelected,
      selectedFileId: isChartMode
        ? readModel.activeAnalysisFileId
        : readModel.activeTargetFileId,
    };
  }

  private getTemplateViewPaneProps(
    snapshot = this.session.getSnapshot(),
    readModel = createSessionReadModel(snapshot),
    tableModel = this.getTableModel(snapshot, readModel),
    processing = this.templateApply,
  ) {
    return {
      conductorSettings: this.coreSettingsState.conductorSettings,
      contextMenuService: this.contextMenuService,
      onTemplateApplied: processing.handleTemplateApplied,
      onTemplateAppliedIncremental: processing.handleTemplateAppliedIncremental,
      onUpdateSettings: this.coreSettingsState.updateConductorSettings,
      sessionService: this.session,
      rawFiles: readModel.rawFiles,
      tableModel,
      templateImportController: this.templateImportController,
      templateService: this.templateService,
    };
  }

  private getTableProps(tableModel = this.getTableModel()) {
    return {
      tableModel,
      tableState: tableModel.getState(),
    };
  }

  private syncFileSemantics(
    snapshot: WorkbenchSessionSnapshot,
    readModel = createSessionReadModel(snapshot),
  ): void {
    if (this.isSyncingFileSemantics) {
      return;
    }

    this.isSyncingFileSemantics = true;
    try {
      this.session.batch(() => {
        const liveFileIds: string[] = [];
        const syncedFileIds = new Set<string>();
        const syncRecordFile = (fileId: string): void => {
          if (syncedFileIds.has(fileId)) {
            return;
          }
          syncedFileIds.add(fileId);

          const file = snapshot.filesById[fileId];
          if (!hasFileRecordAnalysisData(file)) {
            return;
          }

          liveFileIds.push(file.id);
          const templateSelection =
            file.templateRun?.selection ??
            getTemplateSelectionsFromViewState(snapshot.viewState)[file.id] ??
            createTemplateSelection(getSelectedTemplateIdFromViewState(snapshot.viewState));
          this.session.setFileSemantics({
            fileId: file.id,
            kind: file.assessment.baseFamily ?? "unknown",
            sourceFileName: file.raw.fileName,
            templateId: templateSelection?.kind === "template"
              ? templateSelection.templateId
              : undefined,
            x: {
              label: String(file.axis?.x.label ?? file.templateRun?.config.bottomTitle ?? ""),
              role: String(file.axis?.x.role ?? ""),
              unit: this.getFileRecordSemanticXUnit(file.id, file),
            },
            y: {
              label: String(file.axis?.y.label ?? file.templateRun?.config.leftTitle ?? ""),
              role: String(file.axis?.y.role ?? ""),
              scale: file.axis?.y.scale ?? this.getSemanticYScale(file.id),
              unit: this.getFileRecordSemanticYUnit(file.id, file),
            },
          });
        };

        for (const fileId of readModel.processedFileIds) {
          syncRecordFile(fileId);
        }

        this.session.pruneFileSemantics(liveFileIds, []);
        this.session.pruneSeriesLabelsByRecords(snapshot.filesById, snapshot.fileOrder);
      });
    } finally {
      this.isSyncingFileSemantics = false;
    }
  }

  private getFileAxisSettingsByFileId(
    snapshot: WorkbenchSessionSnapshot,
  ): FileAxisSettingsByFileId {
    const settings = this.coreSettingsState.conductorSettings;
    const xUnitByFileId: Record<string, string> = {
      ...(settings?.xUnitByFileId ?? {}),
    };
    const yUnitByFileId: Record<string, string> = {
      ...(settings?.yUnitByFileId ?? {}),
    };
    const yScaleByFileId: Record<string, CurveYScale> = {
      ...(settings?.yScaleByFileId ?? {}),
    };

    const seenFileIds = new Set<string>();
    const applyFile = (fileId: string): void => {
      if (seenFileIds.has(fileId)) {
        return;
      }
      seenFileIds.add(fileId);

      const file = snapshot.filesById[fileId];
      if (!file) {
        return;
      }

      const semantics = this.session.getFileSemantics(fileId);
      const xUnit = file.axis?.x.unit ?? file.templateRun?.config.xUnit ?? semantics?.x.unit;
      const yUnit = file.axis?.y.unit ?? file.templateRun?.config.yUnit ?? semantics?.y.unit;
      const yScale = file.axis?.y.scale ?? semantics?.y.scale;
      if (xUnit && !xUnitByFileId[fileId]) {
        xUnitByFileId[fileId] = xUnit;
      }
      if (yUnit && !yUnitByFileId[fileId]) {
        yUnitByFileId[fileId] = yUnit;
      }
      if (yScale && !yScaleByFileId[fileId]) {
        yScaleByFileId[fileId] = yScale;
      }
    };

    for (const fileId of snapshot.fileOrder) {
      applyFile(fileId);
    }
    for (const fileId of Object.keys(snapshot.filesById)) {
      applyFile(fileId);
    }

    return {
      xUnitByFileId,
      yScaleByFileId,
      yUnitByFileId,
    };
  }

  private getFileRecordSemanticXUnit(fileId: string, file: FileRecord): string {
    const sourceUnit = normalizeXUnit(
      file.axis?.x.unit ?? file.templateRun?.config.xUnit,
      "V",
    ) || "V";
    return normalizeXUnit(
      this.coreSettingsState.conductorSettings?.xUnitByFileId?.[fileId],
      sourceUnit,
    ) || sourceUnit;
  }

  private getFileRecordSemanticYUnit(fileId: string, file: FileRecord): string {
    const rawUnit = file.axis?.y.unit ?? file.templateRun?.config.yUnit;
    const sourceUnit = normalizeYUnit(rawUnit);
    if (!sourceUnit) {
      return String(rawUnit ?? "").trim();
    }

    return normalizeYUnit(
      this.coreSettingsState.conductorSettings?.yUnitByFileId?.[fileId],
      sourceUnit,
    ) || sourceUnit;
  }

  private getSemanticYScale(fileId: string): CurveYScale {
    return this.coreSettingsState.conductorSettings?.yScaleByFileId?.[fileId] === "log"
      ? "log"
      : "linear";
  }

  private getAnalysisProps(
    snapshot = this.session.getSnapshot(),
    processing = this.templateApply,
    readModel = createSessionReadModel(snapshot),
  ) {
    const activeFileId = readModel.activeAnalysisFileId;
    const axisSettings = this.getFileAxisSettingsByFileId(snapshot);
    return {
      activeFileId,
      activePlotType: this.activePlotType,
      chartFileOptions: createChartFileOptionsFromRecords(
        snapshot.filesById,
        snapshot.fileOrder,
      ),
      hasAnalysisData: Boolean(activeFileId),
      legendLabels: this.session.getSeriesLabels(activeFileId ?? ""),
      onActiveFileIdChange: this.handleAnalysisFileSelected,
      onActivePlotTypeChange: this.setActivePlotType,
      onLegendLabelChange: this.updateLegendLabel,
      onPlotUnitChange: this.updatePlotUnit,
      onPlotYScaleChange: this.updatePlotYScale,
      calculatedPlotsByKey: readModel.calculatedPlotsByKey,
      onPlotAxisSettingsChange: this.updatePlotAxisSettings,
      onOriginOpenPlotOptionsChange: this.updateOriginPlotOptions,
      originOpenPlotOptions: this.coreSettingsState.originOpenPlotOptions,
      plotAxisSettings: this.coreSettingsState.conductorSettings?.plotAxisSettings,
      processingStatus: processing.processingStatus,
      showFileSelect: false,
      shouldMountCharts: false,
      xUnitByFileId: axisSettings.xUnitByFileId,
      yScaleByFileId: axisSettings.yScaleByFileId,
      yUnitByFileId: axisSettings.yUnitByFileId,
    };
  }

  private getAuxiliaryBarViewInput(
    snapshot = this.session.getSnapshot(),
    readModel = createSessionReadModel(snapshot),
  ) {
    const axisSettings = this.getFileAxisSettingsByFileId(snapshot);
    const activeFileId = readModel.activeAnalysisFileId;
    return {
      activeFileId,
      chartFileOptions: createChartFileOptionsFromRecords(
        snapshot.filesById,
        snapshot.fileOrder,
      ),
      calculatedPlotsByKey: readModel.calculatedPlotsByKey,
      hasAnalysisData: Boolean(activeFileId),
      onPlotAxisSettingsChange: this.updatePlotAxisSettings,
      onOriginOpenPlotOptionsChange: this.updateOriginPlotOptions,
      originOpenPlotOptions: this.coreSettingsState.originOpenPlotOptions,
      plotAxisSettings: this.coreSettingsState.conductorSettings?.plotAxisSettings,
      xUnitByFileId: axisSettings.xUnitByFileId,
      yScaleByFileId: axisSettings.yScaleByFileId,
      yUnitByFileId: axisSettings.yUnitByFileId,
    };
  }

  private readonly setActivePlotType = (plotType: PlotType): void => {
    if (this.activePlotType === plotType) {
      return;
    }

    this.activePlotType = plotType;
    this.renderWorkbench();
  };

  private readonly updateLegendLabel = (
    fileId: string,
    seriesId: string,
    label: string | null,
  ): void => {
    this.session.setSeriesLabel(fileId, seriesId, label);
  };

  private readonly resolveCurveLabelForSeries = (
    ...args: Parameters<ISessionServiceType["resolveSeriesLabel"]>
  ): string => this.session.resolveSeriesLabel(...args);

  private readonly updateOriginPlotOptions = async (updates: unknown): Promise<void> => {
    if (!updates || typeof updates !== "object") {
      return;
    }

    const plotUpdates = updates as Partial<CoreSettingsState["originOpenPlotOptions"]>;
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

  private readonly updatePlotAxisSettings = async (updates: unknown): Promise<void> => {
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

  private getTableModel(
    snapshot = this.session.getSnapshot(),
    readModel = createSessionReadModel(snapshot),
  ) {
    return this.tableService.update({
      cacheFileIdRef: this.session.previewCacheFileIdRef,
      analysisFileService: this.analysisFileService,
      cacheFileLruRef: this.session.previewCacheFileLruRef,
      file: readModel.previewFile,
      loadState: readModel.previewStatus,
      loadedChunksByFileIdRef: this.session.previewLoadedChunksByFileIdRef,
      loadedChunksRef: this.session.previewLoadedChunksRef,
      requestIdRef: this.session.previewRequestIdRef,
      rowsCacheByFileIdRef: this.session.previewRowsCacheByFileIdRef,
      rowsCacheRef: this.session.previewRowsCacheRef,
      rowsRequestIdRef: this.session.previewRowsRequestIdRef,
      rowsRequestsRef: this.session.previewRowsRequestsRef,
      workerRef: this.session.previewWorkerRef,
      rawFiles: readModel.rawFiles,
      selectedFileId: readModel.activeTargetFileId,
      selectedSheetId: readModel.activeTargetSheetId,
      viewSelection: snapshot.viewState.table?.selection,
      setFile: this.session.setPreviewFile,
      setLoadState: this.session.setPreviewStatus,
      setActiveTarget: this.session.setActiveTarget,
      setViewSelection: this.session.setTableSelection,
    });
  }

  private getTemplateApplyInput(
    snapshot = this.session.getSnapshot(),
    readModel = createSessionReadModel(snapshot),
    tableModel: TableModel = this.getTableModel(snapshot, readModel),
  ): TemplateApplyControllerInput {
    return {
      activeFileId: readModel.activeTargetFileId ?? readModel.activeAnalysisFileId,
      getTableRow: tableModel.getRow,
      hasSourceFile: tableModel.hasSourceFile,
      previewFile: readModel.previewFile,
      processedFileIds: readModel.processedFileIds,
      rawFiles: readModel.rawFiles,
    };
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

  private getCoreSettingsOptions() {
    return {
      language: this.languagePreference,
      setAppearance: this.setAppearance,
      setIonIoffMethod: () => undefined,
      setSsMethod: () => undefined,
      setSsShowFitLine: () => undefined,
      setTheme: this.setTheme,
      theme: this.theme,
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
}

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

const toDisposableSession = (session: ISessionServiceType) => toDisposable(() => {
  session.previewWorkerRef.current?.terminate();
  session.previewWorkerRef.current = null;
});
