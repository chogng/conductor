import { normalizeCtaName, normalizeCtaToken } from "src/utils/cta";
import { cx } from "src/utils/cx";

import "src/cs/base/browser/ui/card/card.css";

export type CardVariant = "default" | "panel" | "glass" | "flat" | "fill";

export type CardOptions = {
  readonly className?: string;
  readonly cta?: string;
  readonly ctaCopy?: string;
  readonly ctaPosition?: string;
  readonly variant?: CardVariant;
};

export const getCardClassName = ({
  className = "",
  variant = "default",
}: Pick<CardOptions, "className" | "variant"> = {}): string =>
  cx(getCardVariantClassName(variant), className);

export const getCardDataAttributes = ({
  cta,
  ctaCopy,
  ctaPosition,
}: Pick<CardOptions, "cta" | "ctaCopy" | "ctaPosition">): Record<string, string | undefined> => ({
  "data-cta": normalizeCtaName(cta),
  "data-cta-position": normalizeCtaToken(ctaPosition),
  "data-cta-copy": normalizeCtaToken(ctaCopy),
});

export const createCard = <K extends keyof HTMLElementTagNameMap = "div">(
  tagName: K,
  options: CardOptions = {},
): HTMLElementTagNameMap[K] => {
  const element = document.createElement(tagName);
  updateCard(element, options);
  return element;
};

export const updateCard = (
  element: HTMLElement,
  options: CardOptions = {},
): void => {
  element.className = getCardClassName(options);

  for (const [name, value] of Object.entries(getCardDataAttributes(options))) {
    if (value === undefined) {
      element.removeAttribute(name);
    } else {
      element.setAttribute(name, value);
    }
  }
};

const getCardVariantClassName = (variant: CardVariant): string => {
  if (variant === "panel") return "card card--panel";
  if (variant === "glass") return "card card--glass";
  if (variant === "flat") return "card card--flat";
  if (variant === "fill") return "card card--fill";
  return "card";
};
