/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { localize } from "src/cs/nls";
import { URI } from "src/cs/base/common/uri";
import { createMenuAction } from "src/cs/base/browser/ui/menu/menu";
import type { ListHandle } from "src/cs/base/browser/ui/list/listWidget";
import { toAction } from "src/cs/base/common/actions";
import { LxIcon } from "src/cs/base/common/lxicon";
import { isWindows } from "src/cs/base/common/platform";
import { ICommandService } from "src/cs/platform/commands/common/commands";
import { IContextMenuService } from "src/cs/platform/contextview/browser/contextView";
import { IDialogService } from "src/cs/platform/dialogs/common/dialogs";
import { IFileService } from "src/cs/platform/files/common/files";
import { IInstantiationService } from "src/cs/platform/instantiation/common/instantiation";
import { IUriIdentityService } from "src/cs/platform/uriIdentity/common/uriIdentity";
import { IWorkspaceContextService } from "src/cs/platform/workspace/common/workspace";
import type { WorkbenchSidebarAction } from "src/cs/workbench/browser/parts/sidebar/sidebarPart";
import { ViewPane } from "src/cs/workbench/browser/parts/views/viewPane";
import { ViewContainerLocation } from "src/cs/workbench/common/views";
import { IViewsService } from "src/cs/workbench/services/views/common/viewsService";
import {
  FileSourceWorkflow,
  getFolderImportSupportForFileService,
  type PendingImportFile,
  type PendingImportSourceStatusChange,
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
  type ExplorerPaneMode,
} from "src/cs/workbench/contrib/files/browser/files";
import { TableViewContainerId } from "src/cs/workbench/contrib/table/common/table";
import { ChartViewContainerId } from "src/cs/workbench/services/chart/common/chart";
import {
  getExplorerFileResourceIdentity,
  getExplorerFolderPath,
  getExplorerResourceIdentityKey,
  getExplorerFileSourceIdentityKey,
  isExplorerPathInFolder,
  mergeExplorerSourceEntries,
  type ExplorerFileEntry,
  type ExplorerResourceIdentity,
} from "src/cs/workbench/contrib/files/common/explorerModel";
import { TOGGLE_THUMBNAIL_VIEW_ACTION_ID } from "src/cs/workbench/contrib/thumbnail/common/thumbnail";
import { createTemplateEditorRecordFromUserTemplate } from "src/cs/workbench/contrib/template/browser/templateUserTemplateAdapter";
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
import {
  ISliceService,
  type SliceFileState,
} from "src/cs/workbench/services/slice/common/slice";

import "src/cs/workbench/contrib/files/browser/views/media/explorerViewlet.css";

export type ExplorerViewPaneSurfaceOptions = {
  readonly className: string;
  readonly id: string;
  readonly title: string;
  readonly viewLayout: FilesViewLayout;
};

const ExplorerViewPaneSurface: ExplorerViewPaneSurfaceOptions = {
  className: "files-view-pane",
  id: ExplorerViewId,
  title: localize("files.explorerSection", "Explorer"),
  viewLayout: "tree",
};

export abstract class BaseExplorerViewPane extends ViewPane {
  private readonly root: HTMLDivElement;
  private readonly content: HTMLDivElement;
  private readonly explorerHost: HTMLDivElement;
  private readonly listRef: { current: ListHandle | null } = { current: null };
  private readonly sourceWorkflow: FileSourceWorkflow;
  private readonly surfaceViewLayout: FilesViewLayout;
  private explorerView: ExplorerView | null = null;
  private input: ExplorerPaneInput | null = null;
  private pendingSourceEntries: ExplorerFileEntry[] = [];
  private replaceItemKeys: string[] | null = null;
  private deferTableOpenUntilSourceReplace = false;
  private deferredSourceReplaceOpenTarget: ExplorerResourceIdentity | null = null;
  private isDragging = false;
  private disposed = false;
  private pendingLocalExpandedFolderKeys: readonly string[] | null = null;
  private cancelPendingSourceSyncView: (() => void) | null = null;
  private reviewedExplorerResourceSignature = "";

