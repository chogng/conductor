/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type { IAction } from "src/cs/base/common/actions";
import type { IDisposable } from "src/cs/base/common/lifecycle";
import type { URI } from "src/cs/base/common/uri";
import type { ICommandService as ICommandServiceType } from "src/cs/platform/commands/common/commands";
import type { IFileService as IFileServiceType } from "src/cs/platform/files/common/files";
import { localize } from "src/cs/nls";
import { startPerf } from "src/cs/workbench/common/perf";
import { notificationService } from "src/cs/workbench/services/notification/common/notificationService";
import { WorkspaceWatcher } from "src/cs/workbench/services/workspaces/browser/workspaceWatcher";
import {
  resolveWorkspaceExternalChanges,
} from "src/cs/workbench/services/workspaces/common/externalChanges";
import {
  ADD_WORKSPACE_FOLDER_COMMAND_ID,
} from "src/cs/workbench/services/workspaces/common/workspaces";
import {
  createWorkspaceSourcePathKey,
  hasWorkspaceExternalChanges,
  WORKSPACE_EXTERNAL_CHANGES_TOAST_ID,
  type WorkspaceExternalChanges,
} from "src/cs/workbench/services/workspaces/common/workspaces";
import type { ExplorerFileEntry } from "src/cs/workbench/services/explorer/common/explorerModel";
import type { FileSource } from "src/cs/workbench/services/files/common/files";
import type { FileConverterBackend } from "src/cs/workbench/services/files/common/fileConverterBackend";
import {
  collectFolderImportFiles,
  collectFolderImportFilesIncrementally,
  collectDroppedFiles,
  type FolderFileReadFailure,
} from "src/cs/workbench/contrib/files/browser/fileImportExport";
import {
  type ImportFilePrepareFailure,
  type PreparedImportFile,
} from "src/cs/workbench/services/explorer/browser/explorerImportPipeline";
import {
  prepareFirstExplorerImportFile,
  prepareRemainingExplorerImportFiles,
} from "src/cs/workbench/services/explorer/browser/explorerImportBatch";
import {
  buildImportErrorMessage,
} from "src/cs/workbench/services/explorer/browser/explorerImportDiagnostics";
import {
  collectPendingImportFiles,
  type PendingImportFile,
} from "src/cs/workbench/services/files/browser/pendingImportFiles";

export type ExplorerImportControllerOptions = {
  readonly commandService: Pick<ICommandServiceType, "executeCommand">;
  readonly fileConverterBackendService: FileConverterBackend;
  readonly filesService: IFileServiceType;
  readonly getFiles: () => readonly ExplorerFileEntry[];
  readonly getSelectedRelativePath: () => string | null;
  readonly isDisposed: () => boolean;
  readonly onAppendPreparedFiles: (preparedFiles: readonly PreparedImportFile[]) => void;
  readonly onDraggingChange: (isDragging: boolean) => void;
  readonly onErrorChange: (error: string | null) => void;
  readonly onRemoveFiles: (fileIds: readonly string[]) => void;
  readonly onReplacePreparedFiles: (
    preparedFiles: readonly PreparedImportFile[],
    selectedFileId: string | null,
  ) => void;
  readonly syncView: () => void;
};

export class ExplorerImportController implements IDisposable {
  private readonly folderWatcher: WorkspaceWatcher;
  private importRunId = 0;
  private folderRefreshRunId = 0;
  private pendingExternalFolder: URI | null = null;
  private pendingExternalChanges: WorkspaceExternalChanges | null = null;
  private readonly excludedSourcePaths = new Set<string>();

  constructor(
    private readonly options: ExplorerImportControllerOptions,
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

      // Logged unconditionally (not only in DEV) so the failure is visible in
      // the browser console when running `npm run dev`.
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

    const failedFiles: ImportFilePrepareFailure[] = [];
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
    const firstImport = await prepareFirstExplorerImportFile({
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
      acceptedCount += await prepareRemainingExplorerImportFiles({
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
    const failedFiles: ImportFilePrepareFailure[] = [];
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

          acceptedCount += await prepareRemainingExplorerImportFiles({
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

          const firstImport = await prepareFirstExplorerImportFile({
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
    const failedFiles: ImportFilePrepareFailure[] = [];
    const {
      hasAnyUnsupportedFiles,
      pendingImportFiles,
      unsupportedCount,
    } = collectPendingImportFiles([...newFiles]);
    let acceptedCount = 0;

    if (pendingImportFiles.length > 0) {
      acceptedCount = await prepareRemainingExplorerImportFiles({
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
