import { URI } from "src/cs/base/common/uri";
import { localize } from "src/cs/nls";
import type { IFileDialogService } from "src/cs/platform/dialogs/common/dialogs";
import {
  collectDataTransferFiles,
  type DataTransferFile,
} from "src/cs/platform/dnd/browser/dnd";
import type { IFileService } from "src/cs/platform/files/common/files";
import { createFileSource } from "src/cs/workbench/contrib/files/browser/fileActions";
import { collectFolderFiles } from "src/cs/workbench/contrib/files/browser/fileImportExport";
import type { FileSource } from "src/cs/workbench/contrib/files/common/files";
import { MAX_IMPORT_ERROR_FILE_NAMES } from "src/cs/workbench/contrib/files/browser/fileConstants";
import type { ImportFilePrepareFailure } from "src/cs/workbench/services/analysisFile/browser/importPipeline";
import { notificationService } from "src/cs/workbench/services/notification/common/notificationService";
import type { IPathService } from "src/cs/workbench/services/path/common/pathService";

export type FolderImportFiles = {
  readonly files: FileSource[];
  readonly folder: URI;
};

const createDroppedFileSource = ({
  file,
  relativePath,
}: DataTransferFile): FileSource => createFileSource(file, relativePath);

export const collectDroppedFiles = async (
  dataTransfer: DataTransfer,
): Promise<FileSource[]> =>
  (await collectDataTransferFiles(dataTransfer)).map(createDroppedFileSource);

export const pickFolderImportFiles = async ({
  dialogsService,
  filesService,
  pathService,
}: {
  readonly dialogsService: IFileDialogService;
  readonly filesService: IFileService;
  readonly pathService: IPathService;
}): Promise<FolderImportFiles | null> => {
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

  return {
    files: await collectFolderFiles(folder, filesService),
    folder,
  };
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
}: {
  readonly failedFiles: readonly ImportFilePrepareFailure[];
  readonly hasAnyUnsupportedFiles: boolean;
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
  if (failedFiles.length > 0) {
    errors.push(
      localize(
        "import.failedToParseFiles",
        "Failed to parse: {fileNames}",
        { fileNames: getImportErrorFileNames(failedFiles.map(file => file.fileName)) },
      ),
    );
    errors.push(getImportErrorReason(failedFiles));
  }

  return errors.length > 0 ? errors.join("\n") : null;
};

const getImportErrorFileNames = (fileNames: readonly string[]): string => {
  const names = fileNames.slice(0, MAX_IMPORT_ERROR_FILE_NAMES);
  const remainingCount = fileNames.length - MAX_IMPORT_ERROR_FILE_NAMES;
  if (remainingCount <= 0) {
    return names.join(", ");
  }

  names.push(
    remainingCount === 1
      ? localize("import.oneMoreParseFailure", "...1 additional file not shown")
      : localize(
          "import.moreParseFailures",
          "...{count} additional files not shown",
          { count: remainingCount },
        ),
  );
  return names.join(", ");
};

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
