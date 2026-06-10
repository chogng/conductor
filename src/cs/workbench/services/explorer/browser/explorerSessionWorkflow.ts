/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type {
  ProcessingStatus,
  SessionFile,
} from "src/cs/workbench/services/session/common/sessionTypes";
import type {
  ExplorerImportedSessionFile,
} from "src/cs/workbench/services/explorer/common/explorerPaneViewInput";
import type { IExplorerService } from "src/cs/workbench/services/explorer/common/explorer";
import type {
  FileImportResult,
  ImportedFileRecord,
} from "src/cs/workbench/services/files/common/files";
import {
  createFileImportResultFromRecords,
} from "src/cs/workbench/services/files/browser/fileImportResult";

type ExplorerSelectionService = Pick<
  IExplorerService,
  | "clearSelection"
  | "removeFileIdsFromSelection"
  | "resolveSelectedRawFileId"
  | "selectFile"
  | "selectedRawFileId"
>;

type ExplorerSessionWorkflowOptions = {
  clearSession: () => void;
  commitFileImport: (result: FileImportResult) => void;
  clearPreviewState: (options?: { clearSelection?: boolean }) => void;
  disposePreviewFileCache: (fileId: string) => void;
  invalidatePreviewRequests: () => void;
  explorerService: ExplorerSelectionService;
  previewFile?: { fileId?: string } | null;
  hasSessionData?: boolean;
  processingStatus?: Partial<ProcessingStatus>;
  rawFiles?: SessionFile[];
  removeQueuedProcessingFile: (fileId: string) => void;
  resetPreviewWorker: () => void;
  resetProcessingWorker: () => void;
  removeFiles: (fileIds: readonly string[]) => void;
};

export function createExplorerSessionWorkflow({
  clearSession,
  commitFileImport,
  clearPreviewState,
  disposePreviewFileCache,
  invalidatePreviewRequests,
  explorerService,
  previewFile = null,
  hasSessionData = false,
  processingStatus = { state: "idle" },
  rawFiles = [],
  removeQueuedProcessingFile,
  resetPreviewWorker,
  resetProcessingWorker,
  removeFiles,
}: ExplorerSessionWorkflowOptions) {
  const getRawFileIds = (files: readonly SessionFile[] = rawFiles): readonly string[] =>
    files
      .map(file => String(file.fileId ?? "").trim())
      .filter(fileId => fileId.length > 0);
  const getSelectedRawFileId = (files: readonly SessionFile[] = rawFiles): string | null =>
    explorerService.selectedRawFileId ??
    explorerService.resolveSelectedRawFileId(getRawFileIds(files));

  const preparePreviewSelection = (options?: { clearCurrentPreview?: boolean }) => {
    invalidatePreviewRequests();
    if (options?.clearCurrentPreview) {
      clearPreviewState();
    }
  };

  const hasData = hasSessionData || rawFiles.length > 0 || previewFile !== null;

  const commitImportedFiles = (
    files: readonly ExplorerImportedSessionFile[],
    mode: "append" | "replace",
  ): void => {
    const importRecords = getImportedFileRecords(files);
    if (mode === "replace") {
      clearSession();
    }
    commitFileImport(createFileImportResultFromRecords(importRecords));
  };

  const handleClearSession = () => {
    if (!hasData) return;

    resetProcessingWorker();
    invalidatePreviewRequests();
    clearPreviewState({ clearSelection: true });

    clearSession();
    explorerService.clearSelection("raw");
    resetPreviewWorker();
  };

  const handleFileImported = (fileInfo: ExplorerImportedSessionFile) => {
    const importedFileId = fileInfo?.fileId ?? null;
    const selectedRawFileId = getSelectedRawFileId();
    commitImportedFiles([fileInfo], "append");
    if (importedFileId && !selectedRawFileId) {
      preparePreviewSelection();
      explorerService.selectFile("raw", importedFileId, getRawFileIds([...rawFiles, fileInfo]));
    }
  };

  const handleFilesAdded = (files: ExplorerImportedSessionFile[]) => {
    if (!files.length) {
      return;
    }

    const selectedRawFileId = getSelectedRawFileId();
    const nextSelectedFileId = selectedRawFileId ?? files[0]?.fileId ?? null;
    commitImportedFiles(files, "append");
    if (!selectedRawFileId && nextSelectedFileId) {
      preparePreviewSelection();
      explorerService.selectFile("raw", nextSelectedFileId, getRawFileIds([...rawFiles, ...files]));
    }
  };

  const handleFilesReplaced = (files: ExplorerImportedSessionFile[]) => {
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
    commitImportedFiles(files, "replace");
    if (nextSelectedFileId) {
      preparePreviewSelection();
    }
    explorerService.selectFile("raw", nextSelectedFileId, getRawFileIds(files));
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

    const previousSelectedFileId = explorerService.resolveSelectedRawFileId(getRawFileIds());
    const remainingFiles = rawFiles.filter(entry =>
      !removedFileIds.has(String(entry.fileId ?? "").trim())
    );
    let nextSelectedFileId: string | null = previousSelectedFileId;

    removeFiles([...removedFileIds]);
    nextSelectedFileId = explorerService.removeFileIdsFromSelection({
      kind: "raw",
      remainingFileIds: getRawFileIds(remainingFiles),
      removedFileIds: [...removedFileIds],
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
      previousSelectedFileId &&
      removedFileIds.has(previousSelectedFileId) &&
      nextSelectedFileId
    ) {
      preparePreviewSelection();
    }
  };

  const handleFileSelected = (fileId: string | null) => {
    if (!fileId) {
      explorerService.clearSelection("raw");
      return;
    }

    const previousSelectedFileId = explorerService.resolveSelectedRawFileId(getRawFileIds());
    const nextSelectedFileId = explorerService.selectFile("raw", fileId, getRawFileIds());
    const isSelectionChanging = Boolean(nextSelectedFileId) &&
      previousSelectedFileId !== nextSelectedFileId;
    if (isSelectionChanging) {
      const previewFileId = previewFile?.fileId ?? null;
      preparePreviewSelection({
        clearCurrentPreview: Boolean(previewFileId) && previewFileId !== nextSelectedFileId,
      });
    }
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
}

const getImportedFileRecords = (
  files: readonly ExplorerImportedSessionFile[],
): readonly ImportedFileRecord[] => {
  return files.map(file => file.importRecord);
};
