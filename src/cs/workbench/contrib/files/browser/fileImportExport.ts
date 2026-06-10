/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type { IAction } from "src/cs/base/common/actions";
import type { IDisposable } from "src/cs/base/common/lifecycle";
import { URI } from "src/cs/base/common/uri";
import { toSlashes } from "src/cs/base/common/extpath";
import { isWindows } from "src/cs/base/common/platform";
import { basename, joinPath } from "src/cs/base/common/resources";
import type { ICommandService as ICommandServiceType } from "src/cs/platform/commands/common/commands";
import {
  collectDataTransferFiles,
  getPathForFile,
  type DataTransferFile,
} from "src/cs/platform/dnd/browser/dnd";
import {
  FileType,
  type IFileContent,
  type IFileStat,
  type IFileService,
} from "src/cs/platform/files/common/files";
import { localize } from "src/cs/nls";
import { startPerf } from "src/cs/workbench/common/perf";
import { HTMLFileSystemProvider } from "src/cs/platform/files/browser/htmlFileSystemProvider";
import type { ExplorerFileEntry } from "src/cs/workbench/contrib/files/common/explorerModel";
import {
  isExcelImportFileName,
  isSupportedImportFileName,
  type FileSource,
} from "src/cs/workbench/services/files/common/files";
import type { FileConverterBackend } from "src/cs/workbench/services/files/common/fileConverterBackend";
import type {
  FolderFileCollection,
  FolderFileCollectionBatch,
  FolderFileReadFailure,
  FolderImportFileSource,
  FolderImportFiles,
} from "src/cs/workbench/services/files/common/folderImport";
import {
  canImportFolderWithFileService,
  getFolderImportSupportForFileService,
  getFolderImportUnsupportedMessage,
  pickImportFolder,
} from "src/cs/workbench/services/files/browser/folderImportDialog";
import {
  FOLDER_IMPORT_STAT_CONCURRENCY,
  MAX_FOLDER_WALK_DEPTH,
} from "src/cs/workbench/contrib/files/browser/fileConstants";
import {
  buildImportErrorMessage,
  collectPendingImportFiles,
  prepareFirstPendingImportFile,
  prepareRemainingPendingImportFiles,
  type FileImportPrepareFailure,
  type PendingImportFile,
  type PreparedFileImport,
} from "src/cs/workbench/services/files/browser/pendingImportFiles";
import { notificationService } from "src/cs/workbench/services/notification/common/notificationService";
import { WorkspaceWatcher } from "src/cs/workbench/services/workspaces/browser/workspaceWatcher";
import {
  resolveWorkspaceExternalChanges,
} from "src/cs/workbench/services/workspaces/common/externalChanges";
import {
  ADD_WORKSPACE_FOLDER_COMMAND_ID,
  createWorkspaceSourcePathKey,
  hasWorkspaceExternalChanges,
  WORKSPACE_EXTERNAL_CHANGES_TOAST_ID,
  type WorkspaceExternalChanges,
} from "src/cs/workbench/services/workspaces/common/workspaces";

export {
  buildFileIdentityKey,
  buildItemKey,
  type FileSource,
} from "src/cs/workbench/services/files/common/files";
export type {
  FolderFileCollection,
  FolderFileCollectionBatch,
  FolderFileReadFailure,
  FolderImportFileSource,
  FolderImportFiles,
} from "src/cs/workbench/services/files/common/folderImport";
export {
  canImportFolderWithFileService,
  getFolderImportSupportForFileService,
  getFolderImportUnsupportedMessage,
  pickImportFolder,
} from "src/cs/workbench/services/files/browser/folderImportDialog";

