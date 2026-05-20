import { jsx } from "react/jsx-runtime";
import type { TranslateFn } from "src/cs/platform/language/common/language";
import PreviewPart from "src/cs/workbench/browser/parts/previewArea/previewPart";
import type {
  CsvImporterProps,
} from "src/cs/workbench/contrib/import/CsvImporter";
import TemplateManager, {
  type TemplateManagerProps,
} from "src/cs/workbench/contrib/template/TemplateManager";

type DataPartProps = {
  readonly analysisSettings?: TemplateManagerProps["analysisSettings"];
  readonly ensurePreviewCells?: TemplateManagerProps["ensurePreviewCells"];
  readonly ensurePreviewRows?: TemplateManagerProps["ensurePreviewRows"];
  readonly getPreviewRow?: TemplateManagerProps["getPreviewRow"];
  readonly getPreviewRowsVersion?: TemplateManagerProps["getPreviewRowsVersion"];
  readonly onTemplateApplied?: TemplateManagerProps["onTemplateApplied"];
  readonly onTemplateAppliedIncremental?: TemplateManagerProps["onTemplateAppliedIncremental"];
  readonly onUpdateSettings?: TemplateManagerProps["onUpdateSettings"];
  readonly previewFile?: TemplateManagerProps["previewFile"];
  readonly previewStatus?: TemplateManagerProps["previewStatus"];
  readonly rawData?: CsvImporterProps["files"];
  readonly subscribePreviewRowsVersion?: TemplateManagerProps["subscribePreviewRowsVersion"];
  readonly t: TranslateFn;
};

const DataPart = ({
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
  rawData = [],
  subscribePreviewRowsVersion,
  t,
}: DataPartProps) =>
  jsx(PreviewPart, {
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
  });

export default DataPart;
