import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  type ForwardedRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactElement,
  type RefAttributes,
} from "react";
import { createRoot, type Root } from "react-dom/client";
import { jsx } from "react/jsx-runtime";
import type { ListHandle, ListProps } from "src/cs/base/browser/ui/list/list";
import { ListView, type ListViewOptions } from "src/cs/base/browser/ui/list/listView";

function buildViewOptions<T>(
  props: ListProps<T>,
  rowRoots: WeakMap<HTMLElement, Root>,
  emptyRootRef: { current: Root | null },
): ListViewOptions<T> {
  return {
    className: props.className,
    empty: (container) => {
      let root = emptyRootRef.current;
      if (!root) {
        root = createRoot(container);
        emptyRootRef.current = root;
      }

      root.render(props.empty ?? null);
    },
    disposeEmpty: () => {
      emptyRootRef.current?.unmount();
      emptyRootRef.current = null;
    },
    getKey: props.getKey,
    gap: props.gap,
    items: props.items,
    minVirtualCount: props.minVirtualCount,
    onKeyDown: props.onKeyDown
      ? (event) => props.onKeyDown?.(event as unknown as ReactKeyboardEvent<HTMLDivElement>)
      : undefined,
    onScroll: props.onScroll,
    onSelect: props.onSelect,
    overscanRows: props.overscanRows,
    role: props.role,
    renderItem: (item, index, state, container) => {
      let root = rowRoots.get(container);
      if (!root) {
        root = createRoot(container);
        rowRoots.set(container, root);
      }

      root.render(props.renderItem(item, index, state));
    },
    disposeItem: (_item, _index, container) => {
      rowRoots.get(container)?.unmount();
      rowRoots.delete(container);
    },
    rowHeight: props.rowHeight,
    rowRole: props.rowRole,
    selectedKey: props.selectedKey,
    viewportClassName: props.viewportClassName,
  };
}

function ListInner<T>(
  props: ListProps<T>,
  ref: ForwardedRef<ListHandle>,
) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const listViewRef = useRef<ListView<T> | null>(null);
  const rowRootsRef = useRef(new WeakMap<HTMLElement, Root>());
  const emptyRootRef = useRef<Root | null>(null);
  const latestPropsRef = useRef(props);
  latestPropsRef.current = props;

  useImperativeHandle(
    ref,
    () => ({
      focus: () => listViewRef.current?.focus(),
      getViewport: () => listViewRef.current?.getViewport() ?? null,
      scrollToEnd: (behavior) => listViewRef.current?.scrollToEnd(behavior),
      scrollToIndex: (index, behavior) =>
        listViewRef.current?.scrollToIndex(index, behavior),
      scrollToStart: (behavior) => listViewRef.current?.scrollToStart(behavior),
    }),
    [],
  );

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host || listViewRef.current) {
      return;
    }

    listViewRef.current = new ListView(
      host,
      buildViewOptions(latestPropsRef.current, rowRootsRef.current, emptyRootRef),
    );

    return () => {
      listViewRef.current?.dispose();
      listViewRef.current = null;
      emptyRootRef.current?.unmount();
      emptyRootRef.current = null;
    };
  }, []);

  useEffect(() => {
    listViewRef.current?.setProps(
      buildViewOptions(props, rowRootsRef.current, emptyRootRef),
    );
  });

  return jsx("div", {
    ref: hostRef,
    style: { display: "contents" },
  });
}

const List = forwardRef(ListInner) as (<T>(
  props: ListProps<T> & RefAttributes<ListHandle>,
) => ReactElement | null) & {
  displayName?: string;
};

List.displayName = "List";

export default List;
