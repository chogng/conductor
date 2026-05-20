import {
  useCallback,
  useEffect,
  lazy,
  useRef,
  useState,
  Suspense,
} from "react";
import ScrollArea from "src/cs/base/browser/ui/ScrollArea/ScrollArea";
import Toast from "src/cs/base/browser/ui/Toast/Toast";
import type { TranslationVars } from "src/cs/platform/language/common/language";
import { loadAnalysisCharts } from "src/cs/workbench/contrib/chartPreview/loadAnalysisCharts";
import { getExtractionErrorMessage } from "src/cs/workbench/common/deviceAnalysis/utils";
import DataPart from "src/cs/workbench/contrib/deviceAnalysis/data/DataPart";
import type { CsvImporterRef } from "src/cs/workbench/contrib/import/CsvImporter";
import {
  getLayoutState,
  getViewPaneClassName,
} from "src/cs/workbench/contrib/deviceAnalysis/layoutPolicy";
import WorkspaceShell from "src/cs/workbench/contrib/deviceAnalysis/WorkspaceShell";
import { useLanguage } from "src/cs/workbench/browser/hooks/useLanguage";
import { useTheme } from "src/cs/workbench/browser/hooks/useTheme";
import type { ToastType } from "src/cs/workbench/common/deviceAnalysis/sharedTypes";
import { useExports } from "src/cs/workbench/contrib/dataExport/useExports";
import { useDesktopShell } from "src/cs/workbench/contrib/deviceAnalysis/desktop/useDesktopShell";
import {
  createIdleOnboardingState,
  getAnalysisShellFlags,
  INITIAL_PAGE_NAVIGATION_STATE,
  isPageTab,
  navigateBackPageNavigation,
  navigateForwardPageNavigation,
  navigatePageNavigation,
  type OnboardingControllerState,
  type PageTab,
  type PageNavigationState,
  type ProcessingExtractionError,
} from "src/cs/workbench/contrib/deviceAnalysis/pageState";
import { usePreview } from "src/cs/workbench/contrib/tablePreview/usePreview";
import { useProcessing } from "src/cs/workbench/contrib/deviceAnalysis/data/useProcessing";
import { loadOnboarding } from "src/cs/workbench/contrib/deviceAnalysis/onboarding/loadOnboarding";
import { loadOnboardingController } from "src/cs/workbench/contrib/deviceAnalysis/onboarding/loadOnboardingController";
import { useAnalysisSelectionState } from "src/cs/workbench/contrib/deviceAnalysis/useAnalysisSelectionState";
import { useOnboardingLauncher } from "src/cs/workbench/contrib/deviceAnalysis/useOnboardingLauncher";
import { useSession } from "src/cs/workbench/contrib/deviceAnalysis/session/useSession";
import { useSessionActions } from "src/cs/workbench/contrib/deviceAnalysis/session/useSessionActions";
import { useCoreSettings } from "src/cs/workbench/contrib/deviceAnalysis/settings/useCoreSettings";

declare global {
  interface Window {
    desktopMeta?: {
      isDesktop?: boolean;
      platform?: string;
      isPackaged?: boolean;
      appVersion?: string | null;
      [key: string]: unknown;
    };
  }
}

const AnalysisPanel = lazy(
  () => import("src/cs/workbench/contrib/chartPreview/AnalysisPanel"),
);
const SettingsPanelContainer = lazy(
  () => import("./settings/SettingsPanelContainer"),
);
const OnboardingControllerHost = lazy(
  loadOnboardingController,
);
const Onboarding = lazy(loadOnboarding);
const DeferredPanelFallback = ({ label }: { label: string }) => (
  <div className="flex h-full w-full items-center justify-center rounded-[20px] border border-border bg-bg-surface/60 text-sm text-text-secondary">
    {label}
  </div>
);

