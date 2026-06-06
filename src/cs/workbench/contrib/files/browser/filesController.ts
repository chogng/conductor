import type { ListHandle } from "src/cs/base/browser/ui/list/list";
import type { IDisposable } from "src/cs/base/common/lifecycle";
import type { URI } from "src/cs/base/common/uri";
import type { ICommandService as ICommandServiceType } from "src/cs/platform/commands/common/commands";
import type { IFileService as IFileServiceType } from "src/cs/platform/files/common/files";
import type { IAction } from "src/cs/base/common/actions";
import { localize } from "src/cs/nls";
import type { IAnalysisFileService as IAnalysisFileServiceType } from "src/cs/workbench/services/analysisFile/common/analysisFile";
import { startPerf } from "src/cs/workbench/common/perf";
import { notificationService } from "src/cs/workbench/services/notification/common/notificationService";
import { WorkspaceWatcher } from "src/cs/workbench/contrib/workspaces/browser/workspaceWatcher";
import {
  resolveWorkspaceExternalChanges,
} from "src/cs/workbench/contrib/workspaces/browser/externalChanges";
import {
  ADD_WORKSPACE_FOLDER_COMMAND_ID,
  createWorkspaceSourcePathKey,
  hasWorkspaceExternalChanges,
  WORKSPACE_EXTERNAL_CHANGES_TOAST_ID,
  type WorkspaceExternalChanges,
} from "src/cs/workbench/contrib/workspaces/common/workspaces";
import {
  ExplorerView,
  type ExplorerViewProps,
} from "src/cs/workbench/contrib/files/browser/views/explorerView";
import {
  getFileTreeFolderPath,
  isFileTreePathInFolder,
} from "src/cs/workbench/contrib/files/common/explorerModel";
import {
  IMPORT_PREPARE_CONCURRENCY,
} from "src/cs/workbench/contrib/files/browser/fileConstants";
import {
  type FileEntry,
  type FileSource,
  type FilesPaneRef,
} from "src/cs/workbench/contrib/files/common/files";
import type { CleanedEntry } from "src/cs/workbench/contrib/session/common/sessionTypes";
import {
  buildImportErrorMessage,
  collectDroppedFiles,
  getFolderImportSupportForFileService,
  showCreateFolderUnsupported,
} from "src/cs/workbench/contrib/files/browser/fileCommands";
import {
  collectFolderImportFiles,
  collectFolderImportFilesIncrementally,
  type FolderFileReadFailure,
} from "src/cs/workbench/contrib/files/browser/fileImportExport";
import {
  type ImportSessionFileEntry,
  type ImportSessionFileInfo,
  type ImportFilePrepareFailure,
  type PreparedImportFile,
  preparePendingImportFile,
} from "src/cs/workbench/services/analysisFile/browser/importPipeline";
import {
  collectPendingImportFiles,
  type PendingImportFile,
} from "src/cs/workbench/services/analysisFile/browser/fileFilter";

const IMPORT_APPEND_BATCH_SIZE = 32;

type FirstPreparedImport = {
  readonly attemptedIndexes: Set<number>;
  readonly result: {
    readonly prepared: PreparedImportFile;
  } | null;
};

export type FilesControllerProps = {
  readonly analysisFileService: IAnalysisFileServiceType;
  readonly commandService: ICommandServiceType;
  readonly filesService: IFileServiceType;
  files?: FileEntry[];
  cleanedData?: CleanedEntry[];
  onFileImported?: (fileInfo: ImportSessionFileInfo) => void;
  onFilesAdded?: (files: ImportSessionFileInfo[]) => void;
  onFilesReplaced?: (files: ImportSessionFileInfo[]) => void;
  onFileRemoved?: (fileId: string) => void;
  onFilesRemoved?: (fileIds: string[]) => void;
  onFileSelected?: (fileId: string | null) => void;
  selectedFileId?: string | null;
};

export type {
  ImportSessionFileInfo,
  FilesPaneRef,
};

export class FilesController implements FilesPaneRef, IDisposable {
  private readonly listRef: { current: ListHandle | null } = { current: null };
  private readonly shouldAutoScrollToBottomRef = { current: true };
  private readonly folderWatcher: WorkspaceWatcher;
  private explorerView: ExplorerView | null = null;
  private props: FilesControllerProps;
  private internalFiles: ImportSessionFileEntry[] = [];
  private error: string | null = null;
  private isDragging = false;
  private optimisticSelectedFileId: string | null = null;
  private importRunId = 0;
  private folderRefreshRunId = 0;
  private prevFileCount = 0;
  private disposed = false;
  private pendingExternalFolder: URI | null = null;
  private pendingExternalChanges: WorkspaceExternalChanges | null = null;
  private readonly excludedSourcePaths = new Set<string>();
  private readonly analysisFileService: IAnalysisFileServiceType;
  private readonly commandService: ICommandServiceType;
  private readonly filesService: IFileServiceType;

