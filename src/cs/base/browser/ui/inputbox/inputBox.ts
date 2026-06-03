import "src/cs/base/browser/ui/inputbox/inputBox.css";

type InputBoxOptions = {
  readonly ariaDescribedBy?: string;
  readonly ariaLabel?: string;
  readonly autoComplete?: string;
  readonly className?: string;
  readonly disabled?: boolean;
  readonly error?: boolean;
  readonly fieldClassName?: string;
  readonly id?: string;
  readonly inputClassName?: string;
  readonly name?: string;
  readonly placeholder?: string;
  readonly readOnly?: boolean;
  readonly type?: string;
  readonly value?: string | number;
};

type InputBoxFieldOptions = InputBoxOptions & {
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
}: Pick<InputBoxOptions, "fieldClassName"> = {}): string =>
  classNames("inputbox_field", fieldClassName);

export const getInputBoxNativeClassName = ({
  inputClassName = "",
}: Pick<InputBoxOptions, "inputClassName"> = {}): string =>
  classNames("inputbox_native", inputClassName);

export const getInputBoxFieldState = ({
  disabled = false,
  error = false,
}: Pick<InputBoxOptions, "disabled" | "error"> = {}): "disabled" | "error" | "enable" => {
  if (disabled) {
    return "disabled";
  }
  if (error) {
    return "error";
  }
  return "enable";
};

const createInputBox = (options: InputBoxOptions = {}): HTMLInputElement => {
  const input = document.createElement("input");
  updateInputBox(input, options);
  return input;
};

const updateInputBox = (
  input: HTMLInputElement,
  options: InputBoxOptions = {},
): void => {
  if (options.id !== undefined) {
    input.id = options.id;
  }
  if (options.name !== undefined) {
    input.name = options.name;
  }
  if (options.ariaLabel !== undefined) {
    input.setAttribute("aria-label", options.ariaLabel);
  }
  if (options.ariaDescribedBy !== undefined) {
    setOptionalAttribute(input, "aria-describedby", options.ariaDescribedBy);
  }

  input.type = options.type ?? "text";
  input.value = String(options.value ?? "");
  input.disabled = options.disabled === true;
  input.readOnly = options.readOnly === true;
  input.placeholder = options.placeholder ?? "";
  input.setAttribute("autocomplete", options.autoComplete ?? "off");
  input.className = getInputBoxNativeClassName(options);
  input.setAttribute("aria-invalid", options.error ? "true" : "false");
};

export const createInputBoxField = (options: InputBoxFieldOptions = {}): InputBoxField => {
  const element = document.createElement("div");
  const field = document.createElement("div");
  const input = options.input ?? createInputBox(options);

  element.className = getInputBoxWrapperClassName(options.className);
  element.dataset.style = "inputbox";
  field.className = getInputBoxFieldClassName(options);
  field.dataset.icon = options.right ? "with" : "without";
  field.dataset.state = getInputBoxFieldState(options);

  if (options.input) {
    updateInputBox(input, options);
  }

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

const setOptionalAttribute = (
  element: HTMLElement,
  name: string,
  value: string | undefined,
): void => {
  if (value === undefined || value === "") {
    element.removeAttribute(name);
    return;
  }
  element.setAttribute(name, value);
};
