import { createButton } from "src/cs/base/browser/ui/button/button";
import type { MutableRef } from "src/cs/base/common/ref";
import type { TranslateFn } from "src/cs/platform/language/common/language";
import type { PreviewFileLike } from "src/cs/workbench/common/deviceAnalysis/sharedTypes";
import type { PreviewStatus as SessionPreviewStatus } from "src/cs/workbench/contrib/session/analysis-session-context";
import { formatNumber } from "src/cs/workbench/contrib/diagnostics/common/numberFormat";
import { getExcelColumnLabel } from "src/cs/workbench/contrib/template/common/templateColumnLabel";
import {
  PREVIEW_ZOOM_DEFAULT_PERCENT,
  PREVIEW_ZOOM_MAX_PERCENT,
  PREVIEW_ZOOM_MIN_PERCENT,
} from "./templateManagerPreviewZoom";
import {
  TemplateManagerPreviewEmptyState,
  TemplateManagerPreviewSurface,
} from "./templatePreviewSurface";

type PreviewStatus = Partial<SessionPreviewStatus>;

type PreviewWindow = {
  startRow: number;
  endRow: number;
  topSpacerHeight: number;
  bottomSpacerHeight: number;
};

type PreviewColumnGeometry = {
  columnCount?: number;
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

type TemplateManagerPreviewPanelProps = {
  activeCellRect?: DOMRect | Record<string, number> | null;
  adjustPreviewZoom: (deltaSteps: number) => void;
  copySelection?: () => Promise<void> | void;
  dragOverlayRef: MutableRef<HTMLDivElement | null>;
  getPreviewRow?: (rowIndex: number) => unknown;
  getPreviewRowsVersion?: () => number;
  gridRef: MutableRef<HTMLDivElement | null>;
  handleCellMouseDown?: (event: any) => void;
  handleColumnResizeStart: (event: any, colIndex: number) => void;
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
  previewRowHeightPx: number;
  previewRowIndexWidthPx: number;
  previewScrollRef: MutableRef<HTMLDivElement | null>;
  previewStatus?: PreviewStatus | null;
  previewTableRef: MutableRef<HTMLTableElement | null>;
  previewWindow: PreviewWindow;
  previewZoomPercent: number;
  resetPreviewZoom: () => void;
  resetColumnWidth: (fileId: string, colIndex: number) => void;
  yColumnsSet: Set<number>;
  setSelectionRange?: SetSelectionRangeFn;
  selectionRects: SelectionRect[];
  selections: SelectionItem[];
  subscribePreviewRowsVersion?: (onStoreChange: () => void) => () => void;
  t: TranslateFn;
  toggleColumnEnabled?: boolean;
  toggleColumn: (index: number) => void;
};

const PREVIEW_FONT_SIZE_PX = 12;
const PREVIEW_CELL_PADDING_X_PX = 8;
const PREVIEW_CELL_PADDING_Y_PX = 4;
const PREVIEW_HEADER_RESIZER_WIDTH_PX = 12;

const formatPreviewCell = (value: unknown): string => {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") {
    return Number.isFinite(value) ? formatNumber(value, { digits: 6 }) : "";
  }
  const text = String(value);
  const trimmed = text.trim();
  if (!trimmed) return "";
  const num = Number(trimmed);
  if (Number.isFinite(num) && /^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(trimmed)) {
    return formatNumber(num, { digits: 6 });
  }
  return text;
};

const readRectNumber = (
  rect: DOMRect | Record<string, number> | null | undefined,
  key: "height" | "left" | "top" | "width",
): number => Number(rect?.[key]) || 0;

const assignRef = <T,>(ref: MutableRef<T | null> | undefined, value: T | null): void => {
  if (ref) {
    ref.current = value;
  }
};

const createText = (className: string, text: string): HTMLSpanElement => {
  const span = document.createElement("span");
  span.className = className;
  span.textContent = text;
  return span;
};

const createZoomActions = ({
  adjustPreviewZoom,
  previewZoomPercent,
  resetPreviewZoom,
  t,
}: Pick<
  TemplateManagerPreviewPanelProps,
  "adjustPreviewZoom" | "previewZoomPercent" | "resetPreviewZoom" | "t"
>): HTMLElement => {
  const actions = document.createElement("div");
  actions.className = "template_preview_zoom_actions";

  const zoomOut = createButton({
    ariaLabel: t("da_preview_zoom_out_title"),
    disabled: previewZoomPercent <= PREVIEW_ZOOM_MIN_PERCENT,
    label: "-",
    size: "iconSm",
    variant: "ghost",
  });
  zoomOut.addEventListener("click", () => adjustPreviewZoom(-1));

  const zoomReset = createButton({
    ariaLabel: t("da_preview_zoom_reset_title", { value: previewZoomPercent }),
    label: `${previewZoomPercent}%`,
    size: "sm",
    variant: previewZoomPercent === PREVIEW_ZOOM_DEFAULT_PERCENT ? "ghost" : "secondary",
  });
  zoomReset.addEventListener("click", resetPreviewZoom);

  const zoomIn = createButton({
    ariaLabel: t("da_preview_zoom_in_title"),
    disabled: previewZoomPercent >= PREVIEW_ZOOM_MAX_PERCENT,
    label: "+",
    size: "iconSm",
    variant: "ghost",
  });
  zoomIn.addEventListener("click", () => adjustPreviewZoom(1));

  actions.append(zoomOut, zoomReset, zoomIn);
  return actions;
};

