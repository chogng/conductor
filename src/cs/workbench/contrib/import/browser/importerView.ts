import type { ListHandle } from "src/cs/base/browser/ui/list/list";
import type { IDisposable } from "src/cs/base/common/lifecycle";
import { startPerf } from "src/cs/workbench/common/deviceAnalysis/perf";
import type { ImportedCurveAssessment } from "src/cs/workbench/common/deviceAnalysis/importFileUtils";
import { collectDroppedImportFiles } from "src/cs/workbench/contrib/import/browser/csvDropTraversal";
import type { ImportSourceFile } from "src/cs/workbench/contrib/import/browser/importSourceFile";
import { prepareImportFileInWorker } from "src/cs/workbench/contrib/import/browser/rustClient";
import {
  ImportViewerView,
  type ImportViewerProps,
} from "src/cs/workbench/contrib/import/browser/views/importViewer";
import { isSupportedDataImportFileName } from "src/cs/workbench/contrib/import/common/constants";
import {
  type ImportedFileInfo,
  type ImporterFileEntry,
  type ImporterRef,
} from "src/cs/workbench/contrib/import/common/types";
import {
  buildEntrySourceKey,
  buildFileIdentityKey,
  buildItemKey,
  createCsvImporterFileId,
  filterUniqueCsvFiles,
} from "src/cs/workbench/contrib/import/common/utils";
import type { TranslateFn } from "src/cs/platform/language/common/language";

type CsvFileEntry = ImporterFileEntry & {
  fileId: string;
  file: File;
  itemKey: string;
  sourceKey: string;
};

type PendingImportFile = {
  finishFilePerf: (meta?: Record<string, unknown>) => void;
  relativePath: string | null;
  sourceFile: File;
  sourceKey: string;
};

export type ImporterViewProps = {
  files?: ImporterFileEntry[];
  onDataImported?: (fileInfo: ImportedFileInfo) => void;
  onDataRemoved?: (fileId: string) => void;
  onFileSelected?: (fileId: string | null) => void;
  selectedFileId?: string | null;
};

export type ImporterViewControllerProps = ImporterViewProps & {
  readonly t: TranslateFn;
};

export type { ImportedFileInfo, ImporterFileEntry, ImporterRef };

const IMPORT_PREPARE_CONCURRENCY = 2;

export class ImporterViewController implements ImporterRef, IDisposable {
  private readonly listRef: { current: ListHandle | null } = { current: null };
  private readonly shouldAutoScrollToBottomRef = { current: true };
  private viewer: ImportViewerView | null = null;
  private props: ImporterViewControllerProps;
  private internalFiles: CsvFileEntry[] = [];
  private error: string | null = null;
  private isDragging = false;
  private optimisticSelectedFileId: string | null = null;
  private prevFileCount = 0;
  private disposed = false;

  constructor(host: HTMLElement, props: ImporterViewControllerProps) {
    this.props = props;
    this.prevFileCount = this.files.length;
    this.optimisticSelectedFileId = props.selectedFileId ?? null;

    this.viewer = new ImportViewerView(host, this.createViewerProps());
    this.listRef.current = this.viewer.getListHandle();
  }

  get hasFiles(): boolean {
    return this.files.length > 0;
  }

  openFileDialog(): void {
    this.error = null;
    this.syncView();
    this.viewer?.openFileDialog();
  }

  setProps(nextProps: ImporterViewControllerProps): void {
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
    this.viewer?.dispose();
    this.viewer = null;
    this.listRef.current = null;
  }

  private get files(): ImporterFileEntry[] {
    return Array.isArray(this.props.files) ? this.props.files : this.internalFiles;
  }

  private get isControlled(): boolean {
    return Array.isArray(this.props.files);
  }

  private get effectiveSelectedFileId(): string | null {
    return this.optimisticSelectedFileId ?? this.props.selectedFileId ?? null;
  }

