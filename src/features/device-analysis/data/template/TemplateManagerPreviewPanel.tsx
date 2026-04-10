import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { Check, Copy } from "lucide-react";
import ScrollArea from "../../../../components/ui/ScrollArea";
import type { TranslateFn } from "../../../../context/language";
import type { PreviewStatus as SessionPreviewStatus } from "../../session/device-analysis-session-context";
import type { PreviewFileLike } from "../../shared/lib/sharedTypes";
import {
  TemplateManagerPreviewEmptyState,
  TemplateManagerPreviewSurface,
} from "./TemplateManagerPreviewSurface";
import { formatNumber } from "../../analysis/lib/analysisMath";
import { getExcelColumnLabel } from "./templateColumnLabel";
import {
  computeNextPreviewCell,
  computePreviewPageRows,
  getSelectionFocusCell,
  getSelectionModeFromPointerEvent,
  isPreviewNavigationKey,
  resolveSelectionDragStart,
} from "../preview/previewSelectionNavigation";

type PreviewStatus = Partial<SessionPreviewStatus>;

type PreviewWindow = {
  startRow: number;
  endRow: number;
  topSpacerHeight: number;
  bottomSpacerHeight: number;
};

type PreviewColumnGeometry = {
  tableWidthPx: number;
  widthsPx: number[];
  startOffsetsPx: number[];
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
};

type SelectionRect = {
  id: string;
  rect: DOMRect | Record<string, number>;
};

type SelectionItem = {
  id: string;
  range: {
    startRow: number;
    endRow: number;
    startCol: number;
    endCol: number;
  };
};

type SelectionRange = {
  startRow: number;
  endRow: number;
  startCol: number;
  endCol: number;
};

type SelectionSetMode = "replace" | "append" | "updateLast";

type SetSelectionRangeOptions = {
  mode?: SelectionSetMode;
};

type SetSelectionRangeFn = (
  range?: SelectionRange | null,
  options?: SetSelectionRangeOptions,
) => void;

type PreviewCellPosition = {
  rowIndex: number;
  colIndex: number;
};

type CanvasPreviewTheme = {
  background: string;
  border: string;
  textPrimary: string;
  textSecondary: string;
  accentCellBackground: string;
  placeholderFill: string;
};

type CanvasVisibleColumnMetric = {
  colIndex: number;
  colLeft: number;
  colWidth: number;
  textMaxWidth: number;
  placeholderMaxWidth: number;
  isYColumn: boolean;
};

type PreviewRowProps = {
  rowIndex: number;
  rowCellsRaw: unknown;
  columnGeometry: PreviewColumnGeometry;
  yColumnsSet: Set<number>;
  handleCellMouseDown?: (event: React.MouseEvent<HTMLTableCellElement>) => void;
};

type PreviewTbodyProps = {
  subscribePreviewRowsVersion?: (onStoreChange: () => void) => () => void;
  getPreviewRowsVersion?: () => number;
  previewWindow: PreviewWindow;
  columnGeometry: PreviewColumnGeometry;
  yColumnsSet: Set<number>;
  getPreviewRow?: (rowIndex: number) => unknown;
  handleCellMouseDown?: (event: React.MouseEvent<HTMLTableCellElement>) => void;
};

type CanvasPreviewGridProps = {
  previewFile?: PreviewFileLike | null;
  previewWindow: PreviewWindow;
  columnGeometry: PreviewColumnGeometry;
  previewColumnMinWidthPx: number;
  previewScrollRef?: React.MutableRefObject<HTMLDivElement | null>;
  previewRowIndexWidthPx: number;
  rowHeightPx: number;
  yColumnsSet: Set<number>;
  getPreviewRow?: (rowIndex: number) => unknown;
  selections?: SelectionItem[];
  subscribePreviewRowsVersion?: (onStoreChange: () => void) => () => void;
  getPreviewRowsVersion?: () => number;
  handlePreviewPick?: (payload: {
    event: Event;
    rowIndex: number;
    colIndex: number;
    cellEl: Element;
  }) => boolean;
  setSelectionRange?: SetSelectionRangeFn;
};

type PreviewPlaceholderProps = {
  title?: string;
  hint?: string;
};

type TemplateManagerPreviewPanelProps = {
  activeCellRect?: DOMRect | Record<string, number> | null;
  copySelection?: () => Promise<void> | void;
  dragOverlayRef: React.MutableRefObject<HTMLDivElement | null>;
  getPreviewRow?: (rowIndex: number) => unknown;
  getPreviewRowsVersion?: () => number;
  gridRef: React.MutableRefObject<HTMLDivElement | null>;
  handleCellMouseDown?: (event: React.MouseEvent<HTMLTableCellElement>) => void;
  handleColumnResizeStart: (
    event: React.PointerEvent<HTMLDivElement>,
    colIndex: number,
  ) => void;
  handlePreviewPick?: (payload: {
    event: Event;
    rowIndex: number;
    colIndex: number;
    cellEl: Element;
  }) => boolean;
  handlePreviewScroll: (scrollTop: number, scrollLeft: number) => void;
  isColumnResizing: boolean;
  previewColumnGeometry: PreviewColumnGeometry;
  previewColumnMinWidthPx: number;
  previewFile?: PreviewFileLike | null;
  previewRowIndexWidthPx: number;
  previewScrollRef: React.MutableRefObject<HTMLDivElement | null>;
  previewStatus?: PreviewStatus | null;
  previewTableRef: React.MutableRefObject<HTMLTableElement | null>;
  previewWindow: PreviewWindow;
  resetColumnWidth: (fileId: string, colIndex: number) => void;
  yColumnsSet: Set<number>;
  setSelectionRange?: SetSelectionRangeFn;
  selectionRects: SelectionRect[];
  selections: SelectionItem[];
  subscribePreviewRowsVersion?: (onStoreChange: () => void) => () => void;
  t: TranslateFn;
  toggleColumn: (index: number) => void;
};

const EMPTY_ARRAY: unknown[] = [];
const noopSubscribe = (_onStoreChange: () => void) => () => {};
const getZero = () => 0;
const PREVIEW_ROW_HEIGHT_PX = 28;
const PREVIEW_RENDERER_OVERRIDE = String(
  import.meta?.env?.VITE_DA_PREVIEW_RENDERER ||
    import.meta?.env?.VITE_DA_PREVIEW_CANVAS ||
    "",
)
  .trim()
  .toLowerCase();
const PREVIEW_AUTO_CANVAS_TOTAL_CELL_THRESHOLD = 20000;
const PREVIEW_AUTO_CANVAS_RENDER_CELL_THRESHOLD = 1800;
const PREVIEW_AUTO_CANVAS_ROW_THRESHOLD = 600;
const PREVIEW_AUTO_CANVAS_COL_THRESHOLD = 24;
const PREVIEW_DRAG_EDGE_SCROLL_ZONE_PX = 28;
const PREVIEW_DRAG_EDGE_SCROLL_STEP_PX = 26;
const CANVAS_PREVIEW_FONT =
  "12px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace";
const CANVAS_PREVIEW_THEME_FALLBACK: CanvasPreviewTheme = {
  background: "#ffffff",
  border: "rgba(148, 163, 184, 0.45)",
  textPrimary: "#111827",
  textSecondary: "#64748b",
  accentCellBackground: "rgba(217, 119, 6, 0.1)",
  placeholderFill: "rgba(100, 116, 139, 0.18)",
};

