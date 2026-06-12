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
  MORE_ACTIONS_ACTION_ID,
  REMOVE_FOLDER_ACTION_ID,
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
  resolveExplorerSelectionAfterRemoval,
  resolveExplorerSelectedFileId,
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
import { ISessionService } from "src/cs/workbench/services/session/common/session";
import { IThumbnailService } from "src/cs/workbench/services/thumbnail/common/thumbnail";
import {
  ITemplateService,
  type TemplateRecord,
} from "src/cs/workbench/services/template/common/template";

import "src/cs/workbench/contrib/files/browser/views/media/explorerViewlet.css";

export class ExplorerViewPane extends ViewPane {
  private readonly root: HTMLDivElement;
  private readonly content: HTMLDivElement;
  private readonly explorerHost: HTMLDivElement;
  private readonly listRef: { current: ListHandle | null } = { current: null };
  private readonly shouldAutoScrollToBottomRef = { current: true };
  private readonly sourceWorkflow: FileSourceWorkflow;
  private explorerView: ExplorerView | null = null;
  private input: ExplorerPaneInput | null = null;
  private internalFiles: PreparedFileImportEntry[] = [];
  private error: string | null = null;
  private isDragging = false;
  private prevFileCount = 0;
  private disposed = false;
  private templateLoadRunId = 0;
  private templateRecords: TemplateRecord[] = [];
  private isTemplateListLoading = false;

