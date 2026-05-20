import { jsx } from "react/jsx-runtime";
import {
  forwardRef,
  useCallback,
  useEffect,
  useRef,
  useState,
  type HTMLAttributes,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { addDisposableListener, getWindow } from "src/cs/base/browser/dom";
import { combinedDisposable } from "src/cs/base/common/lifecycle";
import { cx } from "src/utils/cx";
import "./sash.css";

export type SashOrientation = "vertical" | "horizontal";
export type SashEdge = "left" | "right" | "top" | "bottom";

export type SashDragEvent = {
  readonly browserEvent: PointerEvent;
  readonly startX: number;
  readonly startY: number;
  readonly currentX: number;
  readonly currentY: number;
  readonly deltaX: number;
  readonly deltaY: number;
};

type SashDragState = {
  readonly pointerId: number;
  readonly startX: number;
  readonly startY: number;
  readonly targetWindow: Window;
};

export type SashProps = Omit<HTMLAttributes<HTMLDivElement>, "onChange"> & {
  readonly active?: boolean;
  readonly disabled?: boolean;
  readonly edge?: SashEdge;
  readonly orientation?: SashOrientation;
  readonly onDidStart?: (event: SashDragEvent) => void;
  readonly onDidChange?: (event: SashDragEvent) => void;
  readonly onDidEnd?: (event: SashDragEvent) => void;
};

const toSashDragEvent = (
  state: SashDragState,
  browserEvent: PointerEvent,
): SashDragEvent => ({
  browserEvent,
  startX: state.startX,
  startY: state.startY,
  currentX: browserEvent.clientX,
  currentY: browserEvent.clientY,
  deltaX: browserEvent.clientX - state.startX,
  deltaY: browserEvent.clientY - state.startY,
});

const Sash = forwardRef<HTMLDivElement, SashProps>(
  (
    {
      active = false,
      className = "",
      disabled = false,
      edge,
      onDidChange,
      onDidEnd,
      onDidStart,
      onPointerDown,
      orientation = "vertical",
      role = "separator",
      ...props
    },
    ref,
  ) => {
    const dragStateRef = useRef<SashDragState | null>(null);
    const dragCleanupRef = useRef<(() => void) | null>(null);
    const [isDragging, setIsDragging] = useState(false);

    useEffect(() => {
      return () => {
        dragCleanupRef.current?.();
        dragCleanupRef.current = null;
      };
    }, []);

    const startDrag = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
      onPointerDown?.(event);

      if (event.defaultPrevented || disabled || event.button !== 0) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      dragCleanupRef.current?.();

      const targetWindow = getWindow(event.nativeEvent);
      const sashElement = event.currentTarget;
      const dragState: SashDragState = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        targetWindow,
      };

      dragStateRef.current = dragState;
      setIsDragging(true);
      sashElement.setPointerCapture?.(event.pointerId);
      onDidStart?.(toSashDragEvent(dragState, event.nativeEvent));

      const finishDrag = (browserEvent: PointerEvent | null) => {
        const currentDragState = dragStateRef.current;

        if (!currentDragState) {
          return;
        }

        dragCleanupRef.current?.();
        dragCleanupRef.current = null;
        dragStateRef.current = null;
        setIsDragging(false);
        sashElement.releasePointerCapture?.(currentDragState.pointerId);

        if (browserEvent) {
          onDidEnd?.(toSashDragEvent(currentDragState, browserEvent));
        }
      };
      const onPointerMove = (browserEvent: PointerEvent) => {
        if (browserEvent.pointerId !== dragState.pointerId) {
          return;
        }

        browserEvent.preventDefault();
        onDidChange?.(toSashDragEvent(dragState, browserEvent));
      };
      const onPointerEnd = (browserEvent: PointerEvent) => {
        if (browserEvent.pointerId !== dragState.pointerId) {
          return;
        }

        finishDrag(browserEvent);
      };
      const onBlur = () => finishDrag(null);
      const disposable = combinedDisposable(
        addDisposableListener(targetWindow, "pointermove", onPointerMove, { passive: false }),
        addDisposableListener(targetWindow, "pointerup", onPointerEnd),
        addDisposableListener(targetWindow, "pointercancel", onPointerEnd),
        addDisposableListener(targetWindow, "blur", onBlur),
      );

      dragCleanupRef.current = () => disposable.dispose();
    }, [disabled, onDidChange, onDidEnd, onDidStart, onPointerDown]);

    return jsx("div", {
      ref,
      role,
      "aria-disabled": disabled ? true : undefined,
      "aria-orientation": orientation,
      "data-active": active || isDragging ? "true" : "false",
      "data-disabled": disabled ? "true" : "false",
      "data-edge": edge,
      "data-orientation": orientation,
      ...props,
      className: cx("ui-sash", className),
      onPointerDown: startDrag,
      children: [
        jsx("div", {
          className: "ui-sash__track",
        }),
        jsx("div", {
          className: "ui-sash__handle",
        }),
      ],
    });
  },
);

Sash.displayName = "Sash";

export default Sash;
