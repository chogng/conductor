import { jsx } from "react/jsx-runtime";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ForwardedRef,
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
  type RefAttributes,
} from "react";
import ScrollArea from "src/cs/base/browser/ui/ScrollArea/ScrollArea";
import {
  DisposableResizeObserver,
  getClientArea,
  getScrollPosition,
} from "src/cs/base/browser/dom";
import { cx } from "src/utils/cx";
import "./list.css";

export type ListRenderState = {
  focused: boolean;
  index: number;
  selected: boolean;
};

export type ListHandle = {
  focus: () => void;
  getViewport: () => HTMLDivElement | null;
  scrollToEnd: (behavior?: ScrollBehavior) => void;
  scrollToIndex: (index: number, behavior?: ScrollBehavior) => void;
  scrollToStart: (behavior?: ScrollBehavior) => void;
};

export type ListProps<T> = {
  readonly className?: string;
  readonly empty?: ReactNode;
  readonly getKey: (item: T, index: number) => string;
  readonly gap?: number;
  readonly items: T[];
  readonly minVirtualCount?: number;
  readonly onKeyDown?: (event: KeyboardEvent<HTMLDivElement>) => void;
  readonly onScroll?: (event: Event) => void;
  readonly onSelect?: (item: T, index: number) => void;
  readonly overscanRows?: number;
  readonly role?: string;
  readonly renderItem: (item: T, index: number, state: ListRenderState) => ReactNode;
  readonly rowHeight?: number;
  readonly rowRole?: string;
  readonly selectedKey?: string | null;
  readonly viewportClassName?: string;
};

const DEFAULT_MIN_VIRTUAL_COUNT = 80;
const DEFAULT_ROW_HEIGHT = 92;
const DEFAULT_GAP = 12;
const DEFAULT_OVERSCAN_ROWS = 6;

