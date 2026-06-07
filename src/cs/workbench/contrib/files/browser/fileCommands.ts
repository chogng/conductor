import { URI } from "src/cs/base/common/uri";
import { localize } from "src/cs/nls";
import {
  CommandsRegistry,
  type ICommandHandler,
} from "src/cs/platform/commands/common/commands";
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
import type { ServicesAccessor } from "src/cs/platform/instantiation/common/instantiation";
import { createFileSource } from "src/cs/workbench/contrib/files/browser/fileActions";
import {
  collectFolderImportFiles,
  type FolderFileReadFailure,
} from "src/cs/workbench/contrib/files/browser/fileImportExport";
import type { FilesPaneHost } from "src/cs/workbench/contrib/files/browser/filesPaneHost";
import { IFilesViewModeService } from "src/cs/workbench/contrib/files/browser/filesViewModeService";
import {
  FilesViewId,
  REMOVE_FILE_ITEM_COMMAND_ID,
  RENAME_FILE_ITEM_COMMAND_ID,
  SLICE_FILE_WITH_TEMPLATE_COMMAND_ID,
  SET_FILE_TEMPLATE_COMMAND_ID,
  TOGGLE_THUMBNAIL_VIEW_ACTION_ID,
  type FileSource,
} from "src/cs/workbench/contrib/files/common/files";
import type { ImportFilePrepareFailure } from "src/cs/workbench/services/analysisFile/browser/importPipeline";
import { notificationService } from "src/cs/workbench/services/notification/common/notificationService";
import type { IPathService } from "src/cs/workbench/services/path/common/pathService";
import { IViewsService } from "src/cs/workbench/services/views/common/viewsService";
import type { TemplateSelection } from "src/cs/workbench/contrib/template/common/templateSelection";

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
    title: localize("import.pickFolderTitle", "Select a folder to import"),
    openLabel: localize("import.openFolderButton", "Open Folder"),
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
    "The current browser environment cannot run the preview component. WebAssembly may be disabled. Open this page in a standalone Chrome or Edge window, then import again.",
  )
  : localize(
    "files.importUnsupportedPicker",
    "The current browser environment does not support folder selection. Open this page in a standalone Chrome or Edge window, then import again.",
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
      "The current import list does not support creating empty folders yet.",
    ),
    type: "info",
  });
};

export const toggleThumbnailViewHandler: ICommandHandler = (accessor) => {
  accessor.get(IFilesViewModeService).toggleViewMode();
};

CommandsRegistry.registerCommand({
  id: TOGGLE_THUMBNAIL_VIEW_ACTION_ID,
  handler: toggleThumbnailViewHandler,
});

export const removeFileItemHandler: ICommandHandler<[unknown]> = (
  accessor,
  fileId,
) => {
  const normalizedFileId = normalizeCommandFileId(fileId);
  if (!normalizedFileId) {
    return;
  }

  getFilesPaneHost(accessor)?.removeFile(normalizedFileId);
};

CommandsRegistry.registerCommand({
  id: REMOVE_FILE_ITEM_COMMAND_ID,
  handler: removeFileItemHandler,
});

export const renameFileItemHandler: ICommandHandler<[unknown]> = (
  _accessor,
  fileId,
) => {
  if (!normalizeCommandFileId(fileId)) {
    return;
  }

  notificationService.showToast({
    id: "files.renameUnsupported",
    message: localize(
      "files.renameUnsupported",
      "Renaming imported files is not available yet.",
    ),
    type: "info",
  });
};

CommandsRegistry.registerCommand({
  id: RENAME_FILE_ITEM_COMMAND_ID,
  handler: renameFileItemHandler,
});

export const setFileTemplateHandler: ICommandHandler<[unknown, unknown]> = (
  accessor,
  fileId,
  selection,
) => {
  const normalizedFileId = normalizeCommandFileId(fileId);
  if (!normalizedFileId || !isTemplateSelection(selection)) {
    return;
  }

  getFilesPaneHost(accessor)?.setFileTemplateSelection(
    normalizedFileId,
    selection,
  );
};

CommandsRegistry.registerCommand({
  id: SET_FILE_TEMPLATE_COMMAND_ID,
  handler: setFileTemplateHandler,
});
export const sliceFileWithTemplateHandler: ICommandHandler<[unknown, unknown]> = (
  _accessor,
  fileId,
  selection,
) => {
  if (!normalizeCommandFileId(fileId) || !isTemplateSelection(selection)) {
    return;
  }

  notificationService.showToast({
    id: "files.sliceWithTemplateUnsupported",
    message: localize(
      "files.sliceWithTemplateUnsupported",
      "Slicing imported files with a template is not available yet.",
    ),
    type: "info",
  });
};

CommandsRegistry.registerCommand({
  id: SLICE_FILE_WITH_TEMPLATE_COMMAND_ID,
  handler: sliceFileWithTemplateHandler,
});

const getFilesPaneHost = (accessor: ServicesAccessor): FilesPaneHost | null =>
  accessor.get(IViewsService).getViewWithId<FilesPaneHost>(FilesViewId);

const normalizeCommandFileId = (fileId: unknown): string | null => {
  const normalized = String(fileId ?? "").trim();
  return normalized || null;
};

const isTemplateSelection = (value: unknown): value is TemplateSelection => {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  if (candidate.kind === "auto") {
    return true;
  }

  return candidate.kind === "template" &&
    typeof candidate.templateId === "string" &&
    candidate.templateId.trim().length > 0;
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
