import { jsx } from "react/jsx-runtime";
import {
  forwardRef,
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ForwardedRef,
  type HTMLAttributes,
  type MutableRefObject,
  type ReactNode,
} from "react";
import { DisposableResizeObserver, getWindow } from "src/cs/base/browser/dom";
import GridView from "src/cs/base/browser/ui/gridview/gridview";
import Sash, { type SashDragEvent } from "src/cs/base/browser/ui/sash/sash";
import { cx } from "src/utils/cx";

export type SplitViewOrientation = "horizontal" | "vertical";

export type SplitViewPane = {
  readonly id: string;
  readonly children: ReactNode;
  readonly className?: string;
  readonly defaultSize?: number;
  readonly maxSize?: number;
  readonly minSize?: number;
  readonly size?: number;
};

export type SplitViewResizeEvent = {
  readonly sizes: readonly number[];
  readonly paneIndex: number;
};

export type SplitViewProps = HTMLAttributes<HTMLDivElement> & {
  readonly gap?: number;
  readonly onDidResize?: (event: SplitViewResizeEvent) => void;
  readonly onDidResizeEnd?: (event: SplitViewResizeEvent) => void;
  readonly orientation?: SplitViewOrientation;
  readonly panes: readonly SplitViewPane[];
};

const DEFAULT_PANE_MIN_SIZE = 0;

const assignRef = <T,>(ref: ForwardedRef<T>, value: T | null) => {
  if (typeof ref === "function") {
    ref(value);
    return;
  }

  if (ref) {
    (ref as MutableRefObject<T | null>).current = value;
  }
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

const getPaneMinSize = (pane: SplitViewPane) =>
  Math.max(0, pane.minSize ?? DEFAULT_PANE_MIN_SIZE);

const getPaneMaxSize = (pane: SplitViewPane) =>
  Math.max(getPaneMinSize(pane), pane.maxSize ?? Number.POSITIVE_INFINITY);

const normalizeSizes = (
  panes: readonly SplitViewPane[],
  previousSizes: readonly number[],
  availableSize: number,
) => {
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

  for (let pass = 0; pass < panes.length && Math.abs(delta) >= 0.5; pass += 1) {
    for (let index = panes.length - 1; index >= 0 && Math.abs(delta) >= 0.5; index -= 1) {
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

const resizeAdjacentPanes = (
  panes: readonly SplitViewPane[],
  sizes: readonly number[],
  paneIndex: number,
  delta: number,
) => {
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

const areSizesEqual = (left: readonly number[], right: readonly number[]) =>
  left.length === right.length &&
  left.every((value, index) => Math.abs(value - right[index]) < 0.5);

const SplitView = forwardRef<HTMLDivElement, SplitViewProps>(
  (
    {
      className = "",
      gap = 0,
      onDidResize,
      onDidResizeEnd,
      orientation = "horizontal",
      panes,
      style,
      ...props
    },
    ref,
  ) => {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const dragRef = useRef<{
      readonly paneIndex: number;
      lastSizes?: readonly number[];
      readonly sizes: readonly number[];
    } | null>(null);
    const [containerSize, setContainerSize] = useState(0);
    const [sizes, setSizes] = useState<readonly number[]>([]);
    const [resizingPaneIndex, setResizingPaneIndex] = useState<number | null>(null);
    const sashOrientation = orientation === "horizontal" ? "vertical" : "horizontal";
    const paneLayoutKey = panes
      .map((pane) => [
        pane.id,
        pane.defaultSize ?? "",
        pane.maxSize ?? "",
        pane.minSize ?? "",
        pane.size ?? "",
      ].join(":"))
      .join("|");
    const offsets = useMemo(() => {
      let offset = 0;

      return sizes.slice(0, -1).map((size, index) => {
        offset += size;
        return offset + gap * index + gap / 2;
      });
    }, [gap, sizes]);
    const availableSize = Math.max(0, containerSize - Math.max(0, panes.length - 1) * gap);
    const setContainerRef = useCallback((node: HTMLDivElement | null) => {
      containerRef.current = node;
      assignRef(ref, node);
    }, [ref]);

    useLayoutEffect(() => {
      const element = containerRef.current;

      if (!element) {
        return undefined;
      }

      const updateSize = () => {
        const nextSize = orientation === "horizontal"
          ? element.clientWidth
          : element.clientHeight;

        setContainerSize(nextSize);
      };
      const resizeObserver = new DisposableResizeObserver(getWindow(element), updateSize);
      const disposable = resizeObserver.observe(element);

      updateSize();

      return () => {
        disposable.dispose();
        resizeObserver.dispose();
      };
    }, [orientation]);

    useLayoutEffect(() => {
      setSizes((previousSizes) => {
        const nextSizes = normalizeSizes(panes, previousSizes, availableSize);
        return areSizesEqual(previousSizes, nextSizes) ? previousSizes : nextSizes;
      });
    }, [availableSize, paneLayoutKey]);

    const startResize = (paneIndex: number) => {
      dragRef.current = {
        paneIndex,
        sizes,
      };
      setResizingPaneIndex(paneIndex);
    };

    const changeResize = (event: SashDragEvent) => {
      const drag = dragRef.current;

      if (!drag) {
        return;
      }

      const delta = orientation === "horizontal" ? event.deltaX : event.deltaY;
      const nextSizes = resizeAdjacentPanes(panes, drag.sizes, drag.paneIndex, delta);

      drag.lastSizes = nextSizes;
      setSizes(nextSizes);
      onDidResize?.({
        paneIndex: drag.paneIndex,
        sizes: nextSizes,
      });
    };

    const endResize = () => {
      const drag = dragRef.current;

      if (drag?.lastSizes) {
        onDidResizeEnd?.({
          paneIndex: drag.paneIndex,
          sizes: drag.lastSizes,
        });
      }

      dragRef.current = null;
      setResizingPaneIndex(null);
    };

    return jsx("div", {
      ...props,
      ref: setContainerRef,
      className: cx("ui-split-view", className),
      "data-orientation": orientation,
      "data-resizing": resizingPaneIndex === null ? "false" : "true",
      style,
      children: [
        jsx(GridView, {
          className: "ui-split-view__grid",
          gap,
          items: panes.map((pane) => ({
            id: pane.id,
            className: cx("ui-split-view__pane", pane.className),
            children: pane.children,
          })),
          orientation,
          sizes,
        }, "grid"),
        offsets.map((offset, index) => {
          const sashStyle: CSSProperties = orientation === "horizontal"
            ? {
                left: `${offset - 5}px`,
              }
            : {
                top: `${offset - 5}px`,
              };

          return jsx(Sash, {
            active: resizingPaneIndex === index,
            className: "ui-split-view__sash",
            orientation: sashOrientation,
            style: sashStyle,
            onDidStart: () => startResize(index),
            onDidChange: changeResize,
            onDidEnd: endResize,
          }, `${panes[index]?.id ?? index}-sash`);
        }),
      ],
    });
  },
);

SplitView.displayName = "SplitView";

export default SplitView;
