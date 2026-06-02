import {
  DisposableStore,
  toDisposable,
  type IDisposable,
} from "src/cs/base/common/lifecycle";
import { layoutService } from "src/cs/workbench/services/layout/browser/layoutService";
import type {
  LanguageCode,
  TranslateFn,
} from "src/cs/platform/language/common/language";
import type { IFileDialogService } from "src/cs/platform/dialogs/common/dialogs";
import type { IFileService } from "src/cs/platform/files/common/files";
import type { IPathService } from "src/cs/workbench/services/path/common/pathService";
import { isLanguageCode } from "src/cs/platform/language/common/language";
import {
  createNLSConfiguration,
  createTranslateFn,
  setNLSConfiguration,
} from "src/cs/nls";
import type { ThemeMode } from "src/cs/workbench/common/theme";
import { Layout, type LayoutView } from "src/cs/workbench/browser/layout";
import type { WorkbenchTitlebarProps } from "src/cs/workbench/browser/parts/titlebar/titlebarPart";
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
import ChartPreviewViewPane from "src/cs/workbench/contrib/chartPreview/browser/chartPreviewViewPane";
import TemplateEditorPane from "src/cs/workbench/contrib/template/browser/templateEditorPane";
import { getWorkbenchContribution } from "src/cs/workbench/common/contributions";
import type { TableContribution } from "src/cs/workbench/contrib/table/browser/table.contribution";
import { TableContributionId } from "src/cs/workbench/contrib/table/common/table";
import { FilesPaneHost } from "src/cs/workbench/contrib/files/browser/filesPaneHost";
import type { FilesPaneRef } from "src/cs/workbench/contrib/files/common/files";
import {
  TemplateApplyController,
  type TemplateApplyControllerInput,
} from "src/cs/workbench/contrib/template/browser/templateApplyController";
import { SessionModel } from "src/cs/workbench/contrib/session/sessionModel";
import { defaultSessionModel } from "src/cs/workbench/contrib/session/useSession";
import { createSessionActions } from "src/cs/workbench/contrib/session/useSessionActions";
import type {
  ITableService,
  TableModel,
} from "src/cs/workbench/contrib/table/common/tableService";
import {
  CoreSettingsController,
  createCoreSettingsState,
  type CoreSettingsState,
} from "src/cs/workbench/contrib/settings/browser/coreSettingsController";
import { SettingsViewPane } from "src/cs/workbench/contrib/settings/browser/settingsViewPane";
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
} from "src/cs/workbench/browser/parts/notifications/notificationsCommands";

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
  readonly t: TranslateFn;
  readonly updateVersion?: string | null;
  readonly isUpdateReadyToInstall?: boolean;
  readonly onInstallUpdate?: () => void;
};

export type WorkbenchOptions = {
  readonly className?: string;
  readonly dialogsService?: IFileDialogService;
  readonly filesService?: IFileService;
  readonly pathService?: IPathService;
  readonly id?: string;
  readonly showDesktopCommandBar?: boolean;
  readonly showSkeleton?: boolean;
  readonly style?: WorkbenchStyle;
  readonly tableService?: ITableService;
  readonly titlebarState?: WorkbenchTitlebarState;
};

export const createTitlebarState = (
  state: WorkbenchTitlebarState | undefined,
): WorkbenchTitlebarProps | undefined =>
  state && state.enabled !== false
    ? {
        id: layoutService.elements.titlebarCommandBar,
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
        t: state.t,
        updateAction: {
          isVisible: Boolean(state.isUpdateReadyToInstall),
          isReadyToInstall: state.isUpdateReadyToInstall,
          version: state.updateVersion,
          onClick: state.onInstallUpdate,
        },
      }
    : undefined;

const createTranslator = (): TranslateFn => {
  const language = isLanguageCode(window.__CONDUCTOR_INITIAL_LANGUAGE__)
    ? window.__CONDUCTOR_INITIAL_LANGUAGE__
    : "en";
  setNLSConfiguration(createNLSConfiguration(language));
  return createTranslateFn(language);
};

