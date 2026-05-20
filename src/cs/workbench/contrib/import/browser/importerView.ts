import {
  startTransition,
  useCallback,
  useEffect,
  useImperativeHandle,
  useOptimistic,
  useRef,
  useState,
  forwardRef,
  type ChangeEvent,
  type DragEvent,
} from "react";
import { jsx } from "react/jsx-runtime";
import type { ListHandle } from "src/cs/base/browser/ui/list/list";
import { useLanguage } from "src/cs/workbench/browser/hooks/useLanguage";
import { startPerf } from "src/cs/workbench/common/deviceAnalysis/perf";
import type { ImportedCurveAssessment } from "src/cs/workbench/common/deviceAnalysis/importFileUtils";
import { isSupportedDataImportFileName } from "src/cs/workbench/contrib/import/common/constants";
import {
  buildEntrySourceKey,
  buildFileIdentityKey,
  buildItemKey,
  createCsvImporterFileId,
  filterUniqueCsvFiles,
} from "src/cs/workbench/contrib/import/common/utils";
import {
  type ImportedFileInfo,
  type ImporterFileEntry,
  type ImporterRef,
} from "src/cs/workbench/contrib/import/common/types";
import { collectDroppedImportFiles } from "src/cs/workbench/contrib/import/browser/csvDropTraversal";
import { prepareImportFileInWorker } from "src/cs/workbench/contrib/import/browser/rustClient";
import ImportViewer from "src/cs/workbench/contrib/import/browser/views/importViewer";

type CsvFileEntry = ImporterFileEntry & {
  fileId: string;
  file: File;
  itemKey: string;
  sourceKey: string;
};

