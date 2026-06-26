/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { localize } from "src/cs/nls";
import { URI } from "src/cs/base/common/uri";
import { createMenuAction } from "src/cs/base/browser/ui/menu/menu";
import type { ListHandle } from "src/cs/base/browser/ui/list/list";
import { toAction } from "src/cs/base/common/actions";
import { LxIcon } from "src/cs/base/common/lxicon";
import { isWindows } from "src/cs/base/common/platform";
import { ICommandService } from "src/cs/platform/commands/common/commands";
import {
  IContextMenuService,
  IContextViewService,
} from "src/cs/platform/contextview/browser/contextView";
import { IDialogService } from "src/cs/platform/dialogs/common/dialogs";
import { IFileService } from "src/cs/platform/files/common/files";
import type { WorkbenchSidebarAction } from "src/cs/workbench/browser/parts/sidebar/sidebarPart";
import { ViewPane } from "src/cs/workbench/browser/parts/views/viewPane";
import { IWorkbenchLayoutService } from "src/cs/workbench/services/layout/browser/layoutService";
import {
  FileSourceWorkflow,
  getFolderImportSupportForFileService,
  type PendingImportFile,
  type PendingImportSourceStatusChange,
  type PreparedFileImport,
  type PreparedFileImportEntry,
  type PreparedFileImportInfo,
} from "src/cs/workbench/contrib/files/browser/fileImportExport";
import {
  ExplorerView,
  type ExplorerViewProps,
} from "src/cs/workbench/contrib/files/browser/views/explorerView";
import {
  ADD_FOLDER_ACTION_ID,
  CLOSE_FOLDER_ACTION_ID,
  MORE_ACTIONS_ACTION_ID,
  type FilesViewLayout,
} from "src/cs/workbench/contrib/files/common/files";
import {
  ExplorerViewId,
  IExplorerService,
  type ExplorerPaneInput,
} from "src/cs/workbench/contrib/files/browser/files";
import {
  getExplorerFolderPath,
  getExplorerTreeFileKey,
  isExplorerPathInFolder,
  mergeExplorerSourceEntries,
  resolveExplorerSelectionAfterRemoval,
  resolveExplorerSelectedFileId,
  type ExplorerFileEntry,
} from "src/cs/workbench/contrib/files/common/explorerModel";
import { TOGGLE_THUMBNAIL_VIEW_ACTION_ID } from "src/cs/workbench/contrib/thumbnail/common/thumbnail";
import { createTemplateEditorRecordFromUserTemplate } from "src/cs/workbench/contrib/template/browser/templateUserTemplateAdapter";
import {
  ExplorerDecorationsProvider,
  createExplorerDecorationResource,
} from "src/cs/workbench/contrib/files/browser/views/explorerDecorationsProvider";
import type {
  ExplorerDecorationData,
} from "src/cs/workbench/contrib/files/browser/views/explorerDecorations";
import {
  IDecorationsService,
  type IDecorationsService as IDecorationsServiceType,
} from "src/cs/workbench/services/decorations/common/decorations";
import {
  IThumbnailPreviewService,
  IThumbnailService,
} from "src/cs/workbench/services/thumbnail/common/thumbnail";
import {
  ITableService,
  type TableSource,
} from "src/cs/workbench/services/table/common/table";
import {
  tableFormatService,
} from "src/cs/workbench/services/table/common/tableFormatService";
import { INotificationService } from "src/cs/workbench/services/notification/common/notificationService";
import { IAppearanceService } from "src/cs/workbench/services/appearance/common/appearance";
import {
  IUserTemplateService,
  type IUserTemplateService as IUserTemplateServiceType,
} from "src/cs/workbench/services/userTemplate/common/userTemplate";
import {
  IReviewService,
  type IReviewService as IReviewServiceType,
} from "src/cs/workbench/services/review/common/review";

import "src/cs/workbench/contrib/files/browser/views/media/explorerViewlet.css";

export class ExplorerViewPane extends ViewPane {
  private readonly root: HTMLDivElement;
  private readonly content: HTMLDivElement;
  private readonly explorerHost: HTMLDivElement;
  private readonly listRef: { current: ListHandle | null } = { current: null };
  private readonly sourceWorkflow: FileSourceWorkflow;
  private explorerView: ExplorerView | null = null;
  private input: ExplorerPaneInput | null = null;
  private internalFiles: ExplorerFileEntry[] = [];
  private pendingSourceEntries: ExplorerFileEntry[] = [];
  private replaceItemKeys: string[] | null = null;
  private readonly locallyRemovedFileIds = new Set<string>();
  private readonly locallyRenamedFileNames = new Map<string, string>();
  private mergedFilesCache: {
    readonly committedFiles: readonly ExplorerFileEntry[];
    readonly files: ExplorerFileEntry[];
    readonly pendingSourceEntries: readonly ExplorerFileEntry[];
    readonly replaceItemKeys: readonly string[] | null;
  } | null = null;
  private isDragging = false;
  private disposed = false;
  private pendingLocalExpandedFolderKeys: readonly string[] | null = null;
  private cancelPendingSourceSyncView: (() => void) | null = null;

