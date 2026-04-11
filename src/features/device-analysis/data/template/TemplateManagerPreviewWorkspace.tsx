import React, {
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
  useCallback,
  useState,
} from "react";
import type { TranslateFn } from "../../../../context/language";
import type { PreviewStatus as SessionPreviewStatus } from "../../session/device-analysis-session-context";
import type { PreviewFileLike } from "../../shared/lib/sharedTypes";
import TemplateManagerPreviewPanel from "./TemplateManagerPreviewPanel";
import {
  PREVIEW_ZOOM_DEFAULT_PERCENT,
  offsetPreviewZoomPercent,
} from "./templateManagerPreviewZoom";
import { useTemplateManagerPreview } from "./useTemplateManagerPreview";
import type { TemplateConfig } from "./templateManagerUtils";

type PreviewStatus = Partial<SessionPreviewStatus>;

type TemplateManagerPreviewWorkspaceProps = {
  containerRef: MutableRefObject<HTMLElement | null>;
  config: TemplateConfig;
  ensurePreviewRows?: (
    fileId: string,
    startRow: number,
    endRow: number,
  ) => Promise<unknown> | unknown;
  getPreviewRow?: (rowIndex: number) => unknown;
  getPreviewRowsVersion?: () => number;
  interactive?: boolean;
  previewFile?: PreviewFileLike | null;
  previewStatus?: PreviewStatus | null;
  setConfig: Dispatch<SetStateAction<TemplateConfig>>;
  subscribePreviewRowsVersion?: (onStoreChange: () => void) => () => void;
  t: TranslateFn;
  writeFieldFromPreview: (field: string, value: string) => void;
};

const TemplateManagerPreviewWorkspace = ({
  containerRef,
  config,
  ensurePreviewRows,
  getPreviewRow,
  getPreviewRowsVersion,
  interactive = true,
  previewFile,
  previewStatus,
  setConfig,
  subscribePreviewRowsVersion,
  t,
  writeFieldFromPreview,
}: TemplateManagerPreviewWorkspaceProps) => {
  const [previewZoomPercent, setPreviewZoomPercent] = useState(
    PREVIEW_ZOOM_DEFAULT_PERCENT,
  );
  const adjustPreviewZoom = useCallback((deltaSteps: number) => {
    setPreviewZoomPercent((prev) => offsetPreviewZoomPercent(prev, deltaSteps));
  }, []);
  const resetPreviewZoom = useCallback(() => {
    setPreviewZoomPercent(PREVIEW_ZOOM_DEFAULT_PERCENT);
  }, []);

  const {
    activeCellRect,
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
    previewRowIndexWidthPx,
    previewRowHeightPx,
    previewScrollRef,
    previewTableRef,
    previewWindow,
    resetColumnWidth,
    yColumnsSet,
    setSelectionRange,
    selectionRects,
    selections,
    toggleColumn,
  } = useTemplateManagerPreview({
    containerRef,
    config,
    ensurePreviewRows,
    getPreviewRow,
    interactive,
    previewFile,
    previewStatus,
    previewZoomPercent,
    setConfig,
    writeFieldFromPreview,
  });

  return (
    <TemplateManagerPreviewPanel
      activeCellRect={activeCellRect}
      copySelection={copySelection}
      dragOverlayRef={dragOverlayRef}
      getPreviewRow={getPreviewRow}
      getPreviewRowsVersion={getPreviewRowsVersion}
      gridRef={gridRef}
      adjustPreviewZoom={adjustPreviewZoom}
      handleCellMouseDown={handleCellMouseDown}
      handleColumnResizeStart={handleColumnResizeStart}
      handlePreviewPick={handlePreviewPick}
      handlePreviewScroll={handlePreviewScroll}
      isColumnResizing={isColumnResizing}
      previewColumnGeometry={previewColumnGeometry}
      previewColumnMinWidthPx={previewColumnMinWidthPx}
      previewFile={previewFile}
      previewRowHeightPx={previewRowHeightPx}
      previewRowIndexWidthPx={previewRowIndexWidthPx}
      previewScrollRef={previewScrollRef}
      previewStatus={previewStatus}
      previewTableRef={previewTableRef}
      previewWindow={previewWindow}
      previewZoomPercent={previewZoomPercent}
      resetPreviewZoom={resetPreviewZoom}
      resetColumnWidth={resetColumnWidth}
      yColumnsSet={yColumnsSet}
      setSelectionRange={setSelectionRange}
      selectionRects={selectionRects}
      selections={selections}
      subscribePreviewRowsVersion={subscribePreviewRowsVersion}
      t={t}
      toggleColumnEnabled={interactive}
      toggleColumn={toggleColumn}
    />
  );
};

export default React.memo(TemplateManagerPreviewWorkspace);

