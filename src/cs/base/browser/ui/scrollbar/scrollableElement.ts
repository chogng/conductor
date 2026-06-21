import {
  addDisposableListener,
  DisposableResizeObserver,
  EventType,
  getScrollDimensions,
  getScrollPosition,
  observeMutations,
  scheduleAtNextAnimationFrame,
} from "src/cs/base/browser/dom";
import {
  DisposableStore,
  type IDisposable,
} from "src/cs/base/common/lifecycle";
import { ScrollState, type ScrollEvent } from "src/cs/base/common/scrollable";
import { HorizontalScrollbar } from "src/cs/base/browser/ui/scrollbar/horizontalScrollbar";
import type {
  ScrollbarOptions,
  ScrollbarAxis,
  ScrollbarScrollDimensions,
  ScrollbarScrollPosition,
  ScrollableElementHandle,
  ScrollableElementOptions,
} from "src/cs/base/browser/ui/scrollbar/scrollableElementOptions";
import type { ScrollbarOrientation } from "src/cs/base/browser/ui/scrollbar/scrollbarState";
import { VerticalScrollbar } from "src/cs/base/browser/ui/scrollbar/verticalScrollbar";

import "src/cs/base/browser/ui/scrollbar/media/scrollbar.css";

const WHEEL_LINE_DELTA_PX = 40;
const HORIZONTAL_WHEEL_SMOOTHING = 0.24;
const HORIZONTAL_WHEEL_STOP_THRESHOLD_PX = 0.5;

type WheelClassifierItem = {
  readonly deltaX: number;
  readonly deltaY: number;
  readonly score: number;
};

class WheelClassifier {
  private readonly capacity = 5;
  private readonly memory: WheelClassifierItem[] = [];

  accept(deltaX: number, deltaY: number): void {
    this.memory.push({
      deltaX,
      deltaY,
      score: this.computeScore(deltaX, deltaY),
    });

    if (this.memory.length > this.capacity) {
      this.memory.shift();
    }
  }

  isPhysicalWheel(): boolean {
    if (!this.memory.length) {
      return false;
    }

    let remainingInfluence = 1;
    let score = 0;

    for (let index = this.memory.length - 1; index >= 0; index -= 1) {
      const influence = index === 0
        ? remainingInfluence
        : Math.pow(2, index - this.memory.length);
      remainingInfluence -= influence;
      score += this.memory[index].score * influence;
    }

    return score <= 0.5;
  }

  private computeScore(deltaX: number, deltaY: number): number {
    if (Math.abs(deltaX) > 0 && Math.abs(deltaY) > 0) {
      return 1;
    }

    let score = 0.5;
    if (!this.isAlmostInteger(deltaX) || !this.isAlmostInteger(deltaY)) {
      score += 0.25;
    }

    return Math.min(Math.max(score, 0), 1);
  }

  private isAlmostInteger(value: number): boolean {
    return Math.abs(Math.round(value) - value) < 0.01;
  }
}

export class ScrollableElement implements ScrollableElementHandle {
  private readonly store = new DisposableStore();
  private readonly verticalScrollbar: VerticalScrollbar;
  private readonly horizontalScrollbar: HorizontalScrollbar;
  private readonly wheelClassifier = new WheelClassifier();
  private axis: ScrollbarAxis;
  private observeContentMutations: boolean;
  private observeResize: boolean;
  private handleMouseWheel: boolean;
  private onScroll?: (event: ScrollEvent) => void;
  private onScrollPositionChange?: ScrollableElementOptions["onScrollPositionChange"];
  private scrollState = new ScrollState(false, 0, 0, 0, 0, 0, 0);
  private metricsRaf: IDisposable | null = null;
  private thumbRaf: IDisposable | null = null;
  private horizontalWheelRaf: IDisposable | null = null;
  private horizontalWheelTarget = 0;
  private disposed = false;

  constructor(private readonly options: ScrollableElementOptions) {
    this.axis = options.axis ?? "y";
    this.observeContentMutations = options.observeContentMutations ?? true;
    this.observeResize = options.observeResize ?? true;
    this.handleMouseWheel = options.handleMouseWheel ?? false;
    this.onScroll = options.onScroll;
    this.onScrollPositionChange = options.onScrollPositionChange;

    this.options.root.classList.add("scrollArea");
    this.options.viewport.classList.add("scrollAreaViewport");
    this.options.viewport.dataset.axis = this.axis;
    if (this.handleMouseWheel) {
      this.options.viewport.dataset.scrollbarMode = "virtual";
    }

    const scrollbarDelegate = {
      onDragEnd: this.handleScrollbarDragEnd,
      onDragStart: this.handleScrollbarDragStart,
      onScrollPositionChange: this.handleScrollbarScrollPositionChange,
    };
    this.verticalScrollbar = this.store.add(
      new VerticalScrollbar(
        "y",
        this.options.root,
        scrollbarDelegate,
        this.options.verticalScrollbarVisibility,
      ),
    );
    this.horizontalScrollbar = this.store.add(
      new HorizontalScrollbar(
        "x",
        this.options.root,
        scrollbarDelegate,
        this.options.horizontalScrollbarVisibility,
      ),
    );

    this.registerListeners();
    this.scheduleMetricsUpdate();
  }

