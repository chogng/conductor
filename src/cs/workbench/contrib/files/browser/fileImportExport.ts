/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type { IAction } from "src/cs/base/common/actions";
import { ByteBuffer } from "src/cs/base/common/buffer";
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
import {
  getExplorerFileSourceIdentityKey,
  type ExplorerFileEntry,
} from "src/cs/workbench/contrib/files/common/explorerModel";
import {
  tableFormatService,
  type TableFormatService,
} from "src/cs/workbench/services/table/common/tableFormatService";
import {
  markTemplateApplyPerformanceTrace,
} from "src/cs/workbench/contrib/performance/browser/templateApplyPerformanceTrace";
import {
  INotificationService,
  Severity,
  type INotificationHandle,
} from "src/cs/workbench/services/notification/common/notificationService";
import type { IPathService } from "src/cs/workbench/services/path/common/pathService";
import { WorkspaceWatcher } from "src/cs/workbench/contrib/files/browser/workspaceWatcher";
import { resolveWorkspaceExternalChanges } from "src/cs/workbench/services/workspaces/common/externalChanges";
import {
  ADD_WORKSPACE_FOLDER_COMMAND_ID,
  createWorkspaceSourcePathKey,
  hasWorkspaceExternalChanges,
  WORKSPACE_EXTERNAL_CHANGES_NOTIFICATION_ID,
  type WorkspaceExternalChanges,
} from "src/cs/workbench/services/workspaces/common/workspaces";

export type ImportFileData = {
  readonly lastModified: number;
  readonly name: string;
  readonly size: number;
  arrayBuffer(): Promise<ArrayBuffer>;
  text(): Promise<string>;
};

export type DataFileSource = {
  readonly file: ImportFileData;
  readonly kind: "data";
  readonly relativePath?: string | null;
  readonly resource?: URI | null;
};

export type PathFileSource = {
  readonly canUseNativePath?: boolean;
  readonly file?: ImportFileData;
  readonly fileName: string;
  readonly kind: "path";
  readonly lastModified: number;
  readonly loadFile?: () => Promise<ImportFileData>;
  readonly relativePath?: string | null;
  readonly resource: URI;
  readonly size: number;
};

export type FileSource = DataFileSource | PathFileSource;

export type FolderImportFileSource = PathFileSource & {
  readonly loadFile: () => Promise<ImportFileData>;
};

export type FolderFileReadFailure = {
  readonly fileName: string;
  readonly message: string;
  readonly relativePath: string;
};

export type FolderFileCollection = {
  readonly files: FolderImportFileSource[];
  readonly readFailures: FolderFileReadFailure[];
};

export type FolderFileCollectionBatch = {
  readonly files: FolderImportFileSource[];
};

export type FolderImportFiles = {
  readonly files: FileSource[];
  readonly folder: URI;
  readonly readFailures: FolderFileReadFailure[];
};

export const buildFileSourceIdentityKey = (
  fileName: unknown,
  size: unknown,
  lastModified: unknown,
  relativePath?: string | null,
): string => {
  const name = String(fileName ?? "").trim();
  if (!name) {
    return "";
  }

  const path = relativePath?.trim();
  return `${path || name}::${Number(size) || 0}::${Number(lastModified) || 0}`;
};

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
  itemKey: string;
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

export type FileImportPrepareFailure = {
  readonly code: string | null;
  readonly fileName: string;
  readonly message: string;
};

export type PendingImportFileResult =
  | { readonly ok: true; readonly entry: ExplorerFileEntry }
  | { readonly ok: false; readonly error: FileImportPrepareFailure };

export type PendingImportSourceStatus = "pending" | "preparing" | "failed";

export type PendingImportSourceStatusChange = {
  readonly message?: string | null;
  readonly status: PendingImportSourceStatus;
};

export type FirstExplorerFilePreparation = {
  readonly attemptedIndexes: Set<number>;
  readonly result: {
    readonly entry: ExplorerFileEntry;
  } | null;
};