const isEditableElement = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target.isContentEditable) return true;
  if (target.closest("[contenteditable='true']")) return true;
  return false;
};

const formatPreviewCell = (value: unknown): string => {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return formatNumber(value, { digits: 4 });
  if (typeof value !== "string") return String(value);

  if (!value) return value;
  if (!value.includes("e") && !value.includes("E")) return value;

  const trimmed = value.trim();
  if (!trimmed) return value;

  const num = Number(trimmed);
  if (!Number.isFinite(num)) return value;
  return formatNumber(num, { digits: 4 });
};

const shouldUseCanvasPreview = ({
  totalRows,
  totalCols,
  renderRowCount,
  renderColCount,
}: {
  totalRows: number;
  totalCols: number;
  renderRowCount: number;
  renderColCount: number;
}): boolean => {
  if (
    PREVIEW_RENDERER_OVERRIDE === "canvas" ||
    PREVIEW_RENDERER_OVERRIDE === "1" ||
    PREVIEW_RENDERER_OVERRIDE === "true"
  ) {
    return true;
  }

  if (
    PREVIEW_RENDERER_OVERRIDE === "dom" ||
    PREVIEW_RENDERER_OVERRIDE === "0" ||
    PREVIEW_RENDERER_OVERRIDE === "false"
  ) {
    return false;
  }

  const safeTotalRows = Math.max(0, Math.floor(Number(totalRows) || 0));
  const safeTotalCols = Math.max(0, Math.floor(Number(totalCols) || 0));
  const safeRenderRows = Math.max(0, Math.floor(Number(renderRowCount) || 0));
  const safeRenderCols = Math.max(0, Math.floor(Number(renderColCount) || 0));
  const totalCellCount = safeTotalRows * safeTotalCols;
  const renderCellCount = safeRenderRows * safeRenderCols;

  // Large previews behave much better when we decouple scrolling from DOM cell churn.
  return (
    safeTotalRows >= PREVIEW_AUTO_CANVAS_ROW_THRESHOLD ||
    safeTotalCols >= PREVIEW_AUTO_CANVAS_COL_THRESHOLD ||
    totalCellCount >= PREVIEW_AUTO_CANVAS_TOTAL_CELL_THRESHOLD ||
    renderCellCount >= PREVIEW_AUTO_CANVAS_RENDER_CELL_THRESHOLD
  );
};

const getPreviewPlaceholderWidthPercent = (seed: number): number => {
  const normalized = Math.abs(Math.floor(Number(seed) || 0)) % 5;
  return [34, 46, 58, 68, 52][normalized] ?? 46;
};

const readCanvasPreviewTheme = (
  canvas: HTMLCanvasElement | null,
): CanvasPreviewTheme => {
  if (!canvas || typeof window === "undefined") {
    return CANVAS_PREVIEW_THEME_FALLBACK;
  }

  const computed = window.getComputedStyle(canvas);
  return {
    background:
      computed.getPropertyValue("--color-bg-surface")?.trim() ||
      CANVAS_PREVIEW_THEME_FALLBACK.background,
    border:
      computed.getPropertyValue("--color-border")?.trim() ||
      CANVAS_PREVIEW_THEME_FALLBACK.border,
    textPrimary:
      computed.getPropertyValue("--color-text-primary")?.trim() ||
      CANVAS_PREVIEW_THEME_FALLBACK.textPrimary,
    textSecondary:
      computed.getPropertyValue("--color-text-secondary")?.trim() ||
      CANVAS_PREVIEW_THEME_FALLBACK.textSecondary,
    accentCellBackground: CANVAS_PREVIEW_THEME_FALLBACK.accentCellBackground,
    placeholderFill: CANVAS_PREVIEW_THEME_FALLBACK.placeholderFill,
  };
};

const areCanvasPreviewThemesEqual = (
  left: CanvasPreviewTheme,
  right: CanvasPreviewTheme,
): boolean =>
  left.background === right.background &&
  left.border === right.border &&
  left.textPrimary === right.textPrimary &&
  left.textSecondary === right.textSecondary &&
  left.accentCellBackground === right.accentCellBackground &&
  left.placeholderFill === right.placeholderFill;

const PreviewRow = React.memo(
  ({
    rowIndex,
    rowCellsRaw,
    columnGeometry,
    yColumnsSet,
    handleCellMouseDown,
  }: PreviewRowProps) => {
    const rowLabel = rowIndex + 1;
    const rowCells = Array.isArray(rowCellsRaw)
      ? (rowCellsRaw as unknown[])
      : EMPTY_ARRAY;
    const isRowLoaded = Array.isArray(rowCellsRaw);
    const visibleColumnIndices = Array.isArray(
      columnGeometry?.visibleColumnIndices,
    )
      ? columnGeometry.visibleColumnIndices
      : [];
    const hasLeftColSpacer = Boolean(columnGeometry?.hasLeftSpacer);
    const hasRightColSpacer = Boolean(columnGeometry?.hasRightSpacer);

    return (
      <tr>
        <td className="p-1 h-7 border-b border-r border-border font-mono text-xs text-center select-none bg-bg-surface text-text-secondary w-12 align-middle sticky left-0 z-10">
          {rowLabel}
        </td>
        {hasLeftColSpacer ? (
          <td
            aria-hidden="true"
            className="p-0 h-7 border-b border-r border-border bg-transparent"
          />
        ) : null}
        {visibleColumnIndices.map((index: number, visibleSlot: number) => {
          const cell = rowCells[index] ?? "";
          const raw = isRowLoaded ? String(cell) : "";
          const display = isRowLoaded ? formatPreviewCell(cell) : "";
          const placeholderWidth = getPreviewPlaceholderWidthPercent(
            rowIndex + index + visibleSlot,
          );

          return (
            <td
              key={index}
              data-row={rowIndex}
              data-col={index}
              className={`px-2 py-1 h-7 border-b border-r border-border last:border-r-0 whitespace-nowrap text-xs transition-colors cursor-default overflow-hidden text-ellipsis ${yColumnsSet.has(index)
                  ? "bg-accent/5 border-accent/20 text-text-primary"
                  : "text-text-secondary"
                }`}
              onMouseDown={handleCellMouseDown}
              title={raw}
            >
              {isRowLoaded ? (
                display
              ) : (
                <span
                  aria-hidden="true"
                  className="block h-2 rounded bg-text-secondary/15"
                  style={{ width: `${placeholderWidth}%` }}
                />
              )}
            </td>
          );
        })}
        {hasRightColSpacer ? (
          <td
            aria-hidden="true"
            className="p-0 h-7 border-b border-border bg-transparent"
          />
        ) : null}
      </tr>
    );
  },
);

PreviewRow.displayName = "PreviewRow";

