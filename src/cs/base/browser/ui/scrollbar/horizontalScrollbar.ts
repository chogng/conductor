import {
  AbstractScrollbar,
  type ScrollbarPartDelegate,
} from "src/cs/base/browser/ui/scrollbar/abstractScrollbar";
import type {
  ScrollbarMetrics,
  ScrollbarOrientation,
} from "src/cs/base/browser/ui/scrollbar/scrollbarOptions";

export class HorizontalScrollbar extends AbstractScrollbar {
  constructor(
    orientation: ScrollbarOrientation,
    root: HTMLElement,
    delegate: ScrollbarPartDelegate,
  ) {
    super(orientation, root, delegate, "scrollAreaTrackX", "scrollAreaThumbX");
  }

  protected getThumbSize(metrics: ScrollbarMetrics): number {
    return metrics.xThumbSize;
  }

  protected applyThumbSize(size: number): void {
    this.thumb.style.width = `${size}px`;
  }

  protected applyThumbOffset(offset: number): void {
    this.thumb.style.transform = `translate3d(${offset}px, 0, 0)`;
  }
}
