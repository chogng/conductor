/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { localize } from "src/cs/nls";
import type { URI } from "src/cs/base/common/uri";
import { startPerf } from "src/cs/workbench/common/perf";
import {
  buildItemKey,
  buildFileSourceIdentityKey,
  isSupportedImportFileName,
  type ImportedFileRecord,
  type ImportFileData,
  type FileSource,
} from "src/cs/workbench/services/files/common/files";
import type { FolderFileReadFailure } from "src/cs/workbench/services/files/common/folderImport";
import type { FileConverterBackend } from "src/cs/workbench/services/files/common/fileConverterBackend";
import {
  convertImportFile,
  FileConvertError,
  type FileConverterSource,
} from "src/cs/workbench/services/files/browser/fileConverter";
import { createImportedFileRecord } from "src/cs/workbench/services/files/browser/fileImportResult";
import type { SessionFile } from "src/cs/workbench/services/session/common/sessionTypes";

const PENDING_IMPORT_APPEND_BATCH_SIZE = 32;
const PENDING_IMPORT_PREPARE_CONCURRENCY = 8;

export type PendingImportFile = {
  canUseNativePath?: boolean;
  finishFilePerf: (meta?: Record<string, unknown>) => void;
  kind: FileSource["kind"];
  lastModified: number;
  loadFile?: () => Promise<ImportFileData>;
  relativePath: string | null;
  resource: URI | null;
  sourceFile?: ImportFileData;
  sourceName: string;
  sourceSize: number;
  sourceKey: string;
};

export type PendingImportFilesResult = {
  readonly hasAnyUnsupportedFiles: boolean;
  readonly pendingImportFiles: PendingImportFile[];
  readonly unsupportedCount: number;
};

export type PreparedFileImportEntry = {
  readonly fileId: string;
  readonly file: File;
  readonly itemKey: string;
  readonly sourceKey: string;
  readonly normalizedCsvPath?: string | null;
  readonly relativePath?: string | null;
  readonly sourcePath?: string | null;
};

export type PreparedFileImportInfo = SessionFile & {
  readonly fileId: string;
  readonly fileName: string;
  readonly file: File;
  readonly importRecord: ImportedFileRecord;
  readonly size: number;
  readonly lastModified: number;
  readonly normalizedCsvPath?: string | null;
  readonly relativePath?: string | null;
  readonly sourceKey?: string;
  readonly sourcePath?: string | null;
};

export type PreparedFileImport = {
  readonly fileEntry: PreparedFileImportEntry;
  readonly fileInfo: PreparedFileImportInfo;
};

export type FileImportPrepareFailure = {
  readonly code: string | null;
  readonly fileName: string;
  readonly message: string;
};

export type PendingImportFileResult =
  | { readonly ok: true; readonly prepared: PreparedFileImport }
  | { readonly ok: false; readonly error: FileImportPrepareFailure };

export type FirstPreparedFileImport = {
  readonly attemptedIndexes: Set<number>;
  readonly result: {
    readonly prepared: PreparedFileImport;
  } | null;
};

export const collectPendingImportFiles = (
  files: FileSource[],
): PendingImportFilesResult => {
  let hasAnyUnsupportedFiles = false;
  let unsupportedCount = 0;
  const pendingImportFiles: PendingImportFile[] = [];

  for (const source of files) {
    const sourceFile = source.file;
    const sourceName = source.kind === "path" ? source.fileName : source.file.name;
    const sourceSize = source.kind === "path" ? source.size : source.file.size;
    const lastModified = source.kind === "path" ? source.lastModified : source.file.lastModified;
    const relativePath = source.relativePath?.trim() || null;
    const finishFilePerf = startPerf("import:prepare-file", {
      fileName: sourceName,
      sizeBytes: sourceSize,
    });
    const sourceKey = buildFileSourceIdentityKey(
      sourceName,
      sourceSize,
      lastModified,
      relativePath,
    );
    if (!sourceKey) {
      finishFilePerf({ skipped: "missing-key" });
      continue;
    }

    if (!isSupportedImportFileName(sourceName)) {
      hasAnyUnsupportedFiles = true;
      unsupportedCount += 1;
      finishFilePerf({ skipped: "unsupported" });
      continue;
    }

    pendingImportFiles.push({
      canUseNativePath: source.kind === "path" ? source.canUseNativePath !== false : false,
      finishFilePerf,
      kind: source.kind,
      lastModified,
      loadFile: source.kind === "path" ? source.loadFile : undefined,
      relativePath,
      resource: source.resource ?? null,
      sourceFile,
      sourceName,
      sourceSize,
      sourceKey,
    });
  }

  return {
    hasAnyUnsupportedFiles,
    pendingImportFiles,
    unsupportedCount,
  };
};

