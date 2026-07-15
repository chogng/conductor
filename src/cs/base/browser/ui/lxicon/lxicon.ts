import { renderLxIcon } from "src/cs/base/browser/ui/lxicon/lxiconRenderer";
import type { LxIcon } from "src/cs/base/common/lxicon";

type LxIconStyle = Record<string, string | number | undefined>;

type LxIconOptions = {
  className?: string;
  icon: LxIcon;
  size?: number | string;
  style?: LxIconStyle;
};

const getLxIconClassName = (className?: string): string =>
  className ? `ui-lxicon ${className}` : "ui-lxicon";

const normalizeLxIconSize = (size: number | string): string =>
  typeof size === "number" ? `${size}px` : size;

const getLxIconStyle = ({
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

export function createLxIcon({
  className,
  icon,
  size = 16,
  style,
}: LxIconOptions): HTMLSpanElement {
  const element = document.createElement("span");
  element.className = getLxIconClassName(className);
  Object.assign(element.style, getLxIconStyle({ size, style }));
  element.append(renderLxIcon(icon));
  return element;
}