  constructor(
    @ICommandService private readonly commandService: ICommandService,
    @IContextMenuService private readonly contextMenuService: IContextMenuService,
    @IContextViewService private readonly contextViewService: IContextViewService,
    @IDialogService private readonly dialogService: IDialogService,
    @IExplorerService private readonly explorerService: IExplorerService,
    @IFileService private readonly filesService: IFileService,
    @IAppearanceService private readonly appearanceService: IAppearanceService,
    @IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
    @INotificationService private readonly notificationService: INotificationService,
    @ITableService private readonly tableService: ITableService,
    @IThumbnailPreviewService private readonly thumbnailPreviewService: IThumbnailPreviewService,
    @IThumbnailService private readonly thumbnailService: IThumbnailService,
    @IUserTemplateService private readonly userTemplateService: IUserTemplateServiceType,
    @IDecorationsService private readonly decorationsService: IDecorationsServiceType,
    @IReviewService reviewService: IReviewServiceType,
  ) {
    super({
      id: ExplorerViewId,
      title: localize("files.explorerSection", "Explorer"),
      className: "files-view-pane",
      bodyClassName: "workbench-part-view-pane__body",
    });

    this.root = document.createElement("div");
    this.root.className = "files-pane files-pane-root";

    this.content = document.createElement("div");
    this.content.className = "files-pane-body";

    this.explorerHost = document.createElement("div");
    this.explorerHost.className = "files-pane-session-host";

    this.content.append(this.explorerHost);
    this.root.append(this.content);
    this.body.append(this.root);

    this.sourceWorkflow = new FileSourceWorkflow({
      commandService: this.commandService,
      filesService: this.filesService,
      getFiles: () => this.committedFiles,
      getSelectedRelativePath: () => this.getSelectedRelativePath(),
      isDisposed: () => this.disposed,
      notificationService: this.notificationService,
      onAppendPreparedFiles: preparedFiles => this.appendPreparedImportFiles(preparedFiles),
      onAppendPendingSourceFiles: pendingFiles => this.appendPendingSourceFiles(pendingFiles),
      onClearPendingSourceFiles: () => this.clearPendingSourceFiles(),
      onDraggingChange: isDragging => {
        this.isDragging = isDragging;
      },
      onRemoveFiles: fileIds => this.removeImportedFilesFromExplorer(fileIds),
      onReplacePreparedFiles: (preparedFiles, selectedFileId) => {
        this.replacePreparedImportFiles(preparedFiles, selectedFileId);
      },
      onReplacePendingSourceFiles: pendingFiles => this.replacePendingSourceFiles(pendingFiles),
      onFinishPendingSourceReplace: () => this.finishPendingSourceReplace(),
      onUpdatePendingSourceFile: (pendingFile, change) => {
        this.updatePendingSourceFile(pendingFile, change);
      },
      syncView: () => this.syncView(),
    });
    const decorationsProvider = this._register(new ExplorerDecorationsProvider(
      this.explorerService,
      reviewService,
    ));
    this._register(this.decorationsService.registerDecorationsProvider(decorationsProvider));

    this._register(this.explorerService.onDidChangePaneInput(() => {
      this.update(this.explorerService.getPaneInput());
    }));
    this._register(this.explorerService.onDidChangeViewLayout(() => {
      this.update(this.input);
    }));
    this._register(this.explorerService.onDidChangeSelection(() => {
      this.syncView();
    }));
    this._register(this.explorerService.onDidChangeExpandedFolderKeys((event) => {
      if (this.consumeLocalExpandedFolderKeys(event.expandedFolderKeys)) {
        return;
      }
      this.syncView();
    }));
    this._register(this.appearanceService.onDidChangeAppearance(() => {
      this.syncView();
    }));
    this._register(this.userTemplateService.onDidChangeUserTemplates(() => {
      this.syncView();
    }));
    this._register(this.decorationsService.onDidChangeDecorations(() => {
      this.syncView();
    }));

    this.update(this.explorerService.getPaneInput());
    this.loadTemplates();
  }

  public update(input: ExplorerPaneInput | null): void {
    this.input = input;

    if (!this.explorerView) {
      this.explorerView = new ExplorerView(this.explorerHost, this.createExplorerViewProps());
      this.listRef.current = this.explorerView.getListHandle();
    } else {
      this.explorerView.setProps(this.createExplorerViewProps());
    }

    if (
      this.element.isConnected &&
      this.element.clientHeight > 0 &&
      this.element.clientWidth > 0
    ) {
      this.layout(this.element.clientHeight, this.element.clientWidth);
    }
  }

  public override dispose(): void {
    if (this.disposed) {
      return;
    }

    this.disposed = true;
    this.cancelPendingSourceSyncView?.();
    this.cancelPendingSourceSyncView = null;
    this.explorerService.setPendingSourceFiles(false);
    this.sourceWorkflow.dispose();
    this.explorerView?.dispose();
    this.explorerView = null;
    this.listRef.current = null;
    super.dispose();
  }

  public openFolderImport(): void {
    this.openFileDialog();
  }

  public closeFile(fileId: string | null): void {
    if (!fileId || !this.fileIds.includes(fileId)) {
      return;
    }

    this.handleCloseFile(fileId);
  }

  public deleteFile(fileId: string | null): Promise<void> {
    if (!fileId || !this.fileIds.includes(fileId)) {
      return Promise.resolve();
    }

    return this.handleDeleteFile(fileId);
  }

  protected override layoutBody(height: number, width: number): void {
    this.body.style.height = `${height}px`;
    this.body.style.width = `${width}px`;
    this.root.style.height = `${height}px`;
    this.root.style.width = `${width}px`;
    this.content.style.height = `${height}px`;
    this.content.style.width = `${width}px`;
    this.explorerHost.style.height = `${height}px`;
    this.explorerHost.style.width = `${width}px`;
    this.listRef.current?.layout(height, width);
  }

  public getActions(): readonly WorkbenchSidebarAction[] {
    return [
      {
        ...toAction({
          id: MORE_ACTIONS_ACTION_ID,
          label: localize("files.moreActions", "More Actions"),
          tooltip: localize("files.moreActions", "More Actions"),
          class: "sidebar_header_action",
          run: (event) => this.showMoreActions(getActionAnchor(event)),
        }),
        icon: LxIcon.moreHorizontal,
      } satisfies WorkbenchSidebarAction,
    ];
  }

  private get paneInput(): ExplorerPaneInput {
    return this.input ?? EMPTY_EXPLORER_PANE_INPUT;
  }

  private get files(): ExplorerFileEntry[] {
    const committedFiles = this.committedFiles;
    if (!this.pendingSourceEntries.length && !this.replaceItemKeys?.length) {
      return committedFiles;
    }

    const cache = this.mergedFilesCache;
    if (
      cache &&
      cache.committedFiles === committedFiles &&
      cache.pendingSourceEntries === this.pendingSourceEntries &&
      cache.replaceItemKeys === this.replaceItemKeys
    ) {
      return cache.files;
    }

    const files = mergeExplorerSourceEntries({
      files: committedFiles,
      pendingSourceEntries: this.pendingSourceEntries,
      replaceItemKeys: this.replaceItemKeys,
    });
    this.mergedFilesCache = {
      committedFiles,
      files,
      pendingSourceEntries: this.pendingSourceEntries,
      replaceItemKeys: this.replaceItemKeys,
    };
    return files;
  }

