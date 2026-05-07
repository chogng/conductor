import { jsx } from "react/jsx-runtime";
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type FocusEvent, type ReactNode, type RefObject, } from "react";
import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";
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
    const autoCloseTimeoutIdRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const autoCloseStartedAtRef = useRef<number | null>(null);
    const autoCloseRemainingMsRef = useRef(duration);
    const isAutoClosePausedRef = useRef(false);
    const clearAutoCloseTimeout = () => {
        if (autoCloseTimeoutIdRef.current != null) {
            clearTimeout(autoCloseTimeoutIdRef.current);
            autoCloseTimeoutIdRef.current = null;
        }
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
        autoCloseTimeoutIdRef.current = setTimeout(() => {
            autoCloseTimeoutIdRef.current = null;
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
                const rect = containerRef.current.getBoundingClientRect();
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
            window.addEventListener("resize", updatePosition);
            return () => window.removeEventListener("resize", updatePosition);
        }
    }, [containerRef, isVisible, position]);
    useEffect(() => {
        let openTimer: ReturnType<typeof setTimeout> | null = null;
        let closeTimer: ReturnType<typeof setTimeout> | null = null;
        let hideTimer: ReturnType<typeof setTimeout> | null = null;
        if (isVisible) {
            openTimer = setTimeout(() => {
                setShouldRender(true);
                setIsClosing(false);
            }, 0);
        }
        else if (shouldRender) {
            closeTimer = setTimeout(() => {
                setIsClosing(true);
                hideTimer = setTimeout(() => {
                    setShouldRender(false);
                    setIsClosing(false);
                }, 300);
            }, 0);
        }
        return () => {
            if (openTimer != null)
                clearTimeout(openTimer);
            if (closeTimer != null)
                clearTimeout(closeTimer);
            if (hideTimer != null)
                clearTimeout(hideTimer);
        };
    }, [isVisible, shouldRender]);
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
                return (jsx(CheckCircle2, {
                    size: 20,
                    "aria-hidden": "true"
                }));
            case "error":
                return (jsx(AlertCircle, {
                    size: 20,
                    "aria-hidden": "true"
                }));
            case "warning":
                return (jsx(AlertCircle, {
                    size: 20,
                    "aria-hidden": "true"
                }));
            default:
                return jsx(Info, {
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
        className: cx("toast", isClosing ? "toast--closing" : "toast--opening", Object.keys(positionStyle).length === 0 && (position === "fixed" ? "toast--fixed" : "toast--absolute")),
        style: positionStyle,
        children: [
            jsx("div", {
                className: "toast__icon",
                children: getIcon()
            }),
            jsx("span", {
                className: "toast__message",
                children: message
            }),
            jsx("div", {
                className: "toast__controls",
                children: [
                    actionText && onAction ? (jsx("button", {
                        type: "button",
                        onClick: onAction,
                        "data-ui": uiMarker ? `${uiMarker}-action` : undefined,
                        className: "toast__action",
                        children: actionText
                    })) : null,
                    jsx("button", {
                        type: "button",
                        onClick: onClose,
                        "aria-label": "Close toast",
                        "data-ui": uiMarker ? `${uiMarker}-close` : undefined,
                        className: "toast__close",
                        children: jsx(X, {
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
