import { useCallback, useMemo } from "react";

export const useDeviceAnalysisSessionActions = ({
  clearPreviewState,
  disposePreviewFileCache,
  extractionErrors = [],
  invalidatePreviewRequests,
  previewFile = null,
  processedData = [],
  processingStatus = { state: "idle" },
  rawData = [],
  removeQueuedProcessingFile,
  resetPreviewWorker,
  resetProcessingWorker,
  selectedPreviewFileId = null,
  setExtractionErrors,
  setProcessedData,
  setRawData,
  setSelectedPreviewFileId,
  setSsManualRanges,
}) => {
  const hasSessionData = useMemo(
    () =>
      rawData.length > 0 ||
      processedData.length > 0 ||
      extractionErrors.length > 0 ||
      previewFile !== null,
    [extractionErrors.length, previewFile, processedData.length, rawData.length],
  );

  const handleClearSession = useCallback(() => {
    if (!hasSessionData) return;

    resetProcessingWorker();
    invalidatePreviewRequests();
    clearPreviewState({ clearSelection: true });

    setProcessedData([]);
    setExtractionErrors([]);
    setRawData([]);
    setSsManualRanges({});
    resetPreviewWorker();
  }, [
    clearPreviewState,
    hasSessionData,
    invalidatePreviewRequests,
    resetPreviewWorker,
    resetProcessingWorker,
    setExtractionErrors,
    setProcessedData,
    setRawData,
    setSsManualRanges,
  ]);

  const handleDataImported = useCallback(
    (fileInfo) => {
      setRawData((prev) => [...prev, fileInfo]);
      if (fileInfo?.fileId) {
        setSelectedPreviewFileId(fileInfo.fileId);
      }
    },
    [setRawData, setSelectedPreviewFileId],
  );

  const handleDataRemoved = useCallback(
    (fileId) => {
      const removedFileName =
        rawData.find((entry) => entry.fileId === fileId)?.fileName ?? null;

      if (selectedPreviewFileId === fileId) {
        const remainingFiles = rawData.filter((entry) => entry.fileId !== fileId);
        setSelectedPreviewFileId(remainingFiles[0]?.fileId ?? null);
      }

      setRawData((prev) => prev.filter((entry) => entry.fileId !== fileId));
      setProcessedData((prev) =>
        (Array.isArray(prev) ? prev : []).filter((entry) => entry?.fileId !== fileId),
      );

      if (removedFileName) {
        setExtractionErrors((prev) =>
          prev.filter((entry) => entry.fileName !== removedFileName),
        );
      }

      if (processingStatus.state === "processing") {
        removeQueuedProcessingFile(fileId);
      }

      if (previewFile?.fileId === fileId) {
        clearPreviewState();
      }

      disposePreviewFileCache(fileId);
    },
    [
      clearPreviewState,
      disposePreviewFileCache,
      previewFile,
      processingStatus.state,
      rawData,
      removeQueuedProcessingFile,
      selectedPreviewFileId,
      setExtractionErrors,
      setProcessedData,
      setRawData,
      setSelectedPreviewFileId,
    ],
  );

  return {
    handleClearSession,
    handleDataImported,
    handleDataRemoved,
    hasSessionData,
  };
};
