import {
  addDisposableListener,
  DisposableResizeObserver,
  getClientArea,
  getScrollPosition,
} from "src/cs/base/browser/dom";
import { cx } from "src/utils/cx";
import {
  DisposableStore,
  type IDisposable,
} from "src/cs/base/common/lifecycle";
import type { ListRenderState } from "src/cs/base/browser/ui/list/list";
import "./list.css";

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

export type ListViewOptions<T> = {
  className?: string;
  empty?: ListViewEmptyRenderer;
  disposeEmpty?: ListViewEmptyRenderer;
  getKey: (item: T, index: number) => string;
  gap?: number;
  items: T[];
  minVirtualCount?: number;
  onKeyDown?: (event: KeyboardEvent) => void;
  onScroll?: (event: Event) => void;
  onSelect?: (item: T, index: number) => void;
  overscanRows?: number;
  role?: string;
  renderItem: ListViewItemRenderer<T>;
  disposeItem?: ListViewItemDisposer<T>;
  rowHeight?: number;
  rowRole?: string;
  selectedKey?: string | null;
  viewportClassName?: string;
};

type RowEntry<T> = {
  container: HTMLDivElement;
  index: number;
  item: T;
  key: string;
  mount: HTMLDivElement;
};

const DEFAULT_MIN_VIRTUAL_COUNT = 80;
const DEFAULT_ROW_HEIGHT = 92;
const DEFAULT_GAP = 12;
const DEFAULT_OVERSCAN_ROWS = 6;

export class ListView<T> implements IDisposable {
  private readonly disposables = new DisposableStore();
  private readonly host: HTMLElement;
  private readonly root: HTMLDivElement;
  private readonly viewport: HTMLDivElement;
  private readonly stage: HTMLDivElement;
  private readonly emptyContainer: HTMLDivElement;
  private readonly rows = new Map<string, RowEntry<T>>();
  private props: ListViewOptions<T>;
  private viewportHeight = 0;
  private scrollTop = 0;
  private focusedIndex = -1;
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

    this.disposables.add(
      addDisposableListener(this.viewport, "scroll", this.onScroll),
    );
    this.disposables.add(
      addDisposableListener(this.viewport, "keydown", this.onKeyDown),
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
    this.props = nextProps;
    this.updateClasses();
    this.syncFocusedIndex();
    this.render();
  }

  focus(): void {
    this.viewport.focus();
  }

  getViewport(): HTMLDivElement {
    return this.viewport;
  }

  scrollToStart(behavior: ScrollBehavior = "auto"): void {
    this.viewport.scrollTo({ top: 0, behavior });
  }

  scrollToEnd(behavior: ScrollBehavior = "smooth"): void {
    this.viewport.scrollTo({
      top: Math.max(0, this.viewport.scrollHeight - this.viewport.clientHeight),
      behavior,
    });
  }

  scrollToIndex(index: number, behavior: ScrollBehavior = "smooth"): void {
    if (index < 0) return;

    const rowHeight = this.rowHeight;
    const gap = this.gap;
    const rowStep = rowHeight + gap;
    const currentTop = getScrollPosition(this.viewport).scrollTop;
    const currentBottom = currentTop + getClientArea(this.viewport).height;
    const rowTop = index * rowStep;
    const rowBottom = rowTop + rowHeight;

    if (rowTop >= currentTop && rowBottom <= currentBottom) {
      return;
    }

    this.viewport.scrollTo({
      top: Math.max(0, rowTop - rowStep),
      behavior,
    });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;

    if (!this.emptyContainer.hidden) {
      this.props.disposeEmpty?.(this.emptyContainer);
    }
    this.disposeAllRows();
    this.disposables.dispose();
    this.root.remove();
  }

  private get gap(): number {
    return this.props.gap ?? DEFAULT_GAP;
  }

  private get rowHeight(): number {
    return this.props.rowHeight ?? DEFAULT_ROW_HEIGHT;
  }

  private get overscanRows(): number {
    return this.props.overscanRows ?? DEFAULT_OVERSCAN_ROWS;
  }

  private get minVirtualCount(): number {
    return this.props.minVirtualCount ?? DEFAULT_MIN_VIRTUAL_COUNT;
  }

  private updateClasses(): void {
    this.root.className = cx("ui-list", this.props.className);
    this.viewport.className = cx("ui-list__viewport", this.props.viewportClassName);
    this.viewport.setAttribute("role", this.props.role ?? "listbox");
  }

