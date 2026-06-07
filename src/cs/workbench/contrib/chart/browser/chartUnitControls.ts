import { createSelectBox } from "src/cs/base/browser/ui/selectBox/selectBox";
import type { DisposableStore } from "src/cs/base/common/lifecycle";
import { localize } from "src/cs/nls";
import {
  X_UNIT_VALUES,
  Y_UNIT_VALUES,
  type XUnit,
  type YUnit,
} from "src/cs/workbench/contrib/plot/common/units";

export type ChartUnitAxis = "x" | "y";
export type ChartYScale = "linear" | "log";

export type ChartUnitControlState = {
  readonly fileId: string;
  readonly xUnit: XUnit;
  readonly yScale: ChartYScale;
  readonly yUnit: YUnit;
};

export const createChartUnitControls = ({
  onDidChangeScale,
  onDidChangeUnit,
  state,
  store,
}: {
  readonly onDidChangeScale: (
    fileId: string,
    scale: ChartYScale,
  ) => void;
  readonly onDidChangeUnit: (
    fileId: string,
    axis: ChartUnitAxis,
    unit: XUnit | YUnit,
  ) => void;
  readonly state: ChartUnitControlState;
  readonly store: DisposableStore;
}): HTMLElement => {
  const root = document.createElement("div");
  root.className = "chart_unit_controls";
  root.setAttribute("aria-label", localize("chart_units_label", "Chart units"));

  root.append(
    createUnitSelect({
      axis: "x",
      label: localize("chart_x_unit", "X"),
      onDidChangeUnit,
      options: X_UNIT_VALUES,
      state,
      store,
      value: state.xUnit,
    }),
    createUnitSelect({
      axis: "y",
      label: localize("chart_y_unit", "Y"),
      onDidChangeUnit,
      options: Y_UNIT_VALUES,
      state,
      store,
      value: state.yUnit,
    }),
    createScaleSelect({
      onDidChangeScale,
      state,
      store,
    }),
  );

  return root;
};

const createScaleSelect = ({
  onDidChangeScale,
  state,
  store,
}: {
  readonly onDidChangeScale: (
    fileId: string,
    scale: ChartYScale,
  ) => void;
  readonly state: ChartUnitControlState;
  readonly store: DisposableStore;
}): HTMLElement => {
  const field = document.createElement("label");
  field.className = "chart_unit_field";

  const text = document.createElement("span");
  text.className = "chart_unit_label";
  text.textContent = localize("chart_y_scale", "Scale");

  const options: Array<{ readonly label: string; readonly value: ChartYScale }> = [
    { label: localize("chart_y_scale_linear", "Linear"), value: "linear" },
    { label: localize("chart_y_scale_log", "Log"), value: "log" },
  ];
  const select = createSelectBox({
    ariaLabel: localize("chart_y_scale_select_label", "Y scale"),
    className: "chart_unit_select chart_scale_select",
    dropdownClassName: "chart_unit_select_surface",
    onDidSelect: value => onDidChangeScale(state.fileId, value),
    options,
    value: state.yScale,
  });
  store.add(select);

  field.append(text, select.domNode);
  return field;
};

const createUnitSelect = <T extends XUnit | YUnit>({
  axis,
  label,
  onDidChangeUnit,
  options,
  state,
  store,
  value,
}: {
  readonly axis: ChartUnitAxis;
  readonly label: string;
  readonly onDidChangeUnit: (
    fileId: string,
    axis: ChartUnitAxis,
    unit: XUnit | YUnit,
  ) => void;
  readonly options: readonly T[];
  readonly state: ChartUnitControlState;
  readonly store: DisposableStore;
  readonly value: T;
}): HTMLElement => {
  const field = document.createElement("label");
  field.className = "chart_unit_field";

  const text = document.createElement("span");
  text.className = "chart_unit_label";
  text.textContent = label;

  const select = createSelectBox({
    ariaLabel: localize("chart_unit_select_label", "{axis} unit", {
      axis: label,
    }),
    className: "chart_unit_select",
    dropdownClassName: "chart_unit_select_surface",
    onDidSelect: unit => onDidChangeUnit(state.fileId, axis, unit),
    options: options.map((optionValue) => ({
      label: optionValue,
      value: optionValue,
    })),
    value,
  });
  store.add(select);

  field.append(text, select.domNode);
  return field;
};
