import { lxCheck } from "cogicon";
import { normalizeCogIconSvgMarkup } from "src/cs/base/browser/ui/cogIcon/cogIconMarkup";
import { cx } from "src/utils/cx";

import "src/cs/base/browser/ui/checkbox/checkbox.css";

export type CheckboxTag = "span" | "div";
export type CheckboxSize = "sm" | "md" | "lg";

export type CheckboxOptions = {
  readonly checked?: boolean;
  readonly className?: string;
  readonly decorative?: boolean;
  readonly iconClassName?: string;
  readonly iconSize?: number;
  readonly size?: CheckboxSize;
};

export const getCheckboxClassName = ({
  checked = false,
  className = "",
  size = "sm",
}: Pick<CheckboxOptions, "checked" | "className" | "size"> = {}): string =>
  cx("ui-checkbox", `ui-checkbox--${size}`, checked && "checked", className);

export const getCheckboxAriaAttributes = ({
  checked = false,
  decorative = true,
}: Pick<CheckboxOptions, "checked" | "decorative"> = {}): Record<string, string | boolean> =>
  decorative
    ? { "aria-hidden": true }
    : {
        role: "checkbox",
        "aria-checked": checked,
      };

export const getCheckboxIconMarkup = ({
  checked = false,
  iconSize,
  size = "sm",
}: Pick<CheckboxOptions, "checked" | "iconSize" | "size"> = {}): string => {
  if (!checked) return "";

  const resolvedIconSize = iconSize ?? (size === "lg" ? 11 : 10);
  return normalizeCogIconSvgMarkup(lxCheck).replace(
    /<svg\b([^>]*)>/i,
    (_match, attributes: string) =>
      `<svg${attributes} width="${resolvedIconSize}" height="${resolvedIconSize}">`,
  );
};

export const createCheckbox = (
  tagName: CheckboxTag = "span",
  options: CheckboxOptions = {},
): HTMLElement => {
  const checkbox = document.createElement(tagName);
  updateCheckbox(checkbox, options);
  return checkbox;
};

export const updateCheckbox = (
  checkbox: HTMLElement,
  options: CheckboxOptions = {},
): void => {
  checkbox.className = getCheckboxClassName(options);

  for (const [name, value] of Object.entries(getCheckboxAriaAttributes(options))) {
    checkbox.setAttribute(name, String(value));
  }

  checkbox.innerHTML = getCheckboxIconMarkup(options);
};
