import React, { useSyncExternalStore } from "react";
import { Check, Copy, FileSpreadsheet } from "lucide-react";
import Avatar from "../../../components/ui/Avatar";
import ScrollArea from "../../../components/ui/ScrollArea";
import type { TranslateFn } from "../../../context/language-context";
import { formatNumber } from "../lib/analysisMath";
import { getExcelColumnLabel } from "../lib/templateManagerPreview";

type PreviewStatus = {
  state?: string;
  message?: string;
};

type PreviewFileLike = {
  fileId?: string;
  fileName?: string;
  [key: string]: unknown;
};

type PreviewWindow = {
  startRow: number;
  endRow: number;
  topSpacerHeight: number;
  bottomSpacerHeight: number;
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

type PreviewRowProps = {
  rowIndex: number;
  rowCellsRaw: unknown;
  columnGeometry: PreviewColumnGeometry;
  selectedColumnsSet: Set<number>;
  handleCellMouseDown?: (event: React.MouseEvent<HTMLTableCellElement>) => void;
};

type PreviewTbodyProps = {
  subscribePreviewRowsVersion?: (onStoreChange: () => void) => () => void;
  getPreviewRowsVersion?: () => number;
  previewWindow: PreviewWindow;
  columnGeometry: PreviewColumnGeometry;
  selectedColumnsSet: Set<number>;
  getPreviewRow?: (rowIndex: number) => unknown;
  handleCellMouseDown?: (event: React.MouseEvent<HTMLTableCellElement>) => void;
};

type PreviewPlaceholderProps = {
  title?: string;
  hint?: string;
};

type TemplateManagerPreviewPanelProps = {
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
  selectedColumnsSet: Set<number>;
  selectionRects: SelectionRect[];
  selections: SelectionItem[];
  subscribePreviewRowsVersion?: (onStoreChange: () => void) => () => void;
  t: TranslateFn;
  toggleColumn: (index: number) => void;
};

const EMPTY_ARRAY: unknown[] = [];
const noopSubscribe = (_onStoreChange: () => void) => () => {};
const getZero = () => 0;

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

const PreviewRow = React.memo(
  ({
    rowIndex,
    rowCellsRaw,
    columnGeometry,
    selectedColumnsSet,
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
        {visibleColumnIndices.map((index: number) => {
          const cell = rowCells[index] ?? "";
          const raw = isRowLoaded ? String(cell) : "";
          const display = isRowLoaded ? formatPreviewCell(cell) : "";

          return (
            <td
              key={index}
              data-row={rowIndex}
              data-col={index}
              className={`px-2 py-1 h-7 border-b border-r border-border last:border-r-0 whitespace-nowrap text-xs transition-colors cursor-default overflow-hidden text-ellipsis ${selectedColumnsSet.has(index)
                  ? "bg-accent/5 border-accent/20 text-text-primary"
                  : "text-text-secondary"
                }`}
              onMouseDown={handleCellMouseDown}
              title={raw}
            >
              {display}
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
    selectedColumnsSet,
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

    useSyncExternalStore(
      previewRowsSubscribe,
      previewRowsGetSnapshot,
      previewRowsGetSnapshot,
    );

    const rows: React.JSX.Element[] = [];
    for (
      let rowIndex = previewWindow.startRow;
      rowIndex < previewWindow.endRow;
      rowIndex += 1
    ) {
      const rowCellsRaw =
        typeof getPreviewRow === "function" ? getPreviewRow(rowIndex) : null;

      rows.push(
        <PreviewRow
          key={rowIndex}
          rowIndex={rowIndex}
          rowCellsRaw={rowCellsRaw}
          columnGeometry={columnGeometry}
          selectedColumnsSet={selectedColumnsSet}
          handleCellMouseDown={handleCellMouseDown}
        />,
      );
    }

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

const PreviewPlaceholder = ({ title, hint }: PreviewPlaceholderProps) => (
  <div
    id="device-analysis-preview-placeholder"
    className="empty_state_panel flex-1 min-h-0"
  >
    <Avatar icon={FileSpreadsheet} size="lg" variant="empty" />
    {title ? <p className="empty_state_title">{title}</p> : null}
    {hint ? <p className="empty_state_hint">{hint}</p> : null}
  </div>
);

const TemplateManagerPreviewPanel = ({
  copySelection,
  dragOverlayRef,
  getPreviewRow,
  getPreviewRowsVersion,
  gridRef,
  handleCellMouseDown,
  handleColumnResizeStart,
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
  selectedColumnsSet,
  selectionRects,
  selections,
  subscribePreviewRowsVersion,
  t,
  toggleColumn,
}: TemplateManagerPreviewPanelProps) => {
  return (
    <div className="lg:col-span-3 bg-bg-page rounded-lg p-4 overflow-hidden flex flex-col min-h-0 lg:min-h-[var(--da-template-panel-min-h)]">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-text-secondary">
          {t("da_preview_filename_label")}:{" "}
          {previewFile
            ? String(previewFile.fileName || "").replace(/\.csv$/i, "")
            : ""}
        </span>
        {previewStatus?.state === "loading" ? (
          <span className="text-xs text-text-secondary">
            {previewStatus.message || "Loading preview..."}
          </span>
        ) : previewStatus?.state === "error" ? (
          <span className="text-xs text-red-500">
            {previewStatus.message || "Preview failed to load"}
          </span>
        ) : null}
        <div className="flex items-center gap-2">
          <button
            id="device-analysis-preview-copy-selection"
            type="button"
            onClick={copySelection}
            disabled={selections.length === 0}
            className="p-1.5 rounded-md border border-border bg-bg-surface hover:bg-bg-page text-text-secondary hover:text-text-primary disabled:opacity-50 transition-colors"
            title="Copy selection as TSV"
          >
            <Copy size={14} />
          </button>
        </div>
      </div>

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
              <div
                ref={dragOverlayRef}
                className="absolute border border-accent bg-accent/5 z-20"
                style={{ display: "none" }}
              />
            </div>

            <table
              ref={previewTableRef}
              className="text-sm text-left relative border-separate border-spacing-0 z-10 table-fixed"
              style={{
                width: `var(--da-preview-table-width, ${previewColumnGeometry.tableWidthPx}px)`,
                tableLayout: "fixed",
              }}
            >
              <colgroup>
                <col style={{ width: previewRowIndexWidthPx }} />
                {previewColumnGeometry.hasLeftSpacer ? (
                  <col
                    style={{ width: previewColumnGeometry.window.leftSpacerPx }}
                  />
                ) : null}
                {previewColumnGeometry.visibleColumnIndices.map((index) => (
                  <col
                    key={index}
                    style={{
                      width: `var(--da-preview-col-${index}-w, ${previewColumnGeometry.widthsPx[index] ?? previewColumnMinWidthPx
                        }px)`,
                    }}
                  />
                ))}
                {previewColumnGeometry.hasRightSpacer ? (
                  <col
                    style={{ width: previewColumnGeometry.window.rightSpacerPx }}
                  />
                ) : null}
              </colgroup>

              <thead className="bg-bg-surface sticky top-0 z-30 shadow-sm">
                <tr>
                  <th className="p-1 border-b border-r border-border bg-bg-surface w-12 text-center font-bold text-xs text-text-secondary select-none sticky left-0 top-0 z-40"></th>
                  {previewColumnGeometry.hasLeftSpacer ? (
                    <th
                      aria-hidden="true"
                      className="p-0 border-b border-r border-border bg-bg-surface"
                    />
                  ) : null}
                  {previewColumnGeometry.visibleColumnIndices.map((index) => {
                    const isSelected = selectedColumnsSet.has(index);
                    return (
                      <th
                        key={index}
                        onClick={() => toggleColumn(index)}
                        className={`px-2 py-1 border-b border-border border-r last:border-r-0 font-mono text-xs whitespace-nowrap bg-bg-surface font-semibold text-center select-none cursor-pointer relative pr-3 overflow-hidden ${isSelected
                            ? "text-accent bg-accent/10 border-accent/30"
                            : "text-text-secondary hover:bg-bg-page/60"
                          }`}
                        title="Click to toggle Y column"
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
                                <Check
                                  size={10}
                                  className="text-white"
                                  strokeWidth={4}
                                />
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
                          title="Drag to resize | Double-click to reset"
                          onPointerDown={(event) =>
                            handleColumnResizeStart(event, index)
                          }
                          onClick={(event) => event.stopPropagation()}
                          onDoubleClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            if (!previewFile?.fileId) return;
                            resetColumnWidth(previewFile.fileId, index);
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

              <PreviewTbody
                subscribePreviewRowsVersion={subscribePreviewRowsVersion}
                getPreviewRowsVersion={getPreviewRowsVersion}
                previewWindow={previewWindow}
                columnGeometry={previewColumnGeometry}
                selectedColumnsSet={selectedColumnsSet}
                getPreviewRow={getPreviewRow}
                handleCellMouseDown={handleCellMouseDown}
              />
            </table>
          </div>
        </ScrollArea>
      ) : (
        <PreviewPlaceholder hint={t("da_preview_select_file_hint")} />
      )}
    </div>
  );
};

export default React.memo(TemplateManagerPreviewPanel);

