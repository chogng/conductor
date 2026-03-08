// @ts-nocheck
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

const clampNumber = (value, min, max) => Math.min(max, Math.max(min, value));

const sameRect = (a, b) =>
  a &&
  b &&
  a.left === b.left &&
  a.top === b.top &&
  a.width === b.width &&
  a.height === b.height;

const scheduleMicrotask =
  typeof queueMicrotask === "function"
    ? queueMicrotask
    : (callback) => Promise.resolve().then(callback);

const PREVIEW_PICK_FIELD_TO_CONFIG_FIELD = {
  templateName: "name",
  xDataStart: "xDataStart",
  xDataEnd: "xDataEnd",
  xPoints: "xPoints",
  yDataStart: "yDataStart",
  yDataEnd: "yDataEnd",
  yPoints: "yPoints",
  yCount: "yCount",
  yStep: "yStep",
  bottomTitle: "bottomTitle",
  leftTitle: "leftTitle",
  legendPrefix: "legendPrefix",
};

const PREVIEW_PICKABLE_FIELD_NAMES = new Set(
  Object.keys(PREVIEW_PICK_FIELD_TO_CONFIG_FIELD)
);

const isPreviewPickableField = (name) =>
  PREVIEW_PICKABLE_FIELD_NAMES.has(String(name ?? "").trim());

const normalizePreviewRange = (range) => {
  if (!range) return null;
  const startRow = Math.min(range.startRow, range.endRow);
  const endRow = Math.max(range.startRow, range.endRow);
  const startCol = Math.min(range.startCol, range.endCol);
  const endCol = Math.max(range.startCol, range.endCol);
  return { startRow, endRow, startCol, endCol };
};

export const getExcelColumnLabel = (index) => {
  let label = "";
  let i = index;
  while (i >= 0) {
    label = String.fromCharCode(65 + (i % 26)) + label;
    i = Math.floor(i / 26) - 1;
  }
  return label;
};

export const usePreviewPickHandler = ({
  containerRef,
  writeFieldFromPreview,
}) => {
  const focusedInputNameRef = useRef("");

  useEffect(() => {
    const root = containerRef.current;
    if (!root) return undefined;

    const handleFocusIn = (event) => {
      const name = event?.target?.name;
      if (isPreviewPickableField(name)) {
        focusedInputNameRef.current = name;
      }
    };

    const handleFocusOut = (event) => {
      const name = event?.target?.name;
      if (!isPreviewPickableField(name)) return;
      if (focusedInputNameRef.current === name) {
        focusedInputNameRef.current = "";
      }
    };

    root.addEventListener("focusin", handleFocusIn);
    root.addEventListener("focusout", handleFocusOut);
    return () => {
      root.removeEventListener("focusin", handleFocusIn);
      root.removeEventListener("focusout", handleFocusOut);
    };
  }, [containerRef]);

  const resolvePreviewPickFieldName = useCallback(() => {
    const activeName = document.activeElement?.name;
    if (isPreviewPickableField(activeName)) return activeName;

    const fallbackName = focusedInputNameRef.current;
    if (isPreviewPickableField(fallbackName)) return fallbackName;

    return "";
  }, []);

  const handlePreviewPick = useCallback(
    ({ event, rowIndex, colIndex }) => {
      const fieldName = resolvePreviewPickFieldName();
      const configField = PREVIEW_PICK_FIELD_TO_CONFIG_FIELD[fieldName];
      if (!configField) return false;

      event.preventDefault();
      const colLabel = getExcelColumnLabel(colIndex);
      const rowLabel = rowIndex + 1;
      writeFieldFromPreview(configField, `${colLabel}${rowLabel}`);
      return true;
    },
    [resolvePreviewPickFieldName, writeFieldFromPreview]
  );

  return handlePreviewPick;
};

export const createEmptyLiveColumnLayout = () => ({
  fileId: null,
  widths: [],
  tableWidth: 0,
  appliedWidthVarCount: 0,
});

