import { ScrollbarController } from "src/cs/base/browser/ui/scrollbar/scrollbarController";
import type {
  ScrollbarAxis,
  ScrollbarScrollDimensions,
  ScrollbarScrollPosition,
} from "src/cs/base/browser/ui/scrollbar/scrollbarOptions";
import type { ScrollEvent } from "src/cs/base/common/scrollable";

export type ScrollbarOptions = {
  readonly axis?: ScrollbarAxis;
  readonly className?: string;
  readonly observeContentMutations?: boolean;
  readonly observeResize?: boolean;
  readonly onScroll?: (event: ScrollEvent) => void;
  readonly viewportClassName?: string;
};

export class Scrollbar {
  public readonly element: HTMLDivElement;
  public readonly viewport: HTMLDivElement;

  private readonly controller: ScrollbarController;

  public constructor(options: ScrollbarOptions = {}) {
    this.element = document.createElement("div");
    this.viewport = document.createElement("div");
    this.element.append(this.viewport);

    this.applyOptions(options);
    this.controller = new ScrollbarController({
      axis: options.axis ?? "y",
      observeContentMutations: options.observeContentMutations ?? true,
      observeResize: options.observeResize ?? true,
      onScroll: options.onScroll,
      root: this.element,
      viewport: this.viewport,
    });
  }

  public update(options: ScrollbarOptions = {}): void {
    this.applyOptions(options);
    this.controller.setOptions({
      axis: options.axis ?? "y",
      observeContentMutations: options.observeContentMutations ?? true,
      observeResize: options.observeResize ?? true,
      onScroll: options.onScroll,
    });
    this.controller.update();
  }

  public layout(): void {
    this.controller.update();
  }

  public getScrollDimensions(): ScrollbarScrollDimensions {
    return this.controller.getScrollDimensions();
  }

  public getScrollPosition(): ScrollbarScrollPosition {
    return this.controller.getScrollPosition();
  }

  public setScrollPosition(position: Partial<ScrollbarScrollPosition>): void {
    this.controller.setScrollPosition(position);
  }

  public scrollBy(delta: Partial<ScrollbarScrollPosition>): boolean {
    const dimensions = this.getScrollDimensions();
    const position = this.getScrollPosition();
    const maxScrollLeft = Math.max(0, dimensions.scrollWidth - dimensions.clientWidth);
    const maxScrollTop = Math.max(0, dimensions.scrollHeight - dimensions.clientHeight);
    const nextScrollLeft = typeof delta.scrollLeft === "number"
      ? Math.max(0, Math.min(maxScrollLeft, position.scrollLeft + delta.scrollLeft))
      : position.scrollLeft;
    const nextScrollTop = typeof delta.scrollTop === "number"
      ? Math.max(0, Math.min(maxScrollTop, position.scrollTop + delta.scrollTop))
      : position.scrollTop;

    if (
      Math.abs(nextScrollLeft - position.scrollLeft) < 0.5 &&
      Math.abs(nextScrollTop - position.scrollTop) < 0.5
    ) {
      return false;
    }

    const nextPosition: Partial<ScrollbarScrollPosition> = {};
    if (Math.abs(nextScrollLeft - position.scrollLeft) >= 0.5) {
      nextPosition.scrollLeft = nextScrollLeft;
    }
    if (Math.abs(nextScrollTop - position.scrollTop) >= 0.5) {
      nextPosition.scrollTop = nextScrollTop;
    }

    this.setScrollPosition(nextPosition);
    return true;
  }

  public dispose(): void {
    this.controller.dispose();
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
