import { createElement, forwardRef } from "react";
import { normalizeCtaName, normalizeCtaToken } from "../../utils/cta";

const cx = (...parts) => parts.filter(Boolean).join(" ");

const Card = forwardRef(
  (
    {
      as: Component = "div",
      children,
      className = "",
      variant = "default",
      cta,
      ctaPosition,
      ctaCopy,
      ...props
    },
    ref
  ) => {
    const { dataUi, ...restProps } = props;
    if (import.meta.env.DEV && dataUi != null) {
      console.warn(
        "[Card] `dataUi` is deprecated and ignored. Use `id` / `data-cta*` / `aria-*` instead.",
      );
    }

    const variants = {
      default: "card",
      panel: "card card--panel",
      glass: "card card--glass",
      flat: "card card--flat",
      fill: "card card--fill",
    };

    const ctaMarker = normalizeCtaName(cta);
    const ctaPositionMarker = normalizeCtaToken(ctaPosition);
    const ctaCopyMarker = normalizeCtaToken(ctaCopy);

    const cardClasses = cx(variants[variant] || variants.default, className);

    return createElement(
      Component,
      {
        ref,
        className: cardClasses,
        "data-cta": ctaMarker,
        "data-cta-position": ctaPositionMarker,
        "data-cta-copy": ctaCopyMarker,
        ...restProps,
      },
      children,
    );
  }
);

Card.displayName = "Card";

export default Card;
