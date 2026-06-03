import type {
  AnalysisFileAssessment,
  IAnalysisFileService,
} from "src/cs/workbench/services/analysisFile/common/analysisFile";
import type { SessionFile } from "src/cs/workbench/contrib/session/common/sessionTypes";
import {
  buildItemKey,
  type FileEntry,
} from "src/cs/workbench/contrib/files/common/files";
import {
  ImportPrepareError,
  type ImportFileSource,
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

export type ImportFilePrepareFailure = {
  readonly code: string | null;
  readonly fileName: string;
  readonly message: string;
};

export type PendingImportFileResult =
  | { readonly ok: true; readonly prepared: PreparedImportFile }
  | { readonly ok: false; readonly error: ImportFilePrepareFailure };

const createFileId = (): string => {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }

  return `file_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`;
};

const toPrepareFailure = (
  error: unknown,
  fileName: string,
): ImportFilePrepareFailure => {
  const code =
    error instanceof ImportPrepareError
      ? error.code
      : error && typeof error === "object" && "code" in error &&
          typeof (error as { code?: unknown }).code === "string"
        ? (error as { code: string }).code
        : null;
  const message =
    error instanceof Error && error.message.trim()
      ? error.message
      : "Import file preparation failed.";

  return {
    code,
    fileName,
    message,
  };
};

const resolvePreparedFileSource = (
  pendingImportFile: PendingImportFile,
): ImportFileSource => {
  const path =
    pendingImportFile.kind === "path"
      ? String(pendingImportFile.resource?.fsPath ?? "").trim()
      : "";

  return path ? { kind: "path", path } : { kind: "data" };
};

export const preparePendingImportFile = async (
  analysisFileService: IAnalysisFileService,
  pendingImportFile: PendingImportFile,
): Promise<PendingImportFileResult> => {
  const {
    finishFilePerf,
    relativePath,
    sourceFile,
    sourceKey,
  } = pendingImportFile;
  let normalizedFile: File;
  let normalizedCsvPath: string | null = null;
  let fileAssessment: AnalysisFileAssessment;
  let sourcePath: string | null = null;
  let normalizedSizeBytes = 0;

  try {
    const prepared = await prepareImportFile(
      analysisFileService,
      sourceFile ?? null,
      resolvePreparedFileSource(pendingImportFile),
      {
        fileName: pendingImportFile.sourceName,
        lastModified: pendingImportFile.lastModified,
        loadFile: pendingImportFile.loadFile,
        size: pendingImportFile.sourceSize,
      },
    );
    normalizedFile = prepared.file;
    normalizedCsvPath = prepared.normalizedCsvPath ?? null;
    fileAssessment = prepared.assessment;
    sourcePath = prepared.sourcePath ?? null;
    normalizedSizeBytes = prepared.normalizedSizeBytes;
  } catch (error) {
    const failure = toPrepareFailure(
      error,
      pendingImportFile.sourceName || "Unknown file",
    );
    finishFilePerf({
      code: failure.code,
      failed: "prepare",
      message: failure.message,
    });
    return {
      error: failure,
      ok: false,
    };
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
    fileName: pendingImportFile.sourceName,
    file: normalizedFile,
    size: normalizedSizeBytes,
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
    normalizedSizeBytes,
  });

  return {
    ok: true,
    prepared: { fileEntry, fileInfo },
  };
};