export const buildPreviewColumnWindow = ({
  columnCount,
  scrollLeft,
  viewportWidth,
  rowIndexWidthPx,
  overscanPx,
}) => {
  const safeColumnCount = Math.max(0, Math.floor(Number(columnCount) || 0));
  const normalizedScrollLeft = Math.max(0, Number(scrollLeft) || 0);
  const normalizedViewportWidth = Math.max(0, Number(viewportWidth) || 0);
  const normalizedRowIndexWidth = Math.max(0, Number(rowIndexWidthPx) || 0);
  const dataViewportWidth = Math.max(
    0,
    normalizedViewportWidth - normalizedRowIndexWidth
  );

  if (!safeColumnCount) {
    return {
      startCol: 0,
      endCol: 0,
      leftSpacerPx: 0,
      rightSpacerPx: 0,
      scrollLeft: normalizedScrollLeft,
      viewportWidth: normalizedViewportWidth,
      dataViewportWidth,
      overscanPx: Math.max(0, Number(overscanPx) || 0),
    };
  }

  // Horizontal virtualization remains intentionally disabled. This helper now
  // owns the window contract so any future re-enable must happen here together
  // with spacer, scroll-threshold, and overlay/header/body alignment changes.
  return {
    startCol: 0,
    endCol: safeColumnCount,
    leftSpacerPx: 0,
    rightSpacerPx: 0,
    scrollLeft: normalizedScrollLeft,
    viewportWidth: normalizedViewportWidth,
    dataViewportWidth,
    overscanPx: Math.max(0, Number(overscanPx) || 0),
  };
};

export const buildPreviewColumnGeometry = ({
  columnCount,
  columnWidthsPx,
  rowIndexWidthPx,
  scrollLeft,
  viewportWidth,
  overscanPx,
  minColumnWidthPx,
}) => {
  const safeColumnCount = Math.max(0, Math.floor(Number(columnCount) || 0));
  const widthsPx = new Array(safeColumnCount);
  const startOffsetsPx = new Array(safeColumnCount + 1);
  let totalDataWidthPx = 0;
  startOffsetsPx[0] = 0;

  for (let i = 0; i < safeColumnCount; i++) {
    const width = Number(columnWidthsPx?.[i]);
    const resolvedWidth =
      Number.isFinite(width) && width > 0 ? width : minColumnWidthPx;
    widthsPx[i] = resolvedWidth;
    totalDataWidthPx += resolvedWidth;
    startOffsetsPx[i + 1] = totalDataWidthPx;
  }

  const window = buildPreviewColumnWindow({
    columnCount: safeColumnCount,
    scrollLeft,
    viewportWidth,
    rowIndexWidthPx,
    overscanPx,
  });

  const startCol = Math.max(
    0,
    Math.min(safeColumnCount, Math.floor(Number(window.startCol) || 0))
  );
  const endCol = Math.max(
    startCol,
    Math.min(safeColumnCount, Math.floor(Number(window.endCol) || 0))
  );
  const visibleColumnIndices = Array.from(
    { length: Math.max(0, endCol - startCol) },
    (_, i) => startCol + i
  );
  const hasLeftSpacer = window.leftSpacerPx > 0;
  const hasRightSpacer = window.rightSpacerPx > 0;

  return {
    columnCount: safeColumnCount,
    widthsPx,
    startOffsetsPx,
    totalDataWidthPx,
    tableWidthPx: rowIndexWidthPx + totalDataWidthPx,
    scrollLeft: window.scrollLeft,
    viewportWidth: window.viewportWidth,
    dataViewportWidth: window.dataViewportWidth,
    overscanPx: window.overscanPx,
    window: {
      ...window,
      startCol,
      endCol,
    },
    visibleColumnIndices,
    hasLeftSpacer,
    hasRightSpacer,
    renderColCount:
      1 +
      (hasLeftSpacer ? 1 : 0) +
      visibleColumnIndices.length +
      (hasRightSpacer ? 1 : 0),
  };
};

