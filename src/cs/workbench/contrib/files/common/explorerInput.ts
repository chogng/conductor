import type { FileEntry } from "src/cs/workbench/contrib/files/common/files";
import type {
  CleanedEntry,
  SessionFile,
} from "src/cs/workbench/contrib/session/common/sessionTypes";

const getFileId = (file: Pick<FileEntry, "fileId">): string =>
  String(file?.fileId ?? "").trim();

const getFileName = (
  cleanedFile: CleanedEntry,
  sourceFile: SessionFile | undefined,
  fileId: string,
): string =>
  String(cleanedFile.fileName ?? sourceFile?.fileName ?? fileId).trim() || fileId;

const getOptionalString = (value: unknown): string | undefined => {
  const text = String(value ?? "").trim();
  return text || undefined;
};

export const createChartExplorerFiles = (
  sourceFiles: readonly SessionFile[],
  cleanedData: readonly CleanedEntry[],
): FileEntry[] => {
  const sourceById = new Map<string, SessionFile>();
  for (const file of sourceFiles) {
    const fileId = getFileId(file);
    if (fileId) {
      sourceById.set(fileId, file);
    }
  }

  const files: FileEntry[] = [];
  for (const cleanedFile of cleanedData) {
    const fileId = getFileId(cleanedFile);
    if (!fileId) {
      continue;
    }

    const sourceFile = sourceById.get(fileId);
    files.push({
      file: sourceFile?.file,
      fileId,
      fileName: getFileName(cleanedFile, sourceFile, fileId),
      itemKey: getOptionalString(sourceFile?.itemKey),
      normalizedCsvPath: sourceFile?.normalizedCsvPath,
      relativePath: sourceFile?.relativePath ?? null,
      sourceKey: getOptionalString(sourceFile?.sourceKey),
      sourcePath: sourceFile?.sourcePath,
      curveType: cleanedFile.curveType ?? sourceFile?.curveType ?? null,
      curveTypeConfidence:
        cleanedFile.curveTypeConfidence ?? sourceFile?.curveTypeConfidence,
      curveTypeNeedsTemplate:
        cleanedFile.curveTypeNeedsTemplate ?? sourceFile?.curveTypeNeedsTemplate,
      curveTypeReasons: cleanedFile.curveTypeReasons ?? sourceFile?.curveTypeReasons,
    });
  }

  return files;
};
