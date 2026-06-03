import { DisposableResizeObserver, getWindow } from "src/cs/base/browser/dom";
import { DisposableStore, type IDisposable } from "src/cs/base/common/lifecycle";
import {
  getGridViewClassName,
  getGridViewItemClassName,
  getGridViewStyle,
} from "src/cs/base/browser/ui/grid/gridview";
import Sash, {
  getGlobalSashSize,
  type SashDragEvent,
} from "src/cs/base/browser/ui/sash/sash";

import "src/cs/base/browser/ui/splitview/splitview.css";

export type SplitViewOrientation = "horizontal" | "vertical";

export type SplitViewPaneLayout = {
  readonly defaultSize?: number;
  readonly maxSize?: number;
  readonly minSize?: number;
  readonly size?: number;
};

export type SplitViewPane = SplitViewPaneLayout & {
  readonly className?: string;
  readonly id: string;
};

export type SplitViewOptions = {
  readonly className?: string;
  readonly gap?: number;
  readonly onDidResize?: (event: SplitViewResizeEvent) => void;
  readonly onDidResizeEnd?: (event: SplitViewResizeEvent) => void;
  readonly orientation?: SplitViewOrientation;
  readonly panes: readonly SplitViewPane[];
  readonly style?: Record<string, string | number | undefined>;
};

export type SplitViewResizeEvent = {
  readonly sizes: readonly number[];
  readonly paneIndex: number;
};

export const DEFAULT_PANE_MIN_SIZE = 0;

export const getSplitViewClassName = (className = ""): string =>
  className ? `ui-split-view ${className}` : "ui-split-view";

export const getSplitViewPaneClassName = (className = ""): string =>
  className ? `ui-split-view__pane ${className}` : "ui-split-view__pane";

export const getPaneMinSize = (pane: SplitViewPaneLayout): number =>
  Math.max(0, pane.minSize ?? DEFAULT_PANE_MIN_SIZE);

export const getPaneMaxSize = (pane: SplitViewPaneLayout): number =>
  Math.max(getPaneMinSize(pane), pane.maxSize ?? Number.POSITIVE_INFINITY);

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

const getNormalizeResizeOrder = (
  panes: readonly SplitViewPaneLayout[],
): number[] => {
  const flexibleIndexes: number[] = [];
  const fixedIndexes: number[] = [];

  for (let index = panes.length - 1; index >= 0; index -= 1) {
    const pane = panes[index];
    if (pane.size === undefined && pane.defaultSize === undefined) {
      flexibleIndexes.push(index);
    } else {
      fixedIndexes.push(index);
    }
  }

  return [...flexibleIndexes, ...fixedIndexes];
};

export const normalizeSplitViewSizes = (
  panes: readonly SplitViewPaneLayout[],
  previousSizes: readonly number[],
  availableSize: number,
): number[] => {
  if (!panes.length) {
    return [];
  }

  const fallbackSize = availableSize > 0 ? availableSize / panes.length : 0;
  const sizes = panes.map((pane, index) =>
    clamp(
      pane.size ?? previousSizes[index] ?? pane.defaultSize ?? fallbackSize,
      getPaneMinSize(pane),
      getPaneMaxSize(pane),
    ),
  );

  let delta = availableSize - sizes.reduce((sum, size) => sum + size, 0);
  if (Math.abs(delta) < 0.5) {
    return sizes;
  }

  const direction = delta > 0 ? 1 : -1;
  const resizeOrder = getNormalizeResizeOrder(panes);
  for (let pass = 0; pass < panes.length && Math.abs(delta) >= 0.5; pass += 1) {
    for (const index of resizeOrder) {
      if (Math.abs(delta) < 0.5) {
        break;
      }

      const pane = panes[index];
      const limit = direction > 0
        ? getPaneMaxSize(pane) - sizes[index]
        : sizes[index] - getPaneMinSize(pane);
      const change = direction * Math.min(Math.abs(delta), Math.max(0, limit));

      sizes[index] += change;
      delta -= change;
    }
  }

  return sizes;
};

export const resizeAdjacentSplitViewPanes = (
  panes: readonly SplitViewPaneLayout[],
  sizes: readonly number[],
  paneIndex: number,
  delta: number,
): number[] => {
  const nextSizes = [...sizes];
  const firstPane = panes[paneIndex];
  const secondPane = panes[paneIndex + 1];

  if (!firstPane || !secondPane) {
    return nextSizes;
  }

  const firstStart = nextSizes[paneIndex] ?? 0;
  const secondStart = nextSizes[paneIndex + 1] ?? 0;
  const firstTarget = clamp(
    firstStart + delta,
    getPaneMinSize(firstPane),
    getPaneMaxSize(firstPane),
  );
  const firstDelta = firstTarget - firstStart;
  const secondTarget = clamp(
    secondStart - firstDelta,
    getPaneMinSize(secondPane),
    getPaneMaxSize(secondPane),
  );
  const appliedDelta = secondStart - secondTarget;

  nextSizes[paneIndex] = clamp(
    firstStart + appliedDelta,
    getPaneMinSize(firstPane),
    getPaneMaxSize(firstPane),
  );
  nextSizes[paneIndex + 1] = secondTarget;

  return nextSizes;
};