  private get committedFiles(): ExplorerFileEntry[] {
    const inputFiles = this.input?.files;
    return applyLocalExplorerFileOverrides(
      mergeExplorerCommittedFiles(
        Array.isArray(inputFiles) ? inputFiles : [],
        this.internalFiles,
      ),
      this.locallyRemovedFileIds,
      this.locallyRenamedFileNames,
    );
  }

  private get fileIds(): readonly string[] {
    return this.files
      .map(file => normalizeFileId(file.fileId))
      .filter((fileId): fileId is string => Boolean(fileId));
  }

  private get itemKeys(): readonly string[] {
    return this.files
      .map(file => normalizeItemKey(file.itemKey))
      .filter((itemKey): itemKey is string => Boolean(itemKey));
  }

  private get selectedFileId(): string | null {
    return this.paneInput.selectedFileId;
  }

  private get selectedItemKey(): string | null {
    return this.paneInput.selectedItemKey ?? null;
  }

  private get viewLayout(): FilesViewLayout {
    return this.explorerService.viewLayout;
  }

  private createExplorerViewProps(): ExplorerViewProps {
    const input = this.paneInput;
    const files = this.files;
    return {
      selectedFileId: this.selectedFileId,
      selectedItemKey: this.selectedItemKey,
      expandedFolderKeys: this.explorerService.expandedFolderKeys,
      explorerAppearance: this.appearanceService.getAppearance().explorer,
      activePlotType: input.activePlotType,
      commandService: this.commandService,
      contextViewService: this.contextViewService,
      contextMenuService: this.contextMenuService,
      originOpenPlotOptions: input.originOpenPlotOptions,
      plotAxisSettings: input.plotAxisSettings,
      thumbnailPreviewService: this.thumbnailPreviewService,
      thumbnailService: this.thumbnailService,
      fileTemplateSelectionsByFileId: input.fileTemplateSelectionsByFileId,
      editable: this.explorerService.getContext().editable,
      templateRecords: this.createTemplateRecords(),
      files,
      decorationsByFileKey: this.createExplorerDecorationsByFileKey(files),
      folderImportSupport: getFolderImportSupportForFileService(this.filesService),
      isDragging: this.isDragging,
      mode: input.mode,
      viewLayout: this.viewLayout,
      onDraggingChange: this.handleDraggingChange,
      onFolderExpansionChange: this.handleFolderExpansionChange,
      onFolderKeysChange: this.handleFolderKeysChange,
      onHoverFileChange: this.handleHoverFileChange,
      onVisibleFileIdsChange: this.handleVisibleFileIdsChange,
      onRemoveFolder: this.handleRemoveFolder,
      onRequestTemplates: this.loadTemplates,
      onCancelRenameFile: this.handleCancelRenameFile,
      onDropFiles: this.handleDropFiles,
      onOpenFolderDialog: this.handleOpenFolderDialog,
      onRenameFile: this.handleRenameFile,
      onSelectFile: this.handleSelectFile,
      thumbnailFiles: input.thumbnailFiles,
      thumbnailPlotModelsByFileId: input.thumbnailPlotModelsByFileId,
    };
  }

  private createExplorerDecorationsByFileKey(
    files: readonly ExplorerFileEntry[],
  ): Readonly<Record<string, ExplorerDecorationData>> {
    const decorationsByFileKey: Record<string, ExplorerDecorationData> = {};
    for (const file of files) {
      const resource = getExplorerFileTableResource(file);
      if (!resource) {
        continue;
      }
      const decoration = this.decorationsService.getDecorationData(
        createExplorerDecorationResource(resource, file.sheetId),
        false,
      )[0];
      if (decoration) {
        decorationsByFileKey[getExplorerTreeFileKey(file)] = decoration;
      }
    }
    return decorationsByFileKey;
  }

  private readonly handleCancelRenameFile = (): void => {
    this.explorerService.setEditable(null);
  };

  private readonly handleHoverFileChange = (fileId: string | null): void => {
    this.explorerService.setHoveredFileId(fileId);
  };

  private readonly handleRenameFile = (fileId: string, nextName: string): void => {
    const normalizedFileId = normalizeFileId(fileId);
    const normalizedName = String(nextName ?? "").trim();
    this.explorerService.setEditable(null);
    if (!normalizedFileId || !normalizedName) {
      return;
    }

    this.renameExplorerFile(normalizedFileId, normalizedName);
    this.syncView();
  };

  private syncView(): void {
    if (this.disposed) {
      return;
    }

    this.explorerView?.setProps(this.createExplorerViewProps());
  }

  private appendPendingSourceFiles(pendingFiles: readonly PendingImportFile[]): void {
    this.upsertPendingSourceFiles(pendingFiles);
  }

  private replacePendingSourceFiles(pendingFiles: readonly PendingImportFile[]): void {
    this.pendingSourceEntries = [];
    this.replaceItemKeys = [];
    this.upsertPendingSourceFiles(pendingFiles);
  }

  private upsertPendingSourceFiles(pendingFiles: readonly PendingImportFile[]): void {
    if (!pendingFiles.length) {
      return;
    }

    const entriesByItemKey = new Map(
      this.pendingSourceEntries
        .map(entry => [normalizeItemKey(entry.itemKey), entry] as const)
        .filter((entry): entry is readonly [string, ExplorerFileEntry] => Boolean(entry[0])),
    );
    const replaceItemKeys = this.replaceItemKeys ? [...this.replaceItemKeys] : null;
    for (const pendingFile of pendingFiles) {
      const itemKey = normalizeItemKey(pendingFile.itemKey);
      if (!itemKey) {
        continue;
      }

      entriesByItemKey.set(itemKey, createPendingSourceEntry({
        message: entriesByItemKey.get(itemKey)?.sourceStatusMessage ?? null,
        pendingFile,
        status: entriesByItemKey.get(itemKey)?.sourceStatus ?? "pending",
      }));
      if (replaceItemKeys && !replaceItemKeys.includes(itemKey)) {
        replaceItemKeys.push(itemKey);
      }
    }

    this.pendingSourceEntries = [...entriesByItemKey.values()];
    if (replaceItemKeys) {
      this.replaceItemKeys = replaceItemKeys;
    }
    this.schedulePendingSourceSyncView();
  }