export type FileSourceWorkflowOptions = {
  readonly commandService: Pick<ICommandServiceType, "executeCommand">;
  readonly fileConverterBackendService: FileConverterBackend;
  readonly filesService: IFileService;
  readonly getFiles: () => readonly ExplorerFileEntry[];
  readonly getSelectedRelativePath: () => string | null;
  readonly isDisposed: () => boolean;
  readonly onAppendPreparedFiles: (preparedFiles: readonly PreparedFileImport[]) => void;
  readonly onDraggingChange: (isDragging: boolean) => void;
  readonly onErrorChange: (error: string | null) => void;
  readonly onRemoveFiles: (fileIds: readonly string[]) => void;
  readonly onReplacePreparedFiles: (
    preparedFiles: readonly PreparedFileImport[],
    selectedFileId: string | null,
  ) => void;
  readonly syncView: () => void;
};

export class FileSourceWorkflow implements IDisposable {
  private readonly folderWatcher: WorkspaceWatcher;
  private importRunId = 0;
  private folderRefreshRunId = 0;
  private pendingExternalFolder: URI | null = null;
  private pendingExternalChanges: WorkspaceExternalChanges | null = null;
  private readonly excludedSourcePaths = new Set<string>();

  constructor(
    private readonly options: FileSourceWorkflowOptions,
  ) {
    this.folderWatcher = new WorkspaceWatcher(options.filesService, folderPath => {
      void this.refreshImportedFolder(folderPath);
    });
  }

  public dispose(): void {
    this.folderWatcher.dispose();
    notificationService.disposeToast(WORKSPACE_EXTERNAL_CHANGES_TOAST_ID);
  }

  public rememberRemovedFiles(fileIds: readonly string[]): void {
    const removedFileIds = new Set(fileIds);
    for (const file of this.options.getFiles()) {
      if (!removedFileIds.has(file.fileId ?? "")) {
        continue;
      }

      const sourcePath = createWorkspaceSourcePathKey(file.relativePath);
      if (sourcePath) {
        this.excludedSourcePaths.add(sourcePath);
      }
    }
  }

  public importDroppedFiles(dataTransfer: DataTransfer | null): void {
    void this.doImportDroppedFiles(dataTransfer);
  }

  public openFolderDialog(): void {
    void this.doOpenFolderDialog();
  }

  private handleSelectFiles(selectedFiles: FileSource[]): void {
    this.clearImportedFolderWatch();
    this.options.onDraggingChange(false);
    if (selectedFiles.length === 0) {
      this.options.onErrorChange(this.getNoSupportedDroppedFilesError());
      this.options.syncView();
      return;
    }

    void this.importFiles(selectedFiles);
  }

  private async doImportDroppedFiles(dataTransfer: DataTransfer | null): Promise<void> {
    if (!dataTransfer) {
      this.handleSelectFiles([]);
      return;
    }

    this.handleSelectFiles(await collectDroppedFiles(dataTransfer));
  }

  private async doOpenFolderDialog(): Promise<void> {
    this.options.onErrorChange(null);
    this.options.syncView();

    try {
      const folder = await this.options.commandService.executeCommand<URI | null>(ADD_WORKSPACE_FOLDER_COMMAND_ID);
      if (!folder || this.options.isDisposed()) {
        return;
      }

      this.excludedSourcePaths.clear();
      await this.importFolderIncrementally(folder);
    } catch (error) {
      if (this.options.isDisposed()) {
        return;
      }

      console.error("Failed to read files from the selected folder.", error);

      this.options.onErrorChange(localize(
        "import.failedToReadSelectedFolder",
        "Failed to read files from the selected folder.",
      ));
      this.options.syncView();
    }
  }

