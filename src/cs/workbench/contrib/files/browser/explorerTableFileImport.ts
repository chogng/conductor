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
import type {
  ITableFileService,
} from "src/cs/workbench/services/tablefile/common/tableFile";
import {
  markTemplateApplyPerformanceTrace,
} from "src/cs/workbench/contrib/performance/browser/templateApplyPerformanceTrace";

export type ExplorerTableFileImportResult = {
  readonly importedFileIds: readonly string[];
  readonly selectedFileId: string | null;
  readonly shouldNavigateToTable: boolean;
};

type ExplorerTableFileImportOptions = {
  readonly explorerService: Pick<IExplorerService, "selectedRawFileId" | "select">;
  readonly importedFiles: readonly PreparedFileImportInfo[];
  readonly mode: "append" | "replace";
  readonly selectedFileId?: string | null;
  readonly tableFileService: Pick<
    ITableFileService,
    | "clearTableFiles"
    | "commitImport"
    | "getSnapshot"
  >;
};

type NormalizedPreparedFileImportInfo = PreparedFileImportInfo & {
  readonly fileId: string;
  readonly importRecord: ImportedFileRecord;
};

export const commitExplorerTableFileImport = ({
  explorerService,
  importedFiles,
  mode,
  selectedFileId,
  tableFileService,
}: ExplorerTableFileImportOptions): ExplorerTableFileImportResult => {
  const normalizedFiles = normalizePreparedImportedFiles(importedFiles);
  if (!normalizedFiles.length) {
    return {
      importedFileIds: [],
      selectedFileId: null,
      shouldNavigateToTable: false,
    };
  }

  const currentRawFileIds = getTableFileIds(tableFileService);
  const currentSelectedRawFileId = normalizeFileId(explorerService.selectedRawFileId);
  const importResult = createFileImportResultFromRecords(
    normalizedFiles.map(file => file.importRecord),
  );
  markTemplateApplyPerformanceTrace("import.tableFile.commit.start", {
    fileCount: normalizedFiles.length,
    mode,
  });

  if (mode === "replace") {
    tableFileService.clearTableFiles();
    const commitResult = tableFileService.commitImport(importResult);
    const committedFileIds = commitResult.importedFileIds;
    markTemplateApplyPerformanceTrace("import.tableFile.commit.complete", {
      committedFileCount: committedFileIds.length,
      mode,
      skippedDuplicateFileCount: commitResult.skippedDuplicateFileIds.length,
    });
    const nextSelectedFileId = resolveExplorerSelectedFileId(
      selectedFileId ?? committedFileIds[0] ?? null,
      committedFileIds,
    );
    explorerService.select({
      candidateFileIds: committedFileIds,
      fileId: nextSelectedFileId,
      kind: "table",
    }, "force");
    return {
      importedFileIds: committedFileIds,
      selectedFileId: nextSelectedFileId,
      shouldNavigateToTable: committedFileIds.length > 0,
    };
  }

  const commitResult = tableFileService.commitImport(importResult);
  const committedFileIds = commitResult.importedFileIds;
  markTemplateApplyPerformanceTrace("import.tableFile.commit.complete", {
    committedFileCount: committedFileIds.length,
    mode,
    skippedDuplicateFileCount: commitResult.skippedDuplicateFileIds.length,
  });
  if (!committedFileIds.length) {
    return {
      importedFileIds: [],
      selectedFileId: null,
      shouldNavigateToTable: false,
    };
  }

  const nextRawFileIds = uniqueFileIds([...currentRawFileIds, ...committedFileIds]);
  const nextSelectedFileId = currentSelectedRawFileId && nextRawFileIds.includes(currentSelectedRawFileId)
    ? currentSelectedRawFileId
    : resolveExplorerSelectedFileId(committedFileIds[0] ?? null, nextRawFileIds);
  if (nextSelectedFileId !== currentSelectedRawFileId) {
    explorerService.select({
      candidateFileIds: nextRawFileIds,
      fileId: nextSelectedFileId,
      kind: "table",
    }, "force");
  }

  return {
    importedFileIds: committedFileIds,
    selectedFileId: nextSelectedFileId,
    shouldNavigateToTable: true,
  };
};

const getTableFileIds = (
  tableFileService: Pick<ITableFileService, "getSnapshot">,
): readonly string[] => {
  const snapshot = tableFileService.getSnapshot();
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
