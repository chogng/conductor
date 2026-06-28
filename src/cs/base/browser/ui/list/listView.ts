import { addDisposableListener, DisposableResizeObserver, getClientArea } from "../../dom.js";
import { DataTransfers, type IDragAndDropData } from "../../dnd.js";
import { DomEmitter } from "../../event.js";
import { distinct, equals } from "../../../common/arrays.js";
import { disposableTimeout } from "../../../common/async.js";
import { BugIndicatingError } from "../../../common/errors.js";
import { Emitter, Event } from "../../../common/event.js";
import { Disposable, DisposableStore, type IDisposable } from "../../../common/lifecycle.js";
import { ScrollbarVisibility } from "../../../common/scrollable.js";
import type { ISpliceable } from "../../../common/sequence.js";
import { type IListBrowserMouseEvent, type IListDragAndDrop, type IListDragOverReaction, type IListEvent, type IListMouseEvent, type IListRenderer, type IListVirtualDelegate, ListDragOverEffectPosition, ListDragOverEffectType } from "./list.js";
import { RangeMap } from "../../../common/rangeMap.js";
import { RowCache, type IRow } from "../../rowCache.js";
import { ScrollableElement } from "../scrollbar/scrollableElement.js";
import type { ScrollbarVisibilityPolicy } from "../scrollbar/scrollbarVisibilityController.js";

import "./list.css";

export const enum ListViewTargetSector {
  TOP = 0,
  CENTER_TOP = 1,
  CENTER_BOTTOM = 2,
  BOTTOM = 3,
}

export type ListRenderRange = {
  readonly renderedEnd: number;
  readonly renderedStart: number;
  readonly visibleEnd: number;
  readonly visibleStart: number;
};

export type ListViewEmptyRenderer = (container: HTMLElement) => void;

export interface IListViewDragAndDrop<T> extends IListDragAndDrop<T> {
  getDragElements(element: T): T[];
}

export type CheckBoxAccessibleState = boolean | "mixed";

export interface IListViewAccessibilityProvider<T> {
  getSetSize?(element: T, index: number, listLength: number): number;
  getPosInSet?(element: T, index: number): number;
  getRole?(element: T): string | undefined;
  isChecked?(element: T): CheckBoxAccessibleState | undefined;
}

export interface IListViewOptionsUpdate {
  readonly paddingBottom?: number;
  readonly paddingTop?: number;
  readonly verticalScrollMode?: ScrollbarVisibility;
}

export interface IListViewOptions<T> extends IListViewOptionsUpdate {
  readonly accessibilityProvider?: IListViewAccessibilityProvider<T>;
  readonly className?: string;
  readonly delegate: IListVirtualDelegate<T>;
  readonly dnd?: IListViewDragAndDrop<T>;
  readonly empty?: (container: HTMLElement) => void;
  readonly disposeEmpty?: (container: HTMLElement) => void;
  readonly getKey: (item: T, index: number) => string;
  readonly gap?: number;
  readonly focusedKey?: string | null;
  readonly items: T[];
  readonly minVirtualCount?: number;
  readonly onKeyDown?: (event: KeyboardEvent) => void;
  readonly onDidFocus?: (event: IListEvent<T>) => void;
  readonly onDidRenderRange?: (range: ListRenderRange) => void;
  readonly onScroll?: (event: globalThis.Event) => void;
  readonly onSelect?: (
    item: T,
    index: number,
    event?: KeyboardEvent | MouseEvent,
  ) => void;
  readonly overscanRows?: number;
  readonly role?: string;
  readonly renderers: readonly IListRenderer<T, any>[];
  readonly rowRole?: string;
  readonly selectedKeys?: readonly string[];
  readonly selectedKey?: string | null;
  readonly supportDynamicHeights?: boolean;
  readonly viewportClassName?: string;
}

export interface IListView<T> extends ISpliceable<T>, IDisposable {
  readonly contentHeight: number;
  readonly domNode: HTMLElement;
  readonly length: number;
  readonly onContextMenu: Event<IListMouseEvent<T>>;
  readonly onDidScroll: Event<globalThis.Event>;
  readonly onMouseClick: Event<IListMouseEvent<T>>;
  readonly onMouseDblClick: Event<IListMouseEvent<T>>;
  readonly onMouseMiddleClick: Event<IListMouseEvent<T>>;
  readonly onMouseDown: Event<IListMouseEvent<T>>;
  readonly onMouseMove: Event<IListMouseEvent<T>>;
  readonly onMouseOut: Event<IListMouseEvent<T>>;
  readonly onMouseOver: Event<IListMouseEvent<T>>;
  readonly onMouseUp: Event<IListMouseEvent<T>>;
  scrollTop: number;
  domElement(index: number): HTMLElement | null;
  element(index: number): T;
  getViewport(): HTMLDivElement;
  getScrollTop(): number;
  indexOf(element: T): number;
}

type RowEntry<T> = {
  appliedFocused?: boolean;
  appliedIndex?: number;
  appliedKey?: string;
  appliedRole?: string;
  appliedRowHeight?: number;
  appliedTemplateId?: string;
  appliedRowTop?: number;
  appliedSelected?: boolean;
  index: number;
  item: T;
  key: string;
  renderedIndex?: number;
  renderedItem?: T;
  renderedTemplateId?: string;
  row: IRow<any, HTMLDivElement>;
};

type RenderRange = {
  readonly end: number;
  readonly start: number;
};

class ElementsDragAndDropData<T> implements IDragAndDropData {
  public constructor(private readonly elements: readonly T[]) {}

  public update(): void {}

  public getData(): readonly T[] {
    return this.elements;
  }
}

class NativeDragAndDropData implements IDragAndDropData {
  private readonly types: string[] = [];
  private readonly files: unknown[] = [];