function ListInner<T>(
  {
    className = "",
    empty = null,
    getKey,
    gap = DEFAULT_GAP,
    items,
    minVirtualCount = DEFAULT_MIN_VIRTUAL_COUNT,
    onKeyDown,
    onScroll,
    onSelect,
    overscanRows = DEFAULT_OVERSCAN_ROWS,
    role = "listbox",
    renderItem,
    rowHeight = DEFAULT_ROW_HEIGHT,
    rowRole = "option",
    selectedKey = null,
    viewportClassName = "",
  }: ListProps<T>,
  ref: ForwardedRef<ListHandle>,
) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [scrollTop, setScrollTop] = useState(0);
  const [focusedIndex, setFocusedIndex] = useState<number>(-1);

  const measureViewport = useCallback(() => {
    const target = viewportRef.current;
    setViewportHeight(target ? getClientArea(target).height : 0);
  }, []);

  const scrollToIndex = useCallback(
    (index: number, behavior: ScrollBehavior = "smooth") => {
      const viewport = viewportRef.current;
      if (!viewport || index < 0) return;

      const rowStep = rowHeight + gap;
      const currentTop = getScrollPosition(viewport).scrollTop;
      const currentBottom = currentTop + getClientArea(viewport).height;
      const rowTop = index * rowStep;
      const rowBottom = rowTop + rowHeight;

      if (rowTop >= currentTop && rowBottom <= currentBottom) {
        return;
      }

      const nextTop = Math.max(0, rowTop - rowStep);
      viewport.scrollTo({
        top: nextTop,
        behavior,
      });
    },
    [gap, rowHeight],
  );

  const scrollToStart = useCallback(
    (behavior: ScrollBehavior = "auto") => {
      viewportRef.current?.scrollTo({ top: 0, behavior });
    },
    [],
  );

  const scrollToEnd = useCallback(
    (behavior: ScrollBehavior = "smooth") => {
      const viewport = viewportRef.current;
      if (!viewport) return;
      viewport.scrollTo({
        top: Math.max(0, viewport.scrollHeight - viewport.clientHeight),
        behavior,
      });
    },
    [],
  );

  const focus = useCallback(() => {
    viewportRef.current?.focus();
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      focus,
      getViewport: () => viewportRef.current,
      scrollToEnd,
      scrollToIndex,
      scrollToStart,
    }),
    [focus, scrollToEnd, scrollToIndex, scrollToStart],
  );

  useLayoutEffect(() => {
    measureViewport();

    const viewport = viewportRef.current;
    if (!viewport) return;

    if (typeof ResizeObserver === "undefined") {
      const handleResize = () => measureViewport();
      window.addEventListener("resize", handleResize);
      return () => {
        window.removeEventListener("resize", handleResize);
      };
    }

    const ro = new DisposableResizeObserver(window, measureViewport);
    const observed = ro.observe(viewport);
    return () => {
      observed.dispose();
      ro.dispose();
    };
  }, [measureViewport]);

  useEffect(() => {
    if (!items.length) {
      setFocusedIndex(-1);
      return;
    }

    if (selectedKey) {
      const nextIndex = items.findIndex(
        (item, itemIndex) => getKey(item, itemIndex) === selectedKey,
      );
      if (nextIndex >= 0) {
        setFocusedIndex(nextIndex);
        scrollToIndex(nextIndex, "auto");
      }
      return;
    }

    setFocusedIndex((current) =>
      current >= items.length ? items.length - 1 : current,
    );
  }, [getKey, items, scrollToIndex, selectedKey]);

  const handleScroll = useCallback(
    (event: Event) => {
      const target = event.currentTarget;
      if (target instanceof HTMLElement) {
        const nextScrollTop = getScrollPosition(target).scrollTop;
        setScrollTop((current) =>
          current === nextScrollTop ? current : nextScrollTop,
        );
      }
      onScroll?.(event);
    },
    [onScroll],
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (!items.length) {
        onKeyDown?.(event);
        return;
      }

      const rowStep = rowHeight + gap;
      let nextIndex = focusedIndex;

      if (event.key === "ArrowDown") {
        nextIndex = Math.min(items.length - 1, Math.max(0, focusedIndex) + 1);
      } else if (event.key === "ArrowUp") {
        nextIndex = Math.max(0, Math.max(0, focusedIndex) - 1);
      } else if (event.key === "Home") {
        nextIndex = 0;
      } else if (event.key === "End") {
        nextIndex = items.length - 1;
      } else if (event.key === "PageDown") {
        const pageStep = Math.max(1, Math.floor(viewportHeight / rowStep));
        nextIndex = Math.min(items.length - 1, Math.max(0, focusedIndex) + pageStep);
      } else if (event.key === "PageUp") {
        const pageStep = Math.max(1, Math.floor(viewportHeight / rowStep));
        nextIndex = Math.max(0, Math.max(0, focusedIndex) - pageStep);
      } else if (event.key === "Enter" || event.key === " ") {
        if (focusedIndex >= 0) {
          const item = items[focusedIndex];
          if (item) {
            event.preventDefault();
            onSelect?.(item, focusedIndex);
            return;
          }
        }
      } else {
        onKeyDown?.(event);
        return;
      }

      if (nextIndex !== focusedIndex) {
        event.preventDefault();
        setFocusedIndex(nextIndex);
        scrollToIndex(nextIndex);
      }
    },
    [focusedIndex, gap, items, onKeyDown, onSelect, rowHeight, scrollToIndex, viewportHeight],
  );

  const rowStep = rowHeight + gap;
  const virtualized = items.length >= minVirtualCount;
  const totalHeight = items.length > 0 ? items.length * rowStep - gap : 0;
  const startIndex = virtualized
    ? Math.max(0, Math.floor(scrollTop / rowStep) - overscanRows)
    : 0;
  const endIndex = virtualized
    ? Math.min(
        items.length,
        Math.ceil((scrollTop + viewportHeight) / rowStep) + overscanRows,
      )
    : items.length;
  const visibleItems = useMemo(
    () => items.slice(startIndex, endIndex),
    [endIndex, items, startIndex],
  );

  if (!items.length) {
    return jsx("div", {
      className: cx("ui-list", className),
      children: empty,
    });
  }

  return jsx(ScrollArea, {
    ref: viewportRef,
    axis: "y",
    className: cx("ui-list", className),
    viewportClassName: cx("ui-list__viewport", viewportClassName),
    viewportProps: {
      onKeyDown: handleKeyDown,
      onScroll: handleScroll,
      tabIndex: 0,
      role,
    },
    children: jsx("div", {
      className: "ui-list__stage",
      style: { height: `${totalHeight}px` },
      children: visibleItems.map((item, visibleIndex) => {
        const index = startIndex + visibleIndex;
        const key = getKey(item, index);
        const selected = selectedKey === key;
        const focused = index === focusedIndex;
        return jsx(
          "div",
          {
            role: rowRole,
            "aria-selected": selected || undefined,
            className: cx(
              "ui-list__row",
              selected && "ui-list__row--selected",
              focused && "ui-list__row--focused",
            ),
            style: {
              top: `${index * rowStep}px`,
              height: `${rowHeight}px`,
            },
            onClick: () => {
              setFocusedIndex(index);
              onSelect?.(item, index);
            },
            children: renderItem(item, index, {
              focused,
              index,
              selected,
            }),
          },
          key,
        );
      }),
    }),
  });
}

const List = forwardRef(ListInner) as (<T>(
  props: ListProps<T> & RefAttributes<ListHandle>,
) => ReactElement | null) & {
  displayName?: string;
};

List.displayName = "List";

export default List;
