import type { URI } from "src/cs/base/common/uri";
import { getPathForFile } from "src/cs/platform/dnd/browser/dnd";
import {
  assessDataFile,
} from "src/cs/workbench/services/dataFile/browser/dataFileAssessment";
import type { DataFileAssessment } from "src/cs/workbench/services/dataFile/common/dataFile";
import {
  startPerf,
} from "src/cs/workbench/common/perf";
import type { SessionFile } from "src/cs/workbench/contrib/session/common/sessionTypes";
import {
  buildFileIdentityKey,
  buildItemKey,
  isSupportedDataFileName,
  type FileSource,
  type FileEntry,
} from "src/cs/workbench/contrib/files/common/files";
import { dataFileService } from "src/cs/workbench/services/dataFile/browser/dataFileService";

export type DataFileAxisRole = "vg" | "vd" | null;

export type DataFileAxisRoleSource =
  | "filename"
  | "title"
  | "label"
  | "metadata"
  | "shape"
  | null;

export type DataFileSessionFileEntry = FileEntry & {
  fileId: string;
  file: File;
  itemKey: string;
  sourceKey: string;
};

export type DataFileSessionFileInfo = SessionFile & {
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
  xAxisRole?: DataFileAxisRole;
  xAxisRoleSource?: DataFileAxisRoleSource;
};

export type DataFilePreparedBrowserFile = {
  assessment: DataFileAssessment;
  file: File;
  normalizedCsvPath?: string | null;
  normalizedSizeBytes: number;
  sourcePath?: string | null;
  sourceName: string;
  sourceSizeBytes: number;
};

export type PendingDataFile = {
  finishFilePerf: (meta?: Record<string, unknown>) => void;
  relativePath: string | null;
  resource: URI | null;
  sourceFile: File;
  sourceKey: string;
};

export type PendingDataFilesResult = {
  readonly hasAnyUnsupportedFiles: boolean;
  readonly pendingDataFiles: PendingDataFile[];
  readonly unsupportedCount: number;
};

export type PreparedDataFile = {
  readonly fileEntry: DataFileSessionFileEntry;
  readonly fileInfo: DataFileSessionFileInfo;
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

const getRustConvertCsvBytes = (manifest: unknown): number | null => {
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    return null;
  }
  const value = Number((manifest as { csvBytes?: unknown }).csvBytes);
  return Number.isFinite(value) && value >= 0 ? value : null;
};

export const loadConvertedCsvFile = async ({
  fallbackFile,
  fileName,
  lastModified,
  normalizedCsvPath,
}: {
  fallbackFile?: unknown;
  fileName?: unknown;
  lastModified?: unknown;
  normalizedCsvPath?: unknown;
}): Promise<File | null> => {
  const csvPath =
    typeof normalizedCsvPath === "string" ? normalizedCsvPath.trim() : "";
  if (!csvPath) {
    return fallbackFile instanceof File ? fallbackFile : null;
  }

  if (!dataFileService.canReadConvertedCsv()) {
    return fallbackFile instanceof File ? fallbackFile : null;
  }

  try {
    const response = await dataFileService.readConvertedCsv({ path: csvPath });
    if (!response?.ok || typeof response.csvText !== "string") {
      return fallbackFile instanceof File ? fallbackFile : null;
    }
    return new File([response.csvText], String(fileName || "converted.csv"), {
      lastModified: Number.isFinite(Number(lastModified))
        ? Number(lastModified)
        : Date.now(),
      type: "text/csv;charset=utf-8",
    });
  } catch {
    return fallbackFile instanceof File ? fallbackFile : null;
  }
};

