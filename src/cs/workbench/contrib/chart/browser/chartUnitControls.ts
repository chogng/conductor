import { createSelectBox } from "src/cs/base/browser/ui/selectBox/selectBox";
import type { DisposableStore } from "src/cs/base/common/lifecycle";
import { localize } from "src/cs/nls";
import {
  type XUnit,
  type YUnit,
} from "src/cs/workbench/services/plot/common/units";

export type ChartUnitAxis = "x" | "y";
export type ChartYScale = "linear" | "log";

export type ChartUnitControlState = {
  readonly xUnit: XUnit;
  readonly xUnitOptions: readonly XUnit[];
  readonly yScale: ChartYScale;
  readonly yUnit: YUnit | null;
  readonly yUnitOptions: readonly YUnit[];
};

export const createChartUnitControls = ({
  onDidChangeScale,
  onDidChangeUnit,
  state,
  store,
}: {
  readonly onDidChangeScale: (scale: ChartYScale) => void;
  readonly onDidChangeUnit: (
    axis: ChartUnitAxis,
    unit: XUnit | YUnit,
  ) => void;
  readonly state: ChartUnitControlState;
  readonly store: DisposableStore;
}): HTMLElement => {
  const root = document.createElement("div");
  root.className = "chart_unit_controls";
  root.setAttribute("aria-label", localize("chart.units.label", "Chart units"));

  root.append(createUnitSelect({
    axis: "x",
    label: localize("chart.units.x", "X"),
    onDidChangeUnit,
    options: state.xUnitOptions,
    state,
    store,
    value: state.xUnit,
  }));

  if (state.yUnit && state.yUnitOptions.length > 0) {
    root.append(createUnitSelect({
      axis: "y",
      label: localize("chart.units.y", "Y"),
      onDidChangeUnit,
      options: state.yUnitOptions,
      state,
      store,
      value: state.yUnit,
    }));
  }

  root.append(createScaleSelect({
    onDidChangeScale,
    state,
    store,
  }));

  return root;
};

const createScaleSelect = ({
  onDidChangeScale,
  state,
  store,
}: {
  readonly onDidChangeScale: (scale: ChartYScale) => void;
  readonly state: ChartUnitControlState;
  readonly store: DisposableStore;
}): HTMLElement => {
  const field = document.createElement("label");
  field.className = "chart_unit_field";

  const text = document.createElement("span");
  text.className = "chart_unit_label";
  text.textContent = localize("chart.yScale.label", "Scale");

  const options: Array<{ readonly label: string; readonly value: ChartYScale }> = [
    { label: localize("chart.yScale.linear", "Linear"), value: "linear" },
    { label: localize("chart.yScale.log", "Log"), value: "log" },
  ];
  const select = createSelectBox({
    ariaLabel: localize("chart.yScale.selectLabel", "Y scale"),
    className: "chart_unit_select chart_scale_select",
    dropdownClassName: "chart_unit_select_surface",
    onDidSelect: value => onDidChangeScale(value),
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
    ariaLabel: localize("chart.units.selectLabel", "{axis} unit", {
      axis: label,
    }),
    className: "chart_unit_select",
    dropdownClassName: "chart_unit_select_surface",
    onDidSelect: unit => onDidChangeUnit(axis, unit),
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
