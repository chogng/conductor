import { jsx } from "react/jsx-runtime";
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type FocusEvent, type ReactNode, type RefObject, } from "react";
import { lxClose } from "cogicon";
import CogIcon from "src/cs/base/browser/ui/CogIcon/cogicon";
import { lxAlertCircle, lxCheckCircle, lxInfoCircle } from "src/cs/base/browser/ui/CogIcon/icons";
import { getDomRect } from "src/cs/base/browser/dom";
import { addDisposableListener, EventType } from "src/cs/base/browser/event";
import { TimeoutTimer } from "src/cs/base/common/async";
import { cx } from "src/utils/cx";
import "./toast.css";

type ToastType = "success" | "error" | "warning" | "info";
type ToastPosition = "absolute" | "fixed";
type ToastProps = {
    message: ReactNode;
    type?: ToastType;
    actionText?: string;
    onAction?: () => void;
    onClose?: () => void;
    isVisible: boolean;
    containerRef?: RefObject<HTMLElement | null>;
    position?: ToastPosition;
    duration?: number;
    dataUi?: string;
};
const Toast = ({ message, type = "success", actionText, onAction, onClose, isVisible, containerRef, position = "absolute", duration = 5000, dataUi, }: ToastProps) => {
    const [positionStyle, setPositionStyle] = useState<CSSProperties>({});
    const [shouldRender, setShouldRender] = useState(isVisible);
    const [isClosing, setIsClosing] = useState(false);
    const closeFnRef = useRef<(() => void) | undefined>(onClose);
    useEffect(() => {
        closeFnRef.current = onClose;
    }, [onClose]);
    const autoCloseTimerRef = useRef(new TimeoutTimer());
    const openTimerRef = useRef(new TimeoutTimer());
    const closeTimerRef = useRef(new TimeoutTimer());
    const hideTimerRef = useRef(new TimeoutTimer());
    const autoCloseStartedAtRef = useRef<number | null>(null);
    const autoCloseRemainingMsRef = useRef(duration);
    const isAutoClosePausedRef = useRef(false);
    const clearAutoCloseTimeout = () => {
        autoCloseTimerRef.current.cancel();
    };
    const startAutoCloseTimeout = () => {
        if (!isVisible)
            return;
        if (duration == null || duration === Number.POSITIVE_INFINITY)
            return;
        if (isAutoClosePausedRef.current)
            return;
        if (autoCloseRemainingMsRef.current <= 0)
            return;
        clearAutoCloseTimeout();
        autoCloseStartedAtRef.current = Date.now();
        autoCloseTimerRef.current.cancelAndSet(() => {
            closeFnRef.current?.();
        }, autoCloseRemainingMsRef.current);
    };
    const pauseAutoClose = () => {
        if (!isVisible)
            return;
        if (duration == null || duration === Number.POSITIVE_INFINITY)
            return;
        if (isAutoClosePausedRef.current)
            return;
        isAutoClosePausedRef.current = true;
        if (autoCloseStartedAtRef.current != null) {
            const elapsed = Date.now() - autoCloseStartedAtRef.current;
            autoCloseRemainingMsRef.current = Math.max(0, autoCloseRemainingMsRef.current - elapsed);
        }
        clearAutoCloseTimeout();
    };
    const resumeAutoClose = () => {
        if (!isVisible)
            return;
        if (duration == null || duration === Number.POSITIVE_INFINITY)
            return;
        if (!isAutoClosePausedRef.current)
            return;
        isAutoClosePausedRef.current = false;
        startAutoCloseTimeout();
    };
    // Handle auto-close (paused on hover/focus, resumes on leave/blur)
    useEffect(() => {
        if (!isVisible) {
            clearAutoCloseTimeout();
            isAutoClosePausedRef.current = false;
            autoCloseStartedAtRef.current = null;
            autoCloseRemainingMsRef.current = duration;
            return;
        }
        isAutoClosePausedRef.current = false;
        autoCloseStartedAtRef.current = null;
        autoCloseRemainingMsRef.current = duration;
        startAutoCloseTimeout();
        return () => {
            clearAutoCloseTimeout();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [actionText, duration, isVisible, message, onAction, type]);
    // Calculate position if containerRef is provided.
    useLayoutEffect(() => {
        const updatePosition = () => {
            if (containerRef?.current && position === "absolute") {
                const rect = getDomRect(containerRef.current);
                const center = rect.left + rect.width / 2;
                setPositionStyle({
                    position: "fixed",
                    bottom: "32px",
                    left: `${center}px`,
                });
            }
            else if (position === "fixed") {
                setPositionStyle({
                    position: "fixed",
                    bottom: "32px",
                    left: "50%",
                    transform: "translateX(-50%)",
                });
            }
        };
        if (isVisible) {
            updatePosition();
            return addDisposableListener(window, EventType.RESIZE, updatePosition).dispose;
        }
    }, [containerRef, isVisible, position]);
    useEffect(() => {
        openTimerRef.current.cancel();
        closeTimerRef.current.cancel();
        hideTimerRef.current.cancel();
        if (isVisible) {
            openTimerRef.current.cancelAndSet(() => {
                setShouldRender(true);
                setIsClosing(false);
            }, 0);
        }
        else if (shouldRender) {
            closeTimerRef.current.cancelAndSet(() => {
                setIsClosing(true);
                hideTimerRef.current.cancelAndSet(() => {
                    setShouldRender(false);
                    setIsClosing(false);
                }, 300);
            }, 0);
        }
        return () => {
            openTimerRef.current.cancel();
            closeTimerRef.current.cancel();
            hideTimerRef.current.cancel();
        };
    }, [isVisible, shouldRender]);
    useEffect(() => () => {
        autoCloseTimerRef.current.cancel();
        openTimerRef.current.cancel();
        closeTimerRef.current.cancel();
        hideTimerRef.current.cancel();
    }, []);
    if (!shouldRender)
        return null;
    const uiMarker = typeof dataUi === "string" && dataUi.trim() ? dataUi.trim() : undefined;
    const isUrgent = type === "error" || type === "warning";
    const a11yRole = isUrgent ? "alert" : "status";
    const ariaLive = isUrgent ? "assertive" : "polite";
    const state = isVisible ? "open" : isClosing ? "closing" : "closed";
    const getIcon = () => {
        switch (type) {
            case "success":
                return jsx(CogIcon, {
                    icon: lxCheckCircle,
                    size: 20,
                    "aria-hidden": "true"
                });
            case "error":
                return jsx(CogIcon, {
                    icon: lxAlertCircle,
                    size: 20,
                    "aria-hidden": "true"
                });
            case "warning":
                return jsx(CogIcon, {
                    icon: lxAlertCircle,
                    size: 20,
                    "aria-hidden": "true"
                });
            default:
                return jsx(CogIcon, {
                    icon: lxInfoCircle,
                    size: 20,
                    "aria-hidden": "true"
                });
        }
    };
    return (jsx("div", {
        onMouseEnter: pauseAutoClose,
        onMouseLeave: resumeAutoClose,
        onFocusCapture: pauseAutoClose,
        onBlurCapture: (event: FocusEvent<HTMLDivElement>) => {
            const relatedTarget = event.relatedTarget;
            if (relatedTarget instanceof Node &&
                event.currentTarget.contains(relatedTarget)) {
                return;
            }
            resumeAutoClose();
        },
        role: a11yRole,
        "aria-live": ariaLive,
        "aria-atomic": "true",
        "data-style": "toast",
        "data-type": type,
        "data-state": state,
        "data-ui": uiMarker,
        className: cx("conductor-toast", isClosing ? "conductor-toast-closing" : "conductor-toast-opening", Object.keys(positionStyle).length === 0 && (position === "fixed" ? "conductor-toast-fixed" : "conductor-toast-absolute")),
        style: positionStyle,
        children: [
            jsx("div", {
                className: "conductor-toast-icon",
                children: getIcon()
            }),
            jsx("span", {
                className: "conductor-toast-message",
                children: message
            }),
            jsx("div", {
                className: "conductor-toast-controls",
                children: [
                    actionText && onAction ? (jsx("button", {
                        type: "button",
                        onClick: onAction,
                        "data-ui": uiMarker ? `${uiMarker}-action` : undefined,
                        className: "conductor-toast-action",
                        children: actionText
                    })) : null,
                    jsx("button", {
                        type: "button",
                        onClick: onClose,
                        "aria-label": "Close toast",
                        "data-ui": uiMarker ? `${uiMarker}-close` : undefined,
                        className: "conductor-toast-close",
                        children: jsx(CogIcon, {
                            icon: lxClose,
                            size: 16,
                            "aria-hidden": "true"
                        })
                    })
                ]
            })
        ]
    }));
};
export default Toast;
