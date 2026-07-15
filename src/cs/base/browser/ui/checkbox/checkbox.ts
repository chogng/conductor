import { createLxIcon } from "src/cs/base/browser/ui/lxicon/lxicon";
import { LxIcon } from "src/cs/base/common/lxicon";

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
}: Pick<CheckboxOptions, "checked" | "className" | "size"> = {}): string => {
  const classNames = ["ui-checkbox", `ui-checkbox--${size}`];

  if (checked) {
    classNames.push("checked");
  }

  if (className) {
    classNames.push(className);
  }

  return classNames.join(" ");
};

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

const createCheckboxIcon = ({
  checked = false,
  iconClassName = "",
  iconSize,
  size = "sm",
}: Pick<CheckboxOptions, "checked" | "iconClassName" | "iconSize" | "size"> = {}): HTMLSpanElement | undefined => {
  if (!checked) {
    return undefined;
  }

  const resolvedIconSize = iconSize ?? (size === "lg" ? 11 : 10);
  const icon = createLxIcon({
    className: iconClassName || undefined,
    icon: LxIcon.check,
    size: resolvedIconSize,
  });
  icon.setAttribute("aria-hidden", "true");
  return icon;
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

  checkbox.removeAttribute("role");
  checkbox.removeAttribute("aria-checked");
  checkbox.removeAttribute("aria-hidden");

  for (const [name, value] of Object.entries(getCheckboxAriaAttributes(options))) {
    checkbox.setAttribute(name, String(value));
  }

  checkbox.replaceChildren();
  const icon = createCheckboxIcon(options);
  if (icon) {
    checkbox.appendChild(icon);
  }
};