export const usePreviewColumnLayout = ({
  autoColumnWidthsPx,
  columnCount,
  columnWidthOverridesByFile,
  liveColumnLayoutRef,
  minColumnWidthPx,
  overscanPx,
  previewFileId,
  previewScrollLeft,
  previewTableRef,
  previewViewportWidth,
  resizeMaxWidthPx,
  resizeMinWidthPx,
  rowIndexWidthPx,
}) => {
  const columnWidthOverrides = useMemo(() => {
    if (!previewFileId) return {};
    return columnWidthOverridesByFile[previewFileId] ?? {};
  }, [columnWidthOverridesByFile, previewFileId]);

  const columnWidthsPx = useMemo(() => {
    const widths = new Array(columnCount);
    for (let i = 0; i < columnCount; i++) {
      const override = Number(columnWidthOverrides?.[i]);
      if (Number.isFinite(override) && override > 0) {
        widths[i] = clampNumber(override, resizeMinWidthPx, resizeMaxWidthPx);
        continue;
      }
      widths[i] = autoColumnWidthsPx[i] ?? minColumnWidthPx;
    }
    return widths;
  }, [
    autoColumnWidthsPx,
    columnCount,
    columnWidthOverrides,
    minColumnWidthPx,
    resizeMaxWidthPx,
    resizeMinWidthPx,
  ]);

  const previewColumnGeometry = useMemo(
    () =>
      buildPreviewColumnGeometry({
        columnCount,
        columnWidthsPx,
        rowIndexWidthPx,
        scrollLeft: previewScrollLeft,
        viewportWidth: previewViewportWidth,
        overscanPx,
        minColumnWidthPx,
      }),
    [
      columnCount,
      columnWidthsPx,
      minColumnWidthPx,
      overscanPx,
      previewScrollLeft,
      previewViewportWidth,
      rowIndexWidthPx,
    ]
  );

  useLayoutEffect(() => {
    const previousAppliedWidthVarCount =
      Number(liveColumnLayoutRef.current?.appliedWidthVarCount) || 0;
    const nextWidths = previewColumnGeometry.widthsPx.slice(0, columnCount);
    const nextTableWidth = previewColumnGeometry.tableWidthPx;
    const tableEl = previewTableRef.current;

    if (tableEl) {
      const maxVarCount = Math.max(
        previousAppliedWidthVarCount,
        nextWidths.length
      );
      for (let i = 0; i < maxVarCount; i++) {
        if (i < nextWidths.length) {
          const width = nextWidths[i] ?? minColumnWidthPx;
          tableEl.style.setProperty(`--da-preview-col-${i}-w`, `${width}px`);
        } else {
          tableEl.style.removeProperty(`--da-preview-col-${i}-w`);
        }
      }

      if (Number.isFinite(nextTableWidth) && nextTableWidth > 0) {
        tableEl.style.setProperty(
          "--da-preview-table-width",
          `${nextTableWidth}px`
        );
      } else {
        tableEl.style.removeProperty("--da-preview-table-width");
      }
    }

    liveColumnLayoutRef.current = {
      fileId: previewFileId ?? null,
      widths: nextWidths,
      tableWidth: nextTableWidth,
      appliedWidthVarCount: nextWidths.length,
    };
  }, [
    columnCount,
    liveColumnLayoutRef,
    minColumnWidthPx,
    previewColumnGeometry.tableWidthPx,
    previewColumnGeometry.widthsPx,
    previewFileId,
    previewTableRef,
  ]);

  const getColumnWidthPx = useCallback(
    (colIndex) => previewColumnGeometry.widthsPx[colIndex] ?? minColumnWidthPx,
    [minColumnWidthPx, previewColumnGeometry.widthsPx]
  );

  const initLiveColumnLayout = useCallback(
    (fileId) => {
      if (!fileId) {
        liveColumnLayoutRef.current = createEmptyLiveColumnLayout();
        return liveColumnLayoutRef.current;
      }

      const widths = previewColumnGeometry.widthsPx.slice(0, columnCount);
      const tableWidth = previewColumnGeometry.tableWidthPx;
      const next = {
        fileId,
        widths,
        tableWidth,
        appliedWidthVarCount: widths.length,
      };
      liveColumnLayoutRef.current = next;
      return next;
    },
    [
      columnCount,
      liveColumnLayoutRef,
      previewColumnGeometry.tableWidthPx,
      previewColumnGeometry.widthsPx,
    ]
  );

  const applyColumnWidthToDom = useCallback(
    (fileId, colIndex, width) => {
      if (!fileId) return;

      const live = liveColumnLayoutRef.current;
      if (live?.fileId !== fileId || live?.widths?.length !== columnCount) {
        initLiveColumnLayout(fileId);
      }

      const current = liveColumnLayoutRef.current;
      const prevWidth = Number(current?.widths?.[colIndex]);
      const clamped = clampNumber(width, resizeMinWidthPx, resizeMaxWidthPx);

      if (!Number.isFinite(prevWidth) || prevWidth <= 0) {
        current.widths[colIndex] = clamped;
      } else if (clamped !== prevWidth) {
        current.widths[colIndex] = clamped;
        current.tableWidth += clamped - prevWidth;
      }

      const tableEl = previewTableRef.current;
      if (!tableEl) return;

      tableEl.style.setProperty(
        `--da-preview-col-${colIndex}-w`,
        `${clamped}px`
      );

      if (Number.isFinite(current.tableWidth) && current.tableWidth > 0) {
        tableEl.style.setProperty(
          "--da-preview-table-width",
          `${current.tableWidth}px`
        );
      } else {
        tableEl.style.removeProperty("--da-preview-table-width");
      }
    },
    [
      columnCount,
      initLiveColumnLayout,
      liveColumnLayoutRef,
      previewTableRef,
      resizeMaxWidthPx,
      resizeMinWidthPx,
    ]
  );

  return {
    previewColumnGeometry,
    getColumnWidthPx,
    initLiveColumnLayout,
    applyColumnWidthToDom,
  };
};

