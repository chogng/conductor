import {
  type HoverContent,
  type IManagedHoverContent,
} from "src/cs/base/browser/ui/hover/hover";
import { Disposable } from "src/cs/base/common/lifecycle";
import { HoverWidget } from "src/cs/platform/hover/browser/hoverWidget";

export class ManagedHoverWidget extends Disposable {
  private hoverWidget: HoverWidget | undefined;

  public get isDisposed(): boolean {
    return this.hoverWidget?.isDisposed ?? false;
  }

  constructor(private readonly target: HTMLElement) {
    super();
  }

  public show(content: IManagedHoverContent): void {
    const resolved = this.resolveContent(content);
    if (!resolved) {
      this.hide();
      return;
    }

    const ownerDocument = this.target.ownerDocument;
    const oldHoverWidget = this.hoverWidget;
    const hoverWidget = new HoverWidget(ownerDocument, resolved);
    ownerDocument.body.appendChild(hoverWidget.element);
    hoverWidget.layout(this.target);
    this.hoverWidget = hoverWidget;
    oldHoverWidget?.dispose();
  }

  public hide(): void {
    this.hoverWidget?.dispose();
    this.hoverWidget = undefined;
  }

  public override dispose(): void {
    this.hide();
    super.dispose();
  }

  private resolveContent(content: IManagedHoverContent): Exclude<HoverContent, undefined> | undefined {
    return content || undefined;
  }
}