export const preparePendingImportFile = async (
  fileConverterBackend: FileConverterBackend,
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
  let sourcePath: string | null = null;
  let normalizedSizeBytes = 0;
  let importRecord: ImportedFileRecord;

  try {
    const prepared = await convertImportFile(
      fileConverterBackend,
      sourceFile ?? null,
      resolveFileConverterSource(pendingImportFile),
      {
        fileName: pendingImportFile.sourceName,
        lastModified: pendingImportFile.lastModified,
        loadFile: pendingImportFile.loadFile,
        size: pendingImportFile.sourceSize,
      },
    );
    normalizedFile = prepared.file;
    normalizedCsvPath = prepared.normalizedCsvPath ?? null;
    sourcePath = prepared.sourcePath ?? null;
    normalizedSizeBytes = prepared.normalizedSizeBytes;
    importRecord = await createImportedFileRecord({
      file: normalizedFile,
      fileId: createFileId(),
      fileName: pendingImportFile.sourceName,
      lastModified: normalizedFile.lastModified,
      normalizedCsvPath,
      relativePath,
      sourcePath,
      sourceSizeBytes: pendingImportFile.sourceSize,
    });
  } catch (error) {
    const failure = toPrepareFailure(
      error,
      pendingImportFile.sourceName || localize("import.unknownFile", "Unknown file"),
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

  const fileId = importRecord.id;
  const fileEntry: PreparedFileImportEntry = {
    fileId,
    file: normalizedFile,
    itemKey: buildItemKey(normalizedFile, relativePath),
    normalizedCsvPath,
    relativePath,
    sourceKey,
    sourcePath,
  };
  const fileInfo: PreparedFileImportInfo = {
    fileId,
    fileName: pendingImportFile.sourceName,
    file: normalizedFile,
    importRecord,
    size: normalizedSizeBytes,
    lastModified: normalizedFile.lastModified,
    normalizedCsvPath,
    relativePath,
    sourceKey,
    sourcePath,
  };

  finishFilePerf({
    accepted: true,
    fileId,
    normalizedSizeBytes,
  });

  return {
    ok: true,
    prepared: { fileEntry, fileInfo },
  };
};

export async function prepareFirstPendingImportFile({
  canApplyResult,
  failedFiles,
  fileConverterBackend,
  pendingImportFiles,
  selectedRelativePath,
}: {
  readonly canApplyResult: () => boolean;
  readonly failedFiles: FileImportPrepareFailure[];
  readonly fileConverterBackend: FileConverterBackend;
  readonly pendingImportFiles: readonly PendingImportFile[];
  readonly selectedRelativePath: string | null;
}): Promise<FirstPreparedFileImport> {
  const attemptedIndexes = new Set<number>();
  for (const index of getPriorityImportIndexes(
    pendingImportFiles,
    selectedRelativePath,
  )) {
    if (!canApplyResult()) {
      break;
    }

    const pendingImportFile = pendingImportFiles[index];
    if (!pendingImportFile) {
      continue;
    }

    attemptedIndexes.add(index);
    const preparedImportFile = await preparePendingImportFile(
      fileConverterBackend,
      pendingImportFile,
    );
    if (!preparedImportFile.ok) {
      failedFiles.push(preparedImportFile.error);
      continue;
    }

    return {
      attemptedIndexes,
      result: {
        prepared: preparedImportFile.prepared,
      },
    };
  }

  return {
    attemptedIndexes,
    result: null,
  };
}

export async function prepareRemainingPendingImportFiles({
  canApplyResult,
  failedFiles,
  fileConverterBackend,
  onPreparedFiles,
  pendingImportFiles,
  skippedIndexes,
}: {
  readonly canApplyResult: () => boolean;
  readonly failedFiles: FileImportPrepareFailure[];
  readonly fileConverterBackend: FileConverterBackend;
  readonly onPreparedFiles: (preparedFiles: readonly PreparedFileImport[]) => void;
  readonly pendingImportFiles: readonly PendingImportFile[];
  readonly skippedIndexes: ReadonlySet<number>;
}): Promise<number> {
  const remainingIndexes = pendingImportFiles
    .map((_file, index) => index)
    .filter(index => !skippedIndexes.has(index));
  if (remainingIndexes.length === 0) {
    return 0;
  }

  const readyByIndex = new Map<number, PreparedFileImport>();
  const completedIndexes = new Set<number>();
  let nextAppendOffset = 0;
  let nextImportIndex = 0;
  let acceptedCount = 0;

  const flushReadyImports = (): number => {
    if (!canApplyResult()) {
      return 0;
    }

    const preparedFiles: PreparedFileImport[] = [];
    while (
      nextAppendOffset < remainingIndexes.length &&
      preparedFiles.length < PENDING_IMPORT_APPEND_BATCH_SIZE
    ) {
      const index = remainingIndexes[nextAppendOffset];
      if (!completedIndexes.has(index)) {
        break;
      }

      const prepared = readyByIndex.get(index);
      if (prepared) {
        preparedFiles.push(prepared);
      }
      nextAppendOffset += 1;
    }

    if (preparedFiles.length === 0) {
      return 0;
    }

    onPreparedFiles(preparedFiles);
    return preparedFiles.length;
  };

  const workerCount = Math.min(
    PENDING_IMPORT_PREPARE_CONCURRENCY,
    remainingIndexes.length,
  );
  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (canApplyResult()) {
        const remainingIndex = nextImportIndex;
        nextImportIndex += 1;
        const index = remainingIndexes[remainingIndex];
        if (typeof index !== "number") {
          return;
        }

        const pendingImportFile = pendingImportFiles[index];
        if (!pendingImportFile) {
          return;
        }

        const preparedImportFile = await preparePendingImportFile(
          fileConverterBackend,
          pendingImportFile,
        );
        if (!canApplyResult()) {
          return;
        }

        if (preparedImportFile.ok) {
          readyByIndex.set(index, preparedImportFile.prepared);
        } else {
          failedFiles.push(preparedImportFile.error);
        }
        completedIndexes.add(index);
        acceptedCount += flushReadyImports();
      }
    }),
  );

  while (flushReadyImports() > 0) {
    // Drain completed batches larger than PENDING_IMPORT_APPEND_BATCH_SIZE.
  }

  return acceptedCount;
}

