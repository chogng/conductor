import type { TranslateFn } from "src/cs/platform/language/common/language";
import { createPreviewPart } from "src/cs/workbench/browser/parts/previewArea/previewPart";
import SidebarPart from "src/cs/workbench/browser/parts/sidebar/sidebarPart";
import type { RawDataEntry } from "src/cs/workbench/common/deviceAnalysis/sharedTypes";
import {
  TemplateManagerView,
  type TemplateElementOptions,
} from "src/cs/workbench/contrib/template/browser/templateView";

import "src/cs/workbench/contrib/template/browser/media/templateView.css";

export type TemplateEditorPaneProps = {
  readonly analysisSettings?: TemplateElementOptions["analysisSettings"];
  readonly content?: Node | null;
  readonly importSessionElement?: HTMLElement | null;
  readonly onTemplateApplied?: TemplateElementOptions["onTemplateApplied"];
  readonly onTemplateAppliedIncremental?: TemplateElementOptions["onTemplateAppliedIncremental"];
  readonly onUpdateSettings?: TemplateElementOptions["onUpdateSettings"];
  readonly rawData?: RawDataEntry[];
  readonly tableBindings?: TemplateElementOptions["tableBindings"];
  readonly t: TranslateFn;
};

export class TemplateEditorPane {
  public readonly element: HTMLElement;
  public readonly sidebarElement: HTMLElement;
  private readonly previewContent: HTMLElement;
  private readonly sidebarPart: SidebarPart;
  private readonly templateView: TemplateManagerView;

  constructor(props: TemplateEditorPaneProps) {
    this.templateView = new TemplateManagerView(toTemplateProps(props));
    this.previewContent = document.createElement("div");
    this.previewContent.className = "template_view_pane_content";
    this.previewContent.append(this.templateView.element);

    this.element = createPreviewPart({
      id: "analysis-template-workspace",
      ariaLabel: props.t("da_data_extraction_template"),
      className: "template_view_pane template_view_pane--joined_sidebar",
      children: this.previewContent,
    });

    this.sidebarPart = new SidebarPart({
      ariaLabel: props.t("da_data_extraction_template"),
      children: this.templateView.sidebarElement,
      className: "template_sidebar_part template_sidebar_part--joined_preview",
      title: props.t("da_data_extraction_template"),
    });
    this.sidebarElement = this.sidebarPart.element;
  }

  public update(props: TemplateEditorPaneProps): void {
    this.templateView.update(toTemplateProps(props));
    this.sidebarPart.update({
      ariaLabel: props.t("da_data_extraction_template"),
      children: this.templateView.sidebarElement,
      className: "template_sidebar_part template_sidebar_part--joined_preview",
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
}: TemplateEditorPaneProps): TemplateElementOptions => ({
  ...props,
  rawData,
  importSessionElement: _importSessionElement ?? null,
});

export default TemplateEditorPane;
