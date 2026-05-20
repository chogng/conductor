import { jsx, jsxs } from "react/jsx-runtime";
import {
  useCallback,
  useMemo,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";
import List from "src/cs/base/browser/ui/list/listReact";
import type { ListRenderState } from "src/cs/base/browser/ui/list/list";
import { cx } from "src/utils/cx";
import "./tree.css";

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
  readonly empty?: ReactNode;
  readonly expandedKeys?: string[];
  readonly getChildren?: (item: T) => T[] | undefined;
  readonly getKey: (item: T, index: number, depth: number) => string;
  readonly items: T[];
  readonly onExpandedKeysChange?: (keys: string[]) => void;
  readonly onSelect?: (item: T, index: number, depth: number) => void;
  readonly renderItem: (item: T, index: number, state: TreeRenderState) => ReactNode;
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

const Tree = <T,>({
  className = "",
  defaultExpandedKeys = [],
  empty = null,
  expandedKeys: controlledExpandedKeys,
  getChildren,
  getKey,
  items,
  onExpandedKeysChange,
  onSelect,
  renderItem,
  rowHeight,
  selectedKey,
  viewportClassName,
}: TreeProps<T>) => {
  const [uncontrolledExpandedKeys, setUncontrolledExpandedKeys] = useState(
    () => new Set(defaultExpandedKeys),
  );
  const expandedKeys = useMemo(
    () =>
      controlledExpandedKeys
        ? new Set(controlledExpandedKeys)
        : uncontrolledExpandedKeys,
    [controlledExpandedKeys, uncontrolledExpandedKeys],
  );

  const applyExpandedKeys = useCallback(
    (nextExpandedKeys: Set<string>) => {
      if (!controlledExpandedKeys) {
        setUncontrolledExpandedKeys(nextExpandedKeys);
      }
      onExpandedKeysChange?.([...nextExpandedKeys]);
    },
    [controlledExpandedKeys, onExpandedKeysChange],
  );

  const toggleExpanded = useCallback(
    (key: string) => {
      const nextExpandedKeys = new Set(expandedKeys);
      if (nextExpandedKeys.has(key)) {
        nextExpandedKeys.delete(key);
      } else {
        nextExpandedKeys.add(key);
      }
      applyExpandedKeys(nextExpandedKeys);
    },
    [applyExpandedKeys, expandedKeys],
  );

  const flattenedItems = useMemo(() => {
    const result: FlattenedTreeNode<T>[] = [];
    const visit = (entry: T, depth: number, index: number) => {
      const key = getKey(entry, index, depth);
      const children = getChildren?.(entry) ?? [];
      result.push({
        depth,
        expandable: children.length > 0,
        item: entry,
        key,
      });

      if (!expandedKeys.has(key)) {
        return;
      }

      for (let childIndex = 0; childIndex < children.length; childIndex += 1) {
        const child = children[childIndex];
        if (child) {
          visit(child, depth + 1, childIndex);
        }
      }
    };

    for (let index = 0; index < items.length; index += 1) {
      const item = items[index];
      if (item) {
        visit(item, 0, index);
      }
    }

    return result;
  }, [expandedKeys, getChildren, getKey, items]);

  return jsxs("div", {
    className: cx("ui-tree", className),
    children: [
      jsx(List, {
        className: "ui-tree__list",
        empty,
        getKey: (entry: FlattenedTreeNode<T>) => entry.key,
        items: flattenedItems,
        onSelect: (entry: FlattenedTreeNode<T>, index: number) =>
          onSelect?.(entry.item, index, entry.depth),
        renderItem: (
          entry: FlattenedTreeNode<T>,
          index: number,
          state: ListRenderState,
        ) => {
          const expanded = entry.expandable && expandedKeys.has(entry.key);
          const handleToggle = () => {
            if (entry.expandable) {
              toggleExpanded(entry.key);
            }
          };
          return jsxs("div", {
            className: "ui-tree__item",
            style: { paddingLeft: `${entry.depth * 16}px` },
            children: [
              jsx("button", {
                type: "button",
                className: "ui-tree__disclosure",
                "aria-label": entry.expandable ? (expanded ? "Collapse" : "Expand") : undefined,
                "aria-expanded": entry.expandable ? expanded : undefined,
                disabled: !entry.expandable,
                onClick: (event: MouseEvent<HTMLButtonElement>) => {
                  event.stopPropagation();
                  handleToggle();
                },
                children: entry.expandable ? (expanded ? "▾" : "▸") : null,
              }),
              jsx("div", {
                className: "ui-tree__label",
                children: renderItem(entry.item, index, {
                  depth: entry.depth,
                  expandable: entry.expandable,
                  expanded,
                  focused: state.focused,
                  index,
                  selected: state.selected,
                  toggleExpand: handleToggle,
                }),
              }),
            ],
          });
        },
        role: "tree",
        rowHeight: rowHeight ?? 32,
        rowRole: "treeitem",
        selectedKey,
        viewportClassName,
      }),
    ],
  });
};

export default Tree;
