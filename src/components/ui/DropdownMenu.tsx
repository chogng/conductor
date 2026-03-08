import { useEffect, useRef, type HTMLAttributes, type RefObject } from "react";
import ScrollArea from "./ScrollArea";

const cx = (...parts: Array<string | false | null | undefined>): string =>
  parts.filter(Boolean).join(" ");

const DEFAULT_MENU_CLASSNAME =
  "absolute top-full left-0 right-0 mt-2 bg-bg-surface text-text-primary border border-border-subtle rounded-xl shadow-xl z-50 p-1.5";

type DropdownMenuProps = HTMLAttributes<HTMLDivElement> & {
  isOpen: boolean;
  onClose?: () => void;
  anchorRef?: RefObject<HTMLElement | null>;
};

const DropdownMenu = ({
  isOpen,
  onClose,
  anchorRef,
  id,
  role = "menu",
  className = "",
  children,
  ...props
}: DropdownMenuProps) => {
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose?.();
    };

    const handleMouseDown = (event: MouseEvent) => {
      const target = event.target;
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
      <ScrollArea className="max-h-60" viewportClassName="pr-1" axis="y">
        {children}
      </ScrollArea>
    </div>
  );
};

export default DropdownMenu;
