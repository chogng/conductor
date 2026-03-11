import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type HTMLAttributes,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";

const cx = (...parts: Array<string | false | null | undefined>): string =>
  parts.filter(Boolean).join(" ");

const MIN_THUMB_SIZE = 24;

type ScrollAxis = "x" | "y" | "both";

type ViewportProps = Omit<HTMLAttributes<HTMLDivElement>, "onScroll"> & {
  onScroll?: (event: Event) => void;
};

type ScrollAreaProps = HTMLAttributes<HTMLDivElement> & {
  children?: ReactNode;
  viewportClassName?: string;
  axis?: ScrollAxis;
  viewportProps?: ViewportProps;
};

type ScrollMetrics = {
  showY: boolean;
  showX: boolean;
  yThumbSize: number;
  xThumbSize: number;
};

type DragState = {
  axis: "x" | "y";
  startPointer: number;
  startScroll: number;
  thumbSize: number;
};

const ScrollArea = forwardRef<HTMLDivElement | null, ScrollAreaProps>(
  (
    {
      children,
      className = "",
      viewportClassName = "",
      axis = "y",
      viewportProps = {},
      ...props
    },
    ref,
  ) => {
    const viewportRef = useRef<HTMLDivElement | null>(null);
    const yThumbRef = useRef<HTMLDivElement | null>(null);
    const xThumbRef = useRef<HTMLDivElement | null>(null);
    const dragRef = useRef<DragState | null>(null);
    const metricsRafRef = useRef<number | null>(null);
    const thumbOffsetsRafRef = useRef<number | null>(null);
    const thumbOffsetRef = useRef({ x: 0, y: 0 });
    const metricsRef = useRef<ScrollMetrics>({
      showY: false,
      showX: false,
      yThumbSize: 0,
      xThumbSize: 0,
    });
    const viewportScrollHandlerRef = useRef<((event: Event) => void) | null>(
      null,
    );

    const [metrics, setMetrics] = useState<ScrollMetrics>({
      showY: false,
      showX: false,
      yThumbSize: 0,
      xThumbSize: 0,
    });

    const allowY = axis === "y" || axis === "both";
    const allowX = axis === "x" || axis === "both";

    const {
      onScroll: onViewportScroll,
      className: viewportPropsClassName,
      ...restViewportProps
    } = viewportProps;

    const updateThumbOffsets = useCallback(() => {
      const viewport = viewportRef.current;
      if (!viewport) return;

      const nextMetrics = metricsRef.current;
      const {
        scrollHeight,
        clientHeight,
        scrollTop,
        scrollWidth,
        clientWidth,
        scrollLeft,
      } = viewport;

      if (nextMetrics.showY && nextMetrics.yThumbSize > 0) {
        const yMaxOffset = Math.max(0, clientHeight - nextMetrics.yThumbSize);
        const yScrollMax = Math.max(1, scrollHeight - clientHeight);
        const yThumbOffset = (scrollTop / yScrollMax) * yMaxOffset;
        if (Math.abs(thumbOffsetRef.current.y - yThumbOffset) >= 0.25) {
          thumbOffsetRef.current.y = yThumbOffset;
          if (yThumbRef.current) {
            yThumbRef.current.style.transform = `translate3d(0, ${yThumbOffset}px, 0)`;
          }
        }
      } else {
        thumbOffsetRef.current.y = 0;
        if (yThumbRef.current) {
          yThumbRef.current.style.transform = "translate3d(0, 0, 0)";
        }
      }

      if (nextMetrics.showX && nextMetrics.xThumbSize > 0) {
        const xMaxOffset = Math.max(0, clientWidth - nextMetrics.xThumbSize);
        const xScrollMax = Math.max(1, scrollWidth - clientWidth);
        const xThumbOffset = (scrollLeft / xScrollMax) * xMaxOffset;
        if (Math.abs(thumbOffsetRef.current.x - xThumbOffset) >= 0.25) {
          thumbOffsetRef.current.x = xThumbOffset;
          if (xThumbRef.current) {
            xThumbRef.current.style.transform = `translate3d(${xThumbOffset}px, 0, 0)`;
          }
        }
      } else {
        thumbOffsetRef.current.x = 0;
        if (xThumbRef.current) {
          xThumbRef.current.style.transform = "translate3d(0, 0, 0)";
        }
      }
    }, []);

    const updateMetrics = useCallback(() => {
      const viewport = viewportRef.current;
      if (!viewport) return;

      const {
        scrollHeight,
        clientHeight,
        scrollWidth,
        clientWidth,
      } = viewport;

      const canScrollY = allowY && scrollHeight > clientHeight + 1;
      const canScrollX = allowX && scrollWidth > clientWidth + 1;

      const yThumbSize = canScrollY
        ? Math.max(MIN_THUMB_SIZE, (clientHeight / scrollHeight) * clientHeight)
        : 0;
      const xThumbSize = canScrollX
        ? Math.max(MIN_THUMB_SIZE, (clientWidth / scrollWidth) * clientWidth)
        : 0;

      const nextMetrics: ScrollMetrics = {
        showY: canScrollY,
        showX: canScrollX,
        yThumbSize,
        xThumbSize,
      };

      metricsRef.current = nextMetrics;

      setMetrics((prev) => {
        const nearlyEqual =
          prev.showY === nextMetrics.showY &&
          prev.showX === nextMetrics.showX &&
          Math.abs(prev.yThumbSize - nextMetrics.yThumbSize) < 0.5 &&
          Math.abs(prev.xThumbSize - nextMetrics.xThumbSize) < 0.5;
        return nearlyEqual ? prev : nextMetrics;
      });
      updateThumbOffsets();
    }, [allowX, allowY, updateThumbOffsets]);

    const scheduleMetricsUpdate = useCallback(() => {
      if (metricsRafRef.current != null) return;
      metricsRafRef.current = requestAnimationFrame(() => {
        metricsRafRef.current = null;
        updateMetrics();
      });
    }, [updateMetrics]);

    const scheduleThumbOffsetsUpdate = useCallback(() => {
      if (thumbOffsetsRafRef.current != null) return;
      thumbOffsetsRafRef.current = requestAnimationFrame(() => {
        thumbOffsetsRafRef.current = null;
        updateThumbOffsets();
      });
    }, [updateThumbOffsets]);

    useImperativeHandle(ref, () => viewportRef.current as HTMLDivElement, []);

    useLayoutEffect(() => {
      scheduleMetricsUpdate();
      return () => {
        if (metricsRafRef.current != null) {
          cancelAnimationFrame(metricsRafRef.current);
          metricsRafRef.current = null;
        }
        if (thumbOffsetsRafRef.current != null) {
          cancelAnimationFrame(thumbOffsetsRafRef.current);
          thumbOffsetsRafRef.current = null;
        }
      };
    }, [children, scheduleMetricsUpdate]);

    useLayoutEffect(() => {
      updateThumbOffsets();
    }, [
      metrics.showX,
      metrics.showY,
      metrics.xThumbSize,
      metrics.yThumbSize,
      updateThumbOffsets,
    ]);

    useEffect(() => {
      viewportScrollHandlerRef.current =
        typeof onViewportScroll === "function" ? onViewportScroll : null;
    }, [onViewportScroll]);

    useEffect(() => {
      const viewport = viewportRef.current;
      if (!viewport) return;

      const onScroll = (event: Event) => {
        scheduleThumbOffsetsUpdate();
        viewportScrollHandlerRef.current?.(event);
      };
      viewport.addEventListener("scroll", onScroll, { passive: true });

      const ro = new ResizeObserver(() => scheduleMetricsUpdate());
      ro.observe(viewport);

      const contentEl = viewport.firstElementChild;
      if (contentEl) ro.observe(contentEl);

      scheduleMetricsUpdate();
      window.addEventListener("resize", scheduleMetricsUpdate);
      return () => {
        viewport.removeEventListener("scroll", onScroll);
        ro.disconnect();
        window.removeEventListener("resize", scheduleMetricsUpdate);
        if (metricsRafRef.current != null) {
          cancelAnimationFrame(metricsRafRef.current);
          metricsRafRef.current = null;
        }
        if (thumbOffsetsRafRef.current != null) {
          cancelAnimationFrame(thumbOffsetsRafRef.current);
          thumbOffsetsRafRef.current = null;
        }
      };
    }, [scheduleMetricsUpdate, scheduleThumbOffsetsUpdate]);

    useEffect(() => {
      const onMouseMove = (event: MouseEvent) => {
        const drag = dragRef.current;
        const viewport = viewportRef.current;
        if (!drag || !viewport) return;

        if (drag.axis === "y") {
          const delta = event.clientY - drag.startPointer;
          const trackRange = Math.max(1, viewport.clientHeight - drag.thumbSize);
          const scrollRange = Math.max(
            1,
            viewport.scrollHeight - viewport.clientHeight,
          );
          viewport.scrollTop = drag.startScroll + (delta * scrollRange) / trackRange;
        } else {
          const delta = event.clientX - drag.startPointer;
          const trackRange = Math.max(1, viewport.clientWidth - drag.thumbSize);
          const scrollRange = Math.max(
            1,
            viewport.scrollWidth - viewport.clientWidth,
          );
          viewport.scrollLeft =
            drag.startScroll + (delta * scrollRange) / trackRange;
        }
      };

      const onMouseUp = () => {
        dragRef.current = null;
      };

      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp);
      return () => {
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("mouseup", onMouseUp);
      };
    }, []);

    const startDrag = (
      dragAxis: "x" | "y",
      event: ReactMouseEvent<HTMLDivElement>,
    ) => {
      const viewport = viewportRef.current;
      if (!viewport) return;
      event.preventDefault();

      dragRef.current =
        dragAxis === "y"
          ? {
              axis: "y",
              startPointer: event.clientY,
              startScroll: viewport.scrollTop,
              thumbSize: metricsRef.current.yThumbSize,
            }
          : {
              axis: "x",
              startPointer: event.clientX,
              startScroll: viewport.scrollLeft,
              thumbSize: metricsRef.current.xThumbSize,
            };
    };

    const jumpToTrackPosition = (
      trackAxis: "x" | "y",
      event: ReactMouseEvent<HTMLDivElement>,
    ) => {
      if (event.target !== event.currentTarget) return;
      const viewport = viewportRef.current;
      if (!viewport) return;

      const rect = event.currentTarget.getBoundingClientRect();
      if (trackAxis === "y") {
        const yThumbSize = metricsRef.current.yThumbSize;
        const clickOffset = event.clientY - rect.top;
        const maxThumbTravel = Math.max(1, viewport.clientHeight - yThumbSize);
        const ratio = Math.max(
          0,
          Math.min(1, (clickOffset - yThumbSize / 2) / maxThumbTravel),
        );
        viewport.scrollTop =
          ratio * Math.max(0, viewport.scrollHeight - viewport.clientHeight);
      } else {
        const xThumbSize = metricsRef.current.xThumbSize;
        const clickOffset = event.clientX - rect.left;
        const maxThumbTravel = Math.max(1, viewport.clientWidth - xThumbSize);
        const ratio = Math.max(
          0,
          Math.min(1, (clickOffset - xThumbSize / 2) / maxThumbTravel),
        );
        viewport.scrollLeft =
          ratio * Math.max(0, viewport.scrollWidth - viewport.clientWidth);
      }
    };

    return (
      <div {...props} className={cx("scroll-area", className)}>
        <div
          ref={viewportRef}
          className={cx(
            "scroll-area__viewport",
            viewportClassName,
            viewportPropsClassName,
          )}
          data-axis={axis}
          {...restViewportProps}
        >
          {children}
        </div>

        {metrics.showY ? (
          <div
            className="scroll-area__track scroll-area__track--y"
            onMouseDown={(event) => jumpToTrackPosition("y", event)}
          >
            <div
              ref={yThumbRef}
              className="scroll-area__thumb scroll-area__thumb--y"
              style={{
                height: `${metrics.yThumbSize}px`,
              }}
              onMouseDown={(event) => startDrag("y", event)}
            />
          </div>
        ) : null}

        {metrics.showX ? (
          <div
            className="scroll-area__track scroll-area__track--x"
            onMouseDown={(event) => jumpToTrackPosition("x", event)}
          >
            <div
              ref={xThumbRef}
              className="scroll-area__thumb scroll-area__thumb--x"
              style={{
                width: `${metrics.xThumbSize}px`,
              }}
              onMouseDown={(event) => startDrag("x", event)}
            />
          </div>
        ) : null}
      </div>
    );
  },
);

ScrollArea.displayName = "ScrollArea";

export default ScrollArea;
