import { useEffect, useRef, type ReactNode, type RefObject } from "react";

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
};

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
}: PopupProps) => {
  const popupRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen || !closeOnClickOutside) return;

    const handleClickOutside = (event: MouseEvent) => {
      const ref = containerRef?.current ?? popupRef.current;
      const target = event.target;
      if (!ref || !(target instanceof Node)) return;
      if (!ref.contains(target)) {
        onClose?.();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [closeOnClickOutside, containerRef, isOpen, onClose]);

  const resolvedChildren =
    typeof children === "function" ? (isOpen ? children() : null) : children;

  return (
    <div
      ref={popupRef}
      className={`
        absolute top-full pt-[0.5rem] min-w-full
        ${align === "right" ? "right-0" : align === "center" ? "left-1/2 -translate-x-1/2" : "left-0"}
        ${isOpen ? "pointer-events-auto" : "pointer-events-none"}
      `}
      style={{ zIndex }}
    >
      <div
        id={menuId}
        role="menu"
        aria-orientation="vertical"
        aria-labelledby={triggerId}
        aria-hidden={isOpen ? undefined : true}
        data-style="popup"
        data-state={isOpen ? "open" : "closed"}
        data-side="bottom"
        data-align={align}
        tabIndex={-1}
        className={`
          rounded-xl shadow-premium p-1 border border-border-subtle
          bg-bg-surface/80 backdrop-blur-xl
          transition-all duration-200 ease-out
          ${align === "right" ? "origin-top-right" : align === "center" ? "origin-top" : "origin-top-left"}
          ${isOpen ? "opacity-100 translate-y-0 scale-100" : "opacity-0 -translate-y-2 scale-95"}
          ${className}
        `}
      >
        {resolvedChildren}
      </div>
    </div>
  );
};

export default Popup;