  public update(dataTransfer: DataTransfer): void {
    this.types.splice(0, this.types.length, ...Array.from(dataTransfer.types ?? []));
    this.files.splice(0, this.files.length, ...Array.from(dataTransfer.files ?? []));
  }

  public getData(): { readonly files: readonly unknown[]; readonly types: readonly string[] } {
    return {
      files: this.files,
      types: this.types,
    };
  }
}

const StaticDND = {
  currentData: undefined as IDragAndDropData | undefined,
};

const DEFAULT_MIN_VIRTUAL_COUNT = 80;
const DEFAULT_GAP = 12;
const DEFAULT_OVERSCAN_ROWS = 6;

const classNames = (...names: Array<string | undefined>): string =>
  names
    .flatMap((name) => name?.split(/\s+/g) ?? [])
    .filter(Boolean)
    .join(" ");

const toScrollbarVisibilityPolicy = (
  visibility: ScrollbarVisibility | undefined,
): ScrollbarVisibilityPolicy => {
  switch (visibility) {
    case ScrollbarVisibility.Hidden:
      return "hidden";
    case ScrollbarVisibility.Visible:
      return "visible";
    case ScrollbarVisibility.Auto:
    default:
      return "auto";
  }
};

export class ListView<T> implements IListView<T> {
  private readonly disposables = new DisposableStore();
  private readonly onDidScrollEmitter = this.disposables.add(new Emitter<globalThis.Event>());
  private readonly host: HTMLElement;
  private readonly root: HTMLDivElement;
  private readonly viewport: HTMLDivElement;
  private readonly stage: HTMLDivElement;
  private readonly emptyContainer: HTMLDivElement;
  private readonly scrollableElement: ScrollableElement;
  private readonly rows = new Map<string, RowEntry<T>>();
  private readonly rowsByIndex = new Map<number, RowEntry<T>>();
  private readonly renderers = new Map<string, IListRenderer<T, any>>();
  private readonly rowCache = new RowCache<any, HTMLDivElement>(this.renderers, {
    createDomNode: templateId => {
      const domNode = document.createElement("div");
      domNode.className = "ui-list__row";
      domNode.setAttribute("data-template-id", templateId);
      return domNode;
    },
    removeDomNode: domNode => {
      domNode.classList.remove("scrolling");
      domNode.remove();
    },
  });
  private readonly rowEventListeners = new WeakSet<HTMLElement>();
  private props: IListViewOptions<T>;
  private viewportHeight = 0;
  private _scrollTop = 0;
  private scrollHeight = 0;
  private focusedIndex = -1;
  private pendingScrollTop = 0;
  private scrollRaf: number | null = null;
  private scrollbarContentHeight = -1;
  private rangeMap = new RangeMap();
  private lastRenderRange: RenderRange = { start: 0, end: 0 };
  private lastNotifiedRange: ListRenderRange | null = null;
  private shouldReconcileRows = true;
  private disposed = false;
  private currentDragData: IDragAndDropData | undefined;
  private currentDragFeedback: number[] | undefined;
  private currentDragFeedbackPosition: ListDragOverEffectPosition | undefined;
  private onDragLeaveTimeout: IDisposable = Disposable.None;
  private canDrop = false;

  public readonly onContextMenu!: Event<IListMouseEvent<T>>;
  public readonly onDidScroll: Event<globalThis.Event> = this.onDidScrollEmitter.event;
  public readonly onMouseClick!: Event<IListMouseEvent<T>>;
  public readonly onMouseDblClick!: Event<IListMouseEvent<T>>;
  public readonly onMouseMiddleClick!: Event<IListMouseEvent<T>>;
  public readonly onMouseDown!: Event<IListMouseEvent<T>>;
  public readonly onMouseMove!: Event<IListMouseEvent<T>>;
  public readonly onMouseOut!: Event<IListMouseEvent<T>>;
  public readonly onMouseOver!: Event<IListMouseEvent<T>>;
  public readonly onMouseUp!: Event<IListMouseEvent<T>>;

  constructor(host: HTMLElement, options: IListViewOptions<T>) {
    this.host = host;
    this.props = options;

    this.root = document.createElement("div");
    this.root.className = "ui-list";

    this.emptyContainer = document.createElement("div");
    this.emptyContainer.className = "ui-list__empty";
    this.emptyContainer.hidden = true;

    this.viewport = document.createElement("div");
    this.viewport.className = "ui-list__viewport";
    this.viewport.tabIndex = 0;

    this.stage = document.createElement("div");
    this.stage.className = "ui-list__stage";
    this.viewport.appendChild(this.stage);

    this.root.append(this.emptyContainer, this.viewport);
    this.host.appendChild(this.root);

    this.onMouseClick = this.createMouseEvent("click");
    this.onMouseDblClick = this.createMouseEvent("dblclick");
    this.onMouseMiddleClick = Event.filter(
      this.createMouseEvent("auxclick"),
      event => event.browserEvent.button === 1,
    );
    this.onMouseDown = this.createMouseEvent("mousedown");
    this.onMouseUp = this.createMouseEvent("mouseup");
    this.onMouseOver = this.createMouseEvent("mouseover");
    this.onMouseMove = this.createMouseEvent("mousemove");
    this.onMouseOut = this.createMouseEvent("mouseout");
    this.onContextMenu = this.createMouseEvent("contextmenu");

    this.scrollableElement = this.disposables.add(new ScrollableElement({
      axis: "y",
      getScrollDimensions: this.getScrollDimensions,
      getScrollPosition: this.getScrollPosition,
      handleMouseWheel: true,
      observeContentMutations: false,
      root: this.root,
      setScrollPosition: this.setScrollPosition,
      verticalScrollbarVisibility: toScrollbarVisibilityPolicy(options.verticalScrollMode),
      viewport: this.viewport,
    }));
    this.disposables.add(
      addDisposableListener(this.viewport, "keydown", this.onKeyDown),
    );
    this.disposables.add(
      addDisposableListener(this.viewport, "scroll", this.onNativeScroll, {
        passive: true,
      }),
    );
    this.disposables.add(addDisposableListener(this.viewport, "dragover", this.onDragOver));
    this.disposables.add(addDisposableListener(this.viewport, "dragleave", this.onDragLeave));
    this.disposables.add(addDisposableListener(this.viewport, "drop", this.onDrop));
    this.disposables.add(addDisposableListener(this.viewport, "dragend", this.onDragEnd));

    this.setRenderers(options.renderers);
    this.updateClasses();
    this.measureViewport();

    if (typeof ResizeObserver === "undefined") {
      const handleResize = () => this.measureViewport();
      this.disposables.add(
        addDisposableListener(window, "resize", handleResize),
      );
    } else {
      const observer = new DisposableResizeObserver(window, () => {
        this.measureViewport();
      });
      this.disposables.add(observer.observe(this.viewport));
      this.disposables.add(observer);
    }

    this.setProps(options);
  }