  private async importFiles(
    newFiles: readonly FileSource[],
    options: {
      readonly preserveSelection?: boolean;
      readonly readFailures?: readonly FolderFileReadFailure[];
      readonly replaceWhenEmpty?: boolean;
      readonly shouldContinue?: () => boolean;
    } = {},
  ): Promise<void> {
    const runId = this.importRunId + 1;
    this.importRunId = runId;
    const finishBatchPerf = startPerf("import:add-files", {
      currentCount: 0,
      incomingCount: newFiles.length,
    });

    this.options.onErrorChange(null);
    this.options.syncView();

    const failedFiles: FileImportPrepareFailure[] = [];
    const canApplyResult = (): boolean =>
      !this.options.isDisposed() &&
      runId === this.importRunId &&
      (!options.shouldContinue || options.shouldContinue());
    const {
      hasAnyUnsupportedFiles,
      pendingImportFiles,
      unsupportedCount,
    } = collectPendingImportFiles([...newFiles]);
    if (pendingImportFiles.length === 0) {
      finishBatchPerf({
        acceptedCount: 0,
        duplicateCount: 0,
        failedCount: 0,
        unsupportedCount,
      });
      if (options.replaceWhenEmpty && canApplyResult()) {
        this.options.onReplacePreparedFiles([], null);
      }
      if (canApplyResult()) {
        this.options.onErrorChange(buildImportErrorMessage({
          failedFiles,
          hasAnyUnsupportedFiles,
          readFailures: options.readFailures,
        }));
        this.options.syncView();
      }
      return;
    }

    const selectedRelativePath = options.preserveSelection
      ? this.options.getSelectedRelativePath()
      : null;
    const firstImport = await prepareFirstPendingImportFile({
      canApplyResult,
      failedFiles,
      fileConverterBackend: this.options.fileConverterBackendService,
      pendingImportFiles,
      selectedRelativePath,
    });
    let acceptedCount = firstImport.result ? 1 : 0;

    if (firstImport.result && canApplyResult()) {
      const { prepared } = firstImport.result;
      this.options.onReplacePreparedFiles(
        [prepared],
        prepared.fileInfo.fileId,
      );
    }

    if (canApplyResult()) {
      acceptedCount += await prepareRemainingPendingImportFiles({
        canApplyResult,
        failedFiles,
        fileConverterBackend: this.options.fileConverterBackendService,
        onPreparedFiles: preparedFiles => this.options.onAppendPreparedFiles(preparedFiles),
        pendingImportFiles,
        skippedIndexes: firstImport.attemptedIndexes,
      });
    }

    if (canApplyResult()) {
      this.logImportDiagnostics("files", failedFiles, options.readFailures);
      this.options.onErrorChange(buildImportErrorMessage({
        failedFiles,
        hasAnyUnsupportedFiles,
        readFailures: options.readFailures,
      }));
      this.options.syncView();
    }

    finishBatchPerf({
      acceptedCount,
      duplicateCount: 0,
      failedCount: failedFiles.length,
      unsupportedCount,
    });
  }

  private async importFolderIncrementally(folder: URI): Promise<void> {
    const runId = this.importRunId + 1;
    this.importRunId = runId;
    const finishBatchPerf = startPerf("import:add-files", {
      currentCount: 0,
      source: "folder",
    });
    const failedFiles: FileImportPrepareFailure[] = [];
    const canApplyResult = (): boolean =>
      !this.options.isDisposed() && runId === this.importRunId;
    let acceptedCount = 0;
    let hasStartedPreview = false;
    let prepareQueue: Promise<void> = Promise.resolve();
    let prepareQueueError: unknown = null;

    const queueRemainingFiles = (
      pendingImportFiles: readonly PendingImportFile[],
      skippedIndexes: ReadonlySet<number>,
    ): void => {
      prepareQueue = prepareQueue
        .then(async () => {
          if (!canApplyResult()) {
            return;
          }

          acceptedCount += await prepareRemainingPendingImportFiles({
            canApplyResult,
            failedFiles,
            fileConverterBackend: this.options.fileConverterBackendService,
            onPreparedFiles: preparedFiles => this.options.onAppendPreparedFiles(preparedFiles),
            pendingImportFiles,
            skippedIndexes,
          });
        })
        .catch((error) => {
          prepareQueueError = error;
        });
    };

    const result = await collectFolderImportFilesIncrementally(
      folder,
      this.options.filesService,
      {
        shouldContinue: canApplyResult,
        onBatch: async ({ files }) => {
          if (!canApplyResult()) {
            return;
          }

          const { pendingImportFiles } = collectPendingImportFiles([...files]);
          if (pendingImportFiles.length === 0) {
            return;
          }

          if (hasStartedPreview) {
            queueRemainingFiles(pendingImportFiles, new Set<number>());
            return;
          }

          const firstImport = await prepareFirstPendingImportFile({
            canApplyResult,
            failedFiles,
            fileConverterBackend: this.options.fileConverterBackendService,
            pendingImportFiles,
            selectedRelativePath: null,
          });
          if (firstImport.result && canApplyResult()) {
            const { prepared } = firstImport.result;
            this.options.onReplacePreparedFiles(
              [prepared],
              prepared.fileInfo.fileId,
            );
            acceptedCount += 1;
            hasStartedPreview = true;
          }

          queueRemainingFiles(
            pendingImportFiles,
            firstImport.attemptedIndexes,
          );
        },
      },
    );

    await prepareQueue;

    if (!canApplyResult()) {
      return;
    }

    if (prepareQueueError && import.meta.env?.DEV) {
      console.error(
        "Failed to prepare files from the selected folder.",
        prepareQueueError,
      );
    }

    this.watchImportedFolder(folder);
    this.logImportDiagnostics("folder", failedFiles, result.readFailures);
    this.options.onErrorChange(buildImportErrorMessage({
      failedFiles,
      hasAnyUnsupportedFiles: false,
      readFailures: result.readFailures,
    }));
    this.options.syncView();
    finishBatchPerf({
      acceptedCount,
      failedCount: failedFiles.length,
      scannedCount: result.files.length,
      unsupportedCount: 0,
    });
  }