const PreviewTbody = React.memo(
  ({
    subscribePreviewRowsVersion,
    getPreviewRowsVersion,
    previewWindow,
    columnGeometry,
    yColumnsSet,
    getPreviewRow,
    handleCellMouseDown,
  }: PreviewTbodyProps) => {
    const previewRowsSubscribe =
      typeof subscribePreviewRowsVersion === "function"
        ? subscribePreviewRowsVersion
        : noopSubscribe;
    const previewRowsGetSnapshot =
      typeof getPreviewRowsVersion === "function"
        ? getPreviewRowsVersion
        : getZero;
    const previewRenderColCount = columnGeometry?.renderColCount ?? 1;

    const previewRowsVersion = useSyncExternalStore(
      previewRowsSubscribe,
      previewRowsGetSnapshot,
      previewRowsGetSnapshot,
    );

    const rows = useMemo(() => {
      const nextRows: React.JSX.Element[] = [];
      const visibleRowCount = Math.max(
        0,
        previewWindow.endRow - previewWindow.startRow,
      );

      for (let slot = 0; slot < visibleRowCount; slot += 1) {
        const rowIndex = previewWindow.startRow + slot;
        const rowCellsRaw =
          typeof getPreviewRow === "function" ? getPreviewRow(rowIndex) : null;

        nextRows.push(
          <PreviewRow
            key={slot}
            rowIndex={rowIndex}
            rowCellsRaw={rowCellsRaw}
            columnGeometry={columnGeometry}
            yColumnsSet={yColumnsSet}
            handleCellMouseDown={handleCellMouseDown}
          />,
        );
      }
      return nextRows;
    }, [
      columnGeometry,
      getPreviewRow,
      handleCellMouseDown,
      previewRowsVersion,
      previewWindow.endRow,
      previewWindow.startRow,
      yColumnsSet,
    ]);

    return (
      <tbody>
        {previewWindow.topSpacerHeight > 0 ? (
          <tr aria-hidden="true">
            <td
              colSpan={previewRenderColCount}
              className="p-0 border-0"
              style={{ height: previewWindow.topSpacerHeight }}
            />
          </tr>
        ) : null}
        {rows}
        {previewWindow.bottomSpacerHeight > 0 ? (
          <tr aria-hidden="true">
            <td
              colSpan={previewRenderColCount}
              className="p-0 border-0"
              style={{ height: previewWindow.bottomSpacerHeight }}
            />
          </tr>
        ) : null}
      </tbody>
    );
  },
);

PreviewTbody.displayName = "PreviewTbody";