  setOptions(options: Partial<Omit<ScrollableElementOptions, "root" | "viewport">>): void {
    if (options.axis) {
      this.axis = options.axis;
      this.options.viewport.dataset.axis = this.axis;
    }

    if (typeof options.observeContentMutations === "boolean") {
      this.observeContentMutations = options.observeContentMutations;
    }

    if (typeof options.observeResize === "boolean") {
      this.observeResize = options.observeResize;
    }

    if (typeof options.handleMouseWheel === "boolean") {
      this.handleMouseWheel = options.handleMouseWheel;
      this.options.viewport.dataset.scrollbarMode = this.handleMouseWheel
        ? "virtual"
        : undefined;
    }

    if (options.onScroll !== undefined) {
      this.onScroll = options.onScroll;
    }

    if (options.onScrollPositionChange !== undefined) {
      this.onScrollPositionChange = options.onScrollPositionChange;
    }

    if (options.verticalScrollbarVisibility !== undefined) {
      this.verticalScrollbar.setVisibilityPolicy(options.verticalScrollbarVisibility);
    }

    if (options.horizontalScrollbarVisibility !== undefined) {
      this.horizontalScrollbar.setVisibilityPolicy(options.horizontalScrollbarVisibility);
    }

    this.scheduleMetricsUpdate();
  }

  update(): void {
    this.updateThumbOffsets();
  }

  updateScrollPosition(): void {
    this.updateThumbOffsets();
  }

  getScrollDimensions(): ScrollbarScrollDimensions {
    return this.readScrollDimensions();
  }

  getScrollPosition(): ScrollbarScrollPosition {
    return this.readScrollPosition();
  }

  setScrollPosition(position: Partial<ScrollbarScrollPosition>): void {
    if (this.options.setScrollPosition) {
      this.options.setScrollPosition(position);
    } else {
      if (typeof position.scrollLeft === "number") {
        this.options.viewport.scrollLeft = position.scrollLeft;
      }
      if (typeof position.scrollTop === "number") {
        this.options.viewport.scrollTop = position.scrollTop;
      }
    }

    this.onScrollPositionChange?.(this.readScrollPosition());
    this.scheduleThumbOffsetsUpdate();
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }

    this.disposed = true;
    this.metricsRaf?.dispose();
    this.thumbRaf?.dispose();
    this.cancelHorizontalWheelAnimation();
    this.store.dispose();
    this.options.root.classList.remove("scrollArea");
    this.options.viewport.classList.remove("scrollAreaViewport");
    this.options.viewport.removeAttribute("data-axis");
    this.options.viewport.removeAttribute("data-scrollbar-mode");
    this.options.root.removeAttribute("data-scrollbar-active");
    this.options.root.removeAttribute("data-scrollbar-x");
    this.options.root.removeAttribute("data-scrollbar-y");
  }

  private registerListeners(): void {
    const viewport = this.options.viewport;
    const targetWindow = viewport.ownerDocument.defaultView ?? window;

    this.store.add(addDisposableListener(
      viewport,
      EventType.SCROLL,
      this.handleScroll,
      { passive: true },
    ));
    this.store.add(addDisposableListener(
      viewport,
      EventType.WHEEL,
      this.handleWheel,
      { passive: false },
    ));
    if (this.observeResize) {
      this.store.add(addDisposableListener(
        targetWindow,
        EventType.RESIZE,
        this.scheduleMetricsUpdate,
      ));

      const resizeObserver = this.store.add(new DisposableResizeObserver(targetWindow, () => {
        this.scheduleMetricsUpdate();
      }));
      this.store.add(resizeObserver.observe(viewport));

      const contentEl = viewport.firstElementChild;
      if (contentEl) {
        this.store.add(resizeObserver.observe(contentEl));
      }
    }

    if (this.observeContentMutations) {
      this.store.add(observeMutations(viewport, () => this.scheduleMetricsUpdate(), {
        childList: true,
      }));
    }
  }

  private readonly handleScroll = (): void => {
    this.onScrollPositionChange?.(this.readScrollPosition());
    this.scheduleThumbOffsetsUpdate();
    this.emitScrollEvent(false);
  };

  private readonly handleWheel = (event: WheelEvent): void => {
    if (event.defaultPrevented || !this.handleMouseWheel) {
      return;
    }

    const dimensions = this.readScrollDimensions();
    const position = this.readScrollPosition();
    const allowX = this.axis === "x" || this.axis === "both";
    const allowY = this.axis === "y" || this.axis === "both";
    const { scrollWidth, clientWidth, scrollHeight, clientHeight } = dimensions;
    const maxScrollLeft = Math.max(0, scrollWidth - clientWidth);
    const maxScrollTop = Math.max(0, scrollHeight - clientHeight);
    if ((!allowX || maxScrollLeft <= 0) && (!allowY || maxScrollTop <= 0)) {
      return;
    }

    let deltaY = this.normalizeWheelDelta(event, event.deltaY);
    let deltaX = this.normalizeWheelDelta(event, event.deltaX);
    this.wheelClassifier.accept(deltaX, deltaY);

    if (Math.abs(deltaY) >= Math.abs(deltaX)) {
      deltaX = 0;
    } else {
      deltaY = 0;
    }

    if (allowX && !allowY && !deltaX) {
      deltaX = deltaY;
    }

    if (allowY && !allowX && !deltaY) {
      deltaY = deltaX;
    }

    if (Math.abs(deltaX) < 0.5 && Math.abs(deltaY) < 0.5) {
      return;
    }

    const currentOrTargetScrollLeft = this.horizontalWheelRaf === null
      ? position.scrollLeft
      : this.horizontalWheelTarget;
    const nextScrollLeft = allowX ? Math.max(
      0,
      Math.min(maxScrollLeft, currentOrTargetScrollLeft + deltaX),
    ) : position.scrollLeft;
    const nextScrollTop = allowY ? Math.max(
      0,
      Math.min(maxScrollTop, position.scrollTop + deltaY),
    ) : position.scrollTop;

    if (
      Math.abs(nextScrollLeft - position.scrollLeft) < 0.5 &&
      Math.abs(nextScrollTop - position.scrollTop) < 0.5
    ) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    if (allowY) {
      this.setScrollPosition({ scrollTop: nextScrollTop });
    }

    if (!allowX) {
      return;
    }

    if (this.wheelClassifier.isPhysicalWheel() && !allowY) {
      this.scrollHorizontalSmooth(nextScrollLeft);
    } else {
      this.scrollHorizontalNow(nextScrollLeft);
    }
  };

  private readonly handleScrollbarDragStart = (): void => {
    this.cancelHorizontalWheelAnimation();
    this.options.root.dataset.scrollbarActive = "true";
  };

  private readonly handleScrollbarDragEnd = (): void => {
    this.options.root.dataset.scrollbarActive = "false";
  };

  private readonly handleScrollbarScrollPositionChange = (
    orientation: ScrollbarOrientation,
    scrollPosition: number,
  ): void => {
    if (orientation === "y") {
      this.setScrollPosition({ scrollTop: scrollPosition });
      return;
    }

    this.scrollHorizontalNow(scrollPosition);
  };

  private scheduleMetricsUpdate = (): void => {
    if (this.metricsRaf !== null) {
      return;
    }

    const targetWindow = this.options.viewport.ownerDocument.defaultView ?? window;
    this.metricsRaf = scheduleAtNextAnimationFrame(targetWindow, () => {
      const scheduled = this.metricsRaf;
      this.metricsRaf = null;
      scheduled?.dispose();
      this.update();
    });
  };

  private scheduleThumbOffsetsUpdate(): void {
    if (this.thumbRaf !== null) {
      return;
    }

    const targetWindow = this.options.viewport.ownerDocument.defaultView ?? window;
    this.thumbRaf = scheduleAtNextAnimationFrame(targetWindow, () => {
      const scheduled = this.thumbRaf;
      this.thumbRaf = null;
      scheduled?.dispose();
      this.updateThumbOffsets();
    });
  }

  private updateThumbOffsets(): void {
    const dimensions = this.readScrollDimensions();
    const position = this.readScrollPosition();
    const allowY = this.axis === "y" || this.axis === "both";
    const allowX = this.axis === "x" || this.axis === "both";

    this.verticalScrollbar.update({
      enabled: allowY,
      scrollPosition: position.scrollTop,
      scrollSize: dimensions.scrollHeight,
      visibleSize: dimensions.clientHeight,
    });
    this.horizontalScrollbar.update({
      enabled: allowX,
      scrollPosition: position.scrollLeft,
      scrollSize: dimensions.scrollWidth,
      visibleSize: dimensions.clientWidth,
    });
  }

  private normalizeWheelDelta(event: WheelEvent, delta: number): number {
    if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) {
      return delta * WHEEL_LINE_DELTA_PX;
    }

    if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) {
      return delta * Math.max(1, this.readScrollDimensions().clientWidth);
    }

    return delta;
  }

  private cancelHorizontalWheelAnimation(): void {
    this.horizontalWheelRaf?.dispose();
    this.horizontalWheelRaf = null;
  }

  private scrollHorizontalNow(scrollLeft: number): void {
    this.cancelHorizontalWheelAnimation();
    this.horizontalWheelTarget = scrollLeft;
    this.setScrollPosition({ scrollLeft });
  }

  private scrollHorizontalSmooth(targetScrollLeft: number): void {
    this.horizontalWheelTarget = targetScrollLeft;
    if (this.horizontalWheelRaf !== null) {
      return;
    }

    const tick = (): void => {
      if (this.disposed) {
        const scheduled = this.horizontalWheelRaf;
        this.horizontalWheelRaf = null;
        scheduled?.dispose();
        return;
      }

      const target = this.horizontalWheelTarget;
      const delta = target - this.readScrollPosition().scrollLeft;
      if (Math.abs(delta) <= HORIZONTAL_WHEEL_STOP_THRESHOLD_PX) {
        this.setScrollPosition({ scrollLeft: target });
        const scheduled = this.horizontalWheelRaf;
        this.horizontalWheelRaf = null;
        scheduled?.dispose();
        return;
      }

      this.setScrollPosition({
        scrollLeft: this.readScrollPosition().scrollLeft + delta * HORIZONTAL_WHEEL_SMOOTHING,
      });
      const targetWindow = this.options.viewport.ownerDocument.defaultView ?? window;
      const scheduled = this.horizontalWheelRaf;
      scheduled?.dispose();
      this.horizontalWheelRaf = scheduleAtNextAnimationFrame(targetWindow, tick);
    };

    const targetWindow = this.options.viewport.ownerDocument.defaultView ?? window;
    this.horizontalWheelRaf = scheduleAtNextAnimationFrame(targetWindow, tick);
  }

  private readScrollDimensions() {
    return this.options.getScrollDimensions?.() ?? getScrollDimensions(this.options.viewport);
  }

  private readScrollPosition() {
    return this.options.getScrollPosition?.() ?? getScrollPosition(this.options.viewport);
  }

  private emitScrollEvent(inSmoothScrolling: boolean): void {
    const previous = this.scrollState;
    const dimensions = this.readScrollDimensions();
    const position = this.readScrollPosition();
    const next = new ScrollState(
      false,
      dimensions.clientWidth,
      dimensions.scrollWidth,
      position.scrollLeft,
      dimensions.clientHeight,
      dimensions.scrollHeight,
      position.scrollTop,
    );

    this.scrollState = next;
    if (!next.equals(previous)) {
      this.onScroll?.(next.createScrollEvent(previous, inSmoothScrolling));
    }
  }
}