  private getNoSupportedDroppedFilesError(): string {
    return localize(
      "import.noSupportedDroppedFiles",
      "No supported files found in the selected folder.",
    );
  }

  private watchImportedFolder(folder: URI): void {
    this.folderWatcher.watch(folder);
  }

  private clearImportedFolderWatch(): void {
    this.folderWatcher.clear();
    this.clearExternalChanges();
  }

  private async refreshImportedFolder(folder: URI): Promise<void> {
    if (this.options.isDisposed()) {
      return;
    }

    const runId = this.folderRefreshRunId + 1;
    this.folderRefreshRunId = runId;
    try {
      const result = await collectFolderImportFiles(folder, this.options.filesService);
      if (this.options.isDisposed() || runId !== this.folderRefreshRunId) {
        return;
      }

      const changes = resolveWorkspaceExternalChanges({
        excludedSourcePaths: this.excludedSourcePaths,
        files: this.options.getFiles(),
        scannedFiles: result.files,
      });
      if (!hasWorkspaceExternalChanges(changes)) {
        this.clearExternalChanges();
        return;
      }

      this.pendingExternalFolder = folder;
      this.pendingExternalChanges = changes;
      this.showExternalChanges(changes);
    } catch {
      if (this.options.isDisposed() || runId !== this.folderRefreshRunId) {
        return;
      }

      this.options.onErrorChange(localize(
        "import.failedToRefreshFolder",
        "Failed to refresh files from the selected folder.",
      ));
      this.options.syncView();
    }
  }

  private clearExternalChanges(): void {
    this.pendingExternalFolder = null;
    this.pendingExternalChanges = null;
    notificationService.hideToast(WORKSPACE_EXTERNAL_CHANGES_TOAST_ID);
  }

  private showExternalChanges(changes: WorkspaceExternalChanges): void {
    notificationService.showToast({
      actions: this.createExternalChangesActions(),
      duration: Number.POSITIVE_INFINITY,
      id: WORKSPACE_EXTERNAL_CHANGES_TOAST_ID,
      message: formatExternalChangesMessage(changes),
      type: "info",
    });
  }

  private createExternalChangesActions(): IAction[] {
    return [
      {
        id: "workspaces.externalChanges.apply",
        label: localize("workspaces.applyExternalChanges", "Apply"),
        tooltip: "",
        class: undefined,
        enabled: true,
        run: () => {
          void this.applyExternalChanges();
        },
      },
      {
        id: "workspaces.externalChanges.dismiss",
        label: localize("workspaces.dismissExternalChanges", "Ignore"),
        tooltip: "",
        class: undefined,
        enabled: true,
        run: () => {
          this.clearExternalChanges();
        },
      },
    ];
  }

