/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type {
  ProcessingStatus,
  SessionFile,
} from "src/cs/workbench/services/session/common/sessionTypes";
import type { SessionReadModel } from "src/cs/workbench/services/session/common/sessionReadModel";
import type {
  ExplorerImportedSessionFile,
} from "src/cs/workbench/contrib/files/common/explorerPaneViewInput";
import type {
  ExplorerSelectionKind,
  IExplorerService,
} from "src/cs/workbench/contrib/files/common/explorer";
import type {
  FileImportResult,
  ImportedFileRecord,
} from "src/cs/workbench/services/files/common/files";
import {
  createFileImportResultFromRecords,
} from "src/cs/workbench/services/files/browser/fileImportResult";

type ExplorerSelectionService = Pick<
  IExplorerService,
  | "selectedProcessedFileId"
  | "select"
  | "selectedRawFileId"
>;

export type ExplorerSessionSelection = {
  readonly selectedRawFileId: string | null;
  readonly selectedProcessedFileId: string | null;
};

type ExplorerSessionSelectionInput = {
  readonly rawFileIds: readonly string[];
  readonly processedFileIds: readonly string[];
};

type ExplorerSelectionState = Pick<
  IExplorerService,
  | "selectedProcessedFileId"
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

export const createExplorerSessionSelectionInput = (
  readModel: SessionReadModel,
): ExplorerSessionSelectionInput => ({
  processedFileIds: readModel.processedFileIds,
  rawFileIds: readModel.rawFiles.flatMap(file => file.fileId ? [file.fileId] : []),
});

export const resolveExplorerSessionSelection = (
  explorerService: ExplorerSelectionState,
  readModel: SessionReadModel,
): ExplorerSessionSelection => {
  const input = createExplorerSessionSelectionInput(readModel);
  return {
    selectedProcessedFileId: resolveExplorerSelectedFileId(
      explorerService.selectedProcessedFileId,
      input.processedFileIds,
    ),
    selectedRawFileId: resolveExplorerSelectedFileId(
      explorerService.selectedRawFileId,
      input.rawFileIds,
    ),
  };
};

export const reconcileExplorerSessionSelection = (
  explorerService: IExplorerService,
  readModel: SessionReadModel,
): ExplorerSessionSelection => {
  const input = createExplorerSessionSelectionInput(readModel);
  const selectedProcessedFileId = reconcileExplorerSelectedFileId(
    explorerService,
    "analysis",
    explorerService.selectedProcessedFileId,
    input.processedFileIds,
  );
  const selectedRawFileId = reconcileExplorerSelectedFileId(
    explorerService,
    "raw",
    explorerService.selectedRawFileId,
    input.rawFileIds,
  );

  return {
    selectedProcessedFileId,
    selectedRawFileId,
  };
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
    resolveExplorerSelectedFileId(null, getRawFileIds(files));

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
    explorerService.select({ kind: "raw", fileId: null });
    resetPreviewWorker();
  };

  const handleFileImported = (fileInfo: ExplorerImportedSessionFile) => {
    const importedFileId = fileInfo?.fileId ?? null;
    const selectedRawFileId = getSelectedRawFileId();
    commitImportedFiles([fileInfo], "append");
    if (importedFileId && !selectedRawFileId) {
      preparePreviewSelection();
      explorerService.select({
        candidateFileIds: getRawFileIds([...rawFiles, fileInfo]),
        fileId: importedFileId,
        kind: "raw",
      }, "force");
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
      explorerService.select({
        candidateFileIds: getRawFileIds([...rawFiles, ...files]),
        fileId: nextSelectedFileId,
        kind: "raw",
      }, "force");
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
    explorerService.select({
      candidateFileIds: getRawFileIds(files),
      fileId: nextSelectedFileId,
      kind: "raw",
    }, "force");
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

    const previousSelectedFileId = resolveExplorerSelectedFileId(
      explorerService.selectedRawFileId,
      getRawFileIds(),
    );
    const remainingFiles = rawFiles.filter(entry =>
      !removedFileIds.has(String(entry.fileId ?? "").trim())
    );
    const remainingFileIds = getRawFileIds(remainingFiles);

    removeFiles([...removedFileIds]);
    const nextSelectedFileId = resolveExplorerSelectionAfterRemoval({
      currentFileId: explorerService.selectedRawFileId,
      remainingFileIds,
      removedFileIds: [...removedFileIds],
    });
    explorerService.select({
      candidateFileIds: remainingFileIds,
      fileId: nextSelectedFileId,
      kind: "raw",
    }, "force");

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
      explorerService.select({ kind: "raw", fileId: null });
      return;
    }

    const previousSelectedFileId = resolveExplorerSelectedFileId(
      explorerService.selectedRawFileId,
      getRawFileIds(),
    );
    const nextSelectedFileId = explorerService.select({
      candidateFileIds: getRawFileIds(),
      fileId,
      kind: "raw",
    }, "force");
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

export const resolveExplorerSelectedFileId = (
  selectedFileId: string | null,
  fileIds: readonly string[],
): string | null => {
  const candidates = getNormalizedExplorerFileIds(fileIds);
  const normalizedSelectedFileId = normalizeExplorerFileId(selectedFileId);
  if (normalizedSelectedFileId && candidates.includes(normalizedSelectedFileId)) {
    return normalizedSelectedFileId;
  }

  return candidates[0] ?? null;
};

const reconcileExplorerSelectedFileId = (
  explorerService: Pick<IExplorerService, "select">,
  kind: ExplorerSelectionKind,
  selectedFileId: string | null,
  fileIds: readonly string[],
): string | null => {
  const nextSelectedFileId = resolveExplorerSelectedFileId(selectedFileId, fileIds);
  explorerService.select({
    candidateFileIds: fileIds,
    fileId: nextSelectedFileId,
    kind,
  });
  return nextSelectedFileId;
};

const resolveExplorerSelectionAfterRemoval = ({
  currentFileId,
  remainingFileIds,
  removedFileIds,
}: {
  readonly currentFileId: string | null;
  readonly remainingFileIds: readonly string[];
  readonly removedFileIds: readonly string[];
}): string | null => {
  const removed = new Set(getNormalizedExplorerFileIds(removedFileIds));
  const remaining = getNormalizedExplorerFileIds(remainingFileIds)
    .filter(fileId => !removed.has(fileId));
  const current = normalizeExplorerFileId(currentFileId);
  if (!current) {
    return null;
  }

  return removed.has(current)
    ? remaining[0] ?? null
    : resolveExplorerSelectedFileId(current, remaining);
};

const getNormalizedExplorerFileIds = (
  fileIds: readonly string[],
): readonly string[] => {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const fileId of fileIds) {
    const normalized = normalizeExplorerFileId(fileId);
    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    result.push(normalized);
  }

  return result;
};

const normalizeExplorerFileId = (fileId: unknown): string | null => {
  const normalized = String(fileId ?? "").trim();
  return normalized || null;
};
