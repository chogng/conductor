import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import type { PreviewStatus as SessionPreviewStatus } from "src/cs/workbench/contrib/deviceAnalysis/session/analysis-session-context";
import type { PreviewFileLike } from "src/cs/workbench/common/deviceAnalysis/sharedTypes";
import type { TemplateConfig } from "./templateManagerUtils";
import {
  buildPreviewPrefetchRange,
  createEmptyLiveColumnLayout,
  usePreviewColumnLayout,
  usePreviewPickHandler,
  usePreviewRowWindow,
  usePreviewSelectionInteractions,
  usePreviewSelectionOverlay,
  usePreviewViewportSync,
} from "./templateManagerPreview";
import {
  clampPreviewZoomPercent,
  scalePreviewMeasurement,
  toBasePreviewMeasurement,
} from "./templateManagerPreviewZoom";
import { resolvePreviewRenderColumnCount } from "./previewRenderColumns";

const PREVIEW_ROW_HEIGHT_BASE_PX = 28;
const PREVIEW_OVERSCAN_ROWS = 12;
const PREVIEW_ROW_INDEX_COL_BASE_PX = 48;
const PREVIEW_COL_MIN_BASE_PX = 120;
const PREVIEW_COL_MAX_BASE_PX = 420;
const PREVIEW_COL_CHAR_BASE_PX = 7;
const PREVIEW_COL_PADDING_BASE_PX = 44;
const PREVIEW_COL_RESIZE_MIN_BASE_PX = 80;
const PREVIEW_COL_RESIZE_MAX_BASE_PX = 800;
const PREVIEW_COL_OVERSCAN_PX = 240;
const PREVIEW_COL_OVERSCAN_PX_MIN = 96;
const PREVIEW_COL_OVERSCAN_PX_MAX = 720;

const clampNumber = (value: number, min: number, max: number): number => {
  return Math.min(max, Math.max(min, value));
};

const resolvePreviewHorizontalOverscanPx = ({
  horizontalVelocityTier,
  viewportWidth,
}: {
  horizontalVelocityTier: number;
  viewportWidth: number;
}): number => {
  const viewportBased = Math.max(
    PREVIEW_COL_OVERSCAN_PX,
    Math.round((Number(viewportWidth) || 0) * 0.55),
  );

  const base =
    horizontalVelocityTier >= 2
      ? viewportBased * 0.4
      : horizontalVelocityTier >= 1
        ? viewportBased * 0.75
        : viewportBased * 1.2;

  return clampNumber(
    Math.round(base),
    PREVIEW_COL_OVERSCAN_PX_MIN,
    PREVIEW_COL_OVERSCAN_PX_MAX,
  );
};

const normalizeSelectionRange = (
  range?: SelectionRange | null,
): SelectionRange | null => {
  if (!range) return null;
  const startRow = Number(range.startRow);
  const endRow = Number(range.endRow);
  const startCol = Number(range.startCol);
  const endCol = Number(range.endCol);
  if (
    !Number.isFinite(startRow) ||
    !Number.isFinite(endRow) ||
    !Number.isFinite(startCol) ||
    !Number.isFinite(endCol)
  ) {
    return null;
  }

  return {
    startRow: Math.min(startRow, endRow),
    endRow: Math.max(startRow, endRow),
    startCol: Math.min(startCol, endCol),
    endCol: Math.max(startCol, endCol),
  };
};

type PreviewStatus = Partial<SessionPreviewStatus>;

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

type SelectionSetMode = "replace" | "append" | "updateLast";

type SetSelectionRangeOptions = {
  mode?: SelectionSetMode;
};

type ColumnWidthOverridesByFile = Record<string, Record<number, number>>;

type LiveColumnLayout = {
  fileId: string | null;
  widths: number[];
  tableWidth: number;
  appliedWidthVarCount: number;
};

type PreviewColumnGeometry = {
  columnCount: number;
  dataViewportWidth: number;
  tableWidthPx: number;
  totalDataWidthPx: number;
  widthsPx: number[];
  visibleColumnIndices: number[];
  hasLeftSpacer: boolean;
  hasRightSpacer: boolean;
  renderColCount: number;
  scrollLeft: number;
  viewportWidth: number;
  overscanPx: number;
  window: {
    leftSpacerPx: number;
    rightSpacerPx: number;
    startCol: number;
    endCol: number;
    scrollLeft: number;
    viewportWidth: number;
    dataViewportWidth: number;
    overscanPx: number;
  };
  startOffsetsPx: number[];
};