const CanvasPreviewGrid = React.memo(
  ({
    previewFile,
    previewWindow,
    columnGeometry,
    previewColumnMinWidthPx,
    previewScrollRef,
    previewRowIndexWidthPx,
    rowHeightPx,
    yColumnsSet,
    getPreviewRow,
    selections,
    subscribePreviewRowsVersion,
    getPreviewRowsVersion,
    handlePreviewPick,
    setSelectionRange,
  }: CanvasPreviewGridProps) => {
    const previewRowsSubscribe =
      typeof subscribePreviewRowsVersion === "function"
        ? subscribePreviewRowsVersion
        : noopSubscribe;
    const previewRowsGetSnapshot =
      typeof getPreviewRowsVersion === "function"
        ? getPreviewRowsVersion
        : getZero;
    const previewRowsVersion = useSyncExternalStore(
      previewRowsSubscribe,
      previewRowsGetSnapshot,
      previewRowsGetSnapshot,
    );
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const totalRows = Math.max(0, Math.floor(Number(previewFile?.rowCount) || 0));
    const visibleRowCount = Math.max(
      0,
      previewWindow.endRow - previewWindow.startRow,
    );
    const canvasWidthPx = Math.max(
      1,
      Math.ceil(Number(columnGeometry?.tableWidthPx) || 1),
    );
    const canvasHeightPx = Math.max(1, visibleRowCount * rowHeightPx);
    const canvasTopPx = Math.max(0, previewWindow.startRow * rowHeightPx);
    const stageHeightPx = Math.max(rowHeightPx, totalRows * rowHeightPx);
    const visibleColumns = Array.isArray(columnGeometry?.visibleColumnIndices)
      ? columnGeometry.visibleColumnIndices
      : [];
    const startOffsets = Array.isArray(columnGeometry?.startOffsetsPx)
      ? columnGeometry.startOffsetsPx
      : [];
    const widths = Array.isArray(columnGeometry?.widthsPx)
      ? columnGeometry.widthsPx
      : [];
    const dragStateRef = useRef<{
      isDragging: boolean;
      pointerId: number;
      startRow: number;
      startCol: number;
      endRow: number;
      endCol: number;
      updateMode: SelectionSetMode;
    } | null>(null);
    const selectionAnchorRef = useRef<PreviewCellPosition | null>(null);
    const latestPointerRef = useRef<{ clientX: number; clientY: number } | null>(
      null,
    );
    const autoScrollRafRef = useRef(0);
    const formattedCellCacheRef = useRef<WeakMap<unknown[], Map<number, string>>>(
      new WeakMap(),
    );
    const canvasThemeRef = useRef<CanvasPreviewTheme>(
      CANVAS_PREVIEW_THEME_FALLBACK,
    );
    const [canvasThemeVersion, setCanvasThemeVersion] = useState(0);
    const visibleColumnMetrics = useMemo<CanvasVisibleColumnMetric[]>(
      () =>
        visibleColumns.map((colIndex) => {
          const startOffset = Number(startOffsets[colIndex]) || 0;
          const colWidth = Math.max(
            1,
            Number(widths[colIndex]) || previewColumnMinWidthPx,
          );
          return {
            colIndex,
            colLeft: previewRowIndexWidthPx + startOffset,
            colWidth,
            textMaxWidth: Math.max(0, colWidth - 12),
            placeholderMaxWidth: Math.max(0, colWidth - 12),
            isYColumn: yColumnsSet.has(colIndex),
          };
        }),
      [
        previewColumnMinWidthPx,
        previewRowIndexWidthPx,
        startOffsets,
        visibleColumns,
        widths,
        yColumnsSet,
      ],
    );

    const getFormattedPreviewCell = useCallback(
      (rowCells: unknown[], colIndex: number): string => {
        let rowCache = formattedCellCacheRef.current.get(rowCells);
        if (!rowCache) {
          rowCache = new Map<number, string>();
          formattedCellCacheRef.current.set(rowCells, rowCache);
        }
        if (rowCache.has(colIndex)) {
          return rowCache.get(colIndex) ?? "";
        }

        const display = formatPreviewCell(rowCells[colIndex]);
        rowCache.set(colIndex, display);
        return display;
      },
      [],
    );

    const computeEdgeScrollDelta = useCallback(
      (pointer: number, edgeStart: number, edgeEnd: number) => {
        if (!Number.isFinite(pointer)) return 0;
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
      },
      [],
    );

    const resolveCellFromClientPoint = useCallback(
      (
        clientX: number,
        clientY: number,
        options?: {
          allowOutOfBounds?: boolean;
          clampRowHeaderToFirstCol?: boolean;
        },
      ): { rowIndex: number; colIndex: number } | null => {
        const canvasEl = canvasRef.current;
        if (!canvasEl) return null;
        if (visibleRowCount <= 0 || visibleColumns.length === 0) return null;

        const rect = canvasEl.getBoundingClientRect();
        let x = clientX - rect.left;
        let y = clientY - rect.top;
        if (!Number.isFinite(x) || !Number.isFinite(y)) return null;

        const allowOutOfBounds = Boolean(options?.allowOutOfBounds);
        if (!allowOutOfBounds) {
          if (x < 0 || y < 0 || x >= canvasWidthPx || y >= canvasHeightPx) {
            return null;
          }
        }

        x = Math.min(canvasWidthPx - 0.001, Math.max(0, x));
        y = Math.min(canvasHeightPx - 0.001, Math.max(0, y));

        const clampRowHeaderToFirstCol = Boolean(
          options?.clampRowHeaderToFirstCol,
        );
        if (x < previewRowIndexWidthPx && !clampRowHeaderToFirstCol) {
          return null;
        }

        const rowSlot = Math.max(
          0,
          Math.min(visibleRowCount - 1, Math.floor(y / rowHeightPx)),
        );
        const rowIndex = previewWindow.startRow + rowSlot;
        const firstVisibleCol = visibleColumns[0];
        const lastVisibleCol = visibleColumns[visibleColumns.length - 1];

        let colIndex = -1;
        if (x < previewRowIndexWidthPx) {
          colIndex = firstVisibleCol;
        } else {
          for (const visibleColIndex of visibleColumns) {
            const startOffset = Number(startOffsets[visibleColIndex]) || 0;
            const colWidth = Math.max(
              1,
              Number(widths[visibleColIndex]) || previewColumnMinWidthPx,
            );
            const colLeft = previewRowIndexWidthPx + startOffset;
            const colRight = colLeft + colWidth;
            if (x >= colLeft && x < colRight) {
              colIndex = visibleColIndex;
              break;
            }
          }
        }

        if (colIndex < 0) {
          colIndex = x < previewRowIndexWidthPx ? firstVisibleCol : lastVisibleCol;
        }
        if (!Number.isFinite(colIndex) || colIndex < 0) return null;
        return { rowIndex, colIndex };
      },
      [
        canvasHeightPx,
        canvasWidthPx,
        previewColumnMinWidthPx,
        previewRowIndexWidthPx,
        previewWindow.startRow,
        rowHeightPx,
        startOffsets,
        visibleColumns,
        visibleRowCount,
        widths,
      ],
    );

    const updateDragSelection = useCallback(
      (clientX: number, clientY: number) => {
        const dragState = dragStateRef.current;
        if (!dragState || !dragState.isDragging) return;
        const cell = resolveCellFromClientPoint(clientX, clientY, {
          allowOutOfBounds: true,
          clampRowHeaderToFirstCol: true,
        });
        if (!cell) return;
        if (dragState.endRow === cell.rowIndex && dragState.endCol === cell.colIndex) {
          return;
        }
        dragStateRef.current = {
          ...dragState,
          endRow: cell.rowIndex,
          endCol: cell.colIndex,
        };
        if (typeof setSelectionRange === "function") {
          setSelectionRange({
            startRow: dragState.startRow,
            endRow: cell.rowIndex,
            startCol: dragState.startCol,
            endCol: cell.colIndex,
          }, { mode: dragState.updateMode || "updateLast" });
        }
      },
      [resolveCellFromClientPoint, setSelectionRange],
    );

    const applyDragAutoScroll = useCallback(
      (clientX: number, clientY: number) => {
        const viewport = previewScrollRef?.current;
        if (!viewport) return false;
        const viewportRect = viewport.getBoundingClientRect();
        const deltaY = computeEdgeScrollDelta(
          clientY,
          viewportRect.top,
          viewportRect.bottom,
        );
        const deltaX = computeEdgeScrollDelta(
          clientX,
          viewportRect.left,
          viewportRect.right,
        );
        if (!deltaX && !deltaY) return false;

        const nextTop = Math.max(
          0,
          Math.min(
            viewport.scrollHeight - viewport.clientHeight,
            viewport.scrollTop + deltaY,
          ),
        );
        const nextLeft = Math.max(
          0,
          Math.min(
            viewport.scrollWidth - viewport.clientWidth,
            viewport.scrollLeft + deltaX,
          ),
        );
        const changed =
          Math.abs(nextTop - viewport.scrollTop) > 0.5 ||
          Math.abs(nextLeft - viewport.scrollLeft) > 0.5;
        if (!changed) return false;

        viewport.scrollTop = nextTop;
        viewport.scrollLeft = nextLeft;
        return true;
      },
      [computeEdgeScrollDelta, previewScrollRef],
    );

    const stopAutoScrollLoop = useCallback(() => {
      if (autoScrollRafRef.current) {
        cancelAnimationFrame(autoScrollRafRef.current);
        autoScrollRafRef.current = 0;
      }
      latestPointerRef.current = null;
    }, []);

    const runAutoScrollLoop = useCallback(() => {
      autoScrollRafRef.current = 0;
      const dragState = dragStateRef.current;
      if (!dragState || !dragState.isDragging) return;
      const point = latestPointerRef.current;
      if (!point) return;
      const scrolled = applyDragAutoScroll(point.clientX, point.clientY);
      if (scrolled) {
        updateDragSelection(point.clientX, point.clientY);
        autoScrollRafRef.current = requestAnimationFrame(runAutoScrollLoop);
      }
    }, [applyDragAutoScroll, updateDragSelection]);

    const scheduleAutoScrollLoop = useCallback(() => {
      if (autoScrollRafRef.current) return;
      autoScrollRafRef.current = requestAnimationFrame(runAutoScrollLoop);
    }, [runAutoScrollLoop]);

    const stopDrag = useCallback((pointerId?: number) => {
      const dragState = dragStateRef.current;
      if (!dragState || !dragState.isDragging) return;
      if (
        Number.isFinite(pointerId) &&
        Number.isFinite(dragState.pointerId) &&
        pointerId !== dragState.pointerId
      ) {
        return;
      }
      const canvasEl = canvasRef.current;
      if (
        canvasEl?.releasePointerCapture &&
        Number.isFinite(dragState.pointerId)
      ) {
        try {
          canvasEl.releasePointerCapture(dragState.pointerId);
        } catch {
          // ignore
        }
      }
      dragStateRef.current = null;
      stopAutoScrollLoop();
    }, [stopAutoScrollLoop]);

    const handleCanvasPointerDown = useCallback(
      (event: React.PointerEvent<HTMLCanvasElement>) => {
        if (event.button !== 0) return;
        const canvasEl = canvasRef.current;
        if (!canvasEl) return;
        const pointerCell = resolveCellFromClientPoint(event.clientX, event.clientY);
        if (!pointerCell) return;
        const mode = getSelectionModeFromPointerEvent(event.nativeEvent);
        const selectionStart = resolveSelectionDragStart({
          rowIndex: pointerCell.rowIndex,
          colIndex: pointerCell.colIndex,
          anchor: selectionAnchorRef.current,
          shiftKey: event.shiftKey,
        });
        const startCell = selectionStart.startCell;

        if (
          typeof handlePreviewPick === "function" &&
          handlePreviewPick({
            event: event.nativeEvent,
            rowIndex: pointerCell.rowIndex,
            colIndex: pointerCell.colIndex,
            cellEl: canvasEl,
          }) === true
        ) {
          return;
        }
        selectionAnchorRef.current = selectionStart.nextAnchor;

        event.preventDefault();
        if (canvasEl.setPointerCapture && Number.isFinite(event.pointerId)) {
          try {
            canvasEl.setPointerCapture(event.pointerId);
          } catch {
            // ignore
          }
        }
        dragStateRef.current = {
          isDragging: true,
          pointerId: event.pointerId,
          startRow: startCell.rowIndex,
          startCol: startCell.colIndex,
          endRow: pointerCell.rowIndex,
          endCol: pointerCell.colIndex,
          updateMode: "updateLast",
        };
        latestPointerRef.current = {
          clientX: event.clientX,
          clientY: event.clientY,
        };
        scheduleAutoScrollLoop();
        if (typeof setSelectionRange === "function") {
          setSelectionRange({
            startRow: startCell.rowIndex,
            endRow: pointerCell.rowIndex,
            startCol: startCell.colIndex,
            endCol: pointerCell.colIndex,
          }, { mode });
        }
      },
      [
        handlePreviewPick,
        resolveCellFromClientPoint,
        scheduleAutoScrollLoop,
        setSelectionRange,
      ],
    );

    const handleCanvasPointerMove = useCallback(
      (event: React.PointerEvent<HTMLCanvasElement>) => {
        const dragState = dragStateRef.current;
        if (!dragState || !dragState.isDragging) return;
        if (
          Number.isFinite(dragState.pointerId) &&
          event.pointerId !== dragState.pointerId
        ) {
          return;
        }
        latestPointerRef.current = {
          clientX: event.clientX,
          clientY: event.clientY,
        };
        updateDragSelection(event.clientX, event.clientY);
        scheduleAutoScrollLoop();
      },
      [scheduleAutoScrollLoop, updateDragSelection],
    );

    const handleCanvasPointerUp = useCallback(
      (event: React.PointerEvent<HTMLCanvasElement>) => {
        const dragState = dragStateRef.current;
        if (!dragState || !dragState.isDragging) return;
        if (
          Number.isFinite(dragState.pointerId) &&
          event.pointerId !== dragState.pointerId
        ) {
          return;
        }
        latestPointerRef.current = {
          clientX: event.clientX,
          clientY: event.clientY,
        };
        updateDragSelection(event.clientX, event.clientY);
        stopDrag(event.pointerId);
      },
      [stopDrag, updateDragSelection],
    );

    const handleCanvasPointerCancel = useCallback(
      (event: React.PointerEvent<HTMLCanvasElement>) => {
        stopDrag(event.pointerId);
      },
      [stopDrag],
    );

    useEffect(() => {
      const handleWindowBlur = () => stopDrag();
      window.addEventListener("blur", handleWindowBlur);
      return () => {
        window.removeEventListener("blur", handleWindowBlur);
      };
    }, [stopDrag]);

    useEffect(() => {
      return () => {
        stopAutoScrollLoop();
      };
    }, [stopAutoScrollLoop]);

    useEffect(() => {
      selectionAnchorRef.current = null;
      dragStateRef.current = null;
      stopAutoScrollLoop();
    }, [previewFile?.fileId, stopAutoScrollLoop]);

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
    }, [selections]);

    useEffect(() => {
      formattedCellCacheRef.current = new WeakMap();
    }, [previewFile?.fileId]);

    useEffect(() => {
      const updateCanvasTheme = () => {
        const nextTheme = readCanvasPreviewTheme(canvasRef.current);
        if (
          areCanvasPreviewThemesEqual(canvasThemeRef.current, nextTheme)
        ) {
          return;
        }
        canvasThemeRef.current = nextTheme;
        setCanvasThemeVersion((version) => version + 1);
      };

      updateCanvasTheme();

      if (
        typeof MutationObserver === "undefined" ||
        typeof document === "undefined"
      ) {
        return undefined;
      }

      const observer = new MutationObserver(() => {
        updateCanvasTheme();
      });
      const observerTargets = [document.documentElement, document.body].filter(
        (target): target is HTMLElement => Boolean(target),
      );

      for (const target of observerTargets) {
        observer.observe(target, {
          attributeFilter: ["class", "data-theme", "style"],
          attributes: true,
        });
      }

      return () => {
        observer.disconnect();
      };
    }, [previewFile?.fileId]);

    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const context = canvas.getContext("2d");
      if (!context) return;

      const dpr =
        typeof window !== "undefined" && Number(window.devicePixelRatio) > 0
          ? Number(window.devicePixelRatio)
          : 1;
      const targetPixelWidth = Math.max(1, Math.floor(canvasWidthPx * dpr));
      const targetPixelHeight = Math.max(1, Math.floor(canvasHeightPx * dpr));
      if (canvas.width !== targetPixelWidth) {
        canvas.width = targetPixelWidth;
      }
      if (canvas.height !== targetPixelHeight) {
        canvas.height = targetPixelHeight;
      }
      if (canvas.style.width !== `${canvasWidthPx}px`) {
        canvas.style.width = `${canvasWidthPx}px`;
      }
      if (canvas.style.height !== `${canvasHeightPx}px`) {
        canvas.style.height = `${canvasHeightPx}px`;
      }

      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      const {
        accentCellBackground,
        background,
        border,
        placeholderFill,
        textPrimary,
        textSecondary,
      } = canvasThemeRef.current;

      context.clearRect(0, 0, canvasWidthPx, canvasHeightPx);
      context.fillStyle = background;
      context.fillRect(0, 0, canvasWidthPx, canvasHeightPx);
      context.font = CANVAS_PREVIEW_FONT;
      context.textBaseline = "middle";

      for (let rowSlot = 0; rowSlot < visibleRowCount; rowSlot += 1) {
        const rowIndex = previewWindow.startRow + rowSlot;
        const rowTop = rowSlot * rowHeightPx;
        const rowBottom = rowTop + rowHeightPx;
        const rowCellsRaw =
          typeof getPreviewRow === "function" ? getPreviewRow(rowIndex) : null;
        const rowCells = Array.isArray(rowCellsRaw)
          ? (rowCellsRaw as unknown[])
          : EMPTY_ARRAY;
        const isRowLoaded = Array.isArray(rowCellsRaw);

        context.fillStyle = background;
        context.fillRect(0, rowTop, previewRowIndexWidthPx, rowHeightPx);
        context.fillStyle = textSecondary;
        context.textAlign = "center";
        context.fillText(
          String(rowIndex + 1),
          previewRowIndexWidthPx / 2,
          rowTop + rowHeightPx / 2,
        );

        for (const columnMetric of visibleColumnMetrics) {
          const {
            colIndex,
            colLeft,
            colWidth,
            isYColumn,
            placeholderMaxWidth,
            textMaxWidth,
          } = columnMetric;
          if (isYColumn) {
            context.fillStyle = accentCellBackground;
            context.fillRect(colLeft, rowTop, colWidth, rowHeightPx);
          }

          const display = isRowLoaded
            ? getFormattedPreviewCell(rowCells, colIndex)
            : "";
          context.save();
          context.beginPath();
          context.rect(
            colLeft + 1,
            rowTop + 1,
            Math.max(0, colWidth - 2),
            Math.max(0, rowHeightPx - 2),
          );
          context.clip();
          if (isRowLoaded) {
            context.fillStyle = textPrimary;
            context.textAlign = "left";
            context.fillText(
              display,
              colLeft + 6,
              rowTop + rowHeightPx / 2,
              textMaxWidth,
            );
          } else {
            const placeholderWidth = Math.max(
              18,
              Math.min(
                placeholderMaxWidth,
                Math.floor(
                  ((getPreviewPlaceholderWidthPercent(
                    rowIndex + colIndex,
                  ) || 46) /
                    100) *
                    placeholderMaxWidth,
                ),
              ),
            );
            context.fillStyle = placeholderFill;
            context.fillRect(
              colLeft + 6,
              rowTop + Math.max(4, Math.floor(rowHeightPx / 2) - 4),
              placeholderWidth,
              8,
            );
          }
          context.restore();
        }
      }

      context.strokeStyle = border;
      context.lineWidth = 1;
      context.beginPath();
      for (let rowSlot = 0; rowSlot < visibleRowCount; rowSlot += 1) {
        const rowBottom = (rowSlot + 1) * rowHeightPx;
        context.moveTo(0, rowBottom - 0.5);
        context.lineTo(canvasWidthPx, rowBottom - 0.5);
      }
      for (const columnMetric of visibleColumnMetrics) {
        const { colLeft, colWidth } = columnMetric;
        context.moveTo(colLeft - 0.5, 0);
        context.lineTo(colLeft - 0.5, canvasHeightPx);
        const colRight = colLeft + colWidth;
        context.moveTo(colRight - 0.5, 0);
        context.lineTo(colRight - 0.5, canvasHeightPx);
      }
      context.moveTo(previewRowIndexWidthPx - 0.5, 0);
      context.lineTo(previewRowIndexWidthPx - 0.5, canvasHeightPx);
      context.stroke();
    }, [
      canvasHeightPx,
      canvasWidthPx,
      canvasThemeVersion,
      getFormattedPreviewCell,
      getPreviewRow,
      previewColumnMinWidthPx,
      previewRowIndexWidthPx,
      previewRowsVersion,
      previewWindow.endRow,
      previewWindow.startRow,
      rowHeightPx,
      visibleColumnMetrics,
      visibleRowCount,
    ]);

    return (
      <div
        className="relative min-w-full align-top select-none"
        style={{ height: stageHeightPx, width: canvasWidthPx }}
      >
        <canvas
          id="device-analysis-preview-canvas-grid"
          ref={canvasRef}
          className="absolute left-0"
          style={{ top: canvasTopPx }}
          onPointerDown={handleCanvasPointerDown}
          onPointerMove={handleCanvasPointerMove}
          onPointerUp={handleCanvasPointerUp}
          onPointerCancel={handleCanvasPointerCancel}
        />
      </div>
    );
  },
);

