export type ScrollbarOrientation = "x" | "y";

export type ScrollbarStateUpdate = {
  readonly enabled: boolean;
  readonly scrollPosition: number;
  readonly scrollSize: number;
  readonly visibleSize: number;
};

export const MIN_SCROLLBAR_THUMB_SIZE = 24;
const SCROLLBAR_NEEDED_EPSILON = 1;

export class ScrollbarState {
  private needed = false;
  private scrollPosition = 0;
  private scrollSize = 0;
  private thumbOffset = 0;
  private thumbSize = 0;
  private visibleSize = 0;

  clone(): ScrollbarState {
    const clone = new ScrollbarState();
    clone.needed = this.needed;
    clone.scrollPosition = this.scrollPosition;
    clone.scrollSize = this.scrollSize;
    clone.thumbOffset = this.thumbOffset;
    clone.thumbSize = this.thumbSize;
    clone.visibleSize = this.visibleSize;
    return clone;
  }

  update(update: ScrollbarStateUpdate): boolean {
    const visibleSize = Math.max(0, update.visibleSize);
    const scrollSize = Math.max(0, update.scrollSize);
    const scrollPosition = Math.max(0, update.scrollPosition);
    const needed = update.enabled && scrollSize > visibleSize + SCROLLBAR_NEEDED_EPSILON;
    const thumbSize = needed
      ? Math.max(MIN_SCROLLBAR_THUMB_SIZE, (visibleSize / scrollSize) * visibleSize)
      : 0;
    const thumbOffset = needed
      ? this.computeThumbOffset(visibleSize, scrollSize, scrollPosition, thumbSize)
      : 0;

    const changed = this.needed !== needed ||
      Math.abs(this.visibleSize - visibleSize) >= 0.5 ||
      Math.abs(this.scrollSize - scrollSize) >= 0.5 ||
      Math.abs(this.scrollPosition - scrollPosition) >= 0.5 ||
      Math.abs(this.thumbSize - thumbSize) >= 0.5 ||
      Math.abs(this.thumbOffset - thumbOffset) >= 0.5;

    this.needed = needed;
    this.scrollPosition = scrollPosition;
    this.scrollSize = scrollSize;
    this.thumbOffset = thumbOffset;
    this.thumbSize = thumbSize;
    this.visibleSize = visibleSize;
    return changed;
  }

  isNeeded(): boolean {
    return this.needed;
  }

  getThumbOffset(): number {
    return this.thumbOffset;
  }

  getThumbSize(): number {
    return this.thumbSize;
  }

  getDesiredScrollPositionFromDelta(delta: number): number {
    if (!this.needed) {
      return 0;
    }

    const trackRange = Math.max(1, this.visibleSize - this.thumbSize);
    const scrollRange = Math.max(1, this.scrollSize - this.visibleSize);
    return this.scrollPosition + (delta * scrollRange) / trackRange;
  }

  getDesiredScrollPositionFromOffset(offset: number): number {
    if (!this.needed) {
      return 0;
    }

    const maxThumbTravel = Math.max(1, this.visibleSize - this.thumbSize);
    const ratio = Math.max(0, Math.min(1, (offset - this.thumbSize / 2) / maxThumbTravel));
    return ratio * Math.max(0, this.scrollSize - this.visibleSize);
  }

  private computeThumbOffset(
    visibleSize: number,
    scrollSize: number,
    scrollPosition: number,
    thumbSize: number,
  ): number {
    const maxOffset = Math.max(0, visibleSize - thumbSize);
    const scrollRange = Math.max(1, scrollSize - visibleSize);
    return (scrollPosition / scrollRange) * maxOffset;
  }
}
