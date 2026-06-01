import { toDisposable } from "src/cs/base/common/lifecycle";
import { layoutService } from "src/cs/workbench/services/layout/browser/layoutService";
import type {
  LanguageCode,
  TranslateFn,
} from "src/cs/platform/language/common/language";
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
  getWorkbenchWindowState,
  WorkbenchWindow,
} from "src/cs/workbench/browser/window";
import ChartPreviewViewPane from "src/cs/workbench/contrib/chartPreview/browser/chartPreviewViewPane";
import DataViewPane from "src/cs/workbench/contrib/data/browser/dataViewPane";
import { ImporterViewletHost } from "src/cs/workbench/contrib/import/browser/importerViewletHost";
import type { ImporterRef } from "src/cs/workbench/contrib/import/common/types";
import { useProcessing } from "src/cs/workbench/contrib/data/useProcessing";
import { SessionModel } from "src/cs/workbench/contrib/session/sessionModel";
import { defaultSessionModel } from "src/cs/workbench/contrib/session/useSession";
import { createSessionActions } from "src/cs/workbench/contrib/session/useSessionActions";
import { usePreview } from "src/cs/workbench/contrib/tablePreview/usePreview";
import {
  CoreSettingsController,
  createCoreSettingsState,
  type CoreSettingsState,
} from "src/cs/workbench/contrib/settings/browser/coreSettingsController";
import { SettingsViewPane } from "src/cs/workbench/contrib/settings/browser/settingsViewPane";

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
  readonly id?: string;
  readonly showDesktopCommandBar?: boolean;
  readonly showSkeleton?: boolean;
  readonly style?: WorkbenchStyle;
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
  private readonly importerRef: { current: ImporterRef | null } = { current: null };
  private readonly session = defaultSessionModel;
  private readonly importer: ImporterViewletHost;
  private readonly data: DataViewPane;
  private readonly analysis: ChartPreviewViewPane;
  private readonly settings: SettingsViewPane;
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
    this._register(toDisposableSession(this.session));
    this.mount(this.window.contentElement);
    this.importer = this._register(new ImporterViewletHost(this.getImporterProps()));
    this.data = this._register(new DataViewPane(this.getDataProps()));
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
    const previewBindings = this.getPreviewBindings(snapshot);
    const processingBindings = this.getProcessingBindings(snapshot, previewBindings);

    this.importer.update(this.getImporterProps(
      snapshot,
      previewBindings,
      processingBindings,
    ));
    this.data.update(this.getDataProps(
      snapshot,
      previewBindings,
      processingBindings,
    ));
    this.analysis.update(this.getAnalysisProps(snapshot, processingBindings));
    this.settings.update(this.getSettingsProps());
    this.setParts({
      sidebar: this.importer.element,
      data: this.data.element,
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

  private getTitlebarState(): WorkbenchTitlebarState {
    const state = this.state;
    return {
      activePage: state.activeView,
      canNavigateBack: state.layoutState.canNavigateBack,
      canNavigateForward: state.layoutState.canNavigateForward,
      enabled: getWorkbenchWindowState().isDesktopChromePreviewEnabled,
      onCloseWindow: () => this.sendDesktopCommand("close-window"),
      onMinimizeWindow: () => this.sendDesktopCommand("minimize-window"),
      onNavigateBack: () => this.navigateBack(),
      onNavigateForward: () => this.navigateForward(),
      onOpenSettings: () => this.navigateToView("settings"),
      onPageChange: (page) => this.navigateToView(page),
      onToggleMaximizeWindow: () => this.sendDesktopCommand("toggle-maximize-window"),
      t: this.t,
    };
  }

  private sendDesktopCommand(command: string): void {
    window.desktopApp?.sendCommand(command);
  }

  private getImporterProps(
    snapshot = this.session.getSnapshot(),
    previewBindings = this.getPreviewBindings(snapshot),
    processingBindings = this.getProcessingBindings(snapshot, previewBindings),
  ) {
    const sessionActions = createSessionActions({
      clearPreviewState: previewBindings.clearPreviewState,
      disposePreviewFileCache: previewBindings.disposePreviewFileCache,
      invalidatePreviewRequests: previewBindings.invalidatePreviewRequests,
      previewFile: snapshot.previewFile,
      processedData: snapshot.processedData,
      processingStatus: processingBindings.processingStatus,
      rawData: snapshot.rawData,
      removeQueuedProcessingFile: processingBindings.removeQueuedProcessingFile,
      resetPreviewWorker: previewBindings.resetPreviewWorker,
      resetProcessingWorker: processingBindings.resetProcessingWorker,
      selectedPreviewFileId: snapshot.selectedPreviewFileId,
      setIonIoffManualTargetsByFileId: this.session.setIonIoffManualTargetsByFileId,
      setProcessedData: this.session.setProcessedData,
      setRawData: this.session.setRawData,
      setSelectedPreviewFileId: this.session.setSelectedPreviewFileId,
      setSsManualRanges: this.session.setSsManualRanges,
    });

    return {
      hasSessionData: sessionActions.hasSessionData,
      importerRef: this.importerRef,
      onClearSession: sessionActions.handleClearSession,
      onDataImported: sessionActions.handleDataImported,
      onDataRemoved: sessionActions.handleDataRemoved,
      onFileSelected: previewBindings.handlePreviewFileSelected,
      onImportTrigger: () => this.importerRef.current?.openFileDialog(),
      rawData: snapshot.rawData,
      selectedPreviewFileId: snapshot.selectedPreviewFileId,
      t: this.t,
    };
  }

  private getDataProps(
    snapshot = this.session.getSnapshot(),
    previewBindings = this.getPreviewBindings(snapshot),
    processingBindings = this.getProcessingBindings(snapshot, previewBindings),
  ) {
    return {
      analysisSettings: this.coreSettingsState.analysisSettings,
      ensurePreviewCells: previewBindings.ensurePreviewCells,
      ensurePreviewRows: previewBindings.ensurePreviewRows,
      getPreviewRow: previewBindings.getPreviewRow,
      getPreviewRowsVersion: previewBindings.getPreviewRowsVersion,
      importerElement: null,
      onTemplateApplied: processingBindings.handleTemplateApplied,
      onTemplateAppliedIncremental: processingBindings.handleTemplateAppliedIncremental,
      onUpdateSettings: this.coreSettingsState.handleUpdateAnalysisSettings,
      previewFile: snapshot.previewFile,
      previewStatus: snapshot.previewStatus,
      rawData: snapshot.rawData,
      subscribePreviewRowsVersion: previewBindings.subscribePreviewRowsVersion,
      t: this.t,
    };
  }

  private getAnalysisProps(
    snapshot = this.session.getSnapshot(),
    processingBindings = this.getProcessingBindings(snapshot),
  ) {
    return {
      activeFileId: snapshot.processedData[0]?.fileId ?? null,
      processedData: snapshot.processedData,
      processingStatus: processingBindings.processingStatus,
      shouldMountCharts: false,
      t: this.t,
    };
  }

  private getPreviewBindings(snapshot = this.session.getSnapshot()) {
    return usePreview({
      previewCacheFileIdRef: this.session.previewCacheFileIdRef,
      previewCacheFileLruRef: this.session.previewCacheFileLruRef,
      previewFile: snapshot.previewFile,
      previewLoadedChunksByFileIdRef: this.session.previewLoadedChunksByFileIdRef,
      previewLoadedChunksRef: this.session.previewLoadedChunksRef,
      previewRequestIdRef: this.session.previewRequestIdRef,
      previewRowsCacheByFileIdRef: this.session.previewRowsCacheByFileIdRef,
      previewRowsCacheRef: this.session.previewRowsCacheRef,
      previewRowsRequestIdRef: this.session.previewRowsRequestIdRef,
      previewRowsRequestsRef: this.session.previewRowsRequestsRef,
      previewWorkerRef: this.session.previewWorkerRef,
      rawData: snapshot.rawData,
      selectedPreviewFileId: snapshot.selectedPreviewFileId,
      setPreviewFile: this.session.setPreviewFile,
      setPreviewStatus: this.session.setPreviewStatus,
      setSelectedPreviewFileId: this.session.setSelectedPreviewFileId,
      t: this.t,
    });
  }

  private getProcessingBindings(
    snapshot = this.session.getSnapshot(),
    previewBindings = this.getPreviewBindings(snapshot),
  ) {
    return useProcessing({
      activeFileId: snapshot.processedData[0]?.fileId ?? null,
      getPreviewRow: previewBindings.getPreviewRow,
      onExtractionError: () => undefined,
      previewFile: snapshot.previewFile,
      processedData: snapshot.processedData,
      rawData: snapshot.rawData,
      rawDataByIdRef: previewBindings.rawDataByIdRef,
      setActivePage: (page) => {
        if (page === "data" || page === "analysis" || page === "settings") {
          this.navigateToView(page);
        }
      },
      setProcessedData: this.session.setProcessedData,
      t: this.t as any,
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