const isCellSelected = (
  selections: readonly SelectionItem[],
  rowIndex: number,
  colIndex: number,
): boolean =>
  selections.some(({ range }) =>
    rowIndex >= Math.min(range.startRow, range.endRow) &&
    rowIndex <= Math.max(range.startRow, range.endRow) &&
    colIndex >= Math.min(range.startCol, range.endCol) &&
    colIndex <= Math.max(range.startCol, range.endCol),
  );

const createColumnHeader = ({
  colIndex,
  isYColumn,
  previewFileId,
  resetColumnWidth,
  toggleColumn,
  toggleColumnEnabled,
  t,
  width,
  onResizeStart,
}: {
  colIndex: number;
  isYColumn: boolean;
  previewFileId: string;
  resetColumnWidth: (fileId: string, colIndex: number) => void;
  toggleColumn: (index: number) => void;
  toggleColumnEnabled: boolean;
  t: TranslateFn;
  width: number;
  onResizeStart: (event: PointerEvent, colIndex: number) => void;
}): HTMLTableCellElement => {
  const cell = document.createElement("th");
  cell.className = "template_preview_column_header";
  cell.style.width = `${width}px`;
  cell.style.minWidth = `${width}px`;
  cell.style.maxWidth = `${width}px`;
  cell.dataset.selected = isYColumn ? "true" : "false";

  const inner = document.createElement("div");
  inner.className = "template_preview_column_header_inner";
  inner.style.minHeight = "28px";

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "template_preview_column_toggle";
  toggle.disabled = !toggleColumnEnabled;
  toggle.title = t("da_preview_toggle_y_column_title");
  toggle.setAttribute("aria-pressed", isYColumn ? "true" : "false");
  toggle.textContent = isYColumn ? "Y" : "";
  toggle.addEventListener("click", (event) => {
    event.stopPropagation();
    toggleColumn(colIndex);
  });

  const label = document.createElement("button");
  label.type = "button";
  label.className = "template_preview_column_label";
  label.title = t("da_preview_reset_column_width_title");
  label.textContent = getExcelColumnLabel(colIndex);
  label.addEventListener("dblclick", () => resetColumnWidth(previewFileId, colIndex));

  const resize = document.createElement("div");
  resize.className = "template_preview_column_resize";
  resize.style.width = `${PREVIEW_HEADER_RESIZER_WIDTH_PX}px`;
  resize.title = t("da_preview_resize_column_title");
  resize.addEventListener("pointerdown", (event) => onResizeStart(event, colIndex));

  inner.append(toggle, label, resize);
  cell.append(inner);
  return cell;
};

