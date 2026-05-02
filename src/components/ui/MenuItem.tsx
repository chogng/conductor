import {
  forwardRef,
  type HTMLAttributes,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import { cx } from "../../utils/cx";

type MenuItemProps = HTMLAttributes<HTMLDivElement> & {
  disabled?: boolean;
  left?: ReactNode;
  right?: ReactNode;
};

const MenuItem = forwardRef<HTMLDivElement, MenuItemProps>(
  (
    {
      className = "",
      left,
      right,
      children,
      disabled = false,
      role = "menuitem",
      tabIndex = -1,
      onClick,
      onKeyDown,
      ...props
    },
    ref,
  ) => {
    const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
      onKeyDown?.(event);
      if (event.defaultPrevented || disabled) return;
      if (event.key !== "Enter" && event.key !== " ") return;

      event.preventDefault();
      onClick?.(event as unknown as ReactMouseEvent<HTMLDivElement>);
    };

    return (
      <div
        {...props}
        ref={ref}
        role={role}
        tabIndex={disabled ? undefined : tabIndex}
        aria-disabled={disabled || undefined}
        onClick={disabled ? undefined : onClick}
        onKeyDown={handleKeyDown}
        className={cx("ui-menu__item select-none outline-none", className)}
      >
        {left ?? children}
        {right ?? null}
      </div>
    );
  },
);

MenuItem.displayName = "MenuItem";

export default MenuItem;