  constructor(
    @ICommandService private readonly commandService: ICommandService,
    @IContextMenuService private readonly contextMenuService: IContextMenuService,
    @IContextViewService private readonly contextViewService: IContextViewService,
    @IExplorerService private readonly explorerService: IExplorerService,
    @IExplorerWorkflowService private readonly explorerWorkflowService: IExplorerWorkflowService,
    @IFileConverterBackendService private readonly fileConverterBackendService: FileConverterBackend,
    @IFileService private readonly filesService: IFileService,
    @IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
    @ISessionService private readonly sessionService: ISessionService,
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
      getFiles: () => this.files,
      getSelectedRelativePath: () => this.getSelectedRelativePath(),
      isDisposed: () => this.disposed,
      onAppendPreparedFiles: preparedFiles => this.appendPreparedImportFiles(preparedFiles),
      onDraggingChange: isDragging => {
        this.isDragging = isDragging;
      },
      onErrorChange: error => {
        this.error = error;
      },
      onRemoveFiles: fileIds => this.removeImportedFilesFromExplorer(fileIds),
      onReplacePreparedFiles: (preparedFiles, selectedFileId) => {
        this.replacePreparedImportFiles(preparedFiles, selectedFileId);
      },
      syncView: () => this.syncView(),
    });

    this._register(this.explorerService.onDidChangePaneInput(input => {
      this.update(input);
    }));
    this._register(this.explorerService.onDidChangeViewLayout(() => {
      this.update(this.input);
    }));
    this._register(this.explorerService.onDidChangeSelection(() => {
      this.syncView();
    }));
    this._register(this.explorerService.onDidChangeExpandedFolderKeys(() => {
      this.syncView();
    }));
    this._register(this.explorerWorkflowService.registerHandler({
      openFolderImport: () => this.openFileDialog(),
      removeSelectedFolder: () => this.removeSelectedFolder(),
      removeFile: fileId => {
        if (this.fileIds.includes(fileId)) {
          this.handleRemoveFile(fileId);
        }
      },
    }));

    this.update(this.explorerService.getPaneInput());
    this.loadTemplates();
  }

  public update(input: ExplorerPaneInput | null): void {
    this.input = input;
    if (!input) {
      return;
    }

    this.handleFileCountEffects();
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
    return {
      selectedFileId: this.selectedFileId,
      expandedFolderKeys: this.explorerService.expandedFolderKeys,
      activePlotType: input.activePlotType,
      commandService: this.commandService,
      contextViewService: this.contextViewService,
      contextMenuService: this.contextMenuService,
      originOpenPlotOptions: input.originOpenPlotOptions,
      plotAxisSettings: input.plotAxisSettings,
      thumbnailService: this.thumbnailService,
      currentTemplateLabel: input.currentTemplateLabel,
      currentTemplateSelection: input.currentTemplateSelection,
      fileTemplateSelectionsByFileId: input.fileTemplateSelectionsByFileId,
      isTemplateListLoading: this.isTemplateListLoading,
      templateRecords: this.templateRecords,
      error: this.error,
      files: this.files,
      folderImportSupport: getFolderImportSupportForFileService(this.filesService),
      isDragging: this.isDragging,
      mode: input.mode,
      viewLayout: this.viewLayout,
      onClearError: this.handleClearError,
      onDraggingChange: this.handleDraggingChange,
      onListScroll: this.handleListScroll,
      onFolderExpansionChange: this.handleFolderExpansionChange,
      onFolderKeysChange: this.handleFolderKeysChange,
      onRemoveFolder: this.handleRemoveFolder,
      onRequestTemplates: this.loadTemplates,
      onDropFiles: this.handleDropFiles,
      onOpenFolderDialog: this.handleOpenFolderDialog,
      onSelectFile: this.handleSelectFile,
      thumbnailFiles: input.thumbnailFiles,
      thumbnailPlotModelsByFileId: input.thumbnailPlotModelsByFileId,
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

  private openFileDialog(): void {
    this.error = null;
    this.syncView();
    this.sourceWorkflow.openFolderDialog();
  }

  private removeSelectedFolder(): void {
    const folderPath = this.getSelectedFolderPath() ?? this.getFirstFolderPath();
    if (!folderPath) {
      return;
    }

    this.handleRemoveFolder(`folder:${folderPath}`);
  }

  private showMoreActions(anchor: HTMLElement): void {
    const canRemoveFolder = hasFolder(this.files);
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
          enabled: canRemoveFolder,
          icon: LxIcon.remove,
          id: REMOVE_FOLDER_ACTION_ID,
          label: localize("files.removeFolder", "Remove Folder"),
          run: () => {
            void this.commandService.executeCommand(REMOVE_FOLDER_ACTION_ID);
          },
        }),
      ],
    });
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
    this.handleFileCountEffects();
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
    if (removedFileIds.size === 0) {
      return;
    }

    const fileIds = [...removedFileIds];
    this.sourceWorkflow.rememberRemovedFiles(fileIds);
    this.notifyExplorerFilesRemoved(fileIds);
    this.removeFiles(fileIds);

    this.handleFileCountEffects();
    this.syncView();
  };

  private readonly handleFolderExpansionChange = (expandedFolderKeys: readonly string[]): void => {
    this.explorerService.setExpandedFolderKeys(expandedFolderKeys);
  };

  private readonly handleFolderKeysChange = (folderKeys: readonly string[]): readonly string[] => {
    return this.explorerService.reconcileExpandedFolderKeys(folderKeys);
  };

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
      this.handleFileCountEffects();
      this.syncView();
    }

    const importResult = commitExplorerSessionImport({
      explorerService: this.explorerService,
      importedFiles,
      mode: "replace",
      selectedFileId,
      sessionService: this.sessionService,
    });
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
      this.handleFileCountEffects();
      this.syncView();
    }

    const importResult = commitExplorerSessionImport({
      explorerService: this.explorerService,
      importedFiles,
      mode: "append",
      sessionService: this.sessionService,
    });
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
    this.handleFileCountEffects();
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
    const remainingFileIds = getSessionRawFileIds(this.sessionService)
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

  private navigateToTableAfterImport(): void {
    if (this.layoutService.activeWorkbenchMainPart === "chart") {
      this.layoutService.navigateToView("table");
    }
  }
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

function hasFolder(files: readonly ExplorerFileEntry[]): boolean {
  return files.some(file => {
    const relativePath = String(file.relativePath ?? "");
    return relativePath.includes("/");
  });
}

function normalizeRelativePath(value: unknown): string | null {
  const relativePath = String(value ?? "").trim();
  return relativePath || null;
}

function normalizeFileId(value: unknown): string | null {
  const fileId = String(value ?? "").trim();
  return fileId || null;
}

function getNormalizedFileIds(values: readonly string[]): readonly string[] {
  return uniqueFileIds(
    values
      .map(value => normalizeFileId(value))
      .filter((fileId): fileId is string => Boolean(fileId)),
  );
}

function getSessionRawFileIds(
  sessionService: Pick<ISessionService, "getSnapshot">,
): readonly string[] {
  const snapshot = sessionService.getSnapshot();
  return snapshot.fileOrder
    .map(fileId => normalizeFileId(fileId))
    .filter((fileId): fileId is string => Boolean(fileId && snapshot.filesById[fileId]));
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
