import { Stepper } from "src/cs/base/browser/ui/stepper/stepper";
import type { IAction } from "src/cs/base/common/actions";
import { LxIcon } from "src/cs/base/common/lxicon";
import { localize } from "src/cs/nls";
import type { ColumnDisplayProfile } from "src/cs/workbench/services/table/common/tableDisplayProfile";

export type TableColumnScaleStepperActions = {
  readonly decrease: IAction;
  readonly increase: IAction;
  readonly reset: IAction;
};

export const createTableColumnScaleStepper = ({
  decrease,
  increase,
  reset,
}: TableColumnScaleStepperActions): Stepper => {
  const stepper = new Stepper({
    ariaLabel: localize("table.preview.columnScaleControl", "Column scale"),
    decrease: {
      action: decrease,
      dataset: {
        scaleAction: "decrease",
      },
      icon: LxIcon.remove,
    },
    increase: {
      action: increase,
      dataset: {
        scaleAction: "increase",
      },
      icon: LxIcon.add,
    },
    value: {
      action: reset,
      dataset: {
        scaleAction: "reset",
      },
      kind: "button",
    },
  });
  stepper.element.hidden = true;
  return stepper;
};

export const syncTableColumnScaleStepper = (
  stepper: Stepper,
  colIndex: number,
  profile: ColumnDisplayProfile,
): boolean => {
  const showStepper = isTableColumnScaleStepperVisible(profile);
  let changed = setHidden(stepper.element, !showStepper);
  if (!showStepper) {
    return changed;
  }

  const colIndexValue = String(colIndex);
  if (setTableColumnScaleStepperIndex(stepper, colIndexValue)) {
    changed = true;
  }
  const valueText = getTableColumnScaleStepperValueText(profile);
  if (stepper.setValue(valueText)) {
    changed = true;
  }
  stepper.syncActions();

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

const getTableColumnScaleStepperValueText = (profile: ColumnDisplayProfile): string =>
  String(profile.scaleExponent);

const setTableColumnScaleStepperIndex = (
  stepper: Stepper,
  colIndexValue: string,
): boolean => {
  if (stepper.element.dataset.colIndex === colIndexValue) {
    return false;
  }

  stepper.element.dataset.colIndex = colIndexValue;
  return true;
};

const setHidden = (element: HTMLElement, hidden: boolean): boolean => {
  if (element.hidden === hidden) {
    return false;
  }

  element.hidden = hidden;
  return true;
};
