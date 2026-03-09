import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import {
  DesktopCommandBar,
  DeviceAnalysisAnalysisPanel,
  DeviceAnalysisDataPanel,
  DeviceAnalysisSettingsPanel,
} from "../components";
import ScrollArea from "../../../components/ui/ScrollArea";
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
import type {
  SsIdWindow,
  SsManualRanges,
  SsMethod,
} from "../context/device-analysis-session-context";

type PageTab = "data" | "analysis" | "settings";
type PageNavigationState = {
  activePage: PageTab;
  history: PageTab[];
  historyIndex: number;
};

type RawDataEntry = {
  file?: unknown;
  fileId?: string;
  fileName?: string;
  [key: string]: unknown;
};

type ProcessedEntry = {
  fileId?: string;
  [key: string]: unknown;
};

type ExtractionErrorEntry = {
  fileName?: string;
  message?: string;
  messageKey?: string | null;
  messageParams?: Record<string, unknown> | null;
  [key: string]: unknown;
};

type ProcessingExtractionError = ExtractionErrorEntry & {
  message: string;
};

type PreviewFile = {
  fileId: string;
  fileName: string;
  rowCount: number;
  columnCount: number;
  maxCellLengths: number[];
};

type PreviewStatus = {
  state: "idle" | "loading" | "ready" | "error";
  message: string;
};

type PreviewRowsRequest = {
  fileId: string;
  startRow: number;
  endRow: number;
  reject: (error: unknown) => void;
  resolve: (rows: unknown[][]) => void;
};

