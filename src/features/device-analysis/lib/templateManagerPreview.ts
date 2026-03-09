import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, } from "react";
const clampNumber = (value: any, min: any, max: any) => Math.min(max, Math.max(min, value));
const sameRect = (a: any, b: any) => a &&
    b &&
    a.left === b.left &&
    a.top === b.top &&
    a.width === b.width &&
    a.height === b.height;
const scheduleMicrotask = typeof queueMicrotask === "function"
    ? queueMicrotask
    : (callback: any) => Promise.resolve().then(callback);
const PREVIEW_DRAG_EDGE_SCROLL_ZONE_PX = 28;
const PREVIEW_DRAG_EDGE_SCROLL_STEP_PX = 26;
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
const PREVIEW_PICKABLE_FIELD_NAMES = new Set(Object.keys(PREVIEW_PICK_FIELD_TO_CONFIG_FIELD));
const isPreviewPickableField = (name: any) => PREVIEW_PICKABLE_FIELD_NAMES.has(String(name ?? "").trim());
const normalizePreviewRange = (range: any) => {
    if (!range)
        return null;
    const startRow = Math.min(range.startRow, range.endRow);
    const endRow = Math.max(range.startRow, range.endRow);
    const startCol = Math.min(range.startCol, range.endCol);
    const endCol = Math.max(range.startCol, range.endCol);
    return { startRow, endRow, startCol, endCol };
};
export const getExcelColumnLabel = (index: any) => {
    let label = "";
    let i = index;
    while (i >= 0) {
        label = String.fromCharCode(65 + (i % 26)) + label;
        i = Math.floor(i / 26) - 1;
    }
    return label;
};
export const usePreviewPickHandler = ({ containerRef, writeFieldFromPreview, }: any) => {
    const focusedInputNameRef = useRef("");
    useEffect(() => {
        const root = containerRef.current;
        if (!root)
            return undefined;
        const handleFocusIn = (event: any) => {
            const name = event?.target?.name;
            if (isPreviewPickableField(name)) {
                focusedInputNameRef.current = name;
            }
        };
        const handleFocusOut = (event: any) => {
            const name = event?.target?.name;
            if (!isPreviewPickableField(name))
                return;
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
        const activeName = (document.activeElement as
            | HTMLInputElement
            | null
        )?.name;
        if (isPreviewPickableField(activeName))
            return activeName;
        const fallbackName = focusedInputNameRef.current;
        if (isPreviewPickableField(fallbackName))
            return fallbackName;
        return "";
    }, []);
    const handlePreviewPick = useCallback(({ event, rowIndex, colIndex }: any) => {
        const fieldName = resolvePreviewPickFieldName();
        const configField = PREVIEW_PICK_FIELD_TO_CONFIG_FIELD[fieldName as keyof typeof PREVIEW_PICK_FIELD_TO_CONFIG_FIELD];
        if (!configField)
            return false;
        event.preventDefault();
        const colLabel = getExcelColumnLabel(colIndex);
        const rowLabel = rowIndex + 1;
        writeFieldFromPreview(configField, `${colLabel}${rowLabel}`);
        return true;
    }, [resolvePreviewPickFieldName, writeFieldFromPreview]);
    return handlePreviewPick;
};
export const createEmptyLiveColumnLayout = () => ({
    fileId: null,
    widths: [],
    tableWidth: 0,
    appliedWidthVarCount: 0,
});
const lowerBound = (values: any, target: any) => {
    let low = 0;
    let high = values.length;
    while (low < high) {
        const mid = Math.floor((low + high) / 2);
        if ((values[mid] ?? 0) < target) {
            low = mid + 1;
        }
        else {
            high = mid;
        }
    }
    return low;
};
const upperBound = (values: any, target: any) => {
    let low = 0;
    let high = values.length;
    while (low < high) {
        const mid = Math.floor((low + high) / 2);
        if ((values[mid] ?? 0) <= target) {
            low = mid + 1;
        }
        else {
            high = mid;
        }
    }
    return low;
};
export const buildPreviewColumnWindow = ({ columnCount, scrollLeft, viewportWidth, rowIndexWidthPx, overscanPx, startOffsetsPx, totalDataWidthPx, }: any) => {
    const safeColumnCount = Math.max(0, Math.floor(Number(columnCount) || 0));
    const normalizedScrollLeft = Math.max(0, Number(scrollLeft) || 0);
    const normalizedViewportWidth = Math.max(0, Number(viewportWidth) || 0);
    const normalizedRowIndexWidth = Math.max(0, Number(rowIndexWidthPx) || 0);
    const dataViewportWidth = Math.max(0, normalizedViewportWidth - normalizedRowIndexWidth);
    const normalizedOverscanPx = Math.max(0, Number(overscanPx) || 0);
    if (!safeColumnCount) {
        return {
            startCol: 0,
            endCol: 0,
            leftSpacerPx: 0,
            rightSpacerPx: 0,
            scrollLeft: normalizedScrollLeft,
            viewportWidth: normalizedViewportWidth,
            dataViewportWidth,
            overscanPx: normalizedOverscanPx,
        };
    }
    const hasUsableOffsets = Array.isArray(startOffsetsPx) &&
        startOffsetsPx.length >= safeColumnCount + 1 &&
        Number.isFinite(totalDataWidthPx) &&
        totalDataWidthPx > 0;
    if (!hasUsableOffsets) {
        return {
            startCol: 0,
            endCol: safeColumnCount,
            leftSpacerPx: 0,
            rightSpacerPx: 0,
            scrollLeft: normalizedScrollLeft,
            viewportWidth: normalizedViewportWidth,
            dataViewportWidth,
            overscanPx: normalizedOverscanPx,
        };
    }
    const safeTotalDataWidthPx = Math.max(0, Number(totalDataWidthPx) || 0);
    const viewportStartPx = Math.max(0, normalizedScrollLeft - normalizedOverscanPx);
    const viewportEndPx = Math.min(safeTotalDataWidthPx, normalizedScrollLeft + Math.max(1, dataViewportWidth) + normalizedOverscanPx);
    const startCol = Math.max(0, Math.min(safeColumnCount - 1, upperBound(startOffsetsPx, viewportStartPx) - 1));
    const endCol = Math.max(startCol + 1, Math.min(safeColumnCount, lowerBound(startOffsetsPx, Math.max(viewportStartPx + 1, viewportEndPx))));
    const leftSpacerPx = Math.max(0, Number(startOffsetsPx[startCol]) || 0);
    const endOffset = Math.max(leftSpacerPx, Number(startOffsetsPx[endCol]) || 0);
    const rightSpacerPx = Math.max(0, safeTotalDataWidthPx - endOffset);
    return {
        startCol,
        endCol,
        leftSpacerPx,
        rightSpacerPx,
        scrollLeft: normalizedScrollLeft,
        viewportWidth: normalizedViewportWidth,
        dataViewportWidth,
        overscanPx: normalizedOverscanPx,
    };
};
export const buildPreviewColumnGeometry = ({ columnCount, columnWidthsPx, rowIndexWidthPx, scrollLeft, viewportWidth, overscanPx, minColumnWidthPx, }: any) => {
    const safeColumnCount = Math.max(0, Math.floor(Number(columnCount) || 0));
    const widthsPx = new Array(safeColumnCount);
    const startOffsetsPx = new Array(safeColumnCount + 1);
    let totalDataWidthPx = 0;
    startOffsetsPx[0] = 0;
    for (let i = 0; i < safeColumnCount; i++) {
        const width = Number(columnWidthsPx?.[i]);
        const resolvedWidth = Number.isFinite(width) && width > 0 ? width : minColumnWidthPx;
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
        startOffsetsPx,
        totalDataWidthPx,
    });
    const startCol = Math.max(0, Math.min(safeColumnCount, Math.floor(Number(window.startCol) || 0)));
    const endCol = Math.max(startCol, Math.min(safeColumnCount, Math.floor(Number(window.endCol) || 0)));
    const visibleColumnIndices = Array.from({ length: Math.max(0, endCol - startCol) }, (_: any, i: any) => startCol + i);
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
        renderColCount: 1 +
            (hasLeftSpacer ? 1 : 0) +
            visibleColumnIndices.length +
            (hasRightSpacer ? 1 : 0),
    };
};
export const usePreviewColumnLayout = ({ autoColumnWidthsPx, columnCount, columnWidthOverridesByFile, liveColumnLayoutRef, minColumnWidthPx, overscanPx, previewFileId, previewScrollLeft, previewTableRef, previewViewportWidth, resizeMaxWidthPx, resizeMinWidthPx, rowIndexWidthPx, }: any) => {
    const columnWidthOverrides = useMemo(() => {
        if (!previewFileId)
            return {};
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
    const previewColumnGeometry = useMemo(() => buildPreviewColumnGeometry({
        columnCount,
        columnWidthsPx,
        rowIndexWidthPx,
        scrollLeft: previewScrollLeft,
        viewportWidth: previewViewportWidth,
        overscanPx,
        minColumnWidthPx,
    }), [
        columnCount,
        columnWidthsPx,
        minColumnWidthPx,
        overscanPx,
        previewScrollLeft,
        previewViewportWidth,
        rowIndexWidthPx,
    ]);
    useLayoutEffect(() => {
        const previousAppliedWidthVarCount = Number(liveColumnLayoutRef.current?.appliedWidthVarCount) || 0;
        const nextWidths = previewColumnGeometry.widthsPx.slice(0, columnCount);
        const nextTableWidth = previewColumnGeometry.tableWidthPx;
        const tableEl = previewTableRef.current;
        if (tableEl) {
            const maxVarCount = Math.max(previousAppliedWidthVarCount, nextWidths.length);
            for (let i = 0; i < maxVarCount; i++) {
                if (i < nextWidths.length) {
                    const width = nextWidths[i] ?? minColumnWidthPx;
                    tableEl.style.setProperty(`--da-preview-col-${i}-w`, `${width}px`);
                }
                else {
                    tableEl.style.removeProperty(`--da-preview-col-${i}-w`);
                }
            }
            if (Number.isFinite(nextTableWidth) && nextTableWidth > 0) {
                tableEl.style.setProperty("--da-preview-table-width", `${nextTableWidth}px`);
            }
            else {
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
    const getColumnWidthPx = useCallback((colIndex: any) => previewColumnGeometry.widthsPx[colIndex] ?? minColumnWidthPx, [minColumnWidthPx, previewColumnGeometry.widthsPx]);
    const initLiveColumnLayout = useCallback((fileId: any) => {
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
    }, [
        columnCount,
        liveColumnLayoutRef,
        previewColumnGeometry.tableWidthPx,
        previewColumnGeometry.widthsPx,
    ]);
    const applyColumnWidthToDom = useCallback((fileId: any, colIndex: any, width: any) => {
        if (!fileId)
            return;
        const live = liveColumnLayoutRef.current;
        if (live?.fileId !== fileId || live?.widths?.length !== columnCount) {
            initLiveColumnLayout(fileId);
        }
        const current = liveColumnLayoutRef.current;
        const prevWidth = Number(current?.widths?.[colIndex]);
        const clamped = clampNumber(width, resizeMinWidthPx, resizeMaxWidthPx);
        if (!Number.isFinite(prevWidth) || prevWidth <= 0) {
            current.widths[colIndex] = clamped;
        }
        else if (clamped !== prevWidth) {
            current.widths[colIndex] = clamped;
            current.tableWidth += clamped - prevWidth;
        }
        const tableEl = previewTableRef.current;
        if (!tableEl)
            return;
        tableEl.style.setProperty(`--da-preview-col-${colIndex}-w`, `${clamped}px`);
        if (Number.isFinite(current.tableWidth) && current.tableWidth > 0) {
            tableEl.style.setProperty("--da-preview-table-width", `${current.tableWidth}px`);
        }
        else {
            tableEl.style.removeProperty("--da-preview-table-width");
        }
    }, [
        columnCount,
        initLiveColumnLayout,
        liveColumnLayoutRef,
        previewTableRef,
        resizeMaxWidthPx,
        resizeMinWidthPx,
    ]);
    return {
        previewColumnGeometry,
        getColumnWidthPx,
        initLiveColumnLayout,
        applyColumnWidthToDom,
    };
};
export const usePreviewViewportSync = ({ previewFileColumnCount, previewFileId, previewFileRowCount, previewRowHeightPx = 1, previewScrollRef, previewStatusState, }: any) => {
    const previewScrollTopRef = useRef(0);
    const previewScrollLeftRef = useRef(0);
    const previousPreviewFileIdRef = useRef<string | null>(null);
    const previewScrollRafRef = useRef(0);
    const previewScrollVelocityResetTimerRef = useRef(0);
    const previewScrollVelocitySampleRef = useRef({
        left: 0,
        time: 0,
        top: 0,
    });
    const [previewScrollTop, setPreviewScrollTop] = useState(0);
    const [previewScrollLeft, setPreviewScrollLeft] = useState(0);
    const [previewViewportHeight, setPreviewViewportHeight] = useState(0);
    const [previewViewportWidth, setPreviewViewportWidth] = useState(0);
    const [previewHorizontalScrollVelocityTier, setPreviewHorizontalScrollVelocityTier] = useState(0);
    const [previewVerticalScrollVelocityTier, setPreviewVerticalScrollVelocityTier] = useState(0);
    const normalizedPreviewRowHeight = Math.max(1, Math.floor(Number(previewRowHeightPx) || 0));
    const quantizeScrollTop = useCallback((scrollTop: any) => {
        const normalized = Math.max(0, Number(scrollTop) || 0);
        return Math.floor(normalized / normalizedPreviewRowHeight) * normalizedPreviewRowHeight;
    }, [normalizedPreviewRowHeight]);
    const resolveScrollVelocityTier = useCallback((deltaPxPerSecond: any) => {
        const speed = Math.max(0, Number(deltaPxPerSecond) || 0);
        if (speed >= 1600)
            return 2;
        if (speed >= 600)
            return 1;
        return 0;
    }, []);
    const scheduleScrollVelocityIdleReset = useCallback(() => {
        if (typeof window === "undefined")
            return;
        if (previewScrollVelocityResetTimerRef.current) {
            window.clearTimeout(previewScrollVelocityResetTimerRef.current);
        }
        previewScrollVelocityResetTimerRef.current = window.setTimeout(() => {
            previewScrollVelocityResetTimerRef.current = 0;
            setPreviewHorizontalScrollVelocityTier((prev: any) => (prev === 0 ? prev : 0));
            setPreviewVerticalScrollVelocityTier((prev: any) => (prev === 0 ? prev : 0));
        }, 140);
    }, []);
    const handlePreviewScroll = useCallback((scrollTop: any, scrollLeft: any) => {
        previewScrollTopRef.current = scrollTop;
        previewScrollLeftRef.current = scrollLeft;
        if (previewScrollRafRef.current)
            return;
        previewScrollRafRef.current = requestAnimationFrame(() => {
            previewScrollRafRef.current = 0;
            const nextTop = quantizeScrollTop(previewScrollTopRef.current);
            const nextLeft = Math.max(0, previewScrollLeftRef.current || 0);
            const now = typeof performance !== "undefined" && typeof performance.now === "function"
                ? performance.now()
                : Date.now();
            const sample = previewScrollVelocitySampleRef.current;
            const dt = Math.max(0, now - (Number(sample.time) || 0));
            const dx = Math.abs(nextLeft - (Number(sample.left) || 0));
            const dy = Math.abs(nextTop - (Number(sample.top) || 0));
            const speedX = dt > 0 ? (dx * 1000) / dt : 0;
            const speedY = dt > 0 ? (dy * 1000) / dt : 0;
            const nextHorizontalTier = resolveScrollVelocityTier(speedX);
            const nextVerticalTier = resolveScrollVelocityTier(speedY);
            setPreviewHorizontalScrollVelocityTier((prev: any) => (prev === nextHorizontalTier ? prev : nextHorizontalTier));
            setPreviewVerticalScrollVelocityTier((prev: any) => (prev === nextVerticalTier ? prev : nextVerticalTier));
            previewScrollVelocitySampleRef.current = {
                left: nextLeft,
                time: now,
                top: nextTop,
            };
            scheduleScrollVelocityIdleReset();
            setPreviewScrollTop((prev: any) => (prev === nextTop ? prev : nextTop));
            setPreviewScrollLeft((prev: any) => (prev === nextLeft ? prev : nextLeft));
        });
    }, [
        quantizeScrollTop,
        resolveScrollVelocityTier,
        scheduleScrollVelocityIdleReset,
    ]);
    useEffect(() => {
        const el = previewScrollRef.current;
        if (!el)
            return undefined;
        let rafId = 0;
        let retryMeasureRafId = 0;
        let retryMeasureCount = 0;
        const MAX_MEASURE_RETRIES = 12;
        const commitSize = (height: any, width: any) => {
            setPreviewViewportHeight((prev: any) => (prev === height ? prev : height));
            setPreviewViewportWidth((prev: any) => (prev === width ? prev : width));
        };
        const scheduleCommit = (height: any, width: any) => {
            if (rafId)
                cancelAnimationFrame(rafId);
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
            if (retryMeasureRafId || retryMeasureCount >= MAX_MEASURE_RETRIES)
                return;
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
            if (ro)
                ro.disconnect();
            if (rafId)
                cancelAnimationFrame(rafId);
            if (retryMeasureRafId)
                cancelAnimationFrame(retryMeasureRafId);
        };
    }, [previewFileId, previewScrollRef, previewStatusState]);
    useEffect(() => {
        return () => {
            if (previewScrollRafRef.current) {
                cancelAnimationFrame(previewScrollRafRef.current);
            }
            if (typeof window !== "undefined" &&
                previewScrollVelocityResetTimerRef.current) {
                window.clearTimeout(previewScrollVelocityResetTimerRef.current);
                previewScrollVelocityResetTimerRef.current = 0;
            }
        };
    }, []);
    useEffect(() => {
        // File switch must reset viewport to top-left; otherwise virtualization
        // starts from previous file's scroll offset and appears to "drop" top rows.
        const el = previewScrollRef.current;
        if (!el)
            return undefined;
        const normalizedFileId = typeof previewFileId === "string" && previewFileId ? previewFileId : null;
        const shouldResetViewport = previousPreviewFileIdRef.current !== normalizedFileId;
        previousPreviewFileIdRef.current = normalizedFileId;
        let rafId = requestAnimationFrame(() => {
            rafId = 0;
            if (shouldResetViewport) {
                el.scrollTop = 0;
                el.scrollLeft = 0;
                previewScrollTopRef.current = 0;
                previewScrollLeftRef.current = 0;
                const now = typeof performance !== "undefined" &&
                    typeof performance.now === "function"
                    ? performance.now()
                    : Date.now();
                previewScrollVelocitySampleRef.current = {
                    left: 0,
                    time: now,
                    top: 0,
                };
                setPreviewHorizontalScrollVelocityTier((prev: any) => (prev === 0 ? prev : 0));
                setPreviewVerticalScrollVelocityTier((prev: any) => (prev === 0 ? prev : 0));
            }
            handlePreviewScroll(el.scrollTop || 0, el.scrollLeft || 0);
        });
        return () => {
            if (rafId)
                cancelAnimationFrame(rafId);
        };
    }, [handlePreviewScroll, previewFileId, previewScrollRef]);
    return {
        handlePreviewScroll,
        previewHorizontalScrollVelocityTier,
        previewScrollLeft,
        previewScrollTop,
        previewVerticalScrollVelocityTier,
        previewViewportHeight,
        previewViewportWidth,
    };
};
export const buildPreviewRowWindow = ({ overscanRows, rowCount, rowHeightPx, scrollTop, viewportHeight, windowShiftStrideRows, }: any) => {
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
    const normalizedOverscanRows = Math.max(0, Math.floor(Number(overscanRows) || 0));
    const resolvedViewportHeight = Math.max(0, Number(viewportHeight) || 0) || 500;
    const normalizedScrollTop = Math.max(0, Number(scrollTop) || 0);
    const visibleCount = Math.max(1, Math.ceil(resolvedViewportHeight / normalizedRowHeight));
    const visibleStartRow = Math.floor(normalizedScrollTop / normalizedRowHeight);
    const normalizedWindowShiftStrideRows = Math.max(1, Math.floor(Number(windowShiftStrideRows) ||
        normalizedOverscanRows ||
        1));
    // Hysteresis window: keep a stable row window while scrolling inside the
    // current overscan band, and shift in larger steps to reduce rerenders.
    const anchoredVisibleStartRow = Math.floor(visibleStartRow / normalizedWindowShiftStrideRows) * normalizedWindowShiftStrideRows;
    const startRow = Math.max(0, Math.min(totalRows - 1, anchoredVisibleStartRow - normalizedOverscanRows));
    const endRow = Math.max(startRow + 1, Math.min(totalRows, anchoredVisibleStartRow + visibleCount + normalizedOverscanRows * 2));
    return {
        totalRows,
        startRow,
        endRow,
        topSpacerHeight: startRow * normalizedRowHeight,
        bottomSpacerHeight: (totalRows - endRow) * normalizedRowHeight,
    };
};
export const usePreviewRowWindow = ({ ensurePreviewRows, overscanRows, prefetchRows, previewFileId, previewRowCount, previewScrollTop, previewViewportHeight, rowHeightPx, }: any) => {
    const previewWindow = useMemo(() => buildPreviewRowWindow({
        overscanRows,
        rowCount: previewRowCount,
        rowHeightPx,
        scrollTop: previewScrollTop,
        viewportHeight: previewViewportHeight,
        windowShiftStrideRows: overscanRows,
    }), [
        overscanRows,
        previewRowCount,
        previewScrollTop,
        previewViewportHeight,
        rowHeightPx,
    ]);
    const previewPrefetchRange = useMemo(() => {
        const normalizedPrefetchRows = Math.max(0, Math.floor(Number(prefetchRows) || Number(overscanRows) || 0));
        return {
            endRow: Math.max(previewWindow.endRow, previewWindow.endRow + normalizedPrefetchRows),
            startRow: Math.max(0, previewWindow.startRow - normalizedPrefetchRows),
        };
    }, [
        overscanRows,
        prefetchRows,
        previewWindow.endRow,
        previewWindow.startRow,
    ]);
    useEffect(() => {
        if (!previewFileId)
            return;
        if (typeof ensurePreviewRows !== "function")
            return;
        // Keep the visible (plus overscan) window warm in cache.
        void ensurePreviewRows(previewFileId, previewPrefetchRange.startRow, previewPrefetchRange.endRow);
    }, [
        ensurePreviewRows,
        previewFileId,
        previewPrefetchRange.endRow,
        previewPrefetchRange.startRow,
    ]);
    return previewWindow;
};
export const usePreviewSelectionInteractions = ({ ensurePreviewRows, getPreviewRow, gridRef, handlePreviewPick, hideDragOverlay, previewFileId, previewScrollRef, renderDragOverlay, selections, setSelectionRange, setSelections, }: any) => {
    const dragRef = useRef<any>({
        startRow: null,
        startCol: null,
        endRow: null,
        endCol: null,
        startCellEl: null,
        endCellEl: null,
        updateMode: "replace",
    });
    const selectionAnchorRef = useRef<any>(null);
    const isDraggingRef = useRef(false);
    const rafRef = useRef(0);
    const autoScrollRafRef = useRef(0);
    const pendingPointRef = useRef<any>(null);
    const lastPointerRef = useRef<any>(null);
    const computeEdgeScrollDelta = useCallback((pointer: any, edgeStart: any, edgeEnd: any) => {
        if (!Number.isFinite(pointer))
            return 0;
        const zone = PREVIEW_DRAG_EDGE_SCROLL_ZONE_PX;
        if (pointer < edgeStart + zone) {
            const ratio = Math.min(1, (edgeStart + zone - pointer) / zone);
            return -Math.max(1, Math.round(ratio * PREVIEW_DRAG_EDGE_SCROLL_STEP_PX));
        }
        if (pointer > edgeEnd - zone) {
            const ratio = Math.min(1, (pointer - (edgeEnd - zone)) / zone);
            return Math.max(1, Math.round(ratio * PREVIEW_DRAG_EDGE_SCROLL_STEP_PX));
        }
        return 0;
    }, []);
    const clearSelection = useCallback(() => {
        if (typeof setSelectionRange === "function") {
            setSelectionRange(null, { mode: "replace" });
        }
        else {
            setSelections([]);
        }
        isDraggingRef.current = false;
        dragRef.current = {
            startRow: null,
            startCol: null,
            endRow: null,
            endCol: null,
            startCellEl: null,
            endCellEl: null,
            updateMode: "replace",
        };
        selectionAnchorRef.current = null;
        if (rafRef.current) {
            cancelAnimationFrame(rafRef.current);
            rafRef.current = 0;
        }
        if (autoScrollRafRef.current) {
            cancelAnimationFrame(autoScrollRafRef.current);
            autoScrollRafRef.current = 0;
        }
        pendingPointRef.current = null;
        lastPointerRef.current = null;
        hideDragOverlay();
    }, [hideDragOverlay, setSelectionRange, setSelections]);
    const handleCellMouseDown = useCallback((event: any) => {
        if (event.button !== 0)
            return;
        if (event.target?.tagName === "INPUT")
            return;
        const cellEl = event.currentTarget;
        const rowIndex = Number(cellEl?.dataset?.row);
        const colIndex = Number(cellEl?.dataset?.col);
        if (Number.isNaN(rowIndex) || Number.isNaN(colIndex))
            return;
        if (typeof handlePreviewPick === "function" &&
            handlePreviewPick({ event, rowIndex, colIndex, cellEl }) === true) {
            return;
        }
        const isAppendMode = Boolean(event.ctrlKey || event.metaKey);
        const wantsExtend = Boolean(event.shiftKey);
        const anchor = selectionAnchorRef.current;
        const startRow = wantsExtend && anchor ? Number(anchor.rowIndex) : rowIndex;
        const startCol = wantsExtend && anchor ? Number(anchor.colIndex) : colIndex;
        if (!wantsExtend || !anchor) {
            selectionAnchorRef.current = { rowIndex, colIndex };
        }
        event.preventDefault();
        if (typeof setSelectionRange === "function") {
            setSelectionRange({
                startRow,
                endRow: rowIndex,
                startCol,
                endCol: colIndex,
            }, { mode: isAppendMode ? "append" : "replace" });
        }
        else {
            setSelections([
                {
                    id: `${Date.now()}_${Math.random()}`,
                    range: normalizePreviewRange({
                        startRow,
                        endRow: rowIndex,
                        startCol,
                        endCol: colIndex,
                    }),
                },
            ].filter((item: any) => item.range));
        }
        isDraggingRef.current = true;
        dragRef.current = {
            startRow,
            startCol,
            endRow: rowIndex,
            endCol: colIndex,
            startCellEl: cellEl,
            endCellEl: cellEl,
            updateMode: typeof setSelectionRange === "function" ? "updateLast" : "replace",
        };
        lastPointerRef.current = { x: event.clientX, y: event.clientY };
        renderDragOverlay(cellEl, cellEl);
    }, [handlePreviewPick, renderDragOverlay, setSelectionRange, setSelections]);
    useEffect(() => {
        const last = Array.isArray(selections) ? selections[selections.length - 1] : null;
        const range = last?.range;
        if (!range) {
            selectionAnchorRef.current = null;
            return;
        }
        selectionAnchorRef.current = {
            rowIndex: Math.max(0, Math.floor(Number(range.startRow) || 0)),
            colIndex: Math.max(0, Math.floor(Number(range.startCol) || 0)),
        };
    }, [previewFileId, selections]);
    useEffect(() => {
        const updateDragFromPoint = (clientX: any, clientY: any) => {
            if (!isDraggingRef.current)
                return;
            const gridEl = gridRef.current;
            if (!gridEl)
                return;
            const element = document.elementFromPoint(clientX, clientY);
            const cellEl = element?.closest?.("td[data-row][data-col]") as
                | HTMLTableCellElement
                | null;
            if (!cellEl || !gridEl.contains(cellEl))
                return;
            const rowIndex = Number(cellEl.dataset.row);
            const colIndex = Number(cellEl.dataset.col);
            if (Number.isNaN(rowIndex) || Number.isNaN(colIndex))
                return;
            const current = dragRef.current;
            if (current.endRow === rowIndex && current.endCol === colIndex)
                return;
            dragRef.current = {
                ...current,
                endRow: rowIndex,
                endCol: colIndex,
                endCellEl: cellEl,
            };
            if (typeof setSelectionRange === "function") {
                setSelectionRange({
                    startRow: current.startRow,
                    endRow: rowIndex,
                    startCol: current.startCol,
                    endCol: colIndex,
                }, { mode: current.updateMode || "updateLast" });
            }
            renderDragOverlay(current.startCellEl, cellEl);
        };
        const applyDragAutoScroll = (clientX: any, clientY: any) => {
            const viewport = previewScrollRef?.current;
            if (!viewport)
                return false;
            const rect = viewport.getBoundingClientRect();
            const deltaY = computeEdgeScrollDelta(clientY, rect.top, rect.bottom);
            const deltaX = computeEdgeScrollDelta(clientX, rect.left, rect.right);
            if (!deltaX && !deltaY)
                return false;
            const nextTop = Math.max(0, Math.min(viewport.scrollHeight - viewport.clientHeight, viewport.scrollTop + deltaY));
            const nextLeft = Math.max(0, Math.min(viewport.scrollWidth - viewport.clientWidth, viewport.scrollLeft + deltaX));
            const changed = Math.abs(nextTop - viewport.scrollTop) > 0.5 ||
                Math.abs(nextLeft - viewport.scrollLeft) > 0.5;
            if (!changed)
                return false;
            viewport.scrollTop = nextTop;
            viewport.scrollLeft = nextLeft;
            return true;
        };
        const processPointerPoint = (point: any) => {
            if (!point)
                return false;
            const scrolled = applyDragAutoScroll(point.x, point.y);
            updateDragFromPoint(point.x, point.y);
            return scrolled;
        };
        const runAutoScrollLoop = () => {
            autoScrollRafRef.current = 0;
            if (!isDraggingRef.current)
                return;
            const point = lastPointerRef.current;
            const scrolled = processPointerPoint(point);
            if (scrolled) {
                autoScrollRafRef.current = requestAnimationFrame(runAutoScrollLoop);
            }
        };
        const scheduleAutoScrollLoop = () => {
            if (autoScrollRafRef.current || !isDraggingRef.current)
                return;
            autoScrollRafRef.current = requestAnimationFrame(runAutoScrollLoop);
        };
        const handleMouseMove = (event: any) => {
            if (!isDraggingRef.current)
                return;
            const point = { x: event.clientX, y: event.clientY };
            lastPointerRef.current = point;
            pendingPointRef.current = point;
            if (rafRef.current)
                return;
            rafRef.current = requestAnimationFrame(() => {
                rafRef.current = 0;
                const point = pendingPointRef.current;
                pendingPointRef.current = null;
                if (!point)
                    return;
                processPointerPoint(point);
                scheduleAutoScrollLoop();
            });
        };
        const finalizeDragSelection = () => {
            if (!isDraggingRef.current)
                return;
            isDraggingRef.current = false;
            pendingPointRef.current = null;
            if (rafRef.current) {
                cancelAnimationFrame(rafRef.current);
                rafRef.current = 0;
            }
            if (autoScrollRafRef.current) {
                cancelAnimationFrame(autoScrollRafRef.current);
                autoScrollRafRef.current = 0;
            }
            const current = dragRef.current;
            const updateMode = current?.updateMode || "updateLast";
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
                updateMode: "replace",
            };
            lastPointerRef.current = null;
            hideDragOverlay();
            if (!normalized)
                return;
            if (typeof setSelectionRange === "function") {
                setSelectionRange(normalized, { mode: updateMode });
            }
            else {
                setSelections([
                    {
                        id: `${Date.now()}_${Math.random()}`,
                        range: normalized,
                    },
                ]);
            }
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
            if (autoScrollRafRef.current) {
                cancelAnimationFrame(autoScrollRafRef.current);
                autoScrollRafRef.current = 0;
            }
        };
    }, [computeEdgeScrollDelta, gridRef, hideDragOverlay, previewScrollRef, renderDragOverlay, setSelectionRange, setSelections]);
    useEffect(() => {
        const timeout = window.setTimeout(() => {
            clearSelection();
        }, 0);
        return () => window.clearTimeout(timeout);
    }, [clearSelection, previewFileId]);
    const buildSelectionTsv = useCallback(() => {
        if (!previewFileId || selections.length === 0)
            return "";
        if (typeof getPreviewRow !== "function")
            return "";
        const blocks = selections
            .map((selection: any) => selection.range)
            .filter(Boolean)
            .map((range: any) => {
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
        if (!previewFileId)
            return;
        if (typeof ensurePreviewRows === "function") {
            const ranges = selections.map((s: any) => s.range).filter(Boolean);
            await Promise.all(ranges.map((range: any) => ensurePreviewRows(previewFileId, range.startRow, range.endRow + 1)));
        }
        const text = buildSelectionTsv();
        if (!text)
            return;
        try {
            await navigator.clipboard.writeText(text);
        }
        catch {
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
export const usePreviewSelectionOverlay = ({ dragOverlayRef, gridRef, previewColumnGeometry, previewFileId, previewTableRef, previewWindow, rowHeightPx, rowIndexWidthPx, selections, }: any) => {
    const [selectionRects, setSelectionRects] = useState<any[]>([]);
    const hideDragOverlay = useCallback(() => {
        const overlay = dragOverlayRef.current;
        if (!overlay)
            return;
        overlay.style.display = "none";
        overlay.style.width = "0px";
        overlay.style.height = "0px";
        overlay.style.transform = "translate3d(0px, 0px, 0)";
    }, [dragOverlayRef]);
    const getRectFromCells = useCallback((startCellEl: any, endCellEl: any) => {
        const gridEl = gridRef.current;
        if (!gridEl || !startCellEl || !endCellEl)
            return null;
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
    }, [gridRef]);
    const getRectFromRange = useCallback((range: any) => {
        if (!range)
            return null;
        const startRow = Number(range.startRow);
        const endRow = Number(range.endRow);
        const startCol = Number(range.startCol);
        const endCol = Number(range.endCol);
        if (!Number.isFinite(startRow) ||
            !Number.isFinite(endRow) ||
            !Number.isFinite(startCol) ||
            !Number.isFinite(endCol)) {
            return null;
        }
        const gridEl = gridRef.current;
        if (gridEl) {
            const startCellEl = gridEl.querySelector(`td[data-row="${startRow}"][data-col="${startCol}"]`);
            const endCellEl = gridEl.querySelector(`td[data-row="${endRow}"][data-col="${endCol}"]`);
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
    }, [
        getRectFromCells,
        gridRef,
        previewColumnGeometry.startOffsetsPx,
        previewTableRef,
        rowHeightPx,
        rowIndexWidthPx,
    ]);
    useLayoutEffect(() => {
        const next: any[] = [];
        for (const selection of Array.isArray(selections) ? selections : []) {
            if (!selection?.id)
                continue;
            const rect = getRectFromRange(selection.range);
            if (!rect)
                continue;
            next.push({ id: selection.id, rect });
        }
        let cancelled = false;
        scheduleMicrotask(() => {
            if (cancelled)
                return;
            setSelectionRects((prev: any) => {
                if (!Array.isArray(prev) || prev.length !== next.length)
                    return next;
                for (let i = 0; i < next.length; i++) {
                    if (prev[i]?.id !== next[i]?.id)
                        return next;
                    if (!sameRect(prev[i]?.rect, next[i]?.rect))
                        return next;
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
    const renderDragOverlay = useCallback((startCellEl: any, endCellEl: any) => {
        const overlay = dragOverlayRef.current;
        const rect = getRectFromCells(startCellEl, endCellEl);
        if (!overlay || !rect)
            return;
        overlay.style.display = "block";
        overlay.style.transform = `translate3d(${rect.left}px, ${rect.top}px, 0)`;
        overlay.style.width = `${rect.width}px`;
        overlay.style.height = `${rect.height}px`;
    }, [dragOverlayRef, getRectFromCells]);
    return {
        selectionRects,
        hideDragOverlay,
        renderDragOverlay,
        getRectFromCells,
    };
};
