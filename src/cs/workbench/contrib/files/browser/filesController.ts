import type { ListHandle } from "src/cs/base/browser/ui/list/list";
import type { IDisposable } from "src/cs/base/common/lifecycle";
import { URI } from "src/cs/base/common/uri";
import type { IFileDialogService as IFileDialogServiceType } from "src/cs/platform/dialogs/common/dialogs";
import type { IFileService as IFileServiceType } from "src/cs/platform/files/common/files";
import { localize } from "src/cs/nls";
import type { IPathService as IPathServiceType } from "src/cs/workbench/services/path/common/pathService";
import { startPerf } from "src/cs/workbench/common/perf";
import { WorkspaceWatcher } from "src/cs/workbench/contrib/files/browser/workspaceWatcher";
import {
  ExplorerView,
  type ExplorerViewProps,
} from "src/cs/workbench/contrib/files/browser/views/explorerView";
import type {
  FileEntry,
  FileSource,
  FilesPaneRef,
} from "src/cs/workbench/contrib/files/common/files";
import type { CleanedEntry } from "src/cs/workbench/contrib/session/common/sessionTypes";
import { collectFolderFiles } from "src/cs/workbench/contrib/files/browser/fileImportExport";
import {
  type ImportSessionFileEntry,
  type ImportSessionFileInfo,
  preparePendingImportFile,
} from "src/cs/workbench/services/analysisFile/browser/importPipeline";
import {
  collectPendingImportFiles,
} from "src/cs/workbench/services/analysisFile/browser/fileFilter";

export type FilesControllerProps = {
  readonly dialogsService: IFileDialogServiceType;
  readonly filesService: IFileServiceType;
  readonly pathService: IPathServiceType;
  files?: FileEntry[];
  cleanedData?: CleanedEntry[];
  onFileImported?: (fileInfo: ImportSessionFileInfo) => void;
  onFilesReplaced?: (files: ImportSessionFileInfo[]) => void;
  onFileRemoved?: (fileId: string) => void;
  onFileSelected?: (fileId: string | null) => void;
  selectedFileId?: string | null;
};

export type {
  ImportSessionFileInfo,
  FilesPaneRef,
};

