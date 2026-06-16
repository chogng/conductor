import {
  createInputBox,
  updateInputBox,
  type InputBoxOptions,
} from "src/cs/base/browser/ui/inputbox/inputBox";

import "src/cs/base/browser/ui/inputbox/inputBox.css";

type InputBoxFieldOptions = InputBoxOptions & {
  readonly className?: string;
  readonly fieldClassName?: string;
  readonly input?: HTMLInputElement;
  readonly right?: Node;
};

type InputBoxField = {
  readonly element: HTMLDivElement;
  readonly field: HTMLDivElement;
  readonly input: HTMLInputElement;
};

export const getInputBoxWrapperClassName = (className = ""): string =>
  classNames("inputbox_wrap", className);

export const getInputBoxFieldClassName = ({
  fieldClassName = "",
}: Pick<InputBoxFieldOptions, "fieldClassName"> = {}): string =>
  classNames("inputbox_field", fieldClassName);

export const getInputBoxNativeClassName = ({
  inputClassName = "",
}: Pick<InputBoxFieldOptions, "inputClassName"> = {}): string =>
  classNames("inputbox_native", inputClassName);

export const getInputBoxFieldState = ({
  disabled = false,
  error = false,
}: Pick<InputBoxFieldOptions, "disabled" | "error"> = {}): "disabled" | "error" | "enable" => {
  if (disabled) {
    return "disabled";
  }
  if (error) {
    return "error";
  }
  return "enable";
};

export const createInputBoxField = (options: InputBoxFieldOptions = {}): InputBoxField => {
  const element = document.createElement("div");
  const field = document.createElement("div");
  const input = options.input ?? createInputBox(getInputBoxFieldInputOptions(options));

  if (options.input) {
    updateInputBox(input, getInputBoxFieldInputOptions(options));
  }

  element.className = getInputBoxWrapperClassName(options.className);
  element.dataset.style = "inputbox";
  field.className = getInputBoxFieldClassName(options);
  field.dataset.icon = options.right ? "with" : "without";
  field.dataset.state = getInputBoxFieldState({
    disabled: options.disabled ?? input.disabled,
    error: options.error ?? input.getAttribute("aria-invalid") === "true",
  });

  field.append(input);
  if (options.right) {
    const right = document.createElement("span");
    right.className = "inputbox_right";
    right.append(options.right);
    field.append(right);
  }
  element.append(field);

  return {
    element,
    field,
    input,
  };
};

const getInputBoxFieldInputOptions = (options: InputBoxFieldOptions): InputBoxOptions => ({
  ariaDescribedBy: options.ariaDescribedBy,
  ariaLabel: options.ariaLabel,
  ariaLabelledBy: options.ariaLabelledBy,
  autoComplete: options.autoComplete,
  disabled: options.disabled,
  error: options.error,
  id: options.id,
  inputClassName: getInputBoxNativeClassName(options),
  name: options.name,
  placeholder: options.placeholder,
  readOnly: options.readOnly,
  type: options.type,
  value: options.value,
});

const classNames = (...parts: string[]): string => {
  const names: string[] = [];
  for (const part of parts) {
    const name = part.trim();
    if (name) {
      names.push(name);
    }
  }
  return names.join(" ");
};