export type FileSourcePreparationResult = {
  readonly entries: readonly ExplorerFileEntry[];
  readonly errorMessage: string | null;
};

export type PrepareFileSourcesForImportOptions = {
  readonly canApplyResult?: () => boolean;
  readonly filesService: IFileService;
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
  readonly filesService: IFileService;
  readonly getFiles: () => readonly ExplorerFileEntry[];
  readonly getSelectedRelativePath: () => string | null;
  readonly isDisposed: () => boolean;
  readonly notificationService: INotificationService;
  readonly onAppendExplorerFiles: (entries: readonly ExplorerFileEntry[]) => void;
  readonly onAppendPendingSourceFiles?: (pendingFiles: readonly PendingImportFile[]) => void;
  readonly onClearPendingSourceFiles?: () => void;
  readonly onDraggingChange: (isDragging: boolean) => void;
  readonly onRemoveSourceItems: (itemKeys: readonly string[]) => void;
  readonly onReplaceExplorerFiles: (
    entries: readonly ExplorerFileEntry[],
    selectedImportItemKey: string | null,
  ) => void;
  readonly onReplacePendingSourceFiles?: (pendingFiles: readonly PendingImportFile[]) => void;
  readonly onFinishPendingSourceReplace?: () => void;
  readonly onUpdatePendingSourceFile?: (
    pendingFile: PendingImportFile,
    change: PendingImportSourceStatusChange,
  ) => void;
  readonly syncView: () => void;
};

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
// it collects dropped/folder sources, assigns table resources, and returns
// Explorer rows to the Explorer ViewPane; session commit remains outside.
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

  public rememberRemovedSourceItems(itemKeys: readonly string[]): void {
    const removedItemKeys = new Set(itemKeys);
    for (const file of this.options.getFiles()) {
      if (!removedItemKeys.has(file.itemKey ?? "")) {
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
        this.options.onReplaceExplorerFiles([], null);
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
      failedFiles,
      filesService: this.options.filesService,
      onPendingFileStatusChange: this.options.onUpdatePendingSourceFile,
      pendingImportFiles,
      selectedRelativePath,
    });
    let acceptedCount = firstImport.result ? 1 : 0;

    if (firstImport.result && canApplyResult()) {
      const { entry } = firstImport.result;
      this.options.onAppendExplorerFiles([entry]);
    }

    if (canApplyResult()) {
      acceptedCount += await prepareRemainingPendingImportFiles({
        canApplyResult,
        failedFiles,
        filesService: this.options.filesService,
        onPendingFileStatusChange: this.options.onUpdatePendingSourceFile,
        onExplorerFiles: entries => this.options.onAppendExplorerFiles(entries),
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
    let hasReplacedExplorerFiles = false;
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
            failedFiles,
            filesService: this.options.filesService,
            onPendingFileStatusChange: this.options.onUpdatePendingSourceFile,
            onExplorerFiles: entries => {
              if (hasReplacedExplorerFiles) {
                this.options.onAppendExplorerFiles(entries);
                return;
              }

              const selectedImportItemKey = entries[0]?.itemKey ?? null;
              this.options.onReplaceExplorerFiles(entries, selectedImportItemKey);
              hasReplacedExplorerFiles = true;
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

    try {
      const result = await collectFolderImportFiles(folder, this.options.filesService);
      if (
        this.options.isDisposed() ||
        runId !== this.folderRefreshRunId ||
        !this.folderWatcher.isWatching(folder)
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
        this.folderWatcher.isWatching(folder)
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

    const removedItemKeys = this.options.getFiles()
      .filter(file => {
        const sourcePath = createWorkspaceSourcePathKey(file.relativePath);
        return Boolean(sourcePath && removedPaths.has(sourcePath));
      })
      .map(file => file.itemKey)
      .filter((itemKey): itemKey is string => typeof itemKey === "string");

    if (removedItemKeys.length > 0) {
      this.options.onRemoveSourceItems(removedItemKeys);
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
        failedFiles,
        filesService: this.options.filesService,
        onPendingFileStatusChange: this.options.onUpdatePendingSourceFile,
        onExplorerFiles: entries => this.options.onAppendExplorerFiles(entries),
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
    const itemKey = buildFileSourceIdentityKey(
      sourceName,
      sourceSize,
      lastModified,
      relativePath,
    );
    if (!itemKey) {
      finishFilePerf({ skipped: "missing-key" });
      continue;
    }

    if (!tableFormatService.canHandle(sourceName)) {
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
      itemKey,
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
  filesService: IFileService,
  pendingImportFile: PendingImportFile,
): Promise<PendingImportFileResult> => {
  const {
    finishFilePerf,
    relativePath,
    sourceFile,
    itemKey,
  } = pendingImportFile;
  let resource: URI;
  let sourcePath: string | null;
  let file: File;

  try {
    markTemplateApplyPerformanceTrace("import.prepare.file.start", {
      fileName: pendingImportFile.sourceName,
      relativePath,
      sourceKind: pendingImportFile.kind,
      sourceSizeBytes: pendingImportFile.sourceSize,
    });
    const resolvedResource = await resolvePendingImportResource(filesService, pendingImportFile);
    resource = resolvedResource.resource;
    sourcePath = resolvedResource.sourcePath;
    file = createImportFileFromPendingSource(pendingImportFile, sourceFile);
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

  const entry = createExplorerFileEntryFromPendingImportFile(
    pendingImportFile,
    file,
    resource,
    sourcePath,
  );

  finishFilePerf({
    accepted: true,
    itemKey,
    resource: sourcePath ?? resource.toString(),
  });
  markTemplateApplyPerformanceTrace("import.prepare.file.complete", {
    fileName: pendingImportFile.sourceName,
    itemKey,
    relativePath,
    resource: sourcePath ?? resource.toString(),
    sourceKind: pendingImportFile.kind,
    sourceSizeBytes: pendingImportFile.sourceSize,
  });

  return {
    entry,
    ok: true,
  };
};

function createExplorerFileEntryFromPendingImportFile(
  pendingImportFile: PendingImportFile,
  file: File,
  resource: URI,
  sourcePath: string | null,
): ExplorerFileEntry {
  const {
    itemKey,
    relativePath,
  } = pendingImportFile;
  const entry = {
    file,
    fileName: pendingImportFile.sourceName,
    itemKey,
    localImport: true,
    relativePath,
    resource,
    sourcePath,
  };
  const fileId = getExplorerFileSourceIdentityKey(entry);
  if (!fileId) {
    throw new Error(`Explorer file is missing resource identity: ${pendingImportFile.sourceName}`);
  }

  return {
    ...entry,
    fileId,
  };
}

class ImportPrepareError extends Error {
  public readonly code: string;

  public constructor(message: string, code: string) {
    super(message);
    this.code = code;
    this.name = "ImportPrepareError";
  }
}

const resolvePendingImportResource = async (
  filesService: IFileService,
  pendingImportFile: PendingImportFile,
): Promise<{ readonly resource: URI; readonly sourcePath: string | null }> => {
  const existingResource = pendingImportFile.resource
    ? URI.revive(pendingImportFile.resource)
    : null;
  if (existingResource && tableFormatService.canHandle(existingResource)) {
    return {
      resource: existingResource,
      sourcePath: getTableResourcePath(existingResource),
    };
  }

  const registeredFileResource = await registerPendingImportFileResource(
    filesService,
    pendingImportFile,
  );
  if (registeredFileResource) {
    return {
      resource: registeredFileResource,
      sourcePath: getTableResourcePath(registeredFileResource),
    };
  }

  throw new ImportPrepareError(
    localize(
      "files.import.unresolvedTableResource",
      "The file could not be assigned a table resource.",
    ),
    "UNRESOLVED_IMPORT_RESOURCE",
  );
};

const registerPendingImportFileResource = async (
  filesService: IFileService,
  pendingImportFile: PendingImportFile,
): Promise<URI | null> => {
  const provider = filesService.getProvider("file");
  if (!(provider instanceof HTMLFileSystemProvider)) {
    return null;
  }

  const sourceFile = await getPendingImportBrowserFile(pendingImportFile);
  return sourceFile ? provider.registerFile(sourceFile) : null;
};

const getPendingImportBrowserFile = async (
  pendingImportFile: PendingImportFile,
): Promise<File | null> => {
  if (isBrowserFile(pendingImportFile.sourceFile)) {
    return pendingImportFile.sourceFile;
  }

  if (!pendingImportFile.loadFile) {
    return null;
  }

  const loadedFile = await pendingImportFile.loadFile();
  return isBrowserFile(loadedFile) ? loadedFile : null;
};

const createImportFileFromPendingSource = (
  pendingImportFile: PendingImportFile,
  sourceFile: ImportFileData | undefined,
): File => {
  if (isBrowserFile(sourceFile)) {
    return sourceFile;
  }

  return new File([], pendingImportFile.sourceName, {
    lastModified: Number.isFinite(pendingImportFile.lastModified)
      ? pendingImportFile.lastModified
      : Date.now(),
    type: getFileMimeType(pendingImportFile.sourceName),
  });
};

const isBrowserFile = (value: unknown): value is File =>
  typeof File !== "undefined" && value instanceof File;

const getTableResourcePath = (resource: URI): string | null => {
  const fsPath = String(resource.fsPath ?? "").trim();
  if (fsPath) {
    return fsPath;
  }

  const path = String(resource.path ?? "").trim();
  return path || null;
};

export async function prepareFirstPendingImportFile({
  canApplyResult,
  failedFiles,
  filesService,
  onPendingFileStatusChange,
  pendingImportFiles,
  selectedRelativePath,
}: {
  readonly canApplyResult: () => boolean;
  readonly failedFiles: FileImportPrepareFailure[];
  readonly filesService: IFileService;
  readonly onPendingFileStatusChange?: (
    pendingFile: PendingImportFile,
    change: PendingImportSourceStatusChange,
  ) => void;
  readonly pendingImportFiles: readonly PendingImportFile[];
  readonly selectedRelativePath: string | null;
}): Promise<FirstExplorerFilePreparation> {
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
    const fileResult = await preparePendingImportFile(
      filesService,
      pendingImportFile,
    );
    if (!fileResult.ok) {
      failedFiles.push(fileResult.error);
      onPendingFileStatusChange?.(pendingImportFile, {
        message: fileResult.error.message,
        status: "failed",
      });
      continue;
    }
    return {
      attemptedIndexes,
      result: {
        entry: fileResult.entry,
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
  filesService,
  onPendingFileStatusChange,
  onExplorerFiles,
  pendingImportFiles,
  skippedIndexes,
}: {
  readonly canApplyResult: () => boolean;
  readonly failedFiles: FileImportPrepareFailure[];
  readonly filesService: IFileService;
  readonly onPendingFileStatusChange?: (
    pendingFile: PendingImportFile,
    change: PendingImportSourceStatusChange,
  ) => void;
  readonly onExplorerFiles: (entries: readonly ExplorerFileEntry[]) => void;
  readonly pendingImportFiles: readonly PendingImportFile[];
  readonly skippedIndexes: ReadonlySet<number>;
}): Promise<number> {
  const remainingIndexes = pendingImportFiles
    .map((_file, index) => index)
    .filter(index => !skippedIndexes.has(index));
  if (remainingIndexes.length === 0) {
    return 0;
  }

  const readyByIndex = new Map<number, ExplorerFileEntry>();
  const completedIndexes = new Set<number>();
  let nextAppendOffset = 0;
  let nextImportIndex = 0;
  let acceptedCount = 0;

  const flushReadyImports = (): number => {
    if (!canApplyResult()) {
      return 0;
    }

    const entries: ExplorerFileEntry[] = [];
    const appendBatchSize = getPendingImportAppendBatchSize(
      remainingIndexes.length,
      acceptedCount,
    );
    while (
      nextAppendOffset < remainingIndexes.length &&
      entries.length < appendBatchSize
    ) {
      const index = remainingIndexes[nextAppendOffset];
      if (!completedIndexes.has(index)) {
        break;
      }

      const entry = readyByIndex.get(index);
      if (entry) {
        entries.push(entry);
      }
      nextAppendOffset += 1;
    }

    if (entries.length === 0) {
      return 0;
    }

    const appendStartedAt = getPerfNow();
    onExplorerFiles(entries);
    markTemplateApplyPerformanceTrace("import.prepare.append", {
      acceptedBeforeAppendCount: acceptedCount,
      appendBatchSize,
      durationMs: getPerfNow() - appendStartedAt,
      fileCount: entries.length,
      mode: "workers",
    });
    return entries.length;
  };

  const getFlushableOffsetCount = (): number => {
    let count = 0;
    let offset = nextAppendOffset;
    while (offset < remainingIndexes.length) {
      const index = remainingIndexes[offset];
      if (typeof index !== "number" || !completedIndexes.has(index)) {
        break;
      }

      count += 1;
      offset += 1;
    }

    return count;
  };

  const flushReadyImportsWhenUseful = (): number => {
    const flushableOffsetCount = getFlushableOffsetCount();
    const appendBatchSize = getPendingImportAppendBatchSize(
      remainingIndexes.length,
      acceptedCount,
    );
    if (
      flushableOffsetCount < appendBatchSize &&
      completedIndexes.size < remainingIndexes.length
    ) {
      return 0;
    }

    return flushReadyImports();
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
        const fileResult = await preparePendingImportFile(
          filesService,
          pendingImportFile,
        );
        if (!canApplyResult()) {
          return;
        }

        if (fileResult.ok) {
          readyByIndex.set(index, fileResult.entry);
        } else {
          failedFiles.push(fileResult.error);
          onPendingFileStatusChange?.(pendingImportFile, {
            message: fileResult.error.message,
            status: "failed",
          });
        }
        completedIndexes.add(index);
        acceptedCount += flushReadyImportsWhenUseful();
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
        "Skipped unsupported files in the selected folder. Supported: {extensions}",
        { extensions: tableFormatService.getSupportedExtensions().join(", ") },
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
}: PrepareDroppedFilesForImportOptions): Promise<FileSourcePreparationResult> =>
  prepareFileSourcesForImport({
    ...options,
    sources: dataTransfer ? await collectDroppedFiles(dataTransfer) : [],
  });

export const prepareFileSourcesForImport = async ({
  canApplyResult = () => true,
  filesService,
  selectedRelativePath = null,
  sources,
}: PrepareFileSourcesForImportOptions): Promise<FileSourcePreparationResult> => {
  const failedFiles: FileImportPrepareFailure[] = [];
  const {
    hasAnyUnsupportedFiles,
    pendingImportFiles,
  } = collectPendingImportFiles([...sources]);

  if (pendingImportFiles.length === 0) {
    return {
      entries: [],
      errorMessage: buildImportErrorMessage({
        failedFiles,
        hasAnyUnsupportedFiles,
      }),
    };
  }

  const entries: ExplorerFileEntry[] = [];
  const firstImport = await prepareFirstPendingImportFile({
    canApplyResult,
    failedFiles,
    filesService,
    pendingImportFiles,
    selectedRelativePath,
  });
  if (firstImport.result) {
    entries.push(firstImport.result.entry);
  }

  await prepareRemainingPendingImportFiles({
    canApplyResult,
    failedFiles,
    filesService,
    onExplorerFiles: nextEntries => {
      entries.push(...nextEntries);
    },
    pendingImportFiles,
    skippedIndexes: firstImport.attemptedIndexes,
  });

  return {
    entries,
    errorMessage: buildImportErrorMessage({
      failedFiles,
      hasAnyUnsupportedFiles,
    }),
  };
};

const toPrepareFailure = (
  error: unknown,
  fileName: string,
): FileImportPrepareFailure => {
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
      : localize("files.import.prepareFailed", "Import file preparation failed.");

  return {
    code,
    fileName,
    message,
  };
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
    "files.import.failedToPrepareFiles",
    "Failed to prepare {count} file(s).",
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
    case "UNRESOLVED_IMPORT_RESOURCE":
      return localize(
        "files.import.failureReasonUnresolvedResource",
        "The file could not be assigned a table resource.",
      );
    case "UNRESOLVED_IMPORT_PATH":
      return localize(
        "files.import.failureReasonUnresolvedPath",
        "The local file path could not be resolved.",
      );
    case "IMPORT_FILE_NOT_FOUND":
      return localize(
        "files.import.failureReasonFileNotFound",
        "The file no longer exists or cannot be read.",
      );
    case "UNSUPPORTED_IMPORT_FORMAT":
      return localize(
        "files.import.failureReasonUnsupportedFormat",
        "The file format is not supported.",
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

export type CollectFolderImportFilesOptions = {
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
      if (!tableFormatService.canHandle(item.file.name)) {
        continue;
      }

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
    if (!tableFormatService.canHandle(file.name)) {
      continue;
    }

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
    if (!tableFormatService.canHandle(handle.name)) {
      return;
    }

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
    if (!tableFormatService.canHandle(entry.name)) {
      return;
    }

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
  if (tableFormatService.isMaterializableWorkbook(fileName)) {
    return "application/octet-stream";
  }
  if (tableFormatService.isTsv(fileName)) {
    return "text/tab-separated-values;charset=utf-8";
  }

  return "text/csv;charset=utf-8";
}

function toFilePart(content: IFileContent): ArrayBuffer {
  return ByteBuffer.wrap(content.value).toArrayBuffer();
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
  return new FolderImportSourceCollector(filesService).collect(folder, options);
}

export class FolderImportSourceCollector {
  public constructor(
    private readonly filesService: IFileService,
    private readonly formatService: TableFormatService = tableFormatService,
  ) {}

  public async collect(
    folder: URI,
    options: CollectFolderImportFilesOptions = {},
  ): Promise<FolderFileCollection> {
    const startedAt = getPerfNow();
    const root = URI.revive(folder);
    const rootName = getPathBaseName(root.path) || "Folder";
    const files: FolderImportFileSource[] = [];
    const readFailures: FolderFileReadFailure[] = [];
    const canUseNativePath = !(this.filesService.getProvider(root.scheme) instanceof HTMLFileSystemProvider);

    markTemplateApplyPerformanceTrace("import.folder.scan.start", {
      canUseNativePath,
      folderPath: root.fsPath || root.toString(),
    });
    await collectFolderFilesAt(
      root,
      rootName,
      files,
      readFailures,
      0,
      this.filesService,
      this.formatService,
      options,
      canUseNativePath,
    );
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
  formatService: TableFormatService,
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

    if ((type & FileType.File) !== FileType.File || !formatService.canHandle(child)) {
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
      formatService,
      options,
      canUseNativePath,
    );
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
  const firstIsWorkbook = tableFormatService.isMaterializableWorkbook(first.name);
  const secondIsWorkbook = tableFormatService.isMaterializableWorkbook(second.name);
  if (firstIsWorkbook !== secondIsWorkbook) {
    return firstIsWorkbook ? 1 : -1;
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
    const content = await filesService.readFile(resource);
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
  return candidate.value instanceof Uint8Array;
}