  private async applyExternalChanges(): Promise<void> {
    const folder = this.pendingExternalFolder;
    const changes = this.pendingExternalChanges;
    if (!folder || !changes || this.options.isDisposed()) {
      return;
    }

    const runId = this.folderRefreshRunId + 1;
    this.folderRefreshRunId = runId;
    const folderKey = folder.toString();

    try {
      const result = await collectFolderImportFiles(folder, this.options.filesService);
      if (
        this.options.isDisposed() ||
        runId !== this.folderRefreshRunId ||
        this.folderWatcher.currentFolderKey !== folderKey
      ) {
        return;
      }

      const nextChanges = resolveWorkspaceExternalChanges({
        excludedSourcePaths: this.excludedSourcePaths,
        files: this.options.getFiles(),
        scannedFiles: result.files,
      });
      if (!hasWorkspaceExternalChanges(nextChanges)) {
        this.clearExternalChanges();
        return;
      }

      this.applyDeletedAndModifiedFiles(nextChanges);
      await this.appendExternalFiles(result.files, nextChanges, result.readFailures, () =>
        !this.options.isDisposed() &&
        runId === this.folderRefreshRunId &&
        this.folderWatcher.currentFolderKey === folderKey
      );
      this.clearExternalChanges();
    } catch {
      if (this.options.isDisposed() || runId !== this.folderRefreshRunId) {
        return;
      }

      this.options.onErrorChange(localize(
        "workspaces.failedToApplyExternalChanges",
        "Failed to apply external folder changes.",
      ));
      this.options.syncView();
    }
  }

  private applyDeletedAndModifiedFiles(changes: WorkspaceExternalChanges): void {
    const removedPaths = new Set([
      ...changes.deleted.map(change => change.relativePath),
      ...changes.modified.map(change => change.relativePath),
    ]);
    if (removedPaths.size === 0) {
      return;
    }

    const removedFileIds = this.options.getFiles()
      .filter(file => {
        const sourcePath = createWorkspaceSourcePathKey(file.relativePath);
        return Boolean(sourcePath && removedPaths.has(sourcePath));
      })
      .map(file => file.fileId)
      .filter((fileId): fileId is string => typeof fileId === "string");

    if (removedFileIds.length > 0) {
      this.options.onRemoveFiles(removedFileIds);
    }
  }

  private async appendExternalFiles(
    scannedFiles: readonly FileSource[],
    changes: WorkspaceExternalChanges,
    readFailures: readonly FolderFileReadFailure[],
    shouldContinue: () => boolean,
  ): Promise<void> {
    const importPaths = new Set([
      ...changes.added.map(change => change.relativePath),
      ...changes.modified.map(change => change.relativePath),
    ]);
    if (importPaths.size === 0) {
      return;
    }

    const files = scannedFiles.filter(file => {
      const sourcePath = createWorkspaceSourcePathKey(file.relativePath);
      return Boolean(sourcePath && importPaths.has(sourcePath));
    });
    if (files.length === 0) {
      return;
    }

    await this.appendFiles(files, {
      readFailures,
      shouldContinue,
    });
  }

