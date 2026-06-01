import type { TranslateFn } from "src/cs/platform/language/common/language";
import type { ImporterViewProps } from "src/cs/workbench/contrib/import/browser/importerView";
import TemplateViewPane, {
  type TemplateViewPaneProps,
} from "src/cs/workbench/contrib/template/browser/templateViewPane";

export type DataViewPaneProps = {
  readonly analysisSettings?: TemplateViewPaneProps["analysisSettings"];
  readonly content?: Node | null;
  readonly ensurePreviewCells?: TemplateViewPaneProps["ensurePreviewCells"];
  readonly ensurePreviewRows?: TemplateViewPaneProps["ensurePreviewRows"];
  readonly getPreviewRow?: TemplateViewPaneProps["getPreviewRow"];
  readonly getPreviewRowsVersion?: TemplateViewPaneProps["getPreviewRowsVersion"];
  readonly importerElement?: HTMLElement | null;
  readonly onTemplateApplied?: TemplateViewPaneProps["onTemplateApplied"];
  readonly onTemplateAppliedIncremental?: TemplateViewPaneProps["onTemplateAppliedIncremental"];
  readonly onUpdateSettings?: TemplateViewPaneProps["onUpdateSettings"];
  readonly previewFile?: TemplateViewPaneProps["previewFile"];
  readonly previewStatus?: TemplateViewPaneProps["previewStatus"];
  readonly rawData?: ImporterViewProps["files"];
  readonly subscribePreviewRowsVersion?: TemplateViewPaneProps["subscribePreviewRowsVersion"];
  readonly t: TranslateFn;
};

export class DataViewPane {
  public readonly element: HTMLElement;
  private readonly templateViewPane: TemplateViewPane;

  constructor(props: DataViewPaneProps) {
    this.templateViewPane = new TemplateViewPane(toTemplateProps(props));
    this.element = this.templateViewPane.element;
  }

  public update(props: DataViewPaneProps): void {
    this.templateViewPane.update(toTemplateProps(props));
  }

  public dispose(): void {
    this.templateViewPane.dispose();
  }
}

const toTemplateProps = ({
  importerElement: _importerElement,
  rawData = [],
  ...props
}: DataViewPaneProps): TemplateViewPaneProps => ({
  ...props,
  rawData,
  importerElement: _importerElement ?? null,
});

export default DataViewPane;
