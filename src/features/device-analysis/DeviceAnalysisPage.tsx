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
import DeviceAnalysisDataPanel from "./data/DataPanel";
import type { CsvImporterRef } from "./data/CsvImporter";
import ScrollArea from "../../components/ui/ScrollArea";
import Toast from "../../components/ui/Toast";
import type { TranslationVars } from "../../context/language";
import { loadAnalysisCharts } from "./analysis/loadAnalysisCharts";
import { getDeviceAnalysisExtractionErrorMessage } from "./shared/lib/deviceAnalysisUtils";
import DeviceAnalysisWorkspaceShell from "./DeviceAnalysisWorkspaceShell";
import { useLanguage } from "../../hooks/useLanguage";
import { useTheme } from "../../hooks/useTheme";
import type { ToastType } from "./shared/lib/sharedTypes";
import DesktopCommandBar from "./desktop/DesktopCommandBar";
import { useDeviceAnalysisDesktopShell } from "./desktop/useDeviceAnalysisDesktopShell";
import { useDeviceAnalysisExports } from "./analysis/useDeviceAnalysisExports";
import { useDeviceAnalysisPreview } from "./data/useDeviceAnalysisPreview";
import { useDeviceAnalysisProcessing } from "./data/useDeviceAnalysisProcessing";
import { loadDeviceAnalysisOnboarding } from "./onboarding/loadDeviceAnalysisOnboarding";
import { loadDeviceAnalysisOnboardingController } from "./onboarding/loadDeviceAnalysisOnboardingController";
import type { OnboardingStep } from "./onboarding/onboardingTypes";
import { useDeviceAnalysisSession } from "./session/useDeviceAnalysisSession";
import { useDeviceAnalysisSessionActions } from "./session/useDeviceAnalysisSessionActions";
import { useDeviceAnalysisCoreSettings } from "./settings/useDeviceAnalysisCoreSettings";
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
      [key: string]: unknown;
    };
  }
}

const DeviceAnalysisAnalysisPanel = lazy(
  () => import("./analysis/AnalysisPanel"),
);
const DeviceAnalysisSettingsPanelContainer = lazy(
  () => import("./settings/SettingsPanelContainer"),
);
const DeviceAnalysisOnboardingControllerHost = lazy(
  loadDeviceAnalysisOnboardingController,
);
const DeviceAnalysisOnboarding = lazy(loadDeviceAnalysisOnboarding);

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