  private async appendFiles(
    newFiles: readonly FileSource[],
    options: {
      readonly readFailures?: readonly FolderFileReadFailure[];
      readonly shouldContinue?: () => boolean;
    } = {},
  ): Promise<void> {
    const runId = this.importRunId + 1;
    this.importRunId = runId;
    const finishBatchPerf = startPerf("import:add-files", {
      currentCount: this.options.getFiles().length,
      incomingCount: newFiles.length,
      source: "workspace-change",
    });
    const canApplyResult = (): boolean =>
      !this.options.isDisposed() &&
      runId === this.importRunId &&
      (!options.shouldContinue || options.shouldContinue());
    const failedFiles: FileImportPrepareFailure[] = [];
    const {
      hasAnyUnsupportedFiles,
      pendingImportFiles,
      unsupportedCount,
    } = collectPendingImportFiles([...newFiles]);
    let acceptedCount = 0;

    if (pendingImportFiles.length > 0) {
      acceptedCount = await prepareRemainingPendingImportFiles({
        canApplyResult,
        failedFiles,
        fileConverterBackend: this.options.fileConverterBackendService,
        onPreparedFiles: preparedFiles => this.options.onAppendPreparedFiles(preparedFiles),
        pendingImportFiles,
        skippedIndexes: new Set<number>(),
      });
    }

    if (canApplyResult()) {
      this.logImportDiagnostics("workspace", failedFiles, options.readFailures);
      this.options.onErrorChange(buildImportErrorMessage({
        failedFiles,
        hasAnyUnsupportedFiles,
        readFailures: options.readFailures,
      }));
      this.options.syncView();
    }

    finishBatchPerf({
      acceptedCount,
      failedCount: failedFiles.length,
      unsupportedCount,
    });
  }

  private logImportDiagnostics(
    source: "folder" | "files" | "workspace",
    failedFiles: readonly FileImportPrepareFailure[],
    readFailures: readonly FolderFileReadFailure[] = [],
  ): void {
    if (failedFiles.length === 0 && readFailures.length === 0) {
      return;
    }

    console.warn(
      `[files] ${source} import completed with issues:`,
      {
        parseFailures: failedFiles.map((failure) => ({
          code: failure.code,
          fileName: failure.fileName,
          message: failure.message,
        })),
        readFailures: readFailures.map((failure) => ({
          fileName: failure.fileName,
          message: failure.message,
          relativePath: failure.relativePath,
        })),
      },
    );
  }
}

function formatExternalChangesMessage(changes: WorkspaceExternalChanges): string {
  const parts: string[] = [];
  if (changes.added.length > 0) {
    parts.push(localize(
      "workspaces.externalAddedCount",
      "{count} added",
      { count: changes.added.length },
    ));
  }
  if (changes.modified.length > 0) {
    parts.push(localize(
      "workspaces.externalModifiedCount",
      "{count} modified",
      { count: changes.modified.length },
    ));
  }
  if (changes.deleted.length > 0) {
    parts.push(localize(
      "workspaces.externalDeletedCount",
      "{count} deleted",
      { count: changes.deleted.length },
    ));
  }

  return localize(
    "workspaces.externalChangesDetected",
    "External folder changed: {summary}.",
    { summary: parts.join(", ") },
  );
}

type CollectFolderImportFilesOptions = {
  readonly onBatch?: (batch: FolderFileCollectionBatch) => Promise<void> | void;
  readonly shouldContinue?: () => boolean;
};

type FolderFileStatTask = {
  readonly name: string;
  readonly relativePath: string;
  readonly resource: URI;
};

const isAbsoluteFilePath = (filePath: string): boolean => {
  if (isWindows) {
    return /^[a-zA-Z]:[\\/]/.test(filePath) || filePath.startsWith("\\\\");
  }

  return filePath.startsWith("/");
};

export const createFileSource = (
  file: File,
  relativePath?: string | null,
  resource?: URI | null,
): FileSource => {
  const resourcePath = String(resource?.fsPath ?? "").trim();
  if (resource && resourcePath && isAbsoluteFilePath(resourcePath)) {
    return {
      file,
      fileName: file.name,
      kind: "path",
      lastModified: file.lastModified,
      relativePath,
      resource,
      size: file.size,
    };
  }

  const filePath = String(getPathForFile(file) ?? "").trim();
  if (filePath && isAbsoluteFilePath(filePath)) {
    return {
      file,
      fileName: file.name,
      kind: "path",
      lastModified: file.lastModified,
      relativePath,
      resource: URI.file(filePath),
      size: file.size,
    };
  }

  return {
    file,
    kind: "data",
    relativePath,
    resource: null,
  };
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
  readonly dialogsService: Parameters<typeof pickImportFolder>[0]["dialogsService"];
  readonly filesService: IFileService;
  readonly pathService: Parameters<typeof pickImportFolder>[0]["pathService"];
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

function joinResourcePath(parent: URI, name: string): URI {
  return joinPath(parent, name);
}

function getPathBaseName(path: string): string {
  return basename(URI.from({ path: toSlashes(String(path ?? "")), scheme: "file" }));
}

function getFileMimeType(fileName: string): string {
  if (isExcelImportFileName(fileName)) {
    return "application/octet-stream";
  }

  return "text/csv;charset=utf-8";
}

function decodeBase64(value: string): ArrayBuffer {
  const binary = atob(value);
  const buffer = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buffer);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return buffer;
}

