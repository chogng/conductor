import { createLxIcon } from "src/cs/base/browser/ui/lxicon/lxicon";
import { LxIcon, type LxIconDefinition } from "src/cs/base/common/lxicon";
import { localize } from "src/cs/nls";
import type { ColumnDisplayProfile } from "src/cs/workbench/services/table/common/tableDisplayProfile";

type TableStepperDataset = Readonly<Record<string, string>>;

type TableStepperButtonOptions = {
  readonly className?: string;
  readonly dataset?: TableStepperDataset;
  readonly disabled?: boolean;
  readonly icon?: LxIconDefinition;
  readonly label: string;
  readonly keyShortcuts?: string;
};

type TableStepperValueOptions = {
  readonly className?: string;
  readonly dataset?: TableStepperDataset;
  readonly disabled?: boolean;
  readonly kind: "button" | "text";
  readonly label?: string;
  readonly live?: "polite";
};

export type TableStepper = {
  readonly decreaseButton: HTMLButtonElement;
  readonly element: HTMLElement;
  readonly increaseButton: HTMLButtonElement;
  readonly valueElement: HTMLElement;
  setAriaLabel: (label: string) => boolean;
  setDisabled: (disabled: TableStepperDisabledState) => boolean;
  setValue: (value: string) => boolean;
};

export type TableStepperOptions = {
  readonly ariaLabel: string;
  readonly className?: string;
  readonly decrease: TableStepperButtonOptions;
  readonly increase: TableStepperButtonOptions;
  readonly value: TableStepperValueOptions;
  readonly valueText?: string;
};

export type TableStepperDisabledState = {
  readonly decrease?: boolean;
  readonly increase?: boolean;
  readonly value?: boolean;
};

export const createTableStepper = ({
  ariaLabel,
  className,
  decrease,
  increase,
  value,
  valueText = "",
}: TableStepperOptions): TableStepper => {
  const element = document.createElement("div");
  element.className = className ? `table_view_stepper ${className}` : "table_view_stepper";
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

export type TableColumnScaleStepper = TableStepper;

export type TableColumnScaleStepperAction = "decrease" | "increase" | "reset";

export type TableColumnScaleStepperTarget = {
  readonly action: TableColumnScaleStepperAction;
  readonly colIndex: number;
};

export const createTableColumnScaleStepper = (): TableColumnScaleStepper => {
  const stepper = createTableStepper({
    ariaLabel: localize("table.preview.columnScaleControl", "Column scale"),
    className: "table_view_column_scale_control",
    decrease: {
      className: "table_view_column_scale_button table_view_column_scale_button_minus",
      dataset: {
        scaleAction: "decrease",
      },
      label: localize("table.preview.decreaseColumnScale", "Decrease column scale exponent"),
    },
    increase: {
      className: "table_view_column_scale_button table_view_column_scale_button_plus",
      dataset: {
        scaleAction: "increase",
      },
      label: localize("table.preview.increaseColumnScale", "Increase column scale exponent"),
    },
    value: {
      className: "table_view_column_scale_value table_view_column_scale_button",
      dataset: {
        scaleAction: "reset",
      },
      kind: "button",
      label: localize("table.preview.resetColumnScale", "Reset column scale to automatic"),
    },
  });
  stepper.element.hidden = true;
  return stepper;
};

export const getTableColumnScaleStepperTarget = (
  stepper: TableColumnScaleStepper,
  eventTarget: EventTarget | null,
): TableColumnScaleStepperTarget | null => {
  if (!(eventTarget instanceof Element)) {
    return null;
  }

  const button = eventTarget.closest<HTMLElement>(".table_view_column_scale_button");
  if (!button || !stepper.element.contains(button)) {
    return null;
  }

  const action = normalizeTableColumnScaleStepperAction(button.dataset.scaleAction);
  const colIndex = normalizeTableColumnScaleStepperIndex(button.dataset.colIndex);
  return action && colIndex !== null
    ? { action, colIndex }
    : null;
};

export const syncTableColumnScaleStepper = (
  stepper: TableColumnScaleStepper,
  colIndex: number,
  profile: ColumnDisplayProfile,
): boolean => {
  const showStepper = isTableColumnScaleStepperVisible(profile);
  let changed = setHidden(stepper.element, !showStepper);
  if (!showStepper) {
    return changed;
  }

  const colIndexValue = String(colIndex);
  if (stepper.element.dataset.colIndex !== colIndexValue) {
    stepper.element.dataset.colIndex = colIndexValue;
    changed = true;
  }

  if (setTableColumnScaleStepperIndex(stepper, colIndexValue)) {
    changed = true;
  }
  const valueText = getTableColumnScaleStepperValueText(profile);
  if (stepper.setValue(valueText)) {
    changed = true;
  }
  if (stepper.setDisabled({ value: !profile.isScaleManual })) {
    changed = true;
  }

  const ariaLabel = profile.isScaleManual
    ? localize("table.preview.columnScaleManual", "Column scale exponent {scale}, manually adjusted", { scale: valueText })
    : localize("table.preview.columnScaleAutomatic", "Column scale exponent {scale}, automatic", { scale: valueText });
  if (stepper.setAriaLabel(ariaLabel)) {
    changed = true;
  }

  return changed;
};

export const isTableColumnScaleStepperVisible = (profile: ColumnDisplayProfile): boolean =>
  profile.mode === "columnScale" &&
  profile.isNumericColumn &&
  (Boolean(profile.headerSuffix) || Boolean(profile.isScaleManual));

const createStepperButton = ({
  className,
  dataset,
  disabled,
  icon,
  label,
  keyShortcuts,
}: TableStepperButtonOptions & { readonly icon: LxIconDefinition }): HTMLButtonElement => {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className ? `table_view_stepper_button ${className}` : "table_view_stepper_button";
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
}: TableStepperValueOptions): HTMLElement => {
  let element: HTMLElement;
  if (kind === "button") {
    const button = document.createElement("button");
    button.type = "button";
    element = button;
  } else {
    element = document.createElement("span");
  }
  element.className = className ? `table_view_stepper_value ${className}` : "table_view_stepper_value";
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

const getTableColumnScaleStepperValueText = (profile: ColumnDisplayProfile): string =>
  String(profile.scaleExponent);

const setTableColumnScaleStepperIndex = (
  stepper: TableColumnScaleStepper,
  colIndexValue: string,
): boolean => {
  let changed = false;
  for (const element of [
    stepper.decreaseButton,
    stepper.valueElement,
    stepper.increaseButton,
  ]) {
    if (element.dataset.colIndex !== colIndexValue) {
      element.dataset.colIndex = colIndexValue;
      changed = true;
    }
  }
  return changed;
};

const normalizeTableColumnScaleStepperAction = (
  value: string | undefined,
): TableColumnScaleStepperAction | null =>
  value === "decrease" || value === "increase" || value === "reset"
    ? value
    : null;

const normalizeTableColumnScaleStepperIndex = (value: string | undefined): number | null => {
  const index = Number(value);
  return Number.isInteger(index) && index >= 0 ? index : null;
};

const applyDataset = (element: HTMLElement, dataset: TableStepperDataset | undefined): void => {
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

const setHidden = (element: HTMLElement, hidden: boolean): boolean => {
  if (element.hidden === hidden) {
    return false;
  }

  element.hidden = hidden;
  return true;
};