export const usePreviewViewportSync = ({
  previewFileColumnCount,
  previewFileId,
  previewFileRowCount,
  previewScrollRef,
  previewStatusState,
}) => {
  const previewScrollTopRef = useRef(0);
  const previewScrollLeftRef = useRef(0);
  const previewScrollRafRef = useRef(0);
  const [previewScrollTop, setPreviewScrollTop] = useState(0);
  const [previewScrollLeft, setPreviewScrollLeft] = useState(0);
  const [previewViewportHeight, setPreviewViewportHeight] = useState(0);
  const [previewViewportWidth, setPreviewViewportWidth] = useState(0);

  const handlePreviewScroll = useCallback((scrollTop, scrollLeft) => {
    previewScrollTopRef.current = scrollTop;
    previewScrollLeftRef.current = scrollLeft;
    if (previewScrollRafRef.current) return;

    previewScrollRafRef.current = requestAnimationFrame(() => {
      previewScrollRafRef.current = 0;

      const nextTop = Math.max(0, previewScrollTopRef.current || 0);
      const nextLeft = Math.max(0, previewScrollLeftRef.current || 0);

      setPreviewScrollTop((prev) => (prev === nextTop ? prev : nextTop));
      setPreviewScrollLeft((prev) => (prev === nextLeft ? prev : nextLeft));
    });
  }, []);

  useEffect(() => {
    const el = previewScrollRef.current;
    if (!el) return undefined;

    let rafId = 0;
    let retryMeasureRafId = 0;
    let retryMeasureCount = 0;
    const MAX_MEASURE_RETRIES = 12;

    const commitSize = (height, width) => {
      setPreviewViewportHeight((prev) => (prev === height ? prev : height));
      setPreviewViewportWidth((prev) => (prev === width ? prev : width));
    };

    const scheduleCommit = (height, width) => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        rafId = 0;
        commitSize(height, width);
      });
    };

    const readViewportSize = () => {
      const rect = el.getBoundingClientRect();
      const height = Math.round(el.clientHeight || rect.height || 0);
      const width = Math.round(el.clientWidth || rect.width || 0);
      return { height, width };
    };

    const queueRetryMeasure = () => {
      if (retryMeasureRafId || retryMeasureCount >= MAX_MEASURE_RETRIES) return;
      retryMeasureCount += 1;
      retryMeasureRafId = requestAnimationFrame(() => {
        retryMeasureRafId = 0;
        measure();
      });
    };

    const measure = () => {
      const { height, width } = readViewportSize();
      scheduleCommit(height, width);

      // In some flex/conditional-render paths the scroll container mounts at
      // 0x0 for a few frames. Keep probing briefly so virtualization does not
      // lock into a tiny visible window and leave the rest of the panel blank.
      if (height <= 0 || width <= 0) {
        queueRetryMeasure();
        return;
      }

      retryMeasureCount = 0;
    };

    measure();

    const handleWindowResize = () => {
      retryMeasureCount = 0;
      measure();
    };

    // Keep a window-resize fallback even when ResizeObserver exists.
    window.addEventListener("resize", handleWindowResize);

    let ro = null;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(() => {
        retryMeasureCount = 0;
        measure();
      });
      ro.observe(el);
    }

    return () => {
      window.removeEventListener("resize", handleWindowResize);
      if (ro) ro.disconnect();
      if (rafId) cancelAnimationFrame(rafId);
      if (retryMeasureRafId) cancelAnimationFrame(retryMeasureRafId);
    };
  }, [previewFileId, previewScrollRef, previewStatusState]);

  useEffect(() => {
    return () => {
      if (previewScrollRafRef.current) {
        cancelAnimationFrame(previewScrollRafRef.current);
      }
    };
  }, []);

  useEffect(() => {
    // Preserve scroll position across file switches for easier cross-file comparison.
    // Sync internal state to the DOM's current scrollTop/Left (browser may clamp them).
    const el = previewScrollRef.current;
    if (!el) return undefined;

    let rafId = requestAnimationFrame(() => {
      rafId = 0;
      handlePreviewScroll(el.scrollTop || 0, el.scrollLeft || 0);
    });

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [
    handlePreviewScroll,
    previewFileColumnCount,
    previewFileId,
    previewFileRowCount,
    previewScrollRef,
  ]);

  return {
    handlePreviewScroll,
    previewScrollLeft,
    previewScrollTop,
    previewViewportHeight,
    previewViewportWidth,
  };
};

