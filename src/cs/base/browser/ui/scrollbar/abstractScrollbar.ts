import type { IDisposable } from "src/cs/base/common/lifecycle";
import type {
  ScrollbarMetrics,
  ScrollbarOrientation,
} from "src/cs/base/browser/ui/scrollbar/scrollbarOptions";
import { isScrollbarVisible } from "src/cs/base/browser/ui/scrollbar/scrollbarVisibility";

export type ScrollbarPartDelegate = {
  readonly onTrackPointerDown: (orientation: ScrollbarOrientation, event: MouseEvent) => void;
  readonly onThumbPointerDown: (orientation: ScrollbarOrientation, event: MouseEvent) => void;
};

export abstract class AbstractScrollbar implements IDisposable {
  protected readonly track: HTMLDivElement;
  protected readonly thumb: HTMLDivElement;

  constructor(
    protected readonly orientation: ScrollbarOrientation,
    private readonly root: HTMLElement,
    private readonly delegate: ScrollbarPartDelegate,
    trackClassName: string,
    thumbClassName: string,
  ) {
    this.track = document.createElement("div");
    this.thumb = document.createElement("div");
    this.track.className = `scrollAreaTrack ${trackClassName}`;
    this.thumb.className = `scrollAreaThumb ${thumbClassName}`;
    this.track.appendChild(this.thumb);

    this.track.addEventListener("mousedown", this.handleTrackPointerDown);
    this.thumb.addEventListener("mousedown", this.handleThumbPointerDown);
    this.root.appendChild(this.track);
  }

  update(metrics: ScrollbarMetrics, offset: number): void {
    const visible = isScrollbarVisible(metrics, this.orientation);
    this.track.hidden = !visible;
    this.root.dataset[this.orientation === "y" ? "scrollbarY" : "scrollbarX"] =
      visible ? "visible" : "hidden";

    if (!visible) {
      this.thumb.style.transform = "translate3d(0, 0, 0)";
      return;
    }

    this.applyThumbSize(metrics);
    this.applyThumbOffset(offset);
  }

  dispose(): void {
    this.track.removeEventListener("mousedown", this.handleTrackPointerDown);
    this.thumb.removeEventListener("mousedown", this.handleThumbPointerDown);
    this.track.remove();
  }

  protected abstract applyThumbSize(metrics: ScrollbarMetrics): void;
  protected abstract applyThumbOffset(offset: number): void;

  private readonly handleTrackPointerDown = (event: MouseEvent): void => {
    this.delegate.onTrackPointerDown(this.orientation, event);
  };

  private readonly handleThumbPointerDown = (event: MouseEvent): void => {
    this.delegate.onThumbPointerDown(this.orientation, event);
  };
}
