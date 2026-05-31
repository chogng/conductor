import { DisposableResizeObserver, getWindow } from "src/cs/base/browser/dom";
import { DisposableStore, type IDisposable } from "src/cs/base/common/lifecycle";
import {
  getGridViewClassName,
  getGridViewItemClassName,
  getGridViewStyle,
} from "src/cs/base/browser/ui/gridview/gridview";
import Sash, { type SashDragEvent } from "src/cs/base/browser/ui/sash/sash";
import {
  areSplitViewSizesEqual,
  getSplitViewClassName,
  normalizeSplitViewSizes,
  resizeAdjacentSplitViewPanes,
  SPLIT_VIEW_SASH_SIZE,
  type SplitViewOrientation,
  type SplitViewPaneLayout,
  type SplitViewResizeEvent,
} from "src/cs/base/browser/ui/splitview/splitview";
import { cx } from "src/utils/cx";

export type SplitViewPane = SplitViewPaneLayout & {
  readonly className?: string;
  readonly id: string;
};

export type SplitViewWidgetOptions = {
  readonly className?: string;
  readonly gap?: number;
  readonly onDidResize?: (event: SplitViewResizeEvent) => void;
  readonly onDidResizeEnd?: (event: SplitViewResizeEvent) => void;
  readonly orientation?: SplitViewOrientation;
  readonly panes: readonly SplitViewPane[];
  readonly style?: Record<string, string | number | undefined>;
};

type DragState = {
  readonly paneIndex: number;
  lastSizes?: readonly number[];
  readonly sizes: readonly number[];
};

export class SplitViewWidget implements IDisposable {
  public readonly element: HTMLDivElement;
  private readonly gridElement: HTMLDivElement;
  private readonly store = new DisposableStore();
  private readonly paneElements = new Map<string, HTMLDivElement>();
  private readonly sashItems: Sash[] = [];
  private containerSize = 0;
  private dragState: DragState | null = null;
  private options: SplitViewWidgetOptions;
  private resizingPaneIndex: number | null = null;
  private sizes: readonly number[] = [];

  public constructor(options: SplitViewWidgetOptions) {
    this.options = options;
    this.element = document.createElement("div");
    this.gridElement = document.createElement("div");
    this.element.append(this.gridElement);
    this.store.add(new DisposableResizeObserver(getWindow(this.element), () => this.updateContainerSize()).observe(this.element));
    this.update(options);
  }

  public getPaneElement(id: string): HTMLDivElement | undefined {
    return this.paneElements.get(id);
  }

  public update(options: SplitViewWidgetOptions): void {
    this.options = options;
    this.applyRoot();
    this.renderPanes();
    this.updateContainerSize();
    this.normalizeSizes();
    this.layout();
  }

  public dispose(): void {
    for (const sash of this.sashItems) {
      sash.dispose();
    }
    this.sashItems.length = 0;
    this.store.dispose();
  }

  private applyRoot(): void {
    const { className = "", orientation = "horizontal", style } = this.options;
    this.element.className = getSplitViewClassName(className);
    this.element.dataset.orientation = orientation;
    this.element.dataset.resizing = this.resizingPaneIndex === null ? "false" : "true";
    this.element.removeAttribute("style");
    if (style) {
      Object.assign(this.element.style, style);
    }
    this.gridElement.className = getGridViewClassName("ui-split-view__grid");
    this.gridElement.dataset.orientation = orientation;
  }

  private renderPanes(): void {
    const nextIds = new Set(this.options.panes.map((pane) => pane.id));
    for (const [id, element] of this.paneElements) {
      if (!nextIds.has(id)) {
        element.remove();
        this.paneElements.delete(id);
      }
    }

    for (const pane of this.options.panes) {
      let paneElement = this.paneElements.get(pane.id);
      if (!paneElement) {
        paneElement = document.createElement("div");
        this.paneElements.set(pane.id, paneElement);
      }
      paneElement.className = getGridViewItemClassName(cx("ui-split-view__pane", pane.className));
      this.gridElement.append(paneElement);
    }
  }

  private updateContainerSize(): void {
    const orientation = this.options.orientation ?? "horizontal";
    this.containerSize = orientation === "horizontal"
      ? this.element.clientWidth
      : this.element.clientHeight;
  }

  private normalizeSizes(): void {
    const { gap = 0, panes } = this.options;
    const availableSize = Math.max(0, this.containerSize - Math.max(0, panes.length - 1) * gap);
    const nextSizes = normalizeSplitViewSizes(panes, this.sizes, availableSize);
    if (!areSplitViewSizesEqual(this.sizes, nextSizes)) {
      this.sizes = nextSizes;
    }
  }

  private layout(): void {
    const { gap = 0, orientation = "horizontal", panes } = this.options;
    Object.assign(this.gridElement.style, getGridViewStyle({ gap, orientation, sizes: this.sizes }));
    this.clearSashes();

    let offset = 0;
    for (let index = 0; index < this.sizes.length - 1; index++) {
      offset += this.sizes[index];
      const sashOffset = offset + gap * index + gap / 2;
      const style = orientation === "horizontal"
        ? { left: `${sashOffset - SPLIT_VIEW_SASH_SIZE / 2}px` }
        : { top: `${sashOffset - SPLIT_VIEW_SASH_SIZE / 2}px` };
      const sash = new Sash({
        active: this.resizingPaneIndex === index,
        className: "ui-split-view__sash",
        orientation: orientation === "horizontal" ? "vertical" : "horizontal",
        style,
        onDidStart: () => this.startResize(index),
        onDidChange: (event) => this.changeResize(event),
        onDidEnd: () => this.endResize(),
      });
      this.sashItems.push(sash);
      this.element.append(sash.element);
    }

    this.element.dataset.resizing = this.resizingPaneIndex === null ? "false" : "true";
    if (panes.length === 0) {
      this.gridElement.replaceChildren();
    }
  }

  private clearSashes(): void {
    for (const sash of this.sashItems) {
      sash.element.remove();
      sash.dispose();
    }
    this.sashItems.length = 0;
  }

  private startResize(paneIndex: number): void {
    this.dragState = {
      paneIndex,
      sizes: this.sizes,
    };
    this.resizingPaneIndex = paneIndex;
    this.layout();
  }

  private changeResize(event: SashDragEvent): void {
    const dragState = this.dragState;
    if (!dragState) {
      return;
    }

    const delta = (this.options.orientation ?? "horizontal") === "horizontal" ? event.deltaX : event.deltaY;
    const nextSizes = resizeAdjacentSplitViewPanes(this.options.panes, dragState.sizes, dragState.paneIndex, delta);
    dragState.lastSizes = nextSizes;
    this.sizes = nextSizes;
    this.layout();
    this.options.onDidResize?.({
      paneIndex: dragState.paneIndex,
      sizes: nextSizes,
    });
  }

  private endResize(): void {
    const dragState = this.dragState;
    if (dragState?.lastSizes) {
      this.options.onDidResizeEnd?.({
        paneIndex: dragState.paneIndex,
        sizes: dragState.lastSizes,
      });
    }

    this.dragState = null;
    this.resizingPaneIndex = null;
    this.layout();
  }
}

export default SplitViewWidget;
