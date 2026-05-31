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

  protected applyThumbSize(metrics: ScrollbarMetrics): void {
    this.thumb.style.height = `${metrics.yThumbSize}px`;
  }

  protected applyThumbOffset(offset: number): void {
    this.thumb.style.transform = `translate3d(0, ${offset}px, 0)`;
  }
}
