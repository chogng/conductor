import {
  addDisposableListener,
  DisposableResizeObserver,
  EventType,
  getDomRect,
  getScrollDimensions,
  getScrollPosition,
  observeMutations,
  scheduleAtNextAnimationFrame,
} from "src/cs/base/browser/dom";
import { StandardMouseEvent } from "src/cs/base/browser/mouseEvent";
import {
  DisposableStore,
  type IDisposable,
} from "src/cs/base/common/lifecycle";
import { ScrollState, type ScrollEvent } from "src/cs/base/common/scrollable";
import { ScrollbarAssembler } from "src/cs/base/browser/ui/scrollbar/scrollbarAssembler";
import type {
  ScrollbarAxis,
  ScrollbarControllerOptions,
  ScrollbarHandle,
  ScrollbarOrientation,
} from "src/cs/base/browser/ui/scrollbar/scrollbarOptions";
import { ScrollbarState } from "src/cs/base/browser/ui/scrollbar/scrollbarState";

import "src/cs/base/browser/ui/scrollbar/media/scrollbar.css";

const WHEEL_LINE_DELTA_PX = 40;
const HORIZONTAL_WHEEL_SMOOTHING = 0.24;
const HORIZONTAL_WHEEL_STOP_THRESHOLD_PX = 0.5;

type DragState = {
  readonly orientation: ScrollbarOrientation;
  readonly startPointer: number;
  readonly startScroll: number;
  readonly thumbSize: number;
};

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

export class ScrollbarController implements ScrollbarHandle {
  private readonly store = new DisposableStore();
  private readonly state = new ScrollbarState();
  private readonly assembler: ScrollbarAssembler;
  private readonly wheelClassifier = new WheelClassifier();
  private axis: ScrollbarAxis;
  private observeContentMutations: boolean;
  private observeResize: boolean;
  private handleMouseWheel: boolean;
  private onScroll?: (event: ScrollEvent) => void;
  private onScrollPositionChange?: ScrollbarControllerOptions["onScrollPositionChange"];
  private scrollState = new ScrollState(false, 0, 0, 0, 0, 0, 0);
  private metricsRaf: IDisposable | null = null;
  private thumbRaf: IDisposable | null = null;
  private horizontalWheelRaf: IDisposable | null = null;
  private horizontalWheelTarget = 0;
  private dragState: DragState | null = null;
  private disposed = false;

  constructor(private readonly options: ScrollbarControllerOptions) {
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

    this.assembler = this.store.add(new ScrollbarAssembler(this.options.root, {
      onThumbPointerDown: this.handleThumbPointerDown,
      onTrackPointerDown: this.handleTrackPointerDown,
    }));

    this.registerListeners();
    this.scheduleMetricsUpdate();
  }

  setOptions(options: Partial<Omit<ScrollbarControllerOptions, "root" | "viewport">>): void {
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

    this.scheduleMetricsUpdate();
  }

  update(): void {
    this.state.measure(this.readScrollDimensions(), this.axis);
    this.updateThumbOffsets();
  }

