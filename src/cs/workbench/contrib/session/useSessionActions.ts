import type {
  IonIoffManualTargetsByFileId,
  PreviewStatus,
  StateSetter,
  SsManualRanges,
} from "./analysis-session-context";
import type {
  ProcessedEntry,
  ProcessingStatus,
  RawDataEntry,
} from "src/cs/workbench/common/deviceAnalysis/sharedTypes";

type UseSessionActionsOptions = {
  clearPreviewState: (options?: { clearSelection?: boolean }) => void;
  disposePreviewFileCache: (fileId: string) => void;
  invalidatePreviewRequests: () => void;
  previewFile?: { fileId?: string } | null;
  previewLoadingMessage: string;
  processedData?: ProcessedEntry[];
  processingStatus?: Partial<ProcessingStatus>;
  rawData?: RawDataEntry[];
  removeQueuedProcessingFile: (fileId: string) => void;
  resetPreviewWorker: () => void;
  resetProcessingWorker: () => void;
  selectedPreviewFileId?: string | null;
  setProcessedData: StateSetter<ProcessedEntry[]>;
  setPreviewStatus: StateSetter<PreviewStatus>;
  setRawData: StateSetter<RawDataEntry[]>;
  setSelectedPreviewFileId: StateSetter<string | null>;
  setIonIoffManualTargetsByFileId: StateSetter<IonIoffManualTargetsByFileId>;
  setSsManualRanges: StateSetter<SsManualRanges>;
};

export const createSessionActions = ({
  clearPreviewState,
  disposePreviewFileCache,
  invalidatePreviewRequests,
  previewFile = null,
  previewLoadingMessage,
  processedData = [],
  processingStatus = { state: "idle" },
  rawData = [],
  removeQueuedProcessingFile,
  resetPreviewWorker,
  resetProcessingWorker,
  selectedPreviewFileId = null,
  setProcessedData,
  setPreviewStatus,
  setRawData,
  setSelectedPreviewFileId,
  setIonIoffManualTargetsByFileId,
  setSsManualRanges,
}: UseSessionActionsOptions) => {
  const hasSessionData =
    rawData.length > 0 ||
    processedData.length > 0 ||
    previewFile !== null;

  const handleClearSession = () => {
    if (!hasSessionData) return;

    resetProcessingWorker();
    invalidatePreviewRequests();
    clearPreviewState({ clearSelection: true });

    setProcessedData([]);
    setRawData([]);
    setIonIoffManualTargetsByFileId({});
    setSsManualRanges({});
    resetPreviewWorker();
  };

  const handleFileImported = (fileInfo: RawDataEntry) => {
    setRawData((prev) => [...prev, fileInfo]);
    if (fileInfo?.fileId) {
      setSelectedPreviewFileId((currentFileId) => {
        if (currentFileId) {
          return currentFileId;
        }

        setPreviewStatus({ state: "loading", message: previewLoadingMessage });
        return fileInfo.fileId ?? null;
      });
    }
  };

  const handleFileRemoved = (fileId: string) => {
    if (selectedPreviewFileId === fileId) {
      const remainingFiles = rawData.filter((entry) => entry.fileId !== fileId);
      setSelectedPreviewFileId(remainingFiles[0]?.fileId ?? null);
    }

    setRawData((prev) => prev.filter((entry) => entry.fileId !== fileId));
    setProcessedData((prev) =>
      (Array.isArray(prev) ? prev : []).filter((entry) => entry?.fileId !== fileId),
    );
    setIonIoffManualTargetsByFileId((prev) => {
      if (!prev?.[fileId]) return prev;
      const next = { ...prev };
      delete next[fileId];
      return next;
    });

    if (processingStatus.state === "processing") {
      removeQueuedProcessingFile(fileId);
    }

    if (previewFile?.fileId === fileId) {
      clearPreviewState();
    }

    disposePreviewFileCache(fileId);
  };

  const handleFileSelected = (fileId: string | null) => {
    if (!fileId) {
      setSelectedPreviewFileId(null);
      return;
    }

    const hasMatchingFile = rawData.some((entry) => entry?.fileId === fileId);
    if (!hasMatchingFile) {
      return;
    }

    const isSelectionChanging = selectedPreviewFileId !== fileId;
    if (isSelectionChanging) {
      invalidatePreviewRequests();
      if (previewFile?.fileId && previewFile.fileId !== fileId) {
        clearPreviewState();
      }
      setPreviewStatus({ state: "loading", message: previewLoadingMessage });
    }

    setSelectedPreviewFileId(fileId);
  };

  return {
    handleClearSession,
    handleFileImported,
    handleFileRemoved,
    handleFileSelected,
    hasSessionData,
  };
};

export const useSessionActions = createSessionActions;
