import { createLxIcon } from "src/cs/base/browser/ui/lxicon/lxicon";
import { LxIcon, type LxIconDefinition } from "src/cs/base/common/lxicon";

type TableValueStepperDataset = Readonly<Record<string, string>>;

type TableValueStepperButtonOptions = {
  readonly className?: string;
  readonly dataset?: TableValueStepperDataset;
  readonly disabled?: boolean;
  readonly icon?: LxIconDefinition;
  readonly label: string;
  readonly keyShortcuts?: string;
};

type TableValueStepperValueOptions = {
  readonly className?: string;
  readonly dataset?: TableValueStepperDataset;
  readonly disabled?: boolean;
  readonly kind: "button" | "text";
  readonly label?: string;
  readonly live?: "polite";
};

export type TableValueStepperControl = {
  readonly decreaseButton: HTMLButtonElement;
  readonly element: HTMLElement;
  readonly increaseButton: HTMLButtonElement;
  readonly valueElement: HTMLElement;
  setAriaLabel: (label: string) => boolean;
  setDisabled: (disabled: TableValueStepperDisabledState) => boolean;
  setValue: (value: string) => boolean;
};

export type TableValueStepperControlOptions = {
  readonly ariaLabel: string;
  readonly className?: string;
  readonly decrease: TableValueStepperButtonOptions;
  readonly increase: TableValueStepperButtonOptions;
  readonly value: TableValueStepperValueOptions;
  readonly valueText?: string;
};

export type TableValueStepperDisabledState = {
  readonly decrease?: boolean;
  readonly increase?: boolean;
  readonly value?: boolean;
};

export const createTableValueStepperControl = ({
  ariaLabel,
  className,
  decrease,
  increase,
  value,
  valueText = "",
}: TableValueStepperControlOptions): TableValueStepperControl => {
  const element = document.createElement("div");
  element.className = className ? `table_view_zoom_control ${className}` : "table_view_zoom_control";
  element.setAttribute("role", "group");
  element.setAttribute("aria-label", ariaLabel);

  const decreaseButton = createStepperButton({
    ...decrease,
    icon: decrease.icon ?? LxIcon.remove,
  });
  const valueElement = createStepperValue(value);
  const increaseButton = createStepperButton({
    ...increase,
    icon: increase.icon ?? LxIcon.add,
  });

  setText(valueElement, valueText);
  element.append(decreaseButton, valueElement, increaseButton);

  return {
    decreaseButton,
    element,
    increaseButton,
    valueElement,
    setAriaLabel: label => setAriaLabel(element, label),
    setDisabled: disabled => {
      let changed = false;
      if (typeof disabled.decrease === "boolean" && setButtonDisabled(decreaseButton, disabled.decrease)) {
        changed = true;
      }
      if (typeof disabled.value === "boolean" && valueElement instanceof HTMLButtonElement && setButtonDisabled(valueElement, disabled.value)) {
        changed = true;
      }
      if (typeof disabled.increase === "boolean" && setButtonDisabled(increaseButton, disabled.increase)) {
        changed = true;
      }
      return changed;
    },
    setValue: nextValue => setText(valueElement, nextValue),
  };
};

const createStepperButton = ({
  className,
  dataset,
  disabled,
  icon,
  label,
  keyShortcuts,
}: TableValueStepperButtonOptions & { readonly icon: LxIconDefinition }): HTMLButtonElement => {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className ? `table_view_zoom_button ${className}` : "table_view_zoom_button";
  button.title = label;
  button.setAttribute("aria-label", label);
  if (keyShortcuts) {
    button.setAttribute("aria-keyshortcuts", keyShortcuts);
  }
  applyDataset(button, dataset);
  button.append(createLxIcon({
    icon,
    size: 14,
  }));
  if (typeof disabled === "boolean") {
    setButtonDisabled(button, disabled);
  }
  return button;
};

const createStepperValue = ({
  className,
  dataset,
  disabled,
  kind,
  label,
  live,
}: TableValueStepperValueOptions): HTMLElement => {
  let element: HTMLElement;
  if (kind === "button") {
    const button = document.createElement("button");
    button.type = "button";
    element = button;
  } else {
    element = document.createElement("span");
  }
  element.className = className ? `table_view_zoom_value ${className}` : "table_view_zoom_value";
  if (label) {
    element.setAttribute("aria-label", label);
    if (kind === "button") {
      element.title = label;
    }
  }
  if (live) {
    element.setAttribute("aria-live", live);
  }
  applyDataset(element, dataset);
  if (typeof disabled === "boolean" && element instanceof HTMLButtonElement) {
    setButtonDisabled(element, disabled);
  }
  return element;
};

const applyDataset = (element: HTMLElement, dataset: TableValueStepperDataset | undefined): void => {
  if (!dataset) {
    return;
  }
  for (const [key, value] of Object.entries(dataset)) {
    element.dataset[key] = value;
  }
};

const setAriaLabel = (element: HTMLElement, label: string): boolean => {
  if (element.getAttribute("aria-label") === label) {
    return false;
  }
  element.setAttribute("aria-label", label);
  return true;
};

const setButtonDisabled = (element: HTMLButtonElement, disabled: boolean): boolean => {
  let changed = false;
  if (element.disabled !== disabled) {
    element.disabled = disabled;
    changed = true;
  }
  const ariaDisabled = String(disabled);
  if (element.getAttribute("aria-disabled") !== ariaDisabled) {
    element.setAttribute("aria-disabled", ariaDisabled);
    changed = true;
  }
  return changed;
};

const setText = (element: HTMLElement, text: string): boolean => {
  if (element.textContent === text) {
    return false;
  }
  element.textContent = text;
  return true;
};