export class Workbench extends Layout {
  private readonly window: WorkbenchWindow;
  private t = createTranslator();
  private readonly filesPaneRef: { current: FilesPaneRef | null } = { current: null };
  private readonly session = defaultSessionModel;
  private readonly filesPane: FilesPaneHost;
  private readonly table: TableContribution;
  private readonly templateEditor: TemplateEditorPane;
  private readonly analysis: ChartPreviewViewPane;
  private readonly settings: SettingsViewPane;
  private readonly templateApply: TemplateApplyController;
  private readonly dialogsService: IFileDialogService;
  private readonly filesService: IFileService;
  private readonly pathService: IPathService;
  private readonly tableService: ITableService;
  private readonly coreSettingsController: CoreSettingsController;
  private coreSettingsState: CoreSettingsState = createCoreSettingsState();
  private language: LanguageCode = isLanguageCode(window.__CONDUCTOR_INITIAL_LANGUAGE__)
    ? window.__CONDUCTOR_INITIAL_LANGUAGE__
    : "en";
  private theme: ThemeMode = isThemeMode(window.__CONDUCTOR_INITIAL_THEME__)
    ? window.__CONDUCTOR_INITIAL_THEME__
    : "system";

  public get contentElement(): HTMLElement {
    return this.window.contentElement;
  }

  constructor(parent: HTMLElement, options: WorkbenchOptions = {}) {
    super();

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
    if (!options.filesService) {
      throw new Error("Workbench requires IFileService.");
    }
    if (!options.dialogsService) {
      throw new Error("Workbench requires IFileDialogService.");
    }
    if (!options.pathService) {
      throw new Error("Workbench requires IPathService.");
    }
    this.filesService = options.filesService;
    this.dialogsService = options.dialogsService;
    this.pathService = options.pathService;
    this.tableService = options.tableService;
    this.templateApply = this._register(new TemplateApplyController({
      onExtractionError: () => undefined,
      setActivePage: (page) => {
        if (page === "data" || page === "analysis" || page === "settings") {
          this.navigateToView(page);
        }
      },
      setProcessedData: this.session.setProcessedData,
    }));
    this.templateApply.update(this.getTemplateApplyInput());
    this.filesPane = this._register(new FilesPaneHost(this.getFilesPaneProps()));
    this.table = getWorkbenchContribution<TableContribution>(TableContributionId);
    this.templateEditor = this._register(new TemplateEditorPane(this.getTemplateEditorProps()));
    this.analysis = this._register(new ChartPreviewViewPane(this.getAnalysisProps()));
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
    this.templateEditor.update(this.getTemplateEditorProps(
      snapshot,
      tableModel,
      this.templateApply,
    ));
    this.analysis.update(this.getAnalysisProps(snapshot, this.templateApply));
    this.settings.update(this.getSettingsProps());
    this.setParts({
      sidebar: this.filesPane.element,
      data: this.table.element,
      secondarySidebar: this.templateEditor.sidebarElement,
      analysis: this.analysis.element,
      settings: this.settings.element,
    });
    this.window.update({
      id: "analysis-page",
      className: "workbench_root",
      showDesktopCommandBar: getWorkbenchWindowState().isDesktopChromePreviewEnabled,
      showSkeleton: false,
      titlebarState: createTitlebarState(this.getTitlebarState()),
    });
  }