  constructor(
    host: HTMLElement,
    props: FilesControllerProps,
  ) {
    this.props = props;
    this.analysisFileService = props.analysisFileService;
    this.commandService = props.commandService;
    this.filesService = props.filesService;
    this.folderWatcher = new WorkspaceWatcher(this.filesService, folderPath => {
      void this.refreshImportedFolder(folderPath);
    });
    this.prevFileCount = this.files.length;
    this.optimisticSelectedFileId = props.selectedFileId ?? null;

    this.explorerView = new ExplorerView(host, this.createExplorerViewProps());
    this.listRef.current = this.explorerView.getListHandle();
  }

  get hasFiles(): boolean {
    return this.files.length > 0;
  }

  openFileDialog(): void {
    this.error = null;
    this.syncView();
    this.explorerView?.openFileDialog();
  }

  removeSelectedFolder(): void {
    const folderPath = this.getSelectedFolderPath() ?? this.getFirstFolderPath();
    if (!folderPath) {
      return;
    }

    this.handleRemoveFolder(`folder:${folderPath}`);
  }

  setProps(nextProps: FilesControllerProps): void {
    const previousSelectedFileId = this.props.selectedFileId ?? null;
    this.props = nextProps;

    if ((nextProps.selectedFileId ?? null) !== previousSelectedFileId) {
      this.optimisticSelectedFileId = nextProps.selectedFileId ?? null;
    }

    this.handleFileCountEffects();
    this.syncView();
  }

  layout(height?: number, width?: number): void {
    this.listRef.current?.layout(height, width);
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }

