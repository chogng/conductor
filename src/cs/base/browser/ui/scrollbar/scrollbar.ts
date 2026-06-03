import { ScrollbarController } from "src/cs/base/browser/ui/scrollbar/scrollbarController";
import type { ScrollbarAxis } from "src/cs/base/browser/ui/scrollbar/scrollbarOptions";
import type { ScrollEvent } from "src/cs/base/common/scrollable";

export type ScrollbarOptions = {
  readonly axis?: ScrollbarAxis;
  readonly className?: string;
  readonly observeContentMutations?: boolean;
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
      onScroll: options.onScroll,
    });
    this.controller.update();
  }

  public layout(): void {
    this.controller.update();
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