  private updatePendingSourceFile(
    pendingFile: PendingImportFile,
    change: PendingImportSourceStatusChange,
  ): void {
    const itemKey = normalizeItemKey(pendingFile.itemKey);
    if (!itemKey) {
      return;
    }

    const pendingEntries = this.pendingSourceEntries.map(entry =>
      normalizeItemKey(entry.itemKey) === itemKey
        ? createPendingSourceEntry({
            message: change.message ?? null,
            pendingFile,
            status: change.status,
          })
        : entry,
    );
    if (!pendingEntries.some(entry => normalizeItemKey(entry.itemKey) === itemKey)) {
      pendingEntries.push(createPendingSourceEntry({
        message: change.message ?? null,
        pendingFile,
        status: change.status,
      }));
    }
    this.pendingSourceEntries = pendingEntries;
    this.schedulePendingSourceSyncView();
  }

  private removePendingSourceFiles(itemKeys: readonly string[]): void {
    const removedItemKeys = new Set(
      itemKeys
        .map(itemKey => normalizeItemKey(itemKey))
        .filter((itemKey): itemKey is string => Boolean(itemKey)),
    );
    if (!removedItemKeys.size) {
      return;
    }

    this.pendingSourceEntries = this.pendingSourceEntries.filter(
      entry => !removedItemKeys.has(normalizeItemKey(entry.itemKey) ?? ""),
    );
    if (this.pendingSourceEntries.length === 0) {
      this.replaceItemKeys = null;
    }
    this.schedulePendingSourceSyncView();
  }

  private removePendingSourceFilesInFolder(folderPath: string): boolean {
    const previousCount = this.pendingSourceEntries.length;
    this.pendingSourceEntries = this.pendingSourceEntries.filter(
      entry => !isExplorerPathInFolder(entry.relativePath, folderPath),
    );
    if (this.pendingSourceEntries.length === 0) {
      this.replaceItemKeys = null;
    }
    return previousCount !== this.pendingSourceEntries.length;
  }

  private clearPendingSourceFiles(): void {
    if (!this.pendingSourceEntries.length && !this.replaceItemKeys?.length) {
      return;
    }

    this.pendingSourceEntries = [];
    this.replaceItemKeys = null;
    this.schedulePendingSourceSyncView();
  }

  private finishPendingSourceReplace(): void {
    if (!this.replaceItemKeys?.length) {
      return;
    }

    this.replaceItemKeys = null;
    this.schedulePendingSourceSyncView();
  }

  private schedulePendingSourceSyncView(): void {
    if (this.disposed) {
      return;
    }

    this.explorerService.setPendingSourceFiles(
      this.pendingSourceEntries.some(entry => entry.sourceStatus !== "failed"),
    );

    if (this.cancelPendingSourceSyncView) {
      return;
    }

    const run = (): void => {
      this.cancelPendingSourceSyncView = null;
      this.syncView();
    };

    if (typeof globalThis.requestAnimationFrame === "function") {
      const handle = globalThis.requestAnimationFrame(run);
      this.cancelPendingSourceSyncView = () => {
        globalThis.cancelAnimationFrame(handle);
      };
      return;
    }

    const handle = globalThis.setTimeout(run, 0);
    this.cancelPendingSourceSyncView = () => {
      globalThis.clearTimeout(handle);
    };
  }

  private openFileDialog(): void {
    this.syncView();
    this.sourceWorkflow.openFolderDialog();
  }

  private showMoreActions(anchor: HTMLElement): void {
    const canCloseFolder = this.files.length > 0;
    const isChartMode = this.paneInput.mode === "chart";
    const isThumbnailView = isChartMode && this.viewLayout === "thumbnail";
    this.contextMenuService.showContextMenu({
      autoSelectFirstItem: true,
      getAnchor: () => anchor,
      getActions: () => [
        createMenuAction({
          checked: isThumbnailView,
          enabled: isChartMode,
          id: TOGGLE_THUMBNAIL_VIEW_ACTION_ID,
          label: localize("files.thumbnailView", "Thumbnail"),
          run: () => {
            void this.commandService.executeCommand(TOGGLE_THUMBNAIL_VIEW_ACTION_ID);
          },
        }),
        createMenuAction({
          icon: LxIcon.add,
          id: ADD_FOLDER_ACTION_ID,
          label: localize("files.addFolder", "Add Folder"),
          run: () => {
            void this.commandService.executeCommand(ADD_FOLDER_ACTION_ID);
          },
        }),
        createMenuAction({
          enabled: canCloseFolder,
          icon: LxIcon.remove,
          id: CLOSE_FOLDER_ACTION_ID,
          label: localize("files.closeFolder", "Close Folder"),
          run: () => {
            void this.commandService.executeCommand(CLOSE_FOLDER_ACTION_ID);
          },
        }),
      ],
    });
  }

  private readonly handleDraggingChange = (isDragging: boolean): void => {
    if (this.isDragging === isDragging) {
      return;
    }

    this.isDragging = isDragging;
    this.syncView();
  };

  private readonly handleDropFiles = (dataTransfer: DataTransfer | null): void => {
    this.sourceWorkflow.importDroppedFiles(dataTransfer);
  };

  private readonly handleOpenFolderDialog = (): void => {
    this.openFileDialog();
  };

  private readonly handleSelectFile = (
    fileId: string | null,
    itemKey: string | null = null,
  ): void => {
    const selectedFileId = this.selectFile(fileId, "force", itemKey);
    this.publishExplorerPaneInput();
    this.openSelectedTableFile(selectedFileId, itemKey);
    this.syncView();
  };

  private readonly handleCloseFile = (fileId: string | null): void => {
    const normalizedFileId = normalizeFileId(fileId);
    if (!normalizedFileId) {
      return;
    }

    this.sourceWorkflow.rememberRemovedFiles([normalizedFileId]);
    this.notifyExplorerFilesRemoved([normalizedFileId]);
    this.removeFiles([normalizedFileId]);
    this.syncView();
  };

