export type InputBoxOptions = {
  readonly ariaDescribedBy?: string;
  readonly ariaLabel?: string;
  readonly ariaLabelledBy?: string;
  readonly autoComplete?: string;
  readonly disabled?: boolean;
  readonly error?: boolean;
  readonly id?: string;
  readonly inputClassName?: string;
  readonly name?: string;
  readonly placeholder?: string;
  readonly readOnly?: boolean;
  readonly type?: string;
  readonly value?: string | number;
};

export const createInputBox = (options: InputBoxOptions = {}): HTMLInputElement => {
  const input = document.createElement("input");
  updateInputBox(input, options, true);
  return input;
};

export const updateInputBox = (
  input: HTMLInputElement,
  options: InputBoxOptions = {},
  applyDefaults = false,
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
  if (options.ariaLabelledBy !== undefined) {
    setOptionalAttribute(input, "aria-labelledby", options.ariaLabelledBy);
  }
  if (options.ariaDescribedBy !== undefined) {
    setOptionalAttribute(input, "aria-describedby", options.ariaDescribedBy);
  }

  if (applyDefaults || options.type !== undefined) {
    input.type = options.type ?? "text";
  }
  if (options.value !== undefined && input.value !== String(options.value)) {
    input.value = String(options.value);
  }
  if (applyDefaults || options.disabled !== undefined) {
    input.disabled = options.disabled === true;
  }
  if (applyDefaults || options.readOnly !== undefined) {
    input.readOnly = options.readOnly === true;
  }
  if (applyDefaults || options.placeholder !== undefined) {
    input.placeholder = options.placeholder ?? "";
  }
  if (applyDefaults || options.autoComplete !== undefined) {
    input.setAttribute("autocomplete", options.autoComplete ?? "off");
  }
  if (options.inputClassName !== undefined) {
    input.className = options.inputClassName;
  }
  if (applyDefaults || options.error !== undefined) {
    input.setAttribute("aria-invalid", options.error ? "true" : "false");
  }
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
