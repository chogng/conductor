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
import type {
  CommitFileImportRawTableAssessmentInput,
  ISessionService,
} from "src/cs/workbench/services/session/common/session";
import {
  markTemplateApplyPerformanceTrace,
} from "src/cs/workbench/contrib/performance/browser/templateApplyPerformanceTrace";

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
  const importResult = createFileImportResultFromRecords(
    normalizedFiles.map(file => file.importRecord),
  );
  const preparedAssessments = createPreparedImportAssessmentInputs(normalizedFiles);
  markTemplateApplyPerformanceTrace("import.session.commit.start", {
    fileCount: normalizedFiles.length,
    mode,
    preparedAssessmentCount: preparedAssessments.length,
  });

  if (mode === "replace") {
    sessionService.clearSession();
    const commitResult = sessionService.commitFileImport(importResult, {
      rawTableAssessments: preparedAssessments,
    });
    const committedFileIds = commitResult.importedFileIds;
    markPreparedImportAssessmentsCommitted(preparedAssessments, committedFileIds);
    markTemplateApplyPerformanceTrace("import.session.commit.complete", {
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

  const commitResult = sessionService.commitFileImport(importResult, {
    rawTableAssessments: preparedAssessments,
  });
  const committedFileIds = commitResult.importedFileIds;
  markPreparedImportAssessmentsCommitted(preparedAssessments, committedFileIds);
  markTemplateApplyPerformanceTrace("import.session.commit.complete", {
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

const createPreparedImportAssessmentInputs = (
  importedFiles: readonly NormalizedPreparedFileImportInfo[],
): CommitFileImportRawTableAssessmentInput[] => {
  const assessments: CommitFileImportRawTableAssessmentInput[] = [];
  for (const importedFile of importedFiles) {
    if (!importedFile.preparedAssessment) {
      continue;
    }

    const rawTableId = normalizeFileId(importedFile.importRecord.raw.rawTableOrder[0]);
    const table = rawTableId ? importedFile.importRecord.raw.rawTablesById[rawTableId] : undefined;
    if (!rawTableId || !table) {
      continue;
    }

    const assessment = createRawTableAssessmentRecordFromImportAssessment({
      assessment: importedFile.preparedAssessment,
      columnCount: table.columnCount,
      fileId: importedFile.fileId,
      fileName: importedFile.importRecord.name,
      rawTableId,
      rowCount: table.rowCount,
      rows: table.rows.kind === "inline" ? table.rows.values : undefined,
      sourceRawTableVersion: 0,
    });
    assessments.push({
      assessmentRuleVersion: assessment.assessmentRuleVersion,
      blocks: assessment.blocks,
      columnProfiles: assessment.columnProfiles,
      createdAt: assessment.createdAt,
      diagnostics: assessment.diagnostics,
      fileId: assessment.fileId,
      groups: assessment.groups,
      layoutCandidates: assessment.layoutCandidates,
      rawTableId: assessment.rawTableId,
      semanticCandidates: assessment.semanticCandidates,
      structure: assessment.structure,
    });
  }

  return assessments;
};

const markPreparedImportAssessmentsCommitted = (
  assessments: readonly CommitFileImportRawTableAssessmentInput[],
  committedFileIds: readonly string[],
): void => {
  const committedFileIdSet = new Set(committedFileIds);
  markTemplateApplyPerformanceTrace("import.assessment.prepared.commit", {
    assessmentCount: assessments.filter(assessment =>
      committedFileIdSet.has(normalizeFileId(assessment.fileId) ?? "")
    ).length,
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
