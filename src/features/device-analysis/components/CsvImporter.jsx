// ... existing imports
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
import { createPortal } from "react-dom";
import { cx } from "../../../utils/cx";
import { stableItemKey } from "../../../utils/stableKey";
import { useLanguage } from "../../../hooks/useLanguage";
import Avatar from "../../../components/ui/Avatar";
import styles from "./CsvImporter.module.css";

/*
 * Separate component for the expanded card animation.
 * Using a portal to break out of the scrollable container.
 */
const ExpandedCard = ({
  fileEntry,
  originRect,
  containerBounds,
  onClose,
  onRemove,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    // Trigger expansion after mount
    requestAnimationFrame(() => {
      setIsExpanded(true);
    });
  }, []);

  // Safety check
  if (!originRect) return null;
  if (!fileEntry?.file) return null;

  // Calculate dimensions and position
  // Estimate text width: ~8px per char + moderate padding
  // Min width 300 to avoid too much whitespace on short names
  const textWidthEstimate = fileEntry.file.name.length * 8 + 70;
  const expandedWidth = Math.max(
    originRect.width,
    Math.max(300, textWidthEstimate),
  );

  // Determine boundaries, default to window if no container bounds passed
  const windowWidth = typeof window !== "undefined" ? window.innerWidth : 1000;
  // If containerBounds are provided, use them as constraints (plus padding), otherwise fallback to viewport 24px
  const minLeft = containerBounds ? containerBounds.left : 24;
  const maxRight = containerBounds ? containerBounds.right : windowWidth - 24;

  // Center expansion: grow from center
  let targetLeft = originRect.left + originRect.width / 2 - expandedWidth / 2;

  // Clamp to bounds
  // 1. Right edge check
  if (targetLeft + expandedWidth > maxRight) {
    targetLeft = maxRight - expandedWidth;
  }
  // 2. Left edge check (priority over right if conflict, or min width dictates)
  if (targetLeft < minLeft) {
    targetLeft = minLeft;
  }

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-40 transition-opacity duration-300 ${isExpanded ? "bg-black/5" : "opacity-0"}`}
        onClick={onClose}
      />
      {/* Card */}
      <div
        className="fixed z-50 bg-bg-surface border border-border rounded-lg shadow-xl overflow-hidden flex items-center justify-between"
        style={{
          top: originRect.top,
          left: isExpanded ? targetLeft : originRect.left,
          height: originRect.height,
          // Animate width and transform
          width: isExpanded ? expandedWidth : originRect.width,
          transform: isExpanded ? `translate(0, -4px)` : "none", // Slight pop up
          // Use transition for smooth animation
          transition: "all 0.4s cubic-bezier(0.16, 1, 0.3, 1)",
        }}
      >
        <div className="flex items-center gap-3 px-3 w-full overflow-hidden">
          <div className="w-8 h-8 rounded bg-green-500/10 flex items-center justify-center text-green-500 shrink-0">
            <FileText size={16} />
          </div>
          {/* Full filename display */}
          <span
            className="text-sm text-text-primary whitespace-nowrap overflow-hidden text-ellipsis"
            style={{
              maxWidth: "100%",
            }}
          >
            {fileEntry.file.name}
          </span>
        </div>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="mr-3 text-text-secondary hover:text-red-500 transition-colors hover:bg-bg-page p-1 rounded shrink-0"
        >
          <X size={16} />
        </button>
      </div>
    </>,
    document.body,
  );
};

const buildFileKeyRaw = (file) =>
  file && typeof file === "object" ? `${file.name}::${file.size}` : "";

const buildItemKey = (file) => {
  const raw = buildFileKeyRaw(file);
  if (!raw) return "";
  return stableItemKey("csv", raw);
};

const toDomIdToken = (value) =>
  String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .slice(0, 120);

const CsvFileItem = React.memo(
  ({ fileEntry, isSelected, isInvisible, onSelect, onRemove }) => (
    <div
      aria-label="csv-file-item"
      id={
        fileEntry?.itemKey
          ? `csv-file-item-${toDomIdToken(fileEntry.itemKey)}`
          : undefined
      }
      data-item-key={fileEntry?.itemKey || undefined}
      data-selected={isSelected ? "true" : undefined}
      onClick={() => onSelect?.(fileEntry?.fileId ?? null)}
      className={cx(
        styles.fileItem,
        "group",
        isSelected && styles.fileItemSelected,
        isInvisible && "invisible",
      )}
    >
      <div className={styles.fileContent}>
        <div className={styles.fileIcon}>
          <FileText size={16} />
        </div>
        <span className={styles.fileName}>{fileEntry?.file?.name}</span>
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
          onRemove?.(fileEntry?.fileId ?? null);
        }}
        className={styles.fileRemove}
      >
        <X size={16} />
      </button>
    </div>
  ),
);

CsvFileItem.displayName = "CsvFileItem";

const CsvImporter = forwardRef(
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
    const GRID_MIN_COL_WIDTH = 280; // px
    const GRID_GAP = 12; // gap-3 => 0.75rem
    const GRID_ROW_HEIGHT = 56; // p-3 + 32px icon => stable row height
    const GRID_PADDING_Y = 12; // p-3 => 0.75rem
    const GRID_PADDING_X = 24; // p-3 * 2 => 1.5rem
    // Higher overscan reduces the chance of seeing "blank" or content popping at row boundaries.
    // Keep modest to avoid rendering too many items per frame.
    const GRID_OVERSCAN_ROWS = 6;

    const fileInputRef = useRef(null);
    const [isDragging, setIsDragging] = useState(false);
    const isControlled = Array.isArray(externalFiles);
    const [internalFiles, setInternalFiles] = useState([]);
    const files = isControlled ? externalFiles : internalFiles;
    const setFiles = isControlled ? null : setInternalFiles;
    const [error, setError] = useState(null);

    // State for the expanded card animation
    const [activeFile, setActiveFile] = useState(null);
    const [originRect, setOriginRect] = useState(null);
    const [containerBounds, setContainerBounds] = useState(null);
    const containerRef = useRef(null);

    const [optimisticSelectedFileId, setOptimisticSelectedFileId] =
      useOptimistic(selectedFileId ?? null, (_prev, next) => next);

    const effectiveSelectedFileId = optimisticSelectedFileId ?? selectedFileId;

    const setEffectiveSelectedFileId = useCallback(
      (next) => {
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
    const [contentWidth, setContentWidth] = useState(0);
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
        const cs = window.getComputedStyle(target);
        const paddingLeft = parseFloat(cs.paddingLeft) || 0;
        const paddingRight = parseFloat(cs.paddingRight) || 0;
        setViewportHeight(target.clientHeight);
        setContentWidth(
          Math.max(0, target.clientWidth - paddingLeft - paddingRight),
        );
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

    const handleFileChange = (event) => {
      const selectedFiles = Array.from(event.target.files);
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

    const processFiles = (newFiles) => {
      setError(null);

      const buildFileKey = (file) =>
        file && typeof file === "object" ? `${file.name}::${file.size}` : "";

      // Filter out duplicates (based on already loaded files + within this batch).
      const seenKeys = new Set(
        files.map((entry) => buildFileKey(entry?.file)).filter(Boolean),
      );

      const uniqueFiles = [];
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
      (fileId) => {
        const next = typeof fileId === "string" ? fileId : null;
        if (!next) return;
        setEffectiveSelectedFileId(next);
      },
      [setEffectiveSelectedFileId],
    );

    const handleDragOver = (e) => {
      e.preventDefault();
      setIsDragging(true);
    };

    const handleDragLeave = () => {
      setIsDragging(false);
    };

    const handleDrop = async (e) => {
      e.preventDefault();
      setIsDragging(false);

      const items = Array.from(e.dataTransfer.items);
      const csvFiles = [];

      // Helper to traverse directories
      const traverse = async (entry) => {
        if (entry.isFile) {
          if (entry.name.toLowerCase().endsWith(".csv")) {
            // Get File object from FileEntry
            const file = await new Promise((resolve) => entry.file(resolve));
            csvFiles.push(file);
          }
        } else if (entry.isDirectory) {
          const reader = entry.createReader();
          // createReader().readEntries() might not return all entries in one call
          // usually need to loop until empty, but for simple implementation:
          const entries = await new Promise((resolve) => {
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

    const handleCloseExpanded = useCallback(() => {
      setActiveFile(null);
      setOriginRect(null);
    }, []);

    const removeFile = useCallback((fileId) => {
      if (typeof fileId !== "string") return;
      if (optimisticSelectedFileId === fileId) {
        setEffectiveSelectedFileId(null);
      }
      if (setFiles) {
        setFiles((prev) => prev.filter((entry) => entry.fileId !== fileId));
      }
      if (activeFile?.fileId === fileId) {
        handleCloseExpanded();
      }
      // Notify parent to remove data
      if (onDataRemoved) {
        onDataRemoved(fileId);
      }
    }, [
      activeFile?.fileId,
      handleCloseExpanded,
      onDataRemoved,
      optimisticSelectedFileId,
      setEffectiveSelectedFileId,
      setFiles,
    ]);

    const _handleShowFullName = (fileEntry, e) => {
      e.stopPropagation();
      const rect = e.currentTarget.getBoundingClientRect();
      setOriginRect(rect);
      setActiveFile(fileEntry);
      if (containerRef.current) {
        setContainerBounds(containerRef.current.getBoundingClientRect());
      }
    };

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

      const cols = Math.max(
        1,
        Math.floor(
          (contentWidth - GRID_PADDING_X + GRID_GAP) /
          (GRID_MIN_COL_WIDTH + GRID_GAP),
        ),
      );
      const rowCount = Math.max(0, Math.ceil(files.length / cols));
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
          gridTemplateColumns: `repeat(${cols}, minmax(${GRID_MIN_COL_WIDTH}px, 1fr))`,
          gridAutoRows: `${GRID_ROW_HEIGHT}px`,
        },
        baseIndex: startIndex,
        visibleFiles: files.slice(startIndex, endIndex),
      };
    }, [
      VIRTUALIZE_MIN_COUNT,
      GRID_GAP,
      GRID_MIN_COL_WIDTH,
      GRID_ROW_HEIGHT,
      GRID_OVERSCAN_ROWS,
      contentWidth,
      files,
      scrollRowIndex,
      viewportHeight,
    ]);

    return (
      <>
        <div
          ref={containerRef}
          id="device-analysis-csv-dropzone"
          aria-label={t("da_import_section")}
          data-state={files.length === 0 ? "empty" : "filled"}
          className={cx(
            styles.dropzone,
            "custom-scrollbar",
            isDragging ? styles.dropzoneDragging : styles.dropzoneIdle,
          )}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={
            files.length === 0 ? () => fileInputRef.current.click() : undefined
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
                        isInvisible={activeFile?.fileId === fileEntry.fileId}
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
                      isInvisible={activeFile?.fileId === fileEntry.fileId}
                      onSelect={handleSelectFile}
                      onRemove={removeFile}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {error && (
          <div className="flex items-center gap-2 p-3 text-sm text-red-500 bg-red-500/10 rounded-lg mt-4 whitespace-pre-wrap">
            <AlertCircle size={16} />
            {error}
          </div>
        )}

        {/* Expanded Card Portal */}
        {activeFile && originRect && (
          <ExpandedCard
            fileEntry={activeFile}
            originRect={originRect}
            containerBounds={containerBounds}
            onClose={handleCloseExpanded}
            onRemove={() => removeFile(activeFile.fileId)}
          />
        )}
      </>
    );
  },
);

CsvImporter.displayName = "CsvImporter";

export default CsvImporter;