CanvasPreviewGrid.displayName = "CanvasPreviewGrid";

const PreviewPlaceholder = ({ title, hint }: PreviewPlaceholderProps) => (
  <TemplateManagerPreviewEmptyState title={title} hint={hint} />
);

type PreviewColGroupProps = {
  previewColumnGeometry: PreviewColumnGeometry;
  previewColumnMinWidthPx: number;
  previewRowIndexWidthPx: number;
};

const PreviewColGroup = React.memo(
  ({
    previewColumnGeometry,
    previewColumnMinWidthPx,
    previewRowIndexWidthPx,
  }: PreviewColGroupProps) => (
    <colgroup>
      <col style={{ width: previewRowIndexWidthPx }} />
      {previewColumnGeometry.hasLeftSpacer ? (
        <col style={{ width: previewColumnGeometry.window.leftSpacerPx }} />
      ) : null}
      {previewColumnGeometry.visibleColumnIndices.map((index) => (
        <col
          key={index}
          style={{
            width: `var(--da-preview-col-${index}-w, ${
              previewColumnGeometry.widthsPx[index] ?? previewColumnMinWidthPx
            }px)`,
          }}
        />
      ))}
      {previewColumnGeometry.hasRightSpacer ? (
        <col style={{ width: previewColumnGeometry.window.rightSpacerPx }} />
      ) : null}
    </colgroup>
  ),
);

