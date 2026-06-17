/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { localize } from "src/cs/nls";
import { createMenuAction } from "src/cs/base/browser/ui/menu/menu";
import type { ListHandle } from "src/cs/base/browser/ui/list/list";
import { toAction } from "src/cs/base/common/actions";
import { LxIcon } from "src/cs/base/common/lxicon";
import { ICommandService } from "src/cs/platform/commands/common/commands";
import {
  IContextMenuService,
  IContextViewService,
} from "src/cs/platform/contextview/browser/contextView";
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
  IExplorerWorkflowService,
  type ExplorerPaneInput,
} from "src/cs/workbench/contrib/files/browser/files";
import {
  getExplorerFolderPath,
  isExplorerPathInFolder,
  mergeExplorerSourceEntries,
  resolveExplorerSelectionAfterRemoval,
  resolveExplorerSelectedFileId,
  toExplorerBadgeLabel,
  type ExplorerFileEntry,
} from "src/cs/workbench/contrib/files/common/explorerModel";
import { TOGGLE_THUMBNAIL_VIEW_ACTION_ID } from "src/cs/workbench/contrib/thumbnail/common/thumbnail";
import {
  IFileConverterBackendService,
  type FileConverterBackend,
} from "src/cs/workbench/services/files/common/fileConverterBackend";
import {
  commitExplorerSessionImport,
} from "src/cs/workbench/contrib/files/browser/explorerSessionImport";
import {
  markImportBadgeTrace,
} from "src/cs/workbench/contrib/files/browser/importBadgeTrace";
import { ISessionService } from "src/cs/workbench/services/session/common/session";
import {
  assessFastImportBadge,
} from "src/cs/workbench/services/assessment/common/fileAssessment";
import type { ImportFileAssessment } from "src/cs/workbench/services/assessment/common/assessment";
import {
  IThumbnailPreviewService,
  IThumbnailService,
} from "src/cs/workbench/services/thumbnail/common/thumbnail";
import {
  ITemplateService,
  type TemplateRecord,
} from "src/cs/workbench/services/template/common/template";
import { INotificationService } from "src/cs/workbench/services/notification/common/notificationService";
import { IAppearanceService } from "src/cs/workbench/services/appearance/common/appearance";

import "src/cs/workbench/contrib/files/browser/views/media/explorerViewlet.css";

export class ExplorerViewPane extends ViewPane {
  private readonly root: HTMLDivElement;
  private readonly content: HTMLDivElement;
  private readonly explorerHost: HTMLDivElement;
  private readonly listRef: { current: ListHandle | null } = { current: null };
  private readonly sourceWorkflow: FileSourceWorkflow;
  private explorerView: ExplorerView | null = null;
  private input: ExplorerPaneInput | null = null;
  private internalFiles: PreparedFileImportEntry[] = [];
  private pendingSourceEntries: ExplorerFileEntry[] = [];
  private replaceSourceKeys: string[] | null = null;
  private isDragging = false;
  private disposed = false;
  private templateLoadRunId = 0;
  private templateRecords: TemplateRecord[] = [];
  private isTemplateListLoading = false;
  private pendingLocalExpandedFolderKeys: readonly string[] | null = null;
  private cancelPendingSourceSyncView: (() => void) | null = null;

  constructor(
    @ICommandService private readonly commandService: ICommandService,
    @IContextMenuService private readonly contextMenuService: IContextMenuService,
    @IContextViewService private readonly contextViewService: IContextViewService,
    @IExplorerService private readonly explorerService: IExplorerService,
    @IExplorerWorkflowService private readonly explorerWorkflowService: IExplorerWorkflowService,
    @IFileConverterBackendService private readonly fileConverterBackendService: FileConverterBackend,
    @IFileService private readonly filesService: IFileService,
    @IAppearanceService private readonly appearanceService: IAppearanceService,
    @IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
    @INotificationService private readonly notificationService: INotificationService,
    @ISessionService private readonly sessionService: ISessionService,
    @IThumbnailPreviewService private readonly thumbnailPreviewService: IThumbnailPreviewService,
    @IThumbnailService private readonly thumbnailService: IThumbnailService,
    @ITemplateService private readonly templateService: ITemplateService,
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
      fileConverterBackendService: this.fileConverterBackendService,
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
    this._register(this.explorerWorkflowService.registerHandler({
      openFolderImport: () => this.openFileDialog(),
      closeFolder: () => this.closeFolder(),
      removeFile: fileId => {
        if (this.fileIds.includes(fileId)) {
          this.handleRemoveFile(fileId);
        }
      },
    }));
    this._register(this.appearanceService.onDidChangeAppearance(() => {
      this.syncView();
    }));

    this.update(this.explorerService.getPaneInput());
    this.loadTemplates();
  }

