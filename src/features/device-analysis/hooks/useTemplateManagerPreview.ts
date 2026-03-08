import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import type { TemplateConfig } from "../lib/templateManagerUtils";
import {
  createEmptyLiveColumnLayout,
  usePreviewColumnLayout,
  usePreviewPickHandler,
  usePreviewRowWindow,
  usePreviewSelectionInteractions,
  usePreviewSelectionOverlay,
  usePreviewViewportSync,
} from "../lib/templateManagerPreview";

const PREVIEW_ROW_HEIGHT_PX = 28;
const PREVIEW_OVERSCAN_ROWS = 12;
const PREVIEW_ROW_INDEX_COL_PX = 48;
const PREVIEW_COL_MIN_PX = 120;
const PREVIEW_COL_MAX_PX = 420;
const PREVIEW_COL_CHAR_PX = 7;
const PREVIEW_COL_PADDING_PX = 44;
const PREVIEW_COL_RESIZE_MIN_PX = 80;
const PREVIEW_COL_RESIZE_MAX_PX = 800;
const PREVIEW_COL_OVERSCAN_PX = 240;

const clampNumber = (value: number, min: number, max: number): number => {
  return Math.min(max, Math.max(min, value));
};

type PreviewFileLike = Partial<{
  fileId: string;
  columnCount: number;
  rowCount: number;
  maxCellLengths: number[];
}>;

type PreviewStatus = Partial<{
  state: string;
}>;

type SelectionRange = {
  startRow: number;
  endRow: number;
  startCol: number;
  endCol: number;
};

type SelectionItem = {
  id: string;
  range: SelectionRange;
};

type ColumnWidthOverridesByFile = Record<string, Record<number, number>>;

type LiveColumnLayout = {
  fileId: string | null;
  widths: number[];
  tableWidth: number;
  appliedWidthVarCount: number;
};

type PreviewColumnGeometry = {
  tableWidthPx: number;
  widthsPx: number[];
  visibleColumnIndices: number[];
  hasLeftSpacer: boolean;
  hasRightSpacer: boolean;
  renderColCount: number;
  window: {
    leftSpacerPx: number;
    rightSpacerPx: number;
    startCol: number;
    endCol: number;
  };
  startOffsetsPx: number[];
};

type PreviewWindow = {
  startRow: number;
  endRow: number;
  topSpacerHeight: number;
  bottomSpacerHeight: number;
};

type PendingColumnResize = {
  fileId: string;
  colIndex: number;
  width: number;
};

type UseTemplateManagerPreviewOptions = {
  config: TemplateConfig;
  ensurePreviewRows?: (
    fileId: string,
    startRow: number,
    endRow: number,
  ) => Promise<unknown> | unknown;
  getPreviewRow?: (rowIndex: number) => unknown;
  previewFile?: PreviewFileLike | null;
  previewStatus?: PreviewStatus | null;
  setConfig: Dispatch<SetStateAction<TemplateConfig>>;
  writeFieldFromPreview: (field: string, value: string) => void;
};

type ResizeStartEvent = {
  preventDefault: () => void;
  stopPropagation: () => void;
  clientX: number;
  currentTarget: {
    setPointerCapture?: (pointerId: number) => void;
    releasePointerCapture?: (pointerId: number) => void;
  };
  pointerId: number;
};