function toFilePart(content: IFileContent): string | ArrayBuffer {
  return content.encoding === "base64" ? decodeBase64(content.value) : content.value;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error && error.message.trim()
    ? error.message
    : "The file could not be read.";
}

export async function collectFolderFiles(
  folder: URI,
  filesService: IFileService,
): Promise<FileSource[]> {
  return (await collectFolderImportFiles(folder, filesService)).files;
}

export async function collectFolderImportFiles(
  folder: URI,
  filesService: IFileService,
): Promise<FolderFileCollection> {
  return collectFolderImportFilesIncrementally(folder, filesService);
}

export async function collectFolderImportFilesIncrementally(
  folder: URI,
  filesService: IFileService,
  options: CollectFolderImportFilesOptions = {},
): Promise<FolderFileCollection> {
  const root = URI.revive(folder);
  const rootName = getPathBaseName(root.path) || "Folder";
  const files: FolderImportFileSource[] = [];
  const readFailures: FolderFileReadFailure[] = [];
  const canUseNativePath = !(filesService.getProvider(root.scheme) instanceof HTMLFileSystemProvider);

  await collectFolderFilesAt(root, rootName, files, readFailures, 0, filesService, options, canUseNativePath);
  return { files, readFailures };
}

function shouldContinueCollecting(options: CollectFolderImportFilesOptions): boolean {
  return !options.shouldContinue || options.shouldContinue();
}

async function collectFolderFilesAt(
  folder: URI,
  relativeFolderPath: string,
  files: FolderImportFileSource[],
  readFailures: FolderFileReadFailure[],
  depth: number,
  filesService: IFileService,
  options: CollectFolderImportFilesOptions,
  canUseNativePath: boolean,
): Promise<void> {
  if (depth > MAX_FOLDER_WALK_DEPTH || !shouldContinueCollecting(options)) {
    return;
  }

  let entries: readonly [string, FileType][];
  try {
    entries = await filesService.readDir(folder);
  } catch (error) {
    readFailures.push({
      fileName: getPathBaseName(relativeFolderPath) || relativeFolderPath,
      message: getErrorMessage(error),
      relativePath: relativeFolderPath,
    });
    return;
  }

  const fileTasks: FolderFileStatTask[] = [];
  const folderTasks: Array<{
    readonly relativePath: string;
    readonly resource: URI;
  }> = [];

  for (const [name, type] of entries) {
    const child = joinResourcePath(folder, name);
    const relativePath = `${relativeFolderPath}/${name}`;

    if ((type & FileType.Directory) === FileType.Directory) {
      folderTasks.push({
        relativePath,
        resource: child,
      });
      continue;
    }

    if ((type & FileType.File) !== FileType.File || !isSupportedImportFileName(name)) {
      continue;
    }

    fileTasks.push({
      name,
      relativePath,
      resource: child,
    });
  }

  if (fileTasks.length > 0) {
    const sortedFileTasks = [...fileTasks].sort(compareFolderFileStatTasks);
    for (
      let startIndex = 0;
      startIndex < sortedFileTasks.length;
      startIndex += FOLDER_IMPORT_STAT_CONCURRENCY
    ) {
      if (!shouldContinueCollecting(options)) {
        return;
      }

      const batch = await statFolderFileTasks(
        sortedFileTasks.slice(startIndex, startIndex + FOLDER_IMPORT_STAT_CONCURRENCY),
        filesService,
        canUseNativePath,
      );
      files.push(...batch.files);
      readFailures.push(...batch.readFailures);
      if (batch.files.length > 0 && shouldContinueCollecting(options)) {
        await options.onBatch?.({ files: batch.files });
      }
    }
  }

  for (const task of folderTasks) {
    if (!shouldContinueCollecting(options)) {
      return;
    }

    await collectFolderFilesAt(
      task.resource,
      task.relativePath,
      files,
      readFailures,
      depth + 1,
      filesService,
      options,
      canUseNativePath,
    );
  }
}

