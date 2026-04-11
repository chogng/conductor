import { useEffect, type HTMLAttributes, type RefObject } from "react";
import { cx } from "../../utils/cx";
import Popup from "./Popup";
import ScrollArea from "./ScrollArea";

const DEFAULT_MENU_CLASSNAME =
  "!bg-bg-surface !backdrop-blur-none text-text-primary p-1.5";

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
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose?.();
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <Popup
      isOpen={isOpen}
      onClose={onClose}
      containerRef={anchorRef}
      menuId={id}
      className={cx(DEFAULT_MENU_CLASSNAME, className)}
      zIndex={50}
    >
      {() => (
        <div {...props} role={role}>
          <ScrollArea className="max-h-60" viewportClassName="pr-1" axis="y">
            {children}
          </ScrollArea>
        </div>
      )}
    </Popup>
  );
};

export default DropdownMenu;