    this.disposed = true;
    this.folderWatcher.dispose();
    notificationService.disposeToast(WORKSPACE_EXTERNAL_CHANGES_TOAST_ID);
    this.explorerView?.dispose();
    this.explorerView = null;
    this.listRef.current = null;
  }

  private get files(): FileEntry[] {
    return Array.isArray(this.props.files) ? this.props.files : this.internalFiles;
  }

  private get isControlled(): boolean {
    return Array.isArray(this.props.files);
  }

  private get effectiveSelectedFileId(): string | null {
    return this.optimisticSelectedFileId ?? this.props.selectedFileId ?? null;
  }

  private createExplorerViewProps(): ExplorerViewProps {
    return {
      effectiveSelectedFileId: this.effectiveSelectedFileId,
      error: this.error,
      files: this.files,
      folderImportSupport: getFolderImportSupportForFileService(this.filesService),
      isDragging: this.isDragging,
      onClearError: this.handleClearError,
      onDraggingChange: this.handleDraggingChange,
      onListScroll: this.handleListScroll,
      onCreateFolder: this.handleCreateFolder,
      onRemoveFile: this.handleRemoveFile,
      onRemoveFolder: this.handleRemoveFolder,
      onDropFiles: this.handleDropFiles,
      onOpenFolderDialog: this.handleOpenFolderDialog,
      onSelectFile: this.handleSelectFile,
      cleanedData: this.props.cleanedData,
    };
  }

  private syncView(): void {
    if (this.disposed) {
      return;
    }

    this.explorerView?.setProps(this.createExplorerViewProps());
  }

  private handleFileCountEffects(): void {
    const nextCount = this.files.length;
    const previousCount = this.prevFileCount;

    if (nextCount === 0) {
      this.shouldAutoScrollToBottomRef.current = true;
    }

    if (nextCount > previousCount && this.shouldAutoScrollToBottomRef.current) {
      this.listRef.current?.scrollToEnd(previousCount === 0 ? "auto" : "smooth");
    }

    this.prevFileCount = nextCount;
  }

  private readonly handleClearError = (): void => {
    this.error = null;
    this.syncView();
  };

  private readonly handleDraggingChange = (isDragging: boolean): void => {
    if (this.isDragging === isDragging) {
      return;
    }

    this.isDragging = isDragging;
    this.syncView();
  };

  private readonly handleListScroll = (event: Event): void => {
    const detail = event instanceof CustomEvent ? event.detail : null;
    if (
      detail &&
      typeof detail.scrollHeight === "number" &&
      typeof detail.clientHeight === "number" &&
      typeof detail.scrollTop === "number"
    ) {
      const distanceToBottom =
        detail.scrollHeight - detail.clientHeight - detail.scrollTop;
      this.shouldAutoScrollToBottomRef.current = distanceToBottom <= 24;
      return;
    }

    const viewport = event.currentTarget;
    if (!(viewport instanceof HTMLElement)) {
      return;
    }

    const distanceToBottom =
      viewport.scrollHeight - viewport.clientHeight - viewport.scrollTop;
    this.shouldAutoScrollToBottomRef.current = distanceToBottom <= 24;
  };

  private readonly handleSelectFiles = (selectedFiles: FileSource[]): void => {
    this.clearImportedFolderWatch();
    this.isDragging = false;
    if (selectedFiles.length === 0) {
      this.error = this.getNoSupportedDroppedFilesError();
      this.syncView();
      return;
    }

    void this.processFiles(selectedFiles);
  };

  private readonly handleDropFiles = (dataTransfer: DataTransfer | null): void => {
    void this.importDroppedFiles(dataTransfer);
  };

  private async importDroppedFiles(dataTransfer: DataTransfer | null): Promise<void> {
    if (!dataTransfer) {
      this.handleSelectFiles([]);
      return;
    }

    this.handleSelectFiles(await collectDroppedFiles(dataTransfer));
  }

  private readonly handleOpenFolderDialog = (): void => {
    void this.openFolderDialog();
  };

  private async openFolderDialog(): Promise<void> {
    this.error = null;
    this.syncView();

    try {
      const folder = await this.commandService.executeCommand<URI | null>(ADD_WORKSPACE_FOLDER_COMMAND_ID);
      if (!folder || this.disposed) {
        return;
      }

      this.excludedSourcePaths.clear();
      await this.importFolderIncrementally(folder);
    } catch (error) {
      if (this.disposed) {
        return;
      }

      // Logged unconditionally (not only in DEV) so the failure is visible in
      // the browser console when running `npm run dev`.
      console.error("Failed to read files from the selected folder.", error);

      this.error = localize(
        "import.failedToReadSelectedFolder",
        "Failed to read files from the selected folder.",
      );
      this.syncView();
    }
  }

  private readonly handleSelectFile = (fileId: string | null): void => {
    const next = typeof fileId === "string" ? fileId : null;
    if (!next) {
      return;
    }

    this.optimisticSelectedFileId = next;
    if (this.props.onFileSelected) {
      this.props.onFileSelected(next);
    }
    this.syncView();
  };

  private readonly handleRemoveFile = (fileId: string | null): void => {
    if (typeof fileId !== "string") {
      return;
    }

    if (this.optimisticSelectedFileId === fileId) {
      this.optimisticSelectedFileId = null;
      if (this.props.onFileSelected) {
        this.props.onFileSelected(null);
      }
    }

    this.rememberRemovedFiles([fileId]);
    this.removeFiles([fileId]);
    this.handleFileCountEffects();
    this.syncView();
  };

  private readonly handleRemoveFolder = (folderKey: string): void => {
    const folderPath = getFileTreeFolderPath(folderKey);
    if (!folderPath) {
      return;
    }

    const removedFileIds = new Set(
      this.files
        .filter((entry) => isFileTreePathInFolder(entry.relativePath, folderPath))
        .map((entry) => entry.fileId)
        .filter((fileId): fileId is string => typeof fileId === "string"),
    );
    if (removedFileIds.size === 0) {
      return;
    }

    if (this.optimisticSelectedFileId && removedFileIds.has(this.optimisticSelectedFileId)) {
      this.optimisticSelectedFileId = null;
      this.props.onFileSelected?.(null);
    }

    const fileIds = [...removedFileIds];
    this.rememberRemovedFiles(fileIds);
    this.removeFiles(fileIds);

    this.handleFileCountEffects();
    this.syncView();
  };

  private readonly handleCreateFolder = (_folderKey: string): void => {
    showCreateFolderUnsupported();
  };

  private removeFiles(fileIds: readonly string[]): void {
    if (!this.isControlled) {
      const removedFileIds = new Set(fileIds);
      this.internalFiles = this.internalFiles.filter((entry) => !removedFileIds.has(entry.fileId ?? ""));
    }

    if (this.props.onFilesRemoved) {
      this.props.onFilesRemoved([...fileIds]);
      return;
    }

    for (const fileId of fileIds) {
      this.props.onFileRemoved?.(fileId);
    }
  }

  private rememberRemovedFiles(fileIds: readonly string[]): void {
    const removedFileIds = new Set(fileIds);
    for (const file of this.files) {
      if (!removedFileIds.has(file.fileId ?? "")) {
        continue;
      }

      const sourcePath = createWorkspaceSourcePathKey(file.relativePath);
      if (sourcePath) {
        this.excludedSourcePaths.add(sourcePath);
      }
    }
  }

  private async processFiles(
    newFiles: FileSource[],
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

    this.error = null;
    this.syncView();

    const failedFiles: ImportFilePrepareFailure[] = [];
    const canApplyResult = (): boolean =>
      !this.disposed &&
      runId === this.importRunId &&
      (!options.shouldContinue || options.shouldContinue());
    const {
      hasAnyUnsupportedFiles,
      pendingImportFiles,
      unsupportedCount,
    } = collectPendingImportFiles(
      newFiles,
    );
    if (pendingImportFiles.length === 0) {
      finishBatchPerf({
        acceptedCount: 0,
        duplicateCount: 0,
        failedCount: 0,
        unsupportedCount,
      });
      if (options.replaceWhenEmpty) {
        if (canApplyResult()) {
          this.replaceImportedFiles([], [], null);
        }
      }
      if (canApplyResult()) {
        this.error = buildImportErrorMessage({
          failedFiles,
          hasAnyUnsupportedFiles,
          readFailures: options.readFailures,
        });
        this.syncView();
      }
      return;
    }

    const selectedRelativePath = options.preserveSelection
      ? this.getSelectedRelativePath()
      : null;
    const firstImport = await this.prepareFirstImportedFile(
      pendingImportFiles,
      selectedRelativePath,
      failedFiles,
      canApplyResult,
    );
    let acceptedCount = firstImport.result ? 1 : 0;

    if (firstImport.result && canApplyResult()) {
      const { prepared } = firstImport.result;
      this.replaceImportedFiles(
        [prepared.fileEntry],
        [prepared.fileInfo],
        prepared.fileInfo.fileId,
      );
    }

    if (canApplyResult()) {
      acceptedCount += await this.prepareRemainingImportFiles({
        canApplyResult,
        failedFiles,
        pendingImportFiles,
        skippedIndexes: firstImport.attemptedIndexes,
      });
    }

    if (canApplyResult()) {
      this.logImportDiagnostics("files", failedFiles, options.readFailures);
      this.error = buildImportErrorMessage({
        failedFiles,
        hasAnyUnsupportedFiles,
        readFailures: options.readFailures,
      });
      this.syncView();
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
    const failedFiles: ImportFilePrepareFailure[] = [];
    const canApplyResult = (): boolean =>
      !this.disposed && runId === this.importRunId;
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

          acceptedCount += await this.prepareRemainingImportFiles({
            canApplyResult,
            failedFiles,
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
      this.filesService,
      {
        shouldContinue: canApplyResult,
        onBatch: async ({ files }) => {
          if (!canApplyResult()) {
            return;
          }

          const {
            pendingImportFiles,
          } = collectPendingImportFiles([...files]);
          if (pendingImportFiles.length === 0) {
            return;
          }

          if (hasStartedPreview) {
            queueRemainingFiles(pendingImportFiles, new Set<number>());
            return;
          }

          const firstImport = await this.prepareFirstImportedFile(
            pendingImportFiles,
            null,
            failedFiles,
            canApplyResult,
          );
          if (firstImport.result && canApplyResult()) {
            const { prepared } = firstImport.result;
            this.replaceImportedFiles(
              [prepared.fileEntry],
              [prepared.fileInfo],
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
    this.error = buildImportErrorMessage({
      failedFiles,
      hasAnyUnsupportedFiles: false,
      readFailures: result.readFailures,
    });
    this.syncView();
    finishBatchPerf({
      acceptedCount,
      failedCount: failedFiles.length,
      scannedCount: result.files.length,
      unsupportedCount: 0,
    });
  }

  private async prepareFirstImportedFile(
    pendingImportFiles: readonly PendingImportFile[],
    selectedRelativePath: string | null,
    failedFiles: ImportFilePrepareFailure[],
    canApplyResult: () => boolean,
  ): Promise<FirstPreparedImport> {
    const attemptedIndexes = new Set<number>();
    for (const index of this.getPriorityImportIndexes(
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
        this.analysisFileService,
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

  private getPriorityImportIndexes(
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

  private async prepareRemainingImportFiles({
    canApplyResult,
    failedFiles,
    pendingImportFiles,
    skippedIndexes,
  }: {
    readonly canApplyResult: () => boolean;
    readonly failedFiles: ImportFilePrepareFailure[];
    readonly pendingImportFiles: readonly PendingImportFile[];
    readonly skippedIndexes: ReadonlySet<number>;
  }): Promise<number> {
    const remainingIndexes = pendingImportFiles
      .map((_file, index) => index)
      .filter(index => !skippedIndexes.has(index));
    if (remainingIndexes.length === 0) {
      return 0;
    }

    const readyByIndex = new Map<number, PreparedImportFile>();
    const completedIndexes = new Set<number>();
    let nextAppendOffset = 0;
    let nextImportIndex = 0;
    let acceptedCount = 0;

    const flushReadyImports = (): number => {
      if (!canApplyResult()) {
        return 0;
      }

      const preparedEntries: ImportSessionFileEntry[] = [];
      const importedFiles: ImportSessionFileInfo[] = [];
      while (
        nextAppendOffset < remainingIndexes.length &&
        importedFiles.length < IMPORT_APPEND_BATCH_SIZE
      ) {
        const index = remainingIndexes[nextAppendOffset];
        if (!completedIndexes.has(index)) {
          break;
        }

        const prepared = readyByIndex.get(index);
        if (prepared) {
          preparedEntries.push(prepared.fileEntry);
          importedFiles.push(prepared.fileInfo);
        }
        nextAppendOffset += 1;
      }

      if (importedFiles.length === 0) {
        return 0;
      }

      this.appendImportedFiles(preparedEntries, importedFiles);
      return importedFiles.length;
    };

    const workerCount = Math.min(
      IMPORT_PREPARE_CONCURRENCY,
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
            this.analysisFileService,
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
      // Drain completed batches larger than IMPORT_APPEND_BATCH_SIZE.
    }

    return acceptedCount;
  }

  private getNoSupportedDroppedFilesError(): string {
    return localize(
      "import.noSupportedDroppedFiles",
      "No supported files found in the selected folder.",
    );
  }

  private getUnknownFileLabel(): string {
    return localize("import.unknownFile", "Unknown file");
  }

  private replaceImportedFiles(
    fileEntries: ImportSessionFileEntry[],
    importedFiles: ImportSessionFileInfo[],
    selectedFileId: string | null = importedFiles[0]?.fileId ?? null,
  ): void {
    const nextSelectedFileId = selectedFileId;
    this.optimisticSelectedFileId = nextSelectedFileId;

    if (!this.isControlled) {
      this.internalFiles = [...fileEntries];
      this.handleFileCountEffects();
      this.syncView();
    }

    if (this.props.onFilesReplaced) {
      this.props.onFilesReplaced(importedFiles);
    } else {
      for (const fileInfo of importedFiles) {
        this.props.onFileImported?.(fileInfo);
      }
    }
    if (this.props.onFileSelected) {
      this.props.onFileSelected(nextSelectedFileId);
    }
  }

  private appendImportedFiles(
    fileEntries: ImportSessionFileEntry[],
    importedFiles: ImportSessionFileInfo[],
  ): void {
    if (importedFiles.length === 0) {
      return;
    }

    if (!this.isControlled) {
      this.internalFiles = [...this.internalFiles, ...fileEntries];
      this.handleFileCountEffects();
      this.syncView();
    }

    if (this.props.onFilesAdded) {
      this.props.onFilesAdded(importedFiles);
      return;
    }

    for (const fileInfo of importedFiles) {
      this.props.onFileImported?.(fileInfo);
    }
  }

  private watchImportedFolder(folder: URI): void {
    this.folderWatcher.watch(folder);
  }

  private clearImportedFolderWatch(): void {
    this.folderWatcher.clear();
    this.clearExternalChanges();
  }

  private async refreshImportedFolder(folder: URI): Promise<void> {
    if (this.disposed) {
      return;
    }

    const runId = this.folderRefreshRunId + 1;
    this.folderRefreshRunId = runId;
    try {
      const result = await collectFolderImportFiles(folder, this.filesService);
      if (this.disposed || runId !== this.folderRefreshRunId) {
        return;
      }

      const changes = resolveWorkspaceExternalChanges({
        excludedSourcePaths: this.excludedSourcePaths,
        files: this.files,
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
      if (this.disposed || runId !== this.folderRefreshRunId) {
        return;
      }

      this.error = localize(
        "import.failedToRefreshFolder",
        "Failed to refresh files from the selected folder.",
      );
      this.syncView();
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
    if (!folder || !changes || this.disposed) {
      return;
    }

    const runId = this.folderRefreshRunId + 1;
    this.folderRefreshRunId = runId;
    const folderKey = folder.toString();

    try {
      const result = await collectFolderImportFiles(folder, this.filesService);
      if (
        this.disposed ||
        runId !== this.folderRefreshRunId ||
        this.folderWatcher.currentFolderKey !== folderKey
      ) {
        return;
      }

      const nextChanges = resolveWorkspaceExternalChanges({
        excludedSourcePaths: this.excludedSourcePaths,
        files: this.files,
        scannedFiles: result.files,
      });
      if (!hasWorkspaceExternalChanges(nextChanges)) {
        this.clearExternalChanges();
        return;
      }

      this.applyDeletedAndModifiedFiles(nextChanges);
      await this.appendExternalFiles(result.files, nextChanges, result.readFailures, () =>
        !this.disposed &&
        runId === this.folderRefreshRunId &&
        this.folderWatcher.currentFolderKey === folderKey
      );
      this.clearExternalChanges();
    } catch {
      if (this.disposed || runId !== this.folderRefreshRunId) {
        return;
      }

      this.error = localize(
        "workspaces.failedToApplyExternalChanges",
        "Failed to apply external folder changes.",
      );
      this.syncView();
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

    const removedFileIds = this.files
      .filter(file => {
        const sourcePath = createWorkspaceSourcePathKey(file.relativePath);
        return Boolean(sourcePath && removedPaths.has(sourcePath));
      })
      .map(file => file.fileId)
      .filter((fileId): fileId is string => typeof fileId === "string");

    if (removedFileIds.length > 0) {
      this.removeFiles(removedFileIds);
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
      currentCount: this.files.length,
      incomingCount: newFiles.length,
      source: "workspace-change",
    });
    const canApplyResult = (): boolean =>
      !this.disposed &&
      runId === this.importRunId &&
      (!options.shouldContinue || options.shouldContinue());
    const failedFiles: ImportFilePrepareFailure[] = [];
    const {
      hasAnyUnsupportedFiles,
      pendingImportFiles,
      unsupportedCount,
    } = collectPendingImportFiles([...newFiles]);
    let acceptedCount = 0;

    if (pendingImportFiles.length > 0) {
      acceptedCount = await this.prepareRemainingImportFiles({
        canApplyResult,
        failedFiles,
        pendingImportFiles,
        skippedIndexes: new Set<number>(),
      });
    }

    if (canApplyResult()) {
      this.logImportDiagnostics("workspace", failedFiles, options.readFailures);
      this.error = buildImportErrorMessage({
        failedFiles,
        hasAnyUnsupportedFiles,
        readFailures: options.readFailures,
      });
      this.syncView();
    }

    finishBatchPerf({
      acceptedCount,
      failedCount: failedFiles.length,
      unsupportedCount,
    });
  }

  private logImportDiagnostics(
    source: "folder" | "files" | "workspace",
    failedFiles: readonly ImportFilePrepareFailure[],
    readFailures: readonly FolderFileReadFailure[] = [],
  ): void {
    if (failedFiles.length === 0 && readFailures.length === 0) {
      return;
    }

    // Surfaced unconditionally (not only in DEV) so web users running
    // `npm run dev` can diagnose why files did not import.
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

  private getSelectedRelativePath(): string | null {
    const selectedFileId = this.effectiveSelectedFileId;
    if (!selectedFileId) {
      return null;
    }

    const selectedFile = this.files.find(file => file.fileId === selectedFileId);
    return normalizeRelativePath(selectedFile?.relativePath);
  }

  private getSelectedFolderPath(): string | null {
    return getTopLevelFolderPath(this.getSelectedRelativePath());
  }

  private getFirstFolderPath(): string | null {
    for (const file of this.files) {
      const folderPath = getTopLevelFolderPath(file.relativePath);
      if (folderPath) {
        return folderPath;
      }
    }

    return null;
  }

}

function normalizeRelativePath(value: unknown): string | null {
  const relativePath = String(value ?? "").trim();
  return relativePath || null;
}

function getTopLevelFolderPath(relativePath: unknown): string | null {
  const normalized = normalizeRelativePath(relativePath);
  if (!normalized) {
    return null;
  }

  const slashIndex = normalized.indexOf("/");
  if (slashIndex <= 0) {
    return null;
  }

  return normalized.slice(0, slashIndex);
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
