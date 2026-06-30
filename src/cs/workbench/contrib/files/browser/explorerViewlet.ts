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
import type { WorkbenchSidebarAction } from "src/cs/workbench/browser/parts/sidebar/sidebarPart";
import { ViewPane } from "src/cs/workbench/browser/parts/views/viewPane";
import { IWorkbenchLayoutService } from "src/cs/workbench/services/layout/browser/layoutService";
import {
  FileSourceWorkflow,
  getFolderImportSupportForFileService,
  type PendingImportFile,
  type PendingImportSourceStatusChange,
  type PreparedFileSource,
  type PreparedFileSourceEntry,
  type PreparedFileSourceInfo,
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
  type ExplorerResourceTarget,
  type ExplorerResourceState,
  type ExplorerSelectionKind,
} from "src/cs/workbench/contrib/files/browser/files";
import {
  getExplorerFileResourceIdentity,
  getExplorerFolderPath,
  getExplorerResourceIdentityKey,
  getExplorerFileSourceIdentityKey,
  getExplorerTreeFileKey,
  isExplorerPathInFolder,
  mergeExplorerSourceEntries,
  type ExplorerFileEntry,
} from "src/cs/workbench/contrib/files/common/explorerModel";
import { TOGGLE_THUMBNAIL_VIEW_ACTION_ID } from "src/cs/workbench/contrib/thumbnail/common/thumbnail";
import { createTemplateEditorRecordFromUserTemplate } from "src/cs/workbench/contrib/template/browser/templateUserTemplateAdapter";
import {
  ExplorerDecorationsProvider,
  createExplorerDecorationResource,
} from "src/cs/workbench/contrib/files/browser/views/explorerDecorationsProvider";
import {
  IDecorationsService,
  type IDecorationData,
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
import {
  ISettingsService,
  type ISettingsService as ISettingsServiceType,
} from "src/cs/workbench/services/settings/common/settings";
import type { ReviewSummary } from "src/cs/workbench/services/review/common/reviewModel";

import "src/cs/workbench/contrib/files/browser/views/media/explorerViewlet.css";

export class ExplorerViewPane extends ViewPane {
  private readonly root: HTMLDivElement;
  private readonly content: HTMLDivElement;
  private readonly explorerHost: HTMLDivElement;
  private readonly listRef: { current: ListHandle | null } = { current: null };
  private readonly sourceWorkflow: FileSourceWorkflow;
  private explorerView: ExplorerView | null = null;
  private input: ExplorerPaneInput | null = null;
  private pendingSourceEntries: ExplorerFileEntry[] = [];
  private replaceItemKeys: string[] | null = null;
  private deferTableOpenUntilSourceReplace = false;
  private deferredSourceReplaceOpenTarget: ExplorerResourceTarget | null = null;
  private isDragging = false;
  private disposed = false;
  private pendingLocalExpandedFolderKeys: readonly string[] | null = null;
  private cancelPendingSourceSyncView: (() => void) | null = null;
  private reviewedExplorerTargetsSignature = "";

  constructor(
    @ICommandService private readonly commandService: ICommandService,
    @IContextMenuService private readonly contextMenuService: IContextMenuService,
    @IDialogService private readonly dialogService: IDialogService,
    @IExplorerService private readonly explorerService: IExplorerService,
    @IFileService private readonly filesService: IFileService,
    @IInstantiationService private readonly instantiationService: IInstantiationService,
    @IAppearanceService private readonly appearanceService: IAppearanceService,
    @IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
    @INotificationService private readonly notificationService: INotificationService,
    @ITableService private readonly tableService: ITableService,
    @IThumbnailPreviewService private readonly thumbnailPreviewService: IThumbnailPreviewService,
    @IThumbnailService private readonly thumbnailService: IThumbnailService,
    @IUserTemplateService private readonly userTemplateService: IUserTemplateServiceType,
    @IDecorationsService private readonly decorationsService: IDecorationsServiceType,
    @IReviewService private readonly reviewService: IReviewServiceType,
    @ISettingsService private readonly settingsService: ISettingsServiceType,
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
      onAppendPreparedFileSources: preparedFileSources => this.appendPreparedFileSources(preparedFileSources),
      onAppendPendingSourceFiles: pendingFiles => this.appendPendingSourceFiles(pendingFiles),
      onClearPendingSourceFiles: () => this.clearPendingSourceFiles(),
      onDraggingChange: isDragging => {
        this.isDragging = isDragging;
      },
      onRemoveSourceItems: itemKeys => this.removeImportedSourceItemsFromExplorer(itemKeys),
      onReplacePreparedFileSources: (preparedFileSources, selectedImportItemKey) => {
        this.replacePreparedFileSources(preparedFileSources, selectedImportItemKey);
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
      this.reviewService,
    ));
    this._register(this.decorationsService.registerDecorationsProvider(decorationsProvider));

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
      this.reviewCurrentExplorerEntries(true);
      this.syncView();
    }));
    this._register(this.settingsService.onDidChangeConductorSettings(() => {
      this.reviewCurrentExplorerEntries(true);
      this.syncView();
    }));
    this._register(this.reviewService.onDidChangeReview(() => {
      this.syncView();
    }));
    this._register(this.decorationsService.onDidChangeDecorations(event => {
      if (!this.hasAffectedExplorerDecoration(event)) {
        return;
      }
      this.syncView();
    }));

    this.update(this.explorerService.getPaneInput());
    this.loadTemplates();
  }

  public update(input: ExplorerPaneInput | null): void {
    this.input = input;
    this.reviewCurrentExplorerEntries(false);

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

  public closeFile(target: ExplorerResourceTarget | URI): void {
    const file = this.resolveExplorerFileTarget(target);
    if (!file) {
      return;
    }

    this.handleCloseFile(file);
  }

  public deleteFile(target: ExplorerResourceTarget | URI): Promise<void> {
    const file = this.resolveExplorerFileTarget(target);
    if (!file) {
      return Promise.resolve();
    }

    return this.handleDeleteFile(file);
  }

  private resolveExplorerFileTarget(target: ExplorerResourceTarget | URI): ExplorerFileEntry | null {
    if (URI.isUri(target)) {
      return findExplorerFileEntryByResource(this.committedFiles, { resource: target });
    }

    const resourceTarget = normalizeExplorerResourceTarget(target);
    return resourceTarget
      ? findExplorerFileEntryByResource(this.committedFiles, resourceTarget)
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

  private get files(): ExplorerFileEntry[] {
    const resourceStates = this.createResourceStateMap();
    const resourceStateFiles = this.createResourceStateFiles(this.committedFiles, resourceStates);
    const visibleFiles = this.shouldFilterChartThumbnailFiles()
      ? resourceStateFiles.filter(file => getExplorerResourceStateForFile(resourceStates, file)?.hasChartData === true)
      : resourceStateFiles;
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
    return this.explorerService.viewLayout;
  }

  private shouldFilterChartThumbnailFiles(): boolean {
    return this.paneInput.selectionKind === "chart" && this.viewLayout === "thumbnail";
  }

  private createResourceStateFiles(
    files: readonly ExplorerFileEntry[],
    resourceStates: ReadonlyMap<string, ExplorerResourceState>,
  ): ExplorerFileEntry[] {
    if (!resourceStates.size) {
      return [...files];
    }

    return files.map(file => {
      const state = getExplorerResourceStateForFile(resourceStates, file);
      if (!state) {
        return file;
      }

      return {
        ...file,
        chartMessage: state.chartMessage,
        chartState: state.chartState,
        hasChartData: state.hasChartData,
      };
    });
  }

  private createResourceStateMap(): ReadonlyMap<string, ExplorerResourceState> {
    const resourceStates = new Map<string, ExplorerResourceState>();
    for (const state of this.paneInput.resourceStates ?? []) {
      const key = getExplorerResourceIdentityKey(state);
      if (key) {
        resourceStates.set(key, state);
      }
    }
    return resourceStates;
  }

  private createExplorerViewProps(): ExplorerViewProps {
    const input = this.paneInput;
    const files = this.files;
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
      decorationResourcesByFileKey: this.createExplorerDecorationResourcesByFileKey(files),
      decorationsByFileKey: this.createExplorerDecorationsByFileKey(files),
      reviewSummariesByFileKey: this.createExplorerReviewSummariesByFileKey(files),
      decorationsService: this.decorationsService,
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

  private createExplorerDecorationsByFileKey(
    files: readonly ExplorerFileEntry[],
  ): Readonly<Record<string, IDecorationData>> {
    const decorationsByFileKey: Record<string, IDecorationData> = {};
    for (const file of files) {
      const resource = getExplorerFileDecorationResource(file);
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

  private createExplorerDecorationResourcesByFileKey(
    files: readonly ExplorerFileEntry[],
  ): Readonly<Record<string, URI>> {
    const resourcesByFileKey: Record<string, URI> = {};
    for (const file of files) {
      const resource = getExplorerFileDecorationResource(file);
      if (!resource) {
        continue;
      }
      resourcesByFileKey[getExplorerTreeFileKey(file)] =
        createExplorerDecorationResource(resource, file.sheetId);
    }
    return resourcesByFileKey;
  }

  private createExplorerReviewSummariesByFileKey(
    files: readonly ExplorerFileEntry[],
  ): Readonly<Record<string, ReviewSummary>> {
    const summariesByFileKey: Record<string, ReviewSummary> = {};
    for (const file of files) {
      const resource = getExplorerFileDecorationResource(file);
      if (!resource) {
        continue;
      }
      const summary = this.reviewService.getLatestReviewSummary({
        resource,
        sheetId: file.sheetId ?? null,
      });
      if (summary.state === "missing") {
        continue;
      }
      summariesByFileKey[getExplorerTreeFileKey(file)] = summary;
    }
    return summariesByFileKey;
  }

  private hasAffectedExplorerDecoration(event: { affectsResource(resource: URI): boolean }): boolean {
    for (const file of this.files) {
      const resource = getExplorerFileDecorationResource(file);
      if (resource && event.affectsResource(createExplorerDecorationResource(resource, file.sheetId))) {
        return true;
      }
    }
    return false;
  }

  private readonly handleCancelRenameFile = (): void => {
    this.explorerService.setEditable(null);
  };

  private readonly handleHoverFileChange = (target: ExplorerResourceTarget | null): void => {
    this.explorerService.setHoveredResource(target);
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
    file: ExplorerFileEntry | null,
  ): void => {
    const selectedTarget = this.selectFile(file, "force");
    const selectedEntry = findExplorerFileEntryByResource(this.files, selectedTarget);
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

  private readonly handleVisibleTargetsChange = (
    visibleTargets: readonly ExplorerResourceTarget[],
    nearbyTargets: readonly ExplorerResourceTarget[],
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
    const nextTarget = getFirstExplorerResourceTarget(remainingFiles);
    this.explorerService.select({
      candidateResources: getExplorerResourceTargets(remainingFiles),
      kind: this.paneInput.selectionKind,
      resource: nextTarget?.resource ?? null,
      sheetId: nextTarget?.sheetId ?? null,
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

    this.explorerService.removeFiles(normalizedFileIds);
    this.selectRawFileAfterRemoval(normalizedFileIds);
  }

  private replacePreparedFileSources(
    preparedFileSources: readonly PreparedFileSource[],
    selectedImportItemKey: string | null,
  ): void {
    const fileEntries = preparedFileSources.map(prepared => prepared.fileEntry);
    const fileInfos = preparedFileSources.map(prepared => prepared.fileInfo);
    const localEntries = createLocalExplorerImportEntries(fileEntries, fileInfos);
    assertSupportedExplorerImportEntries(localEntries, fileInfos);
    const removedFileIds = resolveExplorerSourceReplaceRemovedFileIds({
      nextFiles: localEntries,
      previousFiles: this.committedFiles,
    });
    this.notifyExplorerFilesRemoved(removedFileIds);
    this.explorerService.replaceFiles(localEntries);

    this.removePendingSourceFiles(getImportItemKeys(fileInfos));
    const selectedEntry = resolveSelectedExplorerImportEntry(localEntries, selectedImportItemKey);
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

  private appendPreparedFileSources(preparedFileSources: readonly PreparedFileSource[]): void {
    if (preparedFileSources.length === 0) {
      return;
    }

    const fileEntries = preparedFileSources.map(prepared => prepared.fileEntry);
    const fileInfos = preparedFileSources.map(prepared => prepared.fileInfo);
    const localEntries = createLocalExplorerImportEntries(fileEntries, fileInfos);
    assertSupportedExplorerImportEntries(localEntries, fileInfos);
    const previousReviewTargetsSignature = getExplorerReviewTargetsSignature(this.committedFiles);
    const importedEntries = this.explorerService.appendFiles(localEntries);
    if (previousReviewTargetsSignature === getExplorerReviewTargetsSignature(this.committedFiles)) {
      this.reviewExplorerEntries(localEntries);
    }
    this.removePendingSourceFiles(getImportItemKeys(fileInfos));
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
  ): ExplorerResourceTarget | null {
    const target = getExplorerFileResourceIdentity(file);
    return this.explorerService.select({
      candidateResources: getExplorerResourceTargets(this.files),
      kind: this.paneInput.selectionKind,
      resource: target?.resource ?? null,
      sheetId: target?.sheetId ?? null,
    }, reveal);
  }

  private selectImportedTableFile(
    file: ExplorerFileEntry | null,
  ): ExplorerResourceTarget | null {
    const target = getExplorerFileResourceIdentity(file);
    return this.explorerService.select({
      candidateResources: getExplorerResourceTargets(this.committedFiles),
      kind: "table",
      resource: target?.resource ?? null,
      sheetId: target?.sheetId ?? null,
    }, "force");
  }

  private openSelectedTableFile(
    target: ExplorerResourceTarget | null,
  ): void {
    if (this.paneInput.selectionKind !== "table") {
      return;
    }

    this.openExplorerTableFile(findExplorerFileEntryByResource(this.files, target));
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

  private reviewCurrentExplorerEntries(force: boolean): void {
    const targets = getExplorerResourceTargets(this.committedFiles);
    const signature = getExplorerResourceTargetSignature(targets);
    if (!force && signature === this.reviewedExplorerTargetsSignature) {
      return;
    }

    this.reviewedExplorerTargetsSignature = signature;
    this.reviewExplorerResourceTargets(targets);
  }

  private reviewExplorerEntries(files: readonly ExplorerFileEntry[]): void {
    this.reviewExplorerResourceTargets(getExplorerResourceTargets(files));
  }

  private reviewExplorerResourceTargets(targets: readonly ExplorerResourceTarget[]): void {
    for (const target of targets) {
      const resource = target.resource;
      if (!resource) {
        continue;
      }

      void this.reviewService.resolveReviewSummary({
        resource,
        sheetId: target.sheetId ?? null,
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
    const nextTarget = currentFileId && removedFileIdSet.has(currentFileId)
      ? getFirstExplorerResourceTarget(remainingFiles)
      : getExplorerFileResourceIdentity(currentEntry);
    this.explorerService.select({
      candidateResources: getExplorerResourceTargets(remainingFiles),
      kind: "table",
      resource: nextTarget?.resource ?? null,
      sheetId: nextTarget?.sheetId ?? null,
    }, "force");
    this.openSelectedTableFile(nextTarget);
  }

  private clearExplorerSelections(): void {
    this.explorerService.select({
      kind: "table",
      resource: null,
    }, "force");
    this.explorerService.select({
      kind: "chart",
      resource: null,
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
  importedFiles: readonly PreparedFileSourceInfo[],
): readonly string[] {
  return importedFiles
    .map(file => file.itemKey)
    .filter((itemKey): itemKey is string => typeof itemKey === "string");
}

function createLocalExplorerImportEntries(
  fileEntries: readonly PreparedFileSourceEntry[],
  importedFiles: readonly PreparedFileSourceInfo[],
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
  fileEntry: PreparedFileSourceEntry | undefined,
  importedFile: PreparedFileSourceInfo,
): ExplorerFileEntry[] {
  return [createLocalExplorerImportEntry(fileEntry, importedFile)];
}

function createLocalExplorerImportEntry(
  fileEntry: PreparedFileSourceEntry | undefined,
  importedFile: PreparedFileSourceInfo,
): ExplorerFileEntry {
  const normalizedCsvPath =
    normalizePathValue(fileEntry?.normalizedCsvPath) ??
    normalizePathValue(importedFile.normalizedCsvPath);
  const sourcePath = normalizePathValue(fileEntry?.sourcePath) ??
    normalizePathValue(importedFile.sourcePath);
  const itemKey = normalizeItemKey(fileEntry?.itemKey) ??
    normalizeItemKey(importedFile.itemKey) ?? "";
  const entry = {
    file: fileEntry?.file ?? importedFile.file,
    fileName: importedFile.fileName,
    itemKey,
    localImport: true,
    normalizedCsvPath,
    relativePath: fileEntry?.relativePath ?? importedFile.relativePath ?? null,
    resource: fileEntry?.resource ?? importedFile.resource ?? null,
    sourcePath,
  };
  const fileId = getExplorerFileSourceIdentityKey(entry) ||
    itemKey ||
    normalizePathValue(sourcePath) ||
    normalizePathValue(importedFile.resource?.toString()) ||
    importedFile.fileName;

  return {
    ...entry,
    fileId,
  };
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
  selectionKind: ExplorerSelectionKind,
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
  target: ExplorerResourceTarget | null | undefined,
): ExplorerFileEntry | null {
  const targetKey = getExplorerResourceIdentityKey(target);
  if (!targetKey) {
    return null;
  }

  return files.find(file =>
    getExplorerResourceIdentityKey(getExplorerFileResourceIdentity(file)) === targetKey,
  ) ?? null;
}

function getExplorerResourceTargets(
  files: readonly ExplorerFileEntry[],
): readonly ExplorerResourceTarget[] {
  const result: ExplorerResourceTarget[] = [];
  const seen = new Set<string>();
  for (const file of files) {
    const target = getExplorerFileResourceIdentity(file);
    const key = getExplorerResourceIdentityKey(target);
    if (!target || !key || seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(target);
  }
  return result;
}

function getExplorerReviewTargetsSignature(
  files: readonly ExplorerFileEntry[],
): string {
  return getExplorerResourceTargetSignature(getExplorerResourceTargets(files));
}

function getExplorerResourceTargetSignature(
  targets: readonly ExplorerResourceTarget[],
): string {
  return targets
    .map(target => getExplorerResourceIdentityKey(target) ?? "")
    .join("\u001f");
}

function getFirstExplorerResourceTarget(
  files: readonly ExplorerFileEntry[],
): ExplorerResourceTarget | null {
  return getExplorerResourceTargets(files)[0] ?? null;
}

function normalizeExplorerResourceTarget(target: unknown): ExplorerResourceTarget | null {
  if (!target || typeof target !== "object" || !("resource" in target)) {
    return null;
  }

  const resource = reviveOptionalUri((target as { readonly resource?: unknown }).resource);
  if (!resource) {
    return null;
  }

  const sheetId = normalizeItemKey((target as { readonly sheetId?: unknown }).sheetId);
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

function getExplorerFileDecorationResource(file: ExplorerFileEntry | null | undefined): URI | null {
  const resource = file?.resource ? URI.revive(file.resource) : null;
  return resource ?? null;
}

function getExplorerFileTablePath(file: ExplorerFileEntry | null | undefined): string | null {
  return normalizePathValue(file?.normalizedCsvPath) ??
    normalizePathValue(file?.sourcePath);
}

function assertSupportedExplorerImportEntries(
  entries: readonly ExplorerFileEntry[],
  importedFiles: readonly PreparedFileSourceInfo[],
): void {
  const entryPaths = new Map(
    entries
      .map(entry => [normalizeItemKey(entry.itemKey), getExplorerFileTablePath(entry)] as const)
      .filter((entry): entry is readonly [string, string] => Boolean(entry[0] && entry[1])),
  );
  for (const file of importedFiles) {
    const candidates = [
      ...getImportedTableFileNameCandidates(file),
      entryPaths.get(normalizeItemKey(file.itemKey) ?? "") ?? "",
    ];
    if (!candidates.some(candidate => tableFormatService.canHandle(candidate))) {
      throw new Error(`Unsupported table file: ${candidates[0] || "Unknown file"}`);
    }
  }
}

function getImportedTableFileNameCandidates(
  file: PreparedFileSourceInfo,
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

function getExplorerResourceStateForFile(
  resourceStates: ReadonlyMap<string, ExplorerResourceState>,
  file: ExplorerFileEntry,
): ExplorerResourceState | null {
  const key = getExplorerResourceIdentityKey(getExplorerFileResourceIdentity(file));
  return key ? resourceStates.get(key) ?? null : null;
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
