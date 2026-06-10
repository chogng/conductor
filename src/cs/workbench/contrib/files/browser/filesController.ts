/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type { ListHandle } from "src/cs/base/browser/ui/list/list";
import type { IDisposable } from "src/cs/base/common/lifecycle";
import type { ICommandService as ICommandServiceType } from "src/cs/platform/commands/common/commands";
import type { IContextMenuService as IContextMenuServiceType } from "src/cs/platform/contextview/browser/contextView";
import type { IContextViewService as IContextViewServiceType } from "src/cs/platform/contextview/browser/contextView";
import type { IFileService as IFileServiceType } from "src/cs/platform/files/common/files";
import type {
  ExplorerSelectionKind,
  IExplorerService as IExplorerServiceType,
} from "src/cs/workbench/contrib/files/common/explorer";
import {
  ExplorerView,
  type ExplorerViewProps,
} from "src/cs/workbench/contrib/files/browser/views/explorerView";
import {
  getExplorerFolderPath,
  isExplorerPathInFolder,
} from "src/cs/workbench/contrib/files/common/explorerModel";
import {
  type FilesViewLayout,
} from "src/cs/workbench/contrib/files/common/files";
import type { ExplorerFileEntry } from "src/cs/workbench/contrib/files/common/explorerModel";
import type { ExplorerThumbnailPlotModel } from "src/cs/workbench/contrib/files/common/explorerPaneViewInput";
import type { WorkbenchMainPart } from "src/cs/workbench/common/contextkeys";
import type { ProcessedEntry } from "src/cs/workbench/services/session/common/sessionTypes";
import type { OriginPlotOptions } from "src/cs/workbench/services/origin/common/originPlotOptions";
import type { PlotType } from "src/cs/workbench/services/plot/common/plot";
import type { PlotAxisSettings } from "src/cs/workbench/services/plot/common/plotSettings";
import type { IThumbnailService } from "src/cs/workbench/services/thumbnail/common/thumbnail";
import type {
  TemplateSelection,
  TemplateSelectionsByFileId,
} from "src/cs/workbench/services/template/common/templateSelection";
import type {
  ITemplateService,
  TemplateRecord,
} from "src/cs/workbench/services/template/common/template";
import {
  showCreateFolderUnsupported,
} from "src/cs/workbench/contrib/files/browser/fileActions";
import {
  getFolderImportSupportForFileService,
} from "src/cs/workbench/contrib/files/browser/fileImportExport";
import {
  ExplorerImportController,
} from "src/cs/workbench/contrib/files/browser/explorerImportController";
import type {
  FileConverterBackend,
} from "src/cs/workbench/services/files/common/fileConverterBackend";
import {
  type PreparedFileImport,
  type PreparedFileImportEntry,
  type PreparedFileImportInfo,
} from "src/cs/workbench/services/files/browser/pendingImportFiles";

export type FilesControllerProps = {
  readonly fileConverterBackendService: FileConverterBackend;
  readonly commandService: ICommandServiceType;
  readonly contextMenuService: Pick<IContextMenuServiceType, "showContextMenu">;
  readonly contextViewService: IContextViewServiceType;
  readonly explorerService: IExplorerServiceType;
  readonly selectionKind: ExplorerSelectionKind;
  readonly filesService: IFileServiceType;
  activePlotType?: PlotType;
  originOpenPlotOptions?: OriginPlotOptions;
  plotAxisSettings?: Partial<PlotAxisSettings> | Record<string, unknown>;
  thumbnailService: IThumbnailService;
  currentTemplateLabel?: string;
  currentTemplateSelection?: TemplateSelection;
  fileTemplateSelectionsByFileId?: TemplateSelectionsByFileId;
  templateService: ITemplateService;
  files?: ExplorerFileEntry[];
  mode?: WorkbenchMainPart;
  viewLayout?: FilesViewLayout;
  thumbnailFiles?: ProcessedEntry[];
  thumbnailPlotModelsByFileId?: Readonly<Record<string, ExplorerThumbnailPlotModel>>;
  onFileImported?: (fileInfo: PreparedFileImportInfo) => void;
  onFileSelected: (fileId: string | null) => void;
  onFilesAdded?: (files: PreparedFileImportInfo[]) => void;
  onFilesReplaced?: (files: PreparedFileImportInfo[]) => void;
  onFileRemoved?: (fileId: string) => void;
  onFilesRemoved?: (fileIds: string[]) => void;
  selectedFileId: string | null;
};

export type {
  PreparedFileImportInfo,
};