  protected constructor(
    options: ExplorerViewPaneSurfaceOptions,
    @ICommandService private readonly commandService: ICommandService,
    @IContextMenuService private readonly contextMenuService: IContextMenuService,
    @IDialogService private readonly dialogService: IDialogService,
    @IExplorerService private readonly explorerService: IExplorerService,
    @IFileService private readonly filesService: IFileService,
    @IInstantiationService private readonly instantiationService: IInstantiationService,
    @IAppearanceService private readonly appearanceService: IAppearanceService,
    @IViewsService private readonly viewsService: IViewsService,
    @INotificationService private readonly notificationService: INotificationService,
    @ITableService private readonly tableService: ITableService,
    @ISliceService private readonly sliceService: ISliceService,
    @IThumbnailPreviewService private readonly thumbnailPreviewService: IThumbnailPreviewService,
    @IThumbnailService private readonly thumbnailService: IThumbnailService,
    @IUserTemplateService private readonly userTemplateService: IUserTemplateServiceType,
    @IReviewService private readonly reviewService: IReviewServiceType,
    @IUriIdentityService private readonly uriIdentityService: IUriIdentityService,
    @IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
  ) {
    super({
      id: options.id,
      title: options.title,
      className: options.className,
      bodyClassName: "workbench-part-view-pane__body",
    });
    this.surfaceViewLayout = options.viewLayout;

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
      onWillOpenFolder: folder => this.workspaceContextService.openFolder(folder),
      uriIdentityService: this.uriIdentityService,
      onAppendExplorerFiles: entries => this.appendExplorerFiles(entries),
      onAppendPendingSourceFiles: pendingFiles => this.appendPendingSourceFiles(pendingFiles),
      onClearPendingSourceFiles: () => this.clearPendingSourceFiles(),
      onDraggingChange: isDragging => {
        this.isDragging = isDragging;
      },
      onRemoveSourceItems: itemKeys => this.removeImportedSourceItemsFromExplorer(itemKeys),
      onReplaceExplorerFiles: (entries, selectedImportItemKey) => {
        this.replaceExplorerFiles(entries, selectedImportItemKey);
      },
      onReplacePendingSourceFiles: pendingFiles => this.replacePendingSourceFiles(pendingFiles),
      onFinishPendingSourceReplace: () => this.finishPendingSourceReplace(),
      onUpdatePendingSourceFile: (pendingFile, change) => {
        this.updatePendingSourceFile(pendingFile, change);
      },
      syncView: () => this.syncView(),
    });
    this._register(this.explorerService.onDidChangePaneInput(() => {
      this.update(this.explorerService.getPaneInput());
    }));
    this._register(this.explorerService.onDidChangeFiles(() => {
      this.update(this.input);
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
    this._register(this.sliceService.onDidChangeResourceSliceResult(() => {
      this.syncView();
    }));
    this._register(this.sliceService.onDidChangeSliceState(() => {
      this.syncView();
    }));

    this.update(this.explorerService.getPaneInput());
    this.loadTemplates();
  }

  public update(input: ExplorerPaneInput | null): void {
    this.input = input;
    this.reviewCurrentExplorerEntries();

    if (!this.explorerView) {
      this.explorerView = this.instantiationService.createInstance(
        ExplorerView,
        this.explorerHost,
        this.createExplorerViewProps(),
      );
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

  public closeFile(target: ExplorerResourceIdentity): void {
    const file = this.resolveExplorerFileTarget(target);
    if (!file) {
      return;
    }

    this.handleCloseFile(file);
  }

  public deleteFile(target: ExplorerResourceIdentity): Promise<void> {
    const file = this.resolveExplorerFileTarget(target);
    if (!file) {
      return Promise.resolve();
    }

    return this.handleDeleteFile(file);
  }

  private resolveExplorerFileTarget(target: ExplorerResourceIdentity): ExplorerFileEntry | null {
    const resourceIdentity = normalizeExplorerResourceIdentity(target);
    return resourceIdentity
      ? findExplorerFileEntryByResource(this.committedFiles, resourceIdentity)
      : null;
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

  private get visibleEntries(): ExplorerFileEntry[] {
    const renderFiles = this.createExplorerRenderEntries(this.committedFiles);
    const visibleFiles = this.shouldFilterChartThumbnailFiles()
      ? renderFiles.filter(isChartThumbnailVisibleFile)
      : renderFiles;
    if (!this.pendingSourceEntries.length && !this.replaceItemKeys?.length) {
      return visibleFiles;
    }

    return mergeExplorerSourceEntries({
      files: visibleFiles,
      pendingSourceEntries: this.pendingSourceEntries,
      replaceItemKeys: this.replaceItemKeys,
    });
  }

  private get committedFiles(): readonly ExplorerFileEntry[] {
    return this.explorerService.files;
  }

  private get fileIds(): readonly string[] {
    return this.committedFiles
      .map(file => normalizeFileId(file.fileId))
      .filter((fileId): fileId is string => Boolean(fileId));
  }

  private get selectedResource(): URI | null {
    return this.paneInput.selectedResource;
  }

  private get selectedSheetId(): string | null {
    return this.paneInput.selectedSheetId ?? null;
  }

  private get viewLayout(): FilesViewLayout {
    return this.surfaceViewLayout;
  }

  private shouldFilterChartThumbnailFiles(): boolean {
    return this.paneInput.selectionKind === "chart" && this.viewLayout === "thumbnail";
  }

  private createExplorerRenderEntries(
    files: readonly ExplorerFileEntry[],
  ): ExplorerFileEntry[] {
    if (this.paneInput.selectionKind !== "chart") {
      return [...files];
    }

    return files.map(file => this.createExplorerChartRenderEntry(file));
  }

  private createExplorerChartRenderEntry(file: ExplorerFileEntry): ExplorerFileEntry {
    const target = getExplorerFileResourceIdentity(file);
    if (!target) {
      return file;
    }

    const hasChartData = Boolean(this.sliceService.getResourceResult(target.resource, target.sheetId));
    const state = resolveExplorerChartFileState(
      this.sliceService.getResourceState(target.resource, target.sheetId),
    );
    return {
      ...file,
      chartMessage: getExplorerChartStateMessage(state),
      chartState: resolveExplorerChartState(state, hasChartData),
      hasChartData,
    };
  }

  private createExplorerViewProps(): ExplorerViewProps {
    const input = this.paneInput;
    const files = this.visibleEntries;
    return {
      selectedResource: this.selectedResource,
      selectedSheetId: this.selectedSheetId,
      expandedFolderKeys: this.explorerService.expandedFolderKeys,
      explorerAppearance: this.appearanceService.getAppearance().explorer,
      activePlotType: input.activePlotType,
      commandService: this.commandService,
      originOpenPlotOptions: input.originOpenPlotOptions,
      plotAxisSettings: input.plotAxisSettings,
      thumbnailPreviewService: this.thumbnailPreviewService,
      thumbnailService: this.thumbnailService,
      templateSelections: input.templateSelections,
      editable: this.explorerService.getContext().editable,
      templateRecords: this.createTemplateRecords(),
      files,
      folderImportSupport: getFolderImportSupportForFileService(this.filesService),
      isDragging: this.isDragging,
      mode: input.mode,
      viewLayout: this.viewLayout,
      onDraggingChange: this.handleDraggingChange,
      onFolderExpansionChange: this.handleFolderExpansionChange,
      onFolderKeysChange: this.handleFolderKeysChange,
      onHoverFileChange: this.handleHoverFileChange,
      onVisibleTargetsChange: this.handleVisibleTargetsChange,
      onRemoveFolder: this.handleRemoveFolder,
      onRequestTemplates: this.loadTemplates,
      onCancelRenameFile: this.handleCancelRenameFile,
      onDropFiles: this.handleDropFiles,
      onOpenFolderDialog: this.handleOpenFolderDialog,
      onRenameFile: this.handleRenameFile,
      onSelectFile: this.handleSelectFile,
      thumbnailPlotModelsByFileId: input.thumbnailPlotModelsByFileId,
    };
  }

  private readonly handleCancelRenameFile = (): void => {
    this.explorerService.setEditable(null);
  };

  private readonly handleHoverFileChange = (resource: ExplorerResourceIdentity | null): void => {
    this.explorerService.setHoveredResource(resource);
  };

  private readonly handleRenameFile = (file: ExplorerFileEntry, nextName: string): void => {
    const normalizedFileId = normalizeFileId(file.fileId);
    const normalizedName = String(nextName ?? "").trim();
    this.explorerService.setEditable(null);
    if (!normalizedFileId || !normalizedName) {
      return;
    }

    this.explorerService.renameFile(normalizedFileId, normalizedName);
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
    this.deferTableOpenUntilSourceReplace = true;
    this.deferredSourceReplaceOpenTarget = null;
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
    if (
      !this.pendingSourceEntries.length &&
      !this.replaceItemKeys?.length &&
      !this.deferTableOpenUntilSourceReplace
    ) {
      return;
    }

    this.deferTableOpenUntilSourceReplace = false;
    this.deferredSourceReplaceOpenTarget = null;
    this.pendingSourceEntries = [];
    this.replaceItemKeys = null;
    this.schedulePendingSourceSyncView();
  }

  private finishPendingSourceReplace(): void {
    const shouldOpenDeferredTable = this.deferTableOpenUntilSourceReplace;
    if (!this.replaceItemKeys?.length && !shouldOpenDeferredTable) {
      return;
    }

    this.replaceItemKeys = null;
    this.deferTableOpenUntilSourceReplace = false;
    if (shouldOpenDeferredTable) {
      this.openDeferredSourceReplaceTable();
    }
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
    const canCloseFolder = this.visibleEntries.length > 0;
    const isChartMode = this.paneInput.mode === "chart";
    const isThumbnailView = isChartMode && this.explorerService.viewLayout === "thumbnail";
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
    file: ExplorerFileEntry | null,
  ): void => {
    const selectedTarget = this.selectFile(file, "force");
    const selectedEntry = findExplorerFileEntryByResource(this.visibleEntries, selectedTarget);
    if (this.deferTableOpenUntilSourceReplace) {
      this.deferSourceReplaceTableOpen(selectedEntry);
      this.syncView();
      return;
    }

    this.openSelectedTableFile(selectedTarget);
    this.syncView();
  };

  private readonly handleCloseFile = (file: ExplorerFileEntry): void => {
    const normalizedFileId = normalizeFileId(file.fileId);
    if (!normalizedFileId) {
      return;
    }

    this.sourceWorkflow.rememberRemovedSourceItems(getExplorerSourceItemKeys([file]));
    this.notifyExplorerFilesRemoved([normalizedFileId]);
    this.removeFiles([normalizedFileId]);
    this.syncView();
  };

  private readonly handleDeleteFile = async (file: ExplorerFileEntry): Promise<void> => {
    const normalizedFileId = normalizeFileId(file.fileId);
    if (!normalizedFileId) {
      return;
    }

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

    this.sourceWorkflow.rememberRemovedSourceItems(getExplorerSourceItemKeys([file]));
    this.notifyExplorerFilesRemoved([normalizedFileId]);
    this.removeFiles([normalizedFileId]);
    this.syncView();
  };

  private readonly handleRemoveFolder = (folderKey: string): void => {
    const folderPath = getExplorerFolderPath(folderKey);
    if (!folderPath) {
      return;
    }

    const removedFiles = this.committedFiles
      .filter((entry) => isExplorerPathInFolder(entry.relativePath, folderPath));
    const removedFileIds = new Set(
      removedFiles
        .map((entry) => entry.fileId)
        .filter((fileId): fileId is string => typeof fileId === "string"),
    );
    const removedPendingSources = this.removePendingSourceFilesInFolder(folderPath);
    if (removedFileIds.size === 0 && !removedPendingSources) {
      return;
    }

    const fileIds = [...removedFileIds];
    if (fileIds.length > 0) {
      this.sourceWorkflow.rememberRemovedSourceItems(getExplorerSourceItemKeys(removedFiles));
      this.notifyExplorerFilesRemoved(fileIds);
      this.removeFiles(fileIds);
    }

    this.syncView();
  };

  public async closeFolder(): Promise<void> {
    await this.workspaceContextService.closeFolder();
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

  private readonly handleVisibleTargetsChange = (
    visibleTargets: readonly ExplorerResourceIdentity[],
    nearbyTargets: readonly ExplorerResourceIdentity[],
  ): void => {
    this.explorerService.setVisibleTargets(visibleTargets, nearbyTargets);
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
    const removedFileIds = getNormalizedFileIds(fileIds);
    const currentEntry = findExplorerFileEntryByResource(this.committedFiles, {
      resource: this.explorerService.selectedResource,
      sheetId: this.explorerService.selectedSheetId,
    });
    if (!currentEntry || !removedFileIds.includes(normalizeFileId(currentEntry.fileId) ?? "")) {
      return;
    }

    const remainingFiles = this.committedFiles.filter(file =>
      !removedFileIds.includes(normalizeFileId(file.fileId) ?? ""));
    const nextIdentity = getFirstExplorerResourceIdentity(remainingFiles);
    this.explorerService.select(nextIdentity?.resource ?? null, "force", nextIdentity?.sheetId ?? null);
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

    this.explorerService.removeFiles(normalizedFileIds);
    this.selectRawFileAfterRemoval(normalizedFileIds);
  }

  private replaceExplorerFiles(
    entries: readonly ExplorerFileEntry[],
    selectedImportItemKey: string | null,
  ): void {
    assertSupportedExplorerImportEntries(entries);
    const removedFileIds = resolveExplorerSourceReplaceRemovedFileIds({
      nextFiles: entries,
      previousFiles: this.committedFiles,
    });
    this.notifyExplorerFilesRemoved(removedFileIds);
    this.explorerService.replaceFiles(entries);
    this.reviewExplorerEntries(entries);

    this.removePendingSourceFiles(getImportItemKeys(entries));
    const selectedEntry = resolveSelectedExplorerImportEntry(entries, selectedImportItemKey);
    if (!selectedEntry) {
      this.syncView();
      return;
    }

    this.selectImportedTableFile(selectedEntry);
    if (this.deferTableOpenUntilSourceReplace) {
      this.deferSourceReplaceTableOpen(selectedEntry);
      this.syncView();
      return;
    }

    this.openTableSourceFromExplorerFile(selectedEntry);
    this.navigateToTableAfterImport();
    this.syncView();
  }

  private appendExplorerFiles(entries: readonly ExplorerFileEntry[]): void {
    if (entries.length === 0) {
      return;
    }

    assertSupportedExplorerImportEntries(entries);
    const importedEntries = this.explorerService.appendFiles(entries);
    this.reviewExplorerEntries(entries);
    this.removePendingSourceFiles(getImportItemKeys(entries));
    if (!importedEntries.length) {
      this.syncView();
      return;
    }

    const openTarget = resolveExplorerImportOpenEntry({
      files: this.committedFiles,
      importedEntries,
      selectedResource: this.explorerService.selectedResource,
      selectedSheetId: this.explorerService.selectedSheetId,
    });
    if (shouldSelectExplorerImportTableTarget(openTarget, this.paneInput.selectionKind)) {
      this.selectImportedTableFile(openTarget.entry);
    }
    if (this.deferTableOpenUntilSourceReplace) {
      this.deferSourceReplaceTableOpen(openTarget.entry);
      this.syncView();
      return;
    }

    this.openTableSourceFromExplorerFile(openTarget.entry);
    this.navigateToTableAfterImport();
    this.syncView();
  }

  private removeImportedSourceItemsFromExplorer(itemKeys: readonly string[]): void {
    const removedItemKeys = new Set(
      itemKeys
        .map(itemKey => normalizeItemKey(itemKey))
        .filter((itemKey): itemKey is string => Boolean(itemKey)),
    );
    if (!removedItemKeys.size) {
      return;
    }

    const fileIds = this.committedFiles
      .filter(file => removedItemKeys.has(normalizeItemKey(file.itemKey) ?? ""))
      .map(file => normalizeFileId(file.fileId))
      .filter((fileId): fileId is string => Boolean(fileId));
    this.notifyExplorerFilesRemoved(fileIds);
    this.removeFiles(fileIds);
    this.syncView();
  }

  private getSelectedRelativePath(): string | null {
    const selectedFile = findExplorerFileEntryByResource(this.committedFiles, {
      resource: this.selectedResource,
      sheetId: this.selectedSheetId,
    });
    return normalizeRelativePath(selectedFile?.relativePath);
  }

  private selectFile(
    file: ExplorerFileEntry | null,
    reveal?: "force",
  ): ExplorerResourceIdentity | null {
    const resourceIdentity = getExplorerFileResourceIdentity(file);
    return this.explorerService.select(resourceIdentity?.resource ?? null, reveal, resourceIdentity?.sheetId ?? null);
  }

  private selectImportedTableFile(
    file: ExplorerFileEntry | null,
  ): ExplorerResourceIdentity | null {
    const resourceIdentity = getExplorerFileResourceIdentity(file);
    return this.explorerService.select(resourceIdentity?.resource ?? null, "force", resourceIdentity?.sheetId ?? null);
  }

  private openSelectedTableFile(
    resourceIdentity: ExplorerResourceIdentity | null,
  ): void {
    if (this.paneInput.selectionKind !== "table") {
      return;
    }

    this.openExplorerTableFile(findExplorerFileEntryByResource(this.visibleEntries, resourceIdentity));
  }

  private openExplorerTableFile(file: ExplorerFileEntry | null | undefined): void {
    if (this.paneInput.selectionKind !== "table") {
      return;
    }

    this.openTableSourceFromExplorerFile(file);
  }

  private openTableSourceFromExplorerFile(file: ExplorerFileEntry | null | undefined): void {
    const source = createTableSourceFromExplorerFile(file);
    if (source) {
      this.tableService.open(source);
    }
  }

  private reviewCurrentExplorerEntries(): void {
    const identities = getExplorerResourceIdentities(this.committedFiles);
    const signature = getExplorerResourceIdentitySignature(identities);
    if (signature === this.reviewedExplorerResourceSignature) {
      return;
    }

    this.reviewedExplorerResourceSignature = signature;
    this.reviewExplorerResourceIdentities(identities);
  }

  private reviewExplorerEntries(files: readonly ExplorerFileEntry[]): void {
    this.reviewExplorerResourceIdentities(getExplorerResourceIdentities(files));
  }

  private reviewExplorerResourceIdentities(identities: readonly ExplorerResourceIdentity[]): void {
    for (const identity of identities) {
      void this.reviewService.resolveReviewSummary({
        resource: identity.resource,
        sheetId: identity.sheetId ?? null,
      });
    }
  }

  private deferSourceReplaceTableOpen(file: ExplorerFileEntry | null | undefined): void {
    const target = getExplorerFileResourceIdentity(file);
    if (!target) {
      return;
    }

    this.deferredSourceReplaceOpenTarget = target;
  }

  private openDeferredSourceReplaceTable(): void {
    const target = this.deferredSourceReplaceOpenTarget;
    this.deferredSourceReplaceOpenTarget = null;
    if (!target) {
      return;
    }

    const entry = findExplorerFileEntryByResource(this.committedFiles, target);
    if (!entry) {
      return;
    }

    this.openTableSourceFromExplorerFile(entry);
    this.navigateToTableAfterImport();
  }

  private selectRawFileAfterRemoval(fileIds: readonly string[]): void {
    const removedFileIds = getNormalizedFileIds(fileIds);
    if (!removedFileIds.length) {
      return;
    }

    const removedFileIdSet = new Set(removedFileIds);
    const remainingFiles = this.committedFiles
      .filter(file => !removedFileIdSet.has(normalizeFileId(file.fileId) ?? ""));
    const currentEntry = findExplorerFileEntryByResource(this.committedFiles, {
      resource: this.explorerService.selectedResource,
      sheetId: this.explorerService.selectedSheetId,
    });
    const currentFileId = normalizeFileId(currentEntry?.fileId);
    const nextIdentity = currentFileId && removedFileIdSet.has(currentFileId)
      ? getFirstExplorerResourceIdentity(remainingFiles)
      : getExplorerFileResourceIdentity(currentEntry);
    this.explorerService.select(nextIdentity?.resource ?? null, "force", nextIdentity?.sheetId ?? null);
    this.openSelectedTableFile(nextIdentity);
  }

  private clearExplorerSelections(): void {
    this.explorerService.select(null, "force");
  }

  private navigateToTableAfterImport(): void {
    const activeContainerId = this.viewsService.getViewContainerNavigationState(
      ViewContainerLocation.Panel,
    ).activeViewContainerId;
    if (activeContainerId === ChartViewContainerId) {
      void this.viewsService.openViewContainer(
        TableViewContainerId,
      );
    }
  }
}

export class ExplorerViewPane extends BaseExplorerViewPane {
  constructor(
    @ICommandService commandService: ICommandService,
    @IContextMenuService contextMenuService: IContextMenuService,
    @IDialogService dialogService: IDialogService,
    @IExplorerService explorerService: IExplorerService,
    @IFileService filesService: IFileService,
    @IInstantiationService instantiationService: IInstantiationService,
    @IAppearanceService appearanceService: IAppearanceService,
    @IViewsService viewsService: IViewsService,
    @INotificationService notificationService: INotificationService,
    @ITableService tableService: ITableService,
    @ISliceService sliceService: ISliceService,
    @IThumbnailPreviewService thumbnailPreviewService: IThumbnailPreviewService,
    @IThumbnailService thumbnailService: IThumbnailService,
    @IUserTemplateService userTemplateService: IUserTemplateServiceType,
    @IReviewService reviewService: IReviewServiceType,
    @IUriIdentityService uriIdentityService: IUriIdentityService,
    @IWorkspaceContextService workspaceContextService: IWorkspaceContextService,
  ) {
    super(
      ExplorerViewPaneSurface,
      commandService,
      contextMenuService,
      dialogService,
      explorerService,
      filesService,
      instantiationService,
      appearanceService,
      viewsService,
      notificationService,
      tableService,
      sliceService,
      thumbnailPreviewService,
      thumbnailService,
      userTemplateService,
      reviewService,
      uriIdentityService,
      workspaceContextService,
    );
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
  entries: readonly ExplorerFileEntry[],
): readonly string[] {
  return entries
    .map(entry => entry.itemKey)
    .filter((itemKey): itemKey is string => typeof itemKey === "string");
}

function resolveSelectedExplorerImportEntry(
  entries: readonly ExplorerFileEntry[],
  selectedImportItemKey: string | null,
): ExplorerFileEntry | null {
  const selectedEntry = findExplorerImportEntryByItemKey(entries, selectedImportItemKey);
  return selectedEntry
    ? selectedEntry
    : entries[0] ?? null;
}

export function resolveExplorerImportOpenEntry({
  files,
  importedEntries,
  selectedResource,
  selectedSheetId,
}: {
  readonly files: readonly ExplorerFileEntry[];
  readonly importedEntries: readonly ExplorerFileEntry[];
  readonly selectedResource: URI | null | undefined;
  readonly selectedSheetId: string | null | undefined;
}): { readonly entry: ExplorerFileEntry | null; readonly shouldSelect: boolean } {
  const currentSelectedEntry = findExplorerFileEntryByResource(files, {
    resource: selectedResource ?? null,
    sheetId: selectedSheetId ?? null,
  });
  if (currentSelectedEntry) {
    return {
      entry: currentSelectedEntry,
      shouldSelect: false,
    };
  }

  return {
    entry: importedEntries[0] ?? null,
    shouldSelect: true,
  };
}

export function shouldSelectExplorerImportTableTarget(
  openTarget: { readonly entry: ExplorerFileEntry | null; readonly shouldSelect: boolean },
  selectionKind: ExplorerPaneMode,
): openTarget is { readonly entry: ExplorerFileEntry; readonly shouldSelect: boolean } {
  return Boolean(openTarget.entry && (openTarget.shouldSelect || selectionKind !== "table"));
}

export function resolveExplorerSourceReplaceRemovedFileIds({
  nextFiles,
  previousFiles,
}: {
  readonly nextFiles: readonly ExplorerFileEntry[];
  readonly previousFiles: readonly ExplorerFileEntry[];
}): readonly string[] {
  const nextSourceKeys = new Set(
    nextFiles
      .map(getExplorerFileSourceIdentityKey)
      .filter((key): key is string => Boolean(key)),
  );
  return getNormalizedFileIds(
    previousFiles
      .filter(file => {
        const sourceKey = getExplorerFileSourceIdentityKey(file);
        return !sourceKey || !nextSourceKeys.has(sourceKey);
      })
      .map(file => file.fileId ?? ""),
  );
}

function findExplorerImportEntryByItemKey(
  files: readonly ExplorerFileEntry[],
  itemKey: string | null | undefined,
): ExplorerFileEntry | null {
  const normalizedItemKey = normalizeItemKey(itemKey);
  if (!normalizedItemKey) {
    return null;
  }

  return files.find(file => normalizeItemKey(file.itemKey) === normalizedItemKey) ?? null;
}

function findExplorerFileEntryByResource(
  files: readonly ExplorerFileEntry[],
  resourceIdentity:
    | { readonly resource?: URI | null; readonly sheetId?: string | null }
    | null
    | undefined,
): ExplorerFileEntry | null {
  const resourceKey = getExplorerResourceIdentityKey(resourceIdentity);
  if (!resourceKey) {
    return null;
  }

  return files.find(file =>
    getExplorerResourceIdentityKey(getExplorerFileResourceIdentity(file)) === resourceKey,
  ) ?? null;
}

function getExplorerResourceIdentities(
  files: readonly ExplorerFileEntry[],
): readonly ExplorerResourceIdentity[] {
  const result: ExplorerResourceIdentity[] = [];
  const seen = new Set<string>();
  for (const file of files) {
    const resourceIdentity = getExplorerFileResourceIdentity(file);
    const key = getExplorerResourceIdentityKey(resourceIdentity);
    if (!resourceIdentity || !key || seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(resourceIdentity);
  }
  return result;
}

function getExplorerResourceIdentitySignature(
  resourceIdentities: readonly ExplorerResourceIdentity[],
): string {
  return resourceIdentities
    .map(resourceIdentity => getExplorerResourceIdentityKey(resourceIdentity) ?? "")
    .join("\u001f");
}

function getFirstExplorerResourceIdentity(
  files: readonly ExplorerFileEntry[],
): ExplorerResourceIdentity | null {
  return getExplorerResourceIdentities(files)[0] ?? null;
}

function normalizeExplorerResourceIdentity(resourceIdentity: unknown): ExplorerResourceIdentity | null {
  if (!resourceIdentity || typeof resourceIdentity !== "object" || !("resource" in resourceIdentity)) {
    return null;
  }

  const resource = reviveOptionalUri((resourceIdentity as { readonly resource?: unknown }).resource);
  if (!resource) {
    return null;
  }

  const sheetId = normalizeItemKey((resourceIdentity as { readonly sheetId?: unknown }).sheetId);
  return {
    resource,
    ...(sheetId ? { sheetId } : {}),
  };
}

function reviveOptionalUri(value: unknown): URI | null {
  if (URI.isUri(value)) {
    return value;
  }

  if (typeof value === "string") {
    const raw = value.trim();
    if (!raw) {
      return null;
    }

    try {
      return URI.revive(raw);
    } catch {
      return null;
    }
  }

  if (
    value &&
    typeof value === "object" &&
    typeof (value as { readonly scheme?: unknown }).scheme === "string" &&
    typeof (value as { readonly path?: unknown }).path === "string"
  ) {
    return URI.revive(value as URI);
  }

  return null;
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
  const sheetId = tablePath !== normalizedCsvPath && tableFormatService.isMaterializableWorkbook(resource)
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
): void {
  for (const entry of entries) {
    const candidates = getImportedTableFileNameCandidates(entry);
    if (!candidates.some(candidate => tableFormatService.canHandle(candidate))) {
      throw new Error(`Unsupported table file: ${candidates[0] || "Unknown file"}`);
    }
  }
}

function getImportedTableFileNameCandidates(
  file: ExplorerFileEntry,
): readonly string[] {
  return [
    file.fileName,
    file.sourcePath,
    file.resource?.path,
    file.itemKey,
  ]
    .map(value => String(value ?? "").trim())
    .filter((value): value is string => Boolean(value));
}

function normalizePathValue(value: unknown): string | null {
  const path = String(value ?? "").trim();
  return path || null;
}

const EMPTY_EXPLORER_PANE_INPUT: ExplorerPaneInput = {
  mode: "table",
  selectedResource: null,
  selectedSheetId: null,
  selectionKind: "table",
};

type ExplorerChartFileState = SliceFileState;

function resolveExplorerChartFileState(
  sliceState: SliceFileState | undefined,
): ExplorerChartFileState | undefined {
  if (sliceState && sliceState.state !== "none") {
    return sliceState;
  }

  return undefined;
}

function resolveExplorerChartState(
  sliceState: ExplorerChartFileState | undefined,
  hasChartData: boolean,
): NonNullable<ExplorerFileEntry["chartState"]> {
  if (hasChartData) {
    return "ready";
  }
  if (sliceState?.state === "ready") {
    return "ready";
  }
  if (sliceState?.state === "queued" || sliceState?.state === "processing") {
    return sliceState.state;
  }
  if (sliceState?.state === "failed" || sliceState?.state === "skipped") {
    return sliceState.state;
  }

  return "none";
}

function getExplorerChartStateMessage(
  sliceState: ExplorerChartFileState | undefined,
): string | null {
  if (sliceState?.state === "failed" || sliceState?.state === "skipped") {
    return sliceState.message;
  }

  return null;
}

function isChartThumbnailVisibleFile(
  file: Pick<ExplorerFileEntry, "chartState" | "hasChartData">,
): boolean {
  if (file.hasChartData === true) {
    return true;
  }

  switch (file.chartState) {
    case "queued":
    case "processing":
    case "ready":
      return true;
    default:
      return false;
  }
}

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

function getNormalizedFileIds(values: readonly string[]): readonly string[] {
  return uniqueFileIds(
    values
      .map(value => normalizeFileId(value))
      .filter((fileId): fileId is string => Boolean(fileId)),
  );
}

function getExplorerSourceItemKeys(files: readonly ExplorerFileEntry[]): readonly string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const file of files) {
    const itemKey = normalizeItemKey(file.itemKey);
    if (!itemKey || seen.has(itemKey)) {
      continue;
    }

    seen.add(itemKey);
    result.push(itemKey);
  }
  return result;
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