const IMPORT_PREPARE_CONCURRENCY = 2;

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
  private folderRefreshRunId = 0;
  private prevFileCount = 0;
  private disposed = false;
  private readonly dialogsService: IFileDialogServiceType;
  private readonly filesService: IFileServiceType;
  private readonly pathService: IPathServiceType;

  constructor(
    host: HTMLElement,
    props: FilesControllerProps,
  ) {
    this.props = props;
    this.dialogsService = props.dialogsService;
    this.filesService = props.filesService;
    this.pathService = props.pathService;
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

  setProps(nextProps: FilesControllerProps): void {
    const previousSelectedFileId = this.props.selectedFileId ?? null;
    this.props = nextProps;

    if ((nextProps.selectedFileId ?? null) !== previousSelectedFileId) {
      this.optimisticSelectedFileId = nextProps.selectedFileId ?? null;
    }

    this.handleFileCountEffects();
    this.syncView();
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }

    this.disposed = true;
    this.folderWatcher.dispose();
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
      isDragging: this.isDragging,
      onClearError: this.handleClearError,
      onDraggingChange: this.handleDraggingChange,
      onListScroll: this.handleListScroll,
      onRemoveFile: this.handleRemoveFile,
      onOpenFolderDialog: this.handleOpenFolderDialog,
      onSelectFile: this.handleSelectFile,
      onSelectFiles: this.handleSelectFiles,
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

  private readonly handleOpenFolderDialog = (): void => {
    void this.openFolderDialog();
  };

  private async openFolderDialog(): Promise<void> {
    this.error = null;
    this.syncView();

    try {
      const folders = await this.dialogsService.showOpenDialog({
        canSelectFolders: true,
        defaultUri: this.pathService.userHome({ preferLocal: true }),
        title: localize("import.pickFolderTitle", "选择要导入的文件夹"),
        openLabel: localize("import.openFolderButton", "打开文件夹"),
      });
      const folder = folders?.[0] ? URI.revive(folders[0]) : null;
      if (!folder || this.disposed) {
        return;
      }

      const files = await collectFolderFiles(folder, this.filesService);
      if (this.disposed) {
        return;
      }

      this.watchImportedFolder(folder);
      void this.processFiles(files);
    } catch (error) {
      if (this.disposed) {
        return;
      }

      if (import.meta.env.DEV) {
        console.error("Failed to read files from the selected folder.", error);
      }

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

    if (!this.isControlled) {
      this.internalFiles = this.internalFiles.filter((entry) => entry.fileId !== fileId);
    }

    this.props.onFileRemoved?.(fileId);
    this.handleFileCountEffects();
    this.syncView();
  };

  private async processFiles(
    newFiles: FileSource[],
    options: {
      readonly preserveSelection?: boolean;
      readonly replaceWhenEmpty?: boolean;
      readonly shouldContinue?: () => boolean;
    } = {},
  ): Promise<void> {
    const finishBatchPerf = startPerf("import:add-files", {
      currentCount: 0,
      incomingCount: newFiles.length,
    });

    this.error = null;
    this.syncView();

    const failedNames: string[] = [];
    const canApplyResult = (): boolean =>
      !options.shouldContinue || options.shouldContinue();
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
        this.error = this.buildImportErrorMessage({
          failedNames,
          hasAnyUnsupportedFiles,
        });
        this.syncView();
      }
      return;
    }

    const preparedEntries: ImportSessionFileEntry[] = [];
    const importedFiles: ImportSessionFileInfo[] = [];
    const selectedRelativePath = options.preserveSelection
      ? this.getSelectedRelativePath()
      : null;

    let nextImportIndex = 0;
    const workerCount = Math.min(
      IMPORT_PREPARE_CONCURRENCY,
      pendingImportFiles.length,
    );
    await Promise.all(
      Array.from({ length: workerCount }, async () => {
        while (true) {
          const index = nextImportIndex;
          nextImportIndex += 1;
          const pendingImportFile = pendingImportFiles[index];
          if (!pendingImportFile) {
            return;
          }

          const preparedImportFile = await preparePendingImportFile(pendingImportFile);
          if (!preparedImportFile) {
            failedNames.push(
              pendingImportFile.sourceFile.name || this.getUnknownFileLabel(),
            );
            continue;
          }

          preparedEntries.push(preparedImportFile.fileEntry);
          importedFiles.push(preparedImportFile.fileInfo);
        }
      }),
    );

    const acceptedCount = importedFiles.length;
    if (acceptedCount > 0 && canApplyResult()) {
      this.replaceImportedFiles(
        preparedEntries,
        importedFiles,
        this.resolveSelectedFileId(importedFiles, selectedRelativePath),
      );
    }

    if (canApplyResult()) {
      this.error = this.buildImportErrorMessage({
        failedNames,
        hasAnyUnsupportedFiles,
      });
      this.syncView();
    }

    finishBatchPerf({
      acceptedCount,
      duplicateCount: 0,
      failedCount: failedNames.length,
      unsupportedCount,
    });
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

  private watchImportedFolder(folder: URI): void {
    this.folderWatcher.watch(folder);
  }

  private clearImportedFolderWatch(): void {
    this.folderWatcher.clear();
  }

  private async refreshImportedFolder(folder: URI): Promise<void> {
    if (this.disposed) {
      return;
    }

    const runId = this.folderRefreshRunId + 1;
    this.folderRefreshRunId = runId;
    const folderKey = folder.toString();

    try {
      const files = await collectFolderFiles(folder, this.filesService);
      if (this.disposed || runId !== this.folderRefreshRunId) {
        return;
      }

      await this.processFiles(files, {
        preserveSelection: true,
        replaceWhenEmpty: true,
        shouldContinue: () =>
          !this.disposed &&
          runId === this.folderRefreshRunId &&
          this.folderWatcher.currentFolderKey === folderKey,
      });
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

  private getSelectedRelativePath(): string | null {
    const selectedFileId = this.effectiveSelectedFileId;
    if (!selectedFileId) {
      return null;
    }

    const selectedFile = this.files.find(file => file.fileId === selectedFileId);
    return normalizeRelativePath(selectedFile?.relativePath);
  }

  private resolveSelectedFileId(
    files: ImportSessionFileInfo[],
    selectedRelativePath: string | null,
  ): string | null {
    if (selectedRelativePath) {
      const matchingFile = files.find(file =>
        normalizeRelativePath(file.relativePath) === selectedRelativePath
      );
      if (matchingFile?.fileId) {
        return matchingFile.fileId;
      }
    }

    return files[0]?.fileId ?? null;
  }

  private buildImportErrorMessage(args: {
    readonly failedNames: string[];
    readonly hasAnyUnsupportedFiles: boolean;
  }): string | null {
    const errors: string[] = [];
    if (args.hasAnyUnsupportedFiles) {
      errors.push(
        localize(
          "import.unsupportedFilesSkipped",
          "Skipped unsupported files in the selected folder. Supported: .csv, .xls, .xlsx",
        ),
      );
    }
    if (args.failedNames.length > 0) {
      errors.push(
        localize(
          "import.failedToParseFiles",
          "Failed to parse: {fileNames}",
          { fileNames: args.failedNames.join(", ") },
        ),
      );
    }

    return errors.length > 0 ? errors.join("\n") : null;
  }
}

function normalizeRelativePath(value: unknown): string | null {
  const relativePath = String(value ?? "").trim();
  return relativePath || null;
}
