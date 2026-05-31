import type {
  ScrollbarAxis,
  ScrollbarMetrics,
  ScrollbarOrientation,
  ScrollbarScrollDimensions,
  ScrollbarScrollPosition,
} from "src/cs/base/browser/ui/scrollbar/scrollbarOptions";

export const MIN_SCROLLBAR_THUMB_SIZE = 24;

const hiddenMetrics: ScrollbarMetrics = {
  showX: false,
  showY: false,
  xThumbSize: 0,
  yThumbSize: 0,
};

export class ScrollbarState {
  private currentMetrics: ScrollbarMetrics = hiddenMetrics;

  get metrics(): ScrollbarMetrics {
    return this.currentMetrics;
  }

  measure(dimensions: ScrollbarScrollDimensions, axis: ScrollbarAxis): boolean {
    const { scrollHeight, clientHeight, scrollWidth, clientWidth } =
      dimensions;
    const allowY = axis === "y" || axis === "both";
    const allowX = axis === "x" || axis === "both";
    const showY = allowY && scrollHeight > clientHeight + 1;
    const showX = allowX && scrollWidth > clientWidth + 1;

    const nextMetrics: ScrollbarMetrics = {
      showX,
      showY,
      xThumbSize: showX
        ? Math.max(MIN_SCROLLBAR_THUMB_SIZE, (clientWidth / scrollWidth) * clientWidth)
        : 0,
      yThumbSize: showY
        ? Math.max(MIN_SCROLLBAR_THUMB_SIZE, (clientHeight / scrollHeight) * clientHeight)
        : 0,
    };

    const changed = !this.metricsEqual(this.currentMetrics, nextMetrics);
    this.currentMetrics = nextMetrics;
    return changed;
  }

  getThumbOffset(
    dimensions: ScrollbarScrollDimensions,
    position: ScrollbarScrollPosition,
    orientation: ScrollbarOrientation,
  ): number {
    if (orientation === "y") {
      if (!this.currentMetrics.showY || this.currentMetrics.yThumbSize <= 0) {
        return 0;
      }

      const maxOffset = Math.max(0, dimensions.clientHeight - this.currentMetrics.yThumbSize);
      const scrollRange = Math.max(1, dimensions.scrollHeight - dimensions.clientHeight);
      return (position.scrollTop / scrollRange) * maxOffset;
    }

    if (!this.currentMetrics.showX || this.currentMetrics.xThumbSize <= 0) {
      return 0;
    }

    const maxOffset = Math.max(0, dimensions.clientWidth - this.currentMetrics.xThumbSize);
    const scrollRange = Math.max(1, dimensions.scrollWidth - dimensions.clientWidth);
    return (position.scrollLeft / scrollRange) * maxOffset;
  }

  private metricsEqual(left: ScrollbarMetrics, right: ScrollbarMetrics): boolean {
    return left.showX === right.showX &&
      left.showY === right.showY &&
      Math.abs(left.xThumbSize - right.xThumbSize) < 0.5 &&
      Math.abs(left.yThumbSize - right.yThumbSize) < 0.5;
  }
}
