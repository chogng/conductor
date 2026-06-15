import "src/cs/base/browser/ui/button/button.css";

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "ghost"
  | "text"
  | "icon"
  | "danger";

export type ButtonSize = "sm" | "md" | "lg" | "control" | "icon" | "iconSm";

export type ButtonContent = string | Node | readonly Node[];

export type ButtonOptions = {
  readonly ariaLabel?: string;
  readonly className?: string;
  readonly content?: ButtonContent;
  readonly contentClassName?: string;
  readonly dataIcon?: string;
  readonly disabled?: boolean;
  readonly fullWidth?: boolean;
  readonly fx?: boolean;
  readonly id?: string;
  readonly label?: string;
  readonly size?: ButtonSize;
  readonly testId?: string;
  readonly title?: string;
  readonly type?: "button" | "submit" | "reset";
  readonly variant?: ButtonVariant;
};

export const getButtonClassName = ({
  className = "",
  disabled = false,
  fullWidth = false,
  size = "md",
  variant = "primary",
}: Pick<
  ButtonOptions,
  "className" | "disabled" | "fullWidth" | "size" | "variant"
>): string => {
  const variantClass = getButtonVariantClassName(variant, disabled);
  const sizeClass = getButtonSizeClassName(size);
  const classNames = ["action-btn", sizeClass, variantClass];
  if (fullWidth) {
    classNames.push("action-btn--full");
  }
  if (className) {
    classNames.push(className);
  }

  return classNames.join(" ");
};

export const getButtonContentClassName = (className = ""): string =>
  className ? `action-btn__content ${className}` : "action-btn__content";

export const getButtonDataAttributes = ({
  dataIcon,
  fx = false,
  testId,
}: Pick<
  ButtonOptions,
  "dataIcon" | "fx" | "testId"
>): Record<string, string | undefined> => ({
  "data-icon": dataIcon,
  "data-fx": fx ? "on" : undefined,
  "data-testid": import.meta.env?.DEV && testId ? testId : undefined,
});

export const createButton = (options: ButtonOptions): HTMLButtonElement => {
  const button = document.createElement("button");
  button.type = options.type ?? "button";
  updateButton(button, options);
  return button;
};

export const updateButton = (
  button: HTMLButtonElement,
  options: ButtonOptions,
): void => {
  if (options.id !== undefined) {
    button.id = options.id;
  }
  button.type = options.type ?? button.type ?? "button";
  button.disabled = options.disabled === true;
  button.className = getButtonClassName(options);

  if (options.ariaLabel !== undefined) {
    button.setAttribute("aria-label", options.ariaLabel);
  } else {
    button.removeAttribute("aria-label");
  }

  for (const [name, value] of Object.entries(getButtonDataAttributes(options))) {
    if (value === undefined) {
      button.removeAttribute(name);
    } else {
      button.setAttribute(name, value);
    }
  }

  const content = document.createElement("span");
  content.className = getButtonContentClassName(options.contentClassName);
  appendButtonContent(content, options.content ?? options.label ?? "");
  button.replaceChildren(content);

  if (options.title !== undefined && !content.textContent?.trim()) {
    button.title = options.title;
  } else {
    button.removeAttribute("title");
  }
};

const getButtonVariantClassName = (
  variant: ButtonVariant,
  isDisabled: boolean,
): string => {
  if (variant === "icon" && isDisabled) return "action-btn--icon-disabled";
  if (variant === "icon") return "action-btn--icon";
  if (isDisabled) return "action-btn--disabled";
  if (variant === "secondary") return "action-btn--secondary";
  if (variant === "ghost") return "action-btn--ghost";
  if (variant === "text") return "action-btn--text";
  if (variant === "danger") return "action-btn--danger";
  return "action-btn--primary";
};

const getButtonSizeClassName = (size: ButtonSize): string => {
  if (size === "sm") return "action-btn--sm";
  if (size === "lg") return "action-btn--lg";
  if (size === "control") return "action-btn--control";
  if (size === "iconSm") return "action-btn--icon-sm";
  if (size === "icon") return "action-btn--icon-size";
  return "action-btn--md";
};

const appendButtonContent = (
  container: HTMLElement,
  content: ButtonContent,
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
