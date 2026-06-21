import {
  AbstractScrollbar,
  type ScrollbarPartDelegate,
} from "src/cs/base/browser/ui/scrollbar/abstractScrollbar";
import type { ScrollbarOrientation } from "src/cs/base/browser/ui/scrollbar/scrollbarState";
import type { ScrollbarVisibilityPolicy } from "src/cs/base/browser/ui/scrollbar/scrollbarVisibilityController";

export class HorizontalScrollbar extends AbstractScrollbar {
  constructor(
    orientation: ScrollbarOrientation,
    root: HTMLElement,
    delegate: ScrollbarPartDelegate,
    visibilityPolicy?: ScrollbarVisibilityPolicy,
  ) {
    super(orientation, root, delegate, "scrollAreaTrackX", "scrollAreaThumbX", visibilityPolicy);
  }

  protected applyThumbSize(size: number): void {
    this.thumb.style.width = `${size}px`;
  }

  protected applyThumbOffset(offset: number): void {
    this.thumb.style.transform = `translate3d(${offset}px, 0, 0)`;
  }
}
