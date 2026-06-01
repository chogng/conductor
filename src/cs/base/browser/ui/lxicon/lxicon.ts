import {
  normalizeLxIconSvgMarkup,
  type LxIconDefinition,
} from "src/cs/base/browser/ui/lxicon/lxiconMarkup";
import type { LxIconRenderer } from "src/cs/base/common/lxicon";

import "src/cs/base/browser/ui/lxicon/lxicon.css";

export type LxIconStyle = Record<string, string | number | undefined>;

export type LxIconOptions = {
  className?: string;
  icon: LxIconDefinition;
  size?: number | string;
  style?: LxIconStyle;
};

export const getLxIconClassName = (className?: string): string =>
  className ? `ui-lxicon ${className}` : "ui-lxicon";

const normalizeLxIconSize = (size: number | string): string =>
  typeof size === "number" ? `${size}px` : size;

export const getLxIconStyle = ({
  size = 16,
  style,
}: Pick<LxIconOptions, "size" | "style">): LxIconStyle => {
  const normalizedSize = normalizeLxIconSize(size);
  return {
    width: normalizedSize,
    height: normalizedSize,
    ...style,
  };
};

export const getLxIconMarkup = (icon: LxIconDefinition): string =>
  normalizeLxIconSvgMarkup(icon);

export const createLxIcon = ({
  className,
  icon,
  size = 16,
  style,
}: LxIconOptions): HTMLSpanElement => {
  const element = document.createElement("span");
  element.className = getLxIconClassName(className);
  Object.assign(element.style, getLxIconStyle({ size, style }));
  element.innerHTML = getLxIconMarkup(icon);
  return element;
};

export { normalizeLxIconSvgMarkup, type LxIconDefinition, type LxIconRenderer };
