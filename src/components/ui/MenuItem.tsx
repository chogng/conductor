import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cx } from "../../utils/cx";

type MenuItemProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type"> & {
  left?: ReactNode;
  right?: ReactNode;
};

const MenuItem = forwardRef<HTMLButtonElement, MenuItemProps>(
  ({ className = "", left, right, children, ...props }, ref) => (
    <button
      {...props}
      ref={ref}
      type="button"
      role={props.role ?? "menuitem"}
      className={cx(className)}
    >
      {left ?? children}
      {right ?? null}
    </button>
  ),
);

MenuItem.displayName = "MenuItem";

export default MenuItem;
