import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";

type PopupAlign = "left" | "center" | "right";
type PopupChildren = ReactNode | (() => ReactNode);

type PopupProps = {
  isOpen: boolean;
  onClose?: () => void;
  align?: PopupAlign;
  zIndex?: number;
  className?: string;
  children?: PopupChildren;
  triggerId?: string;
  menuId?: string;
  closeOnClickOutside?: boolean;
  containerRef?: RefObject<HTMLElement | null>;
  matchAnchorWidth?: boolean;
};

const POPUP_GAP_PX = 8;
const VIEWPORT_PADDING_PX = 8;

const Popup = ({
  isOpen,
  onClose,
  align = "left",
  zIndex = 20,
  className = "",
  children,
  triggerId,
  menuId,
  closeOnClickOutside = true,
  containerRef,
  matchAnchorWidth = false,
}: PopupProps) => {
  const popupRef = useRef<HTMLDivElement | null>(null);
  const [portalStyle, setPortalStyle] = useState<CSSProperties | null>(null);
  const [side, setSide] = useState<"top" | "bottom">("bottom");

  useLayoutEffect(() => {
    if (!isOpen) {
      setPortalStyle(null);
      setSide("bottom");
      return;
    }

    const updatePosition = () => {
      const anchorEl = containerRef?.current;
      const popupEl = popupRef.current;
      if (!anchorEl || !popupEl) return;

      const rect = anchorEl.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const anchorWidth = Math.max(0, rect.width);
      const maxWidth = Math.max(0, viewportWidth - VIEWPORT_PADDING_PX * 2);
      const resolvedWidth = matchAnchorWidth
        ? Math.min(anchorWidth, maxWidth)
        : undefined;
      const minWidth = resolvedWidth ?? anchorWidth;
      const popupWidth = resolvedWidth ?? Math.max(minWidth, popupEl.offsetWidth || 0);
      const popupHeight = popupEl.offsetHeight || 0;

      let left = rect.left;
      if (align === "center") {
        left = rect.left + rect.width / 2 - popupWidth / 2;
      } else if (align === "right") {
        left = rect.right - popupWidth;
      }

      const maxLeft = Math.max(
        VIEWPORT_PADDING_PX,
        viewportWidth - VIEWPORT_PADDING_PX - popupWidth,
      );
      left = Math.min(Math.max(left, VIEWPORT_PADDING_PX), maxLeft);

      const preferredTop = rect.bottom + POPUP_GAP_PX;
      const topIfFlipped = rect.top - POPUP_GAP_PX - popupHeight;
      const canOpenDown =
        preferredTop + popupHeight <= viewportHeight - VIEWPORT_PADDING_PX;
      const canOpenUp = topIfFlipped >= VIEWPORT_PADDING_PX;
      const top = canOpenDown
        ? preferredTop
        : canOpenUp
          ? topIfFlipped
          : Math.min(
              Math.max(VIEWPORT_PADDING_PX, preferredTop),
              Math.max(
                VIEWPORT_PADDING_PX,
                viewportHeight - VIEWPORT_PADDING_PX - popupHeight,
              ),
            );
      const nextSide = canOpenDown || !canOpenUp ? "bottom" : "top";

      setPortalStyle({
        position: "fixed",
        top,
        left,
        width: resolvedWidth,
        minWidth,
        maxWidth,
        zIndex,
      });
      setSide(nextSide);
    };

    updatePosition();

    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [align, containerRef, isOpen, matchAnchorWidth, zIndex]);

  useEffect(() => {
    if (!isOpen || !closeOnClickOutside) return;

    const handleClickOutside = (event: MouseEvent) => {
      const anchorEl = containerRef?.current;
      const menuEl = popupRef.current;
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (anchorEl?.contains(target)) return;
      if (menuEl?.contains(target)) return;
      onClose?.();
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [closeOnClickOutside, containerRef, isOpen, onClose]);

  const resolvedChildren =
    typeof children === "function" ? (isOpen ? children() : null) : children;

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={popupRef}
      className={isOpen ? "pointer-events-auto" : "pointer-events-none"}
      style={portalStyle ?? { position: "fixed", zIndex }}
    >
      <div
        id={menuId}
        role="menu"
        aria-orientation="vertical"
        aria-labelledby={triggerId}
        aria-hidden={isOpen ? undefined : true}
        data-style="popup"
        data-state={isOpen ? "open" : "closed"}
        data-side={side}
        data-align={align}
        tabIndex={-1}
        className={`
          rounded-xl shadow-xl p-1 border border-border-subtle
          bg-bg-surface/80 backdrop-blur-xl
          transition-all duration-200 ease-out
          data-[side=top]:origin-bottom
          ${align === "right" ? "origin-top-right data-[side=top]:origin-bottom-right" : align === "center" ? "origin-top data-[side=top]:origin-bottom" : "origin-top-left data-[side=top]:origin-bottom-left"}
          ${isOpen ? "opacity-100 translate-y-0 scale-100" : "opacity-0 data-[side=bottom]:-translate-y-2 data-[side=top]:translate-y-2 scale-95"}
          ${className}
        `}
      >
        {resolvedChildren}
      </div>
    </div>,
    document.body,
  );
};

export default Popup;
