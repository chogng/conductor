import { jsx } from "react/jsx-runtime";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type HTMLAttributes, type MouseEvent as ReactMouseEvent, type ReactNode, } from "react";
import { addDisposableListener, combinedDisposable, EventType } from "src/cs/base/browser/event";
import { DisposableResizeObserver, getDomRect, getScrollDimensions, getScrollPosition, observeMutations, scheduleAtNextAnimationFrame } from "src/cs/base/browser/dom";
import { StandardMouseEvent } from "src/cs/base/browser/mouseEvent";
import { cx } from "src/utils/cx";
import "./scrollbar.css";

const MIN_THUMB_SIZE = 24;
const WHEEL_LINE_DELTA_PX = 40;
const HORIZONTAL_WHEEL_SMOOTHING = 0.24;
const HORIZONTAL_WHEEL_STOP_THRESHOLD_PX = 0.5;
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
type WheelClassifierItem = {
    deltaX: number;
    deltaY: number;
    score: number;
};
class WheelClassifier {
    private readonly capacity = 5;
    private readonly memory: WheelClassifierItem[] = [];
    accept(deltaX: number, deltaY: number): void {
        const item: WheelClassifierItem = {
            deltaX,
            deltaY,
            score: this.computeScore(deltaX, deltaY),
        };
        this.memory.push(item);
        if (this.memory.length > this.capacity) {
            this.memory.shift();
        }
    }
    isPhysicalWheel(): boolean {
        if (!this.memory.length)
            return false;
        let remainingInfluence = 1;
        let score = 0;
        for (let index = this.memory.length - 1; index >= 0; index -= 1) {
            const influence = index === 0 ? remainingInfluence : Math.pow(2, index - this.memory.length);
            remainingInfluence -= influence;
            score += this.memory[index].score * influence;
        }
        return score <= 0.5;
    }
    private computeScore(deltaX: number, deltaY: number): number {
        if (Math.abs(deltaX) > 0 && Math.abs(deltaY) > 0)
            return 1;
        let score = 0.5;
        if (!this.isAlmostInteger(deltaX) || !this.isAlmostInteger(deltaY)) {
            score += 0.25;
        }
        return Math.min(Math.max(score, 0), 1);
    }
    private isAlmostInteger(value: number): boolean {
        return Math.abs(Math.round(value) - value) < 0.01;
    }
}
const ScrollArea = forwardRef<HTMLDivElement | null, ScrollAreaProps>(({ children, className = "", viewportClassName = "", axis = "y", viewportProps = {}, ...props }, ref) => {
    const viewportRef = useRef<HTMLDivElement | null>(null);
    const yThumbRef = useRef<HTMLDivElement | null>(null);
    const xThumbRef = useRef<HTMLDivElement | null>(null);
    const dragRef = useRef<DragState | null>(null);
    const metricsRafRef = useRef<{ dispose(): void } | null>(null);
    const thumbOffsetsRafRef = useRef<{ dispose(): void } | null>(null);
    const horizontalWheelRafRef = useRef<{ dispose(): void } | null>(null);
    const thumbOffsetRef = useRef({ x: 0, y: 0 });
    const horizontalWheelTargetRef = useRef(0);
    const wheelClassifierRef = useRef(new WheelClassifier());
    const metricsRef = useRef<ScrollMetrics>({
        showY: false,
        showX: false,
        yThumbSize: 0,
        xThumbSize: 0,
    });
    const viewportScrollHandlerRef = useRef<((event: Event) => void) | null>(null);
    const [metrics, setMetrics] = useState<ScrollMetrics>({
        showY: false,
        showX: false,
        yThumbSize: 0,
        xThumbSize: 0,
    });
    const allowY = axis === "y" || axis === "both";
    const allowX = axis === "x" || axis === "both";
    const { onScroll: onViewportScroll, className: viewportPropsClassName, ...restViewportProps } = viewportProps;
    const updateThumbOffsets = useCallback(() => {
        const viewport = viewportRef.current;
        if (!viewport)
            return;
        const nextMetrics = metricsRef.current;
        const { scrollHeight, clientHeight, scrollWidth, clientWidth } = getScrollDimensions(viewport);
        const { scrollTop, scrollLeft } = getScrollPosition(viewport);
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
        }
        else {
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
        }
        else {
            thumbOffsetRef.current.x = 0;
            if (xThumbRef.current) {
                xThumbRef.current.style.transform = "translate3d(0, 0, 0)";
            }
        }
    }, []);
    const normalizeWheelDelta = useCallback((event: WheelEvent, delta: number) => {
        if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) {
            return delta * WHEEL_LINE_DELTA_PX;
        }
        if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) {
            return delta * Math.max(1, viewportRef.current ? getScrollDimensions(viewportRef.current).clientWidth : 1);
        }
        return delta;
    }, []);
    const cancelHorizontalWheelAnimation = useCallback(() => {
        if (horizontalWheelRafRef.current == null)
            return;
        horizontalWheelRafRef.current.dispose();
        horizontalWheelRafRef.current = null;
    }, []);
    const scrollHorizontalNow = useCallback((scrollLeft: number) => {
        const viewport = viewportRef.current;
        if (!viewport)
            return;
        cancelHorizontalWheelAnimation();
        horizontalWheelTargetRef.current = scrollLeft;
        viewport.scrollLeft = scrollLeft;
    }, [cancelHorizontalWheelAnimation]);
    const scrollHorizontalSmooth = useCallback((targetScrollLeft: number) => {
        const viewport = viewportRef.current;
        if (!viewport)
            return;
        horizontalWheelTargetRef.current = targetScrollLeft;
        if (horizontalWheelRafRef.current != null)
            return;
        const tick = () => {
            const nextViewport = viewportRef.current;
            if (!nextViewport) {
                horizontalWheelRafRef.current = null;
                return;
            }
            const target = horizontalWheelTargetRef.current;
            const delta = target - getScrollPosition(nextViewport).scrollLeft;
            if (Math.abs(delta) <= HORIZONTAL_WHEEL_STOP_THRESHOLD_PX) {
                nextViewport.scrollLeft = target;
                horizontalWheelRafRef.current = null;
                return;
            }
            nextViewport.scrollLeft =
                nextViewport.scrollLeft + delta * HORIZONTAL_WHEEL_SMOOTHING;
            horizontalWheelRafRef.current = scheduleAtNextAnimationFrame(window, tick);
        };
        horizontalWheelRafRef.current = scheduleAtNextAnimationFrame(window, tick);
    }, []);
    const updateMetrics = useCallback(() => {
        const viewport = viewportRef.current;
        if (!viewport)
            return;
        const { scrollHeight, clientHeight, scrollWidth, clientWidth } = getScrollDimensions(viewport);
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
            const nearlyEqual = prev.showY === nextMetrics.showY &&
                prev.showX === nextMetrics.showX &&
                Math.abs(prev.yThumbSize - nextMetrics.yThumbSize) < 0.5 &&
                Math.abs(prev.xThumbSize - nextMetrics.xThumbSize) < 0.5;
            return nearlyEqual ? prev : nextMetrics;
        });
        updateThumbOffsets();
    }, [allowX, allowY, updateThumbOffsets]);
    const scheduleMetricsUpdate = useCallback(() => {
        if (metricsRafRef.current != null)
            return;
        metricsRafRef.current = scheduleAtNextAnimationFrame(window, () => {
            metricsRafRef.current = null;
            updateMetrics();
        });
    }, [updateMetrics]);
    const scheduleThumbOffsetsUpdate = useCallback(() => {
        if (thumbOffsetsRafRef.current != null)
            return;
        thumbOffsetsRafRef.current = scheduleAtNextAnimationFrame(window, () => {
            thumbOffsetsRafRef.current = null;
            updateThumbOffsets();
        });
    }, [updateThumbOffsets]);
    useImperativeHandle(ref, () => viewportRef.current as HTMLDivElement, []);
    useLayoutEffect(() => {
        scheduleMetricsUpdate();
        return () => {
            if (metricsRafRef.current != null) {
                metricsRafRef.current.dispose();
                metricsRafRef.current = null;
            }
            if (thumbOffsetsRafRef.current != null) {
                thumbOffsetsRafRef.current.dispose();
                thumbOffsetsRafRef.current = null;
            }
        };
    }, [scheduleMetricsUpdate]);
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
        if (!viewport)
            return;
        const onScroll = (event: Event) => {
            scheduleThumbOffsetsUpdate();
            viewportScrollHandlerRef.current?.(event);
        };
        const onWheel = (event: WheelEvent) => {
            if (event.defaultPrevented || axis !== "x")
                return;
            const { scrollWidth, clientWidth } = getScrollDimensions(viewport);
            const maxScrollLeft = Math.max(0, scrollWidth - clientWidth);
            if (maxScrollLeft <= 0)
                return;
            let deltaY = normalizeWheelDelta(event, event.deltaY);
            let deltaX = normalizeWheelDelta(event, event.deltaX);
            wheelClassifierRef.current.accept(deltaX, deltaY);
            if (Math.abs(deltaY) >= Math.abs(deltaX)) {
                deltaX = 0;
            }
            else {
                deltaY = 0;
            }
            if (!deltaX) {
                deltaX = deltaY;
            }
            if (Math.abs(deltaX) < 0.5)
                return;
            const currentOrTargetScrollLeft = horizontalWheelRafRef.current == null
                ? getScrollPosition(viewport).scrollLeft
                : horizontalWheelTargetRef.current;
            const nextScrollLeft = Math.max(0, Math.min(maxScrollLeft, currentOrTargetScrollLeft + deltaX));
            if (Math.abs(nextScrollLeft - getScrollPosition(viewport).scrollLeft) < 0.5)
                return;
            event.preventDefault();
            event.stopPropagation();
            if (wheelClassifierRef.current.isPhysicalWheel()) {
                scrollHorizontalSmooth(nextScrollLeft);
            }
            else {
                scrollHorizontalNow(nextScrollLeft);
            }
        };
        const scrollDisposable = addDisposableListener(viewport, EventType.SCROLL, onScroll, { passive: true });
        let wheelDisposable: { dispose(): void } | undefined;
        if (axis === "x") {
            wheelDisposable = addDisposableListener(viewport, EventType.WHEEL, onWheel, { passive: false });
        }
        const ro = new DisposableResizeObserver(window, () => scheduleMetricsUpdate());
        const viewportResizeDisposable = ro.observe(viewport);
        const contentEl = viewport.firstElementChild;
        if (contentEl)
            ro.observe(contentEl);
        const mo = observeMutations(viewport, () => scheduleMetricsUpdate(), {
            childList: true,
        });
        scheduleMetricsUpdate();
        const resizeDisposable = addDisposableListener(window, EventType.RESIZE, scheduleMetricsUpdate);
        return () => {
            scrollDisposable.dispose();
            wheelDisposable?.dispose();
            viewportResizeDisposable.dispose();
            ro.dispose();
            mo.dispose();
            resizeDisposable.dispose();
            if (metricsRafRef.current != null) {
                metricsRafRef.current.dispose();
                metricsRafRef.current = null;
            }
            if (thumbOffsetsRafRef.current != null) {
                thumbOffsetsRafRef.current.dispose();
                thumbOffsetsRafRef.current = null;
            }
            cancelHorizontalWheelAnimation();
        };
    }, [
        axis,
        cancelHorizontalWheelAnimation,
        normalizeWheelDelta,
        scheduleMetricsUpdate,
        scheduleThumbOffsetsUpdate,
        scrollHorizontalNow,
        scrollHorizontalSmooth,
    ]);
    useEffect(() => {
        const onMouseMove = (event: MouseEvent) => {
            const mouseEvent = new StandardMouseEvent(window, event);
            const drag = dragRef.current;
            const viewport = viewportRef.current;
            if (!drag || !viewport)
                return;
            if (drag.axis === "y") {
                const delta = mouseEvent.clientY - drag.startPointer;
                const { clientHeight, scrollHeight } = getScrollDimensions(viewport);
                const trackRange = Math.max(1, clientHeight - drag.thumbSize);
                const scrollRange = Math.max(1, scrollHeight - clientHeight);
                viewport.scrollTop = drag.startScroll + (delta * scrollRange) / trackRange;
            }
            else {
                const delta = mouseEvent.clientX - drag.startPointer;
                const { clientWidth, scrollWidth } = getScrollDimensions(viewport);
                const trackRange = Math.max(1, clientWidth - drag.thumbSize);
                const scrollRange = Math.max(1, scrollWidth - clientWidth);
                scrollHorizontalNow(drag.startScroll + (delta * scrollRange) / trackRange);
            }
        };
        const onMouseUp = () => {
            dragRef.current = null;
        };
        return combinedDisposable(
            addDisposableListener(window, EventType.MOUSE_MOVE, onMouseMove),
            addDisposableListener(window, EventType.MOUSE_UP, onMouseUp),
        ).dispose;
    }, [scrollHorizontalNow]);
    const startDrag = (dragAxis: "x" | "y", event: ReactMouseEvent<HTMLDivElement>) => {
        const viewport = viewportRef.current;
        if (!viewport)
            return;
        event.preventDefault();
        cancelHorizontalWheelAnimation();
        dragRef.current =
            dragAxis === "y"
                ? {
                    axis: "y",
                    startPointer: event.clientY,
                    startScroll: getScrollPosition(viewport).scrollTop,
                    thumbSize: metricsRef.current.yThumbSize,
                }
                : {
                    axis: "x",
                    startPointer: event.clientX,
                    startScroll: getScrollPosition(viewport).scrollLeft,
                    thumbSize: metricsRef.current.xThumbSize,
                };
    };
    const jumpToTrackPosition = (trackAxis: "x" | "y", event: ReactMouseEvent<HTMLDivElement>) => {
        if (event.target !== event.currentTarget)
            return;
        const viewport = viewportRef.current;
        if (!viewport)
            return;
        const rect = getDomRect(event.currentTarget);
        if (trackAxis === "y") {
            const yThumbSize = metricsRef.current.yThumbSize;
            const clickOffset = event.clientY - rect.top;
            const { clientHeight, scrollHeight } = getScrollDimensions(viewport);
            const maxThumbTravel = Math.max(1, clientHeight - yThumbSize);
            const ratio = Math.max(0, Math.min(1, (clickOffset - yThumbSize / 2) / maxThumbTravel));
            viewport.scrollTop =
                ratio * Math.max(0, scrollHeight - clientHeight);
        }
        else {
            const xThumbSize = metricsRef.current.xThumbSize;
            const clickOffset = event.clientX - rect.left;
            const { clientWidth, scrollWidth } = getScrollDimensions(viewport);
            const maxThumbTravel = Math.max(1, clientWidth - xThumbSize);
            const ratio = Math.max(0, Math.min(1, (clickOffset - xThumbSize / 2) / maxThumbTravel));
            scrollHorizontalNow(ratio * Math.max(0, scrollWidth - clientWidth));
        }
    };
    return (jsx("div", {
        ...props,
        className: cx("scroll-area", className),
        children: [
            jsx("div", {
                ref: viewportRef,
                className: cx("scroll-area__viewport", viewportClassName, viewportPropsClassName),
                "data-axis": axis,
                ...restViewportProps,
                children: children
            }),
            metrics.showY ? (jsx("div", {
                className: "scroll-area__track scroll-area__track--y",
                onMouseDown: (event: ReactMouseEvent<HTMLDivElement>) => jumpToTrackPosition("y", event),
                children: jsx("div", {
                    ref: yThumbRef,
                    className: "scroll-area__thumb scroll-area__thumb--y",
                    style: {
                        height: `${metrics.yThumbSize}px`,
                    },
                    onMouseDown: (event: ReactMouseEvent<HTMLDivElement>) => startDrag("y", event)
                })
            })) : null,
            metrics.showX ? (jsx("div", {
                className: "scroll-area__track scroll-area__track--x",
                onMouseDown: (event: ReactMouseEvent<HTMLDivElement>) => jumpToTrackPosition("x", event),
                children: jsx("div", {
                    ref: xThumbRef,
                    className: "scroll-area__thumb scroll-area__thumb--x",
                    style: {
                        width: `${metrics.xThumbSize}px`,
                    },
                    onMouseDown: (event: ReactMouseEvent<HTMLDivElement>) => startDrag("x", event)
                })
            })) : null
        ]
    }));
});
ScrollArea.displayName = "ScrollArea";
export default ScrollArea;
