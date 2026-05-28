import {
  useCallback,
  useEffect,
  lazy,
  useRef,
  useState,
  Suspense,
} from "react";
import { jsxs } from "react/jsx-runtime";
import Toast from "src/cs/base/browser/ui/toast/toast";
import type { TranslationVars } from "src/cs/platform/language/common/language";
import { loadAnalysisCharts } from "src/cs/workbench/contrib/chartPreview/loadAnalysisCharts";
import { getExtractionErrorMessage } from "src/cs/workbench/common/deviceAnalysis/utils";
import DataPart from "src/cs/workbench/contrib/data/DataPart";
import type { ImporterRef } from "src/cs/workbench/contrib/import/browser/importerView";
import ImporterViewletHost from "src/cs/workbench/contrib/workspace/ImporterViewletHost";
import {
  useWorkbenchLayoutNavigation,
} from "src/cs/workbench/browser/layout";
import {
  buildDeviceAnalysisOptionalPart,
  buildDeviceAnalysisPageParts,
  buildDeviceAnalysisPanePart,
  buildDeviceAnalysisSidebarPart,
  buildDeviceAnalysisScrollPanePart,
} from "src/cs/workbench/browser/parts";
import { useLanguage } from "src/cs/workbench/browser/hooks/useLanguage";
import { useTheme } from "src/cs/workbench/browser/hooks/useTheme";
import type { ToastType } from "src/cs/workbench/common/deviceAnalysis/sharedTypes";
import { useExports } from "src/cs/workbench/contrib/dataExport/useExports";
import { useDesktopShell } from "src/cs/workbench/contrib/desktop/useDesktopShell";
import {
  createIdleOnboardingState,
  type OnboardingControllerState,
} from "src/cs/workbench/contrib/onboarding/onboardingState";
import { usePreview } from "src/cs/workbench/contrib/tablePreview/usePreview";
import { useProcessing } from "src/cs/workbench/contrib/data/useProcessing";
import {
  loadOnboarding,
  loadOnboardingController,
} from "src/cs/workbench/contrib/onboarding/onboardingLoader";
import { useAnalysisSelectionState } from "src/cs/workbench/contrib/workspace/useAnalysisSelectionState";
import { useOnboardingLauncher } from "src/cs/workbench/contrib/onboarding/useOnboardingLauncher";
import { useSession } from "src/cs/workbench/contrib/session/useSession";
import { useSessionActions } from "src/cs/workbench/contrib/session/useSessionActions";
import { useCoreSettings } from "src/cs/workbench/contrib/settings/useCoreSettings";
import DeviceAnalysisWorkbench, {
  getWorkbenchShellFlags,
  type DeviceAnalysisWorkbenchTitlebarState,
} from "src/cs/workbench/browser/workbench";

type ProcessingExtractionError = {
  fileName?: string;
  message: string;
  messageKey?: string | null;
  messageParams?: Record<string, unknown> | null;
  [key: string]: unknown;
};

