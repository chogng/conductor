import {
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type Ref,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { cx } from "../../utils/cx";

export type ContentViewAlign = "left" | "center" | "right";
type ContentViewChildren = ReactNode | (() => ReactNode);

type ContentViewProps = {
  isOpen: boolean;
  align?: ContentViewAlign;
  zIndex?: number;
  className?: string;
  children?: ContentViewChildren;
  triggerId?: string;
  menuId?: string;
  anchorRef?: RefObject<HTMLElement | null>;
  contentRef?: Ref<HTMLDivElement | null>;
  matchAnchorWidth?: boolean;
  role?: string;
  "aria-orientation"?: "vertical" | "horizontal";
};

const POPUP_GAP_PX = 8;
const VIEWPORT_PADDING_PX = 8;

const ContentView = ({
  isOpen,
  align = "left",
  zIndex = 20,
  className = "",
  children,
  triggerId,
  menuId,
  anchorRef,
  contentRef,
  matchAnchorWidth = false,
  role = "menu",
  "aria-orientation": ariaOrientation = "vertical",
}: ContentViewProps) => {
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
      const anchorEl = anchorRef?.current;
      const popupEl = popupRef.current;
      if (!anchorEl || !popupEl) return;

      const rect = anchorEl.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const anchorWidth = Math.max(0, rect.width);
      const maxWidth = Math.max(0, viewportWidth - VIEWPORT_PADDING_PX * 2);
      const contentWidth = Math.max(
        popupEl.scrollWidth || 0,
        popupEl.offsetWidth || 0,
      );
      const popupWidth = matchAnchorWidth
        ? Math.min(Math.max(contentWidth, anchorWidth), maxWidth)
        : Math.min(contentWidth, maxWidth);
      const minWidth = matchAnchorWidth
        ? Math.min(anchorWidth, maxWidth)
        : undefined;
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
        width: popupWidth,
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
  }, [align, anchorRef, isOpen, matchAnchorWidth, zIndex]);

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
        ref={contentRef}
        id={menuId}
        role={role}
        aria-orientation={ariaOrientation}
        aria-labelledby={triggerId}
        aria-hidden={isOpen ? undefined : true}
        data-style="popup"
        data-state={isOpen ? "open" : "closed"}
        data-side={side}
        data-align={align}
        tabIndex={-1}
        className={cx(
          `
            rounded-xl shadow-xl p-1 border border-border-subtle
            bg-bg-surface/80 backdrop-blur-xl
            transition-all duration-200 ease-out
            data-[side=top]:origin-bottom
          `,
          align === "right"
            ? "origin-top-right data-[side=top]:origin-bottom-right"
            : align === "center"
              ? "origin-top data-[side=top]:origin-bottom"
              : "origin-top-left data-[side=top]:origin-bottom-left",
          isOpen
            ? "opacity-100 translate-y-0 scale-100"
            : "opacity-0 data-[side=bottom]:-translate-y-2 data-[side=top]:translate-y-2 scale-95",
          className,
        )}
      >
        {resolvedChildren}
      </div>
    </div>,
    document.body,
  );
};

export default ContentView;
