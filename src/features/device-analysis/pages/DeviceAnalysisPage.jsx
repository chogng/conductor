import { useCallback, useEffect, useRef, useState } from "react";
import {
  DesktopCommandBar,
  DeviceAnalysisAnalysisPanel,
  DeviceAnalysisDataPanel,
  DeviceAnalysisSettingsPanel,
} from "../components";
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

const DeviceAnalysisPage = () => {
  const { t, language, setLanguage } = useLanguage();
  const desktopMeta =
    typeof window !== "undefined" ? window.desktopMeta ?? null : null;
  const isWindowsDesktopShell =
    desktopMeta?.isDesktop === true && desktopMeta?.platform === "win32";

  const session = useDeviceAnalysisSession();
  const {
    rawData = [],
    setRawData = () => {},
    selectedPreviewFileId = null,
    setSelectedPreviewFileId = () => {},
    processedData = [],
    setProcessedData = () => {},
    extractionErrors = [],
    setExtractionErrors = () => {},
    ssMethod = "auto",
    setSsMethod = () => {},
    ssDiagnosticsEnabled = true,
    setSsDiagnosticsEnabled = () => {},
    ssShowFitLine = true,
    setSsShowFitLine = () => {},
    ssIdWindow = { low: "1e-11", high: "1e-9" },
    setSsIdWindow = () => {},
    ssManualRanges = {},
    setSsManualRanges = () => {},
    previewFile = null,
    setPreviewFile = () => {},
    previewStatus = { state: "idle", message: "" },
    setPreviewStatus = () => {},
    previewWorkerRef = { current: null },
    previewRequestIdRef = { current: 0 },
    previewRowsRequestIdRef = { current: 0 },
    previewRowsRequestsRef = { current: new Map() },
    previewRowsCacheByFileIdRef = { current: new Map() },
    previewLoadedChunksByFileIdRef = { current: new Map() },
    previewRowsCacheRef = { current: new Map() },
    previewLoadedChunksRef = { current: new Set() },
    previewCacheFileIdRef = { current: null },
    previewCacheFileLruRef = { current: new Set() },
  } = session || {};

  const importerRef = useRef(null);
  const [activePage, setActivePage] = useState("data");
  const [hasVisitedAnalysisPage, setHasVisitedAnalysisPage] = useState(false);
  const { isResizing, sidebarWidth, startResizing } = useResizableSidebar();

  const navigateToPage = useCallback((nextPage) => {
    if (nextPage === "analysis") {
      setHasVisitedAnalysisPage(true);
    }

    setActivePage(nextPage);
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
    (error) => getDeviceAnalysisExtractionErrorMessage(t, error),
    [t],
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
    t,
  });

  const {
    deviceAnalysisSettings,
    handleLanguageChange,
    handleUpdateDeviceAnalysisSettings,
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
    t,
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
    setActivePage: navigateToPage,
    setExtractionErrors,
    setProcessedData,
    t,
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
    setSsManualRanges,
  });

  const isDataPageActive = activePage === "data";
  const isAnalysisPageActive = activePage === "analysis";
  const isSettingsPageActive = activePage === "settings";

  const handlePageTabSelect = useCallback((nextPage) => {
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
    handleCloseWindow,
    handleMinimizeWindow,
    handleOpenOriginFromTitleBar,
    handleToggleMaximizeWindow,
  } = useDeviceAnalysisDesktopShell({
    handleExport,
    importerRef,
    isWindowsDesktopShell,
    setActivePage: navigateToPage,
  });

  return (
    <div
      id="device-analysis-page"
      className={`relative w-full h-full min-h-0 overflow-hidden flex flex-col ${
        isResizing ? "cursor-col-resize select-none" : ""
      }`}
      style={{ "--sidebar-width": `${sidebarWidth}px` }}
    >
      {isWindowsDesktopShell ? (
        <DesktopCommandBar
          t={t}
          activePage={activePage}
          onAnalysisIntent={handleAnalysisIntent}
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
          <div className="da_page_scroll h-full min-h-0 overflow-y-auto xl:overflow-hidden p-1 pt-0">
            <DeviceAnalysisDataPanel
              deviceAnalysisSettings={deviceAnalysisSettings}
              ensurePreviewRows={ensurePreviewRows}
              extractionErrors={extractionErrors}
              getExtractionErrorMessage={getExtractionErrorMessage}
              getPreviewRow={getPreviewRow}
              getPreviewRowsVersion={getPreviewRowsVersion}
              hasSessionData={hasSessionData}
              importerRef={importerRef}
              isResizing={isResizing}
              onClearExtractionErrors={() => setExtractionErrors([])}
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
          </div>
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
            <DeviceAnalysisAnalysisPanel
              processedData={processedData}
              processingStatus={processingStatus}
              shouldMountCharts={isAnalysisPageActive || hasVisitedAnalysisPage}
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
              t={t}
            />
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
          <div className="da_page_scroll h-full min-h-0 overflow-y-auto custom-scrollbar p-1 pt-0">
            <DeviceAnalysisSettingsPanel
              language={language}
              onLanguageChange={handleLanguageChange}
              originSettings={originSettings}
              storageSettings={storageSettings}
              t={t}
            />
          </div>
        </section>
      </div>
    </div>
  );
};

export default DeviceAnalysisPage;
