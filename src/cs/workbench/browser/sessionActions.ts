import type {
  PreviewStatus,
  StateSetter,
} from "src/cs/workbench/services/session/common/session";
import {
  createFileTarget,
  createNoneTarget,
  resolveFileIdFromTarget,
  type SessionTarget,
} from "src/cs/workbench/services/session/common/sessionModel";
import type {
  ProcessingStatus,
  SessionFile,
} from "src/cs/workbench/services/session/common/sessionTypes";

type UseSessionActionsOptions = {
  addRawFiles: (files: readonly SessionFile[]) => void;
  clearSessionData: () => void;
  clearPreviewState: (options?: { clearSelection?: boolean }) => void;
  disposePreviewFileCache: (fileId: string) => void;
  invalidatePreviewRequests: () => void;
  previewFile?: { fileId?: string } | null;
  previewLoadingMessage: string;
  hasSessionData?: boolean;
  processingStatus?: Partial<ProcessingStatus>;
  rawFiles?: SessionFile[];
  removeQueuedProcessingFile: (fileId: string) => void;
  runInBatch?: (callback: () => void) => void;
  resetPreviewWorker: () => void;
  resetProcessingWorker: () => void;
  removeFiles: (fileIds: readonly string[]) => void;
  replaceRawFiles: (files: readonly SessionFile[]) => void;
  activeTarget?: SessionTarget;
  setPreviewStatus: StateSetter<PreviewStatus>;
  setActiveTarget: StateSetter<SessionTarget>;
};

export const createSessionActions = ({
  addRawFiles,
  clearSessionData,
  clearPreviewState,
  disposePreviewFileCache,
  invalidatePreviewRequests,
  previewFile = null,
  previewLoadingMessage,
  hasSessionData = false,
  processingStatus = { state: "idle" },
  rawFiles = [],
  removeQueuedProcessingFile,
  runInBatch = (callback) => callback(),
  resetPreviewWorker,
  resetProcessingWorker,
  removeFiles,
  replaceRawFiles,
  activeTarget = createNoneTarget(),
  setPreviewStatus,
  setActiveTarget,
}: UseSessionActionsOptions) => {
  const activeFileId = resolveFileIdFromTarget(activeTarget);

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

  const hasData = hasSessionData || rawFiles.length > 0 || previewFile !== null;

  const handleClearSession = () => {
    if (!hasData) return;

    runInBatch(() => {
      resetProcessingWorker();
      invalidatePreviewRequests();
      clearPreviewState({ clearSelection: true });

      clearSessionData();
      setActiveTarget(createNoneTarget());
      resetPreviewWorker();
    });
  };

  const handleFileImported = (fileInfo: SessionFile) => {
    const importedFileId = fileInfo?.fileId ?? null;
    runInBatch(() => {
      addRawFiles([fileInfo]);
      if (importedFileId && !activeFileId) {
        preparePreviewSelection(importedFileId);
        setActiveTarget(createFileTarget(importedFileId));
      }
    });
  };

  const handleFilesAdded = (files: SessionFile[]) => {
    if (!files.length) {
      return;
    }

    const nextSelectedFileId = activeFileId ?? files[0]?.fileId ?? null;
    runInBatch(() => {
      addRawFiles(files);
      if (!activeFileId && nextSelectedFileId) {
        preparePreviewSelection(nextSelectedFileId);
        setActiveTarget(createFileTarget(nextSelectedFileId));
      }
    });
  };

  const handleFilesReplaced = (files: SessionFile[]) => {
    runInBatch(() => {
      resetProcessingWorker();
      invalidatePreviewRequests();
      clearPreviewState({ clearSelection: true });

      for (const file of rawFiles) {
        if (file?.fileId) {
          disposePreviewFileCache(file.fileId);
        }
      }

      resetPreviewWorker();

      const nextSelectedFileId = files[0]?.fileId ?? null;
      replaceRawFiles(files);
      if (nextSelectedFileId) {
        preparePreviewSelection(nextSelectedFileId);
      }
      setActiveTarget(nextSelectedFileId
        ? createFileTarget(nextSelectedFileId)
        : createNoneTarget());
    });
  };

  const handleFileRemoved = (fileId: string) => {
    handleFilesRemoved([fileId]);
  };

  const handleFilesRemoved = (fileIds: readonly string[]) => {
    const removedFileIds = new Set(
      fileIds
        .map((fileId) => String(fileId ?? "").trim())
        .filter((fileId) => fileId.length > 0),
    );
    if (removedFileIds.size === 0) {
      return;
    }

    let nextSelectedFileId: string | null = activeFileId;
    if (activeFileId && removedFileIds.has(activeFileId)) {
      const remainingFiles = rawFiles.filter((entry) => !removedFileIds.has(entry.fileId ?? ""));
      nextSelectedFileId = remainingFiles[0]?.fileId ?? null;
    }

    runInBatch(() => {
      removeFiles([...removedFileIds]);
      if (nextSelectedFileId) {
        setActiveTarget(createFileTarget(nextSelectedFileId));
      } else if (activeFileId && removedFileIds.has(activeFileId)) {
        setActiveTarget(createNoneTarget());
      }

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
        activeFileId &&
        removedFileIds.has(activeFileId) &&
        nextSelectedFileId
      ) {
        preparePreviewSelection(nextSelectedFileId);
      }
    });
  };

  const handleFileSelected = (fileId: string | null) => {
    if (!fileId) {
      setActiveTarget(createNoneTarget());
      return;
    }

    const hasMatchingFile = rawFiles.some((entry) => entry?.fileId === fileId);
    if (!hasMatchingFile) {
      return;
    }

    const isSelectionChanging = activeFileId !== fileId;
    if (isSelectionChanging) {
      const previewFileId = previewFile?.fileId ?? null;
      preparePreviewSelection(fileId, {
        clearCurrentPreview: Boolean(previewFileId) && previewFileId !== fileId,
      });
    }

    setActiveTarget(createFileTarget(fileId));
  };

  return {
    handleClearSession,
    handleFileImported,
    handleFilesAdded,
    handleFilesReplaced,
    handleFileRemoved,
    handleFilesRemoved,
    handleFileSelected,
    hasSessionData: hasData,
  };
};
