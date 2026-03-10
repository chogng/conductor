import React, {
  startTransition,
  useCallback,
  useMemo,
  useOptimistic,
  useRef,
  useState,
  useImperativeHandle,
  forwardRef,
  useEffect,
} from "react";
import { Upload, FileText, X, AlertCircle } from "lucide-react";
import { cx } from "../../../utils/cx";
import { stableItemKey } from "../../../utils/stableKey";
import { useLanguage } from "../../../hooks/useLanguage";
import Avatar from "../../../components/ui/Avatar";
import ScrollArea from "../../../components/ui/ScrollArea";
import styles from "./CsvImporter.module.css";

type CsvFileEntry = {
  fileId: string;
  file: File;
  itemKey: string;
};

type CsvImporterRef = {
  openFileDialog: () => void;
  hasFiles: boolean;
};

type ImportedFileInfo = {
  fileId: string;
  fileName: string;
  file: File;
  size: number;
  lastModified: number;
};

type CsvImporterProps = {
  files?: CsvFileEntry[];
  onDataImported?: (fileInfo: ImportedFileInfo) => void;
  onDataRemoved?: (fileId: string) => void;
  onFileSelected?: (fileId: string | null) => void;
  selectedFileId?: string | null;
};

type CsvFileItemProps = {
  fileEntry: CsvFileEntry;
  isSelected: boolean;
  onSelect?: (fileId: string | null) => void;
  onRemove?: (fileId: string | null) => void;
};

type FileSystemEntryLike = {
  isFile: boolean;
  isDirectory: boolean;
  name: string;
};

type FileSystemFileEntryLike = FileSystemEntryLike & {
  isFile: true;
  file: (successCallback: (file: File) => void) => void;
};

type FileSystemDirectoryEntryLike = FileSystemEntryLike & {
  isDirectory: true;
  createReader: () => {
    readEntries: (successCallback: (entries: FileSystemEntryLike[]) => void) => void;
  };
};

type DataTransferItemWithWebkit = DataTransferItem & {
  webkitGetAsEntry?: () => FileSystemEntryLike | null;
};

const buildFileKeyRaw = (file: File | null | undefined): string =>
  file ? `${file.name}::${file.size}` : "";

const buildItemKey = (file: File | null | undefined): string => {
  const raw = buildFileKeyRaw(file);
  if (!raw) return "";
  return stableItemKey("csv", raw);
};

const toDomIdToken = (value: unknown): string =>
  String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .slice(0, 120);

const CsvFileItem = React.memo(
  ({
    fileEntry,
    isSelected,
    onSelect,
    onRemove,
  }: CsvFileItemProps) => {
    const fileName = fileEntry?.file?.name || "";

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
          <span className={styles.fileName}>{fileName}</span>
        </div>
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
    );
  },
);