  setProps(nextProps: IListViewOptions<T>): void {
    if (this.props.verticalScrollMode !== nextProps.verticalScrollMode) {
      this.scrollableElement.setOptions({
        verticalScrollbarVisibility: toScrollbarVisibilityPolicy(nextProps.verticalScrollMode),
      });
    }
    if (this.props.dnd && this.props.dnd !== nextProps.dnd) {
      this.props.dnd.dispose();
      this.clearDragOverFeedback();
      this.currentDragData = undefined;
      this.canDrop = false;
    }
    if (this.props.items !== nextProps.items || this.props.getKey !== nextProps.getKey) {
      this.shouldReconcileRows = true;
    }
    if (this.props.renderers !== nextProps.renderers) {
      this.disposeAllRows();
      this.rowCache.dispose();
      this.setRenderers(nextProps.renderers);
      this.shouldReconcileRows = true;
    }

    this.props = nextProps;
    this.rangeMap = this.createRangeMap();
    this.updateClasses();
    this.syncFocusedIndex();
    this.render();
  }

  splice(start: number, deleteCount: number, elements: readonly T[] = []): T[] {
    const items = this.props.items.slice();
    const deleted = items.splice(start, deleteCount, ...elements);
    this.props = { ...this.props, items };
    this.rangeMap.splice(
      start,
      deleteCount,
      elements.map(item => ({
        size: this.getRowHeight(item) + this.gap,
      })),
    );
    this.updateFocusedIndexAfterSplice(start, deleteCount, elements.length);
    this.shouldReconcileRows = true;
    this.render();
    return deleted;
  }

  rerender(index?: number): void {
    if (typeof index === "number") {
      const entry = this.rowsByIndex.get(index);
      if (entry) {
        this.clearRenderedState(entry);
      }
    } else {
      for (const entry of this.rows.values()) {
        this.clearRenderedState(entry);
      }
    }

    this.render();
  }

  rerenderIndexes(indexes: readonly number[]): void {
    if (!indexes.length) {
      return;
    }

    for (const index of indexes) {
      const entry = this.rowsByIndex.get(index);
      if (entry) {
        this.clearRenderedState(entry);
      }
    }

    this.render();
  }

  focus(): void {
    this.viewport.focus();
  }

  public get contentHeight(): number {
    return this.scrollHeight;
  }

  public get domNode(): HTMLElement {
    return this.root;
  }

  public get length(): number {
    return this.props.items.length;
  }

  public get scrollTop(): number {
    return this._scrollTop;
  }

  public set scrollTop(scrollTop: number) {
    this.setScrollTop(scrollTop, "auto");
  }

  getViewport(): HTMLDivElement {
    return this.viewport;
  }

  public element(index: number): T {
    const element = this.props.items[index];
    if (typeof element === "undefined") {
      throw new RangeError(`ListView element index out of range: ${index}`);
    }

    return element;
  }

  public domElement(index: number): HTMLElement | null {
    return this.rowsByIndex.get(index)?.row.domNode ?? null;
  }

  public getScrollTop(): number {
    return this._scrollTop;
  }

  public indexOf(element: T): number {
    return this.props.items.indexOf(element);
  }

  layout(height?: number, width?: number): void {
    if (typeof height === "number" && Number.isFinite(height)) {
      this.root.style.height = `${Math.max(0, height)}px`;
    }
    if (typeof width === "number" && Number.isFinite(width)) {
      this.root.style.width = `${Math.max(0, width)}px`;
    }

    this.measureViewport();
  }

  scrollToStart(behavior: ScrollBehavior = "auto"): void {
    this.setScrollTop(0, behavior);
  }

  scrollToEnd(behavior: ScrollBehavior = "smooth"): void {
    this.setScrollTop(
      Math.max(0, this.scrollHeight - this.viewportHeight),
      behavior,
    );
  }

  scrollToIndex(index: number, behavior: ScrollBehavior = "smooth"): void {
    if (index < 0) return;

    const { items } = this.props;
    const item = items[index];
    if (typeof item === "undefined") {
      return;
    }

    const rowTop = this.getRowTop(index);
    const rowHeight = this.getRowHeightAt(index, item);
    const currentTop = this._scrollTop;
    const currentBottom = currentTop + this.viewportHeight;
    const rowBottom = rowTop + rowHeight;

    if (rowTop >= currentTop && rowBottom <= currentBottom) {
      return;
    }

    this.setScrollTop(Math.max(0, rowTop - rowHeight - this.gap), behavior);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;

    if (this.scrollRaf !== null) {
      window.cancelAnimationFrame(this.scrollRaf);
      this.scrollRaf = null;
    }

    if (!this.emptyContainer.hidden) {
      this.props.disposeEmpty?.(this.emptyContainer);
    }
    this.disposeAllRows();
    this.rowCache.dispose();
    this.props.dnd?.dispose();
    this.onDragLeaveTimeout.dispose();
    this.onDragLeaveTimeout = Disposable.None;
    this.disposables.dispose();
    this.root.remove();
  }