  public update(input: ExplorerPaneInput | null): void {
    this.input = input;
    if (!input) {
      return;
    }

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
    return mergeExplorerSourceEntries({
      files: this.committedFiles,
      pendingSourceEntries: this.pendingSourceEntries,
      replaceSourceKeys: this.replaceSourceKeys,
    });
  }

  private get committedFiles(): ExplorerFileEntry[] {
    const inputFiles = this.input?.files;
    return Array.isArray(inputFiles) ? inputFiles : this.internalFiles;
  }

  private get isControlled(): boolean {
    return Array.isArray(this.input?.files);
  }

  private get fileIds(): readonly string[] {
    return this.files
      .map(file => normalizeFileId(file.fileId))
      .filter((fileId): fileId is string => Boolean(fileId));
  }

  private get selectedFileId(): string | null {
    return this.paneInput.selectedFileId;
  }

  private get viewLayout(): FilesViewLayout {
    return this.explorerService.viewLayout;
  }

  private createExplorerViewProps(): ExplorerViewProps {
    const input = this.paneInput;
    const files = this.files;
    markExplorerBadgeProjection(files);
    return {
      selectedFileId: this.selectedFileId,
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
      currentTemplateLabel: input.currentTemplateLabel,
      currentTemplateSelection: input.currentTemplateSelection,
      fileTemplateSelectionsByFileId: input.fileTemplateSelectionsByFileId,
      editable: this.explorerService.getContext().editable,
      templateRecords: this.templateRecords,
      files,
      folderImportSupport: getFolderImportSupportForFileService(this.filesService),
      isDragging: this.isDragging,
      mode: input.mode,
      viewLayout: this.viewLayout,
      onDraggingChange: this.handleDraggingChange,
      onFolderExpansionChange: this.handleFolderExpansionChange,
      onFolderKeysChange: this.handleFolderKeysChange,
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

  private readonly handleCancelRenameFile = (): void => {
    this.explorerService.setEditable(null);
  };

  private readonly handleRenameFile = (fileId: string, nextName: string): void => {
    const normalizedFileId = normalizeFileId(fileId);
    const normalizedName = String(nextName ?? "").trim();
    this.explorerService.setEditable(null);
    if (!normalizedFileId || !normalizedName) {
      return;
    }

    this.sessionService.renameFile(normalizedFileId, normalizedName);
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
    this.replaceSourceKeys = [];
    this.upsertPendingSourceFiles(pendingFiles);
  }

  private upsertPendingSourceFiles(pendingFiles: readonly PendingImportFile[]): void {
    if (!pendingFiles.length) {
      return;
    }

    const entriesBySourceKey = new Map(
      this.pendingSourceEntries
        .map(entry => [normalizeSourceKey(entry.sourceKey), entry] as const)
        .filter((entry): entry is readonly [string, ExplorerFileEntry] => Boolean(entry[0])),
    );
    const replaceSourceKeys = this.replaceSourceKeys ? [...this.replaceSourceKeys] : null;
    for (const pendingFile of pendingFiles) {
      const sourceKey = normalizeSourceKey(pendingFile.sourceKey);
      if (!sourceKey) {
        continue;
      }

      const current = entriesBySourceKey.get(sourceKey);
      entriesBySourceKey.set(sourceKey, createPendingSourceEntry({
        badgeState: current?.badgeState,
        message: current?.sourceStatusMessage ?? null,
        pendingFile,
        status: current?.sourceStatus ?? "pending",
      }));
      if (replaceSourceKeys && !replaceSourceKeys.includes(sourceKey)) {
        replaceSourceKeys.push(sourceKey);
      }
    }

    this.pendingSourceEntries = [...entriesBySourceKey.values()];
    if (replaceSourceKeys) {
      this.replaceSourceKeys = replaceSourceKeys;
    }
    this.schedulePendingSourceSyncView();
  }

  private updatePendingSourceFile(
    pendingFile: PendingImportFile,
    change: PendingImportSourceStatusChange,
  ): void {
    const sourceKey = normalizeSourceKey(pendingFile.sourceKey);
    if (!sourceKey) {
      return;
    }

    const pendingEntries = this.pendingSourceEntries.map(entry =>
      normalizeSourceKey(entry.sourceKey) === sourceKey
        ? createPendingSourceEntry({
            badgeState: createPendingAssessmentBadgeState(change.preparedAssessment) ?? entry.badgeState,
            message: change.message ?? null,
            pendingFile,
            status: change.status,
          })
        : entry,
    );
    if (!pendingEntries.some(entry => normalizeSourceKey(entry.sourceKey) === sourceKey)) {
      pendingEntries.push(createPendingSourceEntry({
        badgeState: createPendingAssessmentBadgeState(change.preparedAssessment),
        message: change.message ?? null,
        pendingFile,
        status: change.status,
      }));
    }
    this.pendingSourceEntries = pendingEntries;
    this.schedulePendingSourceSyncView();
  }

  private removePendingSourceFiles(sourceKeys: readonly string[]): void {
    const removedSourceKeys = new Set(
      sourceKeys
        .map(sourceKey => normalizeSourceKey(sourceKey))
        .filter((sourceKey): sourceKey is string => Boolean(sourceKey)),
    );
    if (!removedSourceKeys.size) {
      return;
    }

    this.pendingSourceEntries = this.pendingSourceEntries.filter(
      entry => !removedSourceKeys.has(normalizeSourceKey(entry.sourceKey) ?? ""),
    );
    if (this.pendingSourceEntries.length === 0) {
      this.replaceSourceKeys = null;
    }
    this.schedulePendingSourceSyncView();
  }

  private removePendingSourceFilesInFolder(folderPath: string): boolean {
    const previousCount = this.pendingSourceEntries.length;
    this.pendingSourceEntries = this.pendingSourceEntries.filter(
      entry => !isExplorerPathInFolder(entry.relativePath, folderPath),
    );
    if (this.pendingSourceEntries.length === 0) {
      this.replaceSourceKeys = null;
    }
    return previousCount !== this.pendingSourceEntries.length;
  }

  private clearPendingSourceFiles(): void {
    if (!this.pendingSourceEntries.length && !this.replaceSourceKeys?.length) {
      return;
    }

    this.pendingSourceEntries = [];
    this.replaceSourceKeys = null;
    this.schedulePendingSourceSyncView();
  }

  private finishPendingSourceReplace(): void {
    if (!this.replaceSourceKeys?.length) {
      return;
    }

    this.replaceSourceKeys = null;
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
    const canCloseFolder =
      this.files.length > 0 ||
      getSessionFileIds(this.sessionService).length > 0;
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

  private readonly handleSelectFile = (fileId: string | null): void => {
    this.selectFile(fileId, "force");
    this.syncView();
  };

  private readonly handleRemoveFile = (fileId: string | null): void => {
    const normalizedFileId = normalizeFileId(fileId);
    if (!normalizedFileId) {
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

  private closeFolder(): void {
    this.sourceWorkflow.closeImportedSources();
    this.isDragging = false;

    const fileIds = uniqueFileIds([
      ...this.fileIds,
      ...getSessionFileIds(this.sessionService),
    ]);
    if (!this.isControlled) {
      this.internalFiles = [];
    }

    if (fileIds.length > 0) {
      this.sessionService.removeFiles(fileIds);
    }
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
    if (this.isTemplateListLoading) {
      return;
    }

    const runId = this.templateLoadRunId + 1;
    this.templateLoadRunId = runId;
    this.isTemplateListLoading = true;
    this.syncView();

    this.templateService.getTemplates()
      .then((templates) => {
        if (this.disposed || this.templateLoadRunId !== runId) {
          return;
        }

        this.templateRecords = templates;
        this.isTemplateListLoading = false;
        this.syncView();
      })
      .catch((error) => {
        if (this.disposed || this.templateLoadRunId !== runId) {
          return;
        }

        this.isTemplateListLoading = false;
        console.error("Failed to load templates for file context menu.", error);
        this.syncView();
      });
  };

  private removeFiles(fileIds: readonly string[]): void {
    const normalizedFileIds = getNormalizedFileIds(fileIds);
    if (!normalizedFileIds.length) {
      return;
    }

    if (!this.isControlled) {
      const removedFileIds = new Set(normalizedFileIds);
      this.internalFiles = this.internalFiles.filter((entry) => !removedFileIds.has(entry.fileId ?? ""));
    }
    this.sessionService.removeFiles(normalizedFileIds);
    if (this.paneInput.selectionKind !== "table") {
      this.selectRawFileAfterRemoval(normalizedFileIds);
    }
  }

  private replaceImportedFiles(
    fileEntries: PreparedFileImportEntry[],
    importedFiles: PreparedFileImportInfo[],
    selectedFileId: string | null = importedFiles[0]?.fileId ?? null,
  ): void {
    if (!this.isControlled) {
      this.internalFiles = [...fileEntries];
      this.syncView();
    }

    const importResult = commitExplorerSessionImport({
      explorerService: this.explorerService,
      importedFiles,
      mode: "replace",
      selectedFileId,
      sessionService: this.sessionService,
    });
    this.removePendingSourceFiles(getImportSourceKeys(importedFiles));
    if (!importResult.importedFileIds.length) {
      return;
    }

    if (importResult.shouldNavigateToTable) {
      this.navigateToTableAfterImport();
    }
  }

  private appendImportedFiles(
    fileEntries: PreparedFileImportEntry[],
    importedFiles: PreparedFileImportInfo[],
  ): void {
    if (importedFiles.length === 0) {
      return;
    }

    if (!this.isControlled) {
      this.internalFiles = [...this.internalFiles, ...fileEntries];
      this.syncView();
    }

    const importResult = commitExplorerSessionImport({
      explorerService: this.explorerService,
      importedFiles,
      mode: "append",
      sessionService: this.sessionService,
    });
    this.removePendingSourceFiles(getImportSourceKeys(importedFiles));
    if (!importResult.importedFileIds.length) {
      return;
    }

    if (importResult.shouldNavigateToTable) {
      this.navigateToTableAfterImport();
    }
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

  private selectFile(fileId: string | null, reveal?: "force"): string | null {
    return this.explorerService.select({
      candidateFileIds: this.fileIds,
      fileId: normalizeFileId(fileId),
      kind: this.paneInput.selectionKind,
    }, reveal);
  }

  private selectRawFileAfterRemoval(fileIds: readonly string[]): void {
    const removedFileIds = getNormalizedFileIds(fileIds);
    if (!removedFileIds.length) {
      return;
    }

    const removedFileIdSet = new Set(removedFileIds);
    const remainingFileIds = getSessionFileIds(this.sessionService)
      .filter(fileId => !removedFileIdSet.has(fileId));
    const nextSelectedFileId = resolveExplorerSelectionAfterRemoval({
      currentFileId: this.explorerService.selectedRawFileId,
      remainingFileIds,
      removedFileIds,
    });
    this.explorerService.select({
      candidateFileIds: remainingFileIds,
      fileId: nextSelectedFileId,
      kind: "table",
    }, "force");
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

const markExplorerBadgeProjection = (
  files: readonly ExplorerFileEntry[],
): void => {
  if (!files.length) {
    return;
  }

  let assessmentBadgeCount = 0;
  let fastBadgeCount = 0;
  let pendingBadgeCount = 0;
  let loadingSourceCount = 0;
  let failedSourceCount = 0;
  for (const file of files) {
    if (file.badgeState?.kind === "ready" || file.badgeState?.kind === "unknown") {
      if (file.badgeState.source === "assessment") {
        assessmentBadgeCount += 1;
      } else if (file.badgeState.source === "fast") {
        fastBadgeCount += 1;
      }
    } else if (file.badgeState?.kind === "pending") {
      pendingBadgeCount += 1;
    }

    if (file.sourceStatus === "pending" || file.sourceStatus === "preparing") {
      loadingSourceCount += 1;
    } else if (file.sourceStatus === "failed") {
      failedSourceCount += 1;
    }
  }

  markImportBadgeTrace("import.badge.projection", {
    assessmentBadgeCount,
    failedSourceCount,
    fastBadgeCount,
    loadingSourceCount,
    pendingBadgeCount,
    totalFileCount: files.length,
  });
};

function createPendingSourceEntry({
  badgeState,
  message,
  pendingFile,
  status,
}: {
  readonly badgeState?: ExplorerFileEntry["badgeState"];
  readonly message: string | null;
  readonly pendingFile: PendingImportFile;
  readonly status: ExplorerFileEntry["sourceStatus"];
}): ExplorerFileEntry {
  const relativePath = normalizeRelativePath(pendingFile.relativePath);
  return {
    badgeState: badgeState ?? createPendingFastBadgeState(pendingFile),
    fileName: pendingFile.sourceName,
    itemKey: pendingFile.sourceKey,
    relativePath,
    sourceKey: pendingFile.sourceKey,
    sourcePath: getPendingSourcePath(pendingFile),
    sourceStatus: status,
    sourceStatusMessage: message,
  };
}

function createPendingAssessmentBadgeState(
  assessment: ImportFileAssessment | undefined,
): ExplorerFileEntry["badgeState"] | undefined {
  if (!assessment) {
    return undefined;
  }

  const curveType = String(assessment.curveType ?? "").trim();
  if (!curveType || curveType.toLowerCase() === "unknown") {
    return {
      kind: "unknown",
      source: "assessment",
    };
  }

  const label = toExplorerBadgeLabel(curveType);
  return label
    ? {
        confidence: "confirmed",
        kind: "ready",
        label,
        message: assessment.curveTypeReasons.join("; ") || null,
        source: "assessment",
      }
    : {
        kind: "unknown",
        source: "assessment",
        suspectedType: curveType,
      };
}

function createPendingFastBadgeState(
  pendingFile: PendingImportFile,
): ExplorerFileEntry["badgeState"] {
  const fastBadge = assessFastImportBadge({
    fileName: pendingFile.sourceName,
    relativePath: pendingFile.relativePath,
  });
  const label = fastBadge ? toExplorerBadgeLabel(fastBadge.curveType) : null;
  return fastBadge && label
    ? {
        confidence: "tentative",
        kind: "ready",
        label,
        message: fastBadge.reason,
        source: "fast",
      }
    : { kind: "pending" };
}

function getPendingSourcePath(pendingFile: PendingImportFile): string | null {
  if (!pendingFile.canUseNativePath) {
    return null;
  }

  const fsPath = String(pendingFile.resource?.fsPath ?? "").trim();
  return fsPath || null;
}

function getImportSourceKeys(
  importedFiles: readonly PreparedFileImportInfo[],
): readonly string[] {
  return importedFiles
    .map(file => file.sourceKey)
    .filter((sourceKey): sourceKey is string => typeof sourceKey === "string");
}

const EMPTY_EXPLORER_PANE_INPUT: ExplorerPaneInput = {
  files: [],
  mode: "table",
  selectedFileId: null,
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

function normalizeFileId(value: unknown): string | null {
  const fileId = String(value ?? "").trim();
  return fileId || null;
}

function normalizeSourceKey(value: unknown): string | null {
  const sourceKey = String(value ?? "").trim();
  return sourceKey || null;
}

function getNormalizedFileIds(values: readonly string[]): readonly string[] {
  return uniqueFileIds(
    values
      .map(value => normalizeFileId(value))
      .filter((fileId): fileId is string => Boolean(fileId)),
  );
}

function getSessionFileIds(
  sessionService: Pick<ISessionService, "getSnapshot">,
): readonly string[] {
  const snapshot = sessionService.getSnapshot();
  return uniqueFileIds([
    ...snapshot.fileOrder,
    ...Object.keys(snapshot.filesById),
  ]).filter(fileId => Boolean(snapshot.filesById[fileId]));
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
