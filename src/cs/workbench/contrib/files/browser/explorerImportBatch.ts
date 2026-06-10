/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type { FileConverterBackend } from "src/cs/workbench/services/files/common/fileConverterBackend";
import type { PendingImportFile } from "src/cs/workbench/services/files/browser/pendingImportFiles";
import {
  preparePendingImportFile,
  type ImportFilePrepareFailure,
  type PreparedImportFile,
} from "src/cs/workbench/contrib/files/browser/explorerImportPipeline";

const EXPLORER_IMPORT_APPEND_BATCH_SIZE = 32;
const EXPLORER_IMPORT_PREPARE_CONCURRENCY = 8;

export type FirstPreparedExplorerImport = {
  readonly attemptedIndexes: Set<number>;
  readonly result: {
    readonly prepared: PreparedImportFile;
  } | null;
};

export async function prepareFirstExplorerImportFile({
  canApplyResult,
  failedFiles,
  fileConverterBackend,
  pendingImportFiles,
  selectedRelativePath,
}: {
  readonly canApplyResult: () => boolean;
  readonly failedFiles: ImportFilePrepareFailure[];
  readonly fileConverterBackend: FileConverterBackend;
  readonly pendingImportFiles: readonly PendingImportFile[];
  readonly selectedRelativePath: string | null;
}): Promise<FirstPreparedExplorerImport> {
  const attemptedIndexes = new Set<number>();
  for (const index of getPriorityImportIndexes(
    pendingImportFiles,
    selectedRelativePath,
  )) {
    if (!canApplyResult()) {
      break;
    }

    const pendingImportFile = pendingImportFiles[index];
    if (!pendingImportFile) {
      continue;
    }

    attemptedIndexes.add(index);
    const preparedImportFile = await preparePendingImportFile(
      fileConverterBackend,
      pendingImportFile,
    );
    if (!preparedImportFile.ok) {
      failedFiles.push(preparedImportFile.error);
      continue;
    }

    return {
      attemptedIndexes,
      result: {
        prepared: preparedImportFile.prepared,
      },
    };
  }

  return {
    attemptedIndexes,
    result: null,
  };
}

export async function prepareRemainingExplorerImportFiles({
  canApplyResult,
  failedFiles,
  fileConverterBackend,
  onPreparedFiles,
  pendingImportFiles,
  skippedIndexes,
}: {
  readonly canApplyResult: () => boolean;
  readonly failedFiles: ImportFilePrepareFailure[];
  readonly fileConverterBackend: FileConverterBackend;
  readonly onPreparedFiles: (preparedFiles: readonly PreparedImportFile[]) => void;
  readonly pendingImportFiles: readonly PendingImportFile[];
  readonly skippedIndexes: ReadonlySet<number>;
}): Promise<number> {
  const remainingIndexes = pendingImportFiles
    .map((_file, index) => index)
    .filter(index => !skippedIndexes.has(index));
  if (remainingIndexes.length === 0) {
    return 0;
  }

  const readyByIndex = new Map<number, PreparedImportFile>();
  const completedIndexes = new Set<number>();
  let nextAppendOffset = 0;
  let nextImportIndex = 0;
  let acceptedCount = 0;

  const flushReadyImports = (): number => {
    if (!canApplyResult()) {
      return 0;
    }

    const preparedFiles: PreparedImportFile[] = [];
    while (
      nextAppendOffset < remainingIndexes.length &&
      preparedFiles.length < EXPLORER_IMPORT_APPEND_BATCH_SIZE
    ) {
      const index = remainingIndexes[nextAppendOffset];
      if (!completedIndexes.has(index)) {
        break;
      }

      const prepared = readyByIndex.get(index);
      if (prepared) {
        preparedFiles.push(prepared);
      }
      nextAppendOffset += 1;
    }

    if (preparedFiles.length === 0) {
      return 0;
    }

    onPreparedFiles(preparedFiles);
    return preparedFiles.length;
  };

  const workerCount = Math.min(
    EXPLORER_IMPORT_PREPARE_CONCURRENCY,
    remainingIndexes.length,
  );
  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (canApplyResult()) {
        const remainingIndex = nextImportIndex;
        nextImportIndex += 1;
        const index = remainingIndexes[remainingIndex];
        if (typeof index !== "number") {
          return;
        }

        const pendingImportFile = pendingImportFiles[index];
        if (!pendingImportFile) {
          return;
        }

        const preparedImportFile = await preparePendingImportFile(
          fileConverterBackend,
          pendingImportFile,
        );
        if (!canApplyResult()) {
          return;
        }

        if (preparedImportFile.ok) {
          readyByIndex.set(index, preparedImportFile.prepared);
        } else {
          failedFiles.push(preparedImportFile.error);
        }
        completedIndexes.add(index);
        acceptedCount += flushReadyImports();
      }
    }),
  );

  while (flushReadyImports() > 0) {
    // Drain completed batches larger than EXPLORER_IMPORT_APPEND_BATCH_SIZE.
  }

  return acceptedCount;
}

function getPriorityImportIndexes(
  pendingImportFiles: readonly PendingImportFile[],
  selectedRelativePath: string | null,
): number[] {
  const selectedIndex = selectedRelativePath
    ? pendingImportFiles.findIndex(file =>
      normalizeRelativePath(file.relativePath) === selectedRelativePath
    )
    : -1;
  const indexes: number[] = [];
  if (selectedIndex >= 0) {
    indexes.push(selectedIndex);
  }

  for (let index = 0; index < pendingImportFiles.length; index += 1) {
    if (index !== selectedIndex) {
      indexes.push(index);
    }
  }

  return indexes;
}

function normalizeRelativePath(value: unknown): string | null {
  const relativePath = String(value ?? "").trim();
  return relativePath || null;
}
