import {
  DisposableStore,
  toDisposable,
  type IDisposable,
} from "src/cs/base/common/lifecycle";
import { toAction, type IAction } from "src/cs/base/common/actions";
import type {
  LanguageCode,
  LanguagePreference,
} from "src/cs/platform/language/common/language";
import type { IFileDialogService } from "src/cs/platform/dialogs/common/dialogs";
import type { IFileService } from "src/cs/platform/files/common/files";
import type { IContextMenuService } from "src/cs/platform/contextview/browser/contextView";
import type { IPathService } from "src/cs/workbench/services/path/common/pathService";
import type { IAnalysisFileService } from "src/cs/workbench/services/analysisFile/common/analysisFile";
import type { IWorkbenchLayoutService } from "src/cs/workbench/services/layout/browser/layoutService";
import type { IViewsService } from "src/cs/workbench/services/views/common/viewsService";
import {
  isLanguageCode,
  isLanguagePreference,
  resolveLanguageCode,
} from "src/cs/platform/language/common/language";
import {
  createNLSConfiguration,
  localize,
  setNLSConfiguration,
} from "src/cs/nls";
import { isTransferLikeFile } from "src/cs/workbench/contrib/diagnostics/common/metrics";
import type { ThemeMode } from "src/cs/workbench/common/theme";
import { WorkbenchViewContainers } from "src/cs/workbench/common/workbenchViewContainers";
import { Layout, type LayoutView } from "src/cs/workbench/browser/layout";
import {
  WORKBENCH_TITLEBAR_COMMAND_BAR_ID,
  type WorkbenchTitlebarProps,
} from "src/cs/workbench/browser/parts/titlebar/titlebarPart";
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
  createParameterRows,
  ORIGIN_EXPORT_CONTENT_OPTIONS,
  resolveActiveFile,
} from "src/cs/workbench/browser/secondaryViewModel";
import TemplateViewlet from "src/cs/workbench/contrib/template/browser/templateViewlet";
import { TemplateImportController } from "src/cs/workbench/contrib/template/browser/templateImportController";
import { getWorkbenchContribution } from "src/cs/workbench/common/contributions";
import type { TableContribution } from "src/cs/workbench/contrib/table/browser/table.contribution";
import { TableContributionId } from "src/cs/workbench/contrib/table/common/table";
import { FilesPaneHost } from "src/cs/workbench/contrib/files/browser/filesPaneHost";
import type { FilesPaneRef } from "src/cs/workbench/contrib/files/common/files";
import {
  TemplateApplyController,
  type TemplateApplyControllerInput,
} from "src/cs/workbench/contrib/template/browser/templateApplyController";
import { SessionModel } from "src/cs/workbench/contrib/session/browser/sessionModel";
import { defaultSessionModel } from "src/cs/workbench/contrib/session/browser/useSession";
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
import { ExportView } from "src/cs/workbench/contrib/export/browser/exportView";
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
import { ParametersView } from "src/cs/workbench/contrib/parameters/browser/parametersViewPane";
import { ParametersViewId } from "src/cs/workbench/contrib/parameters/common/parameters";
import { ExportSettingsView } from "src/cs/workbench/contrib/origin/browser/exportSettingsView";
import { OriginExportSettingsViewId } from "src/cs/workbench/contrib/origin/common/origin";
import { workbenchIpcChannels } from "src/cs/workbench/common/ipcChannels";
import {
  closeWindow,
  minimizeWindow,
  toggleWindowMaximized,
} from "src/cs/workbench/browser/actions/windowActions";
import { notificationService } from "src/cs/workbench/services/notification/common/notificationService";
import {
  disposeNotificationToast,
  disposeNotificationToasts,
  hideNotificationToast,
  showNotificationToast,
} from "src/cs/workbench/browser/parts/notifications/notificationsToasts";