const createPreviewTable = ({
  getPreviewRow,
  handleCellMouseDown,
  handleColumnResizeStart,
  handlePreviewPick,
  previewColumnGeometry,
  previewColumnMinWidthPx,
  previewFile,
  previewRowHeightPx,
  previewRowIndexWidthPx,
  previewTableRef,
  previewWindow,
  resetColumnWidth,
  selections,
  setSelectionRange,
  t,
  toggleColumn,
  toggleColumnEnabled = true,
  yColumnsSet,
}: Pick<
  TemplateManagerPreviewPanelProps,
  | "getPreviewRow"
  | "handleCellMouseDown"
  | "handleColumnResizeStart"
  | "handlePreviewPick"
  | "previewColumnGeometry"
  | "previewColumnMinWidthPx"
  | "previewFile"
  | "previewRowHeightPx"
  | "previewRowIndexWidthPx"
  | "previewTableRef"
  | "previewWindow"
  | "resetColumnWidth"
  | "selections"
  | "setSelectionRange"
  | "t"
  | "toggleColumn"
  | "toggleColumnEnabled"
  | "yColumnsSet"
>): HTMLTableElement => {
  const table = document.createElement("table");
  table.className = "template_preview_table";
  table.style.width = `${Math.max(1, Number(previewColumnGeometry.tableWidthPx) || 1)}px`;
  table.style.fontSize = `${PREVIEW_FONT_SIZE_PX}px`;
  assignRef(previewTableRef, table);

  const colgroup = document.createElement("colgroup");
  const rowHeaderCol = document.createElement("col");
  rowHeaderCol.style.width = `${previewRowIndexWidthPx}px`;
  colgroup.append(rowHeaderCol);
  for (const colIndex of previewColumnGeometry.visibleColumnIndices) {
    const col = document.createElement("col");
    const width = Math.max(1, Number(previewColumnGeometry.widthsPx[colIndex]) || previewColumnMinWidthPx);
    col.style.width = `${width}px`;
    colgroup.append(col);
  }
  table.append(colgroup);

  const thead = document.createElement("thead");
  const headerRow = document.createElement("tr");
  const corner = document.createElement("th");
  corner.className = "template_preview_corner";
  corner.style.width = `${previewRowIndexWidthPx}px`;
  headerRow.append(corner);

  const previewFileId = String(previewFile?.fileId ?? "");
  for (const colIndex of previewColumnGeometry.visibleColumnIndices) {
    const width = Math.max(1, Number(previewColumnGeometry.widthsPx[colIndex]) || previewColumnMinWidthPx);
    headerRow.append(createColumnHeader({
      colIndex,
      isYColumn: yColumnsSet.has(colIndex),
      previewFileId,
      resetColumnWidth,
      toggleColumn,
      toggleColumnEnabled,
      t,
      width,
      onResizeStart: (event, index) => handleColumnResizeStart(event, index),
    }));
  }
  thead.append(headerRow);
  table.append(thead);

  const tbody = document.createElement("tbody");
  const topSpacerHeight = Math.max(0, Number(previewWindow.topSpacerHeight) || 0);
  if (topSpacerHeight > 0) {
    tbody.append(createSpacerRow(topSpacerHeight, previewColumnGeometry.visibleColumnIndices.length + 1));
  }

  for (let rowIndex = previewWindow.startRow; rowIndex < previewWindow.endRow; rowIndex += 1) {
    const row = document.createElement("tr");
    row.style.height = `${previewRowHeightPx}px`;
    const rowHeader = document.createElement("th");
    rowHeader.className = "template_preview_row_header";
    rowHeader.textContent = String(rowIndex + 1);
    row.append(rowHeader);

    const rowCellsRaw = getPreviewRow?.(rowIndex);
    const rowCells = Array.isArray(rowCellsRaw) ? rowCellsRaw : [];
    for (const colIndex of previewColumnGeometry.visibleColumnIndices) {
      const cell = document.createElement("td");
      const selected = isCellSelected(selections, rowIndex, colIndex);
      cell.className = "template_preview_cell";
      cell.style.padding = `${PREVIEW_CELL_PADDING_Y_PX}px ${PREVIEW_CELL_PADDING_X_PX}px`;
      cell.style.width = `${Math.max(1, Number(previewColumnGeometry.widthsPx[colIndex]) || previewColumnMinWidthPx)}px`;
      cell.dataset.rowIndex = String(rowIndex);
      cell.dataset.colIndex = String(colIndex);
      cell.dataset.selected = selected ? "true" : "false";
      cell.dataset.yColumn = yColumnsSet.has(colIndex) ? "true" : "false";
      if (selected) {
        cell.classList.add("template_preview_cell--selected");
      }
      cell.textContent = formatPreviewCell(rowCells[colIndex]);
      cell.addEventListener("mousedown", (event) => {
        handleCellMouseDown?.(event);
        const handled = handlePreviewPick?.({
          event,
          rowIndex,
          colIndex,
          cellEl: cell,
        });
        if (!handled && setSelectionRange) {
          setSelectionRange({
            startRow: rowIndex,
            endRow: rowIndex,
            startCol: colIndex,
            endCol: colIndex,
          });
        }
      });
      row.append(cell);
    }
    tbody.append(row);
  }

  const bottomSpacerHeight = Math.max(0, Number(previewWindow.bottomSpacerHeight) || 0);
  if (bottomSpacerHeight > 0) {
    tbody.append(createSpacerRow(bottomSpacerHeight, previewColumnGeometry.visibleColumnIndices.length + 1));
  }

  table.append(tbody);
  return table;
};

const createSpacerRow = (height: number, colSpan: number): HTMLTableRowElement => {
  const row = document.createElement("tr");
  row.style.height = `${height}px`;
  const cell = document.createElement("td");
  cell.colSpan = colSpan;
  cell.className = "template_preview_spacer_cell";
  row.append(cell);
  return row;
};

