import { jsx } from "react/jsx-runtime";
import type { MutableRefObject } from "react";
import SplitView, {
  type SplitViewResizeEvent,
} from "src/cs/base/browser/ui/splitview/splitview";
import type { TranslateFn } from "src/cs/platform/language/common/language";
import PreviewPart from "src/cs/workbench/browser/parts/previewArea/previewPart";
import {
  SIDEBAR_DEFAULT_WIDTH_PX,
  SIDEBAR_MAX_WIDTH_PX,
  SIDEBAR_MIN_WIDTH_PX,
} from "src/cs/workbench/contrib/deviceAnalysis/layout";
import type {
  CsvImporterProps,
  CsvImporterRef,
} from "src/cs/workbench/contrib/import/CsvImporter";
import ImportSidebar from "src/cs/workbench/contrib/deviceAnalysis/data/ImportSidebar";
import TemplateManager, {
  type TemplateManagerProps,
} from "src/cs/workbench/contrib/template/TemplateManager";

type DataPartProps = {
  readonly analysisSettings?: TemplateManagerProps["analysisSettings"];
  readonly ensurePreviewCells?: TemplateManagerProps["ensurePreviewCells"];
  readonly ensurePreviewRows?: TemplateManagerProps["ensurePreviewRows"];
  readonly getPreviewRow?: TemplateManagerProps["getPreviewRow"];
  readonly getPreviewRowsVersion?: TemplateManagerProps["getPreviewRowsVersion"];
  readonly hasSessionData: boolean;
  readonly importerRef: MutableRefObject<CsvImporterRef | null>;
  readonly onClearSession?: () => void;
  readonly onDataImported?: CsvImporterProps["onDataImported"];
  readonly onDataRemoved?: CsvImporterProps["onDataRemoved"];
  readonly onFileSelected?: CsvImporterProps["onFileSelected"];
  readonly onImportTrigger?: () => void;
  readonly onSidebarResize?: (width: number) => void;
  readonly onTemplateApplied?: TemplateManagerProps["onTemplateApplied"];
  readonly onTemplateAppliedIncremental?: TemplateManagerProps["onTemplateAppliedIncremental"];
  readonly onUpdateSettings?: TemplateManagerProps["onUpdateSettings"];
  readonly previewFile?: TemplateManagerProps["previewFile"];
  readonly previewStatus?: TemplateManagerProps["previewStatus"];
  readonly rawData?: CsvImporterProps["files"];
  readonly selectedPreviewFileId?: CsvImporterProps["selectedFileId"];
  readonly sidebarWidth?: number;
  readonly subscribePreviewRowsVersion?: TemplateManagerProps["subscribePreviewRowsVersion"];
  readonly t: TranslateFn;
};

const DataPart = ({
  analysisSettings,
  ensurePreviewCells,
  ensurePreviewRows,
  getPreviewRow,
  getPreviewRowsVersion,
  hasSessionData,
  importerRef,
  onClearSession,
  onDataImported,
  onDataRemoved,
  onFileSelected,
  onImportTrigger,
  onSidebarResize,
  onTemplateApplied,
  onTemplateAppliedIncremental,
  onUpdateSettings,
  previewFile,
  previewStatus,
  rawData = [],
  selectedPreviewFileId,
  sidebarWidth,
  subscribePreviewRowsVersion,
  t,
}: DataPartProps) =>
  jsx(SplitView, {
    className: "min-h-full h-full",
    gap: 4,
    onDidResizeEnd: ({ sizes }: SplitViewResizeEvent) => {
      const nextWidth = sizes[0];
      if (Number.isFinite(nextWidth)) {
        onSidebarResize?.(nextWidth);
      }
    },
    orientation: "horizontal",
    panes: [
      {
        id: "sidebar",
        children: jsx(ImportSidebar, {
          hasSessionData,
          importerRef,
          onClearSession,
          onDataImported,
          onDataRemoved,
          onFileSelected,
          onImportTrigger,
          rawData,
          selectedPreviewFileId,
          t,
        }),
        defaultSize: SIDEBAR_DEFAULT_WIDTH_PX,
        minSize: SIDEBAR_MIN_WIDTH_PX,
        maxSize: SIDEBAR_MAX_WIDTH_PX,
        size: sidebarWidth,
      },
      {
        id: "preview-area",
        children: jsx(PreviewPart, {
          id: "analysis-template-workspace",
          ariaLabel: t("da_data_extraction_template"),
          className: "flex h-full min-h-0 flex-col",
          children: jsx(TemplateManager, {
            analysisSettings,
            ensurePreviewCells,
            ensurePreviewRows,
            getPreviewRow,
            getPreviewRowsVersion,
            onTemplateApplied,
            onTemplateAppliedIncremental,
            onUpdateSettings,
            previewFile,
            previewStatus,
            rawData,
            subscribePreviewRowsVersion,
          }),
        }),
        minSize: 520,
      },
    ],
  });

export default DataPart;