const DeviceAnalysisPage = () => {
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

  const session = useDeviceAnalysisSession();
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
      getDeviceAnalysisExtractionErrorMessage(tLoose, {
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
    ensurePreviewRows,
    getPreviewRow,
    getPreviewRowsVersion,
    handlePreviewFileSelected,
    invalidatePreviewRequests,
    rawDataByIdRef,
    resetPreviewWorker,
    subscribePreviewRowsVersion,
  } = useDeviceAnalysisPreview({
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
    deviceAnalysisSettings,
    deviceAnalysisSettingsLoaded,
    handleLanguageChange,
    handleThemeChange,
    handleUpdateDeviceAnalysisSettings,
    mergeDeviceAnalysisSettings,
    originOpenPlotOptions,
  } = useDeviceAnalysisCoreSettings({
    language,
    setIonIoffMethod,
    setLanguage,
    theme,
    setTheme,
    setGmDiagnosticsEnabled,
    setSsDiagnosticsEnabled,
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
  } = useDeviceAnalysisProcessing({
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

  const { handleExport } = useDeviceAnalysisExports({
    processedData,
    ssManualRanges,
    ssMethod,
  });

  const {
    handleClearSession,
    handleDataImported,
    handleDataRemoved,
    hasSessionData,
  } = useDeviceAnalysisSessionActions({
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

    const fallbackIonX = deviceAnalysisSettings?.ionIoffManualIonX;
    const fallbackIoffX = deviceAnalysisSettings?.ionIoffManualIoffX;
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
    deviceAnalysisSettings?.ionIoffManualIoffX,
    deviceAnalysisSettings?.ionIoffManualIonX,
    ionIoffManualTargetsByFileId,
    processedData,
    setIonIoffManualTargetsByFileId,
  ]);

  const persistedIonIoffTargetsRef = useRef<string | null>(null);
  useEffect(() => {
    if (!deviceAnalysisSettingsLoaded) return;
    const serializedTargets = JSON.stringify(ionIoffManualTargetsByFileId);
    if (persistedIonIoffTargetsRef.current === serializedTargets) return;
    persistedIonIoffTargetsRef.current = serializedTargets;
    handleUpdateDeviceAnalysisSettings({
      ionIoffManualTargetsByFileId,
    }).catch(() => {});
  }, [
    deviceAnalysisSettingsLoaded,
    handleUpdateDeviceAnalysisSettings,
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
  const shouldSuppressDesktopAutoOnboarding = desktopMeta?.isDesktop === true;
  const shouldAutoStartOnboarding =
    !shouldSuppressDesktopAutoOnboarding &&
    Boolean(deviceAnalysisSettings) &&
    !Boolean(deviceAnalysisSettings?.onboardingCompleted) &&
    !Boolean(deviceAnalysisSettings?.onboardingAutoStartDismissed) &&
    !hasOnboardingSessionData;

  useEffect(() => {
    if (!shouldAutoStartOnboarding || onboarding.isOpen) return undefined;

    const scheduleAutoOpen = () => {
      setShouldMountOnboardingController(true);
      setPendingOnboardingOpenMode("auto");
      void loadDeviceAnalysisOnboardingController();
      void loadDeviceAnalysisOnboarding();
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
    void loadDeviceAnalysisOnboardingController();
    void loadDeviceAnalysisOnboarding();
  }, []);

  const {
    handleCheckForUpdates,
    handleCloseWindow,
    handleMinimizeWindow,
    handleOpenOriginFromTitleBar,
    handleToggleMaximizeWindow,
  } = useDeviceAnalysisDesktopShell({
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

  return (
    <DeviceAnalysisWorkspaceShell
      id="device-analysis-page"
      className={`relative w-full h-full min-h-0 overflow-hidden ${
        isResizing ? "cursor-col-resize select-none" : ""
      }`}
      showDesktopCommandBar={isWindowsDesktopShell}
      showSkeleton={false}
      style={{ "--sidebar-width": `${sidebarWidth}px` } as CSSProperties}
      titleBar={
        isWindowsDesktopShell ? (
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
            <DeviceAnalysisOnboardingControllerHost
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
              updateSettings={handleUpdateDeviceAnalysisSettings}
            />
          </Suspense>
        ) : null}

      <div className="relative flex-1 min-h-0">
        <section
          id="device-analysis-tabpanel-data"
          role="tabpanel"
          aria-labelledby="device-analysis-tab-data"
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
            <DeviceAnalysisDataPanel
              deviceAnalysisSettings={deviceAnalysisSettings}
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
              onUpdateDeviceAnalysisSettings={handleUpdateDeviceAnalysisSettings}
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
          id="device-analysis-tabpanel-analysis"
          role="tabpanel"
          aria-labelledby="device-analysis-tab-analysis"
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
                <DeviceAnalysisAnalysisPanel
                  processedData={processedData}
                  processingStatus={processingStatus}
                  activeFileId={analysisActiveFileId}
                  onActiveFileIdChange={handleAnalysisFileChange}
                  showFileSelect={!isWindowsDesktopShell}
                  shouldMountCharts={
                    isAnalysisPageActive || hasVisitedAnalysisPage
                  }
                  setSsDiagnosticsEnabled={setSsDiagnosticsEnabled}
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
                  ssManualRanges={ssManualRanges}
                  ssMethod={ssMethod}
                  ssShowFitLine={ssShowFitLine}
                  originOpenPlotOptions={originOpenPlotOptions}
                  t={tLoose}
                />
              </Suspense>
            ) : null}
          </div>
        </section>

        <section
          id="device-analysis-tabpanel-settings"
          role="tabpanel"
          aria-labelledby="device-analysis-window-settings-btn"
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
                <DeviceAnalysisSettingsPanelContainer
                  appUpdateSettings={{
                    isAvailable: isPackagedWindowsDesktopShell,
                    onCheckForUpdates: handleCheckForUpdates,
                  }}
                  deviceAnalysisSettings={deviceAnalysisSettings}
                  deviceAnalysisSettingsLoaded={deviceAnalysisSettingsLoaded}
                  handleUpdateDeviceAnalysisSettings={
                    handleUpdateDeviceAnalysisSettings
                  }
                  isWindowsDesktopShell={isWindowsDesktopShell}
                  language={language}
                  handleLanguageChange={handleLanguageChange}
                  onboardingSettings={{
                    onOpenGuide: handleOpenOnboardingGuide,
                  }}
                  mergeDeviceAnalysisSettings={mergeDeviceAnalysisSettings}
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
        dataUi="device-analysis-extraction-error-toast"
      />

      {onboarding.isOpen ? (
        <Suspense fallback={null}>
          <DeviceAnalysisOnboarding
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
    </DeviceAnalysisWorkspaceShell>
  );
};

export default DeviceAnalysisPage;