const createSelectionLayer = ({
  activeCellRect,
  dragOverlayRef,
  selectionRects,
}: Pick<
  TemplateManagerPreviewPanelProps,
  "activeCellRect" | "dragOverlayRef" | "selectionRects"
>): HTMLDivElement => {
  const layer = document.createElement("div");
  layer.className = "template_preview_selection_layer";
  assignRef(dragOverlayRef, layer);

  for (const selection of selectionRects ?? []) {
    const rect = selection.rect;
    const box = document.createElement("div");
    box.className = "template_preview_selection_box";
    box.dataset.selectionId = selection.id;
    box.style.left = `${readRectNumber(rect, "left")}px`;
    box.style.top = `${readRectNumber(rect, "top")}px`;
    box.style.width = `${readRectNumber(rect, "width")}px`;
    box.style.height = `${readRectNumber(rect, "height")}px`;
    layer.append(box);
  }

  if (activeCellRect) {
    const active = document.createElement("div");
    active.className = "template_preview_active_cell";
    active.style.left = `${readRectNumber(activeCellRect, "left")}px`;
    active.style.top = `${readRectNumber(activeCellRect, "top")}px`;
    active.style.width = `${readRectNumber(activeCellRect, "width")}px`;
    active.style.height = `${readRectNumber(activeCellRect, "height")}px`;
    layer.append(active);
  }

  return layer;
};

export const createTemplateManagerPreviewPanel = ({
  activeCellRect,
  adjustPreviewZoom,
  copySelection,
  dragOverlayRef,
  getPreviewRow,
  gridRef,
  handleCellMouseDown,
  handleColumnResizeStart,
  handlePreviewPick,
  handlePreviewScroll,
  isColumnResizing,
  previewColumnGeometry,
  previewColumnMinWidthPx,
  previewFile,
  previewRowHeightPx,
  previewRowIndexWidthPx,
  previewScrollRef,
  previewStatus,
  previewTableRef,
  previewWindow,
  previewZoomPercent,
  resetPreviewZoom,
  resetColumnWidth,
  selectionRects,
  selections,
  setSelectionRange,
  t,
  toggleColumn,
  toggleColumnEnabled = true,
  yColumnsSet,
}: TemplateManagerPreviewPanelProps): HTMLElement => {
  const actions = createZoomActions({
    adjustPreviewZoom,
    previewZoomPercent,
    resetPreviewZoom,
    t,
  });

  if (!previewFile) {
    return TemplateManagerPreviewSurface({
      actions,
      previewFile,
      previewStatus,
      t,
      children: TemplateManagerPreviewEmptyState({
        title: t("da_preview_empty_title"),
        hint: t("da_preview_empty_hint"),
      }),
    });
  }

  const grid = document.createElement("div");
  grid.className = "template_preview_grid";
  grid.dataset.resizing = isColumnResizing ? "true" : "false";
  assignRef(gridRef, grid);

  const viewport = document.createElement("div");
  viewport.className = "scrollAreaViewport template_preview_viewport";
  viewport.tabIndex = 0;
  viewport.setAttribute("role", "grid");
  viewport.setAttribute("aria-rowcount", String(Math.max(0, Number(previewFile.rowCount) || 0)));
  viewport.setAttribute("aria-colcount", String(Math.max(0, Number(previewFile.columnCount) || 0)));
  assignRef(previewScrollRef, viewport);
  viewport.addEventListener("scroll", () => handlePreviewScroll(viewport.scrollTop, viewport.scrollLeft));
  viewport.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === "c") {
      if (copySelection && selections.length > 0) {
        event.preventDefault();
        void copySelection();
      }
      return;
    }
    if ((event.ctrlKey || event.metaKey) && !event.altKey && (event.key === "+" || event.key === "=")) {
      event.preventDefault();
      adjustPreviewZoom(1);
      return;
    }
    if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key === "-") {
      event.preventDefault();
      adjustPreviewZoom(-1);
    }
  });

  const table = createPreviewTable({
    getPreviewRow,
    handleCellMouseDown,
    handleColumnResizeStart,
    handlePreviewPick,
    previewColumnGeometry,
    previewColumnMinWidthPx,
    previewFile,
    previewRowHeightPx,
    previewRowIndexWidthPx,
    previewTableRef,
    previewWindow,
    resetColumnWidth,
    selections,
    setSelectionRange,
    t,
    toggleColumn,
    toggleColumnEnabled,
    yColumnsSet,
  });
  viewport.append(table);
  viewport.append(createSelectionLayer({
    activeCellRect,
    dragOverlayRef,
    selectionRects,
  }));
  grid.append(viewport);

  return TemplateManagerPreviewSurface({
    actions,
    previewFile,
    previewStatus,
    t,
    children: grid,
  });
};

const TemplateManagerPreviewPanel = (props: TemplateManagerPreviewPanelProps): any =>
  createTemplateManagerPreviewPanel(props);

export default TemplateManagerPreviewPanel;
