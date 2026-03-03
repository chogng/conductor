import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";

const Toast = ({
  message,
  type = "success",
  actionText,
  onAction,
  onClose,
  isVisible,
  containerRef,
  position = "absolute",
  duration = 5000,
  dataUi,
}) => {
  const [positionStyle, setPositionStyle] = useState({});
  const [shouldRender, setShouldRender] = useState(isVisible);
  const [isClosing, setIsClosing] = useState(false);

  const closeFnRef = useRef(onClose);
  useEffect(() => {
    closeFnRef.current = onClose;
  }, [onClose]);

  const autoCloseTimeoutIdRef = useRef(null);
  const autoCloseStartedAtRef = useRef(null);
  const autoCloseRemainingMsRef = useRef(duration);
  const isAutoClosePausedRef = useRef(false);

  const clearAutoCloseTimeout = () => {
    if (autoCloseTimeoutIdRef.current != null) {
      clearTimeout(autoCloseTimeoutIdRef.current);
      autoCloseTimeoutIdRef.current = null;
    }
  };

  const startAutoCloseTimeout = () => {
    if (!isVisible) return;
    if (duration == null || duration === Infinity) return;
    if (isAutoClosePausedRef.current) return;
    if (autoCloseRemainingMsRef.current <= 0) return;

    clearAutoCloseTimeout();
    autoCloseStartedAtRef.current = Date.now();
    autoCloseTimeoutIdRef.current = setTimeout(() => {
      autoCloseTimeoutIdRef.current = null;
      closeFnRef.current?.();
    }, autoCloseRemainingMsRef.current);
  };

  const pauseAutoClose = () => {
    if (!isVisible) return;
    if (duration == null || duration === Infinity) return;
    if (isAutoClosePausedRef.current) return;

    isAutoClosePausedRef.current = true;
    if (autoCloseStartedAtRef.current != null) {
      const elapsed = Date.now() - autoCloseStartedAtRef.current;
      autoCloseRemainingMsRef.current = Math.max(
        0,
        autoCloseRemainingMsRef.current - elapsed,
      );
    }
    clearAutoCloseTimeout();
  };

  const resumeAutoClose = () => {
    if (!isVisible) return;
    if (duration == null || duration === Infinity) return;
    if (!isAutoClosePausedRef.current) return;

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
  }, [isVisible, message, type, actionText, onAction, duration]);

  // Calculate position if containerRef is provided
  useLayoutEffect(() => {
    const updatePosition = () => {
      if (containerRef?.current && position === "absolute") {
        const rect = containerRef.current.getBoundingClientRect();
        const center = rect.left + rect.width / 2;
        setPositionStyle({
          position: "fixed", // relative to viewport but calculated based on container
          bottom: "32px",
          left: `${center}px`,
        });
      } else if (position === "fixed") {
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
  }, [isVisible, containerRef, position]);

  // Render logic
  useEffect(() => {
    let openTimer;
    let closeTimer;
    let hideTimer;

    if (isVisible) {
      openTimer = setTimeout(() => {
        setShouldRender(true);
        setIsClosing(false);
      }, 0);
    } else if (shouldRender) {
      closeTimer = setTimeout(() => {
        setIsClosing(true);
        hideTimer = setTimeout(() => {
          setShouldRender(false);
          setIsClosing(false);
        }, 300); // Match animation duration
      }, 0);
    }

    return () => {
      if (openTimer != null) clearTimeout(openTimer);
      if (closeTimer != null) clearTimeout(closeTimer);
      if (hideTimer != null) clearTimeout(hideTimer);
    };
  }, [isVisible, shouldRender]);

  if (!shouldRender) return null;

  const uiMarker =
    typeof dataUi === "string" && dataUi.trim() ? dataUi.trim() : undefined;

  const isUrgent = type === "error" || type === "warning";
  const a11yRole = isUrgent ? "alert" : "status";
  const ariaLive = isUrgent ? "assertive" : "polite";
  const state = isVisible ? "open" : isClosing ? "closing" : "closed";

  const getIcon = () => {
    switch (type) {
      case "success":
        return (
          <CheckCircle2 size={20} className="text-green-500" aria-hidden="true" />
        );
      case "error":
        return (
          <AlertCircle size={20} className="text-red-500" aria-hidden="true" />
        );
      case "warning":
        return (
          <AlertCircle size={20} className="text-amber-500" aria-hidden="true" />
        );
      default:
        return <Info size={20} className="text-blue-500" aria-hidden="true" />;
    }
  };

  return (
    <div
      onMouseEnter={pauseAutoClose}
      onMouseLeave={resumeAutoClose}
      onFocusCapture={pauseAutoClose}
      onBlurCapture={(event) => {
        if (event.currentTarget.contains(event.relatedTarget)) return;
        resumeAutoClose();
      }}
      role={a11yRole}
      aria-live={ariaLive}
      aria-atomic="true"
      data-style="toast"
      data-type={type}
      data-state={state}
      data-ui={uiMarker}
      className={`
                transform -translate-x-1/2 z-[60]
                flex items-center gap-3
                bg-bg-surface/90 backdrop-blur-xl
                border border-border-subtle/60 shadow-[0_8px_30px_rgb(0,0,0,0.12)]
                pl-4 pr-3 py-3 rounded-2xl min-w-[340px] max-w-[420px]
                ${isClosing ? "animate-slide-down" : "animate-slide-up"}
                ${Object.keys(positionStyle).length === 0 ? (position === "fixed" ? "fixed bottom-8 left-1/2" : "absolute bottom-0 left-1/2") : ""}
            `}
      style={positionStyle}
    >
      <div className="shrink-0">{getIcon()}</div>

      <span className="text-sm font-medium text-text-primary flex-1 leading-snug">
        {message}
      </span>

      <div className="flex items-center gap-3 pl-3 border-l border-border-subtle/60">
        {actionText && onAction && (
          <button
            type="button"
            onClick={onAction}
            data-ui={uiMarker ? `${uiMarker}-action` : undefined}
            className="text-accent text-sm font-semibold hover:text-accent-hover transition-colors whitespace-nowrap"
          >
            {actionText}
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close toast"
          data-ui={uiMarker ? `${uiMarker}-close` : undefined}
          className="text-text-tertiary hover:text-text-primary hover:bg-bg-surface-hover/60 rounded-full p-1 transition-all"
        >
          <X size={16} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
};

export default Toast;