  private readonly handleDeleteFile = async (fileId: string | null): Promise<void> => {
    const normalizedFileId = normalizeFileId(fileId);
    if (!normalizedFileId) {
      return;
    }

    const file = this.files.find(entry => entry.fileId === normalizedFileId);
    const deletePath = getExplorerFileDeletePath(file);
    if (!file || !deletePath) {
      this.notificationService.error(localize(
        "files.item.deleteUnavailable",
        "This file does not have a local path that can be deleted.",
      ));
      return;
    }

    const trashName = getSystemTrashName();
    const { confirmed } = await this.dialogService.confirm({
      cancelButton: localize("files.item.delete.cancel", "Cancel"),
      detail: localize(
        "files.item.delete.confirmDetail",
        "You can restore this file from the {trashName}.",
        { trashName },
      ),
      message: localize(
        "files.item.delete.confirmMessage",
        "Move '{fileName}' to the {trashName}?",
        { fileName: file.fileName || file.relativePath || normalizedFileId, trashName },
      ),
      primaryButton: localize(
        "files.item.delete.moveToTrash",
        "Move to {trashName}",
        { trashName },
      ),
      type: "warning",
    });
    if (!confirmed) {
      return;
    }

    try {
      await this.filesService.moveFileToTrash(URI.file(deletePath));
    } catch (error) {
      this.notificationService.error(localize(
        "files.item.deleteFailed",
        "Failed to move '{fileName}' to the {trashName}: {error}",
        {
          error: getErrorMessage(error),
          fileName: file.fileName || file.relativePath || normalizedFileId,
          trashName,
        },
      ));
      return;
    }

    this.sourceWorkflow.rememberRemovedFiles([normalizedFileId]);
    this.notifyExplorerFilesRemoved([normalizedFileId]);
    this.removeFiles([normalizedFileId]);
    this.syncView();
  };

  private readonly handleRemoveFolder = (folderKey: string): void => {
    const folderPath = getExplorerFolderPath(folderKey);
    if (!folderPath) {
      return;
    }

    const removedFileIds = new Set(
      this.files
        .filter((entry) => isExplorerPathInFolder(entry.relativePath, folderPath))
        .map((entry) => entry.fileId)
        .filter((fileId): fileId is string => typeof fileId === "string"),
    );
    const removedPendingSources = this.removePendingSourceFilesInFolder(folderPath);
    if (removedFileIds.size === 0 && !removedPendingSources) {
      return;
    }

    const fileIds = [...removedFileIds];
    if (fileIds.length > 0) {
      this.sourceWorkflow.rememberRemovedFiles(fileIds);
      this.notifyExplorerFilesRemoved(fileIds);
      this.removeFiles(fileIds);
    }

    this.syncView();
  };

  public closeFolder(): void {
    this.sourceWorkflow.closeImportedSources();
    this.isDragging = false;

    const fileIds = uniqueFileIds(this.fileIds);
    this.removeFiles(fileIds);
    this.clearExplorerSelections();
    this.syncView();
  }

  private readonly handleFolderExpansionChange = (expandedFolderKeys: readonly string[]): void => {
    if (!areStringArraysEqual(this.explorerService.expandedFolderKeys, expandedFolderKeys)) {
      this.pendingLocalExpandedFolderKeys = [...expandedFolderKeys];
    }
    this.explorerService.setExpandedFolderKeys(expandedFolderKeys);
    if (this.pendingLocalExpandedFolderKeys && areStringArraysEqual(
      this.pendingLocalExpandedFolderKeys,
      expandedFolderKeys,
    )) {
      this.pendingLocalExpandedFolderKeys = null;
    }
  };

  private readonly handleFolderKeysChange = (folderKeys: readonly string[]): readonly string[] => {
    return this.explorerService.reconcileExpandedFolderKeys(folderKeys);
  };

  private readonly handleVisibleFileIdsChange = (
    visibleFileIds: readonly string[],
    nearbyFileIds: readonly string[],
  ): void => {
    this.explorerService.setVisibleFileIds(visibleFileIds, nearbyFileIds);
  };

  private consumeLocalExpandedFolderKeys(expandedFolderKeys: readonly string[]): boolean {
    if (!this.pendingLocalExpandedFolderKeys) {
      return false;
    }

    const isLocalChange = areStringArraysEqual(
      this.pendingLocalExpandedFolderKeys,
      expandedFolderKeys,
    );
    this.pendingLocalExpandedFolderKeys = null;
    return isLocalChange;
  }

  private notifyExplorerFilesRemoved(fileIds: readonly string[]): void {
    const currentFileId = this.paneInput.selectionKind === "chart"
      ? this.explorerService.selectedProcessedFileId
      : this.explorerService.selectedRawFileId;
    if (!currentFileId || !fileIds.includes(currentFileId)) {
      return;
    }

    const remainingFileIds = this.fileIds.filter(fileId => !fileIds.includes(fileId));
    this.explorerService.select({
      candidateFileIds: remainingFileIds,
      fileId: resolveExplorerSelectedFileId(null, remainingFileIds),
      kind: this.paneInput.selectionKind,
    }, "force");
  }

  private readonly loadTemplates = (): void => {
    this.userTemplateService.refreshTemplates()
      .then(() => {
        if (!this.disposed) {
          this.syncView();
        }
      })
      .catch((error) => {
        if (this.disposed) {
          return;
        }

        console.error("Failed to load templates for file context menu.", error);
        this.syncView();
      });
  };

  private createTemplateRecords() {
    return this.userTemplateService.getSnapshot().templates
      .map(createTemplateEditorRecordFromUserTemplate);
  }

  private removeFiles(fileIds: readonly string[]): void {
    const normalizedFileIds = getNormalizedFileIds(fileIds);
    if (!normalizedFileIds.length) {
      return;
    }

    this.hideExplorerFiles(normalizedFileIds);
    this.selectRawFileAfterRemoval(normalizedFileIds);
  }

  private hideExplorerFiles(fileIds: readonly string[]): void {
    const removedFileIds = new Set(fileIds);
    for (const fileId of removedFileIds) {
      this.locallyRemovedFileIds.add(fileId);
      this.locallyRenamedFileNames.delete(fileId);
    }

    this.internalFiles = this.internalFiles.filter((entry) => !removedFileIds.has(entry.fileId ?? ""));
    this.mergedFilesCache = null;
    this.publishExplorerPaneInput();
  }

