import { lxCheck } from "cogicon";
import { forwardRef, type HTMLAttributes, type ReactNode } from "react";
import { jsx } from "react/jsx-runtime";
import CogIcon from "src/cs/base/browser/ui/CogIcon/cogicon";
import { cx } from "src/utils/cx";

type CheckboxTag = "span" | "div";
type CheckboxSize = "sm" | "md" | "lg";

type CheckboxProps = Omit<HTMLAttributes<HTMLElement>, "children"> & {
  checked?: boolean;
  as?: CheckboxTag;
  children?: ReactNode;
  decorative?: boolean;
  size?: CheckboxSize;
  iconClassName?: string;
  iconSize?: number;
  iconStrokeWidth?: number;
};

const Checkbox = forwardRef<HTMLElement, CheckboxProps>(
  (
    {
      checked = false,
      as = "span",
      children,
      className = "",
      decorative = true,
      size = "sm",
      iconClassName = "text-white",
      iconSize,
      iconStrokeWidth,
      ...props
    },
    ref,
  ) => {
    const resolvedIconSize = iconSize ?? (size === "lg" ? 11 : 10);
    const ariaProps = decorative
      ? { "aria-hidden": true as const }
      : {
          role: "checkbox" as const,
          "aria-checked": checked,
        };

    const icon =
      children ??
      (checked
        ? jsx(CogIcon, {
            icon: lxCheck,
            size: resolvedIconSize,
            className: iconClassName,
          })
        : null);

    return jsx(as, {
        ref: ref as any,
        className: cx("ui-checkbox", `ui-checkbox--${size}`, checked && "checked", className),
        ...ariaProps,
        ...props,
        children: icon,
      });
  },
);

Checkbox.displayName = "Checkbox";

export default Checkbox;
