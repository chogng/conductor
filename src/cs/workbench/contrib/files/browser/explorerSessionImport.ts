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
import {
  createRawTableAssessmentRecordFromImportAssessment,
} from "src/cs/workbench/services/assessment/common/assessmentRecord";
import type { RawTableAssessmentRecord } from "src/cs/workbench/services/assessment/common/assessment";
import type { ISessionService } from "src/cs/workbench/services/session/common/session";
import {
  markImportBadgeTrace,
} from "src/cs/workbench/contrib/files/browser/importBadgeTrace";

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
    | "commitRawTableAssessments"
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
  const importResult = createFileImportResultFromRecords(
    normalizedFiles.map(file => file.importRecord),
  );
  markImportBadgeTrace("import.session.commit.start", {
    fileCount: normalizedFiles.length,
    mode,
    preparedAssessmentCount: normalizedFiles.filter(file => file.preparedAssessment).length,
  });

  if (mode === "replace") {
    sessionService.clearSession();
    const commitResult = sessionService.commitFileImport(importResult);
    const committedFileIds = commitResult.importedFileIds;
    commitPreparedImportAssessments(normalizedFiles, committedFileIds, sessionService);
    markImportBadgeTrace("import.session.commit.complete", {
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

  const commitResult = sessionService.commitFileImport(importResult);
  const committedFileIds = commitResult.importedFileIds;
  commitPreparedImportAssessments(normalizedFiles, committedFileIds, sessionService);
  markImportBadgeTrace("import.session.commit.complete", {
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

const commitPreparedImportAssessments = (
  importedFiles: readonly NormalizedPreparedFileImportInfo[],
  committedFileIds: readonly string[],
  sessionService: Pick<ISessionService, "commitRawTableAssessments" | "getSnapshot">,
): void => {
  const committedFileIdSet = new Set(committedFileIds);
  if (!committedFileIdSet.size) {
    return;
  }

  const snapshot = sessionService.getSnapshot();
  const assessments: RawTableAssessmentRecord[] = [];
  for (const importedFile of importedFiles) {
    if (!committedFileIdSet.has(importedFile.fileId) || !importedFile.preparedAssessment) {
      continue;
    }

    const file = snapshot.filesById[importedFile.fileId];
    const rawTableId = normalizeFileId(file?.raw.tableOrder[0]);
    const table = rawTableId ? file?.raw.tablesById[rawTableId] : undefined;
    const sourceRawTableVersion = rawTableId
      ? Math.floor(Number(file?.rawTableVersionsById?.[rawTableId]))
      : NaN;
    if (!file || !rawTableId || !table || !Number.isFinite(sourceRawTableVersion)) {
      continue;
    }

    assessments.push(createRawTableAssessmentRecordFromImportAssessment({
      assessment: importedFile.preparedAssessment,
      columnCount: table.columnCount,
      fileId: file.id,
      fileName: file.name,
      rawTableId,
      rowCount: table.rowCount,
      sourceRawTableVersion,
    }));
  }

  if (assessments.length) {
    sessionService.commitRawTableAssessments(assessments);
  }
  markImportBadgeTrace("import.assessment.prepared.commit", {
    assessmentCount: assessments.length,
    committedFileCount: committedFileIdSet.size,
  });
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