const AnalysisPanel = lazy(
  () => import("src/cs/workbench/contrib/chartPreview/AnalysisPanel"),
);
const SettingsPanelContainer = lazy(
  () => import("src/cs/workbench/contrib/settings/SettingsPanelContainer"),
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
  } = getWorkbenchShellFlags();

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

  const importerRef = useRef<ImporterRef | null>(null);
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
  const extractionErrorToastRef = useRef<Toast | null>(null);
  const {
    activeView,
    layoutState,
    navigateBack,
    navigateForward,
    navigateToView,
    resetAnalysisViewVisit,
    selectView,
    visitedViews,
  } = useWorkbenchLayoutNavigation();

  useEffect(() => {
    const toast = new Toast();
    extractionErrorToastRef.current = toast;

    return () => {
      extractionErrorToastRef.current = null;
      toast.dispose();
    };
  }, []);

  useEffect(() => {
    const toast = extractionErrorToastRef.current;
    if (!toast) return;

    if (!extractionErrorToast.isVisible) {
      toast.hide();
      return;
    }

    toast.show({
      dataUi: "analysis-extraction-error-toast",
      message: extractionErrorToast.message,
      onClose: () =>
        setExtractionErrorToast((prev) => ({ ...prev, isVisible: false })),
      position: "fixed",
      type: extractionErrorToast.type,
    });
  }, [
    extractionErrorToast.isVisible,
    extractionErrorToast.message,
    extractionErrorToast.type,
  ]);

  const handleAnalysisIntent = useCallback(() => {
    void loadAnalysisCharts();
  }, []);

  useEffect(() => {
    if (visitedViews.hasVisitedAnalysisView || processedData.length === 0) return undefined;

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
  }, [processedData.length, visitedViews.hasVisitedAnalysisView]);

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
        navigateToView(page);
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

  const dataPane = layoutState.panes.data;
  const analysisPane = layoutState.panes.analysis;
  const settingsPane = layoutState.panes.settings;

  useEffect(() => {
    const hadOnboardingSessionData = hadOnboardingSessionDataRef.current;
    hadOnboardingSessionDataRef.current = hasOnboardingSessionData;
    if (!hadOnboardingSessionData || hasOnboardingSessionData) {
      return;
    }

    setAnalysisPanelSessionKey((prev) => prev + 1);
    setAnalysisActiveFileId(null);
    resetAnalysisViewVisit();
  }, [hasOnboardingSessionData, resetAnalysisViewVisit, setAnalysisActiveFileId]);

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

  const onboardingControllerPart = buildDeviceAnalysisOptionalPart({
    content: shouldMountOnboardingController ? (
      <Suspense fallback={null}>
        <OnboardingControllerHost
          clearPreviewState={clearPreviewState}
          importerRef={importerRef}
          isRequestedOpen={pendingOnboardingOpenMode !== null}
          openMode={pendingOnboardingOpenMode ?? "manual"}
          navigateToPage={navigateToView}
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
    ) : null,
  });

  const dataSidebarPart = buildDeviceAnalysisSidebarPart({
    sidebar: (
      <ImporterViewletHost
        hasSessionData={hasSessionData}
        importerRef={importerRef}
        onClearSession={handleClearSession}
        onDataImported={handleDataImported}
        onDataRemoved={handleDataRemoved}
        onFileSelected={handlePreviewFileSelected}
        onImportTrigger={() => {
          onboarding.handleImportTrigger();
        }}
        rawData={rawData}
        selectedPreviewFileId={selectedPreviewFileId}
        t={t}
      />
    ),
  });

  const dataPanelPart = buildDeviceAnalysisScrollPanePart({
    isActive: dataPane.isActive,
    labelledBy: dataPane.labelledBy,
    paneId: dataPane.paneId,
    viewportClassName: "pl-1 pt-0 pr-0 pb-0 !overflow-hidden",
    children: (
      <DataPart
        analysisSettings={analysisSettings}
        ensurePreviewCells={ensurePreviewCells}
        ensurePreviewRows={ensurePreviewRows}
        getPreviewRow={getPreviewRow}
        getPreviewRowsVersion={getPreviewRowsVersion}
        onTemplateApplied={handleTemplateApplied}
        onTemplateAppliedIncremental={handleTemplateAppliedIncremental}
        onUpdateSettings={handleUpdateAnalysisSettings}
        previewFile={previewFile}
        previewStatus={previewStatus}
        rawData={rawData}
        subscribePreviewRowsVersion={subscribePreviewRowsVersion}
        t={t}
      />
    ),
  });

  const analysisPanelPart = buildDeviceAnalysisPanePart({
    isActive: analysisPane.isActive,
    labelledBy: analysisPane.labelledBy,
    paneId: analysisPane.paneId,
    children: (
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
                analysisPane.isActive || visitedViews.hasVisitedAnalysisView
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
    ),
  });

  const settingsPanelPart = buildDeviceAnalysisScrollPanePart({
    isActive: settingsPane.isActive,
    labelledBy: settingsPane.labelledBy,
    paneId: settingsPane.paneId,
    viewportClassName: "p-1 pt-0",
    children: settingsPane.shouldMount ? (
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
    ) : null,
  });

  const onboardingOverlayPart = buildDeviceAnalysisOptionalPart({
    content: onboarding.isOpen ? (
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
    ) : null,
  });

  const pageParts = buildDeviceAnalysisPageParts({
    AnalysisPanel: jsxs("div", {
      children: [analysisPanelPart, settingsPanelPart],
    }),
    DataPanel: dataPanelPart,
    ImportSidebar: dataSidebarPart,
    OnboardingController: onboardingControllerPart,
    OnboardingOverlay: onboardingOverlayPart,
  });

  const titlebarState: DeviceAnalysisWorkbenchTitlebarState | undefined =
    {
      enabled: isDesktopChromePreviewEnabled,
      activePage: activeView,
      t,
      canNavigateBack: layoutState.canNavigateBack,
      canNavigateForward: layoutState.canNavigateForward,
      onAnalysisIntent: handleAnalysisIntent,
      onNavigateBack: navigateBack,
      onNavigateForward: navigateForward,
      onPageChange: selectView,
      onOpenSettings: () => selectView("settings"),
      onMinimizeWindow: handleMinimizeWindow,
      onToggleMaximizeWindow: handleToggleMaximizeWindow,
      onCloseWindow: handleCloseWindow,
      isUpdateReadyToInstall: autoUpdateStatus.status === "downloaded",
      updateVersion: autoUpdateStatus.version,
      showAnalysisFileSelector:
        analysisPane.isActive && analysisFileOptions.length > 0,
      onInstallUpdate: () => {
        void handleInstallDownloadedUpdate();
      },
      analysisFileOptions,
      analysisActiveFileId,
      onAnalysisFileChange: handleAnalysisFileChange,
    };

  return (
    <DeviceAnalysisWorkbench
      id="analysis-page"
      className="relative w-full h-full min-h-0 overflow-hidden"
      showDesktopCommandBar={isDesktopChromePreviewEnabled}
      showSkeleton={false}
      titlebarState={titlebarState}
      activeView={activeView}
      parts={pageParts}
    />
  );
};

export default Page;
