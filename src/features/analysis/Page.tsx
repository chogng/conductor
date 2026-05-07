import {
  useCallback,
  useEffect,
  lazy,
  useMemo,
  useRef,
  useState,
  Suspense,
  type CSSProperties,
  type MutableRefObject,
} from "react";
import DataPanel from "./data/DataPanel";
import type { CsvImporterRef } from "./data/CsvImporter";
import ScrollArea from "cs/base/browser/ui/ScrollArea/ScrollArea";
import Toast from "cs/base/browser/ui/Toast/Toast";
import type { TranslationVars } from "src/cs/platform/language/common/language";
import { loadAnalysisCharts } from "./analysis/loadAnalysisCharts";
import { getExtractionErrorMessage } from "./shared/lib/utils";
import WorkspaceShell from "./WorkspaceShell";
import { useLanguage } from "src/cs/workbench/browser/hooks/useLanguage";
import { useTheme } from "src/cs/workbench/browser/hooks/useTheme";
import type { ToastType } from "./shared/lib/sharedTypes";
import DesktopCommandBar from "./desktop/DesktopCommandBar";
import { useDesktopShell } from "./desktop/useDesktopShell";
import { useExports } from "./analysis/useExports";
import { usePreview } from "./data/usePreview";
import { useProcessing } from "./data/useProcessing";
import { loadOnboarding } from "./onboarding/loadOnboarding";
import { loadOnboardingController } from "./onboarding/loadOnboardingController";
import type { OnboardingStep } from "./onboarding/onboardingTypes";
import { useSession } from "./session/useSession";
import { useSessionActions } from "./session/useSessionActions";
import { useCoreSettings } from "./settings/useCoreSettings";
import { useResizableSidebar } from "./useResizableSidebar";

type PageTab = "data" | "analysis" | "settings";
type PageNavigationState = {
  activePage: PageTab;
  history: PageTab[];
  historyIndex: number;
};

type ProcessingExtractionError = {
  fileName?: string;
  message: string;
  messageKey?: string | null;
  messageParams?: Record<string, unknown> | null;
  [key: string]: unknown;
};

type OnboardingLaunchMode = "auto" | "manual";
type OnboardingControllerState = {
  back: () => void;
  canNext: boolean;
  close: () => void;
  handleImportTrigger: () => void;
  handleOpenOrigin: (openOrigin: () => void) => void;
  isOpen: boolean;
  next: () => void;
  open: (mode: OnboardingLaunchMode) => void;
  stepIndex: number;
  steps: OnboardingStep[];
};

const stripCsvExtension = (fileName: string): string => {
  const normalized = String(fileName ?? "").trim();
  if (!normalized) return normalized;
  const withoutCsv = normalized.replace(/\.csv$/i, "");
  return withoutCsv.length > 0 ? withoutCsv : normalized;
};

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
  () => import("./analysis/AnalysisPanel"),
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

const createIdleOnboardingState = (
  importerRef: MutableRefObject<CsvImporterRef | null>,
): OnboardingControllerState => ({
  back: () => {},
  canNext: true,
  close: () => {},
  handleImportTrigger: () => {
    importerRef.current?.openFileDialog?.();
  },
  handleOpenOrigin: (openOrigin) => {
    openOrigin();
  },
  isOpen: false,
  next: () => {},
  open: () => {},
  stepIndex: 0,
  steps: [],
});

