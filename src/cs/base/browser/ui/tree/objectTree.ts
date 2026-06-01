import { lxChevronRight } from "@chogng/lxicon";
import { ListView } from "src/cs/base/browser/ui/list/listView";
import type {
  IListVirtualDelegate,
  ListHandle,
  ListRenderState,
} from "src/cs/base/browser/ui/list/list";
import { normalizeLxIconSvgMarkup } from "src/cs/base/browser/ui/lxicon/lxiconMarkup";
import { localize } from "src/cs/nls";
import {
  ObjectTreeModel,
  type FlattenedObjectTreeNode,
} from "src/cs/base/browser/ui/tree/objectTreeModel";
import type {
  IObjectTreeOptions,
  ITreeElementRenderDetails,
  ITreeNode,
  ITreeRenderer,
  ITreeSelectionEvent,
} from "src/cs/base/browser/ui/tree/tree";

import "src/cs/base/browser/ui/tree/media/tree.css";

const classNames = (...names: Array<string | undefined>): string =>
  names.filter(Boolean).join(" ");

const renderChevron = (collapsed: boolean): HTMLSpanElement => {
  const icon = document.createElement("span");
  icon.className = "ui-tree__disclosure-icon";
  icon.setAttribute("aria-hidden", "true");
  icon.dataset.collapsed = collapsed ? "true" : "false";
  icon.innerHTML = normalizeLxIconSvgMarkup(lxChevronRight);
  return icon;
};

export class ObjectTree<T> implements ListHandle {
  private readonly root: HTMLDivElement;
  private readonly listHost: HTMLDivElement;
  private readonly list: ListView<FlattenedObjectTreeNode<T>>;
  private focusedKey: string | null = null;
  private readonly model: ObjectTreeModel<T>;
  private options: IObjectTreeOptions<T>;

  constructor(host: HTMLElement, options: IObjectTreeOptions<T>) {
    this.options = options;
    this.model = new ObjectTreeModel(options);

    this.root = document.createElement("div");
    this.root.className = classNames("ui-tree", options.className);

    this.listHost = document.createElement("div");
    this.listHost.className = "ui-tree__list";
    this.root.appendChild(this.listHost);
    host.appendChild(this.root);

    this.list = new ListView(this.listHost, this.createListOptions());
  }

  setChildren(items: T[]): void {
    this.update({ ...this.options, items });
  }

  update(options: IObjectTreeOptions<T>): void {
    this.options = options;
    this.model.update(options);
    this.root.className = classNames("ui-tree", options.className);
    this.list.setProps(this.createListOptions());
  }

  dispose(): void {
    this.list.dispose();
    this.root.remove();
  }

  focus(): void {
    this.list.focus();
  }

  getViewport(): HTMLDivElement | null {
    return this.list.getViewport();
  }

  scrollToEnd(behavior?: ScrollBehavior): void {
    this.list.scrollToEnd(behavior);
  }

  scrollToIndex(index: number, behavior?: ScrollBehavior): void {
    this.list.scrollToIndex(index, behavior);
  }

  scrollToStart(behavior?: ScrollBehavior): void {
    this.list.scrollToStart(behavior);
  }

  private createListOptions() {
    const flattenedItems = this.model.flatten();
    const options = this.options;

    return {
      className: "ui-tree__list",
      delegate: this.createListDelegate(),
      empty: options.empty,
      disposeEmpty: options.disposeEmpty,
      getKey: (entry: FlattenedObjectTreeNode<T>) => entry.key,
      gap: options.gap,
      items: flattenedItems,
      minVirtualCount: options.minVirtualCount,
      onKeyDown: (event: KeyboardEvent) => this.handleKeyDown(event),
      onScroll: options.onScroll,
      onSelect: (entry: FlattenedObjectTreeNode<T>, index: number) =>
        options.onSelect?.({
          depth: entry.depth,
          element: entry.item,
          index,
        }),
      overscanRows: options.overscanRows,
      renderItem: (
        entry: FlattenedObjectTreeNode<T>,
        index: number,
        state: ListRenderState,
        container: HTMLElement,
      ) => this.renderTreeItem(entry, index, state, container),
      disposeItem: (
        entry: FlattenedObjectTreeNode<T>,
        index: number,
        container: HTMLElement,
      ) => {
        options.renderer.disposeElement?.(this.toTreeNode(entry), index, container);
        container.replaceChildren();
      },
      role: "tree",
      rowRole: "treeitem",
      selectedKey: options.selectedKey,
      viewportClassName: options.viewportClassName,
    };
  }

