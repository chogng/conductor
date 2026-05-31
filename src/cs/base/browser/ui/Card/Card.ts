import { createElement, forwardRef, type ElementType, type HTMLAttributes, } from "react";
import { normalizeCtaName, normalizeCtaToken } from "src/utils/cta";
import { cx } from "src/utils/cx";


type CardVariant = "default" | "panel" | "glass" | "flat" | "fill";
type CardProps = HTMLAttributes<HTMLElement> & {
    as?: ElementType;
    variant?: CardVariant;
    cta?: string;
    ctaPosition?: string;
    ctaCopy?: string;
    dataUi?: unknown;
};
const Card = forwardRef<HTMLElement, CardProps>(({ as: Component = "div", children, className = "", variant = "default", cta, ctaPosition, ctaCopy, ...props }, ref) => {
    const { dataUi, ...restProps } = props;
    if (import.meta.env.DEV && dataUi != null) {
        console.warn("[Card] `dataUi` is ignored in this component. Use `id` / `data-cta*` / `aria-*` instead.");
    }
    const variants: Record<CardVariant, string> = {
        default: "card",
        panel: "card card--panel",
        glass: "card card--glass",
        flat: "card card--flat",
        fill: "card card--fill",
    };
    return createElement(Component, {
        ref,
        className: cx(variants[variant] ?? variants.default, className),
        "data-cta": normalizeCtaName(cta),
        "data-cta-position": normalizeCtaToken(ctaPosition),
        "data-cta-copy": normalizeCtaToken(ctaCopy),
        ...restProps,
    }, children);
});
Card.displayName = "Card";
export default Card;
