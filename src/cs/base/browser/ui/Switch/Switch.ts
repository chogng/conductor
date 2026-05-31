import { cx } from "src/utils/cx";

import "src/cs/base/browser/ui/switch/switch.css";

export type SwitchSize = "sm" | "md" | "lg";

export type SwitchStyleVars = Partial<CSSStyleDeclaration> & {
  "--switch-width"?: string;
  "--switch-height"?: string;
  "--switch-on"?: string;
  "--switch-on-hover"?: string;
};

export type SwitchOptions = {
  readonly checked?: boolean;
  readonly className?: string;
  readonly disabled?: boolean;
  readonly id?: string;
  readonly size?: SwitchSize;
  readonly style?: SwitchStyleVars;
  readonly testId?: string;
};

const SWITCH_SIZE_STYLES = {
  sm: {
    "--switch-width": "32px",
    "--switch-height": "18px",
  },
  md: {
    "--switch-width": "40px",
    "--switch-height": "22px",
  },
  lg: {
    "--switch-width": "46px",
    "--switch-height": "26px",
  },
} satisfies Record<SwitchSize, SwitchStyleVars>;

const DEFAULT_SWITCH_STYLE = {
  "--switch-on": "#168a63",
  "--switch-on-hover": "#0f7a56",
} satisfies SwitchStyleVars;

export const getSwitchClassName = ({
  className = "",
}: Pick<SwitchOptions, "className"> = {}): string => cx("ui-switch", className);

export const getSwitchStyle = ({
  size = "md",
  style,
}: Pick<SwitchOptions, "size" | "style"> = {}): SwitchStyleVars => ({
  ...DEFAULT_SWITCH_STYLE,
  ...SWITCH_SIZE_STYLES[size],
  ...style,
});

export const getSwitchDataAttributes = ({
  checked = false,
  size = "md",
  testId,
}: Pick<SwitchOptions, "checked" | "size" | "testId"> = {}): Record<string, string | undefined> => ({
  "data-state": checked ? "checked" : "unchecked",
  "data-size": size,
  "data-testid": import.meta.env.DEV && testId ? testId : undefined,
});

export const createSwitch = (options: SwitchOptions = {}): HTMLButtonElement => {
  const button = document.createElement("button");
  button.type = "button";
  button.role = "switch";
  button.appendChild(createSwitchThumb());
  updateSwitch(button, options);
  return button;
};

export const updateSwitch = (
  button: HTMLButtonElement,
  options: SwitchOptions = {},
): void => {
  if (options.id !== undefined) {
    button.id = options.id;
  }

  button.disabled = options.disabled === true;
  button.className = getSwitchClassName(options);
  button.setAttribute("aria-checked", options.checked ? "true" : "false");

  for (const [name, value] of Object.entries(getSwitchDataAttributes(options))) {
    if (value === undefined) {
      button.removeAttribute(name);
    } else {
      button.setAttribute(name, value);
    }
  }

  button.removeAttribute("style");
  Object.assign(button.style, getSwitchStyle(options));

  if (!button.querySelector(".ui-switch__thumb")) {
    button.appendChild(createSwitchThumb());
  }
};

export const createSwitchThumb = (): HTMLSpanElement => {
  const thumb = document.createElement("span");
  thumb.className = "ui-switch__thumb";
  thumb.setAttribute("aria-hidden", "true");
  return thumb;
};
