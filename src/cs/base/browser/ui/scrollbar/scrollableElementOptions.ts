import type { IDisposable } from "src/cs/base/common/lifecycle";
import type { ScrollEvent } from "src/cs/base/common/scrollable";
import type { ScrollbarVisibilityPolicy } from "src/cs/base/browser/ui/scrollbar/scrollbarVisibilityController";

export type ScrollbarAxis = "x" | "y" | "both";

export type ScrollbarScrollDimensions = {
  readonly scrollWidth: number;
  readonly scrollHeight: number;
  readonly clientWidth: number;
  readonly clientHeight: number;
};

export type ScrollbarScrollPosition = {
  readonly scrollLeft: number;
  readonly scrollTop: number;
};

export type ScrollableElementOptions = {
  readonly root: HTMLElement;
  readonly viewport: HTMLElement;
  readonly axis?: ScrollbarAxis;
  readonly observeContentMutations?: boolean;
  readonly observeResize?: boolean;
  readonly getScrollDimensions?: () => ScrollbarScrollDimensions;
  readonly getScrollPosition?: () => ScrollbarScrollPosition;
  readonly setScrollPosition?: (position: Partial<ScrollbarScrollPosition>) => void;
  readonly handleMouseWheel?: boolean;
  readonly onScroll?: (event: ScrollEvent) => void;
  readonly onScrollPositionChange?: (position: ScrollbarScrollPosition) => void;
  readonly horizontalScrollbarVisibility?: ScrollbarVisibilityPolicy;
  readonly verticalScrollbarVisibility?: ScrollbarVisibilityPolicy;
};

export type ScrollbarOptions = {
  readonly axis?: ScrollbarAxis;
  readonly className?: string;
  readonly observeContentMutations?: boolean;
  readonly observeResize?: boolean;
  readonly onScroll?: (event: ScrollEvent) => void;
  readonly viewportClassName?: string;
  readonly horizontalScrollbarVisibility?: ScrollbarVisibilityPolicy;
  readonly verticalScrollbarVisibility?: ScrollbarVisibilityPolicy;
};

export type ScrollableElementHandle = IDisposable & {
  getScrollDimensions(): ScrollbarScrollDimensions;
  getScrollPosition(): ScrollbarScrollPosition;
  setScrollPosition(position: Partial<ScrollbarScrollPosition>): void;
  update(): void;
  updateScrollPosition(): void;
  setOptions(options: Partial<Omit<ScrollableElementOptions, "root" | "viewport">>): void;
};
