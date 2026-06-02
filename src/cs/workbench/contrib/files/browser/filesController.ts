import type { ListHandle } from "src/cs/base/browser/ui/list/list";
import type { IDisposable } from "src/cs/base/common/lifecycle";
import { URI } from "src/cs/base/common/uri";
import { IFileDialogService, type IFileDialogService as IFileDialogServiceType } from "src/cs/platform/dialogs/common/dialogs";
import { FileType, IFileService, type IFileContent } from "src/cs/platform/files/common/files";
import { fileService } from "src/cs/platform/files/browser/fileService";
import { localize } from "src/cs/nls";
import type { TranslateFn } from "src/cs/platform/language/common/language";
import { startPerf } from "src/cs/workbench/common/deviceAnalysis/perf";
import { fileDialogService } from "src/cs/workbench/services/dialogs/electron-browser/fileDialogService";
import {
  ExplorerView,
  type ExplorerViewProps,
} from "src/cs/workbench/contrib/files/browser/views/explorerView";
import type {
  FileEntry,
  FileSource,
  FilesPaneRef,
} from "src/cs/workbench/contrib/files/common/files";
import {
  isExcelDataFileName,
  isSupportedDataFileName,
} from "src/cs/workbench/contrib/files/common/files";
import {
  collectPendingImports,
  prepareImportFile,
  type ImportedSessionFileEntry,
  type ImportSessionFileInfo,
} from "src/cs/workbench/services/import/browser/importPipeline";

export type FilesControllerProps = {
  files?: FileEntry[];
  onFileImported?: (fileInfo: ImportSessionFileInfo) => void;
  onFilesReplaced?: (files: ImportSessionFileInfo[]) => void;
  onFileRemoved?: (fileId: string) => void;
  onFileSelected?: (fileId: string | null) => void;
  selectedFileId?: string | null;
  readonly t: TranslateFn;
};

export type {
  ImportSessionFileInfo,
  FilesPaneRef,
};

const IMPORT_PREPARE_CONCURRENCY = 2;
const MAX_FOLDER_WALK_DEPTH = 32;
const WINDOWS_DRIVE_PREFIX = /^[a-zA-Z]:[\\/]/;

function joinFsPath(parent: string, name: string): string {
  const separator = parent.includes("\\") || WINDOWS_DRIVE_PREFIX.test(parent) ? "\\" : "/";
  const trimmedParent = parent.replace(/[\\/]+$/, "");
  return `${trimmedParent}${separator}${name}`;
}

function getPathBaseName(path: string): string {
  const normalized = path.trim().replace(/[\\/]+$/, "");
  const separatorIndex = Math.max(
    normalized.lastIndexOf("/"),
    normalized.lastIndexOf("\\"),
  );

  return separatorIndex >= 0 ? normalized.slice(separatorIndex + 1) : normalized;
}

function getFileMimeType(fileName: string): string {
  if (isExcelDataFileName(fileName)) {
    return "application/octet-stream";
  }

  return "text/csv;charset=utf-8";
}

function decodeBase64(value: string): ArrayBuffer {
  const binary = atob(value);
  const buffer = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buffer);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return buffer;
}

function toFilePart(content: IFileContent): string | ArrayBuffer {
  return content.encoding === "base64" ? decodeBase64(content.value) : content.value;
}

export class FilesController implements FilesPaneRef, IDisposable {
  private readonly listRef: { current: ListHandle | null } = { current: null };
  private readonly shouldAutoScrollToBottomRef = { current: true };
  private explorerView: ExplorerView | null = null;
  private props: FilesControllerProps;
  private internalFiles: ImportedSessionFileEntry[] = [];
  private error: string | null = null;
  private isDragging = false;
  private optimisticSelectedFileId: string | null = null;
  private prevFileCount = 0;
  private disposed = false;