  private get gap(): number {
    return this.props.gap ?? DEFAULT_GAP;
  }

  private get overscanRows(): number {
    return this.props.overscanRows ?? DEFAULT_OVERSCAN_ROWS;
  }

  private get minVirtualCount(): number {
    return this.props.minVirtualCount ?? DEFAULT_MIN_VIRTUAL_COUNT;
  }

  private updateClasses(): void {
    this.root.className = classNames("ui-list", "scrollArea", this.props.className);
    this.viewport.className = classNames(
      "ui-list__viewport",
      "scrollAreaViewport",
      this.props.viewportClassName,
    );
    this.viewport.dataset.axis = "y";
    this.viewport.dataset.scrollbarMode = "virtual";
    this.viewport.setAttribute("role", this.props.role ?? "listbox");
  }

  private measureViewport(): void {
    this.viewportHeight = this.viewport.isConnected
      ? getClientArea(this.viewport).height
      : 0;
    this.scrollbarContentHeight = -1;
    this.render();
  }

  private syncFocusedIndex(): void {
    const { focusedKey, items, selectedKey, getKey } = this.props;

    if (!items.length) {
      this.focusedIndex = -1;
      return;
    }

    const key = typeof focusedKey === "string" ? focusedKey : selectedKey;

    if (key) {
      const nextIndex = items.findIndex(
        (item, index) => getKey(item, index) === key,
      );
      if (nextIndex >= 0) {
        this.focusedIndex = nextIndex;
        this.scrollToIndex(nextIndex, "auto");
      } else if (this.focusedIndex >= items.length) {
        this.focusedIndex = items.length - 1;
      }
      return;
    }

    if (this.focusedIndex >= items.length) {
      this.focusedIndex = items.length - 1;
    }
  }

  private updateFocusedIndexAfterSplice(
    start: number,
    deleteCount: number,
    insertCount: number,
  ): void {
    if (this.focusedIndex < start) {
      return;
    }

    if (this.focusedIndex < start + deleteCount) {
      this.focusedIndex = this.props.items.length
        ? Math.min(start, this.props.items.length - 1)
        : -1;
      return;
    }

    this.focusedIndex += insertCount - deleteCount;
    if (this.focusedIndex >= this.props.items.length) {
      this.focusedIndex = this.props.items.length - 1;
    }
  }

  private clearRenderedState(entry: RowEntry<T>): void {
    entry.renderedIndex = undefined;
    entry.renderedItem = undefined;
    entry.renderedTemplateId = undefined;
  }

  private scheduleScrollTop(nextScrollTop: number): void {
    this.pendingScrollTop = this.clampScrollTop(nextScrollTop);

    if (this.scrollRaf !== null) {
      return;
    }

    this.scrollRaf = window.requestAnimationFrame(() => {
      this.scrollRaf = null;
      if (this._scrollTop !== this.pendingScrollTop) {
        this._scrollTop = this.pendingScrollTop;
        this.render();
        this.scrollableElement.updateScrollPosition();
        const scrollEvent = new CustomEvent("scroll", {
          detail: {
            clientHeight: this.viewportHeight,
            scrollHeight: this.scrollHeight,
            scrollTop: this._scrollTop,
          },
        });
        this.onDidScrollEmitter.fire(scrollEvent);
        this.props.onScroll?.(scrollEvent);
      }
    });
  }

  private onKeyDown = (event: KeyboardEvent): void => {
    const { items, onDidFocus, onKeyDown, onSelect } = this.props;

    if (!onDidFocus && !onSelect) {
      onKeyDown?.(event);
      return;
    }

    if (!items.length) {
      onKeyDown?.(event);
      return;
    }

    let nextIndex = this.focusedIndex;

    if (event.key === "ArrowDown") {
      nextIndex = Math.min(items.length - 1, Math.max(0, this.focusedIndex) + 1);
    } else if (event.key === "ArrowUp") {
      nextIndex = Math.max(0, Math.max(0, this.focusedIndex) - 1);
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = items.length - 1;
    } else if (event.key === "PageDown") {
      nextIndex = this.findPageIndex(Math.max(0, this.focusedIndex), 1);
    } else if (event.key === "PageUp") {
      nextIndex = this.findPageIndex(Math.max(0, this.focusedIndex), -1);
    } else if (event.key === "Enter" || event.key === " ") {
      if (this.focusedIndex >= 0) {
        const item = items[this.focusedIndex];
        if (typeof item !== "undefined") {
          event.preventDefault();
          onSelect?.(item, this.focusedIndex, event);
          return;
        }
      }
    } else {
      onKeyDown?.(event);
      return;
    }

    if (nextIndex !== this.focusedIndex) {
      event.preventDefault();
      this.setFocusedIndex(nextIndex, event);
      this.scrollToIndex(nextIndex);
      this.render();
    }
  };

  private readonly onNativeScroll = (): void => {
    const scrollTop = this.viewport.scrollTop;
    if (scrollTop === 0) {
      return;
    }

    this.viewport.scrollTop = 0;
    this.setScrollTop(this._scrollTop + scrollTop, "auto");
  };