export const useTemplateManagerPreview = ({
  config,
  ensurePreviewRows,
  getPreviewRow,
  previewFile,
  previewStatus,
  setConfig,
  writeFieldFromPreview,
}: UseTemplateManagerPreviewOptions) => {
  const [selections, setSelections] = useState<SelectionItem[]>([]);
  const gridRef = useRef<HTMLDivElement | null>(null);
  const previewScrollRef = useRef<HTMLDivElement | null>(null);
  const previewTableRef = useRef<HTMLTableElement | null>(null);
  const dragOverlayRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLElement | null>(null);

  const [isColumnResizing, setIsColumnResizing] = useState(false);
  const [columnWidthOverridesByFile, setColumnWidthOverridesByFile] =
    useState<ColumnWidthOverridesByFile>({});
  const columnResizeRafRef = useRef(0);
  const pendingColumnResizeRef = useRef<PendingColumnResize | null>(null);
  const liveColumnLayoutRef = useRef<LiveColumnLayout>(
    createEmptyLiveColumnLayout() as LiveColumnLayout,
  );

  const {
    handlePreviewScroll,
    previewScrollLeft,
    previewScrollTop,
    previewViewportHeight,
    previewViewportWidth,
  } = usePreviewViewportSync({
    previewFileColumnCount: previewFile?.columnCount,
    previewFileId: previewFile?.fileId,
    previewFileRowCount: previewFile?.rowCount,
    previewScrollRef,
    previewStatusState: previewStatus?.state,
  }) as {
    handlePreviewScroll: (scrollTop: number, scrollLeft: number) => void;
    previewScrollLeft: number;
    previewScrollTop: number;
    previewViewportHeight: number;
    previewViewportWidth: number;
  };

  const handlePreviewPick = usePreviewPickHandler({
    containerRef,
    writeFieldFromPreview,
  }) as (payload: {
    event: Event;
    rowIndex: number;
    colIndex: number;
    cellEl: Element;
  }) => boolean;

  useEffect(() => {
    return () => {
      if (columnResizeRafRef.current) {
        cancelAnimationFrame(columnResizeRafRef.current);
      }
    };
  }, []);

  const columnCount = useMemo(() => {
    if (Number.isFinite(previewFile?.columnCount)) {
      return Number(previewFile?.columnCount);
    }

    const maxLens = Array.isArray(previewFile?.maxCellLengths)
      ? previewFile.maxCellLengths
      : [];
    if (maxLens.length) return maxLens.length;

    return 0;
  }, [previewFile]);

  const selectedColumnsSet = useMemo(
    () =>
      new Set(
        Array.isArray(config?.selectedColumns) ? config.selectedColumns : [],
      ),
    [config],
  );

  const autoColumnWidthsPx = useMemo(() => {
    const maxLens = Array.isArray(previewFile?.maxCellLengths)
      ? previewFile.maxCellLengths
      : [];

    const count = Number.isFinite(previewFile?.columnCount)
      ? Number(previewFile?.columnCount)
      : maxLens.length;

    const widths = new Array<number>(count);
    for (let index = 0; index < count; index += 1) {
      const maxLen = Number(maxLens[index]) || 0;
      const estimated = maxLen * PREVIEW_COL_CHAR_PX + PREVIEW_COL_PADDING_PX;
      const base = maxLen > 0 ? estimated : 160;
      widths[index] = clampNumber(base, PREVIEW_COL_MIN_PX, PREVIEW_COL_MAX_PX);
    }

    return widths;
  }, [previewFile]);

  const {
    previewColumnGeometry,
    getColumnWidthPx,
    initLiveColumnLayout,
    applyColumnWidthToDom,
  } = usePreviewColumnLayout({
    autoColumnWidthsPx,
    columnCount,
    columnWidthOverridesByFile,
    liveColumnLayoutRef,
    minColumnWidthPx: PREVIEW_COL_MIN_PX,
    overscanPx: PREVIEW_COL_OVERSCAN_PX,
    previewFileId: previewFile?.fileId,
    previewScrollLeft,
    previewTableRef,
    previewViewportWidth,
    resizeMaxWidthPx: PREVIEW_COL_RESIZE_MAX_PX,
    resizeMinWidthPx: PREVIEW_COL_RESIZE_MIN_PX,
    rowIndexWidthPx: PREVIEW_ROW_INDEX_COL_PX,
  }) as {
    previewColumnGeometry: PreviewColumnGeometry;
    getColumnWidthPx: (colIndex: number) => number;
    initLiveColumnLayout: (fileId: string) => unknown;
    applyColumnWidthToDom: (fileId: string, colIndex: number, width: number) => void;
  };

  const flushPendingColumnResize = useCallback(() => {
    const pending = pendingColumnResizeRef.current;
    pendingColumnResizeRef.current = null;
    if (!pending) return null;

    applyColumnWidthToDom(pending.fileId, pending.colIndex, pending.width);
    return pending;
  }, [applyColumnWidthToDom]);

  const scheduleColumnResizeDomUpdate = useCallback(
    (fileId: string, colIndex: number, width: number) => {
      pendingColumnResizeRef.current = { fileId, colIndex, width };
      if (columnResizeRafRef.current) return;

      columnResizeRafRef.current = requestAnimationFrame(() => {
        columnResizeRafRef.current = 0;
        flushPendingColumnResize();
      });
    },
    [flushPendingColumnResize],
  );

  const resetColumnWidth = useCallback(
    (fileId: string, colIndex: number) => {
      const auto = autoColumnWidthsPx[colIndex] ?? PREVIEW_COL_MIN_PX;
      applyColumnWidthToDom(fileId, colIndex, auto);

      setColumnWidthOverridesByFile((prev) => {
        const existing = prev[fileId];
        if (!existing || !(colIndex in existing)) return prev;

        const nextForFile = { ...existing };
        delete nextForFile[colIndex];
        return { ...prev, [fileId]: nextForFile };
      });
    },
    [applyColumnWidthToDom, autoColumnWidthsPx],
  );

  const handleColumnResizeStart = useCallback(
    (event: ResizeStartEvent, colIndex: number) => {
      const fileId = previewFile?.fileId;
      if (!fileId) return;

      event.preventDefault();
      event.stopPropagation();

      const resizerEl = event.currentTarget;
      const pointerId = event.pointerId;

      if (resizerEl?.setPointerCapture && Number.isFinite(pointerId)) {
        try {
          resizerEl.setPointerCapture(pointerId);
        } catch {
          // ignore
        }
      }

      setIsColumnResizing(true);
      initLiveColumnLayout(fileId);

      const startX = event.clientX;
      const startWidthRaw = Number(liveColumnLayoutRef.current?.widths?.[colIndex]);
      const startWidth = Number.isFinite(startWidthRaw)
        ? startWidthRaw
        : getColumnWidthPx(colIndex);

      const handleMove = (moveEvent: PointerEvent) => {
        if (Number.isFinite(pointerId) && moveEvent.pointerId !== pointerId) {
          return;
        }

        const delta = moveEvent.clientX - startX;
        scheduleColumnResizeDomUpdate(fileId, colIndex, startWidth + delta);
      };

      const cleanup = () => {
        flushPendingColumnResize();

        const live = liveColumnLayoutRef.current;
        const finalWidth =
          live?.fileId === fileId ? Number(live?.widths?.[colIndex]) : null;
        const resolvedFinalWidth = Number(finalWidth);

        if (Number.isFinite(resolvedFinalWidth) && resolvedFinalWidth > 0) {
          setColumnWidthOverridesByFile((prev) => {
            const existing = prev[fileId] ?? {};
            const nextForFile = { ...existing, [colIndex]: resolvedFinalWidth };
            return { ...prev, [fileId]: nextForFile };
          });
        }

        pendingColumnResizeRef.current = null;
        if (columnResizeRafRef.current) {
          cancelAnimationFrame(columnResizeRafRef.current);
          columnResizeRafRef.current = 0;
        }

        window.removeEventListener("pointermove", handleMove);
        window.removeEventListener("pointerup", cleanup);
        window.removeEventListener("pointercancel", cleanup);
        window.removeEventListener("blur", cleanup);

        setIsColumnResizing(false);

        if (resizerEl?.releasePointerCapture && Number.isFinite(pointerId)) {
          try {
            resizerEl.releasePointerCapture(pointerId);
          } catch {
            // ignore
          }
        }
      };

      window.addEventListener("pointermove", handleMove, { passive: true });
      window.addEventListener("pointerup", cleanup);
      window.addEventListener("pointercancel", cleanup);
      window.addEventListener("blur", cleanup);
    },
    [
      flushPendingColumnResize,
      getColumnWidthPx,
      initLiveColumnLayout,
      previewFile?.fileId,
      scheduleColumnResizeDomUpdate,
    ],
  );

  const previewWindow = usePreviewRowWindow({
    ensurePreviewRows,
    overscanRows: PREVIEW_OVERSCAN_ROWS,
    previewFileId: previewFile?.fileId,
    previewRowCount: previewFile?.rowCount,
    previewScrollTop,
    previewViewportHeight,
    rowHeightPx: PREVIEW_ROW_HEIGHT_PX,
  }) as PreviewWindow;

  const toggleColumn = useCallback(
    (index: number) => {
      setConfig((prev) => {
        const selectedColumns = Array.isArray(prev?.selectedColumns)
          ? prev.selectedColumns
          : [];
        const isSelected = selectedColumns.includes(index);

        if (isSelected) {
          return {
            ...prev,
            selectedColumns: selectedColumns.filter((value) => value !== index),
          };
        }

        return {
          ...prev,
          selectedColumns: [...selectedColumns, index],
        };
      });
    },
    [setConfig],
  );

  const { selectionRects, hideDragOverlay, renderDragOverlay } =
    usePreviewSelectionOverlay({
      dragOverlayRef,
      gridRef,
      previewColumnGeometry,
      previewFileId: previewFile?.fileId,
      previewTableRef,
      previewWindow,
      rowHeightPx: PREVIEW_ROW_HEIGHT_PX,
      rowIndexWidthPx: PREVIEW_ROW_INDEX_COL_PX,
      selections,
    }) as {
      selectionRects: Array<{ id: string; rect: DOMRect | Record<string, number> }>;
      hideDragOverlay: () => void;
      renderDragOverlay: (startCellEl: Element, endCellEl: Element) => void;
    };

  const { copySelection, handleCellMouseDown } =
    usePreviewSelectionInteractions({
      ensurePreviewRows,
      getPreviewRow,
      gridRef,
      handlePreviewPick,
      hideDragOverlay,
      previewFileId: previewFile?.fileId,
      renderDragOverlay,
      selections,
      setSelections,
    }) as {
      copySelection: () => Promise<void>;
      handleCellMouseDown: (event: unknown) => void;
    };

  return {
    containerRef,
    copySelection,
    dragOverlayRef,
    gridRef,
    handleCellMouseDown,
    handleColumnResizeStart,
    handlePreviewScroll,
    isColumnResizing,
    previewColumnGeometry,
    previewColumnMinWidthPx: PREVIEW_COL_MIN_PX,
    previewRowIndexWidthPx: PREVIEW_ROW_INDEX_COL_PX,
    previewScrollRef,
    previewTableRef,
    previewWindow,
    resetColumnWidth,
    selectedColumnsSet,
    selectionRects,
    selections,
    toggleColumn,
  };
};