type PreviewWindow = {
  totalRows: number;
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
  containerRef?: MutableRefObject<HTMLElement | null>;
  config: TemplateConfig;
  ensurePreviewRows?: (
    fileId: string,
    startRow: number,
    endRow: number,
  ) => Promise<unknown> | unknown;
  getPreviewRow?: (rowIndex: number) => unknown;
  interactive?: boolean;
  previewFile?: PreviewFileLike | null;
  previewStatus?: PreviewStatus | null;
  previewZoomPercent?: number;
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
  containerRef: externalContainerRef,
  config,
  ensurePreviewRows,
  getPreviewRow,
  interactive = true,
  previewFile,
  previewStatus,
  previewZoomPercent = 100,
  setConfig,
  writeFieldFromPreview,
}: UseTemplateManagerPreviewOptions) => {
  const [selections, setSelections] = useState<SelectionItem[]>([]);
  const gridRef = useRef<HTMLDivElement | null>(null);
  const previewScrollRef = useRef<HTMLDivElement | null>(null);
  const previewTableRef = useRef<HTMLTableElement | null>(null);
  const dragOverlayRef = useRef<HTMLDivElement | null>(null);
  const internalContainerRef = useRef<HTMLElement | null>(null);
  const containerRef = externalContainerRef ?? internalContainerRef;

  const [isColumnResizing, setIsColumnResizing] = useState(false);
  const [columnWidthOverridesByFile, setColumnWidthOverridesByFile] =
    useState<ColumnWidthOverridesByFile>({});
  const columnResizeRafRef = useRef(0);
  const pendingColumnResizeRef = useRef<PendingColumnResize | null>(null);
  const liveColumnLayoutRef = useRef<LiveColumnLayout>(
    createEmptyLiveColumnLayout() as LiveColumnLayout,
  );
  const previousPreviewZoomPercentRef = useRef(
    clampPreviewZoomPercent(previewZoomPercent),
  );

  const normalizedPreviewZoomPercent = clampPreviewZoomPercent(previewZoomPercent);
  const previewRowHeightPx = useMemo(
    () =>
      scalePreviewMeasurement(
        PREVIEW_ROW_HEIGHT_BASE_PX,
        normalizedPreviewZoomPercent,
        { minPx: 14 },
      ),
    [normalizedPreviewZoomPercent],
  );
  const previewRowIndexWidthPx = useMemo(
    () =>
      scalePreviewMeasurement(
        PREVIEW_ROW_INDEX_COL_BASE_PX,
        normalizedPreviewZoomPercent,
        { minPx: 32 },
      ),
    [normalizedPreviewZoomPercent],
  );
  const previewColumnMinWidthPx = useMemo(
    () =>
      scalePreviewMeasurement(
        PREVIEW_COL_MIN_BASE_PX,
        normalizedPreviewZoomPercent,
        { minPx: 60 },
      ),
    [normalizedPreviewZoomPercent],
  );
  const previewColumnMaxWidthPx = useMemo(
    () =>
      scalePreviewMeasurement(
        PREVIEW_COL_MAX_BASE_PX,
        normalizedPreviewZoomPercent,
        { minPx: previewColumnMinWidthPx + 1 },
      ),
    [normalizedPreviewZoomPercent, previewColumnMinWidthPx],
  );
  const previewResizeMinWidthPx = useMemo(
    () =>
      scalePreviewMeasurement(
        PREVIEW_COL_RESIZE_MIN_BASE_PX,
        normalizedPreviewZoomPercent,
        { minPx: 48 },
      ),
    [normalizedPreviewZoomPercent],
  );
  const previewResizeMaxWidthPx = useMemo(
    () =>
      scalePreviewMeasurement(
        PREVIEW_COL_RESIZE_MAX_BASE_PX,
        normalizedPreviewZoomPercent,
        { minPx: previewResizeMinWidthPx + 1 },
      ),
    [normalizedPreviewZoomPercent, previewResizeMinWidthPx],
  );

  const warmPreviewRowsForScrollFrame = useCallback(
    ({
      scrollTop,
      verticalDirection,
      verticalVelocityTier,
      viewportHeight,
    }: {
      scrollTop: number;
      verticalDirection: number;
      verticalVelocityTier: number;
      viewportHeight: number;
    }) => {
      const fileId = previewFile?.fileId;
      const rowCount = Number(previewFile?.rowCount) || 0;
      if (!fileId || rowCount <= 0) return;
      if (typeof ensurePreviewRows !== "function") return;

      const immediateRenderOverscanRows =
        verticalVelocityTier >= 2
          ? Math.max(6, PREVIEW_OVERSCAN_ROWS - 4)
          : verticalVelocityTier >= 1
            ? PREVIEW_OVERSCAN_ROWS
            : PREVIEW_OVERSCAN_ROWS + 4;
      const visibleRows = Math.max(
        1,
        Math.ceil(Math.max(1, Number(viewportHeight) || 0) / previewRowHeightPx),
      );
      const lookBehindRows = Math.max(
        immediateRenderOverscanRows + 8,
        Math.round(visibleRows * 1.5),
      );
      const lookAheadRows =
        verticalVelocityTier >= 2
          ? Math.max(immediateRenderOverscanRows + 24, visibleRows * 8)
          : verticalVelocityTier >= 1
            ? Math.max(immediateRenderOverscanRows + 20, visibleRows * 5)
            : Math.max(immediateRenderOverscanRows + 16, visibleRows * 3);
      const immediatePrefetchRowsBefore =
        verticalDirection < 0
          ? lookAheadRows
          : verticalDirection > 0
            ? lookBehindRows
            : Math.max(lookBehindRows, Math.round(lookAheadRows * 0.75));
      const immediatePrefetchRowsAfter =
        verticalDirection > 0
          ? lookAheadRows
          : verticalDirection < 0
            ? lookBehindRows
            : Math.max(lookBehindRows, Math.round(lookAheadRows * 0.75));
      const immediateWindowShiftStrideRows = Math.max(
        immediateRenderOverscanRows,
        Math.max(1, Math.floor(visibleRows / 2)),
      );
      const range = buildPreviewPrefetchRange({
        overscanRows: immediateRenderOverscanRows,
        prefetchRowsAfter: immediatePrefetchRowsAfter,
        prefetchRowsBefore: immediatePrefetchRowsBefore,
        rowCount,
        rowHeightPx: previewRowHeightPx,
        scrollTop,
        viewportHeight,
        windowShiftStrideRows: immediateWindowShiftStrideRows,
      });
      void ensurePreviewRows(fileId, range.startRow, range.endRow);
    },
    [
      ensurePreviewRows,
      previewFile?.fileId,
      previewFile?.rowCount,
      previewRowHeightPx,
    ],
  );

  const resolvePreviewHorizontalScrollCommitThresholdPx = useCallback(
    ({
      horizontalVelocityTier,
      viewportWidth,
    }: {
      horizontalVelocityTier: number;
      viewportWidth: number;
    }) => {
      const overscanPx = resolvePreviewHorizontalOverscanPx({
        horizontalVelocityTier,
        viewportWidth,
      });

      // Refresh the virtual column window after roughly half an overscan buffer
      // has been consumed so native scrolling stays smooth without starving the
      // next batch of visible columns.
      return Math.max(48, Math.round(overscanPx * 0.5));
    },
    [],
  );

  const {
    handlePreviewScroll,
    previewHorizontalScrollVelocityTier,
    previewScrollLeft,
    previewScrollTop,
    previewVerticalScrollDirection,
    previewVerticalScrollVelocityTier,
    previewViewportHeight,
    previewViewportWidth,
  } = usePreviewViewportSync({
    onPreviewScrollFrame: warmPreviewRowsForScrollFrame,
    previewFileColumnCount: previewFile?.columnCount,
    previewFileId: previewFile?.fileId,
    previewFileRowCount: previewFile?.rowCount,
    previewRowHeightPx,
    resolvePreviewHorizontalScrollCommitThresholdPx,
    previewScrollRef,
    previewStatusState: previewStatus?.state,
  }) as {
    handlePreviewScroll: (scrollTop: number, scrollLeft: number) => void;
    previewHorizontalScrollVelocityTier: number;
    previewScrollLeft: number;
    previewScrollTop: number;
    previewVerticalScrollDirection: number;
    previewVerticalScrollVelocityTier: number;
    previewViewportHeight: number;
    previewViewportWidth: number;
  };

  const previewColumnOverscanPx = useMemo(
    () =>
      resolvePreviewHorizontalOverscanPx({
        horizontalVelocityTier: previewHorizontalScrollVelocityTier,
        viewportWidth: previewViewportWidth,
      }),
    [previewHorizontalScrollVelocityTier, previewViewportWidth],
  );

  const previewPickHandler = usePreviewPickHandler({
    containerRef,
    writeFieldFromPreview,
  }) as (payload: {
    event: Event;
    rowIndex: number;
    colIndex: number;
    cellEl: Element;
  }) => boolean;
  const handlePreviewPick = interactive ? previewPickHandler : undefined;

  useEffect(() => {
    return () => {
      if (columnResizeRafRef.current) {
        cancelAnimationFrame(columnResizeRafRef.current);
      }
    };
  }, []);

  const dataColumnCount = useMemo(() => {
    if (Number.isFinite(previewFile?.columnCount)) {
      return Number(previewFile?.columnCount);
    }

    const maxLens = Array.isArray(previewFile?.maxCellLengths)
      ? previewFile.maxCellLengths
      : [];
    if (maxLens.length) return maxLens.length;

    return 0;
  }, [previewFile]);
  const columnCount = useMemo(() => {
    return resolvePreviewRenderColumnCount({
      dataColumnCount,
      minColumnWidthPx: previewColumnMinWidthPx,
      previewViewportWidth,
      rowIndexWidthPx: previewRowIndexWidthPx,
    });
  }, [
    dataColumnCount,
    previewColumnMinWidthPx,
    previewRowIndexWidthPx,
    previewViewportWidth,
  ]);

  const yColumnsSet = useMemo(
    () =>
      new Set(
        Array.isArray(config?.yColumns) ? config.yColumns : [],
      ),
    [config?.yColumns],
  );

  const previewVisibleRows = useMemo(
    () =>
      Math.max(
        1,
        Math.ceil(Math.max(1, Number(previewViewportHeight) || 0) / previewRowHeightPx),
      ),
    [previewRowHeightPx, previewViewportHeight],
  );

  const renderOverscanRows = useMemo(
    () =>
      Math.max(
        PREVIEW_OVERSCAN_ROWS + 10,
        Math.round(previewVisibleRows * 1.5),
      ),
    [previewVisibleRows],
  );

  const { prefetchRowsAfter, prefetchRowsBefore } = useMemo(() => {
    const lookBehindRows = Math.max(
      renderOverscanRows + 8,
      Math.round(previewVisibleRows * 1.5),
    );
    const lookAheadRows =
      previewVerticalScrollVelocityTier >= 2
        ? Math.max(renderOverscanRows + 24, previewVisibleRows * 8)
        : previewVerticalScrollVelocityTier >= 1
          ? Math.max(renderOverscanRows + 20, previewVisibleRows * 5)
          : Math.max(renderOverscanRows + 16, previewVisibleRows * 3);

    if (previewVerticalScrollDirection < 0) {
      return {
        prefetchRowsAfter: lookBehindRows,
        prefetchRowsBefore: lookAheadRows,
      };
    }

    if (previewVerticalScrollDirection > 0) {
      return {
        prefetchRowsAfter: lookAheadRows,
        prefetchRowsBefore: lookBehindRows,
      };
    }

    const symmetricRows = Math.max(lookBehindRows, Math.round(lookAheadRows * 0.75));
    return {
      prefetchRowsAfter: symmetricRows,
      prefetchRowsBefore: symmetricRows,
    };
  }, [
    previewVerticalScrollDirection,
    previewVerticalScrollVelocityTier,
    previewVisibleRows,
    renderOverscanRows,
  ]);

  const previewWindowShiftStrideRows = useMemo(
    () =>
      Math.max(
        renderOverscanRows,
        Math.max(1, Math.floor(previewVisibleRows * 1.5)),
      ),
    [previewVisibleRows, renderOverscanRows],
  );

  const setSelectionRange = useCallback(
    (range?: SelectionRange | null, options?: SetSelectionRangeOptions) => {
      const mode: SelectionSetMode = options?.mode || "replace";
      const normalized = normalizeSelectionRange(range);
      if (!normalized) {
        if (mode === "replace") {
          setSelections([]);
        }
        return;
      }

      setSelections((prev) => {
        const list = Array.isArray(prev) ? prev : [];
        const sameRange = (candidate?: SelectionRange | null) =>
          Boolean(
            candidate &&
              candidate.startRow === normalized.startRow &&
              candidate.endRow === normalized.endRow &&
              candidate.startCol === normalized.startCol &&
              candidate.endCol === normalized.endCol,
          );

        if (mode === "replace") {
          const existing = list[0] ?? null;
          const nextId = existing?.id || `${Date.now()}_${Math.random()}`;
          if (sameRange(existing?.range)) return prev;
          return [{ id: nextId, range: normalized }];
        }

        if (mode === "append") {
          if (list.some((item) => sameRange(item?.range))) return prev;
          return [...list, { id: `${Date.now()}_${Math.random()}`, range: normalized }];
        }

        const existingLast = list[list.length - 1] ?? null;
        if (!existingLast) {
          return [{ id: `${Date.now()}_${Math.random()}`, range: normalized }];
        }
        if (sameRange(existingLast.range)) return prev;
        const next = list.slice();
        next[next.length - 1] = { ...existingLast, range: normalized };
        return next;
      });
    },
    [setSelections],
  );

  const autoColumnWidthsBasePx = useMemo(() => {
    const maxLens = Array.isArray(previewFile?.maxCellLengths)
      ? previewFile.maxCellLengths
      : [];

    const count = Number.isFinite(previewFile?.columnCount)
      ? Number(previewFile?.columnCount)
      : maxLens.length;

    const widths = new Array<number>(count);
    for (let index = 0; index < count; index += 1) {
      const maxLen = Number(maxLens[index]) || 0;
      const estimated = maxLen * PREVIEW_COL_CHAR_BASE_PX + PREVIEW_COL_PADDING_BASE_PX;
      const base = maxLen > 0 ? estimated : 160;
      widths[index] = clampNumber(base, PREVIEW_COL_MIN_BASE_PX, PREVIEW_COL_MAX_BASE_PX);
    }

    return widths;
  }, [previewFile]);

  const autoColumnWidthsPx = useMemo(
    () =>
      autoColumnWidthsBasePx.map((width) =>
        scalePreviewMeasurement(width, normalizedPreviewZoomPercent, {
          maxPx: previewColumnMaxWidthPx,
          minPx: previewColumnMinWidthPx,
        }),
      ),
    [
      autoColumnWidthsBasePx,
      normalizedPreviewZoomPercent,
      previewColumnMaxWidthPx,
      previewColumnMinWidthPx,
    ],
  );

  const scaledColumnWidthOverridesByFile = useMemo(() => {
    const fileId = previewFile?.fileId;
    if (!fileId) return {};

    const baseOverrides = columnWidthOverridesByFile[fileId] ?? {};
    const nextForFile = Object.entries(baseOverrides).reduce<Record<number, number>>(
      (acc, [colIndex, width]) => {
        const normalizedColIndex = Number(colIndex);
        if (!Number.isInteger(normalizedColIndex) || normalizedColIndex < 0) {
          return acc;
        }
        acc[normalizedColIndex] = scalePreviewMeasurement(
          Number(width) || 0,
          normalizedPreviewZoomPercent,
          {
            maxPx: previewResizeMaxWidthPx,
            minPx: previewResizeMinWidthPx,
          },
        );
        return acc;
      },
      {},
    );

    return { [fileId]: nextForFile };
  }, [
    columnWidthOverridesByFile,
    normalizedPreviewZoomPercent,
    previewFile?.fileId,
    previewResizeMaxWidthPx,
    previewResizeMinWidthPx,
  ]);

  const {
    previewColumnGeometry,
    getColumnWidthPx,
    initLiveColumnLayout,
    applyColumnWidthToDom,
  } = usePreviewColumnLayout({
    autoColumnWidthsPx,
    columnCount,
    columnWidthOverridesByFile: scaledColumnWidthOverridesByFile,
    liveColumnLayoutRef,
    minColumnWidthPx: previewColumnMinWidthPx,
    overscanPx: previewColumnOverscanPx,
    previewFileId: previewFile?.fileId,
    previewScrollLeft,
    previewTableRef,
    previewViewportWidth,
    resizeMaxWidthPx: previewResizeMaxWidthPx,
    resizeMinWidthPx: previewResizeMinWidthPx,
    rowIndexWidthPx: previewRowIndexWidthPx,
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
      const auto = autoColumnWidthsPx[colIndex] ?? previewColumnMinWidthPx;
      applyColumnWidthToDom(fileId, colIndex, auto);

      setColumnWidthOverridesByFile((prev) => {
        const existing = prev[fileId];
        if (!existing || !(colIndex in existing)) return prev;

        const nextForFile = { ...existing };
        delete nextForFile[colIndex];
        return { ...prev, [fileId]: nextForFile };
      });
    },
    [applyColumnWidthToDom, autoColumnWidthsPx, previewColumnMinWidthPx],
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
            const nextForFile = {
              ...existing,
              [colIndex]: toBasePreviewMeasurement(
                resolvedFinalWidth,
                normalizedPreviewZoomPercent,
                {
                  maxPx: PREVIEW_COL_RESIZE_MAX_BASE_PX,
                  minPx: PREVIEW_COL_RESIZE_MIN_BASE_PX,
                },
              ),
            };
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
      normalizedPreviewZoomPercent,
      previewFile?.fileId,
      scheduleColumnResizeDomUpdate,
    ],
  );

  useLayoutEffect(() => {
    const viewport = previewScrollRef.current;
    const previousZoomPercent = previousPreviewZoomPercentRef.current;
    previousPreviewZoomPercentRef.current = normalizedPreviewZoomPercent;

    if (!viewport || previousZoomPercent === normalizedPreviewZoomPercent) {
      return;
    }

    const previousScale = previousZoomPercent / 100;
    const nextScale = normalizedPreviewZoomPercent / 100;
    const scaleRatio =
      previousScale > 0 ? nextScale / previousScale : nextScale || 1;
    if (!Number.isFinite(scaleRatio) || scaleRatio <= 0) return;

    const nextScrollTop = Math.max(
      0,
      Math.min(
        Math.max(0, viewport.scrollHeight - viewport.clientHeight),
        viewport.scrollTop * scaleRatio,
      ),
    );
    const nextScrollLeft = Math.max(
      0,
      Math.min(
        Math.max(0, viewport.scrollWidth - viewport.clientWidth),
        viewport.scrollLeft * scaleRatio,
      ),
    );

    if (Math.abs(nextScrollTop - viewport.scrollTop) > 0.5) {
      viewport.scrollTop = nextScrollTop;
    }
    if (Math.abs(nextScrollLeft - viewport.scrollLeft) > 0.5) {
      viewport.scrollLeft = nextScrollLeft;
    }
  }, [normalizedPreviewZoomPercent, previewScrollRef]);

  const previewWindow = usePreviewRowWindow({
    ensurePreviewRows,
    overscanRows: renderOverscanRows,
    prefetchRowsAfter,
    prefetchRowsBefore,
    previewFileId: previewFile?.fileId,
    previewRowCount: previewFile?.rowCount,
    previewScrollTop,
    previewViewportHeight,
    rowHeightPx: previewRowHeightPx,
    windowShiftStrideRows: previewWindowShiftStrideRows,
  }) as PreviewWindow;

  const toggleColumn = useCallback(
    (index: number) => {
      if (!interactive) return;
      if (index < 0 || index >= dataColumnCount) return;
      setConfig((prev) => {
        const yColumns = Array.isArray(prev?.yColumns)
          ? prev.yColumns
          : [];
        const isSelected = yColumns.includes(index);

        if (isSelected) {
          return {
            ...prev,
            yColumns: yColumns.filter((value) => value !== index),
          };
        }

        return {
          ...prev,
          yColumns: [...yColumns, index],
        };
      });
    },
    [interactive, setConfig],
  );

  const { activeCellRect, selectionRects, hideDragOverlay, renderDragOverlay } =
    usePreviewSelectionOverlay({
      dragOverlayRef,
      gridRef,
      previewColumnGeometry,
      previewFileId: previewFile?.fileId,
      previewTableRef,
      previewWindow,
      rowHeightPx: previewRowHeightPx,
      rowIndexWidthPx: previewRowIndexWidthPx,
      selections,
    }) as {
      activeCellRect: DOMRect | Record<string, number> | null;
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
      previewScrollRef,
      renderDragOverlay,
      setSelectionRange,
      selections,
      setSelections,
    }) as {
      copySelection: () => Promise<void>;
      handleCellMouseDown: (event: unknown) => void;
    };

  return {
    activeCellRect,
    containerRef,
    copySelection,
    dragOverlayRef,
    gridRef,
    handleCellMouseDown,
    handleColumnResizeStart,
    handlePreviewPick,
    handlePreviewScroll,
    isColumnResizing,
    previewColumnGeometry,
    previewColumnMinWidthPx,
    previewRowHeightPx,
    previewRowIndexWidthPx,
    previewScrollRef,
    previewTableRef,
    previewWindow,
    resetColumnWidth,
    yColumnsSet,
    setSelectionRange,
    selectionRects,
    selections,
    toggleColumn,
  };
};