export const buildPreviewRowWindow = ({
  overscanRows,
  rowCount,
  rowHeightPx,
  scrollTop,
  viewportHeight,
}) => {
  const totalRows = Number.isFinite(rowCount) ? rowCount : 0;
  if (!totalRows) {
    return {
      totalRows: 0,
      startRow: 0,
      endRow: 0,
      topSpacerHeight: 0,
      bottomSpacerHeight: 0,
    };
  }

  const normalizedRowHeight = Math.max(1, Number(rowHeightPx) || 1);
  const normalizedOverscanRows = Math.max(
    0,
    Math.floor(Number(overscanRows) || 0)
  );
  const resolvedViewportHeight =
    Math.max(0, Number(viewportHeight) || 0) || 500;
  const normalizedScrollTop = Math.max(0, Number(scrollTop) || 0);
  const visibleCount = Math.max(
    1,
    Math.ceil(resolvedViewportHeight / normalizedRowHeight)
  );
  const scrollRow = Math.floor(normalizedScrollTop / normalizedRowHeight);
  const startRow = Math.max(
    0,
    Math.min(totalRows - 1, scrollRow - normalizedOverscanRows)
  );
  const endRow = Math.max(
    startRow + 1,
    Math.min(totalRows, startRow + visibleCount + normalizedOverscanRows * 2)
  );

  return {
    totalRows,
    startRow,
    endRow,
    topSpacerHeight: startRow * normalizedRowHeight,
    bottomSpacerHeight: (totalRows - endRow) * normalizedRowHeight,
  };
};

