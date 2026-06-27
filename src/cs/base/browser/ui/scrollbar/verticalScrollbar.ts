import {
  AbstractScrollbar,
  type ScrollbarPartDelegate,
} from "src/cs/base/browser/ui/scrollbar/abstractScrollbar";
import type { ScrollbarOrientation } from "src/cs/base/browser/ui/scrollbar/scrollbarState";
import type { ScrollbarVisibilityPolicy } from "src/cs/base/browser/ui/scrollbar/scrollbarVisibilityController";

export class VerticalScrollbar extends AbstractScrollbar {
  constructor(
    orientation: ScrollbarOrientation,
    root: HTMLElement,
    delegate: ScrollbarPartDelegate,
    visibilityPolicy?: ScrollbarVisibilityPolicy,
  ) {
    super(orientation, root, delegate, "scrollAreaTrackY", "scrollAreaThumbY", visibilityPolicy);
  }

  protected applyThumbSize(size: number): void {
    this.thumb.setHeight(size);
  }

  protected applyThumbOffset(offset: number): void {
    this.thumb.domNode.style.transform = `translate3d(0, ${offset}px, 0)`;
  }
}
