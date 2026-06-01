import type { TranslateFn } from "src/cs/platform/language/common/language";
import { createPreviewPart } from "src/cs/workbench/browser/parts/previewArea/previewPart";
import SidebarPart from "src/cs/workbench/browser/parts/sidebar/sidebarPart";
import type { RawDataEntry } from "src/cs/workbench/common/deviceAnalysis/sharedTypes";
import {
  TemplateManagerView,
  type TemplateManagerProps,
} from "src/cs/workbench/contrib/template/browser/templateView";

import "src/cs/workbench/contrib/template/browser/media/templateView.css";

export type DataViewPaneProps = {
  readonly analysisSettings?: TemplateManagerProps["analysisSettings"];
  readonly content?: Node | null;
  readonly ensurePreviewCells?: TemplateManagerProps["ensurePreviewCells"];
  readonly ensurePreviewRows?: TemplateManagerProps["ensurePreviewRows"];
  readonly getPreviewRow?: TemplateManagerProps["getPreviewRow"];
  readonly getPreviewRowsVersion?: TemplateManagerProps["getPreviewRowsVersion"];
  readonly importSessionElement?: HTMLElement | null;
  readonly onTemplateApplied?: TemplateManagerProps["onTemplateApplied"];
  readonly onTemplateAppliedIncremental?: TemplateManagerProps["onTemplateAppliedIncremental"];
  readonly onUpdateSettings?: TemplateManagerProps["onUpdateSettings"];
  readonly previewFile?: TemplateManagerProps["previewFile"];
  readonly previewStatus?: TemplateManagerProps["previewStatus"];
  readonly rawData?: RawDataEntry[];
  readonly subscribePreviewRowsVersion?: TemplateManagerProps["subscribePreviewRowsVersion"];
  readonly t: TranslateFn;
};

export class DataViewPane {
  public readonly element: HTMLElement;
  public readonly sidebarElement: HTMLElement;
  private readonly previewContent: HTMLElement;
  private readonly sidebarPart: SidebarPart;
  private readonly templateView: TemplateManagerView;

  constructor(props: DataViewPaneProps) {
    this.templateView = new TemplateManagerView(toTemplateProps(props));
    this.previewContent = document.createElement("div");
    this.previewContent.className = "template_view_pane_content";
    this.previewContent.append(this.templateView.element);

    this.element = createPreviewPart({
      id: "analysis-template-workspace",
      ariaLabel: props.t("da_data_extraction_template"),
      className: "template_view_pane",
      children: this.previewContent,
    });

    this.sidebarPart = new SidebarPart({
      ariaLabel: props.t("da_data_extraction_template"),
      children: this.templateView.sidebarElement,
      className: "template_sidebar_part",
      title: props.t("da_data_extraction_template"),
    });
    this.sidebarElement = this.sidebarPart.element;
  }

  public update(props: DataViewPaneProps): void {
    this.templateView.update(toTemplateProps(props));
    this.sidebarPart.update({
      ariaLabel: props.t("da_data_extraction_template"),
      children: this.templateView.sidebarElement,
      className: "template_sidebar_part",
      title: props.t("da_data_extraction_template"),
    });
  }

  public dispose(): void {
    this.sidebarPart.dispose();
    this.templateView.dispose();
    this.previewContent.replaceChildren();
    this.element.remove();
  }
}

const toTemplateProps = ({
  importSessionElement: _importSessionElement,
  rawData = [],
  ...props
}: DataViewPaneProps): TemplateManagerProps => ({
  ...props,
  rawData,
  importSessionElement: _importSessionElement ?? null,
});

export default DataViewPane;