PreviewColGroup.displayName = "PreviewColGroup";

type PreviewHeaderProps = {
  handleColumnResizeStart: (
    event: React.PointerEvent<HTMLDivElement>,
    colIndex: number,
  ) => void;
  previewColumnGeometry: PreviewColumnGeometry;
  previewFileId?: string;
  resetColumnWidth: (fileId: string, colIndex: number) => void;
  yColumnsSet: Set<number>;
  resizeHintTitle: string;
  toggleColumnTitle: string;
  toggleColumn: (index: number) => void;
};

const PreviewHeader = React.memo(
  ({
    handleColumnResizeStart,
    previewColumnGeometry,
    previewFileId,
    resetColumnWidth,
    yColumnsSet,
    resizeHintTitle,
    toggleColumnTitle,
    toggleColumn,
  }: PreviewHeaderProps) => (
    <thead className="bg-bg-surface sticky top-0 z-30 shadow-sm">
      <tr id="device-analysis-preview-column-selector-row">
        <th className="p-1 border-b border-r border-border bg-bg-surface w-12 text-center font-bold text-xs text-text-secondary select-none sticky left-0 top-0 z-40"></th>
        {previewColumnGeometry.hasLeftSpacer ? (
          <th
            aria-hidden="true"
            className="p-0 border-b border-r border-border bg-bg-surface"
          />
        ) : null}
        {previewColumnGeometry.visibleColumnIndices.map((index) => {
          const isSelected = yColumnsSet.has(index);
          return (
            <th
              key={index}
              data-selected={isSelected ? "true" : "false"}
              data-column-index={index}
              onClick={() => toggleColumn(index)}
              className={`px-2 py-1 border-b border-border border-r last:border-r-0 font-mono text-xs whitespace-nowrap bg-bg-surface font-semibold text-center select-none cursor-pointer relative pr-3 overflow-hidden ${
                isSelected
                  ? "text-accent bg-accent/10 border-accent/30"
                  : "text-text-secondary hover:bg-bg-page/60"
              }`}
              title={toggleColumnTitle}
            >
              <div
                className="flex items-center justify-center gap-2 cursor-pointer group"
                onClick={(event) => {
                  event.stopPropagation();
                  toggleColumn(index);
                }}
              >
                <div className="relative flex items-center justify-center w-4 h-4">
                  {isSelected ? (
                    <div className="w-3.5 h-3.5 rounded bg-accent-terracotta border border-accent-terracotta flex items-center justify-center transition-all">
                      <Check size={10} className="text-white" strokeWidth={4} />
                    </div>
                  ) : (
                    <div className="w-3.5 h-3.5 rounded border border-border-200 group-hover:border-accent-terracotta/50 transition-colors bg-bg-surface" />
                  )}
                </div>
                <span>{getExcelColumnLabel(index)}</span>
              </div>

              <div
                role="separator"
                aria-orientation="vertical"
                title={resizeHintTitle}
                onPointerDown={(event) => handleColumnResizeStart(event, index)}
                onClick={(event) => event.stopPropagation()}
                onDoubleClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  if (!previewFileId) return;
                  resetColumnWidth(previewFileId, index);
                }}
                className="absolute top-0 right-0 h-full w-3 cursor-col-resize select-none hover:bg-accent/20 touch-none"
              />
            </th>
          );
        })}
        {previewColumnGeometry.hasRightSpacer ? (
          <th
            aria-hidden="true"
            className="p-0 border-b border-border bg-bg-surface"
          />
        ) : null}
      </tr>
    </thead>
  ),
);

PreviewHeader.displayName = "PreviewHeader";