function compareFolderFileStatTasks(
  first: FolderFileStatTask,
  second: FolderFileStatTask,
): number {
  const firstIsExcel = isExcelImportFileName(first.name);
  const secondIsExcel = isExcelImportFileName(second.name);
  if (firstIsExcel !== secondIsExcel) {
    return firstIsExcel ? 1 : -1;
  }

  return first.relativePath.localeCompare(second.relativePath, undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

async function statFolderFileTasks(
  tasks: readonly FolderFileStatTask[],
  filesService: IFileService,
  canUseNativePath: boolean,
): Promise<FolderFileCollection> {
  const results: Array<
    | {
      readonly ok: true;
      readonly lastModified: number;
      readonly name: string;
      readonly relativePath: string;
      readonly resource: URI;
      readonly size: number;
    }
    | {
      readonly ok: false;
      readonly fileName: string;
      readonly message: string;
      readonly relativePath: string;
    }
    | undefined
  > = new Array(tasks.length);
  let nextTaskIndex = 0;
  const workerCount = Math.min(FOLDER_IMPORT_STAT_CONCURRENCY, tasks.length);
  const files: FolderImportFileSource[] = [];
  const readFailures: FolderFileReadFailure[] = [];

  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (true) {
      const index = nextTaskIndex;
      nextTaskIndex += 1;
      const task = tasks[index];
      if (!task) {
        return;
      }

      const result = await tryStatFileSource(task.resource, filesService);
      results[index] = result.ok
        ? {
          lastModified: getFileLastModified(result.stat),
          name: task.name,
          ok: true,
          relativePath: task.relativePath,
          resource: task.resource,
          size: Number(result.stat.size) || 0,
        }
        : {
          fileName: task.name,
          message: result.message,
          ok: false,
          relativePath: task.relativePath,
        };
    }
  }));

  for (const result of results) {
    if (!result) {
      continue;
    }

    if (result.ok) {
      files.push({
        canUseNativePath,
        fileName: result.name,
        kind: "path",
        lastModified: result.lastModified,
        loadFile: () => readFileSource(result.resource, result.name, filesService),
        relativePath: result.relativePath,
        resource: result.resource,
        size: result.size,
      });
    } else {
      readFailures.push({
        fileName: result.fileName,
        message: result.message,
        relativePath: result.relativePath,
      });
    }
  }

  return { files, readFailures };
}

async function tryStatFileSource(
  resource: URI,
  filesService: IFileService,
): Promise<
  | { readonly ok: true; readonly stat: IFileStat }
  | { readonly ok: false; readonly message: string }
> {
  try {
    return {
      ok: true,
      stat: await filesService.stat(resource),
    };
  } catch (error) {
    return {
      message: getErrorMessage(error),
      ok: false,
    };
  }
}

function getFileLastModified(stat: IFileStat): number {
  return Number.isFinite(stat.mtime) ? stat.mtime : Date.now();
}

async function readFileSource(
  resource: URI,
  name: string,
  filesService: IFileService,
): Promise<File> {
  const stat = await filesService.stat(resource);
  const content = await filesService.readFile(resource, {
    encoding: isExcelImportFileName(name) ? "base64" : "utf8",
  });

  return new File([toFilePart(content)], name, {
    lastModified: Number.isFinite(stat.mtime) ? stat.mtime : Date.now(),
    type: getFileMimeType(name),
  });
}
