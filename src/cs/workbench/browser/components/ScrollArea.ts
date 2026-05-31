import { jsx } from "react/jsx-runtime";
import { createPortal } from "react-dom";
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type HTMLAttributes,
  type ReactNode,
} from "react";

import Scrollbar, {
  type ScrollbarOptions,
} from "src/cs/base/browser/ui/scrollbar/scrollbar";

type ViewportProps = Omit<HTMLAttributes<HTMLDivElement>, "onScroll" | "className"> & {
  className?: string;
  onScroll?: (event: Event) => void;
};

export type ScrollAreaProps = HTMLAttributes<HTMLDivElement> & {
  axis?: ScrollbarOptions["axis"];
  children?: ReactNode;
  observeContentMutations?: boolean;
  viewportClassName?: string;
  viewportProps?: ViewportProps;
};

const ScrollArea = forwardRef<HTMLDivElement, ScrollAreaProps>(({
  axis = "y",
  children,
  className = "",
  observeContentMutations = true,
  viewportClassName = "",
  viewportProps = {},
  ...props
}, ref) => {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const scrollbarRef = useRef<Scrollbar | null>(null);
  const [viewportElement, setViewportElement] = useState<HTMLDivElement | null>(null);
  const { className: viewportPropsClassName = "", onScroll, ...restViewportProps } = viewportProps;
  const resolvedViewportClassName = [viewportClassName, viewportPropsClassName].filter(Boolean).join(" ");

  useImperativeHandle(ref, () => scrollbarRef.current?.viewport as HTMLDivElement, []);

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return;
    }

    scrollbarRef.current = new Scrollbar({
      axis,
      className,
      observeContentMutations,
      onScroll,
      viewportClassName: resolvedViewportClassName,
    });
    host.replaceChildren(scrollbarRef.current.element);
    setViewportElement(scrollbarRef.current.viewport);

    return () => {
      scrollbarRef.current?.dispose();
      scrollbarRef.current = null;
      setViewportElement(null);
    };
  }, []);

  useEffect(() => {
    scrollbarRef.current?.update({
      axis,
      className,
      observeContentMutations,
      onScroll,
      viewportClassName: resolvedViewportClassName,
    });
  }, [axis, className, observeContentMutations, onScroll, resolvedViewportClassName]);

  useLayoutEffect(() => {
    const viewport = scrollbarRef.current?.viewport;
    if (!viewport) {
      return;
    }

    for (const [key, value] of Object.entries(restViewportProps)) {
      if (value === undefined || value === null) {
        viewport.removeAttribute(key);
      } else {
        viewport.setAttribute(key, String(value));
      }
    }
  }, [restViewportProps]);

  useLayoutEffect(() => {
    scrollbarRef.current?.layout();
  }, [children]);

  return [
    jsx("div", {
      ...props,
      ref: hostRef,
      style: {
        display: "contents",
      },
    }, "host"),
    viewportElement ? createPortal(children, viewportElement) : null,
  ];
});

ScrollArea.displayName = "ScrollArea";

export default ScrollArea;
