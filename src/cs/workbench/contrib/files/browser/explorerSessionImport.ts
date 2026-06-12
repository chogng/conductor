/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type { IExplorerService } from "src/cs/workbench/contrib/files/browser/files";
import type {
  PreparedFileImportInfo,
} from "src/cs/workbench/contrib/files/browser/fileImportExport";
import {
  resolveExplorerSelectedFileId,
} from "src/cs/workbench/contrib/files/common/explorerModel";
import {
  createFileImportResultFromRecords,
  type ImportedFileRecord,
} from "src/cs/workbench/services/files/common/files";
import type { ISessionService } from "src/cs/workbench/services/session/common/session";

export type ExplorerSessionImportResult = {
  readonly importedFileIds: readonly string[];
  readonly selectedFileId: string | null;
  readonly shouldNavigateToTable: boolean;
};

type ExplorerSessionImportOptions = {
  readonly explorerService: Pick<IExplorerService, "selectedRawFileId" | "select">;
  readonly importedFiles: readonly PreparedFileImportInfo[];
  readonly mode: "append" | "replace";
  readonly selectedFileId?: string | null;
  readonly sessionService: Pick<
    ISessionService,
    | "clearSession"
    | "commitFileImport"
    | "getSnapshot"
  >;
};

type NormalizedPreparedFileImportInfo = PreparedFileImportInfo & {
  readonly fileId: string;
  readonly importRecord: ImportedFileRecord;
};

export const commitExplorerSessionImport = ({
  explorerService,
  importedFiles,
  mode,
  selectedFileId,
  sessionService,
}: ExplorerSessionImportOptions): ExplorerSessionImportResult => {
  const normalizedFiles = normalizePreparedImportedFiles(importedFiles);
  if (!normalizedFiles.length) {
    return {
      importedFileIds: [],
      selectedFileId: null,
      shouldNavigateToTable: false,
    };
  }

  const currentRawFileIds = getSessionRawFileIds(sessionService);
  const currentSelectedRawFileId = normalizeFileId(explorerService.selectedRawFileId);
  const importedFileIds = normalizedFiles.map(file => file.fileId);
  const importResult = createFileImportResultFromRecords(
    normalizedFiles.map(file => file.importRecord),
  );

  if (mode === "replace") {
    sessionService.clearSession();
    sessionService.commitFileImport(importResult);
    const nextSelectedFileId = resolveExplorerSelectedFileId(
      selectedFileId ?? importedFileIds[0] ?? null,
      importedFileIds,
    );
    explorerService.select({
      candidateFileIds: importedFileIds,
      fileId: nextSelectedFileId,
      kind: "table",
    }, "force");
    return {
      importedFileIds,
      selectedFileId: nextSelectedFileId,
      shouldNavigateToTable: true,
    };
  }

  sessionService.commitFileImport(importResult);
  const nextRawFileIds = uniqueFileIds([...currentRawFileIds, ...importedFileIds]);
  const nextSelectedFileId = currentSelectedRawFileId && nextRawFileIds.includes(currentSelectedRawFileId)
    ? currentSelectedRawFileId
    : resolveExplorerSelectedFileId(importedFileIds[0] ?? null, nextRawFileIds);
  if (nextSelectedFileId !== currentSelectedRawFileId) {
    explorerService.select({
      candidateFileIds: nextRawFileIds,
      fileId: nextSelectedFileId,
      kind: "table",
    }, "force");
  }

  return {
    importedFileIds,
    selectedFileId: nextSelectedFileId,
    shouldNavigateToTable: true,
  };
};

const getSessionRawFileIds = (
  sessionService: Pick<ISessionService, "getSnapshot">,
): readonly string[] => {
  const snapshot = sessionService.getSnapshot();
  return snapshot.fileOrder
    .map(fileId => normalizeFileId(fileId))
    .filter((fileId): fileId is string => Boolean(fileId && snapshot.filesById[fileId]));
};

const normalizeFileId = (value: unknown): string | null => {
  const fileId = String(value ?? "").trim();
  return fileId || null;
};

const uniqueFileIds = (values: readonly string[]): readonly string[] => {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const fileId = normalizeFileId(value);
    if (!fileId || seen.has(fileId)) {
      continue;
    }

    seen.add(fileId);
    result.push(fileId);
  }

  return result;
};

const normalizePreparedImportedFiles = (
  files: readonly PreparedFileImportInfo[],
): readonly NormalizedPreparedFileImportInfo[] => {
  const result: NormalizedPreparedFileImportInfo[] = [];
  const seen = new Set<string>();
  for (const file of files) {
    const fileId = normalizeFileId(file?.fileId);
    if (!fileId || seen.has(fileId)) {
      continue;
    }

    seen.add(fileId);
    result.push(file.fileId === fileId ? file : {
      ...file,
      fileId,
    });
  }

  return result;
};