CsvFileItem.displayName = "CsvFileItem";

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

    const VIRTUALIZE_MIN_COUNT = 200;
    const GRID_GAP = 12; // gap-3 => 0.75rem
    const GRID_ROW_HEIGHT = 56; // p-3 + 32px icon => stable row height
    const GRID_PADDING_Y = 12; // p-3 => 0.75rem
    // Higher overscan reduces the chance of seeing "blank" or content popping at row boundaries.
    // Keep modest to avoid rendering too many items per frame.
    const GRID_OVERSCAN_ROWS = 6;

    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const [isDragging, setIsDragging] = useState(false);
    const isControlled = Array.isArray(externalFiles);
    const [internalFiles, setInternalFiles] = useState<CsvFileEntry[]>([]);
    const files = (isControlled ? externalFiles : internalFiles) ?? [];
    const setFiles = isControlled ? null : setInternalFiles;
    const [error, setError] = useState<string | null>(null);

    const containerRef = useRef<HTMLDivElement | null>(null);

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

    // Scroll virtualization anchor (row index). Updating on every scrollTop pixel causes
    // frequent React renders and can make scrolling feel janky. We only update when the
    // scroll crosses a row boundary, which is enough for row-based virtualization.
    const [scrollRowIndex, setScrollRowIndex] = useState(0);
    const [viewportHeight, setViewportHeight] = useState(0);
    const scrollRafRef = useRef(0);

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
      if (containerRef.current) {
        containerRef.current.scrollTo({
          top: containerRef.current.scrollHeight,
          behavior: "smooth",
        });
      }
    }, [files]);

    useEffect(() => {
      return () => {
        if (scrollRafRef.current) {
          cancelAnimationFrame(scrollRafRef.current);
          scrollRafRef.current = 0;
        }
      };
    }, []);

    useEffect(() => {
      if (typeof window === "undefined") return;
      const el = containerRef.current;
      if (!el) return;

      const measure = () => {
        const target = containerRef.current;
        if (!target) return;
        setViewportHeight(target.clientHeight);
      };

      measure();

      if (typeof ResizeObserver === "undefined") {
        window.addEventListener("resize", measure);
        return () => window.removeEventListener("resize", measure);
      }

      const ro = new ResizeObserver(() => measure());
      ro.observe(el);
      return () => ro.disconnect();
    }, []);

    const handleScroll = useCallback(() => {
      if (scrollRafRef.current) return;
      scrollRafRef.current = requestAnimationFrame(() => {
        scrollRafRef.current = 0;
        const el = containerRef.current;
        const scrollTop = el ? el.scrollTop : 0;
        const rowStep = GRID_ROW_HEIGHT + GRID_GAP;
        const nextRowIndex = Math.max(
          0,
          Math.floor((scrollTop - GRID_PADDING_Y) / rowStep),
        );
        if (!Number.isFinite(nextRowIndex)) return;
        // Schedule the (rare) virtual window update as low priority so native scrolling stays smooth.
        startTransition(() => {
          setScrollRowIndex((prev) =>
            prev === nextRowIndex ? prev : nextRowIndex,
          );
        });
      });
    }, []);

    // For mouse wheel scrolling, React's synthetic `onScroll` can add overhead.
    // Use a passive native listener so the browser can keep scrolling responsive.
    useEffect(() => {
      const el = containerRef.current;
      if (!el) return;
      const onScroll = () => handleScroll();
      el.addEventListener("scroll", onScroll, { passive: true });
      return () => el.removeEventListener("scroll", onScroll);
    }, [handleScroll]);

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
      const selectedFiles = Array.from(event.target.files ?? []);
      processFiles(selectedFiles);
      // Reset input value to allow selecting same files again if needed
      event.target.value = "";
    };

    const createFileId = () => {
      if (
        typeof crypto !== "undefined" &&
        typeof crypto.randomUUID === "function"
      ) {
        return crypto.randomUUID();
      }
      return `file_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`;
    };

    const processFiles = (newFiles: File[]) => {
      setError(null);

      const buildFileKey = (file: File | null | undefined): string =>
        file ? `${file.name}::${file.size}` : "";

      // Filter out duplicates (based on already loaded files + within this batch).
      const seenKeys = new Set(
        files.map((entry) => buildFileKey(entry?.file)).filter(Boolean),
      );

      const uniqueFiles: File[] = [];
      for (const newFile of newFiles) {
        const key = buildFileKey(newFile);
        if (!key) continue;
        if (seenKeys.has(key)) {
          console.log(`Skipping duplicate file: ${newFile?.name || ""}`);
          continue;
        }
        seenKeys.add(key);
        uniqueFiles.push(newFile);
      }

      if (uniqueFiles.length === 0 && newFiles.length > 0) {
        // If all files were duplicates (and we had some input)
        return;
      }

      // Add each file
      uniqueFiles.forEach((file) => {
        // Skip non-CSV files (double check)
        if (!file.name.toLowerCase().endsWith(".csv")) return;

        const fileId = createFileId();
        const fileEntry = { fileId, file, itemKey: buildItemKey(file) };

        if (setFiles) {
          setFiles((prev) => {
            if (
              prev.some(
                (existing) =>
                  existing.file.name === file.name &&
                  existing.file.size === file.size,
              )
            ) {
              return prev;
            }
            return [...prev, fileEntry];
          });
        }

        onDataImported?.({
          fileId,
          fileName: file.name,
          file,
          size: file.size,
          lastModified: file.lastModified,
        });
      });
    };

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

      const items = Array.from(
        e.dataTransfer.items,
      ) as DataTransferItemWithWebkit[];
      const csvFiles: File[] = [];

      // Helper to traverse directories
      const traverse = async (entry: FileSystemEntryLike | null | undefined) => {
        if (!entry) return;
        if (entry.isFile) {
          if (entry.name.toLowerCase().endsWith(".csv")) {
            // Get File object from FileEntry
            const file = await new Promise<File>((resolve) =>
              (entry as FileSystemFileEntryLike).file(resolve),
            );
            csvFiles.push(file);
          }
        } else if (entry.isDirectory) {
          const reader = (entry as FileSystemDirectoryEntryLike).createReader();
          // createReader().readEntries() might not return all entries in one call
          // usually need to loop until empty, but for simple implementation:
          const entries = await new Promise<FileSystemEntryLike[]>((resolve) => {
            reader.readEntries(resolve);
          });
          for (const child of entries) {
            await traverse(child);
          }
        }
      };

      // Process all dropped items
      const promises = items.map((item) => {
        const entry = item.webkitGetAsEntry ? item.webkitGetAsEntry() : null;
        if (entry) {
          return traverse(entry);
        } else {
          // Fallback for non-entry items (rare in modern browsers)
          const file = item.getAsFile();
          if (file && file.name.toLowerCase().endsWith(".csv")) {
            csvFiles.push(file);
          }
        }
      });

      await Promise.all(promises);

      if (csvFiles.length === 0) {
        setError("No CSV files found in the dropped items.");
      } else {
        processFiles(csvFiles);
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

    const virtual = useMemo(() => {
      const shouldVirtualize = files.length >= VIRTUALIZE_MIN_COUNT;
      if (!shouldVirtualize) {
        return {
          enabled: false,
          gridStyle: undefined,
          stageStyle: undefined,
          baseIndex: 0,
          visibleFiles: files,
        };
      }

      const cols = 1;
      const rowCount = files.length;
      const rowStep = GRID_ROW_HEIGHT + GRID_GAP;

      const scrollY = scrollRowIndex * rowStep;
      const startRow = Math.max(
        0,
        Math.floor(scrollY / rowStep) - GRID_OVERSCAN_ROWS,
      );
      const endRow = Math.min(
        rowCount,
        Math.ceil((scrollY + viewportHeight) / rowStep) + GRID_OVERSCAN_ROWS,
      );

      const startIndex = Math.max(0, startRow * cols);
      const endIndex = Math.min(files.length, endRow * cols);

      return {
        enabled: true,
        stageStyle: {
          height: `${rowCount * rowStep}px`,
        },
        gridStyle: {
          transform: `translateY(${startRow * rowStep}px)`,
          willChange: "transform",
          gridTemplateColumns: `1fr`,
          gridAutoRows: `${GRID_ROW_HEIGHT}px`,
        },
        baseIndex: startIndex,
        visibleFiles: files.slice(startIndex, endIndex),
      };
    }, [
      VIRTUALIZE_MIN_COUNT,
      GRID_GAP,
      GRID_ROW_HEIGHT,
      GRID_OVERSCAN_ROWS,
      files,
      scrollRowIndex,
      viewportHeight,
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
            accept=".csv"
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
              <Avatar icon={Upload} size="lg" variant="empty" />
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
