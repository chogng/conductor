import { jsx } from "react/jsx-runtime";
import { forwardRef, type ButtonHTMLAttributes, type Ref, type ReactNode, } from "react";
import { ChevronDown } from "lucide-react";
import { cx } from "src/utils/cx";
type DropdownTriggerProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type"> & {
    isOpen: boolean;
    menuId?: string;
    fieldRef?: Ref<HTMLDivElement | null>;
    fieldClassName?: string;
    indicatorClassName?: string;
    indicator?: ReactNode;
    hideIndicator?: boolean;
};
const DropdownTrigger = forwardRef<HTMLButtonElement, DropdownTriggerProps>(({ id, isOpen, menuId, fieldRef, disabled = false, className = "", fieldClassName = "", indicatorClassName = "", indicator, hideIndicator = false, children, ...props }, ref) => (jsx("div", {
    ref: fieldRef,
    className: fieldClassName,
    "data-state": disabled ? "disabled" : "enable",
    children: [
        jsx("button", {
            ...props,
            ref: ref,
            id: id,
            type: "button",
            "aria-haspopup": "menu",
            "aria-expanded": isOpen,
            "aria-controls": menuId,
            disabled: disabled,
            "data-state": isOpen ? "open" : "closed",
            className: className,
            children: children
        }),
        !hideIndicator ? (jsx("span", {
            className: indicatorClassName,
            children: indicator ?? (jsx(ChevronDown, {
                size: 16,
                className: cx("transition-transform duration-200", isOpen ? "rotate-180" : "")
            }))
        })) : null
    ]
})));
DropdownTrigger.displayName = "DropdownTrigger";
export default DropdownTrigger;
