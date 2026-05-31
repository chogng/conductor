import { jsx } from "react/jsx-runtime";
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import { cx } from "src/utils/cx";
import { ScrollbarController } from "src/cs/base/browser/ui/scrollbar/scrollbarController";
import type { ScrollbarAxis } from "src/cs/base/browser/ui/scrollbar/scrollbarOptions";

type ViewportProps = Omit<HTMLAttributes<HTMLDivElement>, "onScroll"> & {
  onScroll?: (event: Event) => void;
};

export type ScrollbarProps = HTMLAttributes<HTMLDivElement> & {
  children?: ReactNode;
  viewportClassName?: string;
  axis?: ScrollbarAxis;
  observeContentMutations?: boolean;
  viewportProps?: ViewportProps;
};

const Scrollbar = forwardRef<HTMLDivElement | null, ScrollbarProps>(({
  children,
  className = "",
  viewportClassName = "",
  axis = "y",
  observeContentMutations = true,
  viewportProps = {},
  ...props
}, ref) => {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const controllerRef = useRef<ScrollbarController | null>(null);
  const { onScroll, className: viewportPropsClassName, ...restViewportProps } = viewportProps;

  useImperativeHandle(ref, () => viewportRef.current as HTMLDivElement, []);

  useLayoutEffect(() => {
    const root = rootRef.current;
    const viewport = viewportRef.current;
    if (!root || !viewport) {
      return;
    }

    const controller = new ScrollbarController({
      axis,
      observeContentMutations,
      onScroll,
      root,
      viewport,
    });
    controllerRef.current = controller;

    return () => {
      controller.dispose();
      controllerRef.current = null;
    };
  }, []);

  useEffect(() => {
    controllerRef.current?.setOptions({
      axis,
      observeContentMutations,
      onScroll,
    });
  }, [axis, observeContentMutations, onScroll]);

  useLayoutEffect(() => {
    controllerRef.current?.update();
  }, [children]);

  return jsx("div", {
    ...props,
    ref: rootRef,
    className: cx("scrollArea", className),
    children: jsx("div", {
      ref: viewportRef,
      className: cx("scrollAreaViewport", viewportClassName, viewportPropsClassName),
      "data-axis": axis,
      ...restViewportProps,
      children,
    }),
  });
});

Scrollbar.displayName = "Scrollbar";

export default Scrollbar;