  updateScrollPosition(): void {
    this.updateThumbOffsets();
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
    this.store.add(addDisposableListener(
      targetWindow,
      EventType.MOUSE_MOVE,
      this.handleMouseMove,
    ));
    this.store.add(addDisposableListener(
      targetWindow,
      EventType.MOUSE_UP,
      this.handleMouseUp,
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

  private readonly handleMouseMove = (event: MouseEvent): void => {
    const drag = this.dragState;
    if (!drag) {
      return;
    }

    const mouseEvent = new StandardMouseEvent(window, event);
    const viewport = this.options.viewport;

    if (drag.orientation === "y") {
      const delta = mouseEvent.clientY - drag.startPointer;
      const { clientHeight, scrollHeight } = this.readScrollDimensions();
      const trackRange = Math.max(1, clientHeight - drag.thumbSize);
      const scrollRange = Math.max(1, scrollHeight - clientHeight);
      this.setScrollPosition({
        scrollTop: drag.startScroll + (delta * scrollRange) / trackRange,
      });
      return;
    }

    const delta = mouseEvent.clientX - drag.startPointer;
    const { clientWidth, scrollWidth } = this.readScrollDimensions();
    const trackRange = Math.max(1, clientWidth - drag.thumbSize);
    const scrollRange = Math.max(1, scrollWidth - clientWidth);
    this.scrollHorizontalNow(drag.startScroll + (delta * scrollRange) / trackRange);
  };

  private readonly handleMouseUp = (): void => {
    this.dragState = null;
    this.options.root.dataset.scrollbarActive = "false";
  };

  private readonly handleThumbPointerDown = (
    orientation: ScrollbarOrientation,
    event: MouseEvent,
  ): void => {
    event.preventDefault();
    event.stopPropagation();
    this.cancelHorizontalWheelAnimation();
    this.options.root.dataset.scrollbarActive = "true";

    const position = this.readScrollPosition();
    this.dragState = orientation === "y"
      ? {
        orientation,
        startPointer: event.clientY,
        startScroll: position.scrollTop,
        thumbSize: this.state.metrics.yThumbSize,
      }
      : {
        orientation,
        startPointer: event.clientX,
        startScroll: position.scrollLeft,
        thumbSize: this.state.metrics.xThumbSize,
      };
  };

  private readonly handleTrackPointerDown = (
    orientation: ScrollbarOrientation,
    event: MouseEvent,
  ): void => {
    if (event.target !== event.currentTarget) {
      return;
    }

    const viewport = this.options.viewport;
    const rect = getDomRect(event.currentTarget as HTMLElement);

    if (orientation === "y") {
      const thumbSize = this.state.metrics.yThumbSize;
      const clickOffset = event.clientY - rect.top;
      const { clientHeight, scrollHeight } = this.readScrollDimensions();
      const maxThumbTravel = Math.max(1, clientHeight - thumbSize);
      const ratio = Math.max(0, Math.min(1, (clickOffset - thumbSize / 2) / maxThumbTravel));
      this.setScrollPosition({
        scrollTop: ratio * Math.max(0, scrollHeight - clientHeight),
      });
      return;
    }

    const thumbSize = this.state.metrics.xThumbSize;
    const clickOffset = event.clientX - rect.left;
    const { clientWidth, scrollWidth } = this.readScrollDimensions();
    const maxThumbTravel = Math.max(1, clientWidth - thumbSize);
    const ratio = Math.max(0, Math.min(1, (clickOffset - thumbSize / 2) / maxThumbTravel));
    this.scrollHorizontalNow(ratio * Math.max(0, scrollWidth - clientWidth));
  };

  private scheduleMetricsUpdate = (): void => {
    if (this.metricsRaf !== null) {
      return;
    }

    const targetWindow = this.options.viewport.ownerDocument.defaultView ?? window;
    this.metricsRaf = scheduleAtNextAnimationFrame(targetWindow, () => {
      this.metricsRaf = null;
      this.update();
    });
  };

  private scheduleThumbOffsetsUpdate(): void {
    if (this.thumbRaf !== null) {
      return;
    }

    const targetWindow = this.options.viewport.ownerDocument.defaultView ?? window;
    this.thumbRaf = scheduleAtNextAnimationFrame(targetWindow, () => {
      this.thumbRaf = null;
      this.updateThumbOffsets();
    });
  }

  private updateThumbOffsets(): void {
    const dimensions = this.readScrollDimensions();
    const position = this.readScrollPosition();
    this.assembler.update(
      this.state.metrics,
      this.state.getThumbOffset(dimensions, position, "x"),
      this.state.getThumbOffset(dimensions, position, "y"),
    );
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
        this.horizontalWheelRaf = null;
        return;
      }

      const target = this.horizontalWheelTarget;
      const delta = target - this.readScrollPosition().scrollLeft;
      if (Math.abs(delta) <= HORIZONTAL_WHEEL_STOP_THRESHOLD_PX) {
        this.setScrollPosition({ scrollLeft: target });
        this.horizontalWheelRaf = null;
        return;
      }

      this.setScrollPosition({
        scrollLeft: this.readScrollPosition().scrollLeft + delta * HORIZONTAL_WHEEL_SMOOTHING,
      });
      const targetWindow = this.options.viewport.ownerDocument.defaultView ?? window;
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

  private setScrollPosition(position: { scrollLeft?: number; scrollTop?: number }): void {
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
