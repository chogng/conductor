import { cx } from "src/utils/cx";

import "src/cs/base/browser/ui/card/card.css";

export type CardVariant = "default" | "panel" | "glass" | "flat" | "fill";

export type CardOptions = {
  readonly className?: string;
  readonly variant?: CardVariant;
};

export const getCardClassName = ({
  className = "",
  variant = "default",
}: Pick<CardOptions, "className" | "variant"> = {}): string =>
  cx(getCardVariantClassName(variant), className);

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
};

const getCardVariantClassName = (variant: CardVariant): string => {
  if (variant === "panel") return "card card--panel";
  if (variant === "glass") return "card card--glass";
  if (variant === "flat") return "card card--flat";
  if (variant === "fill") return "card card--fill";
  return "card";
};
