import type {
  IonIoffManualTargetsByFileId,
  PreviewStatus,
  StateSetter,
  SsManualRanges,
} from "./sessionContext";
import type {
  AnalysisResultsByFileId,
  CleanedEntry,
  ProcessingStatus,
  SessionFile,
} from "src/cs/workbench/contrib/session/common/sessionTypes";
import {
  removeTemplateSelectionsForFiles,
  type TemplateSelectionsByFileId,
} from "src/cs/workbench/contrib/template/common/templateSelection";

type UseSessionActionsOptions = {
  clearPreviewState: (options?: { clearSelection?: boolean }) => void;
  disposePreviewFileCache: (fileId: string) => void;
  invalidatePreviewRequests: () => void;
  previewFile?: { fileId?: string } | null;
  previewLoadingMessage: string;
  cleanedData?: CleanedEntry[];
  processingStatus?: Partial<ProcessingStatus>;
  sourceFiles?: SessionFile[];
  removeQueuedProcessingFile: (fileId: string) => void;
  runInBatch?: (callback: () => void) => void;
  resetPreviewWorker: () => void;
  resetProcessingWorker: () => void;
  selectedPreviewFileId?: string | null;
  setAnalysisResults: StateSetter<AnalysisResultsByFileId>;
  setCleanedData: StateSetter<CleanedEntry[]>;
  setPreviewStatus: StateSetter<PreviewStatus>;
  setSourceFiles: StateSetter<SessionFile[]>;
  setSelectedPreviewFileId: StateSetter<string | null>;
  setSelectedPreviewSheetId: StateSetter<string | null>;
  setFileTemplateSelectionsByFileId: StateSetter<TemplateSelectionsByFileId>;
  setIonIoffManualTargetsByFileId: StateSetter<IonIoffManualTargetsByFileId>;
  setSsManualRanges: StateSetter<SsManualRanges>;
};

