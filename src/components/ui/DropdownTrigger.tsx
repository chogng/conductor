import {
  forwardRef,
  type ButtonHTMLAttributes,
  type Ref,
  type ReactNode,
} from "react";
import { ChevronDown } from "lucide-react";
import { cx } from "../../utils/cx";

type DropdownTriggerProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "type"
> & {
  isOpen: boolean;
  menuId?: string;
  fieldRef?: Ref<HTMLDivElement | null>;
  fieldClassName?: string;
  indicatorClassName?: string;
  indicator?: ReactNode;
  hideIndicator?: boolean;
};

const DropdownTrigger = forwardRef<HTMLButtonElement, DropdownTriggerProps>(
  (
    {
      id,
      isOpen,
      menuId,
      fieldRef,
      disabled = false,
      className = "",
      fieldClassName = "",
      indicatorClassName = "",
      indicator,
      hideIndicator = false,
      children,
      ...props
    },
    ref,
  ) => (
    <div
      ref={fieldRef}
      className={fieldClassName}
      data-state={disabled ? "disabled" : "enable"}
    >
      <button
        {...props}
        ref={ref}
        id={id}
        type="button"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-controls={menuId}
        disabled={disabled}
        data-state={isOpen ? "open" : "closed"}
        className={className}
      >
        {children}
      </button>

      {!hideIndicator ? (
        <span className={indicatorClassName}>
          {indicator ?? (
            <ChevronDown
              size={16}
              className={cx(
                "transition-transform duration-200",
                isOpen ? "rotate-180" : "",
              )}
            />
          )}
        </span>
      ) : null}
    </div>
  ),
);

DropdownTrigger.displayName = "DropdownTrigger";

export default DropdownTrigger;