  private render(): void {
    if (this.disposed) return;

    const { items, empty, disposeEmpty, rowRole, selectedKey, selectedKeys, getKey } =
      this.props;
    const selectedKeySet = selectedKeys ? new Set(selectedKeys) : undefined;

    if (!items.length) {
      this.viewport.hidden = true;
      this.emptyContainer.hidden = false;
      this.stage.style.height = "0px";
      this.stage.style.top = "0px";
      this.scrollHeight = 0;
      this._scrollTop = 0;
      this.disposeAllRows();
      this.lastRenderRange = { start: 0, end: 0 };
      this.notifyRenderRange({
        renderedEnd: 0,
        renderedStart: 0,
        visibleEnd: 0,
        visibleStart: 0,
      });
      empty?.(this.emptyContainer);
      this.updateScrollbarMetrics(0);
      return;
    }

    if (this.emptyContainer.hidden === false) {
      disposeEmpty?.(this.emptyContainer);
    }

    this.emptyContainer.hidden = true;
    this.viewport.hidden = false;
    this.viewportHeight = getClientArea(this.viewport).height;

    const totalHeight = this.getContentHeight();
    this.scrollHeight = totalHeight;
    this._scrollTop = this.clampScrollTop(this._scrollTop);
    const virtualized = items.length >= this.minVirtualCount;
    const visibleStartIndex = virtualized
      ? this.findIndexAtOffset(this._scrollTop)
      : 0;
    const visibleEndIndex = virtualized
      ? Math.min(items.length, this.findIndexAfterOffset(this._scrollTop + this.viewportHeight))
      : items.length;
    const startIndex = virtualized
      ? Math.max(0, visibleStartIndex - this.overscanRows)
      : 0;
    const endIndex = virtualized
      ? Math.min(items.length, visibleEndIndex + this.overscanRows)
      : items.length;

    this.stage.style.height = `${totalHeight}px`;
    this.stage.style.top = `${-this._scrollTop}px`;
    this.updateScrollbarMetrics(totalHeight);

    this.rowCache.transact(() => {
      const nextRenderRange = { start: startIndex, end: endIndex };
      if (this.shouldReconcileRows) {
        this.releaseInvisibleRows(nextRenderRange);
      } else {
        for (const range of this.getRangesToRemove(this.lastRenderRange, nextRenderRange)) {
          this.releaseRange(range);
        }
      }

      for (let index = startIndex; index < endIndex; index += 1) {
        const item = items[index];
        if (typeof item === "undefined") continue;

        const key = getKey(item, index);
        const templateId = this.getTemplateId(item);
        const entry = this.ensureEntry(index, item, key, templateId);

        entry.index = index;
        entry.item = item;

        const selected = selectedKeySet ? selectedKeySet.has(key) : selectedKey === key;
        const focused = index === this.focusedIndex;
        this.updateRowShellIfNeeded(entry, {
          focused,
          index,
          key,
          rowHeight: this.getRowHeightAt(index, item),
          rowRole: rowRole ?? "option",
          rowTop: this.getRowTop(index),
          selected,
          templateId,
        });

        this.renderRowItemIfNeeded(entry, {
          index,
          item,
          rowHeight: this.getRowHeightAt(index, item),
          templateId,
        });
      }

      this.lastRenderRange = nextRenderRange;
      this.shouldReconcileRows = false;
    });

    this.notifyRenderRange({
      renderedEnd: endIndex,
      renderedStart: startIndex,
      visibleEnd: visibleEndIndex,
      visibleStart: visibleStartIndex,
    });
  }

  private notifyRenderRange(range: ListRenderRange): void {
    if (
      this.lastNotifiedRange &&
      this.lastNotifiedRange.renderedEnd === range.renderedEnd &&
      this.lastNotifiedRange.renderedStart === range.renderedStart &&
      this.lastNotifiedRange.visibleEnd === range.visibleEnd &&
      this.lastNotifiedRange.visibleStart === range.visibleStart
    ) {
      return;
    }

    this.lastNotifiedRange = range;
    this.props.onDidRenderRange?.(range);
  }

  private updateScrollbarMetrics(contentHeight: number): void {
    if (this.scrollbarContentHeight === contentHeight) {
      return;
    }

    this.scrollbarContentHeight = contentHeight;
    this.scrollableElement.update();
  }

  private readonly getScrollDimensions = () => ({
    clientHeight: this.viewportHeight,
    clientWidth: this.viewport.clientWidth,
    scrollHeight: this.scrollHeight,
    scrollWidth: this.viewport.clientWidth,
  });

  private readonly getScrollPosition = () => ({
    scrollLeft: 0,
    scrollTop: this._scrollTop,
  });

  private readonly setScrollPosition = (position: {
    scrollLeft?: number;
    scrollTop?: number;
  }): void => {
    if (typeof position.scrollTop === "number") {
      this.setScrollTop(position.scrollTop, "auto");
    }
  };

  private setScrollTop(scrollTop: number, _behavior: ScrollBehavior): void {
    const nextScrollTop = this.clampScrollTop(scrollTop);
    this.scheduleScrollTop(nextScrollTop);
  }

  private clampScrollTop(scrollTop: number): number {
    return Math.max(0, Math.min(scrollTop, Math.max(0, this.scrollHeight - this.viewportHeight)));
  }

  private getRowHeight(item: T): number {
    const dynamicHeight = this.getDynamicHeight(item);
    const resolvedHeight = Number(dynamicHeight ?? this.props.delegate.getHeight(item));
    return Number.isFinite(resolvedHeight) && resolvedHeight > 0 ? resolvedHeight : 32;
  }

  private getDynamicHeight(item: T): number | null {
    if (this.props.supportDynamicHeights === false) {
      return null;
    }

    if (this.props.delegate.hasDynamicHeight && !this.props.delegate.hasDynamicHeight(item)) {
      return null;
    }

    const dynamicHeight = this.props.delegate.getDynamicHeight?.(item);
    return typeof dynamicHeight === "number" && dynamicHeight > 0 ? dynamicHeight : null;
  }

