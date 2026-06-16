import {
  AbstractScrollbar,
  type ScrollbarPartDelegate,
} from "src/cs/base/browser/ui/scrollbar/abstractScrollbar";
import type {
  ScrollbarMetrics,
  ScrollbarOrientation,
} from "src/cs/base/browser/ui/scrollbar/scrollbarOptions";

export class VerticalScrollbar extends AbstractScrollbar {
  constructor(
    orientation: ScrollbarOrientation,
    root: HTMLElement,
    delegate: ScrollbarPartDelegate,
  ) {
    super(orientation, root, delegate, "scrollAreaTrackY", "scrollAreaThumbY");
  }

  protected getThumbSize(metrics: ScrollbarMetrics): number {
    return metrics.yThumbSize;
  }

  protected applyThumbSize(size: number): void {
    this.thumb.style.height = `${size}px`;
  }

  protected applyThumbOffset(offset: number): void {
    this.thumb.style.transform = `translate3d(0, ${offset}px, 0)`;
  }
}