  private renameExplorerFile(fileId: string, fileName: string): void {
    this.locallyRenamedFileNames.set(fileId, fileName);
    this.internalFiles = this.internalFiles.map(entry =>
      entry.fileId === fileId
        ? { ...entry, fileName }
        : entry);
    this.mergedFilesCache = null;
    this.publishExplorerPaneInput();
  }

  private restoreExplorerFiles(fileIds: readonly string[]): void {
    let changed = false;
    for (const fileId of getNormalizedFileIds(fileIds)) {
      changed = this.locallyRemovedFileIds.delete(fileId) || changed;
    }
    if (changed) {
      this.mergedFilesCache = null;
    }
  }

  private replaceImportedFiles(
    fileEntries: PreparedFileImportEntry[],
    importedFiles: PreparedFileImportInfo[],
    selectedFileId: string | null = importedFiles[0]?.fileId ?? null,
  ): void {
    const localEntries = createLocalExplorerImportEntries(fileEntries, importedFiles);
    assertSupportedExplorerImportEntries(localEntries, importedFiles);
    const previousFileIds = this.fileIds;
    const nextFileIds = new Set(
      localEntries
        .map(entry => normalizeFileId(entry.fileId))
        .filter((fileId): fileId is string => Boolean(fileId)),
    );
    this.locallyRemovedFileIds.clear();
    for (const fileId of previousFileIds) {
      if (!nextFileIds.has(fileId)) {
        this.locallyRemovedFileIds.add(fileId);
      }
    }
    this.locallyRenamedFileNames.clear();
    this.internalFiles = localEntries;
    this.mergedFilesCache = null;
    this.publishExplorerPaneInput();

    this.removePendingSourceFiles(getImportItemKeys(importedFiles));
    const selectedEntry = resolveSelectedExplorerImportEntry(localEntries, selectedFileId);
    if (!selectedEntry) {
      this.syncView();
      return;
    }

    this.selectFile(selectedEntry.fileId ?? null, "force", selectedEntry.itemKey ?? null);
    this.publishExplorerPaneInput();
    this.openExplorerTableFile(selectedEntry);
    this.navigateToTableAfterImport();
    this.syncView();
  }

  private appendImportedFiles(
    fileEntries: PreparedFileImportEntry[],
    importedFiles: PreparedFileImportInfo[],
  ): void {
    if (importedFiles.length === 0) {
      return;
    }

    const localEntries = createLocalExplorerImportEntries(fileEntries, importedFiles);
    assertSupportedExplorerImportEntries(localEntries, importedFiles);
    const importedEntries = filterNewExplorerImportEntries(localEntries, this.committedFiles);
    this.removePendingSourceFiles(getImportItemKeys(importedFiles));
    if (!importedEntries.length) {
      this.syncView();
      return;
    }

    this.restoreExplorerFiles(importedEntries.map(file => file.fileId ?? ""));
    this.internalFiles = mergeExplorerCommittedFiles(this.internalFiles, importedEntries);
    this.mergedFilesCache = null;
    this.publishExplorerPaneInput();

    const currentSelectedFileId = normalizeFileId(this.explorerService.selectedRawFileId);
    const currentSelectedEntry = currentSelectedFileId
      ? findExplorerFileEntry(this.files, currentSelectedFileId, this.explorerService.selectedRawItemKey)
      : null;
    if (!currentSelectedEntry) {
      const selectedEntry = importedEntries[0] ?? null;
      this.selectFile(selectedEntry?.fileId ?? null, "force", selectedEntry?.itemKey ?? null);
      this.publishExplorerPaneInput();
      this.openExplorerTableFile(selectedEntry);
    }
    this.navigateToTableAfterImport();
    this.syncView();
  }

  private appendPreparedImportFiles(preparedFiles: readonly PreparedFileImport[]): void {
    this.appendImportedFiles(
      preparedFiles.map(prepared => prepared.fileEntry),
      preparedFiles.map(prepared => prepared.fileInfo),
    );
  }

  private replacePreparedImportFiles(
    preparedFiles: readonly PreparedFileImport[],
    selectedFileId: string | null,
  ): void {
    this.replaceImportedFiles(
      preparedFiles.map(prepared => prepared.fileEntry),
      preparedFiles.map(prepared => prepared.fileInfo),
      selectedFileId,
    );
  }

  private removeImportedFilesFromExplorer(fileIds: readonly string[]): void {
    this.notifyExplorerFilesRemoved(fileIds);
    this.removeFiles(fileIds);
    this.syncView();
  }

  private getSelectedRelativePath(): string | null {
    const selectedFileId = this.selectedFileId;
    if (!selectedFileId) {
      return null;
    }

    const selectedFile = this.files.find(file => file.fileId === selectedFileId);
    return normalizeRelativePath(selectedFile?.relativePath);
  }

  private selectFile(
    fileId: string | null,
    reveal?: "force",
    itemKey: string | null = null,
  ): string | null {
    return this.explorerService.select({
      candidateFileIds: this.fileIds,
      candidateItemKeys: this.itemKeys,
      fileId: normalizeFileId(fileId),
      kind: this.paneInput.selectionKind,
      itemKey: normalizeItemKey(itemKey),
    }, reveal);
  }

  private publishExplorerPaneInput(): void {
    const input = this.paneInput;
    const selectedFileId = input.selectionKind === "chart"
      ? this.explorerService.selectedProcessedFileId
      : this.explorerService.selectedRawFileId;
    const selectedItemKey = input.selectionKind === "chart"
      ? this.explorerService.selectedProcessedItemKey
      : this.explorerService.selectedRawItemKey;
    this.explorerService.updatePaneInput({
      ...input,
      files: this.committedFiles,
      selectedFileId,
      selectedItemKey,
    });
  }

  private openSelectedTableFile(
    fileId: string | null,
    itemKey: string | null,
  ): void {
    if (this.paneInput.selectionKind !== "table") {
      return;
    }

    this.openExplorerTableFile(findExplorerFileEntry(this.files, fileId, itemKey));
  }

  private openExplorerTableFile(file: ExplorerFileEntry | null | undefined): void {
    if (this.paneInput.selectionKind !== "table") {
      return;
    }

    const source = createTableSourceFromExplorerFile(file);
    if (source) {
      this.tableService.open(source);
    }
  }

