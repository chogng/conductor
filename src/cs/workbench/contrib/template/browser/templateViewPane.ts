import type { TranslateFn } from "src/cs/platform/language/common/language";
import { createPreviewPart } from "src/cs/workbench/browser/parts/previewArea/previewPart";
import type { TemplateManagerProps } from "src/cs/workbench/contrib/template/browser/templateView";

export type TemplateViewPaneProps = TemplateManagerProps & {
  readonly content?: Node | null;
  readonly t: TranslateFn;
};

export class TemplateViewPane {
  public readonly element: HTMLElement;
  private readonly contentElement: HTMLElement;

  constructor(props: TemplateViewPaneProps) {
    this.contentElement = document.createElement("div");
    this.contentElement.className = "h-full min-h-0";
    this.element = createPreviewPart({
      id: "analysis-template-workspace",
      ariaLabel: props.t("da_data_extraction_template"),
      className: "flex h-full min-h-0 flex-col",
      children: this.contentElement,
    });
    this.update(props);
  }

  public update(props: TemplateViewPaneProps): void {
    this.contentElement.replaceChildren();
    if (props.content) {
      this.contentElement.append(props.content);
    }
  }

  public dispose(): void {
    this.contentElement.replaceChildren();
    this.element.remove();
  }
}

export default TemplateViewPane;
