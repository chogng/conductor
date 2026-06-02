import "src/cs/base/browser/ui/input/input.css";

export type InputSize = "sm" | "md" | "lg" | "xl";

export type InputOptions = {
  readonly allowAutoComplete?: boolean;
  readonly ariaDescribedBy?: string;
  readonly ariaLabel?: string;
  readonly autoComplete?: string;
  readonly className?: string;
  readonly disabled?: boolean;
  readonly error?: boolean;
  readonly fieldClassName?: string;
  readonly hideSpinner?: boolean;
  readonly id?: string;
  readonly inputClassName?: string;
  readonly name?: string;
  readonly placeholder?: string;
  readonly readOnly?: boolean;
  readonly size?: InputSize;
  readonly type?: string;
  readonly value?: string | number;
};

export type InputFieldOptions = InputOptions & {
  readonly input?: HTMLInputElement;
  readonly right?: Node;
};

export type InputField = {
  readonly element: HTMLDivElement;
  readonly field: HTMLDivElement;
  readonly input: HTMLInputElement;
};

export const slugifyInputId = (input: unknown): string =>
  String(input ?? "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");

export const mergeSpaceSeparatedIds = (
  ...parts: Array<string | undefined>
): string | undefined => {
  const ids: string[] = [];
  for (const part of parts) {
    if (typeof part !== "string") {
      continue;
    }
    for (const token of part.split(/\s+/g)) {
      const id = token.trim();
      if (id && !ids.includes(id)) {
        ids.push(id);
      }
    }
  }
  return ids.length ? ids.join(" ") : undefined;
};

export const getInputWrapperClassName = (className = ""): string =>
  classNames("input_wrap", className);

export const getInputFieldClassName = ({
  fieldClassName = "",
  size = "md",
}: Pick<InputOptions, "fieldClassName" | "size"> = {}): string =>
  classNames("input_field", getInputSizeClassName(size), fieldClassName);

export const getInputNativeClassName = ({
  hideSpinner = false,
  inputClassName = "",
}: Pick<InputOptions, "hideSpinner" | "inputClassName"> = {}): string =>
  classNames("input_native", hideSpinner ? "input_native--no-spinner" : "", inputClassName);

export const getInputFieldState = ({
  disabled = false,
  error = false,
}: Pick<InputOptions, "disabled" | "error"> = {}): "disabled" | "error" | "enable" => {
  if (disabled) {
    return "disabled";
  }
  if (error) {
    return "error";
  }
  return "enable";
};

export const createInput = (options: InputOptions = {}): HTMLInputElement => {
  const input = document.createElement("input");
  updateInput(input, options);
  return input;
};

export const updateInput = (
  input: HTMLInputElement,
  options: InputOptions = {},
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
  input.setAttribute(
    "autocomplete",
    options.allowAutoComplete ? options.autoComplete ?? "" : "off",
  );
  input.className = getInputNativeClassName(options);
  input.setAttribute("aria-invalid", options.error ? "true" : "false");
};

export const createInputField = (options: InputFieldOptions = {}): InputField => {
  const element = document.createElement("div");
  const field = document.createElement("div");
  const input = options.input ?? createInput(options);

  element.className = getInputWrapperClassName(options.className);
  element.dataset.style = "input";
  field.className = getInputFieldClassName(options);
  field.dataset.icon = options.right ? "with" : "without";
  field.dataset.state = getInputFieldState(options);

  if (options.input) {
    updateInput(input, options);
  }

  field.append(input);
  if (options.right) {
    const right = document.createElement("span");
    right.className = "input_right";
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

export const updateInputField = (
  inputField: InputField,
  options: InputFieldOptions = {},
): void => {
  inputField.element.className = getInputWrapperClassName(options.className);
  inputField.field.className = getInputFieldClassName(options);
  inputField.field.dataset.icon = options.right ? "with" : "without";
  inputField.field.dataset.state = getInputFieldState(options);

  updateInput(inputField.input, options);
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

const getInputSizeClassName = (size: InputSize): string => {
  if (size === "sm") {
    return "input_field--sm";
  }
  if (size === "lg") {
    return "input_field--lg";
  }
  if (size === "xl") {
    return "input_field--xl";
  }
  return "input_field--md";
};