export const usePreviewRowWindow = ({
  ensurePreviewRows,
  overscanRows,
  previewFileId,
  previewRowCount,
  previewScrollTop,
  previewViewportHeight,
  rowHeightPx,
}) => {
  const previewWindow = useMemo(
    () =>
      buildPreviewRowWindow({
        overscanRows,
        rowCount: previewRowCount,
        rowHeightPx,
        scrollTop: previewScrollTop,
        viewportHeight: previewViewportHeight,
      }),
    [
      overscanRows,
      previewRowCount,
      previewScrollTop,
      previewViewportHeight,
      rowHeightPx,
    ]
  );

  useEffect(() => {
    if (!previewFileId) return;
    if (typeof ensurePreviewRows !== "function") return;

    // Keep the visible (plus overscan) window warm in cache.
    void ensurePreviewRows(
      previewFileId,
      previewWindow.startRow,
      previewWindow.endRow
    );
  }, [
    ensurePreviewRows,
    previewFileId,
    previewWindow.endRow,
    previewWindow.startRow,
  ]);

  return previewWindow;
};

export const usePreviewSelectionInteractions = ({
  ensurePreviewRows,
  getPreviewRow,
  gridRef,
  handlePreviewPick,
  hideDragOverlay,
  previewFileId,
  renderDragOverlay,
  selections,
  setSelections,
}) => {
  const dragRef = useRef({
    startRow: null,
    startCol: null,
    endRow: null,
    endCol: null,
    startCellEl: null,
    endCellEl: null,
  });
  const isDraggingRef = useRef(false);
  const rafRef = useRef(0);
  const pendingPointRef = useRef(null);

  const clearSelection = useCallback(() => {
    setSelections([]);
    isDraggingRef.current = false;
    dragRef.current = {
      startRow: null,
      startCol: null,
      endRow: null,
      endCol: null,
      startCellEl: null,
      endCellEl: null,
    };
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }
    pendingPointRef.current = null;
    hideDragOverlay();
  }, [hideDragOverlay, setSelections]);

  const handleCellMouseDown = useCallback(
    (event) => {
      if (event.button !== 0) return;
      if (event.target?.tagName === "INPUT") return;

      const cellEl = event.currentTarget;
      const rowIndex = Number(cellEl?.dataset?.row);
      const colIndex = Number(cellEl?.dataset?.col);
      if (Number.isNaN(rowIndex) || Number.isNaN(colIndex)) return;

      if (
        typeof handlePreviewPick === "function" &&
        handlePreviewPick({ event, rowIndex, colIndex, cellEl }) === true
      ) {
        return;
      }

      event.preventDefault();
      setSelections([]);

      isDraggingRef.current = true;
      dragRef.current = {
        startRow: rowIndex,
        startCol: colIndex,
        endRow: rowIndex,
        endCol: colIndex,
        startCellEl: cellEl,
        endCellEl: cellEl,
      };

      renderDragOverlay(cellEl, cellEl);
    },
    [handlePreviewPick, renderDragOverlay, setSelections]
  );

  useEffect(() => {
    const updateDragFromPoint = (clientX, clientY) => {
      if (!isDraggingRef.current) return;
      const gridEl = gridRef.current;
      if (!gridEl) return;

      const element = document.elementFromPoint(clientX, clientY);
      const cellEl = element?.closest?.("td[data-row][data-col]");
      if (!cellEl || !gridEl.contains(cellEl)) return;

      const rowIndex = Number(cellEl.dataset.row);
      const colIndex = Number(cellEl.dataset.col);
      if (Number.isNaN(rowIndex) || Number.isNaN(colIndex)) return;

      const current = dragRef.current;
      if (current.endRow === rowIndex && current.endCol === colIndex) return;

      dragRef.current = {
        ...current,
        endRow: rowIndex,
        endCol: colIndex,
        endCellEl: cellEl,
      };
      renderDragOverlay(current.startCellEl, cellEl);
    };

    const handleMouseMove = (event) => {
      if (!isDraggingRef.current) return;

      pendingPointRef.current = { x: event.clientX, y: event.clientY };
      if (rafRef.current) return;

      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = 0;
        const point = pendingPointRef.current;
        pendingPointRef.current = null;
        if (!point) return;
        updateDragFromPoint(point.x, point.y);
      });
    };

    const finalizeDragSelection = () => {
      if (!isDraggingRef.current) return;

      isDraggingRef.current = false;
      pendingPointRef.current = null;

      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = 0;
      }

      const current = dragRef.current;
      const normalized = normalizePreviewRange({
        startRow: current.startRow,
        startCol: current.startCol,
        endRow: current.endRow,
        endCol: current.endCol,
      });

      dragRef.current = {
        startRow: null,
        startCol: null,
        endRow: null,
        endCol: null,
        startCellEl: null,
        endCellEl: null,
      };

      hideDragOverlay();

      if (!normalized) return;

      setSelections([
        {
          id: `${Date.now()}_${Math.random()}`,
          range: normalized,
        },
      ]);
    };

    const handleMouseUp = () => finalizeDragSelection();

    window.addEventListener("mousemove", handleMouseMove, { passive: true });
    window.addEventListener("mouseup", handleMouseUp);
    window.addEventListener("blur", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      window.removeEventListener("blur", handleMouseUp);
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = 0;
      }
    };
  }, [gridRef, hideDragOverlay, renderDragOverlay, setSelections]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      clearSelection();
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [clearSelection, previewFileId]);

  const buildSelectionTsv = useCallback(() => {
    if (!previewFileId || selections.length === 0) return "";
    if (typeof getPreviewRow !== "function") return "";

    const blocks = selections
      .map((selection) => selection.range)
      .filter(Boolean)
      .map((range) => {
        const rows = [];
        for (let r = range.startRow; r <= range.endRow; r++) {
          const rowCellsRaw = getPreviewRow(r);
          const rowCells = Array.isArray(rowCellsRaw) ? rowCellsRaw : [];
          const cols = [];
          for (let c = range.startCol; c <= range.endCol; c++) {
            cols.push(String(rowCells[c] ?? ""));
          }
          rows.push(cols.join("\t"));
        }
        return rows.join("\n");
      });

    return blocks.join("\n\n");
  }, [getPreviewRow, previewFileId, selections]);

  const copySelection = useCallback(async () => {
    if (!previewFileId) return;
    if (typeof ensurePreviewRows === "function") {
      const ranges = selections.map((s) => s.range).filter(Boolean);
      await Promise.all(
        ranges.map((range) =>
          ensurePreviewRows(previewFileId, range.startRow, range.endRow + 1)
        )
      );
    }

    const text = buildSelectionTsv();
    if (!text) return;

    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
    }
  }, [buildSelectionTsv, ensurePreviewRows, previewFileId, selections]);

  return {
    copySelection,
    handleCellMouseDown,
  };
};

