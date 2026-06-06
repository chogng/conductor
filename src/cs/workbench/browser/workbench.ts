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
import type { IContextMenuService } from "src/cs/platform/contextview/browser/contextView";
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
import { getCalculatedData } from "src/cs/workbench/contrib/calculation/common/calculatedData";
import type { ThemeMode } from "src/cs/workbench/common/theme";
import { WorkbenchViewContainers } from "src/cs/workbench/common/workbenchViewContainers";
import {
  ActiveAuxiliaryBarViewContext,
  ActiveWorkbenchMainPartContext,
  ActiveWorkbenchViewContext,
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
import {
  createOriginCurveOptions,
  ORIGIN_EXPORT_CONTENT_OPTIONS,
} from "src/cs/workbench/contrib/export/browser/exportModel";
import { TemplateAuxiliaryBarViewPane } from "src/cs/workbench/contrib/template/browser/templateAuxiliaryBarViewPane";
import TemplateViewPane from "src/cs/workbench/contrib/template/browser/templateViewPane";
import { TemplateImportController } from "src/cs/workbench/contrib/template/browser/templateImportController";
import { getWorkbenchContribution } from "src/cs/workbench/common/contributions";
import type { TableContribution } from "src/cs/workbench/contrib/table/browser/table.contribution";
import { TableContributionId } from "src/cs/workbench/contrib/table/common/table";
import { FilesPaneHost } from "src/cs/workbench/contrib/files/browser/filesPaneHost";
import type { FilesPaneRef } from "src/cs/workbench/contrib/files/common/files";
import { createChartExplorerFiles } from "src/cs/workbench/contrib/files/common/explorerInput";
import {
  TemplateApplyController,
  type TemplateApplyControllerInput,
} from "src/cs/workbench/contrib/template/browser/templateApplyController";
import { SessionModel } from "src/cs/workbench/contrib/session/browser/sessionModel";
import { defaultSessionModel } from "src/cs/workbench/contrib/session/browser/session";
import { createSessionActions } from "src/cs/workbench/contrib/session/browser/sessionActions";
import type {
  ITableService,
  TableModel,
} from "src/cs/workbench/contrib/table/common/tableService";
import type {
  ITemplateApplyService,
  ITemplateService,
} from "src/cs/workbench/contrib/template/common/template";
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
import type {
  OriginExportContentKey,
  OriginExportMode,
} from "src/cs/workbench/contrib/export/common/originSelectionExport";
import { ExportViewId } from "src/cs/workbench/contrib/export/common/export";
import { ParametersViewPane } from "src/cs/workbench/contrib/parameters/browser/parametersViewPane";
import { createParametersViewState } from "src/cs/workbench/contrib/parameters/browser/parametersModel";
import { ParametersViewId } from "src/cs/workbench/contrib/parameters/common/parameters";
import { OriginSettingsViewPane } from "src/cs/workbench/contrib/origin/browser/originSettingsViewPane";
import { OriginExportSettingsViewId } from "src/cs/workbench/contrib/origin/common/origin";
import { SearchViewPane } from "src/cs/workbench/contrib/search/browser/searchViewPane";
import { SearchViewId } from "src/cs/workbench/contrib/search/common/search";
import type { PlotType } from "src/cs/workbench/contrib/plot/common/plot";
import type { CleanedEntry } from "src/cs/workbench/contrib/session/common/sessionTypes";
import {
  ISeriesLabelService,
  type ISeriesLabelService as ISeriesLabelServiceType,
} from "src/cs/workbench/services/seriesLabels/common/seriesLabels";
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

type WorkbenchMainPart = "table" | "chart";

type WorkbenchSessionSnapshot = ReturnType<SessionModel["getSnapshot"]>;

export type WorkbenchOptions = {
  readonly className?: string;
  readonly analysisFileService?: IAnalysisFileService;
  readonly commandService?: ICommandService;
  readonly contextKeyService?: IContextKeyService;
  readonly contextMenuService?: IContextMenuService;
  readonly dialogsService?: IFileDialogService;
  readonly filesService?: IFileService;
  readonly pathService?: IPathService;
  readonly seriesLabelService?: ISeriesLabelServiceType;
  readonly storageService?: IStorageService;
  readonly layoutService?: IWorkbenchLayoutService;
  readonly viewsService?: IViewsService;
  readonly id?: string;
  readonly showDesktopCommandBar?: boolean;
  readonly showSkeleton?: boolean;
  readonly style?: WorkbenchStyle;
  readonly templateApplyService?: ITemplateApplyService;
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

const resolveInitialMainPart = (
  snapshot: WorkbenchSessionSnapshot,
): WorkbenchMainPart =>
  snapshot.cleanedData.length > 0 ? "chart" : "table";

export class Workbench extends Layout {
  private readonly window: WorkbenchWindow;
  private readonly notifications: NotificationToasts;
  private language: LanguageCode = getInitialLanguage();
  private languagePreference: LanguagePreference = getInitialLanguagePreference();
  private readonly filesPaneRef: { current: FilesPaneRef | null } = { current: null };
  private readonly session = defaultSessionModel;
  private readonly filesPane: FilesPaneHost;
  private readonly commandService: ICommandService;
  private readonly activeWorkbenchViewContext: IContextKey<string> | null = null;
  private readonly activeWorkbenchMainPartContext: IContextKey<string> | null = null;
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
  private readonly layoutService: IWorkbenchLayoutService;
  private readonly pathService: IPathService;
  private readonly seriesLabelService: ISeriesLabelServiceType;
  private readonly viewsService: IViewsService;
  private readonly tableService: ITableService;
  private readonly templateApplyService: ITemplateApplyService;
  private readonly templateService: ITemplateService;
  private readonly templateImportController: TemplateImportController;
  private readonly auxiliaryBarModel = new AuxiliaryBarModel();
  private readonly coreSettingsController: CoreSettingsController;
  private coreSettingsState: CoreSettingsState = createCoreSettingsState();
  private theme: ThemeMode = isThemeMode(window.__CONDUCTOR_INITIAL_THEME__)
    ? window.__CONDUCTOR_INITIAL_THEME__
    : "system";
  private activeMainPart: WorkbenchMainPart = resolveInitialMainPart(
    this.session.getSnapshot(),
  );
  private activePlotType: PlotType = "iv";
  private selectedAnalysisFileId: string | null = null;
  private originMode: OriginExportMode = "merged";
  private canvasScope: OriginCanvasExportScope = "current";
  private filteredKind: OriginFilteredCanvasKind = "output";
  private curveMode: OriginCurveExportMode = "all";
  private selectedContentKeys: OriginExportContentKey[] = ["iv"];
  private selectedCurveKeys = new Set<string>();

  public get contentElement(): HTMLElement {
    return this.window.contentElement;
  }

  constructor(parent: HTMLElement, options: WorkbenchOptions = {}) {
    super(undefined, options.layoutService, options.storageService);

    this.window = this._register(new WorkbenchWindow(parent, {
      ...options,
      titlebarState: createTitlebarState(options.titlebarState),
      showSkeleton: false,
    }));
    this.notifications = this._register(new NotificationToasts());
    this._register(toDisposableSession(this.session));
    this.mount(this.window.contentElement);
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
    if (!options.commandService) {
      throw new Error("Workbench requires ICommandService.");
    }
    if (!options.contextKeyService) {
      throw new Error("Workbench requires IContextKeyService.");
    }
    if (!options.pathService) {
      throw new Error("Workbench requires IPathService.");
    }
    if (!options.seriesLabelService) {
      throw new Error("Workbench requires ISeriesLabelService.");
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
    this.filesService = options.filesService;
    this.analysisFileService = options.analysisFileService;
    this.dialogsService = options.dialogsService;
    this.contextMenuService = options.contextMenuService;
    this.commandService = options.commandService;
    this.layoutService = options.layoutService;
    this.activeWorkbenchViewContext = ActiveWorkbenchViewContext.bindTo(options.contextKeyService);
    this.activeWorkbenchMainPartContext = ActiveWorkbenchMainPartContext.bindTo(options.contextKeyService);
    this.activeAuxiliaryBarViewContext = ActiveAuxiliaryBarViewContext.bindTo(options.contextKeyService);
    this.pathService = options.pathService;
    this.seriesLabelService = options.seriesLabelService;
    this.viewsService = options.viewsService;
    this.tableService = options.tableService;
    this.templateApplyService = options.templateApplyService;
    this.templateService = options.templateService;
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
      onExtractionError: () => undefined,
      showResults: () => this.showMainPart("chart"),
      setAnalysisResults: this.session.setAnalysisResults,
      setCleanedData: this.session.setCleanedData,
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
    this._register({
      dispose: this.session.subscribe(() => this.renderWorkbench()),
    });
    this.coreSettingsState = this.coreSettingsController.getState();
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
    this.seriesLabelService.prune(snapshot.cleanedData);
    this.clearStaleAnalysisFileSelection(snapshot);
    const tableModel = this.getTableModel(snapshot);
    this.templateApply.update(this.getTemplateApplyInput(snapshot, tableModel));

    this.filesPane.update(this.getFilesPaneProps(
      snapshot,
      tableModel,
      this.templateApply,
    ));
    this.table.update(this.getTableProps(tableModel));
    this.templateViewPane.update(this.getTemplateViewPaneProps(
      snapshot,
      tableModel,
      this.templateApply,
    ));
    this.templateAuxiliaryBarViewPane.update(
      this.templateViewPane.configElement,
      getAuxiliaryBarTitleForMode(this.activeMainPart, snapshot.templateMode),
    );
    this.analysis.update(this.getAnalysisProps(snapshot, this.templateApply));
    this.settings.update(this.getSettingsProps());
    this.updateViewContainers();
    this.updateContextKeys();
    this.renderAuxiliaryBarView(snapshot);
    this.setParts({
      sidebar: this.getViewContainerElement(WorkbenchViewContainers.files, this.filesPane.element),
      data: this.getViewContainerElement(
        WorkbenchViewContainers.main,
        this.activeMainPart === "chart" ? this.analysis.element : this.table.element,
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
      : this.activeMainPart === "chart"
        ? "analysis"
        : "data";
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
    const isAnalysisActive = this.activeMainPart === "chart";

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
    this.activeWorkbenchMainPartContext?.set(this.activeMainPart);
    this.activeAuxiliaryBarViewContext?.set(
      this.auxiliaryBarModel.getActiveView(this.activeMainPart),
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
      mode: this.activeMainPart,
      onDidChangeActiveView: () => this.handleAuxiliaryBarActiveViewChange(),
      templateMode: this.session.getSnapshot().templateMode,
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

  private renderAuxiliaryBarView(snapshot = this.session.getSnapshot()): void {
    if (this.activeView === "settings") {
      return;
    }

    const props = this.getAuxiliaryBarViewInput(snapshot);
    const activeFile = this.resolveActiveFile(snapshot);

    switch (this.auxiliaryBarModel.getActiveView(this.activeMainPart)) {
      case "template":
        break;
      case "parameters":
        this.renderParametersView(activeFile);
        break;
      case "search":
        this.renderSearchView(snapshot);
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
        this.renderExportView(activeFile);
        break;
    }
  }

  private renderSearchView(snapshot = this.session.getSnapshot()): void {
    const view = this.viewsService.getViewWithId<SearchViewPane>(SearchViewId);
    if (!view) {
      return;
    }

    view.renderSearch(getCalculatedData(
      snapshot.calculatedDataByKey,
      this.activePlotType,
      this.getActiveAnalysisFileId(snapshot),
    ));
  }

  private renderExportView(activeFile: CleanedEntry | null): void {
    const view = this.viewsService.getViewWithId<ExportViewPane>(ExportViewId);
    if (!view) {
      return;
    }

    if (activeFile) {
      this.syncCurveSelection(activeFile);
    } else {
      this.selectedCurveKeys = new Set();
    }

    const curveOptions = activeFile
      ? createOriginCurveOptions(activeFile, this.resolveCurveLabelForSeries)
      : [];
    view.render({
      curveOptions,
      hasMixedExportYScales: false,
      mode: this.originMode,
      onExportOriginZip: () => undefined,
      onModeChange: (next) => {
        this.originMode = next;
        this.renderWorkbench();
      },
      onOpenInOrigin: () => undefined,
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
      scopedFileIds: activeFile?.fileId ? [activeFile.fileId] : [],
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

  private renderParametersView(activeFile: CleanedEntry | null): void {
    const view = this.viewsService.getViewWithId<ParametersViewPane>(ParametersViewId);
    if (!view) {
      return;
    }

    const state = createParametersViewState(activeFile);
    if (state.kind === "empty") {
      view.renderEmpty(state.message);
      return;
    }

    view.renderParameters(state);
  }

  private getActiveAuxiliaryBarElement(): HTMLElement | null {
    const viewId = this.auxiliaryBarModel.getActiveViewId(this.activeMainPart);
    return viewId ? this.viewsService.getViewWithId(viewId)?.element ?? null : null;
  }

  private syncCurveSelection(activeFile: CleanedEntry): void {
    const curveKeys = new Set(
      createOriginCurveOptions(activeFile, this.resolveCurveLabelForSeries).map((option) => option.key),
    );
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

    this.showMainPart(page === "analysis" ? "chart" : "table");
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
    if (!nextFileId) {
      if (this.selectedAnalysisFileId !== null) {
        this.selectedAnalysisFileId = null;
        this.renderWorkbench();
      }
      return;
    }

    const snapshot = this.session.getSnapshot();
    if (!this.hasAnalysisFile(snapshot, nextFileId)) {
      return;
    }

    if (this.selectedAnalysisFileId === nextFileId) {
      return;
    }

    this.selectedAnalysisFileId = nextFileId;
    this.renderWorkbench();
  };

  private showMainPart(part: WorkbenchMainPart): void {
    if (this.activeMainPart !== part) {
      this.activeMainPart = part;
    }
    if (this.activeView !== "data") {
      this.navigateToView("data");
    }
    this.renderWorkbench();
  }

  private getFilesPaneProps(
    snapshot = this.session.getSnapshot(),
    tableModel = this.getTableModel(snapshot),
    processing = this.templateApply,
  ) {
    const sessionActions = createSessionActions({
      clearPreviewState: tableModel.clearState,
      disposePreviewFileCache: tableModel.disposeFileCache,
      invalidatePreviewRequests: tableModel.invalidateRequests,
      previewFile: snapshot.previewFile,
      previewLoadingMessage: localize("preview_loading", "Loading preview..."),
      cleanedData: snapshot.cleanedData,
      processingStatus: processing.processingStatus,
      sourceFiles: snapshot.sourceFiles,
      removeQueuedProcessingFile: processing.removeQueuedProcessingFile,
      runInBatch: this.session.batch,
      resetPreviewWorker: tableModel.resetWorker,
      resetProcessingWorker: processing.resetProcessingWorker,
      selectedPreviewFileId: snapshot.selectedPreviewFileId,
      setIonIoffManualTargetsByFileId: this.session.setIonIoffManualTargetsByFileId,
      setAnalysisResults: this.session.setAnalysisResults,
      setCleanedData: this.session.setCleanedData,
      setPreviewStatus: this.session.setPreviewStatus,
      setSourceFiles: this.session.setSourceFiles,
      setSelectedPreviewFileId: this.session.setSelectedPreviewFileId,
      setSelectedPreviewSheetId: this.session.setSelectedPreviewSheetId,
      setSsManualRanges: this.session.setSsManualRanges,
    });
    const isChartMode = this.activeMainPart === "chart";

    return {
      analysisFileService: this.analysisFileService,
      commandService: this.commandService,
      contextMenuService: this.contextMenuService,
      filesPaneRef: this.filesPaneRef,
      files: isChartMode
        ? createChartExplorerFiles(snapshot.sourceFiles, snapshot.cleanedData)
        : snapshot.sourceFiles,
      filesService: this.filesService,
      cleanedData: snapshot.cleanedData,
      onFileImported: sessionActions.handleFileImported,
      onFilesAdded: sessionActions.handleFilesAdded,
      onFilesReplaced: sessionActions.handleFilesReplaced,
      onFileRemoved: sessionActions.handleFileRemoved,
      onFilesRemoved: sessionActions.handleFilesRemoved,
      onFileSelected: isChartMode
        ? this.handleAnalysisFileSelected
        : sessionActions.handleFileSelected,
      selectedFileId: isChartMode
        ? this.getActiveAnalysisFileId(snapshot)
        : snapshot.selectedPreviewFileId,
    };
  }

  private getTemplateViewPaneProps(
    snapshot = this.session.getSnapshot(),
    tableModel = this.getTableModel(snapshot),
    processing = this.templateApply,
  ) {
    return {
      conductorSettings: this.coreSettingsState.conductorSettings,
      contextMenuService: this.contextMenuService,
      onTemplateApplied: processing.handleTemplateApplied,
      onTemplateAppliedIncremental: processing.handleTemplateAppliedIncremental,
      onUpdateSettings: this.coreSettingsState.updateConductorSettings,
      sourceFiles: snapshot.sourceFiles,
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

  private getAnalysisProps(
    snapshot = this.session.getSnapshot(),
    processing = this.templateApply,
  ) {
    return {
      activeFileId: this.getActiveAnalysisFileId(snapshot),
      activePlotType: this.activePlotType,
      legendLabels: this.seriesLabelService.getLabels(this.getActiveAnalysisFileId(snapshot) ?? ""),
      onActiveFileIdChange: this.handleAnalysisFileSelected,
      onActivePlotTypeChange: this.setActivePlotType,
      onLegendLabelChange: this.updateLegendLabel,
      calculatedDataByKey: snapshot.calculatedDataByKey,
      cleanedData: snapshot.cleanedData,
      onPlotAxisSettingsChange: this.updatePlotAxisSettings,
      onOriginOpenPlotOptionsChange: this.updateOriginPlotOptions,
      originOpenPlotOptions: this.coreSettingsState.originOpenPlotOptions,
      plotAxisSettings: this.coreSettingsState.conductorSettings?.plotAxisSettings,
      processingStatus: processing.processingStatus,
      showFileSelect: false,
      shouldMountCharts: false,
    };
  }

  private getAuxiliaryBarViewInput(snapshot = this.session.getSnapshot()) {
    return {
      activeFileId: this.getActiveAnalysisFileId(snapshot),
      calculatedDataByKey: snapshot.calculatedDataByKey,
      cleanedData: snapshot.cleanedData,
      onPlotAxisSettingsChange: this.updatePlotAxisSettings,
      onOriginOpenPlotOptionsChange: this.updateOriginPlotOptions,
      originOpenPlotOptions: this.coreSettingsState.originOpenPlotOptions,
      plotAxisSettings: this.coreSettingsState.conductorSettings?.plotAxisSettings,
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
    this.seriesLabelService.setLabel(fileId, seriesId, label);
    this.renderWorkbench();
  };

  private readonly resolveCurveLabelForSeries = (
    ...args: Parameters<ISeriesLabelServiceType["resolveLabel"]>
  ): string => this.seriesLabelService.resolveLabel(...args);

  private resolveActiveFile(snapshot = this.session.getSnapshot()): CleanedEntry | null {
    const activeFileId = this.getActiveAnalysisFileId(snapshot);
    const normalizedActiveFileId = String(activeFileId ?? "").trim();
    return (
      snapshot.cleanedData.find((file) => String(file?.fileId ?? "") === normalizedActiveFileId) ??
      snapshot.cleanedData[0] ??
      null
    );
  }

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

  private getActiveAnalysisFileId(snapshot = this.session.getSnapshot()): string | null {
    const candidateIds = [
      this.selectedAnalysisFileId,
      snapshot.selectedPreviewFileId,
    ];
    for (const selectedFileId of candidateIds) {
      if (selectedFileId && this.hasAnalysisFile(snapshot, selectedFileId)) {
        return selectedFileId;
      }
    }

    return snapshot.cleanedData[0]?.fileId ?? null;
  }

  private hasAnalysisFile(
    snapshot: WorkbenchSessionSnapshot,
    fileId: string,
  ): boolean {
    return snapshot.cleanedData.some(
      (file) => String(file?.fileId ?? "") === fileId,
    );
  }

  private clearStaleAnalysisFileSelection(snapshot = this.session.getSnapshot()): void {
    const selectedFileId = this.selectedAnalysisFileId;
    if (selectedFileId && !this.hasAnalysisFile(snapshot, selectedFileId)) {
      this.selectedAnalysisFileId = null;
    }
  }

  private getTableModel(snapshot = this.session.getSnapshot()) {
    return this.tableService.update({
      cacheFileIdRef: this.session.previewCacheFileIdRef,
      analysisFileService: this.analysisFileService,
      cacheFileLruRef: this.session.previewCacheFileLruRef,
      file: snapshot.previewFile,
      loadState: snapshot.previewStatus,
      loadedChunksByFileIdRef: this.session.previewLoadedChunksByFileIdRef,
      loadedChunksRef: this.session.previewLoadedChunksRef,
      requestIdRef: this.session.previewRequestIdRef,
      rowsCacheByFileIdRef: this.session.previewRowsCacheByFileIdRef,
      rowsCacheRef: this.session.previewRowsCacheRef,
      rowsRequestIdRef: this.session.previewRowsRequestIdRef,
      rowsRequestsRef: this.session.previewRowsRequestsRef,
      workerRef: this.session.previewWorkerRef,
      sourceFiles: snapshot.sourceFiles,
      selectedFileId: snapshot.selectedPreviewFileId,
      selectedSheetId: snapshot.selectedPreviewSheetId,
      setFile: this.session.setPreviewFile,
      setLoadState: this.session.setPreviewStatus,
      setSelectedFileId: this.session.setSelectedPreviewFileId,
      setSelectedSheetId: this.session.setSelectedPreviewSheetId,
    });
  }

  private getTemplateApplyInput(
    snapshot = this.session.getSnapshot(),
    tableModel: TableModel = this.getTableModel(snapshot),
  ): TemplateApplyControllerInput {
    return {
      activeFileId: snapshot.cleanedData[0]?.fileId ?? null,
      getTableRow: tableModel.getRow,
      hasSourceFile: tableModel.hasSourceFile,
      previewFile: snapshot.previewFile,
      cleanedData: snapshot.cleanedData,
      sourceFiles: snapshot.sourceFiles,
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

const toDisposableSession = (session: SessionModel) => toDisposable(() => {
  session.previewWorkerRef.current?.terminate();
  session.previewWorkerRef.current = null;
});
