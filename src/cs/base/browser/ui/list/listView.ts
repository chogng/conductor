import {
  addDisposableListener,
  DisposableResizeObserver,
  getClientArea,
} from "src/cs/base/browser/dom";
import {
  DisposableStore,
  type IDisposable,
} from "src/cs/base/common/lifecycle";
import type {
  ListProps,
  ListRenderRange,
  ListRenderState,
} from "src/cs/base/browser/ui/list/list";
import { RangeMap } from "src/cs/base/browser/ui/list/rangeMap";
import { RowCache, type RowCacheRow } from "src/cs/base/browser/ui/list/rowCache";
import { ScrollbarController } from "src/cs/base/browser/ui/scrollbar/scrollbarController";

import "src/cs/base/browser/ui/list/list.css";

export type ListViewItemRenderer<T> = (
  item: T,
  index: number,
  state: ListRenderState,
  container: HTMLElement,
) => void;

export type ListViewItemDisposer<T> = (
  item: T,
  index: number,
  container: HTMLElement,
) => void;

export type ListViewEmptyRenderer = (container: HTMLElement) => void;

export type ListViewOptions<T> = ListProps<T>;

type RowEntry<T> = {
  appliedFocused?: boolean;
  appliedIndex?: number;
  appliedKey?: string;
  appliedRole?: string;
  appliedRowHeight?: number;
  appliedRowTop?: number;
  appliedSelected?: boolean;
  index: number;
  item: T;
  key: string;
  renderedFocused?: boolean;
  renderedIndex?: number;
  renderedItem?: T;
  renderedSelected?: boolean;
  row: RowCacheRow;
};

type RenderRange = {
  readonly end: number;
  readonly start: number;
};

const DEFAULT_MIN_VIRTUAL_COUNT = 80;
const DEFAULT_GAP = 12;
const DEFAULT_OVERSCAN_ROWS = 6;

const classNames = (...names: Array<string | undefined>): string =>
  names
    .flatMap((name) => name?.split(/\s+/g) ?? [])
    .filter(Boolean)
    .join(" ");

export class ListView<T> implements IDisposable {
  private readonly disposables = new DisposableStore();
  private readonly host: HTMLElement;
  private readonly root: HTMLDivElement;
  private readonly viewport: HTMLDivElement;
  private readonly stage: HTMLDivElement;
  private readonly emptyContainer: HTMLDivElement;
  private readonly scrollbar: ScrollbarController;
  private readonly rows = new Map<string, RowEntry<T>>();
  private readonly rowsByIndex = new Map<number, RowEntry<T>>();
  private readonly rowCache = new RowCache(() => this.createRow());
  private props: ListViewOptions<T>;
  private viewportHeight = 0;
  private scrollTop = 0;
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

