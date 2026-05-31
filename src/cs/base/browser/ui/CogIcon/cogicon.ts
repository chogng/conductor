import {
  normalizeCogIconSvgMarkup,
  type CogIconRenderer,
} from "src/cs/base/browser/ui/cogIcon/cogIconMarkup";
import { cx } from "src/utils/cx";

import "src/cs/base/browser/ui/cogIcon/cogIcon.css";

export type CogIconStyle = Record<string, string | number | undefined>;

export type CogIconOptions = {
  className?: string;
  icon: CogIconRenderer;
  size?: number | string;
  style?: CogIconStyle;
};

export const getCogIconClassName = (className?: string): string =>
  cx("ui-cogicon", className);

const normalizeCogIconSize = (size: number | string): string =>
  typeof size === "number" ? `${size}px` : size;

export const getCogIconStyle = ({
  size = 16,
  style,
}: Pick<CogIconOptions, "size" | "style">): CogIconStyle => {
  const normalizedSize = normalizeCogIconSize(size);
  return {
    width: normalizedSize,
    height: normalizedSize,
    ...style,
  };
};

export const getCogIconMarkup = (icon: CogIconRenderer): string =>
  normalizeCogIconSvgMarkup(icon);

export const createCogIcon = ({
  className,
  icon,
  size = 16,
  style,
}: CogIconOptions): HTMLSpanElement => {
  const element = document.createElement("span");
  element.className = getCogIconClassName(className);
  Object.assign(element.style, getCogIconStyle({ size, style }));
  element.innerHTML = getCogIconMarkup(icon);
  return element;
};

export { normalizeCogIconSvgMarkup, type CogIconRenderer };