  private getTemplateId(item: T): string {
    return this.props.delegate.getTemplateId(item);
  }

  private getRowHeightAt(index: number, item?: T): number {
    const nextTop = this.rangeMap.positionAt(index + 1);
    const top = this.rangeMap.positionAt(index);
    if (top >= 0 && nextTop >= 0) {
      return Math.max(0, nextTop - top - this.gap);
    }

    return typeof item === "undefined" ? 32 : this.getRowHeight(item);
  }

  private getRowTop(index: number): number {
    return Math.max(0, this.rangeMap.positionAt(index));
  }

  private getContentHeight(): number {
    if (!this.props.items.length) {
      return 0;
    }

    return Math.max(0, this.rangeMap.size - this.gap + (this.props.paddingBottom ?? 0));
  }

  private createRangeMap(): RangeMap {
    const rangeMap = new RangeMap(this.props.paddingTop ?? 0);
    rangeMap.splice(
      0,
      0,
      this.props.items.map(item => ({
        size: this.getRowHeight(item) + this.gap,
      })),
    );
    return rangeMap;
  }

  private findIndexAtOffset(offset: number): number {
    if (!this.rangeMap.count) {
      return 0;
    }

    return Math.max(0, Math.min(this.rangeMap.indexAt(offset), this.props.items.length - 1));
  }

  private findIndexAfterOffset(offset: number): number {
    if (!this.rangeMap.count) {
      return 0;
    }

    return this.rangeMap.indexAfter(offset);
  }

  private findPageIndex(startIndex: number, direction: 1 | -1): number {
    const targetOffset = direction > 0
      ? this.getRowTop(startIndex) + this.viewportHeight
      : this.getRowTop(startIndex) - this.viewportHeight;
    const boundedOffset = Math.max(0, Math.min(targetOffset, this.getContentHeight()));
    return direction > 0
      ? Math.min(this.props.items.length - 1, this.findIndexAtOffset(boundedOffset))
      : Math.max(0, this.findIndexAtOffset(boundedOffset));
  }

  private renderRowItemIfNeeded(
    entry: RowEntry<T>,
    options: {
      index: number;
      item: T;
      rowHeight: number;
      templateId: string;
    },
  ): void {
    const shouldRender =
      entry.renderedIndex !== options.index ||
      entry.renderedItem !== options.item ||
      entry.renderedTemplateId !== options.templateId;

    if (!shouldRender) {
      return;
    }

    const renderer = this.getRenderer(options.templateId);
    renderer.renderElement(
      options.item,
      options.index,
      entry.row.templateData,
      { height: options.rowHeight },
    );

    entry.renderedIndex = options.index;
    entry.renderedItem = options.item;
    entry.renderedTemplateId = options.templateId;
  }

  private updateRowShellIfNeeded(
    entry: RowEntry<T>,
    options: {
      focused: boolean;
      index: number;
      key: string;
      rowHeight: number;
      rowRole: string;
      rowTop: number;
      selected: boolean;
      templateId: string;
    },
  ): void {
    const domNode = entry.row.domNode;

    if (entry.appliedIndex !== options.index) {
      domNode.setAttribute("data-index", String(options.index));
      entry.appliedIndex = options.index;
    }

    if (entry.appliedRowTop !== options.rowTop) {
      domNode.style.top = `${options.rowTop}px`;
      entry.appliedRowTop = options.rowTop;
    }

    if (entry.appliedRowHeight !== options.rowHeight) {
      domNode.style.height = `${options.rowHeight}px`;
      entry.appliedRowHeight = options.rowHeight;
    }

    if (entry.appliedKey !== options.key) {
      domNode.setAttribute("data-key", options.key);
      entry.appliedKey = options.key;
    }

    if (entry.appliedTemplateId !== options.templateId) {
      domNode.setAttribute("data-template-id", options.templateId);
      entry.appliedTemplateId = options.templateId;
    }

    if (entry.appliedRole !== options.rowRole) {
      domNode.setAttribute("role", options.rowRole);
      entry.appliedRole = options.rowRole;
    }

    if (entry.appliedSelected !== options.selected) {
      if (options.selected) {
        domNode.setAttribute("aria-selected", "true");
      } else {
        domNode.removeAttribute("aria-selected");
      }

      domNode.classList.toggle("ui-list__row--selected", options.selected);
      entry.appliedSelected = options.selected;
    }

    if (entry.appliedFocused !== options.focused) {
      domNode.classList.toggle("ui-list__row--focused", options.focused);
      entry.appliedFocused = options.focused;
    }

    const dragURI = this.props.dnd?.getDragURI(entry.item) ?? null;
    if (dragURI) {
      domNode.draggable = true;
      domNode.dataset.dragUri = dragURI;
    } else {
      domNode.draggable = false;
      delete domNode.dataset.dragUri;
    }
  }

  private ensureRowEventListener(container: HTMLElement): void {
    if (this.rowEventListeners.has(container)) {
      return;
    }
    this.rowEventListeners.add(container);
    container.addEventListener("click", (event) => {
      if (!this.props.onDidFocus && !this.props.onSelect) {
        return;
      }

      const nextIndex = Number(container.dataset.index);
      const nextItem = this.props.items[nextIndex];
      if (Number.isNaN(nextIndex) || typeof nextItem === "undefined") return;

      this.setFocusedIndex(nextIndex, event);
      this.props.onSelect?.(nextItem, nextIndex, event);
      this.render();
    });
    container.addEventListener("dragstart", (event) => {
      const nextIndex = Number(container.dataset.index);
      const nextItem = this.props.items[nextIndex];
      const dragURI = container.dataset.dragUri;
      if (Number.isNaN(nextIndex) || typeof nextItem === "undefined" || !dragURI) {
        event.preventDefault();
        return;
      }

      this.onDragStart(nextItem, dragURI, event);
    });
  }