export class FilesController implements IDisposable {
  private readonly listRef: { current: ListHandle | null } = { current: null };
  private readonly shouldAutoScrollToBottomRef = { current: true };
  private readonly importController: ExplorerImportController;
  private explorerView: ExplorerView | null = null;
  private props: FilesControllerProps;
  private internalFiles: PreparedFileImportEntry[] = [];
  private error: string | null = null;
  private isDragging = false;
  private prevFileCount = 0;
  private disposed = false;
  private readonly commandService: ICommandServiceType;
  private readonly explorerService: IExplorerServiceType;
  private readonly explorerSelectionListener: IDisposable;
  private readonly explorerFolderExpansionListener: IDisposable;
  private readonly explorerFolderImportListener: IDisposable;
  private readonly explorerSelectedFolderRemovalListener: IDisposable;
  private readonly explorerRemovalListener: IDisposable;
  private readonly filesService: IFileServiceType;
  private templateLoadRunId = 0;
  private templateRecords: TemplateRecord[] = [];
  private isTemplateListLoading = false;

  constructor(
    host: HTMLElement,
    props: FilesControllerProps,
  ) {
    this.props = props;
    this.commandService = props.commandService;
    this.explorerService = props.explorerService;
    this.filesService = props.filesService;
    this.importController = new ExplorerImportController({
      commandService: this.commandService,
      fileConverterBackendService: props.fileConverterBackendService,
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
      onRemoveFiles: fileIds => this.removeImportedFilesFromController(fileIds),
      onReplacePreparedFiles: (preparedFiles, selectedFileId) => {
        this.replacePreparedImportFiles(preparedFiles, selectedFileId);
      },
      syncView: () => this.syncView(),
    });
    this.explorerSelectionListener = this.explorerService.onDidChangeSelection(() => {
      this.syncView();
    });
    this.explorerFolderExpansionListener = this.explorerService.onDidChangeExpandedFolderKeys(() => {
      this.syncView();
    });
    this.explorerFolderImportListener = this.explorerService.onDidRequestFolderImport(() => {
      this.openFileDialog();
    });
    this.explorerSelectedFolderRemovalListener = this.explorerService.onDidRequestSelectedFolderRemoval(() => {
      this.removeSelectedFolder();
    });
    this.explorerRemovalListener = this.explorerService.onDidRequestFileRemoval(request => {
      if (this.fileIds.includes(request.fileId)) {
        this.handleRemoveFile(request.fileId);
      }
    });
    this.prevFileCount = this.files.length;

    this.explorerView = new ExplorerView(host, this.createExplorerViewProps());
    this.listRef.current = this.explorerView.getListHandle();
    this.loadTemplates();
  }

  get hasFiles(): boolean {
    return this.files.length > 0;
  }

  private openFileDialog(): void {
    this.error = null;
    this.syncView();
    this.importController.openFolderDialog();
  }

  private removeSelectedFolder(): void {
    const folderPath = this.getSelectedFolderPath() ?? this.getFirstFolderPath();
    if (!folderPath) {
      return;
    }

    this.handleRemoveFolder(`folder:${folderPath}`);
  }