type PendingImportFile = {
  finishFilePerf: (meta?: Record<string, unknown>) => void;
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

export type { ImportedFileInfo, ImporterFileEntry, ImporterRef };

const IMPORT_PREPARE_CONCURRENCY = 2;

const ImporterView = forwardRef<ImporterRef, ImporterViewProps>(
  (
    {
      files: externalFiles,
      onDataImported,
      onDataRemoved,
      onFileSelected,
      selectedFileId,
    },
    ref,
  ) => {
    const { t } = useLanguage();

    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const listRef = useRef<ListHandle | null>(null);
    const [isDragging, setIsDragging] = useState(false);
    const isControlled = Array.isArray(externalFiles);
    const [internalFiles, setInternalFiles] = useState<CsvFileEntry[]>([]);
    const files = (isControlled ? externalFiles : internalFiles) ?? [];
    const setFiles = isControlled ? null : setInternalFiles;
    const [error, setError] = useState<string | null>(null);

    const prevFileCountRef = useRef(files.length);
    const shouldAutoScrollToBottomRef = useRef(true);

    const [optimisticSelectedFileId, setOptimisticSelectedFileId] =
      useOptimistic<string | null>(selectedFileId ?? null);

    const effectiveSelectedFileId = optimisticSelectedFileId ?? selectedFileId;

    const setEffectiveSelectedFileId = useCallback(
      (next: string | null) => {
        setOptimisticSelectedFileId(next);
        if (!onFileSelected) return;
        startTransition(() => {
          onFileSelected(next);
        });
      },
      [onFileSelected, setOptimisticSelectedFileId],
    );

    useImperativeHandle(
      ref,
      () => ({
        openFileDialog: () => {
          setError(null);
          if (fileInputRef.current) {
            fileInputRef.current.click();
          }
        },
        hasFiles: files.length > 0,
      }),
      [files],
    );

    const handleListScroll = useCallback((event: Event) => {
      const viewport = event.currentTarget;
      if (!(viewport instanceof HTMLElement)) return;

      const distanceToBottom =
        viewport.scrollHeight - viewport.clientHeight - viewport.scrollTop;
      shouldAutoScrollToBottomRef.current = distanceToBottom <= 24;
    }, []);

    useEffect(() => {
      if (files.length === 0) {
        shouldAutoScrollToBottomRef.current = true;
      }
    }, [files.length]);

    useEffect(() => {
      const previousCount = prevFileCountRef.current;
      const nextCount = files.length;
      const hasAddedFiles = nextCount > previousCount;

      if (hasAddedFiles && shouldAutoScrollToBottomRef.current) {
        listRef.current?.scrollToEnd(previousCount === 0 ? "auto" : "smooth");
      }

      prevFileCountRef.current = nextCount;
    }, [files.length]);

    const processFiles = useCallback(async (newFiles: File[]) => {
      const finishBatchPerf = startPerf("import:add-files", {
        currentCount: files.length,
        incomingCount: newFiles.length,
      });
      setError(null);
      const uniqueFiles = filterUniqueCsvFiles(files, newFiles);

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
        files.map((entry) => buildEntrySourceKey(entry)).filter(Boolean),
      );
      const failedNames: string[] = [];
      let acceptedCount = 0;
      let duplicateCount = newFiles.length - uniqueFiles.length;
      let hasAnyUnsupportedFiles = false;
      let unsupportedCount = 0;
      const pendingImports: PendingImportFile[] = [];

      for (const sourceFile of uniqueFiles) {
        const finishFilePerf = startPerf("import:prepare-file", {
          fileName: sourceFile.name,
          sizeBytes: sourceFile.size,
        });
        const sourceKey = buildFileIdentityKey(sourceFile);
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
          sourceFile,
          sourceKey,
        });
      }

      let nextImportIndex = 0;
      const prepareOneFile = async ({
        finishFilePerf,
        sourceFile,
        sourceKey,
      }: PendingImportFile) => {
        let normalizedFile: File;
        let normalizedCsvPath: string | null = null;
        let curveAssessment: ImportedCurveAssessment;
        let sourcePath: string | null = null;
        try {
          const finishWorkerPerf = startPerf(
            "import:worker-prepare-file",
            {
              fileName: sourceFile.name,
              sizeBytes: sourceFile.size,
            },
          );
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
          itemKey: buildItemKey(normalizedFile),
          normalizedCsvPath,
          sourceKey,
          sourcePath,
          curveType: curveAssessment.curveType,
          curveTypeConfidence: curveAssessment.curveTypeConfidence,
          curveTypeNeedsTemplate: curveAssessment.curveTypeNeedsTemplate,
          curveTypeReasons: curveAssessment.curveTypeReasons,
        };

        if (setFiles) {
          setFiles((prev) => {
            if (prev.some((entry) => buildEntrySourceKey(entry) === sourceKey)) {
              return prev;
            }
            return [...prev, fileEntry];
          });
        }

        onDataImported?.({
          fileId,
          fileName: sourceFile.name,
          file: normalizedFile,
          size: normalizedFile.size,
          lastModified: normalizedFile.lastModified,
          normalizedCsvPath,
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
            if (!pendingImport) return;
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
      setError(errors.length > 0 ? errors.join("\n") : null);
      finishBatchPerf({
        acceptedCount,
        duplicateCount,
        failedCount: failedNames.length,
        unsupportedCount,
      });
    }, [files, onDataImported, setFiles]);

    const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
      const selectedFiles = Array.from(event.target.files ?? []);
      void processFiles(selectedFiles);
      event.target.value = "";
    };

    const handleSelectFile = useCallback(
      (fileId: string | null) => {
        const next = typeof fileId === "string" ? fileId : null;
        if (!next) return;
        setEffectiveSelectedFileId(next);
      },
      [setEffectiveSelectedFileId],
    );

    const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setIsDragging(true);
    };

    const handleDragLeave = () => {
      setIsDragging(false);
    };

    const handleDrop = async (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setIsDragging(false);
      const droppedFiles = await collectDroppedImportFiles(event.dataTransfer);

      if (droppedFiles.length === 0) {
        setError("No supported files found in dropped items (.csv, .xls, .xlsx).");
      } else {
        void processFiles(droppedFiles);
      }
    };

    const removeFile = useCallback((fileId: string | null) => {
      if (typeof fileId !== "string") return;
      if (optimisticSelectedFileId === fileId) {
        setEffectiveSelectedFileId(null);
      }
      if (setFiles) {
        setFiles((prev) => prev.filter((entry) => entry.fileId !== fileId));
      }
      if (onDataRemoved) {
        onDataRemoved(fileId);
      }
    }, [
      onDataRemoved,
      optimisticSelectedFileId,
      setEffectiveSelectedFileId,
      setFiles,
    ]);

    return jsx(ImportViewer, {
      effectiveSelectedFileId,
      error,
      fileInputRef,
      files,
      isDragging,
      listRef,
      onDragLeave: handleDragLeave,
      onDragOver: handleDragOver,
      onDrop: handleDrop,
      onFileChange: handleFileChange,
      onListScroll: handleListScroll,
      onRemoveFile: removeFile,
      onSelectFile: handleSelectFile,
      t,
    });
  },
);

ImporterView.displayName = "ImporterView";

export default ImporterView;