  private createViewerProps(): ImportViewerProps {
    return {
      effectiveSelectedFileId: this.effectiveSelectedFileId,
      error: this.error,
      files: this.files,
      isDragging: this.isDragging,
      onClearError: this.handleClearError,
      onDraggingChange: this.handleDraggingChange,
      onDropFiles: this.handleDropFiles,
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

    this.viewer?.setProps(this.createViewerProps());
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

  private readonly handleSelectFiles = (selectedFiles: ImportSourceFile[]): void => {
    this.isDragging = false;
    void this.processFiles(selectedFiles);
  };

  private readonly handleDropFiles = async (
    dataTransfer: DataTransfer | null,
  ): Promise<void> => {
    this.isDragging = false;

    if (!dataTransfer) {
      this.error = "No supported files found in dropped items (.csv, .xls, .xlsx).";
      this.syncView();
      return;
    }

    const droppedFiles = await collectDroppedImportFiles(dataTransfer);
    if (droppedFiles.length === 0) {
      this.error = "No supported files found in dropped items (.csv, .xls, .xlsx).";
      this.syncView();
      return;
    }

    await this.processFiles(droppedFiles);
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

    this.props.onDataRemoved?.(fileId);
    this.handleFileCountEffects();
    this.syncView();
  };

  private async processFiles(newFiles: ImportSourceFile[]): Promise<void> {
    const finishBatchPerf = startPerf("import:add-files", {
      currentCount: this.files.length,
      incomingCount: newFiles.length,
    });

    this.error = null;
    this.syncView();

    const uniqueFiles = filterUniqueCsvFiles(this.files, newFiles);
    if (uniqueFiles.length === 0 && newFiles.length > 0) {
      finishBatchPerf({
        acceptedCount: 0,
        duplicateCount: newFiles.length,
        failedCount: 0,
        unsupportedCount: 0,
      });
      return;
    }

    const seenSourceKeys = new Set(
      this.files.map((entry) => buildEntrySourceKey(entry)).filter(Boolean),
    );
    const failedNames: string[] = [];
    let acceptedCount = 0;
    let duplicateCount = newFiles.length - uniqueFiles.length;
    let hasAnyUnsupportedFiles = false;
    let unsupportedCount = 0;
    const pendingImports: PendingImportFile[] = [];

    for (const source of uniqueFiles) {
      const sourceFile = source.file;
      const relativePath = source.relativePath?.trim() || null;
      const finishFilePerf = startPerf("import:prepare-file", {
        fileName: sourceFile.name,
        sizeBytes: sourceFile.size,
      });
      const sourceKey = buildFileIdentityKey(sourceFile, relativePath);
      if (!sourceKey || seenSourceKeys.has(sourceKey)) {
        duplicateCount += 1;
        finishFilePerf({ skipped: "duplicate" });
        continue;
      }
      seenSourceKeys.add(sourceKey);

      if (!isSupportedDataImportFileName(sourceFile.name)) {
        hasAnyUnsupportedFiles = true;
        unsupportedCount += 1;
        finishFilePerf({ skipped: "unsupported" });
        continue;
      }

      pendingImports.push({
        finishFilePerf,
        relativePath,
        sourceFile,
        sourceKey,
      });
    }

    let nextImportIndex = 0;
    const prepareOneFile = async ({
      finishFilePerf,
      relativePath,
      sourceFile,
      sourceKey,
    }: PendingImportFile) => {
      let normalizedFile: File;
      let normalizedCsvPath: string | null = null;
      let curveAssessment: ImportedCurveAssessment;
      let sourcePath: string | null = null;

      try {
        const finishWorkerPerf = startPerf("import:worker-prepare-file", {
          fileName: sourceFile.name,
          sizeBytes: sourceFile.size,
        });
        const prepared = await prepareImportFileInWorker(sourceFile);
        normalizedFile = prepared.file;
        normalizedCsvPath = prepared.normalizedCsvPath ?? null;
        curveAssessment = prepared.assessment;
        sourcePath = prepared.sourcePath ?? null;
        finishWorkerPerf({
          confidence: curveAssessment.curveTypeConfidence,
          curveType: curveAssessment.curveType,
          normalizedName: normalizedFile.name,
          normalizedSizeBytes: normalizedFile.size,
          xAxisRole: curveAssessment.xAxisRole,
        });
      } catch {
        failedNames.push(sourceFile.name || "Unknown file");
        finishFilePerf({ failed: "worker-prepare" });
        return;
      }

      const fileId = createCsvImporterFileId();
      const fileEntry: CsvFileEntry = {
        fileId,
        file: normalizedFile,
        itemKey: buildItemKey(normalizedFile, relativePath),
        normalizedCsvPath,
        relativePath,
        sourceKey,
        sourcePath,
        curveType: curveAssessment.curveType,
        curveTypeConfidence: curveAssessment.curveTypeConfidence,
        curveTypeNeedsTemplate: curveAssessment.curveTypeNeedsTemplate,
        curveTypeReasons: curveAssessment.curveTypeReasons,
      };

      if (!this.isControlled) {
        if (this.internalFiles.some((entry) => buildEntrySourceKey(entry) === sourceKey)) {
          return;
        }
        this.internalFiles = [...this.internalFiles, fileEntry];
        this.handleFileCountEffects();
        this.syncView();
      }

      this.props.onDataImported?.({
        fileId,
        fileName: sourceFile.name,
        file: normalizedFile,
        size: normalizedFile.size,
        lastModified: normalizedFile.lastModified,
        normalizedCsvPath,
        relativePath,
        sourceKey,
        sourcePath,
        curveType: curveAssessment.curveType,
        curveTypeConfidence: curveAssessment.curveTypeConfidence,
        curveTypeNeedsTemplate: curveAssessment.curveTypeNeedsTemplate,
        curveTypeReasons: curveAssessment.curveTypeReasons,
        xAxisRole: curveAssessment.xAxisRole,
        xAxisRoleSource: curveAssessment.xAxisRoleSource,
      });
      acceptedCount += 1;
      finishFilePerf({
        accepted: true,
        curveType: curveAssessment.curveType,
        confidence: curveAssessment.curveTypeConfidence,
        fileId,
        normalizedSizeBytes: normalizedFile.size,
      });
    };

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
          await prepareOneFile(pendingImport);
        }
      }),
    );

    const errors: string[] = [];
    if (hasAnyUnsupportedFiles) {
      errors.push("Skipped unsupported files. Supported: .csv, .xls, .xlsx");
    }
    if (failedNames.length > 0) {
      errors.push(`Failed to parse: ${failedNames.join(", ")}`);
    }
    this.error = errors.length > 0 ? errors.join("\n") : null;
    this.syncView();

    finishBatchPerf({
      acceptedCount,
      duplicateCount,
      failedCount: failedNames.length,
      unsupportedCount,
    });
  }
}
