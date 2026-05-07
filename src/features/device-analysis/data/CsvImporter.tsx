import React, {
  startTransition,
  useCallback,
  useOptimistic,
  useRef,
  useState,
  useImperativeHandle,
  forwardRef,
  useEffect,
} from "react";
import { Import, FileText, X, AlertCircle } from "lucide-react";
import { cx } from "../../../utils/cx";
import { useLanguage } from "../../../hooks/useLanguage";
import Avatar from "../../../components/ui/Avatar";
import ScrollArea from "../../../components/ui/ScrollArea";
import {
  DEVICE_ANALYSIS_DATA_IMPORT_ACCEPT,
  isSupportedDataImportFileName,
  type ImportedCurveAssessment,
} from "../shared/lib/importFileUtils";
import { startPerf } from "../shared/lib/perf";
import { prepareImportFileInWorker } from "./importWorkerClient";
import { useCsvImporterVirtualization } from "./useCsvImporterVirtualization";
import { collectDroppedImportFiles } from "./preview/csvDropTraversal";
import {
  buildFileIdentityKey,
  buildEntrySourceKey,
  buildItemKey,
  createCsvImporterFileId,
  filterUniqueCsvFiles,
  toDomIdToken,
} from "./preview/csvImportUtils";
import styles from "./CsvImporter.module.css";

export type CsvImporterFileEntry = {
  file?: unknown;
  fileId?: string;
  fileName?: string;
  itemKey?: string;
  normalizedCsvPath?: string | null;
  sourceKey?: string;
  sourcePath?: string | null;
  curveType?: string | null;
  curveTypeConfidence?: "high" | "medium" | "low";
  curveTypeNeedsTemplate?: boolean;
  curveTypeReasons?: string[];
};

type CsvFileEntry = CsvImporterFileEntry & {
  fileId: string;
  file: File;
  itemKey: string;
  sourceKey: string;
};

export type CsvImporterRef = {
  openFileDialog: () => void;
  hasFiles: boolean;
};

type ImportedFileInfo = {
  fileId: string;
  fileName: string;
  file: File;
  size: number;
  lastModified: number;
  normalizedCsvPath?: string | null;
  sourceKey?: string;
  sourcePath?: string | null;
  curveType?: string | null;
  curveTypeConfidence?: "high" | "medium" | "low";
  curveTypeNeedsTemplate?: boolean;
  curveTypeReasons?: string[];
  xAxisRole?: "vg" | "vd" | null;
  xAxisRoleSource?:
    | "filename"
    | "title"
    | "label"
    | "metadata"
    | "shape"
    | null;
};

type PendingImportFile = {
  finishFilePerf: (meta?: Record<string, unknown>) => void;
  sourceFile: File;
  sourceKey: string;
};

export type CsvImporterProps = {
  files?: CsvImporterFileEntry[];
  onDataImported?: (fileInfo: ImportedFileInfo) => void;
  onDataRemoved?: (fileId: string) => void;
  onFileSelected?: (fileId: string | null) => void;
  selectedFileId?: string | null;
};

type CsvFileItemProps = {
  fileEntry: CsvImporterFileEntry;
  isSelected: boolean;
  onSelect?: (fileId: string | null) => void;
  onRemove?: (fileId: string | null) => void;
};

const CsvFileItem = React.memo(
  ({
    fileEntry,
    isSelected,
    onSelect,
    onRemove,
  }: CsvFileItemProps) => {
    const fileName =
      fileEntry?.file && typeof fileEntry.file === "object" && "name" in fileEntry.file
        ? String(fileEntry.file.name ?? "")
        : String(fileEntry?.fileName ?? "");
    const needsReview =
      fileEntry?.curveTypeNeedsTemplate === true ||
      fileEntry?.curveTypeConfidence === "low";
    const autoSummary = fileEntry?.curveType
      ? `Auto: ${String(fileEntry.curveType).trim()}${
          fileEntry?.curveTypeConfidence
            ? ` (${String(fileEntry.curveTypeConfidence).trim()})`
            : ""
        }`
      : "";

    return (
      <div
        aria-label="csv-file-item"
        id={
          fileEntry?.itemKey
            ? `csv-file-item-${toDomIdToken(fileEntry.itemKey)}`
            : undefined
        }
        data-item-key={fileEntry?.itemKey || undefined}
        data-selected={isSelected ? "true" : undefined}
        title={fileName}
        onClick={() => onSelect?.(fileEntry?.fileId ?? null)}
        className={cx(
          styles.fileItem,
          "group",
          isSelected && styles.fileItemSelected,
        )}
      >
        <div className={styles.fileContent}>
          <div className={styles.fileIcon}>
            <FileText size={16} />
          </div>
          <div className={styles.fileText}>
            <span className={styles.fileName}>{fileName}</span>
            {autoSummary ? (
              <span
                className={cx(
                  styles.fileMeta,
                  needsReview && styles.fileMetaWarning,
                )}
              >
                {autoSummary}
              </span>
            ) : null}
          </div>
        </div>
        <div className={styles.fileActions}>
          <button
            type="button"
            aria-label="Remove CSV file"
            id={
              fileEntry?.itemKey
                ? `csv-file-remove-${toDomIdToken(fileEntry.itemKey)}`
                : undefined
            }
            data-item-key={fileEntry?.itemKey || undefined}
            onClick={(e) => {
              e.stopPropagation();
              onRemove?.(fileEntry.fileId ?? null);
            }}
            className={styles.fileRemove}
          >
            <X size={16} />
          </button>
        </div>
      </div>
    );
  },
);

CsvFileItem.displayName = "CsvFileItem";

const IMPORT_PREPARE_CONCURRENCY = 2;

