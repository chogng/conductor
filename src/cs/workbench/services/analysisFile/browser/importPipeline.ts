import type { AnalysisFileAssessment } from "src/cs/workbench/services/analysisFile/common/analysisFile";
import type { SessionFile } from "src/cs/workbench/contrib/session/common/sessionTypes";
import {
  buildItemKey,
  type FileEntry,
} from "src/cs/workbench/contrib/files/common/files";
import {
  prepareImportFile,
} from "src/cs/workbench/services/analysisFile/browser/fileConversion";
import type {
  PendingImportFile,
} from "src/cs/workbench/services/analysisFile/browser/fileFilter";

export type ImportFileAxisRole = "vg" | "vd" | null;

export type ImportFileAxisRoleSource =
  | "filename"
  | "title"
  | "label"
  | "metadata"
  | "shape"
  | null;

export type ImportSessionFileEntry = FileEntry & {
  fileId: string;
  file: File;
  itemKey: string;
  sourceKey: string;
};

export type ImportSessionFileInfo = SessionFile & {
  fileId: string;
  fileName: string;
  file: File;
  size: number;
  lastModified: number;
  normalizedCsvPath?: string | null;
  relativePath?: string | null;
  sourceKey?: string;
  sourcePath?: string | null;
  curveType?: string | null;
  curveTypeConfidence?: "high" | "medium" | "low";
  curveTypeNeedsTemplate?: boolean;
  curveTypeReasons?: string[];
  xAxisRole?: ImportFileAxisRole;
  xAxisRoleSource?: ImportFileAxisRoleSource;
};

export type PreparedImportFile = {
  readonly fileEntry: ImportSessionFileEntry;
  readonly fileInfo: ImportSessionFileInfo;
};

const createFileId = (): string => {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }

  return `file_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`;
};

export const preparePendingImportFile = async (
  pendingImportFile: PendingImportFile,
): Promise<PreparedImportFile | null> => {
  const {
    finishFilePerf,
    relativePath,
    resource,
    sourceFile,
    sourceKey,
  } = pendingImportFile;
  let normalizedFile: File;
  let normalizedCsvPath: string | null = null;
  let fileAssessment: AnalysisFileAssessment;
  let sourcePath: string | null = null;

  try {
    const prepared = await prepareImportFile(sourceFile, resource);
    normalizedFile = prepared.file;
    normalizedCsvPath = prepared.normalizedCsvPath ?? null;
    fileAssessment = prepared.assessment;
    sourcePath = prepared.sourcePath ?? null;
  } catch {
    finishFilePerf({ failed: "prepare" });
    return null;
  }

  const fileId = createFileId();
  const fileEntry: ImportSessionFileEntry = {
    fileId,
    file: normalizedFile,
    itemKey: buildItemKey(normalizedFile, relativePath),
    normalizedCsvPath,
    relativePath,
    sourceKey,
    sourcePath,
    curveType: fileAssessment.curveType,
    curveTypeConfidence: fileAssessment.curveTypeConfidence,
    curveTypeNeedsTemplate: fileAssessment.curveTypeNeedsTemplate,
    curveTypeReasons: fileAssessment.curveTypeReasons,
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
    curveType: fileAssessment.curveType,
    curveTypeConfidence: fileAssessment.curveTypeConfidence,
    curveTypeNeedsTemplate: fileAssessment.curveTypeNeedsTemplate,
    curveTypeReasons: fileAssessment.curveTypeReasons,
    xAxisRole: fileAssessment.xAxisRole,
    xAxisRoleSource: fileAssessment.xAxisRoleSource,
  };

  finishFilePerf({
    accepted: true,
    confidence: fileAssessment.curveTypeConfidence,
    curveType: fileAssessment.curveType,
    fileId,
    normalizedSizeBytes: normalizedFile.size,
  });

  return { fileEntry, fileInfo };
};