  private selectRawFileAfterRemoval(fileIds: readonly string[]): void {
    const removedFileIds = getNormalizedFileIds(fileIds);
    if (!removedFileIds.length) {
      return;
    }

    const removedFileIdSet = new Set(removedFileIds);
    const remainingFileIds = this.fileIds
      .filter(fileId => !removedFileIdSet.has(fileId));
    const nextSelectedFileId = resolveExplorerSelectionAfterRemoval({
      currentFileId: this.explorerService.selectedRawFileId,
      remainingFileIds,
      removedFileIds,
    });
    this.explorerService.select({
      candidateFileIds: remainingFileIds,
      candidateItemKeys: this.itemKeys,
      fileId: nextSelectedFileId,
      kind: "table",
    }, "force");
    this.publishExplorerPaneInput();
    this.openSelectedTableFile(nextSelectedFileId, null);
  }

  private clearExplorerSelections(): void {
    this.explorerService.select({
      candidateFileIds: [],
      fileId: null,
      kind: "table",
    }, "force");
    this.explorerService.select({
      candidateFileIds: [],
      fileId: null,
      kind: "chart",
    }, "force");
  }

  private navigateToTableAfterImport(): void {
    if (this.layoutService.activeWorkbenchMainPart === "chart") {
      this.layoutService.navigateToView("table");
    }
  }
}

function createPendingSourceEntry({
  message,
  pendingFile,
  status,
}: {
  readonly message: string | null;
  readonly pendingFile: PendingImportFile;
  readonly status: ExplorerFileEntry["sourceStatus"];
}): ExplorerFileEntry {
  const relativePath = normalizeRelativePath(pendingFile.relativePath);
  return {
    fileName: pendingFile.sourceName,
    itemKey: pendingFile.itemKey,
    relativePath,
    sourcePath: getPendingSourcePath(pendingFile),
    sourceStatus: status,
    sourceStatusMessage: message,
  };
}

function getPendingSourcePath(pendingFile: PendingImportFile): string | null {
  if (!pendingFile.canUseNativePath) {
    return null;
  }

  const fsPath = String(pendingFile.resource?.fsPath ?? "").trim();
  return fsPath || null;
}

function getImportItemKeys(
  importedFiles: readonly PreparedFileImportInfo[],
): readonly string[] {
  return importedFiles
    .map(file => file.itemKey)
    .filter((itemKey): itemKey is string => typeof itemKey === "string");
}

function createLocalExplorerImportEntries(
  fileEntries: readonly PreparedFileImportEntry[],
  importedFiles: readonly PreparedFileImportInfo[],
): ExplorerFileEntry[] {
  const result: ExplorerFileEntry[] = [];
  const count = Math.max(fileEntries.length, importedFiles.length);
  for (let index = 0; index < count; index += 1) {
    const importedFile = importedFiles[index];
    if (!importedFile) {
      continue;
    }

    result.push(...createLocalExplorerImportEntriesForFile(
      fileEntries[index],
      importedFile,
    ));
  }
  return result;
}

function createLocalExplorerImportEntriesForFile(
  fileEntry: PreparedFileImportEntry | undefined,
  importedFile: PreparedFileImportInfo,
): ExplorerFileEntry[] {
  return [createLocalExplorerImportEntry(fileEntry, importedFile)];
}

function createLocalExplorerImportEntry(
  fileEntry: PreparedFileImportEntry | undefined,
  importedFile: PreparedFileImportInfo,
): ExplorerFileEntry {
  const normalizedCsvPath =
    normalizePathValue(fileEntry?.normalizedCsvPath) ??
    normalizePathValue(importedFile.normalizedCsvPath);
  const sourcePath = normalizePathValue(fileEntry?.sourcePath) ??
    normalizePathValue(importedFile.sourcePath);
  const itemKey = normalizeItemKey(fileEntry?.itemKey) ??
    normalizeItemKey(importedFile.itemKey) ??
    normalizeFileId(importedFile.fileId) ?? "";

  return {
    file: fileEntry?.file ?? importedFile.file,
    fileId: importedFile.fileId,
    fileName: importedFile.fileName,
    itemKey,
    localImport: true,
    normalizedCsvPath,
    relativePath: fileEntry?.relativePath ?? importedFile.relativePath ?? null,
    resource: fileEntry?.resource ?? importedFile.resource ?? null,
    sourcePath,
  };
}