export const createSessionActions = ({
  clearPreviewState,
  disposePreviewFileCache,
  invalidatePreviewRequests,
  previewFile = null,
  previewLoadingMessage,
  cleanedData = [],
  processingStatus = { state: "idle" },
  sourceFiles = [],
  removeQueuedProcessingFile,
  runInBatch = (callback) => callback(),
  resetPreviewWorker,
  resetProcessingWorker,
  selectedPreviewFileId = null,
  setAnalysisResults,
  setCleanedData,
  setPreviewStatus,
  setSourceFiles,
  setSelectedPreviewFileId,
  setSelectedPreviewSheetId,
  setFileTemplateSelectionsByFileId,
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
    sourceFiles.length > 0 ||
    cleanedData.length > 0 ||
    previewFile !== null;

  const handleClearSession = () => {
    if (!hasSessionData) return;

    runInBatch(() => {
      resetProcessingWorker();
      invalidatePreviewRequests();
      clearPreviewState({ clearSelection: true });

      setCleanedData([]);
      setAnalysisResults({});
      setSourceFiles([]);
      setSelectedPreviewSheetId(null);
      setFileTemplateSelectionsByFileId({});
      setIonIoffManualTargetsByFileId({});
      setSsManualRanges({});
      resetPreviewWorker();
    });
  };

  const handleFileImported = (fileInfo: SessionFile) => {
    const importedFileId = fileInfo?.fileId ?? null;
    runInBatch(() => {
      setSourceFiles((prev) => [...prev, fileInfo]);
      if (importedFileId && !selectedPreviewFileId) {
        setSelectedPreviewSheetId(null);
        preparePreviewSelection(importedFileId);
        setSelectedPreviewFileId(importedFileId);
      }
    });
  };

  const handleFilesAdded = (files: SessionFile[]) => {
    if (!files.length) {
      return;
    }

    setSourceFiles((prev) => [...prev, ...files]);
  };

  const handleFilesReplaced = (files: SessionFile[]) => {
    runInBatch(() => {
      resetProcessingWorker();
      invalidatePreviewRequests();
      clearPreviewState({ clearSelection: true });

      for (const file of sourceFiles) {
        if (file?.fileId) {
          disposePreviewFileCache(file.fileId);
        }
      }

      setCleanedData([]);
      setAnalysisResults({});
      setFileTemplateSelectionsByFileId({});
      setIonIoffManualTargetsByFileId({});
      setSsManualRanges({});
      resetPreviewWorker();

      const nextSelectedFileId = files[0]?.fileId ?? null;
      setSourceFiles(files);
      setSelectedPreviewSheetId(null);
      if (nextSelectedFileId) {
        preparePreviewSelection(nextSelectedFileId);
      }
      setSelectedPreviewFileId(nextSelectedFileId);
    });
  };

  const handleFileRemoved = (fileId: string) => {
    let nextSelectedFileId: string | null = null;
    if (selectedPreviewFileId === fileId) {
      const remainingFiles = sourceFiles.filter((entry) => entry.fileId !== fileId);
      nextSelectedFileId = remainingFiles[0]?.fileId ?? null;
      setSelectedPreviewFileId(nextSelectedFileId);
      setSelectedPreviewSheetId(null);
    }

    setSourceFiles((prev) => prev.filter((entry) => entry.fileId !== fileId));
    setCleanedData((prev) =>
      (Array.isArray(prev) ? prev : []).filter((entry) => entry?.fileId !== fileId),
    );
    setAnalysisResults((prev) => {
      if (!prev?.[fileId]) return prev;
      const next = { ...prev };
      delete next[fileId];
      return next;
    });
    setFileTemplateSelectionsByFileId((prev) =>
      removeTemplateSelectionsForFiles(prev, [fileId])
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

  const handleFilesRemoved = (fileIds: readonly string[]) => {
    const removedFileIds = new Set(
      fileIds.filter((fileId): fileId is string => typeof fileId === "string" && fileId.length > 0),
    );
    if (removedFileIds.size === 0) {
      return;
    }

    let nextSelectedFileId: string | null = selectedPreviewFileId;
    if (selectedPreviewFileId && removedFileIds.has(selectedPreviewFileId)) {
      const remainingFiles = sourceFiles.filter((entry) => !removedFileIds.has(entry.fileId ?? ""));
      nextSelectedFileId = remainingFiles[0]?.fileId ?? null;
      setSelectedPreviewFileId(nextSelectedFileId);
      setSelectedPreviewSheetId(null);
    }

    setSourceFiles((prev) => prev.filter((entry) => !removedFileIds.has(entry.fileId ?? "")));
    setCleanedData((prev) =>
      (Array.isArray(prev) ? prev : []).filter((entry) => !removedFileIds.has(entry?.fileId ?? "")),
    );
    setAnalysisResults((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const fileId of removedFileIds) {
        if (next[fileId]) {
          delete next[fileId];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
    setFileTemplateSelectionsByFileId((prev) =>
      removeTemplateSelectionsForFiles(prev, removedFileIds)
    );
    setIonIoffManualTargetsByFileId((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const fileId of removedFileIds) {
        if (next[fileId]) {
          delete next[fileId];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
    setSsManualRanges((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const fileId of removedFileIds) {
        if (next[fileId]) {
          delete next[fileId];
          changed = true;
        }
      }
      return changed ? next : prev;
    });

    if (processingStatus.state === "processing") {
      for (const fileId of removedFileIds) {
        removeQueuedProcessingFile(fileId);
      }
    }

    if (previewFile?.fileId && removedFileIds.has(previewFile.fileId)) {
      clearPreviewState();
    }

    for (const fileId of removedFileIds) {
      disposePreviewFileCache(fileId);
    }

    if (
      selectedPreviewFileId &&
      removedFileIds.has(selectedPreviewFileId) &&
      nextSelectedFileId
    ) {
      preparePreviewSelection(nextSelectedFileId);
    }
  };

  const handleFileSelected = (fileId: string | null) => {
    if (!fileId) {
      setSelectedPreviewFileId(null);
      setSelectedPreviewSheetId(null);
      return;
    }

    const hasMatchingFile = sourceFiles.some((entry) => entry?.fileId === fileId);
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
    handleFilesAdded,
    handleFilesReplaced,
    handleFileRemoved,
    handleFilesRemoved,
    handleFileSelected,
    hasSessionData,
  };
};
