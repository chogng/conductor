/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Stepper, StepperActionViewItem } from "src/cs/base/browser/ui/stepper/stepper";
import { TABLE_WIDGET_ZOOM_OPTIONS } from "src/cs/base/browser/ui/table/table";
import type { IAction } from "src/cs/base/common/actions";
import { LxIcon } from "src/cs/base/common/lxicon";
import { localize } from "src/cs/nls";
import type { ColumnDisplayProfile } from "src/cs/workbench/services/table/common/tableDisplayProfile";

export type TableStepperActions = {
  readonly decrease: IAction;
  readonly increase: IAction;
  readonly reset: IAction;
};

export const createTableColumnScaleStepper = ({
  decrease,
  increase,
  reset,
}: TableStepperActions): Stepper => {
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
  stepper.element.classList.add("table_view_column_scale_control");
  stepper.element.hidden = true;
  return stepper;
};

export const createTableZoomStepperActionViewItem = (
  action: IAction,
  {
    decrease,
    increase,
    reset,
  }: TableStepperActions,
): StepperActionViewItem =>
  new StepperActionViewItem(action, {
    ariaLabel: localize("table.zoomControl", "Table zoom"),
    decrease: {
      action: decrease,
      keyShortcuts: "Control+-",
    },
    increase: {
      action: increase,
      keyShortcuts: "Control+=",
    },
    value: {
      action: reset,
      kind: "button",
      live: "polite",
    },
  });

export const syncTableColumnScaleStepper = (
  stepper: Stepper,
  colIndex: number,
  profile: ColumnDisplayProfile,
): boolean => {
  let changed = false;
  const colIndexValue = String(colIndex);
  if (setTableColumnScaleStepperIndex(stepper, colIndexValue)) {
    changed = true;
  }
  const valueText = getTableColumnScaleStepperValueText(profile);
  if (stepper.setValue(valueText)) {
    changed = true;
  }

  const ariaLabel = !isTableColumnScaleAdjustable(profile)
    ? localize("table.preview.columnScaleUnavailable", "Column scale exponent {scale}, unavailable for this column", { scale: valueText })
    : profile.isScaleManual
      ? localize("table.preview.columnScaleManual", "Column scale exponent {scale}, manually adjusted", { scale: valueText })
      : localize("table.preview.columnScaleAutomatic", "Column scale exponent {scale}, automatic", { scale: valueText });
  if (stepper.setAriaLabel(ariaLabel)) {
    changed = true;
  }

  return changed;
};

export const syncTableZoomStepper = (
  stepper: Stepper | null,
  {
    decrease,
    increase,
    reset,
  }: TableStepperActions,
  zoomPercent: number | null | undefined,
): void => {
  const value = zoomPercent ?? TABLE_WIDGET_ZOOM_OPTIONS.defaultPercent;
  decrease.enabled = value > TABLE_WIDGET_ZOOM_OPTIONS.minPercent;
  increase.enabled = value < TABLE_WIDGET_ZOOM_OPTIONS.maxPercent;
  reset.enabled = value !== TABLE_WIDGET_ZOOM_OPTIONS.defaultPercent;
  stepper?.setValue(`${value}%`);
  stepper?.syncActions();
};

export const isTableColumnScaleAdjustable = (profile: ColumnDisplayProfile): boolean =>
  profile.mode === "columnScale" &&
  profile.isNumericColumn;

export const isTableColumnScaleBadgeVisible = (profile: ColumnDisplayProfile): boolean =>
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