export const areSplitViewSizesEqual = (
  left: readonly number[],
  right: readonly number[],
): boolean =>
  left.length === right.length &&
  left.every((value, index) => Math.abs(value - right[index]) < 0.5);

type DragState = {
  readonly paneIndex: number;
  lastSizes?: readonly number[];
  readonly sizes: readonly number[];
};

export class SplitView implements IDisposable {
  public readonly element: HTMLDivElement;
  private readonly viewportElement: HTMLDivElement;
  private readonly gridElement: HTMLDivElement;
  private readonly store = new DisposableStore();
  private readonly paneElements = new Map<string, HTMLDivElement>();
  private readonly sashItems: Sash[] = [];
  private containerSize = 0;
  private dragState: DragState | null = null;
  private options: SplitViewOptions;
  private resizingPaneIndex: number | null = null;
  private sizes: readonly number[] = [];
  private sashOrientation: SashDragOrientation | null = null;

  public constructor(options: SplitViewOptions) {
    this.options = options;
    this.element = document.createElement("div");
    this.viewportElement = document.createElement("div");
    this.gridElement = document.createElement("div");
    this.viewportElement.append(this.gridElement);
    this.element.append(this.viewportElement);
    this.store.add(
      new DisposableResizeObserver(getWindow(this.element), () => {
        this.updateContainerSize();
        this.normalizeSizes();
        this.layout();
      }).observe(this.element),
    );
    this.update(options);
  }

  public getPaneElement(id: string): HTMLDivElement | undefined {
    return this.paneElements.get(id);
  }

  public update(options: SplitViewOptions): void {
    this.options = options;
    this.applyRoot();
    this.renderPanes();
    this.updateContainerSize();
    this.normalizeSizes();
    this.layout();
  }

  public dispose(): void {
    this.clearSashes();
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
    this.viewportElement.className = "ui-split-view__viewport";
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
      paneElement.className = getGridViewItemClassName(getSplitViewPaneClassName(pane.className));
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
    this.layoutViewport();
    this.layoutSashes();

    this.element.dataset.resizing = this.resizingPaneIndex === null ? "false" : "true";
    if (panes.length === 0) {
      this.gridElement.replaceChildren();
    }
  }

  private layoutViewport(): void {
    const { gap = 0, orientation = "horizontal", panes } = this.options;
    const contentSize = this.sizes.reduce((sum, size) => sum + size, 0) +
      Math.max(0, panes.length - 1) * gap;
    const size = `${Math.max(0, contentSize)}px`;

    if (orientation === "horizontal") {
      this.gridElement.style.width = size;
      this.gridElement.style.height = "100%";
      return;
    }

    this.gridElement.style.width = "100%";
    this.gridElement.style.height = size;
  }

  private clearSashes(): void {
    for (const sash of this.sashItems) {
      sash.element.remove();
      sash.dispose();
    }
    this.sashItems.length = 0;
    this.sashOrientation = null;
  }

  private layoutSashes(): void {
    const { gap = 0, orientation = "horizontal" } = this.options;
    const sashOrientation = getSashOrientation(orientation);
    const sashCount = Math.max(0, this.sizes.length - 1);

    if (
      this.sashItems.length !== sashCount ||
      this.sashOrientation !== sashOrientation
    ) {
      this.clearSashes();
      this.sashOrientation = sashOrientation;
      for (let index = 0; index < sashCount; index += 1) {
        const sash = new Sash({
          className: "ui-split-view__sash",
          orientation: sashOrientation,
          onDidStart: () => this.startResize(index),
          onDidChange: (event) => this.changeResize(event),
          onDidEnd: () => this.endResize(),
        });
        this.sashItems.push(sash);
        this.element.append(sash.element);
      }
    }

    let offset = 0;
    for (let index = 0; index < this.sashItems.length; index += 1) {
      offset += this.sizes[index] ?? 0;
      const sashOffset = offset + gap * index + gap / 2;
      const sashSize = getGlobalSashSize();
      const style = orientation === "horizontal"
        ? { left: `${sashOffset - sashSize / 2}px` }
        : { top: `${sashOffset - sashSize / 2}px` };

      this.sashItems[index]?.update({
        active: this.resizingPaneIndex === index,
        className: "ui-split-view__sash",
        orientation: sashOrientation,
        style,
        onDidStart: () => this.startResize(index),
        onDidChange: (event) => this.changeResize(event),
        onDidEnd: () => this.endResize(),
      });
    }
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

export default SplitView;

type SashDragOrientation = "vertical" | "horizontal";

const getSashOrientation = (
  orientation: SplitViewOrientation,
): SashDragOrientation =>
  orientation === "horizontal" ? "vertical" : "horizontal";
