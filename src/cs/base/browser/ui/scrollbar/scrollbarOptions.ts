import type { IDisposable } from "src/cs/base/common/lifecycle";

export type ScrollbarAxis = "x" | "y" | "both";
export type ScrollbarOrientation = "x" | "y";

export type ScrollbarVisibility = {
  readonly showX: boolean;
  readonly showY: boolean;
};

export type ScrollbarMetrics = ScrollbarVisibility & {
  readonly xThumbSize: number;
  readonly yThumbSize: number;
};

export type ScrollbarControllerOptions = {
  readonly root: HTMLElement;
  readonly viewport: HTMLElement;
  readonly axis?: ScrollbarAxis;
  readonly observeContentMutations?: boolean;
  readonly getScrollDimensions?: () => ScrollbarScrollDimensions;
  readonly getScrollPosition?: () => ScrollbarScrollPosition;
  readonly setScrollPosition?: (position: Partial<ScrollbarScrollPosition>) => void;
  readonly handleMouseWheel?: boolean;
  readonly onScroll?: (event: Event) => void;
  readonly onScrollPositionChange?: (position: ScrollbarScrollPosition) => void;
};

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

export type ScrollbarHandle = IDisposable & {
  update(): void;
  updateScrollPosition(): void;
  setOptions(options: Partial<Omit<ScrollbarControllerOptions, "root" | "viewport">>): void;
};
