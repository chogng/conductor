import { ListView } from "src/cs/base/browser/ui/list/listView";
import type { ListRenderState } from "src/cs/base/browser/ui/list/list";
import { cx } from "src/utils/cx";

export type TreeNode<T> = {
  children?: T[];
  data: T;
};

export type TreeRenderState = {
  depth: number;
  expanded: boolean;
  expandable: boolean;
  focused: boolean;
  index: number;
  selected: boolean;
  toggleExpand: () => void;
};

export type TreeProps<T> = {
  readonly className?: string;
  readonly defaultExpandedKeys?: string[];
  readonly empty?: (container: HTMLElement) => void;
  readonly disposeEmpty?: (container: HTMLElement) => void;
  readonly expandedKeys?: string[];
  readonly getChildren?: (item: T) => T[] | undefined;
  readonly getKey: (item: T, index: number, depth: number) => string;
  readonly items: T[];
  readonly onExpandedKeysChange?: (keys: string[]) => void;
  readonly onSelect?: (item: T, index: number, depth: number) => void;
  readonly gap?: number;
  readonly minVirtualCount?: number;
  readonly overscanRows?: number;
  readonly renderItem: (
    item: T,
    index: number,
    state: TreeRenderState,
    container: HTMLElement,
  ) => void;
  readonly disposeItem?: (item: T, index: number, container: HTMLElement) => void;
  readonly rowHeight?: number;
  readonly selectedKey?: string | null;
  readonly viewportClassName?: string;
};

type FlattenedTreeNode<T> = {
  depth: number;
  expandable: boolean;
  item: T;
  key: string;
};

export class TreeView<T> {
  private readonly root: HTMLDivElement;
  private readonly listHost: HTMLDivElement;
  private readonly list: ListView<FlattenedTreeNode<T>>;
  private expandedKeys: Set<string>;
  private props: TreeProps<T>;

  constructor(host: HTMLElement, props: TreeProps<T>) {
    this.props = props;
    this.expandedKeys = new Set(props.expandedKeys ?? props.defaultExpandedKeys ?? []);

    this.root = document.createElement("div");
    this.root.className = cx("ui-tree", props.className);

    this.listHost = document.createElement("div");
    this.listHost.className = "ui-tree__list";
    this.root.appendChild(this.listHost);
    host.appendChild(this.root);

    this.list = new ListView(this.listHost, this.createListOptions());
  }

  setProps(props: TreeProps<T>): void {
    this.props = props;
    if (props.expandedKeys) {
      this.expandedKeys = new Set(props.expandedKeys);
    }
    this.root.className = cx("ui-tree", props.className);
    this.list.setProps(this.createListOptions());
  }

  dispose(): void {
    this.list.dispose();
    this.root.remove();
  }

  private createListOptions() {
    const flattenedItems = this.flattenItems();
    const props = this.props;

    return {
      className: "ui-tree__list",
      empty: props.empty,
      disposeEmpty: props.disposeEmpty,
      getKey: (entry: FlattenedTreeNode<T>) => entry.key,
      gap: props.gap,
      items: flattenedItems,
      minVirtualCount: props.minVirtualCount,
      onSelect: (entry: FlattenedTreeNode<T>, index: number) =>
        props.onSelect?.(entry.item, index, entry.depth),
      overscanRows: props.overscanRows,
      renderItem: (
        entry: FlattenedTreeNode<T>,
        index: number,
        state: ListRenderState,
        container: HTMLElement,
      ) => {
        this.renderTreeItem(entry, index, state, container);
      },
      disposeItem: (entry: FlattenedTreeNode<T>, index: number, container: HTMLElement) => {
        props.disposeItem?.(entry.item, index, container);
        container.replaceChildren();
      },
      role: "tree",
      rowHeight: props.rowHeight ?? 32,
      rowRole: "treeitem",
      selectedKey: props.selectedKey,
      viewportClassName: props.viewportClassName,
    };
  }

  private flattenItems(): FlattenedTreeNode<T>[] {
    const result: FlattenedTreeNode<T>[] = [];
    const props = this.props;

    const visit = (entry: T, depth: number, index: number) => {
      const key = props.getKey(entry, index, depth);
      const children = props.getChildren?.(entry) ?? [];
      result.push({
        depth,
        expandable: children.length > 0,
        item: entry,
        key,
      });

      if (!this.expandedKeys.has(key)) {
        return;
      }

      for (let childIndex = 0; childIndex < children.length; childIndex += 1) {
        const child = children[childIndex];
        if (child) {
          visit(child, depth + 1, childIndex);
        }
      }
    };

    for (let index = 0; index < props.items.length; index += 1) {
      const item = props.items[index];
      if (item) {
        visit(item, 0, index);
      }
    }

    return result;
  }

  private renderTreeItem(
    entry: FlattenedTreeNode<T>,
    index: number,
    state: ListRenderState,
    container: HTMLElement,
  ): void {
    container.replaceChildren();

    const expanded = entry.expandable && this.expandedKeys.has(entry.key);
    const item = document.createElement("div");
    item.className = "ui-tree__item";
    item.style.paddingLeft = `${entry.depth * 16}px`;

    const disclosure = document.createElement("button");
    disclosure.type = "button";
    disclosure.className = "ui-tree__disclosure";
    disclosure.disabled = !entry.expandable;
    disclosure.textContent = entry.expandable ? (expanded ? "▾" : "▸") : "";
    if (entry.expandable) {
      disclosure.setAttribute("aria-label", expanded ? "Collapse" : "Expand");
      disclosure.setAttribute("aria-expanded", String(expanded));
    }

    const toggleExpand = () => {
      if (!entry.expandable) return;

      const nextExpandedKeys = new Set(this.expandedKeys);
      if (nextExpandedKeys.has(entry.key)) {
        nextExpandedKeys.delete(entry.key);
      } else {
        nextExpandedKeys.add(entry.key);
      }

      if (!this.props.expandedKeys) {
        this.expandedKeys = nextExpandedKeys;
      }
      this.props.onExpandedKeysChange?.([...nextExpandedKeys]);
      this.list.setProps(this.createListOptions());
    };

    disclosure.addEventListener("click", (event) => {
      event.stopPropagation();
      toggleExpand();
    });

    const label = document.createElement("div");
    label.className = "ui-tree__label";
    this.props.renderItem(entry.item, index, {
      depth: entry.depth,
      expandable: entry.expandable,
      expanded,
      focused: state.focused,
      index,
      selected: state.selected,
      toggleExpand,
    }, label);

    item.append(disclosure, label);
    container.appendChild(item);
  }
}

export default TreeView;