const CsvImporter = forwardRef<CsvImporterRef, CsvImporterProps>(
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
    const [isDragging, setIsDragging] = useState(false);
    const isControlled = Array.isArray(externalFiles);
    const [internalFiles, setInternalFiles] = useState<CsvFileEntry[]>([]);
    const files = (isControlled ? externalFiles : internalFiles) ?? [];
    const setFiles = isControlled ? null : setInternalFiles;
    const [error, setError] = useState<string | null>(null);

    const containerRef = useRef<HTMLDivElement | null>(null);
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

    useEffect(() => {
      const viewport = containerRef.current;
      if (!viewport) return;

      const updateAutoScrollState = () => {
        const distanceToBottom =
          viewport.scrollHeight - viewport.clientHeight - viewport.scrollTop;
        shouldAutoScrollToBottomRef.current = distanceToBottom <= 24;
      };

      updateAutoScrollState();
      viewport.addEventListener("scroll", updateAutoScrollState, {
        passive: true,
      });

      return () => {
        viewport.removeEventListener("scroll", updateAutoScrollState);
      };
    }, []);

    useEffect(() => {
      const viewport = containerRef.current;
      const previousCount = prevFileCountRef.current;
      const nextCount = files.length;
      const hasAddedFiles = nextCount > previousCount;

      if (viewport && hasAddedFiles && shouldAutoScrollToBottomRef.current) {
        viewport.scrollTo({
          top: viewport.scrollHeight,
          behavior: previousCount === 0 ? "auto" : "smooth",
        });
      }

      prevFileCountRef.current = nextCount;
    }, [files.length]);

    const virtual = useCsvImporterVirtualization({
      containerRef,
      files,
    });

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
      const selectedFiles = Array.from(event.target.files ?? []);
      void processFiles(selectedFiles);
      // Reset input value to allow selecting same files again if needed
      event.target.value = "";
    };

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

    const handleSelectFile = useCallback(
      (fileId: string | null) => {
        const next = typeof fileId === "string" ? fileId : null;
        if (!next) return;
        setEffectiveSelectedFileId(next);
      },
      [setEffectiveSelectedFileId],
    );

    const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragging(true);
    };

    const handleDragLeave = () => {
      setIsDragging(false);
    };

    const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragging(false);
      const droppedFiles = await collectDroppedImportFiles(e.dataTransfer);

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
      // Notify parent to remove data
      if (onDataRemoved) {
        onDataRemoved(fileId);
      }
    }, [
      onDataRemoved,
      optimisticSelectedFileId,
      setEffectiveSelectedFileId,
      setFiles,
    ]);

    return (
      <>
        <ScrollArea
          ref={containerRef}
          axis="y"
          id="device-analysis-csv-dropzone"
          aria-label={t("da_import_section")}
          data-state={files.length === 0 ? "empty" : "filled"}
          className={cx(
            styles.dropzone,
            isDragging ? styles.dropzoneDragging : styles.dropzoneIdle,
          )}
          viewportClassName={styles.dropzoneViewport}
          viewportProps={{
            onDragOver: handleDragOver,
            onDragLeave: handleDragLeave,
            onDrop: handleDrop,
          }}
          onClick={
            files.length === 0 ? () => fileInputRef.current?.click() : undefined
          }
        >
          <input
            id="device-analysis-csv-file-input"
            type="file"
            multiple
            accept={DEVICE_ANALYSIS_DATA_IMPORT_ACCEPT}
            className="hidden"
            aria-label={t("da_import_csv")}
            ref={fileInputRef}
            onChange={handleFileChange}
            onClick={(e) => e.stopPropagation()}
          />

          {files.length === 0 ? (
            <div
              id="device-analysis-csv-empty"
              data-slot="empty"
              className={styles.empty}
            >
              <Avatar icon={Import} size="lg" variant="empty" />
              <p className={styles.emptySubtitle}>
                {t("da_csv_empty_subtitle_prefix")}{" "}
                <span className={styles.emptyBrowse}>
                  {t("da_csv_empty_browse")}
                </span>
              </p>
            </div>
          ) : (
            <div
              id="device-analysis-import-scroll"
              data-slot="filled"
              className="w-full min-h-full flex flex-col p-3"
            >
              {virtual.enabled ? (
                <div className={styles.virtualStage} style={virtual.stageStyle}>
                  <div
                    className={styles.fileGrid}
                    style={{
                      ...virtual.gridStyle,
                      position: "absolute",
                      top: 0,
                      left: 0,
                      right: 0,
                    }}
                  >
                    {virtual.visibleFiles.map((fileEntry) => (
                      <CsvFileItem
                        key={fileEntry.fileId}
                        fileEntry={fileEntry}
                        isSelected={effectiveSelectedFileId === fileEntry.fileId}
                        onSelect={handleSelectFile}
                        onRemove={removeFile}
                      />
                    ))}
                  </div>
                </div>
              ) : (
                <div className={styles.fileGrid}>
                  {virtual.visibleFiles.map((fileEntry) => (
                    <CsvFileItem
                      key={fileEntry.fileId}
                      fileEntry={fileEntry}
                      isSelected={effectiveSelectedFileId === fileEntry.fileId}
                      onSelect={handleSelectFile}
                      onRemove={removeFile}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </ScrollArea>

        {error && (
          <div className="flex items-center gap-2 p-3 text-sm text-red-500 bg-red-500/10 rounded-lg mt-4 whitespace-pre-wrap">
            <AlertCircle size={16} />
            {error}
          </div>
        )}
      </>
    );
  },
);

CsvImporter.displayName = "CsvImporter";

export default CsvImporter;