export const buildImportErrorMessage = ({
  failedFiles,
  hasAnyUnsupportedFiles,
  readFailures = [],
}: {
  readonly failedFiles: readonly FileImportPrepareFailure[];
  readonly hasAnyUnsupportedFiles: boolean;
  readonly readFailures?: readonly FolderFileReadFailure[];
}): string | null => {
  const errors: string[] = [];
  if (hasAnyUnsupportedFiles) {
    errors.push(
      localize(
        "import.unsupportedFilesSkipped",
        "Skipped unsupported files in the selected folder. Supported: .csv, .xls, .xlsx",
      ),
    );
  }
  if (readFailures.length > 0) {
    errors.push(formatReadFailureMessage(readFailures));
  }
  if (failedFiles.length > 0) {
    errors.push(formatParseFailureMessage(failedFiles));
  }

  return errors.length > 0 ? errors.join("\n\n") : null;
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

const toPrepareFailure = (
  error: unknown,
  fileName: string,
): FileImportPrepareFailure => {
  const code =
    error instanceof FileConvertError
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

const resolveFileConverterSource = (
  pendingImportFile: PendingImportFile,
): FileConverterSource => {
  if (pendingImportFile.canUseNativePath === false) {
    return { kind: "data" };
  }

  const path =
    pendingImportFile.kind === "path"
      ? String(pendingImportFile.resource?.fsPath ?? "").trim()
      : "";

  return path ? { kind: "path", path } : { kind: "data" };
};

function getPriorityImportIndexes(
  pendingImportFiles: readonly PendingImportFile[],
  selectedRelativePath: string | null,
): number[] {
  const selectedIndex = selectedRelativePath
    ? pendingImportFiles.findIndex(file =>
      normalizeRelativePath(file.relativePath) === selectedRelativePath
    )
    : -1;
  const indexes: number[] = [];
  if (selectedIndex >= 0) {
    indexes.push(selectedIndex);
  }

  for (let index = 0; index < pendingImportFiles.length; index += 1) {
    if (index !== selectedIndex) {
      indexes.push(index);
    }
  }

  return indexes;
}

function normalizeRelativePath(value: unknown): string | null {
  const relativePath = String(value ?? "").trim();
  return relativePath || null;
}

const formatReadFailureMessage = (
  readFailures: readonly FolderFileReadFailure[],
): string => [
  localize(
    "import.failedToReadFiles",
    "Failed to read {count} file(s).",
    { count: readFailures.length },
  ),
  getReadFailureReason(readFailures),
  localize("import.failedFileList", "Files:"),
  ...readFailures.map(file => file.relativePath || file.fileName),
].join("\n");

const getReadFailureReason = (
  readFailures: readonly FolderFileReadFailure[],
): string => {
  const reasonCounts = new Map<string, number>();
  for (const file of readFailures) {
    const reason = file.message.trim() || localize(
      "import.failureReasonReadUnknown",
      "The file could not be read.",
    );
    reasonCounts.set(reason, (reasonCounts.get(reason) ?? 0) + 1);
  }

  const reasons = Array.from(reasonCounts.entries())
    .map(([reason, count]) => ({ count, reason }))
    .sort((a, b) => b.count - a.count);

  if (reasons.length === 1) {
    return localize(
      "import.failedToReadReason",
      "Reason: {reason}",
      { reason: reasons[0].reason },
    );
  }

  const shownReasons = reasons.slice(0, 2).map(({ count, reason }) =>
    localize(
      "import.failedToReadReasonEntry",
      "{count} file(s): {reason}",
      { count, reason },
    )
  );
  const remainingCount = reasons.length - shownReasons.length;
  if (remainingCount > 0) {
    shownReasons.push(
      localize(
        "import.moreReadFailureReasons",
        "{count} more reason(s)",
        { count: remainingCount },
      ),
    );
  }

  return localize(
    "import.failedToReadReasons",
    "Reasons: {reasons}",
    { reasons: shownReasons.join("; ") },
  );
};

const formatParseFailureMessage = (
  failedFiles: readonly FileImportPrepareFailure[],
): string => [
  localize(
    "import.failedToParseFiles",
    "Failed to parse {count} file(s).",
    { count: failedFiles.length },
  ),
  getImportErrorReason(failedFiles),
  localize("import.failedFileList", "Files:"),
  ...failedFiles.map(file => file.fileName),
].join("\n");

const getImportErrorReason = (
  failedFiles: readonly FileImportPrepareFailure[],
): string => {
  const reasonCounts = new Map<string, number>();
  for (const file of failedFiles) {
    const reason = getPrepareFailureReason(file);
    reasonCounts.set(reason, (reasonCounts.get(reason) ?? 0) + 1);
  }

  const reasons = Array.from(reasonCounts.entries())
    .map(([reason, count]) => ({ count, reason }))
    .sort((a, b) => b.count - a.count);

  if (reasons.length === 1) {
    return localize(
      "import.failedToParseReason",
      "Reason: {reason}",
      { reason: reasons[0].reason },
    );
  }

  const shownReasons = reasons.slice(0, 2).map(({ count, reason }) =>
    localize(
      "import.failedToParseReasonEntry",
      "{count} file(s): {reason}",
      { count, reason },
    )
  );
  const remainingCount = reasons.length - shownReasons.length;
  if (remainingCount > 0) {
    shownReasons.push(
      localize(
        "import.moreParseFailureReasons",
        "{count} more reason(s)",
        { count: remainingCount },
      ),
    );
  }

  return localize(
    "import.failedToParseReasons",
    "Reasons: {reasons}",
    { reasons: shownReasons.join("; ") },
  );
};

const getPrepareFailureReason = (failure: FileImportPrepareFailure): string => {
  switch (failure.code) {
    case "UNRESOLVED_IMPORT_PATH":
      return localize(
        "import.failureReasonUnresolvedPath",
        "The local file path could not be resolved.",
      );
    case "IMPORT_FILE_NOT_FOUND":
    case "EXCEL_FILE_NOT_FOUND":
      return localize(
        "import.failureReasonFileNotFound",
        "The file no longer exists or cannot be read.",
      );
    case "RUST_CONVERTER_NOT_FOUND":
      return localize(
        "import.failureReasonConverterMissing",
        "The Excel conversion component was not found.",
      );
    case "RUST_CONVERTER_FAILED":
    case "BROWSER_XLSX_CONVERSION_FAILED":
    case "BROWSER_XLSX_CONVERSION_TIMEOUT":
    case "BROWSER_XLSX_FILE_TOO_LARGE":
      return localize(
        "import.failureReasonExcelConversion",
        "Excel conversion failed.",
      );
    case "RUST_IMPORT_ASSESSMENT_FAILED":
      return localize(
        "import.failureReasonAssessment",
        "The file could not be assessed for import.",
      );
    case "UNSUPPORTED_IMPORT_FORMAT":
      return localize(
        "import.failureReasonUnsupportedFormat",
        "The file format is not supported.",
      );
    case "EXCEL_CONVERSION_UNAVAILABLE":
      return localize(
        "import.failureReasonExcelUnavailable",
        "Excel import requires a conversion component.",
      );
    case "RUST_IMPORT_PREPARE_FAILED":
      return localize(
        "import.failureReasonPrepare",
        "Import preparation failed.",
      );
    default:
      return failure.message.trim() || localize(
        "import.failureReasonUnknown",
        "Import preparation failed.",
      );
  }
};