export const prepareDataFileInWorker = async (
  file: File,
  resource: URI | null = null,
): Promise<DataFilePreparedBrowserFile> => {
  if (!dataFileService.canPrepareFile()) {
    const assessment = await assessDataFile(file);
    return {
      assessment,
      file,
      normalizedCsvPath: null,
      normalizedSizeBytes: file.size,
      sourcePath: resource?.fsPath || getPathForFile(file) || null,
      sourceName: file.name,
      sourceSizeBytes: file.size,
    };
  }

  const filePath = resource?.fsPath || getPathForFile(file) || "";
  if (!filePath) {
    throw new Error(`Unable to resolve file path for ${file.name}.`);
  }

  const finishPerf = startPerf("import:rust-prepare-file", {
    fileName: file.name,
    sizeBytes: file.size,
  });

  try {
    const result = await dataFileService.prepareFile({
      fileName: file.name,
      path: filePath,
    });
    if (!result?.ok || !result.assessment) {
      finishPerf({
        code: result?.code ?? null,
        message: result?.message ?? null,
        rustDurationMs: result?.durationMs ?? null,
        source: "rust-failed",
      });
      throw new Error(
        typeof result?.message === "string" && result.message.trim()
          ? result.message
          : `Rust import preparation failed for ${file.name}.`,
      );
    }

    const normalizedCsvPath = result.normalizedCsvPath ?? null;
    const normalizedFile =
      typeof result.csvText === "string"
        ? new File([result.csvText], file.name, {
            lastModified: Number.isFinite(file.lastModified)
              ? file.lastModified
              : Date.now(),
            type: "text/csv;charset=utf-8",
          })
        : file;
    const normalizedSizeBytes =
      getRustConvertCsvBytes(result.manifest) ??
      (Number(result.normalizedSizeBytes) || normalizedFile.size);

    finishPerf({
      confidence: result.assessment.curveTypeConfidence,
      curveType: result.assessment.curveType,
      normalizedCsvPath,
      normalizedSizeBytes,
      rustDurationMs: result.durationMs ?? null,
      source: result.source ?? "rust",
      xAxisRole: result.assessment.xAxisRole,
    });

    return {
      assessment: result.assessment,
      file: normalizedFile,
      normalizedCsvPath,
      normalizedSizeBytes,
      sourcePath: result.sourcePath ?? filePath,
      sourceName: result.sourceName ?? file.name,
      sourceSizeBytes: Number(result.sourceSizeBytes) || file.size,
    };
  } catch (error) {
    finishPerf({
      message: error instanceof Error ? error.message : String(error),
      source: "rust-failed",
    });
    throw error;
  }
};

export const resetDataFileWorker = () => {
  // Import preparation now runs through the desktop Rust bridge.
};

export const collectPendingDataFiles = (
  files: FileSource[],
): PendingDataFilesResult => {
  let hasAnyUnsupportedFiles = false;
  let unsupportedCount = 0;
  const pendingDataFiles: PendingDataFile[] = [];

  for (const source of files) {
    const sourceFile = source.file;
    const relativePath = source.relativePath?.trim() || null;
    const finishFilePerf = startPerf("import:prepare-file", {
      fileName: sourceFile.name,
      sizeBytes: sourceFile.size,
    });
    const sourceKey = buildFileIdentityKey(sourceFile, relativePath);
    if (!sourceKey) {
      finishFilePerf({ skipped: "missing-key" });
      continue;
    }

    if (!isSupportedDataFileName(sourceFile.name)) {
      hasAnyUnsupportedFiles = true;
      unsupportedCount += 1;
      finishFilePerf({ skipped: "unsupported" });
      continue;
    }

    pendingDataFiles.push({
      finishFilePerf,
      relativePath,
      resource: source.resource ?? null,
      sourceFile,
      sourceKey,
    });
  }

  return {
    hasAnyUnsupportedFiles,
    pendingDataFiles,
    unsupportedCount,
  };
};

export const prepareDataFile = async (
  pendingDataFile: PendingDataFile,
): Promise<PreparedDataFile | null> => {
  const {
    finishFilePerf,
    relativePath,
    resource,
    sourceFile,
    sourceKey,
  } = pendingDataFile;
  let normalizedFile: File;
  let normalizedCsvPath: string | null = null;
  let fileAssessment: DataFileAssessment;
  let sourcePath: string | null = null;

  try {
    const finishWorkerPerf = startPerf("import:worker-prepare-file", {
      fileName: sourceFile.name,
      sizeBytes: sourceFile.size,
    });
    const prepared = await prepareDataFileInWorker(sourceFile, resource);
    normalizedFile = prepared.file;
    normalizedCsvPath = prepared.normalizedCsvPath ?? null;
    fileAssessment = prepared.assessment;
    sourcePath = prepared.sourcePath ?? null;
    finishWorkerPerf({
      confidence: fileAssessment.curveTypeConfidence,
      curveType: fileAssessment.curveType,
      normalizedName: normalizedFile.name,
      normalizedSizeBytes: normalizedFile.size,
      xAxisRole: fileAssessment.xAxisRole,
    });
  } catch {
    finishFilePerf({ failed: "worker-prepare" });
    return null;
  }

  const fileId = createFileId();
  const fileEntry: DataFileSessionFileEntry = {
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
  const fileInfo: DataFileSessionFileInfo = {
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
