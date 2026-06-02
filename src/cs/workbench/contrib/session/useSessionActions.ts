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
  setSelectedPreviewSheetId: StateSetter<string | null>;
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
  setSelectedPreviewSheetId,
  setIonIoffManualTargetsByFileId,
  setSsManualRanges,
}: UseSessionActionsOptions) => {
  const preparePreviewSelection = (
    fileId: string | null,
    options?: { clearCurrentPreview?: boolean },
  ) => {
    invalidatePreviewRequests();
    if (options?.clearCurrentPreview) {
      clearPreviewState();
    }

    if (fileId) {
      setPreviewStatus({ state: "loading", message: previewLoadingMessage });
    }
  };

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
    setSelectedPreviewSheetId(null);
    setIonIoffManualTargetsByFileId({});
    setSsManualRanges({});
    resetPreviewWorker();
  };

  const handleFileImported = (fileInfo: RawDataEntry) => {
    setRawData((prev) => [...prev, fileInfo]);
    const importedFileId = fileInfo?.fileId ?? null;
    if (importedFileId) {
      setSelectedPreviewFileId((currentFileId) => {
        if (currentFileId) {
          return currentFileId;
        }

        preparePreviewSelection(importedFileId);
        setSelectedPreviewSheetId(null);
        return importedFileId;
      });
    }
  };

  const handleFilesReplaced = (files: RawDataEntry[]) => {
    resetProcessingWorker();
    invalidatePreviewRequests();
    clearPreviewState({ clearSelection: true });

    for (const file of rawData) {
      if (file?.fileId) {
        disposePreviewFileCache(file.fileId);
      }
    }

    setProcessedData([]);
    setIonIoffManualTargetsByFileId({});
    setSsManualRanges({});
    setRawData(files);
    resetPreviewWorker();

    const nextSelectedFileId = files[0]?.fileId ?? null;
    setSelectedPreviewFileId(nextSelectedFileId);
    setSelectedPreviewSheetId(null);
    if (nextSelectedFileId) {
      preparePreviewSelection(nextSelectedFileId);
    }
  };

  const handleFileRemoved = (fileId: string) => {
    let nextSelectedFileId: string | null = null;
    if (selectedPreviewFileId === fileId) {
      const remainingFiles = rawData.filter((entry) => entry.fileId !== fileId);
      nextSelectedFileId = remainingFiles[0]?.fileId ?? null;
      setSelectedPreviewFileId(nextSelectedFileId);
      setSelectedPreviewSheetId(null);
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

    if (selectedPreviewFileId === fileId && nextSelectedFileId) {
      preparePreviewSelection(nextSelectedFileId);
    }
  };

  const handleFileSelected = (fileId: string | null) => {
    if (!fileId) {
      setSelectedPreviewFileId(null);
      setSelectedPreviewSheetId(null);
      return;
    }

    const hasMatchingFile = rawData.some((entry) => entry?.fileId === fileId);
    if (!hasMatchingFile) {
      return;
    }

    const isSelectionChanging = selectedPreviewFileId !== fileId;
    if (isSelectionChanging) {
      const previewFileId = previewFile?.fileId ?? null;
      preparePreviewSelection(fileId, {
        clearCurrentPreview: Boolean(previewFileId) && previewFileId !== fileId,
      });
      setSelectedPreviewSheetId(null);
    }

    setSelectedPreviewFileId(fileId);
  };

  return {
    handleClearSession,
    handleFileImported,
    handleFilesReplaced,
    handleFileRemoved,
    handleFileSelected,
    hasSessionData,
  };
};

export const useSessionActions = createSessionActions;
