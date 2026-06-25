/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type { IAction } from "src/cs/base/common/actions";
import { toSlashes } from "src/cs/base/common/extpath";
import { DisposableStore, type IDisposable } from "src/cs/base/common/lifecycle";
import { isWindows } from "src/cs/base/common/platform";
import { basename, joinPath } from "src/cs/base/common/resources";
import { URI } from "src/cs/base/common/uri";
import { localize } from "src/cs/nls";
import type { ICommandService } from "src/cs/platform/commands/common/commands";
import type { IFileDialogService } from "src/cs/platform/dialogs/common/dialogs";
import { getPathForFile } from "src/cs/platform/dnd/browser/dnd";
import { HTMLFileSystemProvider } from "src/cs/platform/files/browser/htmlFileSystemProvider";
import {
  detectFolderImportSupport,
  WebFileSystemAccess,
  type FileSystemDirectoryHandle,
  type FileSystemFileHandle,
  type FileSystemHandle,
  type FolderImportSupport,
} from "src/cs/platform/files/browser/webFileSystemAccess";
import {
  FileType,
  type IFileContent,
  type IFileStat,
  type IFileService,
} from "src/cs/platform/files/common/files";
import { getPerfNow, startPerf } from "src/cs/workbench/common/perf";
import {
  IMPORT_ERROR_NOTIFICATION_ID,
  FOLDER_IMPORT_BATCH_SIZE,
  FOLDER_IMPORT_STAT_CONCURRENCY,
  MAX_FOLDER_WALK_DEPTH,
} from "src/cs/workbench/contrib/files/browser/fileConstants";
import type { ExplorerFileEntry } from "src/cs/workbench/contrib/files/common/explorerModel";
import type { ImportTableModelSeed } from "src/cs/workbench/services/tableModel/common/tableModel";
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
  convertPreparedImportFileResult,
  convertPreparedImportFileResultSync,
  createImportedFileRecord,
  FileConvertError,
  type ConvertedImportFile,
  type ConvertedImportSheet,
  type FileConverterSource,
} from "src/cs/workbench/services/files/browser/fileConverter";
import {
  markTemplateApplyPerformanceTrace,
} from "src/cs/workbench/contrib/performance/browser/templateApplyPerformanceTrace";
import type {
  FileConverterBackend,
  FileConverterPreparePayload,
  FileConverterPreparedFile,
} from "src/cs/workbench/services/files/common/fileConverterBackend";
import {
  INotificationService,
  Severity,
  type INotificationHandle,
} from "src/cs/workbench/services/notification/common/notificationService";
import type { IPathService } from "src/cs/workbench/services/path/common/pathService";
import type { SessionFile } from "src/cs/workbench/services/session/common/sessionTypes";
import { WorkspaceWatcher } from "src/cs/workbench/services/workspaces/browser/workspaceWatcher";
import { resolveWorkspaceExternalChanges } from "src/cs/workbench/services/workspaces/common/externalChanges";
import {
  ADD_WORKSPACE_FOLDER_COMMAND_ID,
  createWorkspaceSourcePathKey,
  hasWorkspaceExternalChanges,
  WORKSPACE_EXTERNAL_CHANGES_NOTIFICATION_ID,
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

const PENDING_IMPORT_APPEND_BATCH_SIZE = 50;
const PENDING_IMPORT_BULK_APPEND_BATCH_SIZE = 100;
const PENDING_IMPORT_BULK_APPEND_THRESHOLD = 200;
const PENDING_IMPORT_PREPARE_MIN_CONCURRENCY = 4;
const PENDING_IMPORT_PREPARE_DEFAULT_CONCURRENCY = 8;
const PENDING_IMPORT_PREPARE_MAX_CONCURRENCY = 16;
const FILE_SOURCE_READ_ATTEMPTS = 2;

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

export function getPendingImportPrepareConcurrency(
  hardwareConcurrency = globalThis.navigator?.hardwareConcurrency,
): number {
  const coreCount = Number.isFinite(hardwareConcurrency)
    ? Math.max(1, Math.floor(hardwareConcurrency))
    : PENDING_IMPORT_PREPARE_DEFAULT_CONCURRENCY / 2;
  const scaledConcurrency = coreCount * 2;

  return Math.max(
    PENDING_IMPORT_PREPARE_MIN_CONCURRENCY,
    Math.min(PENDING_IMPORT_PREPARE_MAX_CONCURRENCY, scaledConcurrency),
  );
}

export function getPendingImportAppendBatchSize(
  totalCount: number,
  acceptedCount: number,
): number {
  const normalizedTotalCount = Math.max(0, Math.floor(Number(totalCount)));
  const normalizedAcceptedCount = Math.max(0, Math.floor(Number(acceptedCount)));
  if (
    normalizedTotalCount >= PENDING_IMPORT_BULK_APPEND_THRESHOLD &&
    normalizedAcceptedCount >= PENDING_IMPORT_APPEND_BATCH_SIZE
  ) {
    return PENDING_IMPORT_BULK_APPEND_BATCH_SIZE;
  }

  return PENDING_IMPORT_APPEND_BATCH_SIZE;
}

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
  readonly preparedTableModelSeed?: ImportTableModelSeed;
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

export type PendingImportSourceStatus = "pending" | "preparing" | "failed";

export type PendingImportSourceStatusChange = {
  readonly message?: string | null;
  readonly preparedTableModelSeed?: ImportTableModelSeed;
  readonly status: PendingImportSourceStatus;
};

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
  readonly createPreparedTableModelSeedFromRows?: PreparedTableModelSeedFactory;
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
  readonly createPreparedTableModelSeedFromRows?: PreparedTableModelSeedFactory;
  readonly fileConverterBackendService: FileConverterBackend;
  readonly filesService: IFileService;
  readonly getFiles: () => readonly ExplorerFileEntry[];
  readonly getSelectedRelativePath: () => string | null;
  readonly isDisposed: () => boolean;
  readonly notificationService: INotificationService;
  readonly onAppendPreparedFiles: (preparedFiles: readonly PreparedFileImport[]) => void;
  readonly onAppendPendingSourceFiles?: (pendingFiles: readonly PendingImportFile[]) => void;
  readonly onClearPendingSourceFiles?: () => void;
  readonly onDraggingChange: (isDragging: boolean) => void;
  readonly onRemoveFiles: (fileIds: readonly string[]) => void;
  readonly onReplacePreparedFiles: (
    preparedFiles: readonly PreparedFileImport[],
    selectedFileId: string | null,
  ) => void;
  readonly onReplacePendingSourceFiles?: (pendingFiles: readonly PendingImportFile[]) => void;
  readonly onFinishPendingSourceReplace?: () => void;
  readonly onUpdatePendingSourceFile?: (
    pendingFile: PendingImportFile,
    change: PendingImportSourceStatusChange,
  ) => void;
  readonly syncView: () => void;
};

export type PreparedTableModelSeedFactory = (
  fileName: string,
  rows: readonly (readonly string[])[],
) => Promise<ImportTableModelSeed>;