const Page = () => {
  const { t, language, setLanguage } = useLanguage();
  const { theme, setTheme } = useTheme();
  const tLoose = useCallback(
    (key: string, vars?: Record<string, unknown>) =>
      t(key, vars as TranslationVars | undefined),
    [t],
  );
  const {
    desktopMeta,
    isAppUpdatePreviewEnabled,
    isDesktopChromePreviewEnabled,
    isPackagedWindowsDesktopShell,
    isWindowsDesktopShell,
  } = getAnalysisShellFlags();

  const session = useSession();
  const {
    rawData,
    setRawData,
    selectedPreviewFileId,
    setSelectedPreviewFileId,
    processedData,
    setProcessedData,
    templateConfig,
    setTemplateConfig,
    ionIoffMethod,
    setIonIoffMethod,
    ionIoffManualTargetsByFileId,
    setIonIoffManualTargetsByFileId,
    ssMethod,
    setSsMethod,
    ssDiagnosticsEnabled,
    setSsDiagnosticsEnabled,
    vthDiagnosticsEnabled,
    setVthDiagnosticsEnabled,
    gmDiagnosticsEnabled,
    setGmDiagnosticsEnabled,
    ssShowFitLine,
    setSsShowFitLine,
    ssManualRanges,
    setSsManualRanges,
    previewFile,
    setPreviewFile,
    previewStatus,
    setPreviewStatus,
    previewWorkerRef,
    previewRequestIdRef,
    previewRowsRequestIdRef,
    previewRowsRequestsRef,
    previewRowsCacheByFileIdRef,
    previewLoadedChunksByFileIdRef,
    previewRowsCacheRef,
    previewLoadedChunksRef,
    previewCacheFileIdRef,
    previewCacheFileLruRef,
  } = session;

  const importerRef = useRef<CsvImporterRef | null>(null);
  const [onboarding, setOnboarding] = useState<OnboardingControllerState>(() =>
    createIdleOnboardingState(importerRef),
  );
  const handleOnboardingStateChange = useCallback(
    (nextState: OnboardingControllerState) => {
      setOnboarding((prevState) => {
        if (
          prevState.isOpen === nextState.isOpen &&
          prevState.canNext === nextState.canNext &&
          prevState.stepIndex === nextState.stepIndex &&
          prevState.steps === nextState.steps &&
          prevState.back === nextState.back &&
          prevState.close === nextState.close &&
          prevState.handleImportTrigger === nextState.handleImportTrigger &&
          prevState.handleOpenOrigin === nextState.handleOpenOrigin &&
          prevState.next === nextState.next &&
          prevState.open === nextState.open
        ) {
          return prevState;
        }

        return nextState;
      });
    },
    [],
  );
  const handleOnboardingControllerStateChange = useCallback(
    (nextState: OnboardingControllerState) => {
      handleOnboardingStateChange(nextState);
      if (nextState.isOpen) {
        setPendingOnboardingOpenMode(null);
      }
    },
    [handleOnboardingStateChange],
  );
  const [pageNavigation, setPageNavigation] = useState<PageNavigationState>(
    INITIAL_PAGE_NAVIGATION_STATE,
  );
  const [hasVisitedAnalysisPage, setHasVisitedAnalysisPage] = useState(false);
  const [hasVisitedSettingsPage, setHasVisitedSettingsPage] = useState(false);
  const [analysisPanelSessionKey, setAnalysisPanelSessionKey] = useState(0);
  const [extractionErrorToast, setExtractionErrorToast] = useState<{
    isVisible: boolean;
    message: string;
    type: ToastType;
  }>({
    isVisible: false,
    message: "",
    type: "error",
  });
  const activePage = pageNavigation.activePage;

  useEffect(() => {
    if (activePage === "analysis") {
      setHasVisitedAnalysisPage(true);
    }
    if (activePage === "settings") {
      setHasVisitedSettingsPage(true);
    }

    if (typeof document !== "undefined") {
      const activeElement = document.activeElement;
      if (
        activeElement &&
        activeElement instanceof HTMLElement &&
        typeof activeElement.blur === "function"
      ) {
        activeElement.blur();
      }
    }
  }, [activePage]);

  const navigateToPage = useCallback((nextPage: PageTab) => {
    setPageNavigation((prevState) =>
      navigatePageNavigation(prevState, nextPage),
    );
  }, []);

  const handleNavigateBack = useCallback(() => {
    setPageNavigation((prevState) => navigateBackPageNavigation(prevState));
  }, []);

  const handleNavigateForward = useCallback(() => {
    setPageNavigation((prevState) => navigateForwardPageNavigation(prevState));
  }, []);

  const handleAnalysisIntent = useCallback(() => {
    void loadAnalysisCharts();
  }, []);

  useEffect(() => {
    if (hasVisitedAnalysisPage || processedData.length === 0) return undefined;

    const prefetch = () => {
      void loadAnalysisCharts();
    };

    if (
      typeof window !== "undefined" &&
      typeof window.requestIdleCallback === "function"
    ) {
      const idleId = window.requestIdleCallback(prefetch, { timeout: 1200 });
      return () => {
        if (typeof window.cancelIdleCallback === "function") {
          window.cancelIdleCallback(idleId);
        }
      };
    }

    const timeoutId = window.setTimeout(prefetch, 300);
    return () => window.clearTimeout(timeoutId);
  }, [hasVisitedAnalysisPage, processedData.length]);

  const getProcessingExtractionErrorMessage = useCallback(
    (error: ProcessingExtractionError) =>
      getExtractionErrorMessage(tLoose, {
        message: error?.message,
        messageKey:
          typeof error?.messageKey === "string" ? error.messageKey : undefined,
        messageParams:
          error?.messageParams && typeof error.messageParams === "object"
            ? error.messageParams
            : undefined,
      }),
    [tLoose],
  );

  const handleProcessingExtractionError = useCallback(
    (error: ProcessingExtractionError) => {
      const fileName =
        typeof error?.fileName === "string" && error.fileName.trim()
          ? `${error.fileName}: `
          : "";
      const message = getProcessingExtractionErrorMessage(error);
      if (!message) return;

      setExtractionErrorToast({
        isVisible: true,
        message: `${fileName}${message}`,
        type: "error",
      });
    },
    [getProcessingExtractionErrorMessage],
  );

  const {
    clearPreviewState,
    disposePreviewFileCache,
    ensurePreviewCells,
    ensurePreviewRows,
    getPreviewRow,
    getPreviewRowsVersion,
    handlePreviewFileSelected,
    invalidatePreviewRequests,
    rawDataByIdRef,
    resetPreviewWorker,
    subscribePreviewRowsVersion,
  } = usePreview({
    previewCacheFileIdRef,
    previewCacheFileLruRef,
    previewFile,
    previewLoadedChunksByFileIdRef,
    previewLoadedChunksRef,
    previewRequestIdRef,
    previewRowsCacheByFileIdRef,
    previewRowsCacheRef,
    previewRowsRequestIdRef,
    previewRowsRequestsRef,
    previewWorkerRef,
    rawData,
    selectedPreviewFileId,
    setPreviewFile,
    setPreviewStatus,
    setSelectedPreviewFileId,
    t: tLoose,
  });

  const {
    analysisSettings,
    analysisSettingsLoaded,
    handleLanguageChange,
    handleThemeChange,
    handleUpdateAnalysisSettings,
    mergeAnalysisSettings,
    originOpenPlotOptions,
  } = useCoreSettings({
    language,
    setIonIoffMethod,
    setLanguage,
    theme,
    setTheme,
    setGmDiagnosticsEnabled,
    setSsDiagnosticsEnabled,
    setVthDiagnosticsEnabled,
    setSsMethod,
    setSsShowFitLine,
    t: tLoose,
  });
  const prefetchOnboarding = useCallback(() => {
    void loadOnboardingController();
    void loadOnboarding();
  }, []);
  const {
    analysisActiveFileId,
    analysisFileOptions,
    handleAnalysisFileChange,
    setAnalysisActiveFileId,
  } = useAnalysisSelectionState({
    analysisSettings,
    analysisSettingsLoaded,
    handleUpdateAnalysisSettings,
    ionIoffManualTargetsByFileId,
    processedData,
    setIonIoffManualTargetsByFileId,
  });
  const {
    handleOpenOnboardingGuide,
    hasOnboardingSessionData,
    pendingOnboardingOpenMode,
    setPendingOnboardingOpenMode,
    shouldMountOnboardingController,
  } = useOnboardingLauncher({
    analysisSettings,
    onboardingIsOpen: onboarding.isOpen,
    prefetchOnboarding,
    processedDataCount: processedData.length,
    rawDataCount: rawData.length,
  });
  const {
    handleTemplateApplied,
    handleTemplateAppliedIncremental,
    processingStatus,
    removeQueuedProcessingFile,
    resetProcessingWorker,
  } = useProcessing({
    activeFileId: analysisActiveFileId,
    getPreviewRow,
    previewFile,
    processedData,
    rawData,
    rawDataByIdRef,
    onExtractionError: handleProcessingExtractionError,
    setActivePage: (page: string) => {
      if (page === "data" || page === "analysis" || page === "settings") {
        navigateToPage(page);
      }
    },
    setProcessedData,
    t: tLoose,
  });

  const { handleExport } = useExports({
    processedData,
    ssManualRanges,
    ssMethod,
  });

  const {
    handleClearSession,
    handleDataImported,
    handleDataRemoved,
    hasSessionData,
  } = useSessionActions({
    clearPreviewState,
    disposePreviewFileCache,
    invalidatePreviewRequests,
    previewFile,
    processedData,
    processingStatus,
    rawData,
    removeQueuedProcessingFile,
    resetPreviewWorker,
    resetProcessingWorker,
    selectedPreviewFileId,
    setProcessedData,
    setRawData,
    setSelectedPreviewFileId,
    setIonIoffManualTargetsByFileId,
    setSsManualRanges,
  });
  const hadOnboardingSessionDataRef = useRef(hasOnboardingSessionData);

  const layoutState = getLayoutState({
    activeView: activePage,
    hasVisitedAnalysisView: hasVisitedAnalysisPage,
    hasVisitedSettingsView: hasVisitedSettingsPage,
    historyIndex: pageNavigation.historyIndex,
    historyLength: pageNavigation.history.length,
  });
  const dataPane = layoutState.panes.data;
  const analysisPane = layoutState.panes.analysis;
  const settingsPane = layoutState.panes.settings;

  const handlePageTabSelect = useCallback((nextPage: string) => {
    if (!isPageTab(nextPage)) {
      return;
    }

    navigateToPage(nextPage);
  }, [navigateToPage]);

  useEffect(() => {
    const hadOnboardingSessionData = hadOnboardingSessionDataRef.current;
    hadOnboardingSessionDataRef.current = hasOnboardingSessionData;
    if (!hadOnboardingSessionData || hasOnboardingSessionData) {
      return;
    }

    setAnalysisPanelSessionKey((prev) => prev + 1);
    setAnalysisActiveFileId(null);
    setHasVisitedAnalysisPage(false);
  }, [hasOnboardingSessionData, setAnalysisActiveFileId]);

  const {
    autoUpdateStatus,
    handleCheckForUpdatesAndInstall,
    handleCloseWindow,
    handleInstallDownloadedUpdate,
    handleMinimizeWindow,
    handleToggleMaximizeWindow,
  } = useDesktopShell({
    handleExport,
    importerRef,
    isWindowsDesktopShell,
  });
  const handlePreviewCheckForUpdates = useCallback(async () => {
    await new Promise((resolve) => {
      setTimeout(resolve, 900);
    });
    return true;
  }, []);

  return (
    <WorkspaceShell
      id="analysis-page"
      className="relative w-full h-full min-h-0 overflow-hidden"
      showDesktopCommandBar={isDesktopChromePreviewEnabled}
      showSkeleton={false}
      titlebarState={
        isDesktopChromePreviewEnabled
          ? {
              id: "analysis-desktop-command-bar",
              t,
              activePage,
              canNavigateBack: layoutState.canNavigateBack,
              canNavigateForward: layoutState.canNavigateForward,
              onAnalysisIntent: handleAnalysisIntent,
              onNavigateBack: handleNavigateBack,
              onNavigateForward: handleNavigateForward,
              onPageChange: handlePageTabSelect,
              onOpenSettings: () => handlePageTabSelect("settings"),
              onMinimizeWindow: handleMinimizeWindow,
              onToggleMaximizeWindow: handleToggleMaximizeWindow,
              onCloseWindow: handleCloseWindow,
              updateAction: {
                isVisible: autoUpdateStatus.status === "downloaded",
                isReadyToInstall: autoUpdateStatus.status === "downloaded",
                version: autoUpdateStatus.version,
                onClick: () => {
                  void handleInstallDownloadedUpdate();
                },
              },
              showAnalysisFileSelector:
                analysisPane.isActive && analysisFileOptions.length > 0,
              analysisFileOptions,
              analysisActiveFileId,
              onAnalysisFileChange: handleAnalysisFileChange,
            }
          : undefined
      }
    >
      <div className="relative flex flex-1 min-h-0 flex-col">
        {shouldMountOnboardingController ? (
          <Suspense fallback={null}>
            <OnboardingControllerHost
              clearPreviewState={clearPreviewState}
              importerRef={importerRef}
              isRequestedOpen={pendingOnboardingOpenMode !== null}
              openMode={pendingOnboardingOpenMode ?? "manual"}
              navigateToPage={navigateToPage}
              onStateChange={handleOnboardingControllerStateChange}
              processingState={processingStatus?.state}
              processedData={processedData}
              rawData={rawData}
              setProcessedData={setProcessedData}
              setRawData={setRawData}
              setSelectedPreviewFileId={setSelectedPreviewFileId}
              setTemplateConfig={setTemplateConfig}
              templateConfig={templateConfig}
              updateSettings={handleUpdateAnalysisSettings}
            />
          </Suspense>
        ) : null}

      <div className="relative flex-1 min-h-0">
        <section
          id={dataPane.paneId}
          role="region"
          aria-labelledby={dataPane.labelledBy}
          aria-hidden={!dataPane.isActive}
          inert={!dataPane.isActive ? true : undefined}
          className={getViewPaneClassName(dataPane.isActive)}
        >
          <ScrollArea
            className="da_page_scroll h-full min-h-0"
            viewportClassName="p-1 pt-0 !overflow-hidden"
            axis="y"
          >
            <DataPart
              analysisSettings={analysisSettings}
              ensurePreviewCells={ensurePreviewCells}
              ensurePreviewRows={ensurePreviewRows}
              getPreviewRow={getPreviewRow}
              getPreviewRowsVersion={getPreviewRowsVersion}
              hasSessionData={hasSessionData}
              importerRef={importerRef}
              onClearSession={handleClearSession}
              onDataImported={handleDataImported}
              onDataRemoved={handleDataRemoved}
              onImportTrigger={() => {
                onboarding.handleImportTrigger();
              }}
              onFileSelected={handlePreviewFileSelected}
              onTemplateApplied={handleTemplateApplied}
              onTemplateAppliedIncremental={handleTemplateAppliedIncremental}
              onUpdateSettings={handleUpdateAnalysisSettings}
              previewFile={previewFile}
              previewStatus={previewStatus}
              rawData={rawData}
              selectedPreviewFileId={selectedPreviewFileId}
              subscribePreviewRowsVersion={subscribePreviewRowsVersion}
              t={t}
            />
          </ScrollArea>
        </section>

        <section
          id={analysisPane.paneId}
          role="region"
          aria-labelledby={analysisPane.labelledBy}
          aria-hidden={!analysisPane.isActive}
          inert={!analysisPane.isActive ? true : undefined}
          className={getViewPaneClassName(analysisPane.isActive)}
        >
          <div className="da_page_scroll h-full min-h-0 overflow-hidden p-1 pt-0">
            {analysisPane.shouldMount ? (
              <Suspense
                fallback={<DeferredPanelFallback label={t("da_analysis_loading")} />}
              >
                <AnalysisPanel
                  key={`analysis-panel-session-${analysisPanelSessionKey}`}
                  processedData={processedData}
                  processingStatus={processingStatus}
                  activeFileId={analysisActiveFileId}
                  onActiveFileIdChange={handleAnalysisFileChange}
                  showFileSelect={!isWindowsDesktopShell}
                  shouldMountCharts={
                    analysisPane.isActive || hasVisitedAnalysisPage
                  }
                  setSsDiagnosticsEnabled={setSsDiagnosticsEnabled}
                  setVthDiagnosticsEnabled={setVthDiagnosticsEnabled}
                  setGmDiagnosticsEnabled={setGmDiagnosticsEnabled}
                  ionIoffMethod={ionIoffMethod}
                  ionIoffManualTargetsByFileId={ionIoffManualTargetsByFileId}
                  setIonIoffMethod={setIonIoffMethod}
                  setIonIoffManualTargetsByFileId={setIonIoffManualTargetsByFileId}
                  setSsManualRanges={setSsManualRanges}
                  setSsMethod={setSsMethod}
                  setSsShowFitLine={setSsShowFitLine}
                  gmDiagnosticsEnabled={gmDiagnosticsEnabled}
                  ssDiagnosticsEnabled={ssDiagnosticsEnabled}
                  vthDiagnosticsEnabled={vthDiagnosticsEnabled}
                  ssManualRanges={ssManualRanges}
                  ssMethod={ssMethod}
                  ssShowFitLine={ssShowFitLine}
                  originOpenPlotOptions={originOpenPlotOptions}
                  onOriginOpenPlotOptionsChange={handleUpdateAnalysisSettings}
                  t={tLoose}
                />
              </Suspense>
            ) : null}
          </div>
        </section>

        <section
          id={settingsPane.paneId}
          role="region"
          aria-labelledby={settingsPane.labelledBy}
          aria-hidden={!settingsPane.isActive}
          inert={!settingsPane.isActive ? true : undefined}
          className={getViewPaneClassName(settingsPane.isActive)}
        >
          {settingsPane.shouldMount ? (
            <ScrollArea
              className="da_page_scroll h-full min-h-0"
              viewportClassName="p-1 pt-0"
              axis="y"
            >
              <Suspense
                fallback={<DeferredPanelFallback label={t("da_settings_title")} />}
              >
                <SettingsPanelContainer
                  appUpdateSettings={{
                    isAvailable: isAppUpdatePreviewEnabled,
                    currentVersion:
                      typeof desktopMeta?.appVersion === "string"
                        ? desktopMeta.appVersion
                        : null,
                    onCheckForUpdates: isPackagedWindowsDesktopShell
                      ? handleCheckForUpdatesAndInstall
                      : handlePreviewCheckForUpdates,
                  }}
                  analysisSettings={analysisSettings}
                  analysisSettingsLoaded={analysisSettingsLoaded}
                  handleUpdateAnalysisSettings={handleUpdateAnalysisSettings}
                  isWindowsDesktopShell={isWindowsDesktopShell}
                  language={language}
                  handleLanguageChange={handleLanguageChange}
                  onboardingSettings={{
                    onOpenGuide: handleOpenOnboardingGuide,
                  }}
                  mergeAnalysisSettings={mergeAnalysisSettings}
                  theme={theme}
                  handleThemeChange={handleThemeChange}
                  t={tLoose}
                />
              </Suspense>
            </ScrollArea>
          ) : null}
        </section>
      </div>

      <Toast
        message={extractionErrorToast.message}
        isVisible={extractionErrorToast.isVisible}
        onClose={() =>
          setExtractionErrorToast((prev) => ({ ...prev, isVisible: false }))
        }
        type={extractionErrorToast.type}
        position="fixed"
        dataUi="analysis-extraction-error-toast"
      />

      {onboarding.isOpen ? (
        <Suspense fallback={null}>
          <Onboarding
            isOpen={onboarding.isOpen}
            stepIndex={onboarding.stepIndex}
            steps={onboarding.steps}
            t={t}
            canNext={onboarding.canNext}
            onBack={onboarding.back}
            onClose={onboarding.close}
            onNext={onboarding.next}
          />
        </Suspense>
      ) : null}
      </div>
    </WorkspaceShell>
  );
};

export default Page;
