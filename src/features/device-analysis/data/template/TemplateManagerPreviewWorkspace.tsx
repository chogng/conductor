import React, {
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import type { TranslateFn } from "../../../../context/language";
import type { PreviewStatus as SessionPreviewStatus } from "../../session/device-analysis-session-context";
import type { PreviewFileLike } from "../../shared/lib/sharedTypes";
import TemplateManagerPreviewPanel from "./TemplateManagerPreviewPanel";
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
  previewFile,
  previewStatus,
  setConfig,
  subscribePreviewRowsVersion,
  t,
  writeFieldFromPreview,
}: TemplateManagerPreviewWorkspaceProps) => {
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
    previewScrollRef,
    previewTableRef,
    previewWindow,
    resetColumnWidth,
    selectedColumnsSet,
    setSelectionRange,
    selectionRects,
    selections,
    toggleColumn,
  } = useTemplateManagerPreview({
    containerRef,
    config,
    ensurePreviewRows,
    getPreviewRow,
    previewFile,
    previewStatus,
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
      handleCellMouseDown={handleCellMouseDown}
      handleColumnResizeStart={handleColumnResizeStart}
      handlePreviewPick={handlePreviewPick}
      handlePreviewScroll={handlePreviewScroll}
      isColumnResizing={isColumnResizing}
      previewColumnGeometry={previewColumnGeometry}
      previewColumnMinWidthPx={previewColumnMinWidthPx}
      previewFile={previewFile}
      previewRowIndexWidthPx={previewRowIndexWidthPx}
      previewScrollRef={previewScrollRef}
      previewStatus={previewStatus}
      previewTableRef={previewTableRef}
      previewWindow={previewWindow}
      resetColumnWidth={resetColumnWidth}
      selectedColumnsSet={selectedColumnsSet}
      setSelectionRange={setSelectionRange}
      selectionRects={selectionRects}
      selections={selections}
      subscribePreviewRowsVersion={subscribePreviewRowsVersion}
      t={t}
      toggleColumn={toggleColumn}
    />
  );
};

export default React.memo(TemplateManagerPreviewWorkspace);
