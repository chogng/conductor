import {
  HoverPosition,
  type HoverContent,
  type IHoverPositionOptions,
  type IHoverWidget,
} from "src/cs/base/browser/ui/hover/hover";
import { Disposable } from "src/cs/base/common/lifecycle";

import "src/cs/base/browser/ui/hover/hoverWidget.css";

const WINDOW_MARGIN = 8;
const TARGET_GAP = 8;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

export class HoverWidget extends Disposable implements IHoverWidget {
  public readonly element: HTMLElement;
  private readonly contentElement: HTMLElement;
  private disposed = false;

  public get isDisposed(): boolean {
    return this.disposed;
  }

  constructor(
    ownerDocument: Document,
    content: Exclude<HoverContent, undefined>,
  ) {
    super();
    this.element = ownerDocument.createElement("div");
    this.element.className = "ui-hover-widget";
    this.element.tabIndex = -1;
    this.element.setAttribute("role", "tooltip");

    this.contentElement = ownerDocument.createElement("div");
    this.contentElement.className = "ui-hover-widget__content";
    this.element.appendChild(this.contentElement);
    this.update(content);
  }

  public update(content: Exclude<HoverContent, undefined>): void {
    this.contentElement.replaceChildren();
    if (typeof content === "string") {
      this.contentElement.textContent = content;
      return;
    }
    this.contentElement.appendChild(content);
  }

  public layout(target: HTMLElement, options?: IHoverPositionOptions): void {
    const rect = target.getBoundingClientRect();
    const view = target.ownerDocument.defaultView ?? window;
    const width = this.element.offsetWidth;
    const height = this.element.offsetHeight;
    const position = options?.hoverPosition instanceof MouseEvent
      ? HoverPosition.Below
      : options?.hoverPosition ?? HoverPosition.Below;
    const anchorX = options?.hoverPosition instanceof MouseEvent
      ? options.hoverPosition.clientX
      : rect.left + rect.width / 2;
    const anchorY = options?.hoverPosition instanceof MouseEvent
      ? options.hoverPosition.clientY
      : rect.bottom;

    const preferredLeft = this.getPreferredLeft(position, rect, anchorX, width);
    const preferredTop = this.getPreferredTop(position, rect, anchorY, height);
    const maxLeft = Math.max(WINDOW_MARGIN, view.innerWidth - width - WINDOW_MARGIN);
    const maxTop = Math.max(WINDOW_MARGIN, view.innerHeight - height - WINDOW_MARGIN);

    this.element.style.left = `${clamp(preferredLeft, WINDOW_MARGIN, maxLeft)}px`;
    this.element.style.top = `${clamp(preferredTop, WINDOW_MARGIN, maxTop)}px`;
  }

  public override dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.element.remove();
    super.dispose();
  }

  private getPreferredLeft(
    position: HoverPosition,
    rect: DOMRect,
    anchorX: number,
    width: number,
  ): number {
    if (position === HoverPosition.Left) {
      return rect.left - width - TARGET_GAP;
    }
    if (position === HoverPosition.Right) {
      return rect.right + TARGET_GAP;
    }
    return anchorX - width / 2;
  }

  private getPreferredTop(
    position: HoverPosition,
    rect: DOMRect,
    anchorY: number,
    height: number,
  ): number {
    if (position === HoverPosition.Above) {
      return rect.top - height - TARGET_GAP;
    }
    if (position === HoverPosition.Left || position === HoverPosition.Right) {
      return rect.top + rect.height / 2 - height / 2;
    }
    return anchorY + TARGET_GAP;
  }
}
