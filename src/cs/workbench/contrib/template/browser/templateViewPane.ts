import type { TranslateFn } from "src/cs/platform/language/common/language";
import { createPreviewPart } from "src/cs/workbench/browser/parts/previewArea/previewPart";
import {
  TemplateManagerView,
  type TemplateManagerProps,
} from "src/cs/workbench/contrib/template/browser/templateView";

import "src/cs/workbench/contrib/template/browser/media/templateView.css";

export type TemplateViewPaneProps = TemplateManagerProps & {
  readonly content?: Node | null;
  readonly t: TranslateFn;
};

export class TemplateViewPane {
  public readonly element: HTMLElement;
  private readonly contentElement: HTMLElement;
  private managerView: TemplateManagerView | null = null;
  private customContent: Node | null = null;

  constructor(props: TemplateViewPaneProps) {
    this.contentElement = document.createElement("div");
    this.contentElement.className = "template_view_pane_content";
    this.element = createPreviewPart({
      id: "analysis-template-workspace",
      ariaLabel: props.t("da_data_extraction_template"),
      className: "template_view_pane",
      children: this.contentElement,
    });
    this.update(props);
  }

  public update(props: TemplateViewPaneProps): void {
    if (props.content) {
      this.managerView?.dispose();
      this.managerView = null;
      if (this.customContent !== props.content) {
        this.contentElement.replaceChildren(props.content);
      }
      this.customContent = props.content;
      return;
    }

    if (this.customContent) {
      this.contentElement.replaceChildren();
      this.customContent = null;
    }

    if (!this.managerView) {
      this.managerView = new TemplateManagerView(props);
      this.contentElement.replaceChildren(this.managerView.element);
      return;
    }

    this.managerView.update(props);
  }

  public dispose(): void {
    this.managerView?.dispose();
    this.managerView = null;
    this.customContent = null;
    this.contentElement.replaceChildren();
    this.element.remove();
  }
}

export default TemplateViewPane;
