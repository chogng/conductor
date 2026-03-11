import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, } from "react";
import {
  getSelectionFocusCell,
  getSelectionModeFromPointerEvent,
  resolveSelectionDragStart,
} from "../preview/previewSelectionNavigation";
const clampNumber = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const sameRect = (a: any, b: any) => (!a && !b) ||
    Boolean(a &&
        b &&
        a.left === b.left &&
        a.top === b.top &&
        a.width === b.width &&
        a.height === b.height);
const scheduleMicrotask = typeof queueMicrotask === "function"
    ? queueMicrotask
    : (callback: any) => Promise.resolve().then(callback);
const PREVIEW_DRAG_EDGE_SCROLL_ZONE_PX = 28;
const PREVIEW_DRAG_EDGE_SCROLL_STEP_PX = 26;
const PREVIEW_WINDOW_MAX_VISIBLE_ROWS = 160;
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
const isEditableFormElement = (target: any) => {
    if (!(target instanceof HTMLElement))
        return false;
    const tag = target.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT")
        return true;
    if (target.isContentEditable)
        return true;
    if (target.closest("[contenteditable='true']"))
        return true;
    return false;
};
const normalizePreviewRange = (range: SelectionRange | null | undefined): SelectionRange | null => {
    if (!range)
        return null;
    const startRow = Math.min(range.startRow, range.endRow);
    const endRow = Math.max(range.startRow, range.endRow);
    const startCol = Math.min(range.startCol, range.endCol);
    const endCol = Math.max(range.startCol, range.endCol);
    return { startRow, endRow, startCol, endCol };
};
export const getExcelColumnLabel = (index: number) => {
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
            const nextFocusedName = event?.relatedTarget?.name;
            if (isPreviewPickableField(nextFocusedName)) {
                focusedInputNameRef.current = nextFocusedName;
                return;
            }
            // Keep the last pickable field when focus moves to non-editable UI such
            // as the preview viewport, buttons, or table cells. Only clear it when
            // the user explicitly moves into a different editable field.
            if (isEditableFormElement(event?.relatedTarget)) {
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
type ColumnWidthOverridesByFile = Record<string, Record<number, number>>;
type LiveColumnLayout = {
    fileId: string | null;
    widths: number[];
    tableWidth: number;
    appliedWidthVarCount: number;
};
type PreviewColumnWindowArgs = {
    columnCount: number;
    scrollLeft: number;
    viewportWidth: number;
    rowIndexWidthPx: number;
    overscanPx: number;
    startOffsetsPx: number[];
    totalDataWidthPx: number;
};
type PreviewColumnWindow = {
    startCol: number;
    endCol: number;
    leftSpacerPx: number;
    rightSpacerPx: number;
    scrollLeft: number;
    viewportWidth: number;
    dataViewportWidth: number;
    overscanPx: number;
};
type PreviewColumnGeometryArgs = {
    columnCount: number;
    columnWidthsPx: number[];
    rowIndexWidthPx: number;
    scrollLeft: number;
    viewportWidth: number;
    overscanPx: number;
    minColumnWidthPx: number;
};
type PreviewColumnGeometry = {
    columnCount: number;
    widthsPx: number[];
    startOffsetsPx: number[];
    totalDataWidthPx: number;
    tableWidthPx: number;
    scrollLeft: number;
    viewportWidth: number;
    dataViewportWidth: number;
    overscanPx: number;
    window: PreviewColumnWindow;
    visibleColumnIndices: number[];
    hasLeftSpacer: boolean;
    hasRightSpacer: boolean;
    renderColCount: number;
};
type UsePreviewColumnLayoutArgs = {
    autoColumnWidthsPx: number[];
    columnCount: number;
    columnWidthOverridesByFile: ColumnWidthOverridesByFile;
    liveColumnLayoutRef: { current: LiveColumnLayout };
    minColumnWidthPx: number;
    overscanPx: number;
    previewFileId?: string | null;
    previewScrollLeft: number;
    previewTableRef: { current: HTMLTableElement | null };
    previewViewportWidth: number;
    resizeMaxWidthPx: number;
    resizeMinWidthPx: number;
    rowIndexWidthPx: number;
};
type PreviewScrollFramePayload = {
    horizontalDirection: number;
    horizontalVelocityTier: number;
    scrollLeft: number;
    scrollTop: number;
    verticalDirection: number;
    verticalVelocityTier: number;
    viewportHeight: number;
    viewportWidth: number;
};
type UsePreviewViewportSyncArgs = {
    onPreviewScrollFrame?: (payload: PreviewScrollFramePayload) => void;
    previewFileColumnCount?: number;
    previewFileId?: string | null;
    previewFileRowCount?: number;
    previewRowHeightPx?: number;
    previewScrollRef: { current: HTMLDivElement | null };
    previewStatusState?: string | null;
    resolvePreviewHorizontalScrollCommitThresholdPx?: (params: {
        horizontalVelocityTier: number;
        viewportWidth: number;
    }) => number;
};
type UsePreviewViewportSyncResult = {
    handlePreviewScroll: (scrollTop: number, scrollLeft: number) => void;
    previewHorizontalScrollDirection: number;
    previewHorizontalScrollVelocityTier: number;
    previewScrollLeft: number;
    previewScrollTop: number;
    previewVerticalScrollDirection: number;
    previewVerticalScrollVelocityTier: number;
    previewViewportHeight: number;
    previewViewportWidth: number;
};
type SelectionSetMode = "replace" | "append" | "updateLast";
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
type SelectionPoint = {
    rowIndex: number;
    colIndex: number;
};
type PointerPoint = {
    x: number;
    y: number;
};
type SelectionDragState = {
    startRow: number | null;
    startCol: number | null;
    endRow: number | null;
    endCol: number | null;
    startCellEl: HTMLTableCellElement | null;
    endCellEl: HTMLTableCellElement | null;
    updateMode: SelectionSetMode;
};
type RectLike = Pick<DOMRect, "left" | "top" | "width" | "height">;
type SelectionRect = {
    id: string;
    rect: RectLike;
};
type PreviewPickHandler = (payload: {
    event: Event;
    rowIndex: number;
    colIndex: number;
    cellEl: Element;
}) => boolean;
type SetSelectionRangeFn = (range: SelectionRange | null, options?: {
    mode?: SelectionSetMode;
}) => void;
type UsePreviewSelectionInteractionsArgs = {
    ensurePreviewRows?: (fileId: string, startRow: number, endRow: number) => Promise<unknown> | unknown;
    getPreviewRow?: (rowIndex: number) => unknown;
    gridRef: { current: HTMLElement | null; };
    handlePreviewPick?: PreviewPickHandler;
    hideDragOverlay: () => void;
    previewFileId?: string | null;
    previewScrollRef?: { current: HTMLDivElement | null; };
    renderDragOverlay: (startCellEl: Element, endCellEl: Element) => void;
    selections: SelectionItem[];
    setSelectionRange?: SetSelectionRangeFn;
    setSelections: (value: SelectionItem[]) => void;
};
type UsePreviewSelectionOverlayArgs = {
    dragOverlayRef: { current: HTMLDivElement | null; };
    gridRef: { current: HTMLElement | null; };
    previewColumnGeometry: PreviewColumnGeometry;
    previewFileId?: string | null;
    previewTableRef: { current: HTMLTableElement | null; };
    previewWindow: {
        startRow: number;
        endRow: number;
    };
    rowHeightPx: number;
    rowIndexWidthPx: number;
    selections: SelectionItem[];
};
type PreviewPrefetchRange = {
    startRow: number;
    endRow: number;
};
type PreviewRowWindow = {
    totalRows: number;
    startRow: number;
    endRow: number;
    topSpacerHeight: number;
    bottomSpacerHeight: number;
};
type BuildPreviewPrefetchRangeFromWindowArgs = {
    prefetchRowsAfter: number;
    prefetchRowsBefore: number;
    previewWindow: Pick<PreviewRowWindow, "startRow" | "endRow">;
    rowCount?: number;
};
type BuildPreviewPrefetchRangeArgs = {
    overscanRows: number;
    prefetchRowsAfter: number;
    prefetchRowsBefore: number;
    rowCount?: number;
    rowHeightPx: number;
    scrollTop: number;
    viewportHeight: number;
    windowShiftStrideRows: number;
};
type BuildPreviewRowWindowArgs = {
    overscanRows: number;
    rowCount?: number;
    rowHeightPx: number;
    scrollTop: number;
    viewportHeight: number;
    windowShiftStrideRows: number;
};
type UsePreviewRowWindowArgs = {
    ensurePreviewRows?: (fileId: string, startRow: number, endRow: number) => Promise<unknown> | unknown;
    overscanRows: number;
    prefetchRowsAfter: number;
    prefetchRowsBefore: number;
    previewFileId?: string | null;
    previewRowCount?: number;
    previewScrollTop: number;
    previewViewportHeight: number;
    rowHeightPx: number;
    windowShiftStrideRows: number;
};
const createEmptySelectionDragState = (): SelectionDragState => ({
    startRow: null,
    startCol: null,
    endRow: null,
    endCol: null,
    startCellEl: null,
    endCellEl: null,
    updateMode: "replace",
});
const lowerBound = (values: number[], target: number) => {
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
const upperBound = (values: number[], target: number) => {
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
export const buildPreviewColumnWindow = ({ columnCount, scrollLeft, viewportWidth, rowIndexWidthPx, overscanPx, startOffsetsPx, totalDataWidthPx, }: PreviewColumnWindowArgs): PreviewColumnWindow => {
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
export const buildPreviewColumnGeometry = ({ columnCount, columnWidthsPx, rowIndexWidthPx, scrollLeft, viewportWidth, overscanPx, minColumnWidthPx, }: PreviewColumnGeometryArgs): PreviewColumnGeometry => {
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
    const visibleColumnIndices = Array.from({ length: Math.max(0, endCol - startCol) }, (_, i) => startCol + i);
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
export const usePreviewColumnLayout = ({ autoColumnWidthsPx, columnCount, columnWidthOverridesByFile, liveColumnLayoutRef, minColumnWidthPx, overscanPx, previewFileId, previewScrollLeft, previewTableRef, previewViewportWidth, resizeMaxWidthPx, resizeMinWidthPx, rowIndexWidthPx, }: UsePreviewColumnLayoutArgs) => {
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
    const getColumnWidthPx = useCallback((colIndex: number) => previewColumnGeometry.widthsPx[colIndex] ?? minColumnWidthPx, [minColumnWidthPx, previewColumnGeometry.widthsPx]);
    const initLiveColumnLayout = useCallback((fileId?: string | null) => {
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
    const applyColumnWidthToDom = useCallback((fileId: string, colIndex: number, width: number) => {
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
export const usePreviewViewportSync = ({ onPreviewScrollFrame, previewFileId, previewRowHeightPx = 1, previewScrollRef, previewStatusState, resolvePreviewHorizontalScrollCommitThresholdPx, }: UsePreviewViewportSyncArgs): UsePreviewViewportSyncResult => {
    const previewScrollTopRef = useRef(0);
    const previewScrollLeftRef = useRef(0);
    const previewCommittedScrollLeftRef = useRef(0);
    const previousPreviewFileIdRef = useRef<string | null>(null);
    const previewScrollCommitRafRef = useRef(0);
    const previewScrollVelocityResetTimerRef = useRef(0);
    const pendingPreviewScrollRef = useRef({
        left: 0,
        top: 0,
    });
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
    const [previewHorizontalScrollDirection, setPreviewHorizontalScrollDirection] = useState(0);
    const [previewVerticalScrollDirection, setPreviewVerticalScrollDirection] = useState(0);
    const normalizedPreviewRowHeight = Math.max(1, Math.floor(Number(previewRowHeightPx) || 0));
    const quantizeScrollTop = useCallback((scrollTop: number) => {
        const normalized = Math.max(0, Number(scrollTop) || 0);
        return Math.floor(normalized / normalizedPreviewRowHeight) * normalizedPreviewRowHeight;
    }, [normalizedPreviewRowHeight]);
    const resolveScrollVelocityTier = useCallback((deltaPxPerSecond: number) => {
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
            setPreviewHorizontalScrollVelocityTier((prev) => (prev === 0 ? prev : 0));
            setPreviewVerticalScrollVelocityTier((prev) => (prev === 0 ? prev : 0));
            setPreviewHorizontalScrollDirection((prev) => (prev === 0 ? prev : 0));
            setPreviewVerticalScrollDirection((prev) => (prev === 0 ? prev : 0));
        }, 140);
    }, []);
    const commitPreviewScroll = useCallback(() => {
        previewScrollCommitRafRef.current = 0;
        const pendingScroll = pendingPreviewScrollRef.current;
        const rawScrollTop = Number(pendingScroll.top) || 0;
        const rawScrollLeft = Number(pendingScroll.left) || 0;
        const nextTop = quantizeScrollTop(rawScrollTop);
        const nextLeft = Math.max(0, rawScrollLeft);
        previewScrollTopRef.current = nextTop;
        previewScrollLeftRef.current = nextLeft;
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
        const nextHorizontalDirection = dx > 0.5 ? (nextLeft > (Number(sample.left) || 0) ? 1 : -1) : 0;
        const nextVerticalDirection = dy > 0.5 ? (nextTop > (Number(sample.top) || 0) ? 1 : -1) : 0;
        const viewportEl = previewScrollRef.current;
        const viewportHeight = Math.round(viewportEl?.clientHeight || 0);
        const viewportWidth = Math.round(viewportEl?.clientWidth || 0);
        const horizontalCommitThresholdPx = Math.max(0, Number(resolvePreviewHorizontalScrollCommitThresholdPx?.({
            horizontalVelocityTier: nextHorizontalTier,
            viewportWidth,
        })) || 0);
        const committedScrollLeft = Math.max(0, Number(previewCommittedScrollLeftRef.current) || 0);
        // Keep native horizontal scrolling fully responsive and only refresh the
        // virtual column window once the viewport has consumed a meaningful slice
        // of its overscan buffer.
        const nextCommittedScrollLeft = horizontalCommitThresholdPx <= 0 ||
            Math.abs(nextLeft - committedScrollLeft) >= horizontalCommitThresholdPx
            ? nextLeft
            : committedScrollLeft;
        previewCommittedScrollLeftRef.current = nextCommittedScrollLeft;
        setPreviewHorizontalScrollVelocityTier((prev) => (prev === nextHorizontalTier ? prev : nextHorizontalTier));
        setPreviewVerticalScrollVelocityTier((prev) => (prev === nextVerticalTier ? prev : nextVerticalTier));
        setPreviewHorizontalScrollDirection((prev) => (prev === nextHorizontalDirection ? prev : nextHorizontalDirection));
        setPreviewVerticalScrollDirection((prev) => (prev === nextVerticalDirection ? prev : nextVerticalDirection));
        previewScrollVelocitySampleRef.current = {
            left: nextLeft,
            time: now,
            top: nextTop,
        };
        scheduleScrollVelocityIdleReset();
        onPreviewScrollFrame?.({
            horizontalDirection: nextHorizontalDirection,
            horizontalVelocityTier: nextHorizontalTier,
            scrollLeft: nextLeft,
            scrollTop: nextTop,
            verticalDirection: nextVerticalDirection,
            verticalVelocityTier: nextVerticalTier,
            viewportHeight,
            viewportWidth,
        });
        setPreviewScrollTop((prev) => (prev === nextTop ? prev : nextTop));
        setPreviewScrollLeft((prev) => (prev === nextCommittedScrollLeft ? prev : nextCommittedScrollLeft));
    }, [
        onPreviewScrollFrame,
        previewScrollRef,
        quantizeScrollTop,
        resolvePreviewHorizontalScrollCommitThresholdPx,
        resolveScrollVelocityTier,
        scheduleScrollVelocityIdleReset,
    ]);
    const schedulePreviewScrollCommit = useCallback(() => {
        if (typeof window === "undefined") {
            commitPreviewScroll();
            return;
        }
        if (previewScrollCommitRafRef.current)
            return;
        previewScrollCommitRafRef.current = requestAnimationFrame(() => {
            commitPreviewScroll();
        });
    }, [commitPreviewScroll]);
    const handlePreviewScroll = useCallback((scrollTop: number, scrollLeft: number) => {
        pendingPreviewScrollRef.current = {
            left: Math.max(0, Number(scrollLeft) || 0),
            top: Math.max(0, Number(scrollTop) || 0),
        };
        schedulePreviewScrollCommit();
    }, [schedulePreviewScrollCommit]);
    useEffect(() => {
        const el = previewScrollRef.current;
        if (!el)
            return undefined;
        let rafId = 0;
        let retryMeasureRafId = 0;
        let retryMeasureCount = 0;
        const MAX_MEASURE_RETRIES = 12;
        const commitSize = (height: number, width: number) => {
            setPreviewViewportHeight((prev) => (prev === height ? prev : height));
            setPreviewViewportWidth((prev) => (prev === width ? prev : width));
        };
        const scheduleCommit = (height: number, width: number) => {
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
            if (typeof window !== "undefined" &&
                previewScrollVelocityResetTimerRef.current) {
                window.clearTimeout(previewScrollVelocityResetTimerRef.current);
                previewScrollVelocityResetTimerRef.current = 0;
            }
            if (previewScrollCommitRafRef.current) {
                cancelAnimationFrame(previewScrollCommitRafRef.current);
                previewScrollCommitRafRef.current = 0;
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
                previewCommittedScrollLeftRef.current = 0;
                const now = typeof performance !== "undefined" &&
                    typeof performance.now === "function"
                    ? performance.now()
                    : Date.now();
                previewScrollVelocitySampleRef.current = {
                    left: 0,
                    time: now,
                    top: 0,
                };
                setPreviewHorizontalScrollVelocityTier((prev) => (prev === 0 ? prev : 0));
                setPreviewVerticalScrollVelocityTier((prev) => (prev === 0 ? prev : 0));
                setPreviewHorizontalScrollDirection((prev) => (prev === 0 ? prev : 0));
                setPreviewVerticalScrollDirection((prev) => (prev === 0 ? prev : 0));
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
        previewHorizontalScrollDirection,
        previewHorizontalScrollVelocityTier,
        previewScrollLeft,
        previewScrollTop,
        previewVerticalScrollDirection,
        previewVerticalScrollVelocityTier,
        previewViewportHeight,
        previewViewportWidth,
    };
};
export const buildPreviewPrefetchRangeFromWindow = ({ prefetchRowsAfter, prefetchRowsBefore, previewWindow, rowCount, }: BuildPreviewPrefetchRangeFromWindowArgs): PreviewPrefetchRange => {
    const totalRows = Math.max(0, Math.floor(Number(rowCount) || 0));
    const safeStart = Math.max(0, Math.floor(Number(previewWindow?.startRow) || 0));
    const safeEnd = Math.max(safeStart, Math.min(totalRows, Math.floor(Number(previewWindow?.endRow) || safeStart)));
    const before = Math.max(0, Math.floor(Number(prefetchRowsBefore) || 0));
    const after = Math.max(0, Math.floor(Number(prefetchRowsAfter) || 0));
    return {
        endRow: Math.max(safeEnd, Math.min(totalRows, safeEnd + after)),
        startRow: Math.max(0, safeStart - before),
    };
};
export const buildPreviewPrefetchRange = ({ overscanRows, prefetchRowsAfter, prefetchRowsBefore, rowCount, rowHeightPx, scrollTop, viewportHeight, windowShiftStrideRows, }: BuildPreviewPrefetchRangeArgs): PreviewPrefetchRange => {
    const previewWindow = buildPreviewRowWindow({
        overscanRows,
        rowCount,
        rowHeightPx,
        scrollTop,
        viewportHeight,
        windowShiftStrideRows,
    });
    return buildPreviewPrefetchRangeFromWindow({
        prefetchRowsAfter,
        prefetchRowsBefore,
        previewWindow,
        rowCount,
    });
};
export const buildPreviewRowWindow = ({ overscanRows, rowCount, rowHeightPx, scrollTop, viewportHeight, windowShiftStrideRows, }: BuildPreviewRowWindowArgs): PreviewRowWindow => {
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
    const rawVisibleCount = Math.max(1, Math.ceil(resolvedViewportHeight / normalizedRowHeight));
    const visibleCount = Math.min(PREVIEW_WINDOW_MAX_VISIBLE_ROWS, rawVisibleCount);
    const visibleStartRow = Math.floor(normalizedScrollTop / normalizedRowHeight);
    const renderBufferRows = Math.max(normalizedOverscanRows, Math.floor(Number(windowShiftStrideRows) || 0));
    const startRow = Math.max(0, Math.min(totalRows - 1, visibleStartRow - renderBufferRows));
    const endRow = Math.max(startRow + 1, Math.min(totalRows, visibleStartRow + visibleCount + renderBufferRows));
    return {
        totalRows,
        startRow,
        endRow,
        topSpacerHeight: startRow * normalizedRowHeight,
        bottomSpacerHeight: (totalRows - endRow) * normalizedRowHeight,
    };
};
export const usePreviewRowWindow = ({ ensurePreviewRows, overscanRows, prefetchRowsAfter, prefetchRowsBefore, previewFileId, previewRowCount, previewScrollTop, previewViewportHeight, rowHeightPx, windowShiftStrideRows, }: UsePreviewRowWindowArgs): PreviewRowWindow => {
    const resolvedWindowShiftStrideRows = Math.max(1, Math.floor(Number(windowShiftStrideRows) || Number(overscanRows) || 1));
    const previewWindow = useMemo(() => buildPreviewRowWindow({
        overscanRows,
        rowCount: previewRowCount,
        rowHeightPx,
        scrollTop: previewScrollTop,
        viewportHeight: previewViewportHeight,
        windowShiftStrideRows: resolvedWindowShiftStrideRows,
    }), [
        overscanRows,
        previewRowCount,
        previewScrollTop,
        previewViewportHeight,
        rowHeightPx,
        resolvedWindowShiftStrideRows,
    ]);
    const previewPrefetchRange = useMemo(() => {
        return buildPreviewPrefetchRangeFromWindow({
            prefetchRowsAfter,
            prefetchRowsBefore,
            previewWindow,
            rowCount: previewRowCount,
        });
    }, [
        prefetchRowsAfter,
        prefetchRowsBefore,
        previewRowCount,
        previewWindow,
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
export const usePreviewSelectionInteractions = ({ ensurePreviewRows, getPreviewRow, gridRef, handlePreviewPick, hideDragOverlay, previewFileId, previewScrollRef, renderDragOverlay, selections, setSelectionRange, setSelections, }: UsePreviewSelectionInteractionsArgs) => {
    const dragRef = useRef<SelectionDragState>(createEmptySelectionDragState());
    const selectionAnchorRef = useRef<SelectionPoint | null>(null);
    const isDraggingRef = useRef(false);
    const rafRef = useRef(0);
    const autoScrollRafRef = useRef(0);
    const pendingPointRef = useRef<PointerPoint | null>(null);
    const lastPointerRef = useRef<PointerPoint | null>(null);
    const computeEdgeScrollDelta = useCallback((pointer: number, edgeStart: number, edgeEnd: number) => {
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
        dragRef.current = createEmptySelectionDragState();
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
        const mode = getSelectionModeFromPointerEvent(event);
        const selectionStart = resolveSelectionDragStart({
            rowIndex,
            colIndex,
            anchor: selectionAnchorRef.current,
            shiftKey: event.shiftKey,
        });
        const startRow = selectionStart.startCell.rowIndex;
        const startCol = selectionStart.startCell.colIndex;
        selectionAnchorRef.current = selectionStart.nextAnchor;
        event.preventDefault();
        if (typeof setSelectionRange === "function") {
            setSelectionRange({
                startRow,
                endRow: rowIndex,
                startCol,
                endCol: colIndex,
            }, { mode });
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
            ].filter((item): item is SelectionItem => Boolean(item.range)));
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
        const updateDragFromPoint = (clientX: number, clientY: number) => {
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
            if (current.startRow === null || current.startCol === null || !current.startCellEl)
                return;
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
        const applyDragAutoScroll = (clientX: number, clientY: number) => {
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
        const processPointerPoint = (point: PointerPoint | null) => {
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
        const handleMouseMove = (event: MouseEvent) => {
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
            if (current.startRow === null ||
                current.startCol === null ||
                current.endRow === null ||
                current.endCol === null) {
                dragRef.current = createEmptySelectionDragState();
                lastPointerRef.current = null;
                hideDragOverlay();
                return;
            }
            const normalized = normalizePreviewRange({
                startRow: current.startRow,
                startCol: current.startCol,
                endRow: current.endRow,
                endCol: current.endCol,
            });
            dragRef.current = createEmptySelectionDragState();
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
        if (!previewFileId)
            return;
        if (typeof ensurePreviewRows === "function") {
            const ranges = selections.map((s) => s.range).filter(Boolean);
            await Promise.all(ranges.map((range) => ensurePreviewRows(previewFileId, range.startRow, range.endRow + 1)));
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
export const usePreviewSelectionOverlay = ({ dragOverlayRef, gridRef, previewColumnGeometry, previewFileId, previewTableRef, previewWindow, rowHeightPx, rowIndexWidthPx, selections, }: UsePreviewSelectionOverlayArgs) => {
    const [selectionRects, setSelectionRects] = useState<SelectionRect[]>([]);
    const [activeCellRect, setActiveCellRect] = useState<RectLike | null>(null);
    const hideDragOverlay = useCallback(() => {
        const overlay = dragOverlayRef.current;
        if (!overlay)
            return;
        overlay.style.display = "none";
        overlay.style.width = "0px";
        overlay.style.height = "0px";
        overlay.style.transform = "translate3d(0px, 0px, 0)";
    }, [dragOverlayRef]);
    const getRectFromCells = useCallback((startCellEl: Element | null, endCellEl: Element | null): RectLike | null => {
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
    const getRectFromRange = useCallback((range: SelectionRange | null | undefined): RectLike | null => {
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
            const h = Number(row?.getBoundingClientRect?.().height || 0);
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
        const next: SelectionRect[] = [];
        for (const selection of Array.isArray(selections) ? selections : []) {
            if (!selection?.id)
                continue;
            const rect = getRectFromRange(selection.range);
            if (!rect)
                continue;
            next.push({ id: selection.id, rect });
        }
        const lastSelection = Array.isArray(selections) ? selections[selections.length - 1] : null;
        const focusCell = getSelectionFocusCell(lastSelection?.range);
        const nextActiveCellRect = focusCell
            ? getRectFromRange({
                startRow: focusCell.rowIndex,
                endRow: focusCell.rowIndex,
                startCol: focusCell.colIndex,
                endCol: focusCell.colIndex,
            })
            : null;
        let cancelled = false;
        scheduleMicrotask(() => {
            if (cancelled)
                return;
            setSelectionRects((prev) => {
                if (prev.length !== next.length)
                    return next;
                for (let i = 0; i < next.length; i++) {
                    if (prev[i]?.id !== next[i]?.id)
                        return next;
                    if (!sameRect(prev[i]?.rect, next[i]?.rect))
                        return next;
                }
                return prev;
            });
            setActiveCellRect((prev) => (sameRect(prev, nextActiveCellRect) ? prev : nextActiveCellRect));
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
    const renderDragOverlay = useCallback((startCellEl: Element, endCellEl: Element) => {
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
        activeCellRect,
        selectionRects,
        hideDragOverlay,
        renderDragOverlay,
        getRectFromCells,
    };
};
