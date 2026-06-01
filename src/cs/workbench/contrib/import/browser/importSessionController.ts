import type { ListHandle } from "src/cs/base/browser/ui/list/list";
import type { IDisposable } from "src/cs/base/common/lifecycle";
import { localize } from "src/cs/nls";
import { startPerf } from "src/cs/workbench/common/deviceAnalysis/perf";
import type { FileSource } from "src/cs/workbench/contrib/files/browser/fileImportExport";
import {
  collectPendingImports,
  prepareImportFile,
  type SessionFileEntry,
} from "src/cs/workbench/contrib/import/browser/importSession";
import {
  ExplorerView,
  type ExplorerViewProps,
} from "src/cs/workbench/contrib/files/browser/views/explorerView";
import type { FileEntry } from "src/cs/workbench/contrib/files/common/files";
import {
  type ImportSessionFileInfo,
  type ImportSessionRef,
} from "src/cs/workbench/contrib/import/common/types";
import type { TranslateFn } from "src/cs/platform/language/common/language";

export type ImportSessionProps = {
  files?: FileEntry[];
  onFileImported?: (fileInfo: ImportSessionFileInfo) => void;
  onFilesReplaced?: (files: ImportSessionFileInfo[]) => void;
  onFileRemoved?: (fileId: string) => void;
  onFileSelected?: (fileId: string | null) => void;
  selectedFileId?: string | null;
};

export type ImportSessionControllerProps = ImportSessionProps & {
  readonly t: TranslateFn;
};

export type { ImportSessionFileInfo, ImportSessionRef };

const IMPORT_PREPARE_CONCURRENCY = 2;

export class ImportSessionController implements ImportSessionRef, IDisposable {
  private readonly listRef: { current: ListHandle | null } = { current: null };
  private readonly shouldAutoScrollToBottomRef = { current: true };
  private explorerView: ExplorerView | null = null;
  private props: ImportSessionControllerProps;
  private internalFiles: SessionFileEntry[] = [];
  private error: string | null = null;
  private isDragging = false;
  private optimisticSelectedFileId: string | null = null;
  private prevFileCount = 0;
  private disposed = false;

  constructor(host: HTMLElement, props: ImportSessionControllerProps) {
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

  setProps(nextProps: ImportSessionControllerProps): void {
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

    const preparedEntries: SessionFileEntry[] = [];
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

  private getUnknownFileLabel(): string {
    return localize("import.unknownFile", "Unknown file");
  }

  private replaceImportedFiles(
    fileEntries: SessionFileEntry[],
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
