import { localize } from "src/cs/nls";
import { ViewPane } from "src/cs/workbench/browser/parts/views/viewPane";
import { TemplateAuxiliaryBarViewId } from "src/cs/workbench/contrib/template/common/template";

import "src/cs/workbench/contrib/template/browser/media/templateViewPane.css";

const TEMPLATE_TITLE = localize("template_management_title", "Template Management");

export class TemplateAuxiliaryBarViewPane extends ViewPane {
  private readonly content = document.createElement("div");

  constructor(content: HTMLElement) {
    super({
      id: TemplateAuxiliaryBarViewId,
      title: TEMPLATE_TITLE,
      className: "auxiliarybar_view_pane template_auxiliarybar_view_pane",
      bodyClassName: "workbench-part-view-pane__body",
      headerVisible: false,
    });
    this.body.setAttribute("aria-label", TEMPLATE_TITLE);
    this.content.className = "template_pane template_pane--auxiliary";
    this.content.append(content);
    this.body.append(this.content);
  }

  public update(content: HTMLElement, title = TEMPLATE_TITLE): void {
    this.body.setAttribute("aria-label", title);
    if (content.parentElement !== this.content) {
      this.content.replaceChildren(content);
    }
  }

  public dispose(): void {
    this.content.replaceChildren();
    this.content.remove();
    super.dispose();
  }
}