  private onDragStart(element: T, uri: string, event: DragEvent): void {
    const { dataTransfer } = event;
    const { dnd } = this.props;
    if (!dataTransfer || !dnd) {
      return;
    }

    const elements = dnd.getDragElements(element);
    dataTransfer.effectAllowed = "copyMove";
    dataTransfer.setData(DataTransfers.TEXT, uri);

    this.root.classList.add("dragging");
    this.currentDragData = new ElementsDragAndDropData(elements);
    StaticDND.currentData = this.currentDragData;
    dnd.onDragStart?.(this.currentDragData, event);
  }

  private readonly onDragOver = (event: DragEvent): void => {
    event.preventDefault();
    this.onDragLeaveTimeout.dispose();
    this.onDragLeaveTimeout = Disposable.None;

    const { dnd } = this.props;
    const { dataTransfer } = event;
    if (!dnd || !dataTransfer) {
      return;
    }

    if (!this.currentDragData) {
      this.currentDragData = StaticDND.currentData ?? new NativeDragAndDropData();
    }
    this.currentDragData.update(dataTransfer);

    const target = this.getDragTarget(event);
    const result = dnd.onDragOver(
      this.currentDragData,
      target.element,
      target.index,
      target.sector,
      event,
    );
    const reaction = this.toDragOverReaction(result);
    this.canDrop = reaction.accept;

    if (!reaction.accept) {
      this.clearDragOverFeedback();
      return;
    }

    dataTransfer.dropEffect = reaction.effect?.type === ListDragOverEffectType.Copy
      ? "copy"
      : "move";
    this.updateDragOverFeedback(reaction, target.index);
  };

  private readonly onDragLeave = (event: DragEvent): void => {
    const target = this.getDragTarget(event);
    this.onDragLeaveTimeout.dispose();
    this.onDragLeaveTimeout = disposableTimeout(() => {
      this.onDragLeaveTimeout = Disposable.None;
      this.clearDragOverFeedback();
    }, 100, this.disposables);

    if (this.currentDragData) {
      this.props.dnd?.onDragLeave?.(
        this.currentDragData,
        target.element,
        target.index,
        event,
      );
    }
  };

  private readonly onDrop = (event: DragEvent): void => {
    event.preventDefault();

    const { dnd } = this.props;
    if (!this.canDrop || !dnd || !this.currentDragData) {
      this.clearDragState();
      return;
    }

    if (event.dataTransfer) {
      this.currentDragData.update(event.dataTransfer);
    }

    const target = this.getDragTarget(event);
    dnd.drop(this.currentDragData, target.element, target.index, target.sector, event);
    this.clearDragState();
  };

  private readonly onDragEnd = (event: DragEvent): void => {
    this.props.dnd?.onDragEnd?.(event);
    this.clearDragState();
  };

  private createMouseEvent(
    type: "auxclick" | "click" | "contextmenu" | "dblclick" | "mousedown" | "mousemove" | "mouseout" | "mouseover" | "mouseup",
  ): Event<IListMouseEvent<T>> {
    const emitter = this.disposables.add(new DomEmitter(this.root, type));
    return Event.map(emitter.event, event => this.toMouseEvent(event));
  }

  private toMouseEvent(browserEvent: MouseEvent): IListMouseEvent<T> {
    const row = this.getRowElement(browserEvent.target);
    const index = row ? Number(row.dataset.index) : undefined;
    const resolvedIndex = typeof index === "number" && !Number.isNaN(index) ? index : undefined;
    const element = typeof resolvedIndex === "number" ? this.props.items[resolvedIndex] : undefined;

    return {
      browserEvent: browserEvent as IListBrowserMouseEvent,
      element,
      index: typeof element === "undefined" ? undefined : resolvedIndex,
    };
  }

  private clearDragState(): void {
    this.root.classList.remove("dragging");
    this.clearDragOverFeedback();
    this.currentDragData = undefined;
    StaticDND.currentData = undefined;
    this.onDragLeaveTimeout.dispose();
    this.onDragLeaveTimeout = Disposable.None;
    this.canDrop = false;
  }

  private updateDragOverFeedback(
    reaction: IListDragOverReaction,
    targetIndex: number | undefined,
  ): void {
    let position = reaction.effect?.position ?? ListDragOverEffectPosition.Over;
    const feedback = this.sanitizeDragFeedback(reaction.feedback ?? [
      typeof targetIndex === "number" ? targetIndex : -1,
    ]);

    if (feedback[0] !== -1) {
      if (feedback.length > 1 && position !== ListDragOverEffectPosition.Over) {
        throw new BugIndicatingError("Can't use multiple drag feedback items with before/after positioning.");
      }

      if (
        position === ListDragOverEffectPosition.After &&
        feedback[0] < this.props.items.length - 1
      ) {
        feedback[0] += 1;
        position = ListDragOverEffectPosition.Before;
      }
    }

    if (
      this.currentDragFeedbackPosition === position &&
      equals(this.currentDragFeedback, feedback)
    ) {
      return;
    }

    this.clearDragOverFeedback();
    this.currentDragFeedback = feedback;
    this.currentDragFeedbackPosition = position;

    if (feedback[0] === -1) {
      this.root.classList.add(position);
      this.stage.classList.add(position);
      return;
    }

    for (const index of feedback) {
      this.rowsByIndex.get(index)?.row.domNode.classList.add(position);
    }
  }