const Page = () => {
  const { t, language, setLanguage } = useLanguage();
  const { theme, setTheme } = useTheme();
  const tLoose = useCallback(
    (key: string, vars?: Record<string, unknown>) =>
      t(key, vars as TranslationVars | undefined),
    [t],
  );
  const desktopMeta =
    typeof window !== "undefined" ? window.desktopMeta ?? null : null;
  const isWindowsDesktopShell =
    desktopMeta?.isDesktop === true && desktopMeta?.platform === "win32";
  const isPackagedWindowsDesktopShell =
    isWindowsDesktopShell && desktopMeta?.isPackaged === true;
  const isAppUpdatePreviewEnabled =
    isPackagedWindowsDesktopShell || import.meta.env.DEV;
  const isDesktopChromePreviewEnabled =
    isWindowsDesktopShell || import.meta.env.DEV;

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
  const [shouldMountOnboardingController, setShouldMountOnboardingController] =
    useState(false);
  const [pendingOnboardingOpenMode, setPendingOnboardingOpenMode] =
    useState<OnboardingLaunchMode | null>(null);
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
  const [pageNavigation, setPageNavigation] = useState<PageNavigationState>({
    activePage: "data",
    history: ["data"],
    historyIndex: 0,
  });
  const [hasVisitedAnalysisPage, setHasVisitedAnalysisPage] = useState(false);
  const [hasVisitedSettingsPage, setHasVisitedSettingsPage] = useState(false);
  const [analysisActiveFileId, setAnalysisActiveFileId] = useState<
    string | null
  >(null);
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
  const { isResizing, sidebarWidth, startResizing } = useResizableSidebar();
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
    setPageNavigation((prevState) => {
      if (prevState.activePage === nextPage) {
        return prevState;
      }

      const truncatedHistory = prevState.history.slice(
        0,
        prevState.historyIndex + 1,
      );
      const nextHistory = [...truncatedHistory, nextPage];

      return {
        activePage: nextPage,
        history: nextHistory,
        historyIndex: nextHistory.length - 1,
      };
    });
  }, []);

  const handleNavigateBack = useCallback(() => {
    setPageNavigation((prevState) => {
      if (prevState.historyIndex <= 0) {
        return prevState;
      }

      const nextIndex = prevState.historyIndex - 1;
      return {
        ...prevState,
        activePage: prevState.history[nextIndex],
        historyIndex: nextIndex,
      };
    });
  }, []);

  const handleNavigateForward = useCallback(() => {
    setPageNavigation((prevState) => {
      if (prevState.historyIndex >= prevState.history.length - 1) {
        return prevState;
      }

      const nextIndex = prevState.historyIndex + 1;
      return {
        ...prevState,
        activePage: prevState.history[nextIndex],
        historyIndex: nextIndex,
      };
    });
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

  const isDataPageActive = activePage === "data";
  const isAnalysisPageActive = activePage === "analysis";
  const isSettingsPageActive = activePage === "settings";
  // Defer non-data tab trees until first visit to reduce cold-start mount work.
  const shouldMountAnalysisPanel = isAnalysisPageActive || hasVisitedAnalysisPage;
  const shouldMountSettingsPanel =
    isSettingsPageActive || hasVisitedSettingsPage;
  const canNavigateBack = pageNavigation.historyIndex > 0;
  const canNavigateForward =
    pageNavigation.historyIndex < pageNavigation.history.length - 1;
  const analysisFileOptions = useMemo(
    () =>
      (Array.isArray(processedData) ? processedData : [])
        .map((entry) => {
          const fileId =
            typeof entry?.fileId === "string" ? entry.fileId : String(entry?.fileId ?? "");
          const fileNameRaw = entry?.fileName;
          const fileName =
            typeof fileNameRaw === "string" && fileNameRaw.trim().length > 0
              ? fileNameRaw
              : fileId;
          const displayName = stripCsvExtension(fileName);
          if (!fileId) return null;
          return { value: fileId, label: displayName };
        })
        .filter((entry): entry is { value: string; label: string } => !!entry),
    [processedData],
  );

  useEffect(() => {
    setAnalysisActiveFileId((prev) => {
      if (!analysisFileOptions.length) {
        return prev === null ? prev : null;
      }
      if (
        prev &&
        analysisFileOptions.some((option) => option.value === prev)
      ) {
        return prev;
      }
      return analysisFileOptions[0].value;
    });
  }, [analysisFileOptions]);

  const handleAnalysisFileChange = useCallback((nextFileId: string | null) => {
    setAnalysisActiveFileId(nextFileId ?? null);
  }, []);

  useEffect(() => {
    const fileId = String(analysisActiveFileId ?? "").trim();
    if (!fileId) return;
    const activeFile = processedData.find((entry) => entry?.fileId === fileId) ?? null;
    const defaultSeriesId = String(activeFile?.series?.[0]?.id ?? "").trim();
    if (!defaultSeriesId) return;
    if (ionIoffManualTargetsByFileId[fileId]?.[defaultSeriesId]) return;

    const fallbackIonX = analysisSettings?.ionIoffManualIonX;
    const fallbackIoffX = analysisSettings?.ionIoffManualIoffX;
    if (
      (fallbackIonX === undefined || fallbackIonX === null || fallbackIonX === "") &&
      (fallbackIoffX === undefined || fallbackIoffX === null || fallbackIoffX === "")
    ) {
      return;
    }

    setIonIoffManualTargetsByFileId((prev) => {
      if (prev?.[fileId]?.[defaultSeriesId]) return prev;
      return {
        ...(prev || {}),
        [fileId]: {
          ...(prev?.[fileId] ?? {}),
          [defaultSeriesId]: {
            ionX:
              fallbackIonX === undefined || fallbackIonX === null || fallbackIonX === ""
                ? ""
                : String(fallbackIonX),
            ioffX:
              fallbackIoffX === undefined || fallbackIoffX === null || fallbackIoffX === ""
                ? ""
                : String(fallbackIoffX),
          },
        },
      };
    });
  }, [
    analysisActiveFileId,
    analysisSettings?.ionIoffManualIoffX,
    analysisSettings?.ionIoffManualIonX,
    ionIoffManualTargetsByFileId,
    processedData,
    setIonIoffManualTargetsByFileId,
  ]);

  const persistedIonIoffTargetsRef = useRef<string | null>(null);
  useEffect(() => {
    if (!analysisSettingsLoaded) return;
    const serializedTargets = JSON.stringify(ionIoffManualTargetsByFileId);
    if (persistedIonIoffTargetsRef.current === serializedTargets) return;
    persistedIonIoffTargetsRef.current = serializedTargets;
    handleUpdateAnalysisSettings({
      ionIoffManualTargetsByFileId,
    }).catch(() => {});
  }, [
    analysisSettingsLoaded,
    handleUpdateAnalysisSettings,
    ionIoffManualTargetsByFileId,
  ]);

  const handlePageTabSelect = useCallback((nextPage: string) => {
    if (
      nextPage !== "data" &&
      nextPage !== "analysis" &&
      nextPage !== "settings"
    ) {
      return;
    }

    navigateToPage(nextPage);
  }, [navigateToPage]);

  const hasOnboardingSessionData =
    rawData.length > 0 || processedData.length > 0;
  const hadOnboardingSessionDataRef = useRef(hasOnboardingSessionData);
  const shouldAutoStartOnboarding =
    Boolean(analysisSettings) &&
    !Boolean(analysisSettings?.onboardingCompleted) &&
    !Boolean(analysisSettings?.onboardingAutoStartDismissed) &&
    !hasOnboardingSessionData;

  useEffect(() => {
    const hadOnboardingSessionData = hadOnboardingSessionDataRef.current;
    hadOnboardingSessionDataRef.current = hasOnboardingSessionData;
    if (!hadOnboardingSessionData || hasOnboardingSessionData) {
      return;
    }

    setAnalysisPanelSessionKey((prev) => prev + 1);
    setAnalysisActiveFileId(null);
    setHasVisitedAnalysisPage(false);
  }, [hasOnboardingSessionData]);

  useEffect(() => {
    if (!shouldAutoStartOnboarding || onboarding.isOpen) return undefined;

    const scheduleAutoOpen = () => {
      setShouldMountOnboardingController(true);
      setPendingOnboardingOpenMode("auto");
      void loadOnboardingController();
      void loadOnboarding();
    };

    if (
      typeof window !== "undefined" &&
      typeof window.requestIdleCallback === "function"
    ) {
      const idleId = window.requestIdleCallback(scheduleAutoOpen, {
        timeout: 1200,
      });
      return () => {
        if (typeof window.cancelIdleCallback === "function") {
          window.cancelIdleCallback(idleId);
        }
      };
    }

    const timeoutId = window.setTimeout(scheduleAutoOpen, 320);
    return () => window.clearTimeout(timeoutId);
  }, [onboarding.isOpen, shouldAutoStartOnboarding]);

  const handleOpenOnboardingGuide = useCallback(() => {
    setShouldMountOnboardingController(true);
    setPendingOnboardingOpenMode("manual");
    void loadOnboardingController();
    void loadOnboarding();
  }, []);

  const {
    autoUpdateStatus,
    handleCheckForUpdatesAndInstall,
    handleCloseWindow,
    handleInstallDownloadedUpdate,
    handleMinimizeWindow,
    handleOpenOriginFromTitleBar,
    handleToggleMaximizeWindow,
  } = useDesktopShell({
    handleExport,
    importerRef,
    isWindowsDesktopShell,
    setActivePage: (nextPage: string) => {
      if (
        nextPage === "data" ||
        nextPage === "analysis" ||
        nextPage === "settings"
      ) {
        navigateToPage(nextPage);
      }
    },
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
      className={`relative w-full h-full min-h-0 overflow-hidden ${
        isResizing ? "cursor-col-resize select-none" : ""
      }`}
      showDesktopCommandBar={isDesktopChromePreviewEnabled}
      showSkeleton={false}
      style={{ "--sidebar-width": `${sidebarWidth}px` } as CSSProperties}
      titleBar={
        isDesktopChromePreviewEnabled ? (
          <DesktopCommandBar
            t={t}
            activePage={activePage}
            canNavigateBack={canNavigateBack}
            canNavigateForward={canNavigateForward}
            onAnalysisIntent={handleAnalysisIntent}
            onNavigateBack={handleNavigateBack}
            onNavigateForward={handleNavigateForward}
            onPageChange={handlePageTabSelect}
            onOpenOrigin={() => {
              onboarding.handleOpenOrigin(handleOpenOriginFromTitleBar);
            }}
            onOpenSettings={() => handlePageTabSelect("settings")}
            onMinimizeWindow={handleMinimizeWindow}
            onToggleMaximizeWindow={handleToggleMaximizeWindow}
            onCloseWindow={handleCloseWindow}
            updateAction={{
              isVisible: autoUpdateStatus.status === "downloaded",
              isReadyToInstall: autoUpdateStatus.status === "downloaded",
              version: autoUpdateStatus.version,
              onClick: () => {
                void handleInstallDownloadedUpdate();
              },
            }}
            showAnalysisFileSelector={
              isAnalysisPageActive && analysisFileOptions.length > 0
            }
            analysisFileOptions={analysisFileOptions}
            analysisActiveFileId={analysisActiveFileId}
            onAnalysisFileChange={handleAnalysisFileChange}
          />
        ) : null
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
          id="analysis-tabpanel-data"
          role="tabpanel"
          aria-labelledby="analysis-tab-data"
          aria-hidden={!isDataPageActive}
          inert={!isDataPageActive ? true : undefined}
          className={`absolute inset-0 min-h-0 transition-opacity duration-150 ${
            isDataPageActive
              ? "pointer-events-auto opacity-100"
              : "pointer-events-none opacity-0"
          }`}
        >
          <ScrollArea
            className="da_page_scroll h-full min-h-0"
            viewportClassName="p-1 pt-0 min-[1200px]:!overflow-hidden"
            axis="y"
          >
            <DataPanel
              analysisSettings={analysisSettings}
              ensurePreviewCells={ensurePreviewCells}
              ensurePreviewRows={ensurePreviewRows}
              getPreviewRow={getPreviewRow}
              getPreviewRowsVersion={getPreviewRowsVersion}
              hasSessionData={hasSessionData}
              importerRef={importerRef}
              isResizing={isResizing}
              onClearSession={handleClearSession}
              onDataImported={handleDataImported}
              onDataRemoved={handleDataRemoved}
              onImportTrigger={() => {
                onboarding.handleImportTrigger();
              }}
              onFileSelected={handlePreviewFileSelected}
              onStartResizing={startResizing}
              onTemplateApplied={handleTemplateApplied}
              onTemplateAppliedIncremental={handleTemplateAppliedIncremental}
              onUpdateSettings={handleUpdateAnalysisSettings}
              previewFile={previewFile}
              previewStatus={previewStatus}
              rawData={rawData}
              sidebarWidth={sidebarWidth}
              selectedPreviewFileId={selectedPreviewFileId}
              subscribePreviewRowsVersion={subscribePreviewRowsVersion}
              t={t}
            />
          </ScrollArea>
        </section>

        <section
          id="analysis-tabpanel-analysis"
          role="tabpanel"
          aria-labelledby="analysis-tab-analysis"
          aria-hidden={!isAnalysisPageActive}
          inert={!isAnalysisPageActive ? true : undefined}
          className={`absolute inset-0 min-h-0 transition-opacity duration-150 ${
            isAnalysisPageActive
              ? "pointer-events-auto opacity-100"
              : "pointer-events-none opacity-0"
          }`}
        >
          <div className="da_page_scroll h-full min-h-0 overflow-hidden p-1 pt-0">
            {shouldMountAnalysisPanel ? (
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
                    isAnalysisPageActive || hasVisitedAnalysisPage
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
          id="analysis-tabpanel-settings"
          role="tabpanel"
          aria-labelledby="analysis-window-settings-btn"
          aria-hidden={!isSettingsPageActive}
          inert={!isSettingsPageActive ? true : undefined}
          className={`absolute inset-0 min-h-0 transition-opacity duration-150 ${
            isSettingsPageActive
              ? "pointer-events-auto opacity-100"
              : "pointer-events-none opacity-0"
          }`}
        >
          {shouldMountSettingsPanel ? (
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
                  handleUpdateAnalysisSettings={
                    handleUpdateAnalysisSettings
                  }
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