export class Scrollbar {
  public readonly element: HTMLDivElement;
  public readonly viewport: HTMLDivElement;

  private readonly scrollableElement: ScrollableElement;

  public constructor(options: ScrollbarOptions = {}) {
    this.element = document.createElement("div");
    this.viewport = document.createElement("div");
    this.element.append(this.viewport);

    this.applyOptions(options);
    this.scrollableElement = new ScrollableElement({
      axis: options.axis ?? "y",
      observeContentMutations: options.observeContentMutations ?? true,
      observeResize: options.observeResize ?? true,
      horizontalScrollbarVisibility: options.horizontalScrollbarVisibility,
      onScroll: options.onScroll,
      root: this.element,
      verticalScrollbarVisibility: options.verticalScrollbarVisibility,
      viewport: this.viewport,
    });
  }

  public update(options: ScrollbarOptions = {}): void {
    this.applyOptions(options);
    this.scrollableElement.setOptions({
      axis: options.axis ?? "y",
      observeContentMutations: options.observeContentMutations ?? true,
      observeResize: options.observeResize ?? true,
      horizontalScrollbarVisibility: options.horizontalScrollbarVisibility,
      onScroll: options.onScroll,
      verticalScrollbarVisibility: options.verticalScrollbarVisibility,
    });
    this.scrollableElement.update();
  }

  public layout(): void {
    this.scrollableElement.update();
  }

  public getScrollDimensions(): ScrollbarScrollDimensions {
    return this.scrollableElement.getScrollDimensions();
  }

  public getScrollPosition(): ScrollbarScrollPosition {
    return this.scrollableElement.getScrollPosition();
  }

  public setScrollPosition(position: Partial<ScrollbarScrollPosition>): void {
    this.scrollableElement.setScrollPosition(position);
  }

  public dispose(): void {
    this.scrollableElement.dispose();
  }

  private applyOptions({
    axis = "y",
    className = "",
    viewportClassName = "",
  }: ScrollbarOptions): void {
    this.element.className = className ? `scrollArea ${className}` : "scrollArea";
    this.viewport.className = viewportClassName
      ? `scrollAreaViewport ${viewportClassName}`
      : "scrollAreaViewport";
    this.viewport.dataset.axis = axis;
  }
}

export default Scrollbar;
