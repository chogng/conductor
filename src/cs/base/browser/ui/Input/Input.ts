import { Fragment, jsx } from "react/jsx-runtime";
import { forwardRef, useId, type ChangeEvent, type ComponentType, type InputHTMLAttributes, type ReactNode, } from "react";
import { normalizeCtaName, normalizeCtaToken } from "src/utils/cta";
import { cx } from "src/utils/cx";
import "./input.css";

const slugify = (input: unknown): string => String(input ?? "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
const mergeSpaceSeparatedIds = (...parts: Array<string | undefined>): string | undefined => {
    const ids: string[] = [];
    for (const part of parts) {
        if (typeof part !== "string")
            continue;
        for (const token of part.split(/\s+/g)) {
            const id = token.trim();
            if (!id)
                continue;
            if (!ids.includes(id))
                ids.push(id);
        }
    }
    return ids.length ? ids.join(" ") : undefined;
};
type InputSize = "sm" | "md" | "lg" | "xl";
type LabelPlacement = "stack" | "inline";
type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "size" | "value" | "onChange"> & {
    label?: ReactNode;
    labelPlacement?: LabelPlacement;
    idBase?: string;
    value?: string | number;
    onChange?: (nextValue: string) => void;
    allowAutoComplete?: boolean;
    size?: InputSize;
    leftIcon?: ComponentType<{
        size?: number;
    }>;
    rightSlot?: ReactNode;
    error?: ReactNode;
    hint?: ReactNode;
    fieldClassName?: string;
    inputClassName?: string;
    hideSpinner?: boolean;
    cta?: string;
    ctaPosition?: string;
    ctaCopy?: string;
};
/**
 * Input (UI)
 * - Controlled: value + onChange(nextValue)
 * - Stable markers: data-style/data-state
 */
const Input = forwardRef<HTMLInputElement, InputProps>(({ label, labelPlacement = "stack", id, idBase, name, type = "text", value, onChange, disabled = false, placeholder, autoComplete, allowAutoComplete = false, size = "md", leftIcon: LeftIcon, rightSlot, error, hint, className = "", fieldClassName = "", inputClassName = "", hideSpinner = false, cta, ctaPosition, ctaCopy, ...props }, ref) => {
    const { ["aria-describedby"]: describedByFromProps, ...inputProps } = props;
    const reactId = useId();
    const idBasePrefix = typeof idBase === "string" && idBase.trim() ? slugify(idBase) : "input";
    const derivedId = `${idBasePrefix}-${reactId}`;
    const inputId = id || derivedId;
    const errorId = `${inputId}-error`;
    const hintId = `${inputId}-hint`;
    const describedByFromStatus = error ? errorId : hint ? hintId : undefined;
    const ariaDescribedBy = mergeSpaceSeparatedIds(describedByFromProps, describedByFromStatus);
    const state = disabled ? "disabled" : error ? "error" : "enable";
    const resolvedAutoComplete = allowAutoComplete ? autoComplete : "off";
    const sizeClass = size === "sm"
        ? "input_field--sm"
        : size === "lg"
            ? "input_field--lg"
            : size === "xl"
                ? "input_field--xl"
                : "input_field--md";
    const shouldInlineLabel = Boolean(label) && labelPlacement === "inline";
    const labelNode = label ? (jsx("label", {
        htmlFor: inputId,
        className: cx("input_label", shouldInlineLabel && "whitespace-nowrap"),
        children: label
    })) : null;
    const fieldNode = (jsx("div", {
        className: cx("input_field", sizeClass, fieldClassName),
        "data-icon": LeftIcon ? "with" : "without",
        "data-state": state,
        "data-cta": normalizeCtaName(cta),
        "data-cta-position": normalizeCtaToken(ctaPosition),
        "data-cta-copy": normalizeCtaToken(ctaCopy),
        children: [
            LeftIcon ? (jsx("span", {
                className: "input_icon",
                "aria-hidden": "true",
                children: jsx(LeftIcon, {
                    size: 16
                })
            })) : null,
            jsx("input", {
                ...inputProps,
                ref: ref,
                id: inputId,
                name: name,
                type: type,
                value: value ?? "",
                onChange: (event: ChangeEvent<HTMLInputElement>) => onChange?.(event.target.value),
                disabled: disabled,
                placeholder: placeholder,
                autoComplete: resolvedAutoComplete,
                "aria-invalid": Boolean(error),
                "aria-describedby": ariaDescribedBy,
                className: cx("input_native", hideSpinner && "input_native--no-spinner", inputClassName)
            }),
            rightSlot ? jsx("div", {
                className: "input_right",
                children: rightSlot
            }) : null
        ]
    }));
    return (jsx("div", {
        className: cx("input_warp", className),
        "data-style": "input",
        children: [
            shouldInlineLabel ? (jsx("div", {
                className: "flex items-center gap-2",
                children: [
                    labelNode,
                    fieldNode
                ]
            })) : (jsx(Fragment, {
                children: [
                    labelNode,
                    fieldNode
                ]
            })),
            error ? (jsx("div", {
                id: errorId,
                className: "input_error",
                children: error
            })) : null,
            !error && hint ? (jsx("div", {
                id: hintId,
                className: "input_hint",
                children: hint
            })) : null
        ]
    }));
});
Input.displayName = "Input";
export default Input;
