import { jsx } from "react/jsx-runtime";
import type { TranslateFn } from "src/cs/platform/language/common/language";
import type {
  ImporterViewProps,
} from "src/cs/workbench/contrib/import/browser/importerView";
import TemplateViewPane, {
  type TemplateViewPaneProps,
} from "src/cs/workbench/contrib/template/browser/templateViewPane";

export type DataViewPaneProps = {
  readonly analysisSettings?: TemplateViewPaneProps["analysisSettings"];
  readonly ensurePreviewCells?: TemplateViewPaneProps["ensurePreviewCells"];
  readonly ensurePreviewRows?: TemplateViewPaneProps["ensurePreviewRows"];
  readonly getPreviewRow?: TemplateViewPaneProps["getPreviewRow"];
  readonly getPreviewRowsVersion?: TemplateViewPaneProps["getPreviewRowsVersion"];
  readonly onTemplateApplied?: TemplateViewPaneProps["onTemplateApplied"];
  readonly onTemplateAppliedIncremental?: TemplateViewPaneProps["onTemplateAppliedIncremental"];
  readonly onUpdateSettings?: TemplateViewPaneProps["onUpdateSettings"];
  readonly previewFile?: TemplateViewPaneProps["previewFile"];
  readonly previewStatus?: TemplateViewPaneProps["previewStatus"];
  readonly rawData?: ImporterViewProps["files"];
  readonly subscribePreviewRowsVersion?: TemplateViewPaneProps["subscribePreviewRowsVersion"];
  readonly t: TranslateFn;
};

const DataViewPane = ({
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
}: DataViewPaneProps) =>
  jsx(TemplateViewPane, {
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
    t,
  });

export default DataViewPane;