  constructor(host: HTMLElement, options: ListViewOptions<T>) {
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

    this.scrollbar = this.disposables.add(new ScrollbarController({
      axis: "y",
      getScrollDimensions: this.getScrollDimensions,
      getScrollPosition: this.getScrollPosition,
      handleMouseWheel: true,
      observeContentMutations: false,
      root: this.root,
      setScrollPosition: this.setScrollPosition,
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

  setProps(nextProps: ListViewOptions<T>): void {
    if (this.props.items !== nextProps.items || this.props.getKey !== nextProps.getKey) {
      this.shouldReconcileRows = true;
    }

    this.props = nextProps;
    this.rangeMap = this.createRangeMap();
    this.updateClasses();
    this.syncFocusedIndex();
    this.render();
  }

  splice(start: number, deleteCount: number, elements: readonly T[] = []): void {
    const items = this.props.items.slice();
    items.splice(start, deleteCount, ...elements);
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

  focus(): void {
    this.viewport.focus();
  }

  getViewport(): HTMLDivElement {
    return this.viewport;
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
    if (!item) {
      return;
    }

    const rowTop = this.getRowTop(index);
    const rowHeight = this.getRowHeightAt(index, item);
    const currentTop = this.scrollTop;
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
    const { items, selectedKey, getKey } = this.props;

    if (!items.length) {
      this.focusedIndex = -1;
      return;
    }

    if (selectedKey) {
      const nextIndex = items.findIndex(
        (item, index) => getKey(item, index) === selectedKey,
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
    entry.renderedFocused = undefined;
    entry.renderedIndex = undefined;
    entry.renderedItem = undefined;
    entry.renderedSelected = undefined;
  }

  private scheduleScrollTop(nextScrollTop: number): void {
    this.pendingScrollTop = this.clampScrollTop(nextScrollTop);

    if (this.scrollRaf !== null) {
      return;
    }

    this.scrollRaf = window.requestAnimationFrame(() => {
      this.scrollRaf = null;
      if (this.scrollTop !== this.pendingScrollTop) {
        this.scrollTop = this.pendingScrollTop;
        this.render();
        this.scrollbar.updateScrollPosition();
        this.props.onScroll?.(new CustomEvent("scroll", {
          detail: {
            clientHeight: this.viewportHeight,
            scrollHeight: this.scrollHeight,
            scrollTop: this.scrollTop,
          },
        }));
      }
    });
  }

  private onKeyDown = (event: KeyboardEvent): void => {
    const { items, onKeyDown, onSelect } = this.props;

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
        if (item) {
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
      this.focusedIndex = nextIndex;
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
    this.setScrollTop(this.scrollTop + scrollTop, "auto");
  };

  private render(): void {
    if (this.disposed) return;

    const { items, renderItem, empty, disposeEmpty, rowRole, selectedKey, getKey } =
      this.props;

    if (!items.length) {
      this.viewport.hidden = true;
      this.emptyContainer.hidden = false;
      this.stage.style.height = "0px";
      this.stage.style.top = "0px";
      this.scrollHeight = 0;
      this.scrollTop = 0;
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
    this.scrollTop = this.clampScrollTop(this.scrollTop);
    const virtualized = items.length >= this.minVirtualCount;
    const visibleStartIndex = virtualized
      ? this.findIndexAtOffset(this.scrollTop)
      : 0;
    const visibleEndIndex = virtualized
      ? Math.min(items.length, this.findIndexAfterOffset(this.scrollTop + this.viewportHeight))
      : items.length;
    const startIndex = virtualized
      ? Math.max(0, visibleStartIndex - this.overscanRows)
      : 0;
    const endIndex = virtualized
      ? Math.min(items.length, visibleEndIndex + this.overscanRows)
      : items.length;

    this.stage.style.height = `${totalHeight}px`;
    this.stage.style.top = `${-this.scrollTop}px`;
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
        if (!item) continue;

        const key = getKey(item, index);
        const entry = this.ensureEntry(index, item, key);

        entry.index = index;
        entry.item = item;

        const selected = selectedKey === key;
        const focused = index === this.focusedIndex;
        this.updateRowShellIfNeeded(entry, {
          focused,
          index,
          key,
          rowHeight: this.getRowHeightAt(index, item),
          rowRole: rowRole ?? "option",
          rowTop: this.getRowTop(index),
          selected,
        });

        this.renderRowItemIfNeeded(entry, {
          focused,
          index,
          item,
          renderItem,
          selected,
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
    this.scrollbar.update();
  }

  private readonly getScrollDimensions = () => ({
    clientHeight: this.viewportHeight,
    clientWidth: this.viewport.clientWidth,
    scrollHeight: this.scrollHeight,
    scrollWidth: this.viewport.clientWidth,
  });

  private readonly getScrollPosition = () => ({
    scrollLeft: 0,
    scrollTop: this.scrollTop,
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
    const resolvedHeight = Number(this.props.delegate.getHeight(item));
    return Number.isFinite(resolvedHeight) && resolvedHeight > 0 ? resolvedHeight : 32;
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

    return Math.max(0, this.rangeMap.size - this.gap);
  }

  private createRangeMap(): RangeMap {
    const rangeMap = new RangeMap();
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
      focused: boolean;
      index: number;
      item: T;
      renderItem: ListViewItemRenderer<T>;
      selected: boolean;
    },
  ): void {
    const shouldRender =
      entry.renderedFocused !== options.focused ||
      entry.renderedIndex !== options.index ||
      entry.renderedItem !== options.item ||
      entry.renderedSelected !== options.selected;

    if (!shouldRender) {
      return;
    }

    options.renderItem(
      options.item,
      options.index,
      {
        focused: options.focused,
        index: options.index,
        selected: options.selected,
      },
      entry.row.mount,
    );

    entry.renderedFocused = options.focused;
    entry.renderedIndex = options.index;
    entry.renderedItem = options.item;
    entry.renderedSelected = options.selected;
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
  }

  private createRow(): RowCacheRow {
    const domNode = document.createElement("div");
    domNode.className = "ui-list__row";

    const mount = document.createElement("div");
    mount.className = "ui-list__row-content";

    domNode.appendChild(mount);

    domNode.addEventListener("click", (event) => {
      const nextIndex = Number(domNode.dataset.index);
      const nextItem = this.props.items[nextIndex];
      if (Number.isNaN(nextIndex) || typeof nextItem === "undefined") return;

      this.focusedIndex = nextIndex;
      this.props.onSelect?.(nextItem, nextIndex, event);
      this.render();
    });

    return {
      domNode,
      mount,
      templateId: "default",
    };
  }

  private ensureEntry(index: number, item: T, key: string): RowEntry<T> {
    let entry = this.rowsByIndex.get(index);
    if (entry?.key === key) {
      return entry;
    }

    if (entry) {
      this.releaseEntry(entry);
    }

    entry = this.rows.get(key);
    if (entry) {
      this.rowsByIndex.delete(entry.index);
      entry.index = index;
      entry.item = item;
      this.rowsByIndex.set(index, entry);
      return entry;
    }

    const { row } = this.rowCache.alloc("default");
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
      if (item) {
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
    this.props.disposeItem?.(entry.item, entry.index, entry.row.mount);
    entry.row.mount.replaceChildren();
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
}