type SessionCompat = {
  rawData: RawDataEntry[];
  setRawData: Dispatch<SetStateAction<RawDataEntry[]>>;
  selectedPreviewFileId: string | null;
  setSelectedPreviewFileId: Dispatch<SetStateAction<string | null>>;
  processedData: ProcessedEntry[];
  setProcessedData: Dispatch<SetStateAction<ProcessedEntry[]>>;
  extractionErrors: ExtractionErrorEntry[];
  setExtractionErrors: Dispatch<SetStateAction<ExtractionErrorEntry[]>>;
  ssMethod: SsMethod;
  setSsMethod: Dispatch<SetStateAction<SsMethod>>;
  ssDiagnosticsEnabled: boolean;
  setSsDiagnosticsEnabled: Dispatch<SetStateAction<boolean>>;
  ssShowFitLine: boolean;
  setSsShowFitLine: Dispatch<SetStateAction<boolean>>;
  ssIdWindow: SsIdWindow;
  setSsIdWindow: Dispatch<SetStateAction<SsIdWindow>>;
  ssManualRanges: SsManualRanges;
  setSsManualRanges: Dispatch<SetStateAction<SsManualRanges>>;
  previewFile: PreviewFile | null;
  setPreviewFile: Dispatch<SetStateAction<PreviewFile | null>>;
  previewStatus: PreviewStatus;
  setPreviewStatus: Dispatch<SetStateAction<PreviewStatus>>;
  previewWorkerRef: MutableRefObject<Worker | null>;
  previewRequestIdRef: MutableRefObject<number>;
  previewRowsRequestIdRef: MutableRefObject<number>;
  previewRowsRequestsRef: MutableRefObject<Map<number, PreviewRowsRequest>>;
  previewRowsCacheByFileIdRef: MutableRefObject<Map<string, Map<number, unknown[]>>>;
  previewLoadedChunksByFileIdRef: MutableRefObject<Map<string, Set<number>>>;
  previewRowsCacheRef: MutableRefObject<Map<number, unknown[]>>;
  previewLoadedChunksRef: MutableRefObject<Set<number>>;
  previewCacheFileIdRef: MutableRefObject<string | null>;
  previewCacheFileLruRef: MutableRefObject<Set<string>>;
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

  const session = useDeviceAnalysisSession() as unknown as SessionCompat;
  const {
    rawData,
    setRawData,
    selectedPreviewFileId,
    setSelectedPreviewFileId,
    processedData,
    setProcessedData,
    extractionErrors,
    setExtractionErrors,
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

  const importerRef = useRef<{ openFileDialog?: () => void } | null>(null);
  const [pageNavigation, setPageNavigation] = useState<PageNavigationState>({
    activePage: "data",
    history: ["data"],
    historyIndex: 0,
  });
  const [hasVisitedAnalysisPage, setHasVisitedAnalysisPage] = useState(false);
  const [hasVisitedSettingsPage, setHasVisitedSettingsPage] = useState(false);
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

  const getExtractionErrorMessage = useCallback(
    (error: ExtractionErrorEntry) =>
      getDeviceAnalysisExtractionErrorMessage(tLoose, {
        message: typeof error?.message === "string" ? error.message : undefined,
        messageKey:
          typeof error?.messageKey === "string" ? error.messageKey : undefined,
        messageParams:
          error?.messageParams && typeof error.messageParams === "object"
            ? error.messageParams
            : undefined,
      }),
    [tLoose],
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
    setActivePage: (page: string) => {
      if (page === "data" || page === "analysis" || page === "settings") {
        navigateToPage(page);
      }
    },
    setExtractionErrors:
      setExtractionErrors as Dispatch<
        SetStateAction<ProcessingExtractionError[]>
      >,
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
    extractionErrors,
    invalidatePreviewRequests,
    previewFile,
    processedData,
    processingStatus,
    rawData,
    removeQueuedProcessingFile,
    resetPreviewWorker,
    resetProcessingWorker,
    selectedPreviewFileId,
    setExtractionErrors,
    setProcessedData,
    setRawData,
    setSelectedPreviewFileId,
    setSsManualRanges:
      setSsManualRanges as Dispatch<SetStateAction<Record<string, unknown>>>,
  });

  const ensurePreviewRowsAny = useCallback(
    (...args: unknown[]): Promise<void> | undefined => {
      const fileId = args[0];
      const startRow = Number(args[1]);
      const endRow = Number(args[2]);
      if (typeof fileId !== "string") return undefined;
      return ensurePreviewRows(
        fileId,
        Number.isFinite(startRow) ? startRow : 0,
        Number.isFinite(endRow) ? endRow : 0,
      );
    },
    [ensurePreviewRows],
  );

  const handleDataImportedAny = useCallback(
    (fileInfo: unknown) => {
      if (!fileInfo || typeof fileInfo !== "object") return;
      handleDataImported(fileInfo as RawDataEntry);
    },
    [handleDataImported],
  );

  const handleTemplateAppliedAny = useCallback(
    (...args: unknown[]) => {
      const config = args[0];
      if (!config || typeof config !== "object") return null;
      return handleTemplateApplied(config as Record<string, unknown>);
    },
    [handleTemplateApplied],
  );

  const handleTemplateAppliedIncrementalAny = useCallback(
    (...args: unknown[]) => {
      const config = args[0];
      if (!config || typeof config !== "object") return null;
      return handleTemplateAppliedIncremental(config as Record<string, unknown>);
    },
    [handleTemplateAppliedIncremental],
  );

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
        />
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
            viewportClassName="p-1 pt-0 xl:!overflow-hidden"
            axis="y"
          >
            <DeviceAnalysisDataPanel
              deviceAnalysisSettings={deviceAnalysisSettings}
              ensurePreviewRows={ensurePreviewRowsAny}
              extractionErrors={extractionErrors}
              getExtractionErrorMessage={getExtractionErrorMessage}
              getPreviewRow={getPreviewRow}
              getPreviewRowsVersion={getPreviewRowsVersion}
              hasSessionData={hasSessionData}
              importerRef={importerRef}
              isResizing={isResizing}
              onClearExtractionErrors={() => setExtractionErrors([])}
              onClearSession={handleClearSession}
              onDataImported={handleDataImportedAny}
              onDataRemoved={handleDataRemoved}
              onFileSelected={handlePreviewFileSelected}
              onStartResizing={startResizing}
              onTemplateApplied={handleTemplateAppliedAny}
              onTemplateAppliedIncremental={
                handleTemplateAppliedIncrementalAny
              }
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
              <DeviceAnalysisAnalysisPanel
                processedData={processedData}
                processingStatus={processingStatus}
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
            </ScrollArea>
          ) : null}
        </section>
      </div>
    </div>
  );
};

export default DeviceAnalysisPage;