export const pickImportFolder = async ({
  defaultUri,
  dialogsService,
  pathService,
}: {
  readonly defaultUri?: URI;
  readonly dialogsService: IFileDialogService;
  readonly pathService: IPathService;
}): Promise<URI | null> => {
  const folders = await dialogsService.showOpenDialog({
    canSelectFolders: true,
    defaultUri: defaultUri ?? pathService.userHome({ preferLocal: true }),
    title: localize("files.import.pickFolderTitle", "Select a folder to import"),
    openLabel: localize("files.import.openFolderButton", "Open Folder"),
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
  notificationService: INotificationService,
): boolean => {
  const support = getFolderImportSupportForFileService(filesService);
  if (support.supported) {
    return true;
  }

  notificationService.notify({
    id: "files.importFolderUnsupported",
    message: getFolderImportUnsupportedMessage(support),
    severity: Severity.Warning,
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
  private externalChangesNotification: INotificationHandle | null = null;
  private readonly externalChangesNotificationListeners = new DisposableStore();
  private importErrorNotification: INotificationHandle | null = null;
  private readonly importErrorNotificationListeners = new DisposableStore();
  private readonly excludedSourcePaths = new Set<string>();

  constructor(
    private readonly options: FileSourceWorkflowOptions,
  ) {
    this.folderWatcher = new WorkspaceWatcher(options.filesService, folderPath => {
      void this.refreshImportedFolder(folderPath);
    });
  }

  public dispose(): void {
    this.clearImportError();
    this.folderWatcher.dispose();
    this.clearExternalChanges();
    this.importErrorNotificationListeners.dispose();
    this.externalChangesNotificationListeners.dispose();
  }

  public closeImportedSources(): void {
    this.importRunId += 1;
    this.folderRefreshRunId += 1;
    this.excludedSourcePaths.clear();
    this.options.onClearPendingSourceFiles?.();
    this.clearImportedFolderWatch();
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

  public importGeneratedFiles(
    newFiles: readonly FileSource[],
    options: {
      readonly preserveSelection?: boolean;
      readonly shouldContinue?: () => boolean;
    } = {},
  ): Promise<void> {
    return this.importFiles(newFiles, {
      preserveSelection: options.preserveSelection ?? true,
      shouldContinue: options.shouldContinue,
    });
  }

  private handleSelectFiles(selectedFiles: FileSource[]): void {
    this.clearImportedFolderWatch();
    this.options.onDraggingChange(false);
    if (selectedFiles.length === 0) {
      this.showImportError(this.getNoSupportedDroppedFilesError());
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
    this.clearImportError();
    this.options.syncView();

    let selectedFolder: URI | null = null;
    try {
      selectedFolder = (await this.options.commandService.executeCommand<URI | null>(ADD_WORKSPACE_FOLDER_COMMAND_ID)) ?? null;
      if (!selectedFolder || this.options.isDisposed()) {
        return;
      }

      this.excludedSourcePaths.clear();
      await this.importFolderIncrementally(selectedFolder);
    } catch (error) {
      if (this.options.isDisposed()) {
        return;
      }

      console.error("Failed to read files from the selected folder.", error);

      this.showImportError(buildSelectedFolderReadErrorMessage(error, selectedFolder));
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

    this.clearImportError();
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
    markTemplateApplyPerformanceTrace("import.sources.collected", {
      fileCount: pendingImportFiles.length,
      source: "files",
      unsupportedCount,
    });
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
        this.setImportError(buildImportErrorMessage({
          failedFiles,
          hasAnyUnsupportedFiles,
          readFailures: options.readFailures,
        }));
        this.options.syncView();
      }
      return;
    }

    this.options.onAppendPendingSourceFiles?.(pendingImportFiles);
    const selectedRelativePath = options.preserveSelection
      ? this.options.getSelectedRelativePath()
      : null;
    const firstImport = await prepareFirstPendingImportFile({
      canApplyResult,
      createPreparedTableModelSeedFromRows: this.options.createPreparedTableModelSeedFromRows,
      failedFiles,
      fileConverterBackend: this.options.fileConverterBackendService,
      onPendingFileStatusChange: this.options.onUpdatePendingSourceFile,
      pendingImportFiles,
      selectedRelativePath,
    });
    let acceptedCount = firstImport.result ? 1 : 0;

    if (firstImport.result && canApplyResult()) {
      const { prepared } = firstImport.result;
      this.options.onAppendPreparedFiles([prepared]);
    }

    if (canApplyResult()) {
      acceptedCount += await prepareRemainingPendingImportFiles({
        canApplyResult,
        createPreparedTableModelSeedFromRows: this.options.createPreparedTableModelSeedFromRows,
        failedFiles,
        fileConverterBackend: this.options.fileConverterBackendService,
        onPendingFileStatusChange: this.options.onUpdatePendingSourceFile,
        onPreparedFiles: preparedFiles => this.options.onAppendPreparedFiles(preparedFiles),
        pendingImportFiles,
        skippedIndexes: firstImport.attemptedIndexes,
      });
    }

    if (canApplyResult()) {
      this.logImportDiagnostics("files", failedFiles, options.readFailures);
      this.setImportError(buildImportErrorMessage({
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
    let discoveredFileCount = 0;
    let hasReplacedPreparedFiles = false;
    let hasPublishedPendingSources = false;
    let prepareQueue: Promise<void> = Promise.resolve();
    let prepareQueueError: unknown = null;

    const queuePendingImportFiles = (
      pendingImportFiles: readonly PendingImportFile[],
    ): void => {
      prepareQueue = prepareQueue
        .then(async () => {
          if (!canApplyResult()) {
            return;
          }

          acceptedCount += await prepareRemainingPendingImportFiles({
            canApplyResult,
            createPreparedTableModelSeedFromRows: this.options.createPreparedTableModelSeedFromRows,
            failedFiles,
            fileConverterBackend: this.options.fileConverterBackendService,
            onPendingFileStatusChange: this.options.onUpdatePendingSourceFile,
            onPreparedFiles: preparedFiles => {
              if (hasReplacedPreparedFiles) {
                this.options.onAppendPreparedFiles(preparedFiles);
                return;
              }

              const selectedFileId = preparedFiles[0]?.fileInfo.fileId ?? null;
              this.options.onReplacePreparedFiles(preparedFiles, selectedFileId);
              hasReplacedPreparedFiles = true;
            },
            pendingImportFiles,
            skippedIndexes: new Set<number>(),
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
          discoveredFileCount += pendingImportFiles.length;
          markTemplateApplyPerformanceTrace("import.folder.batch", {
            batchFileCount: pendingImportFiles.length,
            discoveredFileCount,
            folderPath: folder.fsPath,
          });

          if (hasPublishedPendingSources) {
            this.options.onAppendPendingSourceFiles?.(pendingImportFiles);
          } else {
            this.options.onReplacePendingSourceFiles?.(pendingImportFiles);
            hasPublishedPendingSources = true;
          }

          queuePendingImportFiles(pendingImportFiles);
        },
      },
    );

    await prepareQueue;
    markTemplateApplyPerformanceTrace("import.folder.collected", {
      acceptedCount,
      failedCount: failedFiles.length,
      folderPath: folder.fsPath,
      scannedCount: result.files.length,
    });

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
    this.setImportError(buildImportErrorMessage({
      failedFiles,
      hasAnyUnsupportedFiles: false,
      readFailures: result.readFailures,
    }));
    this.options.syncView();
    this.options.onFinishPendingSourceReplace?.();
    finishBatchPerf({
      acceptedCount,
      failedCount: failedFiles.length,
      scannedCount: result.files.length,
      unsupportedCount: 0,
    });
  }

  private getNoSupportedDroppedFilesError(): string {
    return localize(
      "files.import.noSupportedDroppedFiles",
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

      this.showImportError(localize(
        "files.import.failedToRefreshFolder",
        "Failed to refresh files from the selected folder.",
      ));
      this.options.syncView();
    }
  }

  private clearExternalChanges(): void {
    this.externalChangesNotificationListeners.clear();
    this.pendingExternalFolder = null;
    this.pendingExternalChanges = null;
    const notification = this.externalChangesNotification;
    this.externalChangesNotification = null;
    notification?.close();
  }

  private showExternalChanges(changes: WorkspaceExternalChanges): void {
    this.externalChangesNotificationListeners.clear();
    this.externalChangesNotification?.close();
    const notification = this.options.notificationService.notify({
      actions: {
        primary: this.createExternalChangesActions(),
      },
      id: WORKSPACE_EXTERNAL_CHANGES_NOTIFICATION_ID,
      message: formatExternalChangesMessage(changes),
      severity: Severity.Info,
      sticky: true,
    });
    this.externalChangesNotification = notification;
    this.externalChangesNotificationListeners.add(notification.onDidClose(() => {
      if (this.externalChangesNotification === notification) {
        this.externalChangesNotification = null;
      }
    }));
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

      this.showImportError(localize(
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
      this.options.onAppendPendingSourceFiles?.(pendingImportFiles);
      markTemplateApplyPerformanceTrace("import.sources.collected", {
        fileCount: pendingImportFiles.length,
        source: "workspace-change",
        unsupportedCount,
      });
      acceptedCount = await prepareRemainingPendingImportFiles({
        canApplyResult,
        createPreparedTableModelSeedFromRows: this.options.createPreparedTableModelSeedFromRows,
        failedFiles,
        fileConverterBackend: this.options.fileConverterBackendService,
        onPendingFileStatusChange: this.options.onUpdatePendingSourceFile,
        onPreparedFiles: preparedFiles => this.options.onAppendPreparedFiles(preparedFiles),
        pendingImportFiles,
        skippedIndexes: new Set<number>(),
      });
    }

    if (canApplyResult()) {
      this.logImportDiagnostics("workspace", failedFiles, options.readFailures);
      this.setImportError(buildImportErrorMessage({
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

  private setImportError(message: string | null): void {
    if (!message) {
      this.clearImportError();
      return;
    }

    this.showImportError(message);
  }

  private showImportError(message: string): void {
    this.clearImportError();
    const notification = this.options.notificationService.notify({
      id: IMPORT_ERROR_NOTIFICATION_ID,
      message,
      presentation: {
        className: "conductor-toast--import-error",
        dataUi: "analysis-import-error-toast",
        position: "fixed",
      },
      severity: Severity.Error,
      sticky: true,
    });
    this.importErrorNotification = notification;
    this.importErrorNotificationListeners.add(notification.onDidClose(() => {
      if (this.importErrorNotification === notification) {
        this.importErrorNotification = null;
        this.options.syncView();
      }
    }));
  }

  private clearImportError(): void {
    this.importErrorNotificationListeners.clear();
    const notification = this.importErrorNotification;
    this.importErrorNotification = null;
    notification?.close();
  }
}

export const collectPendingImportFiles = (
  files: FileSource[],
): PendingImportFilesResult => {
  const startedAt = getPerfNow();
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

  markTemplateApplyPerformanceTrace("import.sources.normalized", {
    durationMs: getPerfNow() - startedAt,
    pendingFileCount: pendingImportFiles.length,
    sourceFileCount: files.length,
    totalSizeBytes: pendingImportFiles.reduce((sum, file) => sum + file.sourceSize, 0),
    unsupportedCount,
  });

  return {
    hasAnyUnsupportedFiles,
    pendingImportFiles,
    unsupportedCount,
  };
};

export const preparePendingImportFile = async (
  fileConverterBackend: FileConverterBackend,
  pendingImportFile: PendingImportFile,
  createPreparedTableModelSeedFromRows?: PreparedTableModelSeedFactory,
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
  let prepared: ConvertedImportFile;
  let preparedTableModelSeed: ImportTableModelSeed | undefined;
  let fileId = "";

  try {
    markTemplateApplyPerformanceTrace("import.prepare.file.start", {
      fileName: pendingImportFile.sourceName,
      relativePath,
      sourceKind: pendingImportFile.kind,
      sourceSizeBytes: pendingImportFile.sourceSize,
    });
    const convertStartedAt = getPerfNow();
    markTemplateApplyPerformanceTrace("import.prepare.convert.start", {
      fileName: pendingImportFile.sourceName,
      relativePath,
      sourceKind: pendingImportFile.kind,
      sourceSizeBytes: pendingImportFile.sourceSize,
    });
    fileId = createFileId();
    prepared = await convertImportFile(
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
    markTemplateApplyPerformanceTrace("import.prepare.convert.complete", {
      durationMs: getPerfNow() - convertStartedAt,
      fileName: pendingImportFile.sourceName,
      normalizedCsvPath: prepared.normalizedCsvPath ? "path" : null,
      relativePath,
      sourceKind: pendingImportFile.kind,
      sourceSizeBytes: pendingImportFile.sourceSize,
    });
    const converted = await createPreparedImportFromConvertedFile({
      createPreparedTableModelSeedFromRows,
      fileId,
      pendingImportFile,
      prepared,
    });
    normalizedFile = converted.normalizedFile;
    normalizedCsvPath = converted.normalizedCsvPath;
    sourcePath = converted.sourcePath;
    normalizedSizeBytes = converted.normalizedSizeBytes;
    importRecord = converted.importRecord;
    preparedTableModelSeed = converted.preparedTableModelSeed;
  } catch (error) {
    const failure = toPrepareFailure(
      error,
      relativePath || pendingImportFile.sourceName || localize("files.import.unknownFile", "Unknown file"),
    );
    finishFilePerf({
      code: failure.code,
      failed: "prepare",
      message: failure.message,
    });
    markTemplateApplyPerformanceTrace("import.prepare.file.failed", {
      code: failure.code,
      fileName: pendingImportFile.sourceName,
      message: failure.message,
      relativePath,
      sourceKind: pendingImportFile.kind,
      sourceSizeBytes: pendingImportFile.sourceSize,
    });
    return {
      error: failure,
      ok: false,
    };
  }

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
    preparedTableModelSeed,
    relativePath,
    sourceKey,
    sourcePath,
  };

  finishFilePerf({
    accepted: true,
    fileId,
    normalizedSizeBytes,
  });
  markTemplateApplyPerformanceTrace("import.prepare.file.complete", {
    fileId,
    fileName: pendingImportFile.sourceName,
    hasPreparedTableModel: Boolean(preparedTableModelSeed),
    normalizedSizeBytes,
    relativePath,
    sourceKind: pendingImportFile.kind,
    sourceSizeBytes: pendingImportFile.sourceSize,
  });

  return {
    ok: true,
    prepared: { fileEntry, fileInfo },
  };
};

const createPreparedImportFromConvertedFile = async ({
  createPreparedTableModelSeedFromRows,
  fileId,
  pendingImportFile,
  prepared,
}: {
  readonly createPreparedTableModelSeedFromRows?: PreparedTableModelSeedFactory;
  readonly fileId: string;
  readonly pendingImportFile: PendingImportFile;
  readonly prepared: ConvertedImportFile;
}): Promise<{
  readonly importRecord: ImportedFileRecord;
  readonly normalizedCsvPath: string | null;
  readonly normalizedFile: File;
  readonly normalizedSizeBytes: number;
  readonly preparedTableModelSeed?: ImportTableModelSeed;
  readonly sourcePath: string | null;
}> => {
  const normalizedFile = prepared.file;
  const normalizedCsvPath = prepared.normalizedCsvPath ?? null;
  const sourcePath = prepared.sourcePath ?? null;
  const normalizedSizeBytes = prepared.normalizedSizeBytes;
  const importRecord = await createImportedFileRecord({
    file: normalizedFile,
    fileId,
    fileName: pendingImportFile.sourceName,
    lastModified: normalizedFile.lastModified,
    normalizedCsvPath,
    rawKey: pendingImportFile.sourceKey,
    relativePath: pendingImportFile.relativePath,
    sourcePath,
    sourceSizeBytes: pendingImportFile.sourceSize,
    tables: createImportedRawTableInputs(prepared, fileId),
  });
  const preparedTableModelSeed = readPreparedTableModelSeed(prepared.tableModelSeed ?? prepared.tableFactsSeed) ??
    await createPreparedTableModelFromImportRecord(
      createPreparedTableModelSeedFromRows,
      pendingImportFile,
      importRecord,
    );

  return {
    importRecord,
    normalizedCsvPath,
    normalizedFile,
    normalizedSizeBytes,
    preparedTableModelSeed,
    sourcePath,
  };
};

const readPreparedTableModelSeed = (
  value: unknown,
): ImportTableModelSeed | undefined => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const seed = value as Partial<ImportTableModelSeed>;
  const curveFamily = seed.curveFamily;
  const curveTypeConfidence = seed.curveTypeConfidence;
  const xAxisRole = seed.xAxisRole;
  const xAxisRoleSource = seed.xAxisRoleSource;
  if (
    !isTableModelCurveFamily(curveFamily) ||
    !isTableModelConfidence(curveTypeConfidence) ||
    typeof seed.curveTypeNeedsReview !== "boolean" ||
    !Array.isArray(seed.curveTypeReasons) ||
    seed.curveTypeReasons.some(reason => typeof reason !== "string") ||
    (seed.curveType !== null && typeof seed.curveType !== "string") ||
    !isTableModelAxisRole(xAxisRole) ||
    !isTableModelAxisRoleSource(xAxisRoleSource) ||
    (seed.ivMode !== undefined && seed.ivMode !== null && seed.ivMode !== "transfer" && seed.ivMode !== "output" && seed.ivMode !== "unknown")
  ) {
    return undefined;
  }
  return {
    curveFamily,
    curveType: seed.curveType ?? null,
    curveTypeConfidence,
    curveTypeNeedsReview: seed.curveTypeNeedsReview,
    curveTypeReasons: seed.curveTypeReasons,
    ivMode: seed.ivMode ?? null,
    xAxisRole,
    xAxisRoleSource,
  };
};

const isTableModelCurveFamily = (
  value: unknown,
): value is ImportTableModelSeed["curveFamily"] =>
  value === "iv" ||
  value === "cv" ||
  value === "cf" ||
  value === "pv" ||
  value === "it" ||
  value === "unknown";

const isTableModelConfidence = (
  value: unknown,
): value is ImportTableModelSeed["curveTypeConfidence"] =>
  value === "high" || value === "medium" || value === "low";

const isTableModelAxisRole = (
  value: unknown,
): value is ImportTableModelSeed["xAxisRole"] =>
  value === "vg" || value === "vd" || value === null;

const isTableModelAxisRoleSource = (
  value: unknown,
): value is ImportTableModelSeed["xAxisRoleSource"] =>
  value === "filename" ||
  value === "hint" ||
  value === "label" ||
  value === "metadata" ||
  value === "schemaProfile" ||
  value === "shape" ||
  value === null;

const createPreparedTableModelFromImportRecord = (
  createPreparedTableModelSeedFromRows: PreparedTableModelSeedFactory | undefined,
  pendingImportFile: PendingImportFile,
  importRecord: ImportedFileRecord,
): Promise<ImportTableModelSeed | undefined> => {
  const rawTableId = importRecord.raw.rawTableOrder[0];
  const table = rawTableId ? importRecord.raw.rawTablesById[rawTableId] : undefined;
  if (
    !createPreparedTableModelSeedFromRows ||
    !table ||
    table.rows.kind !== "inline" ||
    table.rows.values.length === 0
  ) {
    return Promise.resolve(undefined);
  }

  return createPreparedTableModelSeedFromRows(
    pendingImportFile.relativePath || pendingImportFile.sourceName,
    table.rows.values,
  );
};

const createImportedRawTableInputs = (
  prepared: {
    readonly columnCount?: number;
    readonly health?: ConvertedImportFile["health"];
    readonly maxCellLengths?: readonly number[];
    readonly normalizedCsvPath?: string | null;
    readonly rowCount?: number;
    readonly sheets?: readonly ConvertedImportSheet[];
    readonly templateEligibility?: ConvertedImportFile["templateEligibility"];
  },
  fileId: string,
) => prepared.sheets?.length
  ? prepared.sheets.map((sheet, index) => ({
      columnCount: sheet.columnCount,
      csvText: sheet.csvText,
      health: sheet.health,
      maxCellLengths: sheet.maxCellLengths,
      normalizedCsvPath: sheet.normalizedCsvPath,
      sheetIndex: sheet.sheetIndex ?? index,
      sheetName: sheet.sheetName,
      templateEligibility: sheet.templateEligibility,
    }))
  : prepared.normalizedCsvPath
    ? [{
        columnCount: prepared.columnCount,
        health: prepared.health,
        maxCellLengths: prepared.maxCellLengths,
        normalizedCsvPath: prepared.normalizedCsvPath,
        rawTableId: fileId,
        rowCount: prepared.rowCount,
        sheetIndex: 0,
        templateEligibility: prepared.templateEligibility,
      }]
  : undefined;

export async function prepareFirstPendingImportFile({
  canApplyResult,
  createPreparedTableModelSeedFromRows,
  failedFiles,
  fileConverterBackend,
  onPendingFileStatusChange,
  pendingImportFiles,
  selectedRelativePath,
}: {
  readonly canApplyResult: () => boolean;
  readonly createPreparedTableModelSeedFromRows?: PreparedTableModelSeedFactory;
  readonly failedFiles: FileImportPrepareFailure[];
  readonly fileConverterBackend: FileConverterBackend;
  readonly onPendingFileStatusChange?: (
    pendingFile: PendingImportFile,
    change: PendingImportSourceStatusChange,
  ) => void;
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
    onPendingFileStatusChange?.(pendingImportFile, {
      status: "preparing",
    });
    const preparedImportFile = await preparePendingImportFile(
      fileConverterBackend,
      pendingImportFile,
      createPreparedTableModelSeedFromRows,
    );
    if (!preparedImportFile.ok) {
      failedFiles.push(preparedImportFile.error);
      onPendingFileStatusChange?.(pendingImportFile, {
        message: preparedImportFile.error.message,
        status: "failed",
      });
      continue;
    }
    if (preparedImportFile.prepared.fileInfo.preparedTableModelSeed) {
      onPendingFileStatusChange?.(pendingImportFile, {
        preparedTableModelSeed: preparedImportFile.prepared.fileInfo.preparedTableModelSeed,
        status: "preparing",
      });
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
  createPreparedTableModelSeedFromRows,
  failedFiles,
  fileConverterBackend,
  onPendingFileStatusChange,
  onPreparedFiles,
  pendingImportFiles,
  skippedIndexes,
}: {
  readonly canApplyResult: () => boolean;
  readonly createPreparedTableModelSeedFromRows?: PreparedTableModelSeedFactory;
  readonly failedFiles: FileImportPrepareFailure[];
  readonly fileConverterBackend: FileConverterBackend;
  readonly onPendingFileStatusChange?: (
    pendingFile: PendingImportFile,
    change: PendingImportSourceStatusChange,
  ) => void;
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

  const batchAcceptedCount = await prepareRemainingPendingImportFilesBatch({
    canApplyResult,
    createPreparedTableModelSeedFromRows,
    failedFiles,
    fileConverterBackend,
    onPendingFileStatusChange,
    onPreparedFiles,
    pendingImportFiles,
    remainingIndexes,
  });
  if (batchAcceptedCount !== null) {
    return batchAcceptedCount;
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
    const appendBatchSize = getPendingImportAppendBatchSize(
      remainingIndexes.length,
      acceptedCount,
    );
    while (
      nextAppendOffset < remainingIndexes.length &&
      preparedFiles.length < appendBatchSize
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

    const appendStartedAt = getPerfNow();
    onPreparedFiles(preparedFiles);
    markTemplateApplyPerformanceTrace("import.prepare.append", {
      acceptedBeforeAppendCount: acceptedCount,
      appendBatchSize,
      durationMs: getPerfNow() - appendStartedAt,
      fileCount: preparedFiles.length,
      mode: "workers",
    });
    return preparedFiles.length;
  };

  const workerCount = Math.min(
    getPendingImportPrepareConcurrency(),
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

        onPendingFileStatusChange?.(pendingImportFile, {
          status: "preparing",
        });
        const preparedImportFile = await preparePendingImportFile(
          fileConverterBackend,
          pendingImportFile,
          createPreparedTableModelSeedFromRows,
        );
        if (!canApplyResult()) {
          return;
        }

        if (preparedImportFile.ok) {
          readyByIndex.set(index, preparedImportFile.prepared);
        } else {
          failedFiles.push(preparedImportFile.error);
          onPendingFileStatusChange?.(pendingImportFile, {
            message: preparedImportFile.error.message,
            status: "failed",
          });
        }
        completedIndexes.add(index);
        acceptedCount += flushReadyImports();
        markTemplateApplyPerformanceTrace("import.prepare.progress", {
          acceptedCount,
          completedCount: completedIndexes.size,
          failedCount: failedFiles.length,
          totalCount: remainingIndexes.length,
        });
      }
    }),
  );

  while (flushReadyImports() > 0) {
    // Drain completed batches larger than the current append window.
  }
  markTemplateApplyPerformanceTrace("import.prepare.complete", {
    acceptedCount,
    completedCount: completedIndexes.size,
    failedCount: failedFiles.length,
    totalCount: remainingIndexes.length,
  });

  return acceptedCount;
}

async function prepareRemainingPendingImportFilesBatch({
  canApplyResult,
  createPreparedTableModelSeedFromRows,
  failedFiles,
  fileConverterBackend,
  onPendingFileStatusChange,
  onPreparedFiles,
  pendingImportFiles,
  remainingIndexes,
}: {
  readonly canApplyResult: () => boolean;
  readonly createPreparedTableModelSeedFromRows?: PreparedTableModelSeedFactory;
  readonly failedFiles: FileImportPrepareFailure[];
  readonly fileConverterBackend: FileConverterBackend;
  readonly onPendingFileStatusChange?: (
    pendingFile: PendingImportFile,
    change: PendingImportSourceStatusChange,
  ) => void;
  readonly onPreparedFiles: (preparedFiles: readonly PreparedFileImport[]) => void;
  readonly pendingImportFiles: readonly PendingImportFile[];
  readonly remainingIndexes: readonly number[];
}): Promise<number | null> {
  if (
    typeof fileConverterBackend.prepareFiles !== "function" &&
    typeof fileConverterBackend.prepareFilesStream !== "function"
  ) {
    return null;
  }

  const payloads: FileConverterPreparePayload[] = [];
  const batchFiles: PendingImportFile[] = [];
  for (const index of remainingIndexes) {
    const pendingImportFile = pendingImportFiles[index];
    if (!pendingImportFile) {
      return null;
    }

    const source = resolveFileConverterSource(pendingImportFile);
    if (source.kind !== "path" || !source.path.trim()) {
      return null;
    }

    payloads.push({
      fileName: pendingImportFile.sourceName,
      path: source.path.trim(),
      sourceMtimeMs: pendingImportFile.lastModified,
      sourceSizeBytes: pendingImportFile.sourceSize,
    });
    batchFiles.push(pendingImportFile);
  }
  if (!payloads.length) {
    return 0;
  }

  for (const pendingImportFile of batchFiles) {
    onPendingFileStatusChange?.(pendingImportFile, {
      status: "preparing",
    });
    markTemplateApplyPerformanceTrace("import.prepare.file.start", {
      fileName: pendingImportFile.sourceName,
      relativePath: pendingImportFile.relativePath,
      sourceKind: pendingImportFile.kind,
      sourceSizeBytes: pendingImportFile.sourceSize,
    });
  }

  markTemplateApplyPerformanceTrace("import.prepare.batch.start", {
    fileCount: batchFiles.length,
    totalSizeBytes: batchFiles.reduce((sum, file) => sum + file.sourceSize, 0),
  });

  const readyByOffset = new Map<number, PreparedFileImport>();
  const completedOffsets = new Set<number>();
  const scheduledOffsets = new Set<number>();
  const resultTasks: Promise<void>[] = [];
  let nextAppendOffset = 0;
  let acceptedCount = 0;

  const flushReadyImports = (): number => {
    const readyFiles: PreparedFileImport[] = [];
    while (completedOffsets.has(nextAppendOffset)) {
      const preparedFile = readyByOffset.get(nextAppendOffset);
      if (preparedFile) {
        readyFiles.push(preparedFile);
      }
      readyByOffset.delete(nextAppendOffset);
      nextAppendOffset += 1;
    }

    if (!canApplyResult()) {
      return 0;
    }

    if (readyFiles.length) {
      const appendBatchSize = getPendingImportAppendBatchSize(
        batchFiles.length,
        acceptedCount,
      );
      const appendStartedAt = getPerfNow();
      onPreparedFiles(readyFiles);
      markTemplateApplyPerformanceTrace("import.prepare.append", {
        acceptedBeforeAppendCount: acceptedCount,
        appendBatchSize,
        durationMs: getPerfNow() - appendStartedAt,
        fileCount: readyFiles.length,
        mode: "batch",
      });
    }
    return readyFiles.length;
  };

  const getFlushableOffsetCount = (): number => {
    let count = 0;
    let offset = nextAppendOffset;
    while (completedOffsets.has(offset)) {
      count += 1;
      offset += 1;
    }
    return count;
  };

  const flushReadyImportsWhenUseful = (): number => {
    const flushableOffsetCount = getFlushableOffsetCount();
    const appendBatchSize = getPendingImportAppendBatchSize(
      batchFiles.length,
      acceptedCount,
    );
    if (
      flushableOffsetCount < appendBatchSize &&
      completedOffsets.size < batchFiles.length
    ) {
      return 0;
    }

    return flushReadyImports();
  };

  const scheduleResult = (offset: number, result: FileConverterPreparedFile | undefined): void => {
    if (
      !Number.isInteger(offset) ||
      offset < 0 ||
      offset >= batchFiles.length ||
      scheduledOffsets.has(offset)
    ) {
      return;
    }

    scheduledOffsets.add(offset);
    const task = (async () => {
      const pendingImportFile = batchFiles[offset];
      if (!result?.ok) {
        const failure = toPrepareFailure(
          new FileConvertError(
            typeof result?.message === "string" && result.message.trim()
              ? result.message
              : "Rust import preparation failed.",
            typeof result?.code === "string" ? result.code : null,
          ),
          pendingImportFile.relativePath || pendingImportFile.sourceName,
        );
        failedFiles.push(failure);
        onPendingFileStatusChange?.(pendingImportFile, {
          message: failure.message,
          status: "failed",
        });
        markTemplateApplyPerformanceTrace("import.prepare.file.failed", {
          code: failure.code,
          fileName: pendingImportFile.sourceName,
          message: failure.message,
          relativePath: pendingImportFile.relativePath,
          sourceKind: pendingImportFile.kind,
          sourceSizeBytes: pendingImportFile.sourceSize,
        });
        completedOffsets.add(offset);
        acceptedCount += flushReadyImports();
        return;
      }

      try {
        const materializeStartedAt = getPerfNow();
        markTemplateApplyPerformanceTrace("import.prepare.result.materialize.start", {
          fileName: pendingImportFile.sourceName,
          index: offset,
          ok: Boolean(result.ok),
          resultDurationMs: readTraceDurationMs(result.durationMs),
          sourceSizeBytes: pendingImportFile.sourceSize,
        });
        const fileId = createFileId();
        const convertOptions = {
          fileConverterBackend,
          metadata: {
            fileName: pendingImportFile.sourceName,
            lastModified: pendingImportFile.lastModified,
            loadFile: pendingImportFile.loadFile,
            size: pendingImportFile.sourceSize,
          },
          result,
          sourcePath: payloads[offset].path,
        };
        const syncPrepared = convertPreparedImportFileResultSync(convertOptions);
        const prepared = syncPrepared ?? await convertPreparedImportFileResult(convertOptions);
        const converted = await createPreparedImportFromConvertedFile({
          createPreparedTableModelSeedFromRows,
          fileId,
          pendingImportFile,
          prepared,
        });
        markTemplateApplyPerformanceTrace("import.prepare.result.materialize.complete", {
          durationMs: getPerfNow() - materializeStartedAt,
          fileName: pendingImportFile.sourceName,
          hasHealth: Boolean(prepared.health),
          hasPreparedTableModel: Boolean(converted.preparedTableModelSeed),
          index: offset,
          normalizedCsvPath: prepared.normalizedCsvPath ? "path" : null,
          sourceSizeBytes: pendingImportFile.sourceSize,
        });
        if (converted.preparedTableModelSeed) {
          onPendingFileStatusChange?.(pendingImportFile, {
            preparedTableModelSeed: converted.preparedTableModelSeed,
            status: "preparing",
          });
        }
        readyByOffset.set(offset, {
          fileEntry: {
            fileId: converted.importRecord.id,
            file: converted.normalizedFile,
            itemKey: buildItemKey(converted.normalizedFile, pendingImportFile.relativePath),
            normalizedCsvPath: converted.normalizedCsvPath,
            relativePath: pendingImportFile.relativePath,
            sourceKey: pendingImportFile.sourceKey,
            sourcePath: converted.sourcePath,
          },
          fileInfo: {
            fileId: converted.importRecord.id,
            fileName: pendingImportFile.sourceName,
            file: converted.normalizedFile,
            importRecord: converted.importRecord,
            size: converted.normalizedSizeBytes,
            lastModified: converted.normalizedFile.lastModified,
            normalizedCsvPath: converted.normalizedCsvPath,
            preparedTableModelSeed: converted.preparedTableModelSeed,
            relativePath: pendingImportFile.relativePath,
            sourceKey: pendingImportFile.sourceKey,
            sourcePath: converted.sourcePath,
          },
        });
        markTemplateApplyPerformanceTrace("import.prepare.file.complete", {
          fileId: converted.importRecord.id,
          fileName: pendingImportFile.sourceName,
          hasPreparedTableModel: Boolean(converted.preparedTableModelSeed),
          normalizedSizeBytes: converted.normalizedSizeBytes,
          relativePath: pendingImportFile.relativePath,
          sourceKind: pendingImportFile.kind,
          sourceSizeBytes: pendingImportFile.sourceSize,
        });
      } catch (error) {
        const failure = toPrepareFailure(
          error,
          pendingImportFile.relativePath || pendingImportFile.sourceName,
        );
        failedFiles.push(failure);
        onPendingFileStatusChange?.(pendingImportFile, {
          message: failure.message,
          status: "failed",
        });
        markTemplateApplyPerformanceTrace("import.prepare.file.failed", {
          code: failure.code,
          fileName: pendingImportFile.sourceName,
          message: failure.message,
          relativePath: pendingImportFile.relativePath,
          sourceKind: pendingImportFile.kind,
          sourceSizeBytes: pendingImportFile.sourceSize,
        });
      } finally {
        completedOffsets.add(offset);
        acceptedCount += flushReadyImportsWhenUseful();
        markTemplateApplyPerformanceTrace("import.prepare.progress", {
          acceptedCount,
          completedCount: completedOffsets.size,
          failedCount: failedFiles.length,
          totalCount: batchFiles.length,
        });
      }
    })();
    resultTasks.push(task);
  };

  try {
    const backendMode = typeof fileConverterBackend.prepareFilesStream === "function"
      ? "stream"
      : "batch";
    const backendStartedAt = getPerfNow();
    markTemplateApplyPerformanceTrace("import.prepare.backend.invoke.start", {
      fileCount: payloads.length,
      mode: backendMode,
      sourceMetadataCount: payloads.filter(payload =>
        Number.isFinite(payload.sourceMtimeMs) &&
        Number.isFinite(payload.sourceSizeBytes)
      ).length,
      totalSizeBytes: batchFiles.reduce((sum, file) => sum + file.sourceSize, 0),
    });
    const results = backendMode === "stream"
        ? await fileConverterBackend.prepareFilesStream!(payloads, message => {
          markTemplateApplyPerformanceTrace("import.prepare.backend.result", {
            batchCommandSize: Number(message.result?.batchCommandSize) || null,
            batchDurationMs: readTraceDurationMs(message.result?.batchDurationMs),
            batchParallelism: Number(message.result?.batchParallelism) || null,
            batchWorkerCount: Number(message.result?.batchWorkerCount) || null,
            cacheHit: message.result?.cacheHit === true,
            code: message.result?.code ?? null,
            fileName: batchFiles[message.index]?.sourceName ?? null,
            healthState: message.result?.health?.state ?? null,
            index: message.index,
            ok: Boolean(message.result?.ok),
            resultDurationMs: readTraceDurationMs(message.result?.durationMs),
            source: message.result?.sourcePath ?? message.result?.sourceName ?? null,
            sourceSizeBytes: batchFiles[message.index]?.sourceSize ?? null,
          });
          scheduleResult(message.index, message.result);
        })
      : await fileConverterBackend.prepareFiles!(payloads);
    markTemplateApplyPerformanceTrace("import.prepare.backend.invoke.complete", {
      durationMs: getPerfNow() - backendStartedAt,
      fileCount: payloads.length,
      mode: backendMode,
      resultCount: results.length,
      streamedResultCount: scheduledOffsets.size,
    });
    for (let offset = 0; offset < batchFiles.length; offset += 1) {
      if (!scheduledOffsets.has(offset)) {
        markTemplateApplyPerformanceTrace("import.prepare.backend.result", {
          batchCommandSize: Number(results[offset]?.batchCommandSize) || null,
          batchDurationMs: readTraceDurationMs(results[offset]?.batchDurationMs),
          batchParallelism: Number(results[offset]?.batchParallelism) || null,
          batchWorkerCount: Number(results[offset]?.batchWorkerCount) || null,
          cacheHit: results[offset]?.cacheHit === true,
          code: results[offset]?.code ?? null,
          fileName: batchFiles[offset]?.sourceName ?? null,
          healthState: results[offset]?.health?.state ?? null,
          index: offset,
          ok: Boolean(results[offset]?.ok),
          resultDurationMs: readTraceDurationMs(results[offset]?.durationMs),
          source: results[offset]?.sourcePath ?? results[offset]?.sourceName ?? null,
          sourceSizeBytes: batchFiles[offset]?.sourceSize ?? null,
        });
      }
      scheduleResult(offset, results[offset]);
    }
    await Promise.all(resultTasks);
  } catch (error) {
    markTemplateApplyPerformanceTrace("import.prepare.batch.failed", {
      completedCount: completedOffsets.size,
      fileCount: batchFiles.length,
      message: error instanceof Error ? error.message : String(error),
    });
    return completedOffsets.size ? acceptedCount : null;
  }
  if (!canApplyResult()) {
    return 0;
  }
  acceptedCount += flushReadyImports();

  markTemplateApplyPerformanceTrace("import.prepare.batch.complete", {
    acceptedCount,
    failedCount: failedFiles.length,
    fileCount: batchFiles.length,
  });
  markTemplateApplyPerformanceTrace("import.prepare.complete", {
    acceptedCount,
    completedCount: batchFiles.length,
    failedCount: failedFiles.length,
    totalCount: batchFiles.length,
  });

  return acceptedCount;
}

const readTraceDurationMs = (value: unknown): number | null => {
  const durationMs = Number(value);
  return Number.isFinite(durationMs) && durationMs >= 0 ? durationMs : null;
};

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
        "files.import.unsupportedFilesSkipped",
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

const buildSelectedFolderReadErrorMessage = (
  error: unknown,
  folder: URI | null,
): string => buildImportErrorMessage({
  failedFiles: [],
  hasAnyUnsupportedFiles: false,
  readFailures: [toSelectedFolderReadFailure(error, folder)],
}) ?? localize(
  "files.import.failedToReadSelectedFolder",
  "Failed to read files from the selected folder.",
);

function toSelectedFolderReadFailure(
  error: unknown,
  folder: URI | null,
): FolderFileReadFailure {
  const explicitRelativePath = getErrorStringProperty(error, "relativePath");
  const explicitPath = getErrorStringProperty(error, "path");
  const relativePath = explicitRelativePath ??
    explicitPath ??
    getFolderReadFailurePath(folder);
  const fileName = getErrorStringProperty(error, "fileName") ??
    (relativePath ? getPathBaseName(relativePath) : null) ??
    localize("files.import.selectedFolder", "selected folder");

  return {
    fileName,
    message: getErrorMessage(error),
    relativePath: relativePath || fileName,
  };
}

function getErrorStringProperty(error: unknown, property: string): string | null {
  if (!error || typeof error !== "object") {
    return null;
  }

  const value = (error as Record<string, unknown>)[property];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function getFolderReadFailurePath(folder: URI | null): string | null {
  if (!folder) {
    return null;
  }

  return getPathBaseName(folder.path) || folder.toString();
}

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
  createPreparedTableModelSeedFromRows,
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
    createPreparedTableModelSeedFromRows,
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
    createPreparedTableModelSeedFromRows,
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
    "files.import.failedToReadFiles",
    "Failed to read {count} file(s).",
    { count: readFailures.length },
  ),
  getReadFailureReason(readFailures),
  localize("files.import.failedFileList", "Files:"),
  ...readFailures.map(file => file.relativePath || file.fileName),
].join("\n");

const getReadFailureReason = (
  readFailures: readonly FolderFileReadFailure[],
): string => {
  const reasonCounts = new Map<string, number>();
  for (const file of readFailures) {
    const reason = file.message.trim() || localize(
      "files.import.failureReasonReadUnknown",
      "The file could not be read.",
    );
    reasonCounts.set(reason, (reasonCounts.get(reason) ?? 0) + 1);
  }

  const reasons = Array.from(reasonCounts.entries())
    .map(([reason, count]) => ({ count, reason }))
    .sort((a, b) => b.count - a.count);

  if (reasons.length === 1) {
    return localize(
      "files.import.failedToReadReason",
      "Reason: {reason}",
      { reason: reasons[0].reason },
    );
  }

  const shownReasons = reasons.slice(0, 2).map(({ count, reason }) =>
    localize(
      "files.import.failedToReadReasonEntry",
      "{count} file(s): {reason}",
      { count, reason },
    )
  );
  const remainingCount = reasons.length - shownReasons.length;
  if (remainingCount > 0) {
    shownReasons.push(
      localize(
        "files.import.moreReadFailureReasons",
        "{count} more reason(s)",
        { count: remainingCount },
      ),
    );
  }

  return localize(
    "files.import.failedToReadReasons",
    "Reasons: {reasons}",
    { reasons: shownReasons.join("; ") },
  );
};

const formatParseFailureMessage = (
  failedFiles: readonly FileImportPrepareFailure[],
): string => [
  localize(
    "files.import.failedToParseFiles",
    "Failed to parse {count} file(s).",
    { count: failedFiles.length },
  ),
  getImportErrorReason(failedFiles),
  localize("files.import.failedFileList", "Files:"),
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
      "files.import.failedToParseReason",
      "Reason: {reason}",
      { reason: reasons[0].reason },
    );
  }

  const shownReasons = reasons.slice(0, 2).map(({ count, reason }) =>
    localize(
      "files.import.failedToParseReasonEntry",
      "{count} file(s): {reason}",
      { count, reason },
    )
  );
  const remainingCount = reasons.length - shownReasons.length;
  if (remainingCount > 0) {
    shownReasons.push(
      localize(
        "files.import.moreParseFailureReasons",
        "{count} more reason(s)",
        { count: remainingCount },
      ),
    );
  }

  return localize(
    "files.import.failedToParseReasons",
    "Reasons: {reasons}",
    { reasons: shownReasons.join("; ") },
  );
};

const getPrepareFailureReason = (failure: FileImportPrepareFailure): string => {
  switch (failure.code) {
    case "UNRESOLVED_IMPORT_PATH":
      return localize(
        "files.import.failureReasonUnresolvedPath",
        "The local file path could not be resolved.",
      );
    case "IMPORT_FILE_NOT_FOUND":
    case "EXCEL_FILE_NOT_FOUND":
      return localize(
        "files.import.failureReasonFileNotFound",
        "The file no longer exists or cannot be read.",
      );
    case "RUST_CONVERTER_NOT_FOUND":
      return localize(
        "files.import.failureReasonConverterMissing",
        "The Excel conversion component was not found.",
      );
    case "RUST_CONVERTER_FAILED":
    case "BROWSER_XLSX_CONVERSION_FAILED":
    case "BROWSER_XLSX_CONVERSION_TIMEOUT":
    case "BROWSER_XLSX_FILE_TOO_LARGE":
      return localize(
        "files.import.failureReasonExcelConversion",
        "Excel conversion failed.",
      );
    case "RUST_IMPORT_TABLE_FACTS_FAILED":
      return localize(
        "files.import.failureReasonImportCheck",
        "The file could not be checked for import.",
      );
    case "UNSUPPORTED_IMPORT_FORMAT":
      return localize(
        "files.import.failureReasonUnsupportedFormat",
        "The file format is not supported.",
      );
    case "EXCEL_CONVERSION_UNAVAILABLE":
      return localize(
        "files.import.failureReasonExcelUnavailable",
        "Excel import requires a conversion component.",
      );
    case "RUST_IMPORT_PREPARE_FAILED":
      return localize(
        "files.import.failureReasonPrepare",
        "Import preparation failed.",
      );
    default:
      return failure.message.trim() || localize(
        "files.import.failureReasonUnknown",
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

type DroppedFile = {
  readonly file: File;
  readonly relativePath?: string | null;
};

type WebkitFileSystemEntry = {
  readonly isDirectory: boolean;
  readonly isFile: boolean;
  readonly name: string;
};

type WebkitFileSystemFileEntry = WebkitFileSystemEntry & {
  readonly isFile: true;
  file(
    successCallback: (file: File) => void,
    errorCallback?: () => void,
  ): void;
};

type WebkitFileSystemDirectoryEntry = WebkitFileSystemEntry & {
  readonly isDirectory: true;
  createReader(): {
    readEntries(
      successCallback: (entries: WebkitFileSystemEntry[]) => void,
      errorCallback?: () => void,
    ): void;
  };
};

type DataTransferItemWithFileSystemAccess = DataTransferItem & {
  getAsFileSystemHandle?: () => Promise<FileSystemHandle | null>;
  webkitGetAsEntry?: () => WebkitFileSystemEntry | null;
};

type DroppedBrowserFile = File & {
  readonly webkitRelativePath?: string;
};

type DroppedDataTransferItem = {
  readonly entry: WebkitFileSystemEntry | null;
  readonly file: File | null;
  readonly handle: Promise<FileSystemHandle | null>;
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
}: DroppedFile): FileSource => createFileSource(file, relativePath);

const getFileSourceSize = (source: FileSource): number =>
  source.kind === "path"
    ? source.size
    : source.file.size;

export const collectDroppedFiles = async (
  dataTransfer: DataTransfer,
): Promise<FileSource[]> => {
  const startedAt = getPerfNow();
  const droppedFiles: DroppedFile[] = [];
  const items = Array.from(dataTransfer.items) as DataTransferItemWithFileSystemAccess[];
  const droppedItems = items.map(snapshotDroppedDataTransferItem);

  for (const item of droppedItems) {
    const handle = await item.handle;
    if (handle) {
      await collectFileSystemHandleFiles(handle, droppedFiles);
      continue;
    }

    if (item.entry) {
      await collectWebkitEntryFiles(item.entry, droppedFiles);
      continue;
    }

    if (item.file) {
      droppedFiles.push({
        file: item.file,
        relativePath: getDroppedFileRelativePath(item.file),
      });
    }
  }

  const seenFiles = new Set(droppedFiles.map(({ file, relativePath }) =>
    getDroppedFileKey(file, relativePath)
  ));
  for (const file of Array.from(dataTransfer.files)) {
    const relativePath = getDroppedFileRelativePath(file);
    const key = getDroppedFileKey(file, relativePath);
    if (seenFiles.has(key)) {
      continue;
    }

    seenFiles.add(key);
    droppedFiles.push({ file, relativePath });
  }

  const sources = droppedFiles.map(createDroppedFileSource);
  markTemplateApplyPerformanceTrace("import.drop.collected", {
    dataTransferFileCount: dataTransfer.files.length,
    durationMs: getPerfNow() - startedAt,
    itemCount: items.length,
    sourceCount: sources.length,
    totalSizeBytes: sources.reduce((sum, source) => sum + getFileSourceSize(source), 0),
  });

  return sources;
};

const getDroppedFileKey = (file: File, relativePath?: string | null): string =>
  `${relativePath || file.name}::${file.size}::${file.lastModified}`;

function getDroppedFileRelativePath(file: File): string {
  return (file as DroppedBrowserFile).webkitRelativePath?.trim() || file.name;
}

function snapshotDroppedDataTransferItem(
  item: DataTransferItemWithFileSystemAccess,
): DroppedDataTransferItem {
  return {
    entry: item.webkitGetAsEntry?.() ?? null,
    file: item.getAsFile?.() ?? null,
    handle: getDroppedFileSystemHandle(item),
  };
}

async function getDroppedFileSystemHandle(
  item: DataTransferItemWithFileSystemAccess,
): Promise<FileSystemHandle | null> {
  if (typeof item.getAsFileSystemHandle !== "function") {
    return null;
  }

  try {
    const handle = await item.getAsFileSystemHandle();
    return WebFileSystemAccess.isFileSystemHandle(handle) ? handle : null;
  } catch {
    return null;
  }
}

async function collectFileSystemHandleFiles(
  handle: FileSystemHandle,
  files: DroppedFile[],
  parentPath = "",
): Promise<void> {
  const relativePath = parentPath ? `${parentPath}/${handle.name}` : handle.name;

  if (WebFileSystemAccess.isFileSystemFileHandle(handle)) {
    const file = await tryReadFileSystemHandleFile(handle);
    if (file) {
      files.push({ file, relativePath });
    }
    return;
  }

  if (!WebFileSystemAccess.isFileSystemDirectoryHandle(handle)) {
    return;
  }

  for (const child of await readDirectoryHandleChildren(handle)) {
    await collectFileSystemHandleFiles(child, files, relativePath);
  }
}

async function tryReadFileSystemHandleFile(
  handle: FileSystemFileHandle,
): Promise<File | null> {
  try {
    return await handle.getFile();
  } catch {
    return null;
  }
}

async function readDirectoryHandleChildren(
  handle: FileSystemDirectoryHandle,
): Promise<FileSystemHandle[]> {
  const children: FileSystemHandle[] = [];

  try {
    if (typeof handle.entries === "function") {
      for await (const [, child] of handle.entries()) {
        children.push(child);
      }
      return children;
    }

    const asyncIterator = handle[Symbol.asyncIterator];
    if (typeof asyncIterator === "function") {
      for await (const [, child] of asyncIterator.call(handle)) {
        children.push(child);
      }
      return children;
    }

    if (typeof handle.values === "function") {
      for await (const child of handle.values()) {
        children.push(child);
      }
    }
  } catch {
    return children;
  }

  return children;
}

async function collectWebkitEntryFiles(
  entry: WebkitFileSystemEntry,
  files: DroppedFile[],
  parentPath = "",
): Promise<void> {
  const relativePath = parentPath ? `${parentPath}/${entry.name}` : entry.name;

  if (entry.isFile) {
    const file = await tryReadWebkitEntryFile(entry as WebkitFileSystemFileEntry);
    if (file) {
      files.push({ file, relativePath });
    }
    return;
  }

  if (!entry.isDirectory) {
    return;
  }

  for (const child of await readAllWebkitDirectoryEntries(entry as WebkitFileSystemDirectoryEntry)) {
    await collectWebkitEntryFiles(child, files, relativePath);
  }
}

function tryReadWebkitEntryFile(
  entry: WebkitFileSystemFileEntry,
): Promise<File | null> {
  return new Promise<File | null>((resolve) => {
    try {
      entry.file(
        file => resolve(file),
        () => resolve(null),
      );
    } catch {
      resolve(null);
    }
  });
}

async function readAllWebkitDirectoryEntries(
  entry: WebkitFileSystemDirectoryEntry,
): Promise<WebkitFileSystemEntry[]> {
  const reader = entry.createReader();
  const collected: WebkitFileSystemEntry[] = [];

  while (true) {
    const batch = await new Promise<WebkitFileSystemEntry[]>((resolve) => {
      try {
        reader.readEntries(resolve, () => resolve([]));
      } catch {
        resolve([]);
      }
    });
    if (!batch.length) {
      break;
    }

    collected.push(...batch);
  }

  return collected;
}

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
  const startedAt = getPerfNow();
  const root = URI.revive(folder);
  const rootName = getPathBaseName(root.path) || "Folder";
  const files: FolderImportFileSource[] = [];
  const readFailures: FolderFileReadFailure[] = [];
  const canUseNativePath = !(filesService.getProvider(root.scheme) instanceof HTMLFileSystemProvider);

  markTemplateApplyPerformanceTrace("import.folder.scan.start", {
    canUseNativePath,
    folderPath: root.fsPath || root.toString(),
  });
  await collectFolderFilesAt(root, rootName, files, readFailures, 0, filesService, options, canUseNativePath);
  markTemplateApplyPerformanceTrace("import.folder.scan.complete", {
    canUseNativePath,
    durationMs: getPerfNow() - startedAt,
    fileCount: files.length,
    folderPath: root.fsPath || root.toString(),
    readFailureCount: readFailures.length,
    totalSizeBytes: files.reduce((sum, file) => sum + file.size, 0),
  });
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
  const readDirStartedAt = getPerfNow();
  try {
    entries = await filesService.readDir(folder);
  } catch (error) {
    readFailures.push({
      fileName: getPathBaseName(relativeFolderPath) || relativeFolderPath,
      message: getErrorMessage(error),
      relativePath: relativeFolderPath,
    });
    markTemplateApplyPerformanceTrace("import.folder.readDir.failed", {
      depth,
      durationMs: getPerfNow() - readDirStartedAt,
      folderPath: folder.fsPath || folder.toString(),
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
  markTemplateApplyPerformanceTrace("import.folder.readDir.complete", {
    depth,
    durationMs: getPerfNow() - readDirStartedAt,
    entryCount: entries.length,
    fileTaskCount: fileTasks.length,
    folderPath: folder.fsPath || folder.toString(),
    folderTaskCount: folderTasks.length,
    relativePath: relativeFolderPath,
  });

  const sortedFolderTasks = [...folderTasks].sort(compareFolderTasks);
  for (const task of sortedFolderTasks) {
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

  if (fileTasks.length > 0) {
    const sortedFileTasks = [...fileTasks].sort(compareFolderFileStatTasks);
    for (
      let startIndex = 0;
      startIndex < sortedFileTasks.length;
      startIndex += FOLDER_IMPORT_BATCH_SIZE
    ) {
      if (!shouldContinueCollecting(options)) {
        return;
      }

      const batch = await statFolderFileTasks(
        sortedFileTasks.slice(startIndex, startIndex + FOLDER_IMPORT_BATCH_SIZE),
        filesService,
        canUseNativePath,
      );
      files.push(...batch.files);
      readFailures.push(...batch.readFailures);
      if (batch.files.length > 0 && shouldContinueCollecting(options)) {
        const onBatchStartedAt = getPerfNow();
        await options.onBatch?.({ files: batch.files });
        markTemplateApplyPerformanceTrace("import.folder.onBatch.complete", {
          durationMs: getPerfNow() - onBatchStartedAt,
          fileCount: batch.files.length,
          relativePath: relativeFolderPath,
          totalSizeBytes: batch.files.reduce((sum, file) => sum + file.size, 0),
        });
      }
    }
  }
}

function compareFolderTasks(
  first: { readonly relativePath: string },
  second: { readonly relativePath: string },
): number {
  return first.relativePath.localeCompare(second.relativePath, undefined, {
    numeric: true,
    sensitivity: "base",
  });
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
  const startedAt = getPerfNow();

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

  markTemplateApplyPerformanceTrace("import.folder.statBatch.complete", {
    canUseNativePath,
    durationMs: getPerfNow() - startedAt,
    fileCount: files.length,
    readFailureCount: readFailures.length,
    taskCount: tasks.length,
    totalSizeBytes: files.reduce((sum, file) => sum + file.size, 0),
    workerCount,
  });

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
    for (let attempt = 0; attempt < FILE_SOURCE_READ_ATTEMPTS; attempt += 1) {
      const stat = await filesService.stat(resource);
      if (isFileStat(stat)) {
        return {
          ok: true,
          stat,
        };
      }
    }

    return {
      message: "The file metadata could not be read.",
      ok: false,
    };
  } catch (error) {
    return {
      message: getErrorMessage(error),
      ok: false,
    };
  }
}

function isFileStat(value: unknown): value is IFileStat {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<IFileStat>;
  return typeof candidate.type === "number" &&
    typeof candidate.path === "string" &&
    typeof candidate.size === "number" &&
    typeof candidate.mtime === "number" &&
    typeof candidate.ctime === "number";
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
  const content = await readFileContent(resource, name, filesService);

  return new File([toFilePart(content)], name, {
    lastModified: isFileStat(stat) && Number.isFinite(stat.mtime) ? stat.mtime : Date.now(),
    type: getFileMimeType(name),
  });
}

async function readFileContent(
  resource: URI,
  name: string,
  filesService: IFileService,
): Promise<IFileContent> {
  for (let attempt = 0; attempt < FILE_SOURCE_READ_ATTEMPTS; attempt += 1) {
    const content = await filesService.readFile(resource, {
      encoding: isExcelImportFileName(name) ? "base64" : "utf8",
    });
    if (isFileContent(content)) {
      return content;
    }
  }

  throw new Error("The file content could not be read.");
}

function isFileContent(value: unknown): value is IFileContent {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<IFileContent>;
  return (candidate.encoding === "base64" || candidate.encoding === "utf8") &&
    typeof candidate.value === "string";
}
