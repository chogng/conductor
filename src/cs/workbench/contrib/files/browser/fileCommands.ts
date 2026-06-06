import { URI } from "src/cs/base/common/uri";
import { localize } from "src/cs/nls";
import type { IFileDialogService } from "src/cs/platform/dialogs/common/dialogs";
import {
  collectDataTransferFiles,
  type DataTransferFile,
} from "src/cs/platform/dnd/browser/dnd";
import { HTMLFileSystemProvider } from "src/cs/platform/files/browser/htmlFileSystemProvider";
import type { IFileService } from "src/cs/platform/files/common/files";
import {
  detectFolderImportSupport,
  type FolderImportSupport,
} from "src/cs/platform/files/browser/webFileSystemAccess";
import { createFileSource } from "src/cs/workbench/contrib/files/browser/fileActions";
import {
  collectFolderImportFiles,
  type FolderFileReadFailure,
} from "src/cs/workbench/contrib/files/browser/fileImportExport";
import type { FileSource } from "src/cs/workbench/contrib/files/common/files";
import type { ImportFilePrepareFailure } from "src/cs/workbench/services/analysisFile/browser/importPipeline";
import { notificationService } from "src/cs/workbench/services/notification/common/notificationService";
import type { IPathService } from "src/cs/workbench/services/path/common/pathService";

export type FolderImportFiles = {
  readonly files: FileSource[];
  readonly folder: URI;
  readonly readFailures: FolderFileReadFailure[];
};

const createDroppedFileSource = ({
  file,
  relativePath,
}: DataTransferFile): FileSource => createFileSource(file, relativePath);

export const collectDroppedFiles = async (
  dataTransfer: DataTransfer,
): Promise<FileSource[]> =>
  (await collectDataTransferFiles(dataTransfer)).map(createDroppedFileSource);

export const pickImportFolder = async ({
  dialogsService,
  pathService,
}: {
  readonly dialogsService: IFileDialogService;
  readonly pathService: IPathService;
}): Promise<URI | null> => {
  const folders = await dialogsService.showOpenDialog({
    canSelectFolders: true,
    defaultUri: pathService.userHome({ preferLocal: true }),
    title: localize("import.pickFolderTitle", "选择要导入的文件夹"),
    openLabel: localize("import.openFolderButton", "打开文件夹"),
  });
  const folder = folders?.[0] ? URI.revive(folders[0]) : null;
  if (!folder) {
    return null;
  }

  return folder;
};

export const pickFolderImportFiles = async ({
  dialogsService,
  filesService,
  pathService,
}: {
  readonly dialogsService: IFileDialogService;
  readonly filesService: IFileService;
  readonly pathService: IPathService;
}): Promise<FolderImportFiles | null> => {
  const folder = await pickImportFolder({ dialogsService, pathService });
  if (!folder) {
    return null;
  }

  const result = await collectFolderImportFiles(folder, filesService);
  return {
    files: result.files,
    folder,
    readFailures: result.readFailures,
  };
};

export const getFolderImportUnsupportedMessage = (
  support: FolderImportSupport,
): string => support.reason === "no-webassembly"
  ? localize(
    "files.importUnsupportedWasm",
    "当前浏览器环境无法运行预览所需组件（WebAssembly 可能被禁用）。请在独立的 Chrome 或 Edge 窗口中打开本页面后再导入。",
  )
  : localize(
    "files.importUnsupportedPicker",
    "当前浏览器环境不支持文件夹选择。请在独立的 Chrome 或 Edge 窗口中打开本页面后再导入。",
  );

export const getFolderImportSupportForFileService = (
  filesService: IFileService,
): FolderImportSupport => {
  const provider = filesService.getProvider("file");
  if (provider instanceof HTMLFileSystemProvider) {
    return detectFolderImportSupport();
  }

  return { reason: null, supported: true };
};

export const canImportFolderWithFileService = (
  filesService: IFileService,
): boolean => {
  const support = getFolderImportSupportForFileService(filesService);
  if (support.supported) {
    return true;
  }

  notificationService.showToast({
    id: "files.importFolderUnsupported",
    message: getFolderImportUnsupportedMessage(support),
    type: "warning",
  });
  return false;
};

export const showCreateFolderUnsupported = (): void => {
  notificationService.showToast({
    id: "files.createFolderUnsupported",
    message: localize(
      "files.createFolderUnsupported",
      "当前导入列表暂不支持创建空文件夹。",
    ),
    type: "info",
  });
};

export const buildImportErrorMessage = ({
  failedFiles,
  hasAnyUnsupportedFiles,
  readFailures = [],
}: {
  readonly failedFiles: readonly ImportFilePrepareFailure[];
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
  failedFiles: readonly ImportFilePrepareFailure[],
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
  failedFiles: readonly ImportFilePrepareFailure[],
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

const getPrepareFailureReason = (failure: ImportFilePrepareFailure): string => {
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
