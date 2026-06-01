import { startPerf } from "src/cs/workbench/common/deviceAnalysis/perf";
import type { ImportedCurveAssessment } from "src/cs/workbench/common/deviceAnalysis/importFileUtils";
import {
  isSupportedDataFileName,
  type FileEntry,
} from "src/cs/workbench/contrib/files/common/files";
import type { FileSource } from "src/cs/workbench/contrib/files/browser/source";
import { prepareImportFileInWorker } from "src/cs/workbench/contrib/import/browser/rustClient";
import type {
  ImportSessionFileInfo,
} from "src/cs/workbench/contrib/import/common/types";
import {
  buildEntrySourceKey,
  buildFileIdentityKey,
  buildItemKey,
  createFileId,
} from "src/cs/workbench/contrib/files/browser/identity";

export type SessionFileEntry = FileEntry & {
  fileId: string;
  file: File;
  itemKey: string;
  sourceKey: string;
};

export type PendingImportFile = {
  finishFilePerf: (meta?: Record<string, unknown>) => void;
  relativePath: string | null;
  sourceFile: File;
  sourceKey: string;
};

export type PendingImportsResult = {
  readonly duplicateCount: number;
  readonly hasAnyUnsupportedFiles: boolean;
  readonly pendingImports: PendingImportFile[];
  readonly unsupportedCount: number;
};

export type PreparedImportFile = {
  readonly fileEntry: SessionFileEntry;
  readonly fileInfo: ImportSessionFileInfo;
};

export const collectPendingImports = (
  existingFiles: FileEntry[],
  files: FileSource[],
  initialDuplicateCount: number,
): PendingImportsResult => {
  const seenSourceKeys = new Set(
    existingFiles.map((entry) => buildEntrySourceKey(entry)).filter(Boolean),
  );
  let duplicateCount = initialDuplicateCount;
  let hasAnyUnsupportedFiles = false;
  let unsupportedCount = 0;
  const pendingImports: PendingImportFile[] = [];

  for (const source of files) {
    const sourceFile = source.file;
    const relativePath = source.relativePath?.trim() || null;
    const finishFilePerf = startPerf("import:prepare-file", {
      fileName: sourceFile.name,
      sizeBytes: sourceFile.size,
    });
    const sourceKey = buildFileIdentityKey(sourceFile, relativePath);
    if (!sourceKey || seenSourceKeys.has(sourceKey)) {
      duplicateCount += 1;
      finishFilePerf({ skipped: "duplicate" });
      continue;
    }
    seenSourceKeys.add(sourceKey);

    if (!isSupportedDataFileName(sourceFile.name)) {
      hasAnyUnsupportedFiles = true;
      unsupportedCount += 1;
      finishFilePerf({ skipped: "unsupported" });
      continue;
    }

    pendingImports.push({
      finishFilePerf,
      relativePath,
      sourceFile,
      sourceKey,
    });
  }

  return {
    duplicateCount,
    hasAnyUnsupportedFiles,
    pendingImports,
    unsupportedCount,
  };
};

export const prepareImportFile = async (
  pendingImport: PendingImportFile,
): Promise<PreparedImportFile | null> => {
  const {
    finishFilePerf,
    relativePath,
    sourceFile,
    sourceKey,
  } = pendingImport;
  let normalizedFile: File;
  let normalizedCsvPath: string | null = null;
  let curveAssessment: ImportedCurveAssessment;
  let sourcePath: string | null = null;

  try {
    const finishWorkerPerf = startPerf("import:worker-prepare-file", {
      fileName: sourceFile.name,
      sizeBytes: sourceFile.size,
    });
    const prepared = await prepareImportFileInWorker(sourceFile);
    normalizedFile = prepared.file;
    normalizedCsvPath = prepared.normalizedCsvPath ?? null;
    curveAssessment = prepared.assessment;
    sourcePath = prepared.sourcePath ?? null;
    finishWorkerPerf({
      confidence: curveAssessment.curveTypeConfidence,
      curveType: curveAssessment.curveType,
      normalizedName: normalizedFile.name,
      normalizedSizeBytes: normalizedFile.size,
      xAxisRole: curveAssessment.xAxisRole,
    });
  } catch {
    finishFilePerf({ failed: "worker-prepare" });
    return null;
  }

  const fileId = createFileId();
  const fileEntry: SessionFileEntry = {
    fileId,
    file: normalizedFile,
    itemKey: buildItemKey(normalizedFile, relativePath),
    normalizedCsvPath,
    relativePath,
    sourceKey,
    sourcePath,
    curveType: curveAssessment.curveType,
    curveTypeConfidence: curveAssessment.curveTypeConfidence,
    curveTypeNeedsTemplate: curveAssessment.curveTypeNeedsTemplate,
    curveTypeReasons: curveAssessment.curveTypeReasons,
  };
  const fileInfo: ImportSessionFileInfo = {
    fileId,
    fileName: sourceFile.name,
    file: normalizedFile,
    size: normalizedFile.size,
    lastModified: normalizedFile.lastModified,
    normalizedCsvPath,
    relativePath,
    sourceKey,
    sourcePath,
    curveType: curveAssessment.curveType,
    curveTypeConfidence: curveAssessment.curveTypeConfidence,
    curveTypeNeedsTemplate: curveAssessment.curveTypeNeedsTemplate,
    curveTypeReasons: curveAssessment.curveTypeReasons,
    xAxisRole: curveAssessment.xAxisRole,
    xAxisRoleSource: curveAssessment.xAxisRoleSource,
  };

  finishFilePerf({
    accepted: true,
    confidence: curveAssessment.curveTypeConfidence,
    curveType: curveAssessment.curveType,
    fileId,
    normalizedSizeBytes: normalizedFile.size,
  });

  return { fileEntry, fileInfo };
};