  private createListDelegate(): IListVirtualDelegate<FlattenedObjectTreeNode<T>> {
    return {
      getHeight: (entry) => {
        const resolvedHeight = Number(this.options.delegate.getHeight(entry.item));
        return Number.isFinite(resolvedHeight) && resolvedHeight > 0
          ? resolvedHeight
          : 32;
      },
    };
  }

  private handleKeyDown(event: KeyboardEvent): void {
    const focusedEntry = this.model.flatten().find(
      (entry) => entry.key === this.focusedKey,
    );

    if (!focusedEntry) {
      this.options.onKeyDown?.(event);
      return;
    }

    if (event.key === "ArrowRight") {
      if (focusedEntry.expandable && this.model.isCollapsed(focusedEntry.key)) {
        event.preventDefault();
        this.setCollapsed(focusedEntry.key, false);
        return;
      }
    } else if (event.key === "ArrowLeft") {
      if (focusedEntry.expandable && !this.model.isCollapsed(focusedEntry.key)) {
        event.preventDefault();
        this.setCollapsed(focusedEntry.key, true);
        return;
      }
    } else {
      this.options.onKeyDown?.(event);
    }
  }

  private setCollapsed(key: string, collapsed: boolean): void {
    const collapsedKeys = this.model.setCollapsed(key, collapsed);
    this.options.onDidChangeCollapseState?.(collapsedKeys);
    this.list.setProps(this.createListOptions());
  }

  private renderTreeItem(
    entry: FlattenedObjectTreeNode<T>,
    index: number,
    state: ListRenderState,
    container: HTMLElement,
  ): void {
    container.replaceChildren();

    const collapsed = entry.expandable && this.model.isCollapsed(entry.key);
    const row = container.parentElement;
    if (row) {
      row.setAttribute("aria-level", String(entry.depth + 1));
      if (entry.expandable) {
        row.setAttribute("aria-expanded", String(!collapsed));
      } else {
        row.removeAttribute("aria-expanded");
      }
    }
    if (state.focused) {
      this.focusedKey = entry.key;
    }

    const item = document.createElement("div");
    item.className = "ui-tree__item";
    item.dataset.expandable = entry.expandable ? "true" : "false";
    item.style.paddingLeft = `${entry.depth * 16}px`;

    const disclosure = document.createElement("button");
    disclosure.type = "button";
    disclosure.className = "ui-tree__disclosure";
    disclosure.disabled = !entry.expandable;
    disclosure.replaceChildren();
    if (entry.expandable) {
      disclosure.setAttribute(
        "aria-label",
        collapsed
          ? localize("tree.expand", "Expand")
          : localize("tree.collapse", "Collapse"),
      );
      disclosure.setAttribute("aria-expanded", String(!collapsed));
      disclosure.appendChild(renderChevron(collapsed));
    }

    disclosure.addEventListener("click", (event) => {
      event.stopPropagation();
      if (!entry.expandable) return;
      this.setCollapsed(entry.key, !collapsed);
    });

    const label = document.createElement("div");
    label.className = "ui-tree__label";
    this.options.renderer.renderElement(this.toTreeNode(entry), index, label, {
      collapsed,
      depth: entry.depth,
      expandable: entry.expandable,
      focused: state.focused,
      selected: state.selected,
    });

    item.append(disclosure, label);
    container.appendChild(item);
  }

  private toTreeNode(entry: FlattenedObjectTreeNode<T>): ITreeNode<T> {
    return {
      children: this.model.getChildren(entry.item),
      collapsible: entry.expandable,
      collapsed: entry.expandable && this.model.isCollapsed(entry.key),
      depth: entry.depth,
      element: entry.item,
    };
  }
}

export type {
  IObjectTreeOptions,
  ITreeElementRenderDetails,
  ITreeNode,
  ITreeRenderer,
  ITreeSelectionEvent,
};

export default ObjectTree;
