import type { FileEntry } from "src/cs/workbench/contrib/files/common/files";
import type {
  ProcessedEntry,
  SessionFile,
} from "src/cs/workbench/services/session/common/sessionTypes";
import type {
  FileId,
  FileRecord,
} from "src/cs/workbench/services/session/common/sessionModel";

const getFileId = (file: Pick<FileEntry, "fileId">): string =>
  String(file?.fileId ?? "").trim();

const getFileName = (
  processedFile: ProcessedEntry,
  rawFile: SessionFile | undefined,
  fileId: string,
): string =>
  String(processedFile.fileName ?? rawFile?.fileName ?? fileId).trim() || fileId;

const getOptionalString = (value: unknown): string | undefined => {
  const text = String(value ?? "").trim();
  return text || undefined;
};

const hasFileRecordAnalysisData = (file: FileRecord): boolean =>
  file.seriesOrder.length > 0 ||
  Object.values(file.curvesByKey).some((curve) => curve.curveGeneration === "base");

export const createChartExplorerFilesFromRecords = (
  filesById: Record<FileId, FileRecord>,
  fileOrder: readonly FileId[],
  rawFiles: readonly SessionFile[] = [],
): FileEntry[] => {
  const rawFileById = new Map<string, SessionFile>();
  for (const file of rawFiles) {
    const fileId = getFileId(file);
    if (fileId) {
      rawFileById.set(fileId, file);
    }
  }

  const orderedFileIds = new Set<FileId>();
  const files: FileEntry[] = [];
  const pushFile = (fileId: FileId): void => {
    if (orderedFileIds.has(fileId)) {
      return;
    }
    orderedFileIds.add(fileId);

    const file = filesById[fileId];
    if (!file || !hasFileRecordAnalysisData(file)) {
      return;
    }

    const rawFile = rawFileById.get(fileId);
    files.push({
      file: file.raw.file ?? rawFile?.file,
      fileId,
      fileName: String(file.raw.fileName ?? rawFile?.fileName ?? fileId).trim() || fileId,
      itemKey: getOptionalString(rawFile?.itemKey ?? file.raw.rawKey),
      normalizedCsvPath: file.raw.normalizedCsvPath ?? rawFile?.normalizedCsvPath,
      relativePath: file.raw.relativePath ?? rawFile?.relativePath ?? null,
      sourceKey: getOptionalString(rawFile?.sourceKey ?? file.raw.rawKey),
      sourcePath: file.raw.filePath ?? rawFile?.sourcePath,
      curveType: file.assessment.baseFamily ?? rawFile?.curveType ?? null,
      curveTypeConfidence:
        file.assessment.baseFamilyConfidence ?? rawFile?.curveTypeConfidence,
      curveTypeNeedsTemplate: rawFile?.curveTypeNeedsTemplate,
      curveTypeReasons: file.assessment.baseFamilyReasons ?? rawFile?.curveTypeReasons,
    });
  };

  for (const fileId of fileOrder) {
    pushFile(fileId);
  }
  for (const fileId of Object.keys(filesById)) {
    pushFile(fileId);
  }

  return files;
};

export const createChartExplorerFiles = (
  rawFiles: readonly SessionFile[],
  processedFiles: readonly ProcessedEntry[],
): FileEntry[] => {
  const rawFileById = new Map<string, SessionFile>();
  for (const file of rawFiles) {
    const fileId = getFileId(file);
    if (fileId) {
      rawFileById.set(fileId, file);
    }
  }

  const files: FileEntry[] = [];
  for (const processedFile of processedFiles) {
    const fileId = getFileId(processedFile);
    if (!fileId) {
      continue;
    }

    const rawFile = rawFileById.get(fileId);
    files.push({
      file: rawFile?.file,
      fileId,
      fileName: getFileName(processedFile, rawFile, fileId),
      itemKey: getOptionalString(rawFile?.itemKey),
      normalizedCsvPath: rawFile?.normalizedCsvPath,
      relativePath: rawFile?.relativePath ?? null,
      sourceKey: getOptionalString(rawFile?.sourceKey),
      sourcePath: rawFile?.sourcePath,
      curveType: processedFile.curveType ?? rawFile?.curveType ?? null,
      curveTypeConfidence:
        processedFile.curveTypeConfidence ?? rawFile?.curveTypeConfidence,
      curveTypeNeedsTemplate:
        processedFile.curveTypeNeedsTemplate ?? rawFile?.curveTypeNeedsTemplate,
      curveTypeReasons: processedFile.curveTypeReasons ?? rawFile?.curveTypeReasons,
    });
  }

  return files;
};

