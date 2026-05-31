import { jsx } from "react/jsx-runtime";
import { forwardRef, useState, type ButtonHTMLAttributes, type CSSProperties, type MouseEvent, } from "react";
import { cx } from "src/utils/cx";

type SwitchSize = "sm" | "md" | "lg";
type SwitchStyleVars = CSSProperties & {
    "--switch-width"?: string;
    "--switch-height"?: string;
    "--switch-on"?: string;
    "--switch-on-hover"?: string;
};
const SWITCH_SIZE_STYLES = {
    sm: {
        "--switch-width": "32px",
        "--switch-height": "18px",
    },
    md: {
        "--switch-width": "40px",
        "--switch-height": "22px",
    },
    lg: {
        "--switch-width": "46px",
        "--switch-height": "26px",
    },
} satisfies Record<SwitchSize, SwitchStyleVars>;
const DEFAULT_SWITCH_STYLE = {
    "--switch-on": "#168a63",
    "--switch-on-hover": "#0f7a56",
} satisfies SwitchStyleVars;
type SwitchProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onChange" | "style" | "value"> & {
    checked?: boolean;
    defaultChecked?: boolean;
    onCheckedChange?: (checked: boolean, event: MouseEvent<HTMLButtonElement>) => void;
    size?: SwitchSize;
    style?: SwitchStyleVars;
    testId?: string;
};
const Switch = forwardRef<HTMLButtonElement, SwitchProps>(({ checked, defaultChecked = false, onCheckedChange, size = "md", className = "", disabled = false, onClick, style, testId, type = "button", ...props }, ref) => {
    const [internalChecked, setInternalChecked] = useState(defaultChecked);
    const isControlled = checked !== undefined;
    const isChecked = isControlled ? checked : internalChecked;
    const devTestId = import.meta.env.DEV && testId ? testId : undefined;
    const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
        onClick?.(event);
        if (event.defaultPrevented || disabled)
            return;
        const nextChecked = !isChecked;
        if (!isControlled)
            setInternalChecked(nextChecked);
        onCheckedChange?.(nextChecked, event);
    };
    return (jsx("button", {
        ...props,
        ref: ref,
        type: type,
        role: "switch",
        "aria-checked": isChecked,
        disabled: disabled,
        "data-state": isChecked ? "checked" : "unchecked",
        "data-size": size,
        "data-testid": devTestId,
        className: cx("ui-switch", className),
        style: {
            ...DEFAULT_SWITCH_STYLE,
            ...SWITCH_SIZE_STYLES[size],
            ...style,
        },
        onClick: handleClick,
        children: jsx("span", {
            className: "ui-switch__thumb",
            "aria-hidden": "true"
        })
    }));
});
Switch.displayName = "Switch";
export default Switch;