function filterNewExplorerImportEntries(
  entries: readonly ExplorerFileEntry[],
  currentFiles: readonly ExplorerFileEntry[],
): ExplorerFileEntry[] {
  const seen = new Set(currentFiles.map(getExplorerFileEntryKey));
  const result: ExplorerFileEntry[] = [];
  for (const entry of entries) {
    const key = getExplorerFileEntryKey(entry);
    if (!key || seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(entry);
  }
  return result;
}

function mergeExplorerCommittedFiles(
  baseFiles: readonly ExplorerFileEntry[],
  localFiles: readonly ExplorerFileEntry[],
): ExplorerFileEntry[] {
  if (!baseFiles.length) {
    return [...localFiles];
  }
  if (!localFiles.length) {
    return [...baseFiles];
  }

  const result = [...baseFiles];
  const indexesByKey = new Map<string, number>();
  for (let index = 0; index < result.length; index += 1) {
    const key = getExplorerFileEntryKey(result[index]);
    if (key) {
      indexesByKey.set(key, index);
    }
  }

  for (const file of localFiles) {
    const key = getExplorerFileEntryKey(file);
    const index = key ? indexesByKey.get(key) : undefined;
    if (index === undefined) {
      if (key) {
        indexesByKey.set(key, result.length);
      }
      result.push(file);
      continue;
    }

    result[index] = file;
  }
  return result;
}

function resolveSelectedExplorerImportEntry(
  entries: readonly ExplorerFileEntry[],
  selectedFileId: string | null,
): ExplorerFileEntry | null {
  const normalizedFileId = normalizeFileId(selectedFileId);
  return normalizedFileId
    ? entries.find(entry => normalizeFileId(entry.fileId) === normalizedFileId) ?? entries[0] ?? null
    : entries[0] ?? null;
}

function findExplorerFileEntry(
  files: readonly ExplorerFileEntry[],
  fileId: string | null | undefined,
  itemKey: string | null | undefined,
): ExplorerFileEntry | null {
  const normalizedFileId = normalizeFileId(fileId);
  if (!normalizedFileId) {
    return null;
  }

  const normalizedItemKey = normalizeItemKey(itemKey);
  if (normalizedItemKey) {
    const sourceMatch = files.find(file =>
      normalizeFileId(file.fileId) === normalizedFileId &&
      normalizeItemKey(file.itemKey) === normalizedItemKey);
    if (sourceMatch) {
      return sourceMatch;
    }
  }

  return files.find(file => normalizeFileId(file.fileId) === normalizedFileId) ?? null;
}

function createTableSourceFromExplorerFile(
  file: ExplorerFileEntry | null | undefined,
): TableSource | null {
  const resource = getExplorerFileTableResource(file);
  if (!resource) {
    return null;
  }

  const tablePath = getExplorerFileTablePath(file);
  const normalizedCsvPath = normalizePathValue(file?.normalizedCsvPath);
  const sheetId = tablePath !== normalizedCsvPath && tableFormatService.isExcel(resource)
    ? normalizeItemKey(file?.sheetId)
    : null;
  return {
    resource,
    ...(sheetId ? { sheetId } : {}),
  };
}

function getExplorerFileTableResource(file: ExplorerFileEntry | null | undefined): URI | null {
  const resource = file?.resource ? URI.revive(file.resource) : null;
  if (resource) {
    return resource;
  }

  const path = getExplorerFileTablePath(file);
  return path ? URI.file(path) : null;
}

function getExplorerFileTablePath(file: ExplorerFileEntry | null | undefined): string | null {
  return normalizePathValue(file?.normalizedCsvPath) ??
    normalizePathValue(file?.sourcePath);
}

function assertSupportedExplorerImportEntries(
  entries: readonly ExplorerFileEntry[],
  importedFiles: readonly PreparedFileImportInfo[],
): void {
  const entryPaths = new Map(
    entries
      .map(entry => [normalizeFileId(entry.fileId), getExplorerFileTablePath(entry)] as const)
      .filter((entry): entry is readonly [string, string] => Boolean(entry[0] && entry[1])),
  );
  for (const file of importedFiles) {
    const candidates = [
      ...getImportedTableFileNameCandidates(file),
      entryPaths.get(normalizeFileId(file.fileId) ?? "") ?? "",
    ];
    if (!candidates.some(candidate => tableFormatService.canHandle(candidate))) {
      throw new Error(`Unsupported table file: ${candidates[0] || "Unknown file"}`);
    }
  }
}

function getImportedTableFileNameCandidates(
  file: PreparedFileImportInfo,
): readonly string[] {
  return [
    file.fileName,
    file.sourcePath,
    file.resource?.path,
    file.fileId,
  ]
    .map(value => String(value ?? "").trim())
    .filter((value): value is string => Boolean(value));
}

function getExplorerFileEntryKey(file: ExplorerFileEntry | undefined): string {
  const itemKey = normalizeItemKey(file?.itemKey);
  if (itemKey) {
    return `item:${itemKey}`;
  }

  const fileId = normalizeFileId(file?.fileId);
  if (fileId) {
    return `file:${fileId}`;
  }
  return "";
}

function normalizePathValue(value: unknown): string | null {
  const path = String(value ?? "").trim();
  return path || null;
}

const EMPTY_EXPLORER_PANE_INPUT: ExplorerPaneInput = {
  files: [],
  mode: "table",
  selectedFileId: null,
  selectedItemKey: null,
  selectionKind: "table",
  thumbnailFiles: [],
};

function getActionAnchor(event: unknown): HTMLElement {
  if (
    event instanceof MouseEvent &&
    event.currentTarget instanceof HTMLElement
  ) {
    return event.currentTarget;
  }
  return document.body;
}

function normalizeRelativePath(value: unknown): string | null {
  const relativePath = String(value ?? "").trim();
  return relativePath || null;
}

function getExplorerFileDeletePath(file: ExplorerFileEntry | undefined): string | null {
  const sourcePath = String(file?.sourcePath ?? "").trim();
  if (sourcePath) {
    return sourcePath;
  }

  const normalizedCsvPath = String(file?.normalizedCsvPath ?? "").trim();
  return normalizedCsvPath || null;
}

function getSystemTrashName(): string {
  return isWindows
    ? localize("files.item.recycleBin", "Recycle Bin")
    : localize("files.item.trash", "Trash");
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : String(error ?? localize("files.item.deleteUnknownError", "Unknown error"));
}

function normalizeFileId(value: unknown): string | null {
  const fileId = String(value ?? "").trim();
  return fileId || null;
}

function normalizeItemKey(value: unknown): string | null {
  const itemKey = String(value ?? "").trim();
  return itemKey || null;
}

function applyLocalExplorerFileOverrides(
  files: readonly ExplorerFileEntry[],
  removedFileIds: ReadonlySet<string>,
  renamedFileNames: ReadonlyMap<string, string>,
): ExplorerFileEntry[] {
  if (removedFileIds.size === 0 && renamedFileNames.size === 0) {
    return files as ExplorerFileEntry[];
  }

  const result: ExplorerFileEntry[] = [];
  for (const file of files) {
    const fileId = normalizeFileId(file.fileId);
    if (fileId && removedFileIds.has(fileId)) {
      continue;
    }

    const fileName = fileId ? renamedFileNames.get(fileId) : undefined;
    result.push(fileName ? { ...file, fileName } : file);
  }

  return result;
}

function getNormalizedFileIds(values: readonly string[]): readonly string[] {
  return uniqueFileIds(
    values
      .map(value => normalizeFileId(value))
      .filter((fileId): fileId is string => Boolean(fileId)),
  );
}

function uniqueFileIds(values: readonly string[]): readonly string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const fileId = normalizeFileId(value);
    if (!fileId || seen.has(fileId)) {
      continue;
    }

    seen.add(fileId);
    result.push(fileId);
  }

  return result;
}

function areStringArraysEqual(
  first: readonly string[],
  second: readonly string[],
): boolean {
  if (first.length !== second.length) {
    return false;
  }

  for (let index = 0; index < first.length; index += 1) {
    if (first[index] !== second[index]) {
      return false;
    }
  }

  return true;
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