export type WorkbenchTitlebarState = {
  readonly enabled?: boolean;
  readonly activePage: LayoutView;
  readonly analysisActiveFileId?: string | null;
  readonly analysisFileOptions?: WorkbenchTitlebarProps["analysisFileOptions"];
  readonly canNavigateBack?: boolean;
  readonly canNavigateForward?: boolean;
  readonly onAnalysisFileChange?: (fileId: string) => void;
  readonly onAnalysisIntent?: () => void;
  readonly onCloseWindow?: () => void;
  readonly onMinimizeWindow?: () => void;
  readonly onNavigateBack?: () => void;
  readonly onNavigateForward?: () => void;
  readonly onOpenSettings?: () => void;
  readonly onPageChange?: (page: "data" | "analysis") => void;
  readonly onToggleMaximizeWindow?: () => void;
  readonly showAnalysisFileSelector?: boolean;
  readonly updateVersion?: string | null;
  readonly isUpdateReadyToInstall?: boolean;
  readonly onInstallUpdate?: () => void;
};

type WorkbenchMainPart = "table" | "chart";
type SecondaryView = "export" | "parameters" | "settings";

type WorkbenchSessionSnapshot = ReturnType<SessionModel["getSnapshot"]>;

type SecondaryViewDescriptor = {
  readonly id: SecondaryView;
  readonly viewId: string;
  readonly labelKey: string;
  readonly label: string;
};

const secondaryViews: readonly SecondaryViewDescriptor[] = [
  {
    id: "export",
    viewId: ExportViewId,
    labelKey: "da_analysis_views_export",
    label: "Export",
  },
  {
    id: "parameters",
    viewId: ParametersViewId,
    labelKey: "da_analysis_views_parameters",
    label: "Parameters",
  },
  {
    id: "settings",
    viewId: OriginExportSettingsViewId,
    labelKey: "da_chart_curve_settings_title",
    label: "Curve Settings",
  },
];

