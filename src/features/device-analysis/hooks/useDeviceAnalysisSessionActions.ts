import {
  useCallback,
  useMemo,
  type Dispatch,
  type SetStateAction,
} from "react";
import type { SsManualRanges } from "../context/device-analysis-session-context";
import type {
  ProcessedEntry,
  ProcessingStatus,
  RawDataEntry,
} from "../lib/sharedTypes";

type UseDeviceAnalysisSessionActionsOptions = {
  clearPreviewState: (options?: { clearSelection?: boolean }) => void;
  disposePreviewFileCache: (fileId: string) => void;
  invalidatePreviewRequests: () => void;
  previewFile?: { fileId?: string } | null;
  processedData?: ProcessedEntry[];
  processingStatus?: Partial<ProcessingStatus>;
  rawData?: RawDataEntry[];
  removeQueuedProcessingFile: (fileId: string) => void;
  resetPreviewWorker: () => void;
  resetProcessingWorker: () => void;
  selectedPreviewFileId?: string | null;
  setProcessedData: Dispatch<SetStateAction<ProcessedEntry[]>>;
  setRawData: Dispatch<SetStateAction<RawDataEntry[]>>;
  setSelectedPreviewFileId: Dispatch<SetStateAction<string | null>>;
  setSsManualRanges: Dispatch<SetStateAction<SsManualRanges>>;
};

export const useDeviceAnalysisSessionActions = ({
  clearPreviewState,
  disposePreviewFileCache,
  invalidatePreviewRequests,
  previewFile = null,
  processedData = [],
  processingStatus = { state: "idle" },
  rawData = [],
  removeQueuedProcessingFile,
  resetPreviewWorker,
  resetProcessingWorker,
  selectedPreviewFileId = null,
  setProcessedData,
  setRawData,
  setSelectedPreviewFileId,
  setSsManualRanges,
}: UseDeviceAnalysisSessionActionsOptions) => {
  const hasSessionData = useMemo(
    () =>
      rawData.length > 0 ||
      processedData.length > 0 ||
      previewFile !== null,
    [previewFile, processedData.length, rawData.length],
  );

  const handleClearSession = useCallback(() => {
    if (!hasSessionData) return;

    resetProcessingWorker();
    invalidatePreviewRequests();
    clearPreviewState({ clearSelection: true });

    setProcessedData([]);
    setRawData([]);
    setSsManualRanges({});
    resetPreviewWorker();
  }, [
    clearPreviewState,
    hasSessionData,
    invalidatePreviewRequests,
    resetPreviewWorker,
    resetProcessingWorker,
    setProcessedData,
    setRawData,
    setSsManualRanges,
  ]);

  const handleDataImported = useCallback(
    (fileInfo: RawDataEntry) => {
      setRawData((prev) => [...prev, fileInfo]);
      if (fileInfo?.fileId) {
        setSelectedPreviewFileId(fileInfo.fileId);
      }
    },
    [setRawData, setSelectedPreviewFileId],
  );

  const handleDataRemoved = useCallback(
    (fileId: string) => {
      if (selectedPreviewFileId === fileId) {
        const remainingFiles = rawData.filter((entry) => entry.fileId !== fileId);
        setSelectedPreviewFileId(remainingFiles[0]?.fileId ?? null);
      }

      setRawData((prev) => prev.filter((entry) => entry.fileId !== fileId));
      setProcessedData((prev) =>
        (Array.isArray(prev) ? prev : []).filter((entry) => entry?.fileId !== fileId),
      );

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