  private clearDragOverFeedback(): void {
    if (!this.currentDragFeedbackPosition) {
      return;
    }

    const position = this.currentDragFeedbackPosition;
    this.root.classList.remove(position);
    this.stage.classList.remove(position);

    for (const index of this.currentDragFeedback ?? []) {
      this.rowsByIndex.get(index)?.row.domNode.classList.remove(position);
    }

    this.currentDragFeedback = undefined;
    this.currentDragFeedbackPosition = undefined;
  }

  private sanitizeDragFeedback(feedback: readonly number[]): number[] {
    const sanitized = distinct(feedback)
      .filter(index => index >= -1 && index < this.props.items.length)
      .sort((first, second) => first - second);

    return sanitized[0] === -1 ? [-1] : sanitized;
  }

  private toDragOverReaction(result: boolean | IListDragOverReaction): IListDragOverReaction {
    return typeof result === "boolean"
      ? { accept: result }
      : result;
  }

  private getDragTarget(event: DragEvent): {
    readonly element: T | undefined;
    readonly index: number | undefined;
    readonly sector: ListViewTargetSector | undefined;
  } {
    const row = this.getRowElement(event.target);
    const index = row ? Number(row.dataset.index) : undefined;
    const resolvedIndex = typeof index === "number" && !Number.isNaN(index) ? index : undefined;
    const element = typeof resolvedIndex === "number" ? this.props.items[resolvedIndex] : undefined;
    return {
      element,
      index: typeof element === "undefined" ? undefined : resolvedIndex,
      sector: row && typeof element !== "undefined"
        ? this.getTargetSector(event, row)
        : undefined,
    };
  }

  private getTargetSector(event: DragEvent, row: HTMLElement): ListViewTargetSector {
    const { top, height } = row.getBoundingClientRect();
    const relativePosition = height > 0 ? (event.clientY - top) / height : 0;
    return Math.max(
      ListViewTargetSector.TOP,
      Math.min(
        ListViewTargetSector.BOTTOM,
        Math.floor(relativePosition / 0.25),
      ),
    );
  }

  private getRowElement(target: EventTarget | null): HTMLElement | null {
    let element = target instanceof HTMLElement ? target : null;
    while (element && element !== this.viewport) {
      if (element.classList.contains("ui-list__row")) {
        return element;
      }
      element = element.parentElement;
    }

    return null;
  }

  private ensureEntry(index: number, item: T, key: string, templateId: string): RowEntry<T> {
    let entry = this.rowsByIndex.get(index);
    if (entry?.key === key && entry.row.templateId === templateId) {
      return entry;
    }

    if (entry) {
      this.releaseEntry(entry);
    }

    entry = this.rows.get(key);
    if (entry) {
      if (entry.row.templateId !== templateId) {
        this.releaseEntry(entry);
      } else {
        this.rowsByIndex.delete(entry.index);
        entry.index = index;
        entry.item = item;
        this.rowsByIndex.set(index, entry);
        return entry;
      }
    }

    const { row } = this.rowCache.alloc(templateId);
    this.ensureRowEventListener(row.domNode);
    entry = {
      index,
      item,
      key,
      row,
    };
    this.rows.set(key, entry);
    this.rowsByIndex.set(index, entry);
    if (row.domNode.parentElement !== this.stage) {
      this.stage.appendChild(row.domNode);
    }

    return entry;
  }

  private getRangesToRemove(
    previous: RenderRange,
    next: RenderRange,
  ): RenderRange[] {
    if (previous.end <= next.start || previous.start >= next.end) {
      return previous.start === previous.end ? [] : [previous];
    }

    const result: RenderRange[] = [];
    if (previous.start < next.start) {
      result.push({ start: previous.start, end: next.start });
    }
    if (previous.end > next.end) {
      result.push({ start: next.end, end: previous.end });
    }
    return result;
  }

  private releaseInvisibleRows(renderRange: RenderRange): void {
    const visibleKeys = new Set<string>();
    const { getKey, items } = this.props;

    for (let index = renderRange.start; index < renderRange.end; index += 1) {
      const item = items[index];
      if (typeof item !== "undefined") {
        visibleKeys.add(getKey(item, index));
      }
    }

    for (const entry of Array.from(this.rows.values())) {
      if (!visibleKeys.has(entry.key)) {
        this.releaseEntry(entry);
      }
    }
  }

  private releaseRange(range: RenderRange): void {
    for (let index = range.start; index < range.end; index += 1) {
      const entry = this.rowsByIndex.get(index);
      if (entry) {
        this.releaseEntry(entry);
      }
    }
  }

  private releaseEntry(entry: RowEntry<T>): void {
    this.getRenderer(entry.row.templateId).disposeElement?.(
      entry.item,
      entry.index,
      entry.row.templateData,
    );
    this.rows.delete(entry.key);
    this.rowsByIndex.delete(entry.index);
    this.rowCache.release(entry.row);
  }

  private disposeAllRows(): void {
    for (const entry of Array.from(this.rows.values())) {
      this.releaseEntry(entry);
    }
    this.rows.clear();
    this.rowsByIndex.clear();
  }

  private setFocusedIndex(index: number, browserEvent?: UIEvent): void {
    if (this.focusedIndex === index) {
      return;
    }

    this.focusedIndex = index;
    const item = this.props.items[index];
    if (typeof item !== "undefined") {
      this.props.onDidFocus?.({
        browserEvent,
        elements: [item],
        indexes: [index],
      });
    }
  }

  private setRenderers(renderers: readonly IListRenderer<T, any>[]): void {
    this.renderers.clear();
    for (const renderer of renderers) {
      this.renderers.set(renderer.templateId, renderer);
    }
  }

  private getRenderer(templateId: string): IListRenderer<T, any> {
    const renderer = this.renderers.get(templateId);
    if (!renderer) {
      throw new BugIndicatingError(`No renderer found for template id ${templateId}`);
    }
    return renderer;
  }
}