  constructor(
    host: HTMLElement,
    props: FilesControllerProps,
    @IFileService private readonly filesService = fileService,
    @IFileDialogService private readonly dialogsService = fileDialogService,
  ) {
    this.props = props;
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
      t: this.props.t,
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
        title: localize("import.pickFolderTitle", "选择要导入的文件夹"),
        openLabel: localize("import.openFolderButton", "打开文件夹"),
      });
      const folderPath = folders?.[0]?.fsPath ?? null;
      if (!folderPath || this.disposed) {
        return;
      }

      const files = await this.collectFolderFiles(folderPath);
      if (this.disposed) {
        return;
      }

      this.handleSelectFiles(files);
    } catch {
      if (this.disposed) {
        return;
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

  private async processFiles(newFiles: FileSource[]): Promise<void> {
    const finishBatchPerf = startPerf("import:add-files", {
      currentCount: 0,
      incomingCount: newFiles.length,
    });

    this.error = null;
    this.syncView();

    const failedNames: string[] = [];
    const {
      hasAnyUnsupportedFiles,
      pendingImports,
      unsupportedCount,
    } = collectPendingImports(
      newFiles,
    );
    if (pendingImports.length === 0) {
      finishBatchPerf({
        acceptedCount: 0,
        duplicateCount: 0,
        failedCount: 0,
        unsupportedCount,
      });
      this.error = this.buildImportErrorMessage({
        failedNames,
        hasAnyUnsupportedFiles,
      });
      this.syncView();
      return;
    }

    const preparedEntries: ImportedSessionFileEntry[] = [];
    const importedFiles: ImportSessionFileInfo[] = [];

    let nextImportIndex = 0;
    const workerCount = Math.min(
      IMPORT_PREPARE_CONCURRENCY,
      pendingImports.length,
    );
    await Promise.all(
      Array.from({ length: workerCount }, async () => {
        while (true) {
          const index = nextImportIndex;
          nextImportIndex += 1;
          const pendingImport = pendingImports[index];
          if (!pendingImport) {
            return;
          }

          const preparedImport = await prepareImportFile(pendingImport);
          if (!preparedImport) {
            failedNames.push(
              pendingImport.sourceFile.name || this.getUnknownFileLabel(),
            );
            continue;
          }

          preparedEntries.push(preparedImport.fileEntry);
          importedFiles.push(preparedImport.fileInfo);
        }
      }),
    );

    const acceptedCount = importedFiles.length;
    if (acceptedCount > 0) {
      this.replaceImportedFiles(preparedEntries, importedFiles);
    }

    this.error = this.buildImportErrorMessage({
      failedNames,
      hasAnyUnsupportedFiles,
    });
    this.syncView();

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

  private async collectFolderFiles(folderPath: string): Promise<FileSource[]> {
    const rootName = getPathBaseName(folderPath) || localize("import.folder", "Folder");
    const root = URI.file(folderPath);
    const files: FileSource[] = [];

    await this.collectFolderFilesAt(root, rootName, files, 0);
    return files;
  }

  private async collectFolderFilesAt(
    folder: URI,
    relativeFolderPath: string,
    files: FileSource[],
    depth: number,
  ): Promise<void> {
    if (depth > MAX_FOLDER_WALK_DEPTH) {
      return;
    }

    const entries = await this.filesService.readDir(folder);
    for (const [name, type] of entries) {
      const child = URI.file(joinFsPath(folder.fsPath, name));
      const relativePath = `${relativeFolderPath}/${name}`;

      if ((type & FileType.Directory) === FileType.Directory) {
        await this.collectFolderFilesAt(child, relativePath, files, depth + 1);
        continue;
      }

      if ((type & FileType.File) !== FileType.File || !isSupportedDataFileName(name)) {
        continue;
      }

      files.push({
        file: await this.readFileSource(child, name),
        relativePath,
      });
    }
  }

  private async readFileSource(resource: URI, name: string): Promise<File> {
    const stat = await this.filesService.stat(resource);
    const content = await this.filesService.readFile(resource, {
      encoding: isExcelDataFileName(name) ? "base64" : "utf8",
    });

    return new File([toFilePart(content)], name, {
      lastModified: Number.isFinite(stat.mtime) ? stat.mtime : Date.now(),
      type: getFileMimeType(name),
    });
  }

  private getUnknownFileLabel(): string {
    return localize("import.unknownFile", "Unknown file");
  }

  private replaceImportedFiles(
    fileEntries: ImportedSessionFileEntry[],
    importedFiles: ImportSessionFileInfo[],
  ): void {
    const nextSelectedFileId = importedFiles[0]?.fileId ?? null;
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
