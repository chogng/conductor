import React, { useEffect, useRef } from "react";

const cx = (...parts) => parts.filter(Boolean).join(" ");

const DEFAULT_MENU_CLASSNAME =
  "absolute top-full left-0 right-0 mt-2 bg-bg-surface text-text-primary border border-border-subtle rounded-xl shadow-xl z-50 max-h-60 overflow-y-auto p-1.5";

const DropdownMenu = ({
  isOpen,
  onClose,
  anchorRef,
  id,
  role = "menu",
  className = "",
  children,
  ...props
}) => {
  const menuRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e) => {
      if (e.key === "Escape") onClose?.();
    };

    const handleMouseDown = (e) => {
      const target = e.target;
      if (!(target instanceof Node)) return;

      const anchorEl = anchorRef?.current;
      const menuEl = menuRef.current;
      if (anchorEl instanceof HTMLElement && anchorEl.contains(target)) return;
      if (menuEl instanceof HTMLElement && menuEl.contains(target)) return;
      onClose?.();
    };

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handleMouseDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handleMouseDown);
    };
  }, [anchorRef, isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      {...props}
      id={id}
      ref={menuRef}
      role={role}
      className={cx(DEFAULT_MENU_CLASSNAME, className)}
    >
      {children}
    </div>
  );
};

export default DropdownMenu;
