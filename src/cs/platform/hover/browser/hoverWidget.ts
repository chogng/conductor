import {
  type HoverContent,
  type IHoverWidget,
} from "src/cs/base/browser/ui/hover/hover";
import { HoverWidget as BaseHoverWidget } from "src/cs/base/browser/ui/hover/hoverWidget";

import "src/cs/platform/hover/browser/media/hover.css";

export class HoverWidget extends BaseHoverWidget implements IHoverWidget {
  constructor(
    ownerDocument: Document,
    content: Exclude<HoverContent, undefined>,
  ) {
    super(ownerDocument);
    this.element.classList.add("workbench-hover-widget");
    this.render(content);
  }

  private render(content: Exclude<HoverContent, undefined>): void {
    this.contentElement.replaceChildren();
    if (typeof content === "string") {
      this.contentElement.textContent = content;
      return;
    }
    this.contentElement.appendChild(content);
  }
}
