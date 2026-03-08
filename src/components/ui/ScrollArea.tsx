// @ts-nocheck
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

const cx = (...parts) => parts.filter(Boolean).join(" ");

const MIN_THUMB_SIZE = 24;

const ScrollArea = forwardRef(
  (
    {
      children,
      className = "",
      viewportClassName = "",
      axis = "y", // y | x | both
      viewportProps = {},
      ...props
    },
    ref,
  ) => {
    const viewportRef = useRef(null);
    const dragRef = useRef(null);
    const metricsRafRef = useRef(0);
    const viewportScrollHandlerRef = useRef(null);

    const [metrics, setMetrics] = useState({
      showY: false,
      showX: false,
      yThumbSize: 0,
      xThumbSize: 0,
      yThumbOffset: 0,
      xThumbOffset: 0,
    });

    const allowY = axis === "y" || axis === "both";
    const allowX = axis === "x" || axis === "both";

    const {
      onScroll: onViewportScroll,
      className: viewportPropsClassName,
      ...restViewportProps
    } = viewportProps || {};

    const updateMetrics = useCallback(() => {
      const viewport = viewportRef.current;
      if (!viewport) return;

      const { scrollHeight, clientHeight, scrollTop, scrollWidth, clientWidth, scrollLeft } = viewport;

      const canScrollY = allowY && scrollHeight > clientHeight + 1;
      const canScrollX = allowX && scrollWidth > clientWidth + 1;

      const yThumbSize = canScrollY
        ? Math.max(MIN_THUMB_SIZE, (clientHeight / scrollHeight) * clientHeight)
        : 0;
      const xThumbSize = canScrollX
        ? Math.max(MIN_THUMB_SIZE, (clientWidth / scrollWidth) * clientWidth)
        : 0;

      const yMaxOffset = Math.max(0, clientHeight - yThumbSize);
      const xMaxOffset = Math.max(0, clientWidth - xThumbSize);
      const yScrollMax = Math.max(1, scrollHeight - clientHeight);
      const xScrollMax = Math.max(1, scrollWidth - clientWidth);

      const nextMetrics = {
        showY: canScrollY,
        showX: canScrollX,
        yThumbSize,
        xThumbSize,
        yThumbOffset: canScrollY ? (scrollTop / yScrollMax) * yMaxOffset : 0,
        xThumbOffset: canScrollX ? (scrollLeft / xScrollMax) * xMaxOffset : 0,
      };

      setMetrics((prev) => {
        const nearlyEqual =
          prev.showY === nextMetrics.showY &&
          prev.showX === nextMetrics.showX &&
          Math.abs(prev.yThumbSize - nextMetrics.yThumbSize) < 0.5 &&
          Math.abs(prev.xThumbSize - nextMetrics.xThumbSize) < 0.5 &&
          Math.abs(prev.yThumbOffset - nextMetrics.yThumbOffset) < 0.5 &&
          Math.abs(prev.xThumbOffset - nextMetrics.xThumbOffset) < 0.5;
        return nearlyEqual ? prev : nextMetrics;
      });
    }, [allowX, allowY]);

    const scheduleMetricsUpdate = useCallback(() => {
      if (metricsRafRef.current) return;
      metricsRafRef.current = requestAnimationFrame(() => {
        metricsRafRef.current = 0;
        updateMetrics();
      });
    }, [updateMetrics]);

    useImperativeHandle(ref, () => viewportRef.current);

    useLayoutEffect(() => {
      scheduleMetricsUpdate();
      return () => {
        if (metricsRafRef.current) {
          cancelAnimationFrame(metricsRafRef.current);
          metricsRafRef.current = 0;
        }
      };
    }, [children, scheduleMetricsUpdate]);

    useEffect(() => {
      viewportScrollHandlerRef.current =
        typeof onViewportScroll === "function" ? onViewportScroll : null;
    }, [onViewportScroll]);

    useEffect(() => {
      const viewport = viewportRef.current;
      if (!viewport) return;

      const onScroll = (event) => {
        scheduleMetricsUpdate();
        if (viewportScrollHandlerRef.current) {
          viewportScrollHandlerRef.current(event);
        }
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
        if (metricsRafRef.current) {
          cancelAnimationFrame(metricsRafRef.current);
          metricsRafRef.current = 0;
        }
      };
    }, [scheduleMetricsUpdate]);

    useEffect(() => {
      const onMouseMove = (event) => {
        const drag = dragRef.current;
        const viewport = viewportRef.current;
        if (!drag || !viewport) return;

        if (drag.axis === "y") {
          const delta = event.clientY - drag.startPointer;
          const trackRange = Math.max(1, viewport.clientHeight - drag.thumbSize);
          const scrollRange = Math.max(1, viewport.scrollHeight - viewport.clientHeight);
          viewport.scrollTop = drag.startScroll + (delta * scrollRange) / trackRange;
        } else {
          const delta = event.clientX - drag.startPointer;
          const trackRange = Math.max(1, viewport.clientWidth - drag.thumbSize);
          const scrollRange = Math.max(1, viewport.scrollWidth - viewport.clientWidth);
          viewport.scrollLeft = drag.startScroll + (delta * scrollRange) / trackRange;
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

    const startDrag = (dragAxis, event) => {
      const viewport = viewportRef.current;
      if (!viewport) return;
      event.preventDefault();

      dragRef.current =
        dragAxis === "y"
          ? {
              axis: "y",
              startPointer: event.clientY,
              startScroll: viewport.scrollTop,
              thumbSize: metrics.yThumbSize,
            }
          : {
              axis: "x",
              startPointer: event.clientX,
              startScroll: viewport.scrollLeft,
              thumbSize: metrics.xThumbSize,
            };
    };

    const jumpToTrackPosition = (trackAxis, event) => {
      if (event.target !== event.currentTarget) return;
      const viewport = viewportRef.current;
      if (!viewport) return;

      const rect = event.currentTarget.getBoundingClientRect();
      if (trackAxis === "y") {
        const clickOffset = event.clientY - rect.top;
        const maxThumbTravel = Math.max(1, viewport.clientHeight - metrics.yThumbSize);
        const ratio = Math.max(0, Math.min(1, (clickOffset - metrics.yThumbSize / 2) / maxThumbTravel));
        viewport.scrollTop = ratio * Math.max(0, viewport.scrollHeight - viewport.clientHeight);
      } else {
        const clickOffset = event.clientX - rect.left;
        const maxThumbTravel = Math.max(1, viewport.clientWidth - metrics.xThumbSize);
        const ratio = Math.max(0, Math.min(1, (clickOffset - metrics.xThumbSize / 2) / maxThumbTravel));
        viewport.scrollLeft = ratio * Math.max(0, viewport.scrollWidth - viewport.clientWidth);
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
              className="scroll-area__thumb scroll-area__thumb--y"
              style={{
                height: `${metrics.yThumbSize}px`,
                transform: `translateY(${metrics.yThumbOffset}px)`,
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
              className="scroll-area__thumb scroll-area__thumb--x"
              style={{
                width: `${metrics.xThumbSize}px`,
                transform: `translateX(${metrics.xThumbOffset}px)`,
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