  setProps(nextProps: FilesControllerProps): void {
    const previousTemplateService = this.props.templateService;
    this.props = nextProps;

    if (nextProps.templateService !== previousTemplateService) {
      this.templateRecords = [];
      this.loadTemplates();
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
    this.explorerSelectionListener.dispose();
    this.explorerFolderExpansionListener.dispose();
    this.explorerFolderImportListener.dispose();
    this.explorerSelectedFolderRemovalListener.dispose();
    this.explorerRemovalListener.dispose();
    this.importController.dispose();
    this.explorerView?.dispose();
    this.explorerView = null;
    this.listRef.current = null;
  }

  private get files(): ExplorerFileEntry[] {
    return Array.isArray(this.props.files) ? this.props.files : this.internalFiles;
  }

  private get isControlled(): boolean {
    return Array.isArray(this.props.files);
  }

  private get fileIds(): readonly string[] {
    return this.files
      .map(file => normalizeFileId(file.fileId))
      .filter((fileId): fileId is string => Boolean(fileId));
  }

  private get selectedFileId(): string | null {
    return this.props.selectedFileId;
  }

  private createExplorerViewProps(): ExplorerViewProps {
    return {
      selectedFileId: this.selectedFileId,
      expandedFolderKeys: this.explorerService.expandedFolderKeys,
      activePlotType: this.props.activePlotType,
      commandService: this.commandService,
      contextViewService: this.props.contextViewService,
      contextMenuService: this.props.contextMenuService,
      originOpenPlotOptions: this.props.originOpenPlotOptions,
      plotAxisSettings: this.props.plotAxisSettings,
      thumbnailService: this.props.thumbnailService,
      currentTemplateLabel: this.props.currentTemplateLabel,
      currentTemplateSelection: this.props.currentTemplateSelection,
      fileTemplateSelectionsByFileId: this.props.fileTemplateSelectionsByFileId,
      isTemplateListLoading: this.isTemplateListLoading,
      templateRecords: this.templateRecords,
      error: this.error,
      files: this.files,
      folderImportSupport: getFolderImportSupportForFileService(this.filesService),
      isDragging: this.isDragging,
      mode: this.props.mode,
      viewLayout: this.props.viewLayout,
      onClearError: this.handleClearError,
      onDraggingChange: this.handleDraggingChange,
      onListScroll: this.handleListScroll,
      onCreateFolder: this.handleCreateFolder,
      onFolderExpansionChange: this.handleFolderExpansionChange,
      onFolderKeysChange: this.handleFolderKeysChange,
      onRemoveFolder: this.handleRemoveFolder,
      onRequestTemplates: this.loadTemplates,
      onDropFiles: this.handleDropFiles,
      onOpenFolderDialog: this.handleOpenFolderDialog,
      onSelectFile: this.handleSelectFile,
      thumbnailFiles: this.props.thumbnailFiles,
      thumbnailPlotModelsByFileId: this.props.thumbnailPlotModelsByFileId,
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

  private readonly handleDropFiles = (dataTransfer: DataTransfer | null): void => {
    this.importController.importDroppedFiles(dataTransfer);
  }

  private readonly handleOpenFolderDialog = (): void => {
    this.importController.openFolderDialog();
  };

  private readonly handleSelectFile = (fileId: string | null): void => {
    this.props.onFileSelected(fileId);
    this.syncView();
  };

  private readonly handleRemoveFile = (fileId: string | null): void => {
    const normalizedFileId = normalizeFileId(fileId);
    if (!normalizedFileId) {
      return;
    }

    this.importController.rememberRemovedFiles([normalizedFileId]);
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
    this.importController.rememberRemovedFiles(fileIds);
    this.notifyExplorerFilesRemoved(fileIds);
    this.removeFiles(fileIds);

    this.handleFileCountEffects();
    this.syncView();
  };

  private readonly handleCreateFolder = (_folderKey: string): void => {
    showCreateFolderUnsupported();
  };

  private readonly handleFolderExpansionChange = (expandedFolderKeys: readonly string[]): void => {
    this.explorerService.setExpandedFolderKeys(expandedFolderKeys);
  };

  private readonly handleFolderKeysChange = (folderKeys: readonly string[]): readonly string[] => {
    return this.explorerService.reconcileExpandedFolderKeys(folderKeys);
  };

  private notifyExplorerFilesRemoved(fileIds: readonly string[]): void {
    if (this.isControlled && this.props.selectionKind === "raw") {
      return;
    }

    this.explorerService.removeFileIdsFromSelection({
      kind: this.props.selectionKind,
      remainingFileIds: this.fileIds.filter(fileId => !fileIds.includes(fileId)),
      removedFileIds: fileIds,
    });
  }

  private readonly loadTemplates = (): void => {
    if (this.isTemplateListLoading) {
      return;
    }

    const runId = this.templateLoadRunId + 1;
    this.templateLoadRunId = runId;
    this.isTemplateListLoading = true;
    this.syncView();

    this.props.templateService.getTemplates()
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

  private replaceImportedFiles(
    fileEntries: PreparedFileImportEntry[],
    importedFiles: PreparedFileImportInfo[],
    selectedFileId: string | null = importedFiles[0]?.fileId ?? null,
  ): void {
    if (!this.isControlled) {
      this.internalFiles = [...fileEntries];
      this.props.onFileSelected(selectedFileId);
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

    if (this.props.onFilesAdded) {
      this.props.onFilesAdded(importedFiles);
      return;
    }

    for (const fileInfo of importedFiles) {
      this.props.onFileImported?.(fileInfo);
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

  private removeImportedFilesFromController(fileIds: readonly string[]): void {
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

}

function normalizeRelativePath(value: unknown): string | null {
  const relativePath = String(value ?? "").trim();
  return relativePath || null;
}

function normalizeFileId(value: unknown): string | null {
  const fileId = String(value ?? "").trim();
  return fileId || null;
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