  private measureViewport(): void {
    this.viewportHeight = this.viewport.isConnected
      ? getClientArea(this.viewport).height
      : 0;
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

  private onScroll = (event: Event): void => {
    const nextScrollTop = getScrollPosition(this.viewport).scrollTop;
    if (nextScrollTop !== this.scrollTop) {
      this.scrollTop = nextScrollTop;
      this.render();
    }
    this.props.onScroll?.(event);
  };

  private onKeyDown = (event: KeyboardEvent): void => {
    const { items, onKeyDown, onSelect } = this.props;

    if (!items.length) {
      onKeyDown?.(event);
      return;
    }

    const rowStep = this.rowHeight + this.gap;
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
      const pageStep = Math.max(1, Math.floor(this.viewportHeight / rowStep));
      nextIndex = Math.min(items.length - 1, Math.max(0, this.focusedIndex) + pageStep);
    } else if (event.key === "PageUp") {
      const pageStep = Math.max(1, Math.floor(this.viewportHeight / rowStep));
      nextIndex = Math.max(0, Math.max(0, this.focusedIndex) - pageStep);
    } else if (event.key === "Enter" || event.key === " ") {
      if (this.focusedIndex >= 0) {
        const item = items[this.focusedIndex];
        if (item) {
          event.preventDefault();
          onSelect?.(item, this.focusedIndex);
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

  private render(): void {
    if (this.disposed) return;

    const { items, renderItem, disposeItem, empty, disposeEmpty, rowRole, selectedKey, getKey } =
      this.props;

    if (!items.length) {
      this.viewport.hidden = true;
      this.emptyContainer.hidden = false;
      this.stage.style.height = "0px";
      this.disposeAllRows();
      empty?.(this.emptyContainer);
      return;
    }

    if (this.emptyContainer.hidden === false) {
      disposeEmpty?.(this.emptyContainer);
    }

    this.emptyContainer.hidden = true;
    this.viewport.hidden = false;
    this.viewportHeight = getClientArea(this.viewport).height;

    const rowStep = this.rowHeight + this.gap;
    const totalHeight = items.length > 0 ? items.length * rowStep - this.gap : 0;
    const virtualized = items.length >= this.minVirtualCount;
    const startIndex = virtualized
      ? Math.max(0, Math.floor(this.scrollTop / rowStep) - this.overscanRows)
      : 0;
    const endIndex = virtualized
      ? Math.min(
          items.length,
          Math.ceil((this.scrollTop + this.viewportHeight) / rowStep) +
            this.overscanRows,
        )
      : items.length;

    this.stage.style.height = `${totalHeight}px`;

    const visibleKeys = new Set<string>();

    for (let visibleIndex = 0; visibleIndex < endIndex - startIndex; visibleIndex += 1) {
      const index = startIndex + visibleIndex;
      const item = items[index];
      if (!item) continue;

      const key = getKey(item, index);
      visibleKeys.add(key);

      let entry = this.rows.get(key);
      if (!entry) {
        entry = this.createRowEntry(item, index, key);
        this.rows.set(key, entry);
        this.stage.appendChild(entry.container);
      }

      entry.index = index;
      entry.item = item;
      entry.container.style.top = `${index * rowStep}px`;
      entry.container.style.height = `${this.rowHeight}px`;
      entry.container.setAttribute("data-index", String(index));
      entry.container.setAttribute("data-key", key);
      entry.container.setAttribute("role", rowRole ?? "option");

      const selected = selectedKey === key;
      const focused = index === this.focusedIndex;

      if (selected) {
        entry.container.setAttribute("aria-selected", "true");
      } else {
        entry.container.removeAttribute("aria-selected");
      }

      entry.container.classList.toggle("ui-list__row--selected", selected);
      entry.container.classList.toggle("ui-list__row--focused", focused);

      renderItem(item, index, { focused, index, selected }, entry.mount);
    }

    for (const [key, entry] of this.rows) {
      if (visibleKeys.has(key)) {
        continue;
      }

      disposeItem?.(entry.item, entry.index, entry.mount);
      entry.container.remove();
      this.rows.delete(key);
    }
  }

  private createRowEntry(item: T, index: number, key: string): RowEntry<T> {
    const container = document.createElement("div");
    container.className = "ui-list__row";

    const mount = document.createElement("div");
    mount.className = "ui-list__row-content";

    container.appendChild(mount);

    container.addEventListener("click", () => {
      const nextIndex = Number(container.dataset.index);
      const nextItem = this.props.items[nextIndex];
      if (Number.isNaN(nextIndex) || typeof nextItem === "undefined") return;

      this.focusedIndex = nextIndex;
      this.props.onSelect?.(nextItem, nextIndex);
      this.render();
    });

    return {
      container,
      index,
      item,
      key,
      mount,
    };
  }

  private disposeAllRows(): void {
    for (const entry of this.rows.values()) {
      this.props.disposeItem?.(entry.item, entry.index, entry.mount);
      entry.container.remove();
    }
    this.rows.clear();
  }
}
