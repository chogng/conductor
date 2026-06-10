/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { localize } from "src/cs/nls";
import type { SessionFile } from "src/cs/workbench/services/session/common/sessionTypes";
import {
  buildItemKey,
} from "src/cs/workbench/services/files/common/files";
import type {
  ImportedFileRecord,
} from "src/cs/workbench/services/files/common/files";
import {
  createImportedFileRecord,
} from "src/cs/workbench/services/files/browser/fileImportResult";
import type { ExplorerFileEntry } from "src/cs/workbench/services/explorer/common/explorerModel";
import {
  ImportPrepareError,
  type ImportFileSource,
  prepareImportFile,
} from "src/cs/workbench/services/explorer/browser/explorerFilePreparation";
import type { FileConverterBackend } from "src/cs/workbench/services/files/common/fileConverterBackend";
import type {
  PendingImportFile,
} from "src/cs/workbench/services/files/browser/pendingImportFiles";

export type ImportSessionFileEntry = ExplorerFileEntry & {
  fileId: string;
  file: File;
  itemKey: string;
  sourceKey: string;
};

export type ImportSessionFileInfo = SessionFile & {
  fileId: string;
  fileName: string;
  file: File;
  importRecord: ImportedFileRecord;
  size: number;
  lastModified: number;
  normalizedCsvPath?: string | null;
  relativePath?: string | null;
  sourceKey?: string;
  sourcePath?: string | null;
};

export type PreparedImportFile = {
  readonly fileEntry: ImportSessionFileEntry;
  readonly fileInfo: ImportSessionFileInfo;
};

export type ImportFilePrepareFailure = {
  readonly code: string | null;
  readonly fileName: string;
  readonly message: string;
};

export type PendingImportFileResult =
  | { readonly ok: true; readonly prepared: PreparedImportFile }
  | { readonly ok: false; readonly error: ImportFilePrepareFailure };

const createFileId = (): string => {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }

  return `file_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`;
};

const toPrepareFailure = (
  error: unknown,
  fileName: string,
): ImportFilePrepareFailure => {
  const code =
    error instanceof ImportPrepareError
      ? error.code
      : error && typeof error === "object" && "code" in error &&
          typeof (error as { code?: unknown }).code === "string"
        ? (error as { code: string }).code
        : null;
  const message =
    error instanceof Error && error.message.trim()
      ? error.message
      : "Import file preparation failed.";

  return {
    code,
    fileName,
    message,
  };
};

const resolvePreparedFileSource = (
  pendingImportFile: PendingImportFile,
): ImportFileSource => {
  if (pendingImportFile.canUseNativePath === false) {
    return { kind: "data" };
  }

  const path =
    pendingImportFile.kind === "path"
      ? String(pendingImportFile.resource?.fsPath ?? "").trim()
      : "";

  return path ? { kind: "path", path } : { kind: "data" };
};

export const preparePendingImportFile = async (
  fileConverterBackend: FileConverterBackend,
  pendingImportFile: PendingImportFile,
): Promise<PendingImportFileResult> => {
  const {
    finishFilePerf,
    relativePath,
    sourceFile,
    sourceKey,
  } = pendingImportFile;
  let normalizedFile: File;
  let normalizedCsvPath: string | null = null;
  let sourcePath: string | null = null;
  let normalizedSizeBytes = 0;
  let importRecord: ImportedFileRecord;

  try {
    const prepared = await prepareImportFile(
      fileConverterBackend,
      sourceFile ?? null,
      resolvePreparedFileSource(pendingImportFile),
      {
        fileName: pendingImportFile.sourceName,
        lastModified: pendingImportFile.lastModified,
        loadFile: pendingImportFile.loadFile,
        size: pendingImportFile.sourceSize,
      },
    );
    normalizedFile = prepared.file;
    normalizedCsvPath = prepared.normalizedCsvPath ?? null;
    sourcePath = prepared.sourcePath ?? null;
    normalizedSizeBytes = prepared.normalizedSizeBytes;
    importRecord = await createImportedFileRecord({
      file: normalizedFile,
      fileId: createFileId(),
      fileName: pendingImportFile.sourceName,
      lastModified: normalizedFile.lastModified,
      normalizedCsvPath,
      relativePath,
      sourcePath,
      sourceSizeBytes: pendingImportFile.sourceSize,
    });
  } catch (error) {
    const failure = toPrepareFailure(
      error,
      pendingImportFile.sourceName || localize("import.unknownFile", "Unknown file"),
    );
    finishFilePerf({
      code: failure.code,
      failed: "prepare",
      message: failure.message,
    });
    return {
      error: failure,
      ok: false,
    };
  }

  const fileId = importRecord.id;
  const fileEntry: ImportSessionFileEntry = {
    fileId,
    file: normalizedFile,
    itemKey: buildItemKey(normalizedFile, relativePath),
    normalizedCsvPath,
    relativePath,
    sourceKey,
    sourcePath,
  };
  const fileInfo: ImportSessionFileInfo = {
    fileId,
    fileName: pendingImportFile.sourceName,
    file: normalizedFile,
    importRecord,
    size: normalizedSizeBytes,
    lastModified: normalizedFile.lastModified,
    normalizedCsvPath,
    relativePath,
    sourceKey,
    sourcePath,
  };

  finishFilePerf({
    accepted: true,
    fileId,
    normalizedSizeBytes,
  });

  return {
    ok: true,
    prepared: { fileEntry, fileInfo },
  };
};
