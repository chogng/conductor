import {
  useCallback,
  useEffect,
  lazy,
  useMemo,
  useRef,
  useState,
  Suspense,
  type CSSProperties,
} from "react";
import type { CsvImporterRef } from "../components/CsvImporter";
import DeviceAnalysisDataPanel from "../components/DeviceAnalysisDataPanel";
import ScrollArea from "../../../components/ui/ScrollArea";
import Toast from "../../../components/ui/Toast";
import type { TranslationVars } from "../../../context/language-context";
import { loadAnalysisCharts } from "../components/loadAnalysisCharts";
import { getDeviceAnalysisExtractionErrorMessage } from "../lib/deviceAnalysisUtils";
import {
  useDeviceAnalysisDesktopShell,
  useDeviceAnalysisExports,
  useDeviceAnalysisPreview,
  useDeviceAnalysisProcessing,
  useDeviceAnalysisSession,
  useDeviceAnalysisSessionActions,
  useDeviceAnalysisSettings,
  useResizableSidebar,
} from "../hooks";
import { useLanguage } from "../../../hooks/useLanguage";
import type { ToastType } from "../lib/sharedTypes";

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
      [key: string]: unknown;
    };
  }
}

const DesktopCommandBar = lazy(() => import("../components/DesktopCommandBar"));
const DeviceAnalysisAnalysisPanel = lazy(
  () => import("../components/DeviceAnalysisAnalysisPanel"),
);
const DeviceAnalysisSettingsPanel = lazy(
  () => import("../components/DeviceAnalysisSettingsPanel"),
);

const DesktopCommandBarFallback = () => (
  <div className="h-[38px] shrink-0 bg-bg-page" aria-hidden="true" />
);

const DeferredPanelFallback = ({ label }: { label: string }) => (
  <div className="flex h-full w-full items-center justify-center rounded-[20px] border border-border bg-bg-surface/60 text-sm text-text-secondary">
    {label}
  </div>
);

const DeviceAnalysisPage = () => {
  const { t, language, setLanguage } = useLanguage();
  const tLoose = useCallback(
    (key: string, vars?: Record<string, unknown>) =>
      t(key, vars as TranslationVars | undefined),
    [t],
  );
  const desktopMeta =
    typeof window !== "undefined" ? window.desktopMeta ?? null : null;
  const isWindowsDesktopShell =
    desktopMeta?.isDesktop === true && desktopMeta?.platform === "win32";

  const session = useDeviceAnalysisSession();
  const {
    rawData,
    setRawData,
    selectedPreviewFileId,
    setSelectedPreviewFileId,
    processedData,
    setProcessedData,
    ssMethod,
    setSsMethod,
    ssDiagnosticsEnabled,
    setSsDiagnosticsEnabled,
    ssShowFitLine,
    setSsShowFitLine,
    ssIdWindow,
    setSsIdWindow,
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
    handleLanguageChange,
    handleUpdateDeviceAnalysisSettings,
    originOpenPlotOptions,
    originSettings,
    storageSettings,
  } = useDeviceAnalysisSettings({
    activePage,
    isWindowsDesktopShell,
    language,
    setLanguage,
    setSsDiagnosticsEnabled,
    setSsIdWindow,
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
    ssIdWindow,
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
    <div
      id="device-analysis-page"
      className={`relative w-full h-full min-h-0 overflow-hidden flex flex-col ${
        isResizing ? "cursor-col-resize select-none" : ""
      }`}
      style={{ "--sidebar-width": `${sidebarWidth}px` } as CSSProperties}
    >
      {isWindowsDesktopShell ? (
        <Suspense fallback={<DesktopCommandBarFallback />}>
          <DesktopCommandBar
            t={t}
            activePage={activePage}
            canNavigateBack={canNavigateBack}
            canNavigateForward={canNavigateForward}
            onAnalysisIntent={handleAnalysisIntent}
            onNavigateBack={handleNavigateBack}
            onNavigateForward={handleNavigateForward}
            onPageChange={handlePageTabSelect}
            onOpenOrigin={handleOpenOriginFromTitleBar}
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
              onFileSelected={handlePreviewFileSelected}
              onStartResizing={startResizing}
              onTemplateApplied={handleTemplateApplied}
              onTemplateAppliedIncremental={handleTemplateAppliedIncremental}
              onUpdateDeviceAnalysisSettings={handleUpdateDeviceAnalysisSettings}
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
                  setSsIdWindow={setSsIdWindow}
                  setSsManualRanges={setSsManualRanges}
                  setSsMethod={setSsMethod}
                  setSsShowFitLine={setSsShowFitLine}
                  ssDiagnosticsEnabled={ssDiagnosticsEnabled}
                  ssIdWindow={ssIdWindow}
                  ssManualRanges={ssManualRanges}
                  ssMethod={ssMethod}
                  ssShowFitLine={ssShowFitLine}
                  originOpenPlotOptions={originOpenPlotOptions}
                  t={t}
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
                <DeviceAnalysisSettingsPanel
                  appUpdateSettings={{
                    isAvailable: isWindowsDesktopShell,
                    onCheckForUpdates: handleCheckForUpdates,
                  }}
                  language={language}
                  onLanguageChange={handleLanguageChange}
                  originSettings={originSettings}
                  storageSettings={storageSettings}
                  t={t}
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
    </div>
  );
};

export default DeviceAnalysisPage;
