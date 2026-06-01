import "src/cs/base/browser/ui/switch/switch.css";

export type SwitchStyleVars = Partial<CSSStyleDeclaration> & {
  "--switch-on"?: string;
  "--switch-on-hover"?: string;
};

export type SwitchOptions = {
  readonly checked?: boolean;
  readonly className?: string;
  readonly disabled?: boolean;
  readonly id?: string;
  readonly style?: SwitchStyleVars;
  readonly testId?: string;
};

const getSwitchClassName = ({
  className = "",
}: Pick<SwitchOptions, "className"> = {}): string => {
  if (!className) {
    return "ui-switch";
  }

  return `ui-switch ${className}`;
};

const getSwitchStyle = ({
  style,
}: Pick<SwitchOptions, "style"> = {}): SwitchStyleVars => style ?? {};

const getSwitchDataAttributes = ({
  checked = false,
  testId,
}: Pick<SwitchOptions, "checked" | "testId"> = {}): Record<string, string | undefined> => ({
  "data-state": checked ? "checked" : "unchecked",
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
  applySwitchStyle(button, getSwitchStyle(options));

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

const applySwitchStyle = (
  button: HTMLButtonElement,
  style: SwitchStyleVars,
): void => {
  for (const [name, value] of Object.entries(style)) {
    if (value === undefined || value === null || value === "") {
      button.style.removeProperty(name);
      continue;
    }

    button.style.setProperty(name, String(value));
  }
};
