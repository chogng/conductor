/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type { IAction } from "src/cs/base/common/actions";
import { toSlashes } from "src/cs/base/common/extpath";
import type { IDisposable } from "src/cs/base/common/lifecycle";
import { isWindows } from "src/cs/base/common/platform";
import { basename, joinPath } from "src/cs/base/common/resources";
import { URI } from "src/cs/base/common/uri";
import { localize } from "src/cs/nls";
import type { ICommandService } from "src/cs/platform/commands/common/commands";
import type { IFileDialogService } from "src/cs/platform/dialogs/common/dialogs";
import {
  collectDataTransferFiles,
  getPathForFile,
  type DataTransferFile,
} from "src/cs/platform/dnd/browser/dnd";
import { HTMLFileSystemProvider } from "src/cs/platform/files/browser/htmlFileSystemProvider";
import {
  detectFolderImportSupport,
  type FolderImportSupport,
} from "src/cs/platform/files/browser/webFileSystemAccess";
import {
  FileType,
  type IFileContent,
  type IFileStat,
  type IFileService,
} from "src/cs/platform/files/common/files";
import { startPerf } from "src/cs/workbench/common/perf";
import {
  FOLDER_IMPORT_STAT_CONCURRENCY,
  MAX_FOLDER_WALK_DEPTH,
} from "src/cs/workbench/contrib/files/browser/fileConstants";
import type { ExplorerFileEntry } from "src/cs/workbench/contrib/files/common/explorerModel";
import {
  buildFileSourceIdentityKey,
  buildItemKey,
  isExcelImportFileName,
  isSupportedImportFileName,
  type FileSource,
  type FolderFileCollection,
  type FolderFileCollectionBatch,
  type FolderFileReadFailure,
  type FolderImportFileSource,
  type FolderImportFiles,
  type ImportedFileRecord,
  type ImportFileData,
} from "src/cs/workbench/services/files/common/files";
import {
  convertImportFile,
  createImportedFileRecord,
  FileConvertError,
  type ConvertedImportSheet,
  type FileConverterSource,
} from "src/cs/workbench/services/files/browser/fileConverter";
import type { FileConverterBackend } from "src/cs/workbench/services/files/common/fileConverterBackend";
import { notificationService } from "src/cs/workbench/services/notification/common/notificationService";
import type { IPathService } from "src/cs/workbench/services/path/common/pathService";
import type { SessionFile } from "src/cs/workbench/services/session/common/sessionTypes";
import { WorkspaceWatcher } from "src/cs/workbench/services/workspaces/browser/workspaceWatcher";
import { resolveWorkspaceExternalChanges } from "src/cs/workbench/services/workspaces/common/externalChanges";
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
} from "src/cs/workbench/services/files/common/files";

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

export type PreparedFileSourcesImport = {
  readonly errorMessage: string | null;
  readonly preparedFiles: readonly PreparedFileImport[];
};

export type PrepareFileSourcesForImportOptions = {
  readonly canApplyResult?: () => boolean;
  readonly fileConverterBackend: FileConverterBackend;
  readonly selectedRelativePath?: string | null;
  readonly sources: readonly FileSource[];
};

export type PrepareDroppedFilesForImportOptions = Omit<
  PrepareFileSourcesForImportOptions,
  "sources"
> & {
  readonly dataTransfer: DataTransfer | null;
};

export type FileSourceWorkflowOptions = {
  readonly commandService: Pick<ICommandService, "executeCommand">;
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
  return folder || null;
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

// Explorer view-local source workflow helper. This is not a service boundary:
// it collects dropped/folder sources, prepares conversion results, and returns
// prepared imports to the Explorer ViewPane; session commit remains outside.
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
      tables: createImportedRawTableInputs(prepared.sheets),
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

const createImportedRawTableInputs = (
  sheets: readonly ConvertedImportSheet[] | undefined,
) => sheets?.length
  ? sheets.map((sheet, index) => ({
      columnCount: sheet.columnCount,
      csvText: sheet.csvText,
      maxCellLengths: sheet.maxCellLengths,
      normalizedCsvPath: sheet.normalizedCsvPath,
      sheetIndex: sheet.sheetIndex ?? index,
      sheetName: sheet.sheetName,
    }))
  : undefined;

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

export const prepareDroppedFilesForImport = async ({
  dataTransfer,
  ...options
}: PrepareDroppedFilesForImportOptions): Promise<PreparedFileSourcesImport> =>
  prepareFileSourcesForImport({
    ...options,
    sources: dataTransfer ? await collectDroppedFiles(dataTransfer) : [],
  });

export const prepareFileSourcesForImport = async ({
  canApplyResult = () => true,
  fileConverterBackend,
  selectedRelativePath = null,
  sources,
}: PrepareFileSourcesForImportOptions): Promise<PreparedFileSourcesImport> => {
  const failedFiles: FileImportPrepareFailure[] = [];
  const {
    hasAnyUnsupportedFiles,
    pendingImportFiles,
  } = collectPendingImportFiles([...sources]);

  if (pendingImportFiles.length === 0) {
    return {
      errorMessage: buildImportErrorMessage({
        failedFiles,
        hasAnyUnsupportedFiles,
      }),
      preparedFiles: [],
    };
  }

  const preparedFiles: PreparedFileImport[] = [];
  const firstImport = await prepareFirstPendingImportFile({
    canApplyResult,
    failedFiles,
    fileConverterBackend,
    pendingImportFiles,
    selectedRelativePath,
  });
  if (firstImport.result) {
    preparedFiles.push(firstImport.result.prepared);
  }

  await prepareRemainingPendingImportFiles({
    canApplyResult,
    failedFiles,
    fileConverterBackend,
    onPreparedFiles: nextPreparedFiles => {
      preparedFiles.push(...nextPreparedFiles);
    },
    pendingImportFiles,
    skippedIndexes: firstImport.attemptedIndexes,
  });

  return {
    errorMessage: buildImportErrorMessage({
      failedFiles,
      hasAnyUnsupportedFiles,
    }),
    preparedFiles,
  };
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