export const usePreviewSelectionOverlay = ({
  dragOverlayRef,
  gridRef,
  previewColumnGeometry,
  previewFileId,
  previewTableRef,
  previewWindow,
  rowHeightPx,
  rowIndexWidthPx,
  selections,
}) => {
  const [selectionRects, setSelectionRects] = useState([]);

  const hideDragOverlay = useCallback(() => {
    const overlay = dragOverlayRef.current;
    if (!overlay) return;
    overlay.style.display = "none";
    overlay.style.width = "0px";
    overlay.style.height = "0px";
    overlay.style.transform = "translate3d(0px, 0px, 0)";
  }, [dragOverlayRef]);

  const getRectFromCells = useCallback(
    (startCellEl, endCellEl) => {
      const gridEl = gridRef.current;
      if (!gridEl || !startCellEl || !endCellEl) return null;

      const gridRect = gridEl.getBoundingClientRect();
      const startRect = startCellEl.getBoundingClientRect();
      const endRect = endCellEl.getBoundingClientRect();

      const left = Math.min(startRect.left, endRect.left) - gridRect.left;
      const top = Math.min(startRect.top, endRect.top) - gridRect.top;
      const right = Math.max(startRect.right, endRect.right) - gridRect.left;
      const bottom = Math.max(startRect.bottom, endRect.bottom) - gridRect.top;

      return {
        left,
        top,
        width: right - left,
        height: bottom - top,
      };
    },
    [gridRef]
  );

  const getRectFromRange = useCallback(
    (range) => {
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

      const gridEl = gridRef.current;
      if (gridEl) {
        const startCellEl = gridEl.querySelector(
          `td[data-row="${startRow}"][data-col="${startCol}"]`
        );
        const endCellEl = gridEl.querySelector(
          `td[data-row="${endRow}"][data-col="${endCol}"]`
        );
        if (startCellEl && endCellEl) {
          return getRectFromCells(startCellEl, endCellEl);
        }
      }

      const startOffsetsPx = previewColumnGeometry.startOffsetsPx;
      const colStart = startOffsetsPx[startCol] ?? 0;
      const colEnd = startOffsetsPx[endCol + 1] ?? colStart;

      const headerHeight = (() => {
        const thead = previewTableRef.current?.tHead;
        const row = thead?.rows?.[0];
        const h = row?.getBoundingClientRect?.().height;
        return Number.isFinite(h) && h > 0 ? h : rowHeightPx;
      })();
      const rowTop = headerHeight + Math.max(0, startRow) * rowHeightPx;
      const rowBottom = headerHeight + (Math.max(0, endRow) + 1) * rowHeightPx;

      const left = rowIndexWidthPx + Math.max(0, colStart);
      const right = rowIndexWidthPx + Math.max(left, colEnd);

      return {
        left,
        top: rowTop,
        width: right - left,
        height: rowBottom - rowTop,
      };
    },
    [
      getRectFromCells,
      gridRef,
      previewColumnGeometry.startOffsetsPx,
      previewTableRef,
      rowHeightPx,
      rowIndexWidthPx,
    ]
  );

  useLayoutEffect(() => {
    const next = [];
    for (const selection of Array.isArray(selections) ? selections : []) {
      if (!selection?.id) continue;
      const rect = getRectFromRange(selection.range);
      if (!rect) continue;
      next.push({ id: selection.id, rect });
    }

    let cancelled = false;
    scheduleMicrotask(() => {
      if (cancelled) return;
      setSelectionRects((prev) => {
        if (!Array.isArray(prev) || prev.length !== next.length) return next;
        for (let i = 0; i < next.length; i++) {
          if (prev[i]?.id !== next[i]?.id) return next;
          if (!sameRect(prev[i]?.rect, next[i]?.rect)) return next;
        }
        return prev;
      });
    });

    return () => {
      cancelled = true;
    };
  }, [
    getRectFromRange,
    previewColumnGeometry.window.endCol,
    previewColumnGeometry.window.startCol,
    previewFileId,
    previewWindow.endRow,
    previewWindow.startRow,
    selections,
  ]);

  const renderDragOverlay = useCallback(
    (startCellEl, endCellEl) => {
      const overlay = dragOverlayRef.current;
      const rect = getRectFromCells(startCellEl, endCellEl);
      if (!overlay || !rect) return;

      overlay.style.display = "block";
      overlay.style.transform = `translate3d(${rect.left}px, ${rect.top}px, 0)`;
      overlay.style.width = `${rect.width}px`;
      overlay.style.height = `${rect.height}px`;
    },
    [dragOverlayRef, getRectFromCells]
  );

  return {
    selectionRects,
    hideDragOverlay,
    renderDragOverlay,
    getRectFromCells,
  };
};
