import type { URI } from "src/cs/base/common/uri";
import { getPathForFile } from "src/cs/platform/dnd/browser/dnd";
import {
  assessImportedFile,
  type ImportedCurveAssessment,
} from "src/cs/workbench/contrib/import/common/importFileUtils";
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
import { importService } from "src/cs/workbench/services/import/browser/importService";

export type ImportAxisRole = "vg" | "vd" | null;

export type ImportAxisRoleSource =
  | "filename"
  | "title"
  | "label"
  | "metadata"
  | "shape"
  | null;

export type ImportedSessionFileEntry = FileEntry & {
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
  xAxisRole?: ImportAxisRole;
  xAxisRoleSource?: ImportAxisRoleSource;
};

export type ImportWorkerPreparedFile = {
  assessment: ImportedCurveAssessment;
  file: File;
  normalizedCsvPath?: string | null;
  normalizedSizeBytes: number;
  sourcePath?: string | null;
  sourceName: string;
  sourceSizeBytes: number;
};

export type PendingImportFile = {
  finishFilePerf: (meta?: Record<string, unknown>) => void;
  relativePath: string | null;
  resource: URI | null;
  sourceFile: File;
  sourceKey: string;
};

export type PendingImportsResult = {
  readonly hasAnyUnsupportedFiles: boolean;
  readonly pendingImports: PendingImportFile[];
  readonly unsupportedCount: number;
};

export type PreparedImportFile = {
  readonly fileEntry: ImportedSessionFileEntry;
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

  if (!importService.canReadConvertedCsv()) {
    return fallbackFile instanceof File ? fallbackFile : null;
  }

  try {
    const response = await importService.readConvertedCsv({ path: csvPath });
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

export const prepareImportFileInWorker = async (
  file: File,
  resource: URI | null = null,
): Promise<ImportWorkerPreparedFile> => {
  if (!importService.canPrepareFile()) {
    const assessment = await assessImportedFile(file);
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
    const result = await importService.prepareFile({
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

export const resetImportWorker = () => {
  // Import preparation now runs through the desktop Rust bridge.
};

export const collectPendingImports = (
  files: FileSource[],
): PendingImportsResult => {
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

    pendingImports.push({
      finishFilePerf,
      relativePath,
      resource: source.resource ?? null,
      sourceFile,
      sourceKey,
    });
  }

  return {
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
    resource,
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
    const prepared = await prepareImportFileInWorker(sourceFile, resource);
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
  const fileEntry: ImportedSessionFileEntry = {
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
