import React, {
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
  useCallback,
  useState,
} from "react";
import { jsx } from "react/jsx-runtime";

import type { TranslateFn } from "src/cs/platform/language/common/language";
import type { PreviewFileLike } from "src/cs/workbench/common/deviceAnalysis/sharedTypes";
import type { PreviewStatus as SessionPreviewStatus } from "src/cs/workbench/contrib/session/analysis-session-context";
import type { TemplateConfig } from "src/cs/workbench/contrib/template/common/templateManagerUtils";

import TemplateManagerPreviewPanel from "./templatePreviewPanel";
import {
  PREVIEW_ZOOM_DEFAULT_PERCENT,
  offsetPreviewZoomPercent,
} from "./templateManagerPreviewZoom";
import { useTemplateManagerPreview } from "./useTemplateManagerPreview";

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

  return jsx(TemplateManagerPreviewPanel, {
    activeCellRect,
    adjustPreviewZoom,
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
    previewRowHeightPx,
    previewRowIndexWidthPx,
    previewScrollRef,
    previewStatus,
    previewTableRef,
    previewWindow,
    previewZoomPercent,
    resetColumnWidth,
    resetPreviewZoom,
    selections,
    selectionRects,
    setSelectionRange,
    subscribePreviewRowsVersion,
    t,
    toggleColumn,
    toggleColumnEnabled: interactive,
    yColumnsSet,
  });
};

export default React.memo(TemplateManagerPreviewWorkspace);
