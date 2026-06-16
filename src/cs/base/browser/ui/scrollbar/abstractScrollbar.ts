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

const THUMB_UPDATE_EPSILON = 0.5;

export abstract class AbstractScrollbar implements IDisposable {
  protected readonly track: HTMLDivElement;
  protected readonly thumb: HTMLDivElement;

  private visible: boolean | null = null;
  private thumbOffset = Number.NaN;
  private thumbSize = Number.NaN;

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
    if (this.visible !== visible) {
      this.visible = visible;
      this.track.hidden = !visible;
      this.root.dataset[this.orientation === "y" ? "scrollbarY" : "scrollbarX"] =
        visible ? "visible" : "hidden";
    }

    if (!visible) {
      this.updateThumbOffset(0);
      return;
    }

    this.updateThumbSize(this.getThumbSize(metrics));
    this.updateThumbOffset(offset);
  }

  dispose(): void {
    this.track.removeEventListener("mousedown", this.handleTrackPointerDown);
    this.thumb.removeEventListener("mousedown", this.handleThumbPointerDown);
    this.track.remove();
  }

  protected abstract applyThumbSize(size: number): void;
  protected abstract applyThumbOffset(offset: number): void;
  protected abstract getThumbSize(metrics: ScrollbarMetrics): number;

  private updateThumbSize(size: number): void {
    if (Math.abs(this.thumbSize - size) < THUMB_UPDATE_EPSILON) {
      return;
    }

    this.thumbSize = size;
    this.applyThumbSize(size);
  }

  private updateThumbOffset(offset: number): void {
    if (Math.abs(this.thumbOffset - offset) < THUMB_UPDATE_EPSILON) {
      return;
    }

    this.thumbOffset = offset;
    this.applyThumbOffset(offset);
  }

  private readonly handleTrackPointerDown = (event: MouseEvent): void => {
    this.delegate.onTrackPointerDown(this.orientation, event);
  };

  private readonly handleThumbPointerDown = (event: MouseEvent): void => {
    this.delegate.onThumbPointerDown(this.orientation, event);
  };
}