  protected override onDidRenderLayout(): void {
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
    return {
      activePage: state.activeView,
      canNavigateBack: state.layoutState.canNavigateBack,
      canNavigateForward: state.layoutState.canNavigateForward,
      enabled: getWorkbenchWindowState().isDesktopChromePreviewEnabled,
      onCloseWindow: () => closeWindow(),
      onMinimizeWindow: () => minimizeWindow(),
      onNavigateBack: () => this.navigateBack(),
      onNavigateForward: () => this.navigateForward(),
      onOpenSettings: () => this.navigateToView("settings"),
      onPageChange: (page) => this.navigateToView(page),
      onToggleMaximizeWindow: () => toggleWindowMaximized(),
      t: this.t,
    };
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
      previewLoadingMessage: this.t("preview_loading"),
      processedData: snapshot.processedData,
      processingStatus: processing.processingStatus,
      rawData: snapshot.rawData,
      removeQueuedProcessingFile: processing.removeQueuedProcessingFile,
      resetPreviewWorker: tableModel.resetWorker,
      resetProcessingWorker: processing.resetProcessingWorker,
      selectedPreviewFileId: snapshot.selectedPreviewFileId,
      setIonIoffManualTargetsByFileId: this.session.setIonIoffManualTargetsByFileId,
      setProcessedData: this.session.setProcessedData,
      setPreviewStatus: this.session.setPreviewStatus,
      setRawData: this.session.setRawData,
      setSelectedPreviewFileId: this.session.setSelectedPreviewFileId,
      setSsManualRanges: this.session.setSsManualRanges,
    });

    return {
      dialogsService: this.dialogsService,
      filesPaneRef: this.filesPaneRef,
      files: snapshot.rawData,
      filesService: this.filesService,
      pathService: this.pathService,
      onFileImported: sessionActions.handleFileImported,
      onFilesReplaced: sessionActions.handleFilesReplaced,
      onFileRemoved: sessionActions.handleFileRemoved,
      onFileSelected: sessionActions.handleFileSelected,
      selectedFileId: snapshot.selectedPreviewFileId,
      t: this.t,
    };
  }

  private getTemplateEditorProps(
    snapshot = this.session.getSnapshot(),
    tableModel = this.getTableModel(snapshot),
    processing = this.templateApply,
  ) {
    return {
      analysisSettings: this.coreSettingsState.analysisSettings,
      importSessionElement: null,
      onTemplateApplied: processing.handleTemplateApplied,
      onTemplateAppliedIncremental: processing.handleTemplateAppliedIncremental,
      onUpdateSettings: this.coreSettingsState.handleUpdateAnalysisSettings,
      rawData: snapshot.rawData,
      tableModel,
      t: this.t,
    };
  }

  private getTableProps(tableModel = this.getTableModel()) {
    return {
      tableModel,
      tableState: tableModel.getState(),
      t: this.t,
    };
  }

  private getAnalysisProps(
    snapshot = this.session.getSnapshot(),
    processing = this.templateApply,
  ) {
    return {
      activeFileId: snapshot.processedData[0]?.fileId ?? null,
      processedData: snapshot.processedData,
      processingStatus: processing.processingStatus,
      shouldMountCharts: false,
      t: this.t,
    };
  }

  private getTableModel(snapshot = this.session.getSnapshot()) {
    return this.tableService.update({
      cacheFileIdRef: this.session.previewCacheFileIdRef,
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
      rawData: snapshot.rawData,
      selectedFileId: snapshot.selectedPreviewFileId,
      setFile: this.session.setPreviewFile,
      setLoadState: this.session.setPreviewStatus,
      setSelectedFileId: this.session.setSelectedPreviewFileId,
      t: this.t,
    });
  }

  private getTemplateApplyInput(
    snapshot = this.session.getSnapshot(),
    tableModel: TableModel = this.getTableModel(snapshot),
  ): TemplateApplyControllerInput {
    return {
      activeFileId: snapshot.processedData[0]?.fileId ?? null,
      getTableRow: tableModel.getRow,
      hasRawDataFile: tableModel.hasRawDataFile,
      previewFile: snapshot.previewFile,
      processedData: snapshot.processedData,
      rawData: snapshot.rawData,
      t: this.t as any,
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
      language: this.language,
      mergeAnalysisSettings: state.mergeAnalysisSettings,
      t: this.t as any,
      theme: this.theme,
    };
  }

  private getCoreSettingsOptions() {
    return {
      language: this.language,
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

  private readonly setLanguage = (language: LanguageCode): void => {
    if (this.language === language) {
      return;
    }

    this.language = language;
    window.__CONDUCTOR_INITIAL_LANGUAGE__ = language;
    setNLSConfiguration(createNLSConfiguration(language));
    document.documentElement.setAttribute(
      "lang",
      language === "zh" ? "zh-CN" : "en",
    );
    this.t = createTranslator();
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
