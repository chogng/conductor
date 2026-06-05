import "src/cs/base/browser/ui/toggle/toggle.css";

export type ToggleSize = "sm" | "md";
export type ToggleContent = string | Node | readonly Node[];

export type ToggleOptions = {
  readonly ariaLabel?: string;
  readonly checked?: boolean;
  readonly className?: string;
  readonly content?: ToggleContent;
  readonly disabled?: boolean;
  readonly id?: string;
  readonly label?: string;
  readonly size?: ToggleSize;
  readonly testId?: string;
  readonly title?: string;
  readonly onToggle?: (checked: boolean) => void;
};

export const getToggleClassName = ({
  className = "",
  size = "md",
}: Pick<ToggleOptions, "className" | "size"> = {}): string => {
  const classNames = ["ui-toggle", `ui-toggle--${size}`];

  if (className) {
    classNames.push(className);
  }

  return classNames.join(" ");
};

export const getToggleDataAttributes = ({
  checked = false,
  testId,
}: Pick<ToggleOptions, "checked" | "testId"> = {}): Record<string, string | undefined> => ({
  "data-state": checked ? "checked" : "unchecked",
  "data-testid": import.meta.env?.DEV && testId ? testId : undefined,
});

export const createToggle = (options: ToggleOptions = {}): HTMLButtonElement => {
  const button = document.createElement("button");
  button.type = "button";
  updateToggle(button, options);
  return button;
};

export const updateToggle = (
  button: HTMLButtonElement,
  options: ToggleOptions = {},
): void => {
  if (options.id !== undefined) {
    button.id = options.id;
  }

  button.type = "button";
  button.disabled = options.disabled === true;
  button.className = getToggleClassName(options);
  setToggleChecked(button, options.checked === true);

  if (options.title !== undefined) {
    button.title = options.title;
  }

  if (options.ariaLabel !== undefined) {
    button.setAttribute("aria-label", options.ariaLabel);
  } else {
    button.removeAttribute("aria-label");
  }

  for (const [name, value] of Object.entries(getToggleDataAttributes(options))) {
    if (value === undefined) {
      button.removeAttribute(name);
    } else {
      button.setAttribute(name, value);
    }
  }

  button.onclick = options.onToggle
    ? () => {
        const checked = button.getAttribute("aria-pressed") !== "true";
        setToggleChecked(button, checked);
        options.onToggle?.(checked);
      }
    : null;

  const content = document.createElement("span");
  content.className = "ui-toggle__content";
  appendToggleContent(content, options.content ?? options.label ?? "");
  button.replaceChildren(content);
};

export const setToggleChecked = (
  button: HTMLButtonElement,
  checked: boolean,
): void => {
  button.setAttribute("aria-pressed", checked ? "true" : "false");
  button.setAttribute("data-state", checked ? "checked" : "unchecked");
};

const appendToggleContent = (
  container: HTMLElement,
  content: ToggleContent,
): void => {
  if (typeof content === "string") {
    container.textContent = content;
    return;
  }

  if (content instanceof Node) {
    container.appendChild(content);
    return;
  }

  container.append(...content);
};