const TemplateManagerPreviewPanel = ({
  activeCellRect,
  copySelection,
  dragOverlayRef,
  getPreviewRow,
  getPreviewRowsVersion,
  gridRef,
  handleCellMouseDown,
  handleColumnResizeStart,
  handlePreviewPick,
  handlePreviewScroll,
  isColumnResizing,
  previewColumnGeometry,
  previewColumnMinWidthPx,
  previewFile,
  previewRowIndexWidthPx,
  previewScrollRef,
  previewStatus,
  previewTableRef,
  previewWindow,
  resetColumnWidth,
  yColumnsSet,
  setSelectionRange,
  selectionRects,
  selections,
  subscribePreviewRowsVersion,
  t,
  toggleColumn,
}: TemplateManagerPreviewPanelProps) => {
  const totalRows = Math.max(0, Math.floor(Number(previewFile?.rowCount) || 0));
  const totalCols = Math.max(
    0,
    Math.floor(
      Number(previewFile?.columnCount) ||
        Number(previewColumnGeometry?.widthsPx?.length) ||
        0,
    ),
  );
  const renderRowCount = Math.max(
    0,
    previewWindow.endRow - previewWindow.startRow,
  );
  const renderColCount = Math.max(
    1,
    Number(previewColumnGeometry?.renderColCount) || 1,
  );
  const useCanvasPreview = useMemo(
    () =>
      shouldUseCanvasPreview({
        totalRows,
        totalCols,
        renderRowCount,
        renderColCount,
      }),
    [renderColCount, renderRowCount, totalCols, totalRows],
  );
  const hasSelection = selections.length > 0;
  const keyboardAnchorRef = useRef<PreviewCellPosition | null>(null);

  const getPreviewHeaderHeight = useCallback(() => {
    const thead = previewTableRef.current?.tHead;
    const row = thead?.rows?.[0];
    const height = Number(row?.getBoundingClientRect?.().height || 0);
    return height > 0 ? height : PREVIEW_ROW_HEIGHT_PX;
  }, [previewTableRef]);

  const getCurrentSelectionCell = useCallback((): PreviewCellPosition | null => {
    const last = Array.isArray(selections) ? selections[selections.length - 1] : null;
    const focusedCell = getSelectionFocusCell(last?.range);
    if (focusedCell) return focusedCell;
    if (totalRows <= 0 || totalCols <= 0) return null;
    const firstVisibleCol = previewColumnGeometry.visibleColumnIndices[0] ?? 0;
    return {
      rowIndex: Math.max(0, Math.min(totalRows - 1, previewWindow.startRow)),
      colIndex: Math.max(0, Math.min(totalCols - 1, Number(firstVisibleCol) || 0)),
    };
  }, [
    previewColumnGeometry.visibleColumnIndices,
    previewWindow.startRow,
    selections,
    totalCols,
    totalRows,
  ]);

  const ensureCellVisible = useCallback(
    (rowIndex: number, colIndex: number) => {
      const viewport = previewScrollRef.current;
      if (!viewport) return;

      const maxScrollTop = Math.max(0, viewport.scrollHeight - viewport.clientHeight);
      const maxScrollLeft = Math.max(0, viewport.scrollWidth - viewport.clientWidth);
      const headerHeight = getPreviewHeaderHeight();
      const safeRow = Math.max(0, rowIndex);
      const safeCol = Math.max(0, colIndex);
      const rowTop = headerHeight + safeRow * PREVIEW_ROW_HEIGHT_PX;
      const rowBottom = rowTop + PREVIEW_ROW_HEIGHT_PX;

      let nextTop = viewport.scrollTop;
      if (rowTop < nextTop) {
        nextTop = rowTop;
      } else if (rowBottom > nextTop + viewport.clientHeight) {
        nextTop = rowBottom - viewport.clientHeight;
      }
      nextTop = Math.max(0, Math.min(maxScrollTop, nextTop));

      const startOffset =
        Number(previewColumnGeometry.startOffsetsPx?.[safeCol]) || 0;
      const colWidth = Math.max(
        1,
        Number(previewColumnGeometry.widthsPx?.[safeCol]) || previewColumnMinWidthPx,
      );
      const colLeft = previewRowIndexWidthPx + startOffset;
      const colRight = colLeft + colWidth;
      let nextLeft = viewport.scrollLeft;
      if (colLeft < nextLeft) {
        nextLeft = colLeft;
      } else if (colRight > nextLeft + viewport.clientWidth) {
        nextLeft = colRight - viewport.clientWidth;
      }
      nextLeft = Math.max(0, Math.min(maxScrollLeft, nextLeft));

      if (Math.abs(nextTop - viewport.scrollTop) > 0.5) {
        viewport.scrollTop = nextTop;
      }
      if (Math.abs(nextLeft - viewport.scrollLeft) > 0.5) {
        viewport.scrollLeft = nextLeft;
      }
    },
    [
      getPreviewHeaderHeight,
      previewColumnGeometry.startOffsetsPx,
      previewColumnGeometry.widthsPx,
      previewColumnMinWidthPx,
      previewRowIndexWidthPx,
      previewScrollRef,
    ],
  );

  useEffect(() => {
    const last = Array.isArray(selections) ? selections[selections.length - 1] : null;
    const range = last?.range;
    if (!range) {
      keyboardAnchorRef.current = null;
      return;
    }
    keyboardAnchorRef.current = {
      rowIndex: Math.max(0, Math.floor(Number(range.startRow) || 0)),
      colIndex: Math.max(0, Math.floor(Number(range.startCol) || 0)),
    };
  }, [selections]);

  useEffect(() => {
    keyboardAnchorRef.current = null;
  }, [previewFile?.fileId]);

  const handlePreviewKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.defaultPrevented) return;
      if (isEditableElement(event.target)) return;

      const key = String(event.key || "").toLowerCase();
      const isCopyShortcut =
        (event.ctrlKey || event.metaKey) &&
        !event.shiftKey &&
        !event.altKey &&
        key === "c";

      if (isCopyShortcut) {
        if (!hasSelection || typeof copySelection !== "function") return;
        event.preventDefault();
        void copySelection();
        return;
      }

      if (key === "escape" && hasSelection) {
        event.preventDefault();
        if (typeof setSelectionRange === "function") {
          setSelectionRange(null);
        }
        keyboardAnchorRef.current = null;
        return;
      }

      if (
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        typeof setSelectionRange !== "function" ||
        totalRows <= 0 ||
        totalCols <= 0
      ) {
        return;
      }

      if (!isPreviewNavigationKey(key)) return;

      const currentCell = getCurrentSelectionCell();
      if (!currentCell) return;

      const viewport = previewScrollRef.current;
      const pageRows = computePreviewPageRows({
        headerHeight: getPreviewHeaderHeight(),
        rowHeight: PREVIEW_ROW_HEIGHT_PX,
        viewportHeight: Number(viewport?.clientHeight || 0),
      });
      const nextCell = computeNextPreviewCell({
        currentCell,
        key,
        pageRows,
        totalRows,
        totalCols,
      });
      if (!nextCell) return;

      if (
        nextCell.rowIndex === currentCell.rowIndex &&
        nextCell.colIndex === currentCell.colIndex
      ) {
        return;
      }

      event.preventDefault();
      if (event.shiftKey) {
        const anchor = keyboardAnchorRef.current || currentCell;
        keyboardAnchorRef.current = anchor;
        setSelectionRange(
          {
            startRow: anchor.rowIndex,
            endRow: nextCell.rowIndex,
            startCol: anchor.colIndex,
            endCol: nextCell.colIndex,
          },
          { mode: "replace" },
        );
      } else {
        keyboardAnchorRef.current = nextCell;
        setSelectionRange(
          {
            startRow: nextCell.rowIndex,
            endRow: nextCell.rowIndex,
            startCol: nextCell.colIndex,
            endCol: nextCell.colIndex,
          },
          { mode: "replace" },
        );
      }
      ensureCellVisible(nextCell.rowIndex, nextCell.colIndex);
    },
    [
      copySelection,
      ensureCellVisible,
      getCurrentSelectionCell,
      getPreviewHeaderHeight,
      hasSelection,
      previewScrollRef,
      setSelectionRange,
      totalCols,
      totalRows,
    ],
  );

  const handlePreviewPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (isEditableElement(event.target)) return;
      const viewport = event.currentTarget;
      if (!(viewport instanceof HTMLDivElement)) return;
      if (document.activeElement === viewport) return;
      try {
        viewport.focus({ preventScroll: true });
      } catch {
        viewport.focus();
      }
    },
    [],
  );

  const copySelectionTitle = t("da_preview_copy_selection_tsv");
  const toggleYColumnTitle = t("da_preview_toggle_y_column_title");
  const resizeColumnTitle = t("da_preview_resize_column_title");

  return (
    <TemplateManagerPreviewSurface
      previewFile={previewFile}
      previewStatus={previewStatus}
      t={t}
      actions={
        <button
          id="device-analysis-preview-copy-selection"
          type="button"
          onClick={copySelection}
          disabled={!hasSelection}
          className="p-1.5 rounded-md border border-border bg-bg-surface hover:bg-bg-page text-text-secondary hover:text-text-primary disabled:opacity-50 transition-colors"
          title={copySelectionTitle}
        >
          <Copy size={14} />
        </button>
      }
    >
      {previewStatus?.state === "loading" ? (
        <PreviewPlaceholder
          title={previewStatus.message || t("da_preview_loading")}
          hint={t("da_preview_loading_hint")}
        />
      ) : previewStatus?.state === "error" ? (
        <PreviewPlaceholder
          title={previewStatus.message || t("da_preview_error")}
          hint={t("da_preview_error_hint")}
        />
      ) : previewFile ? (
        <ScrollArea
          id="device-analysis-preview-scroll-area"
          ref={previewScrollRef}
          axis="both"
          className={`da-preview-scroll-area flex-1 min-h-0 border border-border rounded ${isColumnResizing ? "cursor-col-resize select-none" : ""
            }`}
          viewportProps={{
            onScroll: (event: Event) => {
              const target = event.currentTarget as HTMLDivElement | null;
              if (!target) return;
              handlePreviewScroll(target.scrollTop, target.scrollLeft);
            },
            onKeyDown: handlePreviewKeyDown,
            onPointerDown: handlePreviewPointerDown,
            tabIndex: 0,
          }}
        >
          <div ref={gridRef} className="relative min-w-full align-top select-none">
            <div className="absolute inset-0 pointer-events-none z-20">
              {selectionRects.map((selection) => {
                const rect = selection.rect;
                return (
                  <div
                    key={selection.id}
                    className="absolute border border-accent bg-accent/5 z-10"
                    style={{
                      left: rect.left,
                      top: rect.top,
                      width: rect.width,
                      height: rect.height,
                    }}
                  />
                );
              })}
              {activeCellRect ? (
                <div
                  className="absolute z-30 box-border border-2 border-accent shadow-[inset_0_0_0_1px_rgba(255,255,255,0.85)]"
                  style={{
                    left: activeCellRect.left,
                    top: activeCellRect.top,
                    width: activeCellRect.width,
                    height: activeCellRect.height,
                  }}
                />
              ) : null}
              {!useCanvasPreview ? (
                <div
                  ref={dragOverlayRef}
                  className="absolute border border-accent bg-accent/5 z-20"
                  style={{ display: "none" }}
                />
              ) : null}
            </div>
            {useCanvasPreview ? (
              <>
                <table
                  ref={previewTableRef}
                  className="text-sm text-left relative border-separate border-spacing-0 z-10 table-fixed"
                  style={{
                    width: `var(--da-preview-table-width, ${previewColumnGeometry.tableWidthPx}px)`,
                    tableLayout: "fixed",
                  }}
                >
                  <PreviewColGroup
                    previewColumnGeometry={previewColumnGeometry}
                    previewColumnMinWidthPx={previewColumnMinWidthPx}
                    previewRowIndexWidthPx={previewRowIndexWidthPx}
                  />
                  <PreviewHeader
                    handleColumnResizeStart={handleColumnResizeStart}
                    previewColumnGeometry={previewColumnGeometry}
                    previewFileId={previewFile?.fileId}
                    resetColumnWidth={resetColumnWidth}
                    resizeHintTitle={resizeColumnTitle}
                    yColumnsSet={yColumnsSet}
                    toggleColumnTitle={toggleYColumnTitle}
                    toggleColumn={toggleColumn}
                  />
                </table>

                <CanvasPreviewGrid
                  previewFile={previewFile}
                  previewWindow={previewWindow}
                  columnGeometry={previewColumnGeometry}
                  previewColumnMinWidthPx={previewColumnMinWidthPx}
                  previewScrollRef={previewScrollRef}
                  previewRowIndexWidthPx={previewRowIndexWidthPx}
                  rowHeightPx={PREVIEW_ROW_HEIGHT_PX}
                  yColumnsSet={yColumnsSet}
                  getPreviewRow={getPreviewRow}
                  selections={selections}
                  subscribePreviewRowsVersion={subscribePreviewRowsVersion}
                  getPreviewRowsVersion={getPreviewRowsVersion}
                  handlePreviewPick={handlePreviewPick}
                  setSelectionRange={setSelectionRange}
                />
              </>
            ) : (
              <table
                ref={previewTableRef}
                className="text-sm text-left relative border-separate border-spacing-0 z-10 table-fixed"
                style={{
                  width: `var(--da-preview-table-width, ${previewColumnGeometry.tableWidthPx}px)`,
                  tableLayout: "fixed",
                }}
              >
                <PreviewColGroup
                  previewColumnGeometry={previewColumnGeometry}
                  previewColumnMinWidthPx={previewColumnMinWidthPx}
                  previewRowIndexWidthPx={previewRowIndexWidthPx}
                />
                <PreviewHeader
                  handleColumnResizeStart={handleColumnResizeStart}
                  previewColumnGeometry={previewColumnGeometry}
                  previewFileId={previewFile?.fileId}
                  resetColumnWidth={resetColumnWidth}
                  resizeHintTitle={resizeColumnTitle}
                  yColumnsSet={yColumnsSet}
                  toggleColumnTitle={toggleYColumnTitle}
                  toggleColumn={toggleColumn}
                />

                <PreviewTbody
                  subscribePreviewRowsVersion={subscribePreviewRowsVersion}
                  getPreviewRowsVersion={getPreviewRowsVersion}
                  previewWindow={previewWindow}
                  columnGeometry={previewColumnGeometry}
                  yColumnsSet={yColumnsSet}
                  getPreviewRow={getPreviewRow}
                  handleCellMouseDown={handleCellMouseDown}
                />
              </table>
            )}
          </div>
        </ScrollArea>
      ) : (
        <PreviewPlaceholder hint={t("da_preview_select_file_hint")} />
      )}
    </TemplateManagerPreviewSurface>
  );
};

export default React.memo(TemplateManagerPreviewPanel);