export type WorkbenchOptions = {
  readonly className?: string;
  readonly analysisFileService?: IAnalysisFileService;
  readonly contextMenuService?: IContextMenuService;
  readonly dialogsService?: IFileDialogService;
  readonly filesService?: IFileService;
  readonly pathService?: IPathService;
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
        id: WORKBENCH_TITLEBAR_COMMAND_BAR_ID,
        activePage: state.activePage,
        analysisActiveFileId: state.analysisActiveFileId,
        analysisFileOptions: state.analysisFileOptions,
        canNavigateBack: state.canNavigateBack,
        canNavigateForward: state.canNavigateForward,
        onAnalysisFileChange: state.onAnalysisFileChange,
        onAnalysisIntent: state.onAnalysisIntent,
        onCloseWindow: state.onCloseWindow,
        onMinimizeWindow: state.onMinimizeWindow,
        onNavigateBack: state.onNavigateBack,
        onNavigateForward: state.onNavigateForward,
        onOpenSettings: state.onOpenSettings,
        onPageChange: state.onPageChange,
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

const applyLanguage = (language: LanguageCode): void => {
  setNLSConfiguration(createNLSConfiguration(language));
};

const getSystemLanguage = (): string | undefined =>
  typeof navigator === "undefined" ? undefined : navigator.language;

const getInitialLanguage = (): LanguageCode =>
  isLanguageCode(window.__CONDUCTOR_INITIAL_LANGUAGE__)
    ? window.__CONDUCTOR_INITIAL_LANGUAGE__
    : resolveLanguageCode("system", getSystemLanguage());

const getInitialLanguagePreference = (): LanguagePreference => {
  const settings = window.__CONDUCTOR_INITIAL_DEVICE_ANALYSIS_SETTINGS__;
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
  private language: LanguageCode = getInitialLanguage();
  private languagePreference: LanguagePreference = getInitialLanguagePreference();
  private readonly filesPaneRef: { current: FilesPaneRef | null } = { current: null };
  private readonly session = defaultSessionModel;
  private readonly filesPane: FilesPaneHost;
  private readonly table: TableContribution;
  private readonly templateViewlet: TemplateViewlet;
  private readonly analysis: ChartViewPane;
  private readonly settings: SettingsViewPane;
  private readonly templateApply: TemplateApplyController;
  private readonly dialogsService: IFileDialogService;
  private readonly analysisFileService: IAnalysisFileService;
  private readonly filesService: IFileService;
  private readonly contextMenuService: IContextMenuService;
  private readonly pathService: IPathService;
  private readonly viewsService: IViewsService;
  private readonly tableService: ITableService;
  private readonly templateApplyService: ITemplateApplyService;
  private readonly templateService: ITemplateService;
  private readonly templateImportController: TemplateImportController;
  private readonly coreSettingsController: CoreSettingsController;
  private coreSettingsState: CoreSettingsState = createCoreSettingsState();
  private theme: ThemeMode = isThemeMode(window.__CONDUCTOR_INITIAL_THEME__)
    ? window.__CONDUCTOR_INITIAL_THEME__
    : "system";
  private activeMainPart: WorkbenchMainPart = resolveInitialMainPart(
    this.session.getSnapshot(),
  );
  private activeSecondaryView: SecondaryView = "export";
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
    super(undefined, options.layoutService);

    this.window = this._register(new WorkbenchWindow(parent, {
      ...options,
      titlebarState: createTitlebarState(options.titlebarState),
      showSkeleton: false,
    }));
    this._register(this.createNotificationsHandlers());
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
    if (!options.pathService) {
      throw new Error("Workbench requires IPathService.");
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
    this.pathService = options.pathService;
    this.viewsService = options.viewsService;
    this.tableService = options.tableService;
    this.templateApplyService = options.templateApplyService;
    this.templateService = options.templateService;
    this.templateImportController = new TemplateImportController(
      this.dialogsService,
      this.filesService,
      this.pathService,
    );
    this.templateApply = this._register(new TemplateApplyController({
      analysisFileService: this.analysisFileService,
      templateApplyService: this.templateApplyService,
      onExtractionError: () => undefined,
      showResults: () => this.showMainPart("chart"),
      setAnalysisResults: this.session.setAnalysisResults,
      setCleanedData: this.session.setCleanedData,
    }));
    this.templateApply.update(this.getTemplateApplyInput());
    this.filesPane = this._register(new FilesPaneHost(this.getFilesPaneProps()));
    this.table = getWorkbenchContribution<TableContribution>(TableContributionId);
    this.templateViewlet = this._register(new TemplateViewlet(this.getTemplateViewletProps()));
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

  private renderWorkbench(): void {
    const snapshot = this.session.getSnapshot();
    const tableModel = this.getTableModel(snapshot);
    this.templateApply.update(this.getTemplateApplyInput(snapshot, tableModel));

    this.filesPane.update(this.getFilesPaneProps(
      snapshot,
      tableModel,
      this.templateApply,
    ));
    this.table.update(this.getTableProps(tableModel));
    this.templateViewlet.update(this.getTemplateViewletProps(
      snapshot,
      tableModel,
      this.templateApply,
    ));
    this.analysis.update(this.getAnalysisProps(snapshot, this.templateApply));
    this.settings.update(this.getSettingsProps());
    this.updateViewContainers();
    this.renderSecondaryView(snapshot);
    this.setParts({
      sidebar: this.getViewContainerElement(WorkbenchViewContainers.files, this.filesPane.element),
      data: this.getViewContainerElement(
        WorkbenchViewContainers.main,
        this.activeMainPart === "chart" ? this.analysis.element : this.table.element,
      ),
      secondarySidebar: this.getViewContainerElement(
        WorkbenchViewContainers.secondary,
        this.activeMainPart === "chart" ? this.getActiveSecondaryElement() : this.templateViewlet.sidebarElement,
      ),
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

    for (const toast of notificationService.toasts) {
      showNotificationToast(toast);
    }

    disposables.add(notificationService.onDidChangeToast(event => {
      switch (event.kind) {
        case "show":
          showNotificationToast(event.options);
          break;
        case "hide":
          hideNotificationToast(event.id);
          break;
        case "dispose":
          disposeNotificationToast(event.id);
          break;
        case "disposeAll":
          disposeNotificationToasts();
          break;
      }
    }));

    disposables.add(toDisposable(() => disposeNotificationToasts()));
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
      onCloseWindow: () => closeWindow(),
      onMinimizeWindow: () => minimizeWindow(),
      onNavigateBack: () => this.navigateBack(),
      onNavigateForward: () => this.navigateForward(),
      onOpenSettings: () => this.navigateToView("settings"),
      onPageChange: (page) => this.handleMainPageAction(page),
      onToggleMaximizeWindow: () => toggleWindowMaximized(),
    };
  }

  private updateViewContainers(): void {
    this.viewsService.addViewToContainer(WorkbenchViewContainers.files, this.filesPane);
    if (this.table.view) {
      this.viewsService.addViewToContainer(WorkbenchViewContainers.main, this.table.view);
    }
    this.viewsService.addViewToContainer(WorkbenchViewContainers.main, this.analysis);
    this.viewsService.addViewToContainer(WorkbenchViewContainers.secondary, this.templateViewlet.sidebarView);
    this.viewsService.addViewToContainer(WorkbenchViewContainers.settings, this.settings);

    const isSettingsActive = this.activeView === "settings";
    const isWorkbenchActive = !isSettingsActive;
    const isAnalysisActive = this.activeMainPart === "chart";

    if (isWorkbenchActive) {
      void this.viewsService.openViewContainer(WorkbenchViewContainers.files);
      void this.viewsService.openViewContainer(WorkbenchViewContainers.main);
      void this.viewsService.openViewContainer(WorkbenchViewContainers.secondary);
      this.viewsService.closeViewContainer(WorkbenchViewContainers.settings);
    } else {
      this.viewsService.closeViewContainer(WorkbenchViewContainers.files);
      this.viewsService.closeViewContainer(WorkbenchViewContainers.main);
      this.viewsService.closeViewContainer(WorkbenchViewContainers.secondary);
      void this.viewsService.openViewContainer(WorkbenchViewContainers.settings);
    }

    this.viewsService.setViewVisible(this.filesPane.id, isWorkbenchActive);
    if (this.table.view) {
      this.viewsService.setViewVisible(this.table.view.id, isWorkbenchActive && !isAnalysisActive);
    }
    this.viewsService.setViewVisible(this.analysis.id, isWorkbenchActive && isAnalysisActive);
    this.updateSecondaryViewVisibility(isWorkbenchActive && isAnalysisActive);
    this.viewsService.setViewVisible(this.templateViewlet.sidebarView.id, isWorkbenchActive && !isAnalysisActive);
    this.viewsService.setViewVisible(this.settings.id, isSettingsActive);
    this.updateSecondaryViewActions(isWorkbenchActive && isAnalysisActive);
  }

  private updateSecondaryViewVisibility(visible: boolean): void {
    if (!visible) {
      this.closeSecondaryViews();
      return;
    }

    for (const view of secondaryViews) {
      if (view.id === this.activeSecondaryView) {
        void this.viewsService.openView(view.viewId);
      } else {
        this.viewsService.closeView(view.viewId);
      }
    }
  }

  private closeSecondaryViews(): void {
    for (const view of secondaryViews) {
      this.viewsService.closeView(view.viewId);
    }
  }

  private updateSecondaryViewActions(visible: boolean): void {
    const container = this.viewsService.getActiveViewPaneContainerWithId(WorkbenchViewContainers.secondary);
    if (!container) {
      return;
    }

    container.setTitle("");
    container.setActions(visible ? this.createSecondaryViewActions() : []);
  }

  private createSecondaryViewActions(): IAction[] {
    return secondaryViews.map(view => this.createSecondaryViewAction(view));
  }

  private createSecondaryViewAction(view: SecondaryViewDescriptor): IAction {
    const label = localize(view.labelKey, view.label);
    return toAction({
      id: `workbench.secondary.${view.id}`,
      label,
      tooltip: label,
      class: "secondary_view_switch_action",
      checked: this.activeSecondaryView === view.id,
      run: () => this.setActiveSecondaryView(view.id),
    });
  }

  private setActiveSecondaryView(view: SecondaryView): void {
    if (this.activeSecondaryView === view) {
      return;
    }

    this.activeSecondaryView = view;
    this.updateViewContainers();
    this.renderSecondaryView();
    this.layoutVisibleViewContainers();
  }

  private renderSecondaryView(snapshot = this.session.getSnapshot()): void {
    if (this.activeMainPart !== "chart" || this.activeView === "settings") {
      return;
    }

    const props = this.getSecondaryViewInput(snapshot);
    const activeFile = resolveActiveFile(props);

    switch (this.activeSecondaryView) {
      case "parameters":
        this.renderParametersView(activeFile);
        break;
      case "settings":
        this.viewsService.getViewWithId<ExportSettingsView>(OriginExportSettingsViewId)?.update({
          axisSettings: props.plotAxisSettings,
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

  private renderExportView(activeFile: ReturnType<typeof resolveActiveFile>): void {
    const view = this.viewsService.getViewWithId<ExportView>(ExportViewId);
    if (!view) {
      return;
    }

    if (!activeFile) {
      view.renderEmpty(localize("da_no_processed_data", "No Processed Data"));
      return;
    }

    this.syncCurveSelection(activeFile);
    view.render({
      curveOptions: createOriginCurveOptions(activeFile),
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
      scopedFileIds: activeFile.fileId ? [activeFile.fileId] : [],
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

  private renderParametersView(activeFile: ReturnType<typeof resolveActiveFile>): void {
    const view = this.viewsService.getViewWithId<ParametersView>(ParametersViewId);
    if (!view) {
      return;
    }

    if (!activeFile) {
      view.renderEmpty(localize("da_no_processed_data", "No Processed Data"));
      return;
    }

    view.renderParameters({
      gmMetricHeader: "gm",
      rows: createParameterRows(activeFile),
      showTransferMetrics: isTransferLikeFile(activeFile),
    });
  }

  private getActiveSecondaryElement(): HTMLElement | null {
    const descriptor = secondaryViews.find(view => view.id === this.activeSecondaryView);
    return descriptor
      ? this.viewsService.getViewWithId(descriptor.viewId)?.element ?? null
      : null;
  }

  private syncCurveSelection(activeFile: NonNullable<ReturnType<typeof resolveActiveFile>>): void {
    const curveKeys = new Set(
      createOriginCurveOptions(activeFile).map((option) => option.key),
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

  private handleMainPageAction(page: "data" | "analysis"): void {
    this.showMainPart(page === "analysis" ? "chart" : "table");
  }

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

    return {
      analysisFileService: this.analysisFileService,
      dialogsService: this.dialogsService,
      filesPaneRef: this.filesPaneRef,
      files: snapshot.sourceFiles,
      filesService: this.filesService,
      pathService: this.pathService,
      cleanedData: snapshot.cleanedData,
      onFileImported: sessionActions.handleFileImported,
      onFilesReplaced: sessionActions.handleFilesReplaced,
      onFileRemoved: sessionActions.handleFileRemoved,
      onFilesRemoved: sessionActions.handleFilesRemoved,
      onFileSelected: sessionActions.handleFileSelected,
      selectedFileId: snapshot.selectedPreviewFileId,
    };
  }

  private getTemplateViewletProps(
    snapshot = this.session.getSnapshot(),
    tableModel = this.getTableModel(snapshot),
    processing = this.templateApply,
  ) {
    return {
      analysisSettings: this.coreSettingsState.analysisSettings,
      contextMenuService: this.contextMenuService,
      importSessionElement: null,
      onTemplateApplied: processing.handleTemplateApplied,
      onTemplateAppliedIncremental: processing.handleTemplateAppliedIncremental,
      onUpdateSettings: this.coreSettingsState.handleUpdateAnalysisSettings,
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
      activeFileId: this.getActiveCleanedFileId(snapshot),
      onActiveFileIdChange: (nextFileId: string | null) => {
        this.session.setSelectedPreviewFileId(nextFileId);
      },
      cleanedData: snapshot.cleanedData,
      onPlotAxisSettingsChange: this.updatePlotAxisSettings,
      onOriginOpenPlotOptionsChange: this.updateOriginPlotOptions,
      originOpenPlotOptions: this.coreSettingsState.originOpenPlotOptions,
      plotAxisSettings: this.coreSettingsState.analysisSettings?.analysisPlotAxisSettings,
      processingStatus: processing.processingStatus,
      showFileSelect: false,
      shouldMountCharts: false,
    };
  }

  private getSecondaryViewInput(snapshot = this.session.getSnapshot()) {
    return {
      activeFileId: this.getActiveCleanedFileId(snapshot),
      cleanedData: snapshot.cleanedData,
      onPlotAxisSettingsChange: this.updatePlotAxisSettings,
      onOriginOpenPlotOptionsChange: this.updateOriginPlotOptions,
      originOpenPlotOptions: this.coreSettingsState.originOpenPlotOptions,
      plotAxisSettings: this.coreSettingsState.analysisSettings?.analysisPlotAxisSettings,
    };
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
    if (plotUpdates.command !== undefined) {
      settingsUpdates.originPlotCommandDefault = plotUpdates.command;
    }
    if (plotUpdates.postCommands !== undefined) {
      settingsUpdates.originPlotPostCommandsDefault = plotUpdates.postCommands;
    }
    if (plotUpdates.xyPairs !== undefined) {
      settingsUpdates.originPlotXyPairsDefault = plotUpdates.xyPairs;
    }

    await this.coreSettingsState.handleUpdateAnalysisSettings(settingsUpdates);
  };

  private readonly updatePlotAxisSettings = async (updates: unknown): Promise<void> => {
    if (!updates || typeof updates !== "object") {
      return;
    }

    await this.coreSettingsState.handleUpdateAnalysisSettings({
      analysisPlotAxisSettings: {
        ...(this.coreSettingsState.analysisSettings?.analysisPlotAxisSettings ?? {}),
        ...(updates as Record<string, unknown>),
      },
    });
  };

  private getActiveCleanedFileId(snapshot = this.session.getSnapshot()): string | null {
    const selectedFileId = snapshot.selectedPreviewFileId;
    if (
      selectedFileId &&
      snapshot.cleanedData.some(
        (file) => String(file?.fileId ?? "") === selectedFileId,
      )
    ) {
      return selectedFileId;
    }

    return snapshot.cleanedData[0]?.fileId ?? null;
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
      analysisSettings: state.analysisSettings,
      analysisSettingsLoaded: state.analysisSettingsLoaded,
      handleLanguageChange: state.handleLanguageChange,
      handleThemeChange: state.handleThemeChange,
      handleUpdateAnalysisSettings: state.handleUpdateAnalysisSettings,
      isWindowsDesktopShell: windowState.isWindowsDesktopShell,
      language: this.languagePreference,
      mergeAnalysisSettings: state.mergeAnalysisSettings,
      theme: this.theme,
    };
  }

  private getCoreSettingsOptions() {
    return {
      language: this.languagePreference,
      setGmDiagnosticsEnabled: () => undefined,
      setAppearance: this.setAppearance,
      setIonIoffMethod: () => undefined,
      setLanguage: this.setLanguage,
      setSsDiagnosticsEnabled: () => undefined,
      setSsMethod: () => undefined,
      setSsShowFitLine: () => undefined,
      setTheme: this.setTheme,
      setVthDiagnosticsEnabled: () => undefined,
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

  private readonly setLanguage = (preference: LanguagePreference): void => {
    const language = resolveLanguageCode(preference, getSystemLanguage());
    if (this.languagePreference === preference && this.language === language) {
      return;
    }

    this.languagePreference = preference;
    this.language = language;
    window.__CONDUCTOR_INITIAL_LANGUAGE__ = language;
    document.documentElement.setAttribute(
      "lang",
      language === "zh" ? "zh-CN" : "en",
    );
    applyLanguage(language);
    this.coreSettingsController?.update(this.getCoreSettingsOptions());
    this.renderWorkbench();
  };

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
