import { localize } from "src/cs/nls";
import {
  getButtonClassName,
  getButtonContentClassName,
} from "cs/base/browser/ui/button/button";
import {
  getCardClassName,
} from "cs/base/browser/ui/card/card";
import {
  getLxIconClassName,
  getLxIconMarkup,
  getLxIconStyle,
} from "src/cs/base/browser/ui/lxicon/lxicon";
import { LxIcon } from "src/cs/base/common/lxicon";
import {
  getInputBoxFieldClassName,
  getInputBoxFieldState,
  getInputBoxNativeClassName,
  getInputBoxWrapperClassName,
} from "src/cs/base/browser/ui/inputbox/inputBox";
import {
  createSwitch as createBaseSwitch,
} from "src/cs/base/browser/ui/switch/switch";
import {
  DEFAULT_ORIGIN_PLOT_OPTIONS,
  normalizeOriginPlotOptions,
  type OriginPlotOptions,
} from "src/cs/workbench/contrib/origin/common/originPlotOptions";

type AxisSettingsPaneProps = {
  axis: any;
  effectiveYScale: string;
  plotYUnitLabel: string;
  setAxis: (value: any) => void;
  yScaleWarning: string | null;
  xTooltipDigitsAuto: number;
  originOpenPlotOptions: OriginPlotOptions;
  onOriginOpenPlotOptionsChange?: (updates: Partial<OriginPlotOptions>) => void;
  onClose: () => void;
  analysisCompactInputWrapperClass: string;
  analysisCompactInputClass: string;
};

const AxisSettingsPane = (props: AxisSettingsPaneProps): any =>
  createAxisSettingsPane(props);

export const createAxisSettingsPane = ({
  analysisCompactInputClass,
  analysisCompactInputWrapperClass,
  axis,
  effectiveYScale,
  onClose,
  onOriginOpenPlotOptionsChange,
  originOpenPlotOptions,
  plotYUnitLabel,
  setAxis,
  xTooltipDigitsAuto,
  yScaleWarning,
}: AxisSettingsPaneProps): HTMLElement => {
  const compactInputWidth = "chart_axis_settings_compact_input";
  const compactInputFieldClass = "chart_axis_settings_compact_input_field";
  const normalizedOriginPlotOptions = normalizeOriginPlotOptions(
    originOpenPlotOptions,
    DEFAULT_ORIGIN_PLOT_OPTIONS,
  );

  const card = createCard("chart_axis_settings_card");
  card.append(
    createHeader({ onClose, setAxis }),
    createScrollArea(
      createSections({
        analysisCompactInputClass,
        analysisCompactInputWrapperClass,
        axis,
        compactInputFieldClass,
        compactInputWidth,
        effectiveYScale,
        normalizedOriginPlotOptions,
        onOriginOpenPlotOptionsChange,
        plotYUnitLabel,
        setAxis,
        xTooltipDigitsAuto,
        yScaleWarning,
      }),
    ),
  );
  return card;
};

const createHeader = ({
  onClose,
  setAxis,
}: {
  readonly onClose: () => void;
  readonly setAxis: (value: any) => void;
}): HTMLElement => {
  const root = document.createElement("div");
  root.className = "chart_axis_settings_header";

  const row = document.createElement("div");
  row.className = "chart_axis_settings_header_row";
  row.append(
    createIconButton({
      label: localize("chart_plot_settings_title", "Plot Settings"),
      onClick: onClose,
    }),
    createTitle(localize("chart_plot_settings_title", "Plot Settings")),
    createTextButton(localize("chart_axis_reset", "Reset"), () => resetAxisSettings(setAxis)),
  );
  root.append(row);
  return root;
};

const createSections = ({
  analysisCompactInputClass,
  analysisCompactInputWrapperClass,
  axis,
  compactInputFieldClass,
  compactInputWidth,
  effectiveYScale,
  normalizedOriginPlotOptions,
  onOriginOpenPlotOptionsChange,
  plotYUnitLabel,
  setAxis,
  xTooltipDigitsAuto,
  yScaleWarning,
}: {
  readonly analysisCompactInputClass: string;
  readonly analysisCompactInputWrapperClass: string;
  readonly axis: any;
  readonly compactInputFieldClass: string;
  readonly compactInputWidth: string;
  readonly effectiveYScale: string;
  readonly normalizedOriginPlotOptions: OriginPlotOptions;
  readonly onOriginOpenPlotOptionsChange?: (updates: Partial<OriginPlotOptions>) => void;
  readonly plotYUnitLabel: string;
  readonly setAxis: (value: any) => void;
  readonly xTooltipDigitsAuto: number;
  readonly yScaleWarning: string | null;
}): HTMLElement => {
  const root = document.createElement("div");
  root.className = "chart_axis_settings_sections";
  const inputOptions = {
    className: `${analysisCompactInputWrapperClass} ${compactInputWidth}`,
    fieldClassName: compactInputFieldClass,
    inputClassName: analysisCompactInputClass,
  };

  root.append(
    createSection(localize("chart_curve_settings_title", "Origin Settings"), [
      createRow(
        localize("chart_curve_type_label", "Curve type"),
        createDropdown({
          id: "analysis-plot-type-select",
          value: String(normalizedOriginPlotOptions.type),
          options: [
            { value: "200", label: localize("settings_origin_plot_type_200", "Line") },
            { value: "201", label: localize("settings_origin_plot_type_201", "Scatter") },
            { value: "202", label: localize("settings_origin_plot_type_202", "Line + Symbol") },
          ],
          onChange: (next) => {
            const normalized = normalizeOriginPlotOptions(
              { type: next },
              normalizedOriginPlotOptions,
            );
            onOriginOpenPlotOptionsChange?.({ type: normalized.type });
          },
          className: compactInputWidth,
        }),
      ),
      createRow(
        localize("settings_origin_plot_line_width_label", "Line width"),
        createInput({
          id: "analysis-plot-line-width-input",
          value: normalizedOriginPlotOptions.lineWidth,
          placeholder: String(DEFAULT_ORIGIN_PLOT_OPTIONS.lineWidth),
          onChange: (next) => {
            const normalized = normalizeOriginPlotOptions(
              { lineWidth: next },
              normalizedOriginPlotOptions,
            );
            onOriginOpenPlotOptionsChange?.({ lineWidth: normalized.lineWidth });
          },
          ...inputOptions,
        }),
      ),
    ]),
    createSection(localize("chart_axis_grid_lines", "Grid lines"), [
      createRow(
        localize("chart_axis_grid_lines", "Grid lines"),
        createSwitch(axis?.showGrid !== false, (checked) =>
          setAxis((prev: any) => ({ ...prev, showGrid: checked })),
        ),
      ),
      createRow(
        localize("chart_axis_major_ticks", "Major tick marks"),
        createSwitch(axis?.showMajorTicks !== false, (checked) =>
          setAxis((prev: any) => ({ ...prev, showMajorTicks: checked })),
        ),
      ),
      createRow(
        localize("chart_axis_minor_ticks", "Minor ticks"),
        createSwitch(axis?.showMinorTicks !== false, (checked) =>
          setAxis((prev: any) => ({ ...prev, showMinorTicks: checked })),
        ),
      ),
    ]),
    createAxisSection({
      axis,
      inputOptions,
      label: localize("chart_axis_x_title", "X Axis"),
      maxKey: "xMax",
      minKey: "xMin",
      setAxis,
      stepKey: "xStep",
      tickCountKey: "xTickCount",
      ticksKey: "xTicks",
      tooltipDigitsKey: "xTooltipDigits",
      tooltipDigitsPlaceholder: localize("chart_axis_x_tooltip_digits_placeholder", "{auto}", {
        auto: xTooltipDigitsAuto,
      }),
    }),
    createAxisSection({
      axis,
      effectiveYScale,
      inputOptions,
      label: localize("chart_axis_y_title", "Y Axis"),
      maxKey: "yMax",
      minKey: "yMin",
      setAxis,
      stepKey: "yStep",
      tickCountKey: "yTickCount",
      ticksKey: "yTicks",
      unitLabel: plotYUnitLabel,
    }),
  );

  if (yScaleWarning) {
    const warning = document.createElement("div");
    warning.className = "chart_axis_settings_warning";
    warning.textContent = yScaleWarning;
    root.append(warning);
  }

  return root;
};

const createAxisSection = ({
  axis,
  effectiveYScale = "linear",
  inputOptions,
  label,
  maxKey,
  minKey,
  setAxis,
  stepKey,
  tickCountKey,
  ticksKey,
  tooltipDigitsKey,
  tooltipDigitsPlaceholder,
  unitLabel,
}: {
  readonly axis: any;
  readonly effectiveYScale?: string;
  readonly inputOptions: InputOptions;
  readonly label: string;
  readonly maxKey: string;
  readonly minKey: string;
  readonly setAxis: (value: any) => void;
  readonly stepKey: string;
  readonly tickCountKey: string;
  readonly ticksKey: string;
  readonly tooltipDigitsKey?: string;
  readonly tooltipDigitsPlaceholder?: string;
  readonly unitLabel?: string;
}): HTMLElement =>
  createSection(label, [
    createRow(
      unitLabel ? `${localize("chart_axis_min", "min")} (${unitLabel})` : localize("chart_axis_min", "min"),
      createInput({
        id: `analysis-axis-${minKey}`,
        value: axis[minKey],
        placeholder: localize("chart_axis_auto", "auto"),
        onChange: (nextValue) => setAxis((prev: any) => ({ ...prev, [minKey]: nextValue })),
        ...inputOptions,
      }),
    ),
    createRow(
      unitLabel ? `${localize("chart_axis_max", "max")} (${unitLabel})` : localize("chart_axis_max", "max"),
      createInput({
        id: `analysis-axis-${maxKey}`,
        value: axis[maxKey],
        placeholder: localize("chart_axis_auto", "auto"),
        onChange: (nextValue) => setAxis((prev: any) => ({ ...prev, [maxKey]: nextValue })),
        ...inputOptions,
      }),
    ),
    createRow(
      localize("chart_axis_ticks", "Major ticks"),
      createDropdown({
        value: axis[ticksKey],
        options:
          effectiveYScale === "linear"
            ? [
                { value: "auto", label: localize("chart_axis_auto", "auto") },
                { value: "nice", label: localize("chart_axis_nice", "nice") },
                { value: "step", label: localize("chart_axis_step", "step") },
              ]
            : [
                { value: "auto", label: localize("chart_axis_auto", "auto") },
                { value: "decades", label: localize("chart_axis_decades", "decades") },
              ],
        onChange: (nextValue) =>
          setAxis((prev: any) => ({
            ...prev,
            [ticksKey]: nextValue,
            [tickCountKey]: nextValue === "nice" ? prev[tickCountKey] : "",
            [stepKey]: nextValue === "step" ? prev[stepKey] : "",
          })),
        className: inputOptions.className,
      }),
    ),
    createRow(
      localize("chart_axis_count", "Major tick count"),
      createInput({
        id: `analysis-axis-${tickCountKey}`,
        value: axis[ticksKey] === "nice" ? axis[tickCountKey] : "",
        disabled: axis[ticksKey] !== "nice",
        placeholder: "6",
        onChange: (nextValue) => setAxis((prev: any) => ({ ...prev, [tickCountKey]: nextValue })),
        ...inputOptions,
      }),
    ),
    createRow(
      localize("chart_axis_step", "step"),
      createInput({
        id: `analysis-axis-${stepKey}`,
        value: axis[ticksKey] === "step" ? axis[stepKey] : "",
        disabled: axis[ticksKey] !== "step",
        placeholder: localize("chart_axis_auto", "auto"),
        onChange: (nextValue) => setAxis((prev: any) => ({ ...prev, [stepKey]: nextValue })),
        ...inputOptions,
      }),
    ),
    ...(tooltipDigitsKey
      ? [
          createRow(
            localize("chart_axis_x_tooltip_digits", "Tooltip X digits"),
            createInput({
              id: `analysis-axis-${tooltipDigitsKey}`,
              value: axis[tooltipDigitsKey],
              placeholder: tooltipDigitsPlaceholder,
              onChange: (nextValue) =>
                setAxis((prev: any) => ({ ...prev, [tooltipDigitsKey]: nextValue })),
              ...inputOptions,
            }),
          ),
        ]
      : []),
  ]);

type InputOptions = {
  readonly className: string;
  readonly fieldClassName: string;
  readonly inputClassName: string;
};

const createCard = (className: string): HTMLElement => {
  const card = document.createElement("div");
  card.className = getCardClassName({ className, variant: "panel" });
  return card;
};

const createSection = (title: string, rows: HTMLElement[]): HTMLElement => {
  const section = document.createElement("div");
  section.className = "chart_axis_settings_section";
  const header = document.createElement("div");
  header.className = "chart_axis_settings_section_header";
  header.textContent = title;
  section.append(header, ...rows);
  return section;
};

const createRow = (label: string, control: HTMLElement): HTMLElement => {
  const row = document.createElement("div");
  row.className = "chart_axis_settings_row";
  const text = document.createElement("div");
  text.className = "chart_axis_settings_row_label";
  text.textContent = label;
  row.append(text, control);
  return row;
};

const createScrollArea = (content: HTMLElement): HTMLElement => {
  const root = document.createElement("div");
  root.className = "scrollArea chart_axis_settings_scroll";
  const viewport = document.createElement("div");
  viewport.className = "scrollAreaViewport chart_axis_settings_scroll_viewport";
  viewport.dataset.axis = "y";
  viewport.append(content);
  root.append(viewport);
  return root;
};

const createIconButton = ({
  label,
  onClick,
}: {
  readonly label: string;
  readonly onClick: () => void;
}): HTMLButtonElement => {
  const button = document.createElement("button");
  button.type = "button";
  button.className = getButtonClassName({
    className: "chart_axis_settings_icon_button",
    size: "icon",
    variant: "icon",
  });
  button.title = label;
  button.setAttribute("aria-label", label);
  button.addEventListener("click", onClick);
  const content = document.createElement("span");
  content.className = getButtonContentClassName();
  const icon = document.createElement("span");
  icon.className = getLxIconClassName();
  Object.assign(icon.style, getLxIconStyle({ size: 16 }));
  icon.innerHTML = getLxIconMarkup(LxIcon.arrowLeft);
  content.append(icon);
  button.append(content);
  return button;
};

const createTextButton = (
  label: string,
  onClick: () => void,
): HTMLButtonElement => {
  const button = document.createElement("button");
  button.type = "button";
  button.className = getButtonClassName({
    className: "chart_axis_settings_text_button",
    size: "sm",
    variant: "text",
  });
  button.addEventListener("click", onClick);
  const content = document.createElement("span");
  content.className = getButtonContentClassName();
  content.textContent = label;
  button.append(content);
  return button;
};

const createTitle = (label: string): HTMLElement => {
  const root = document.createElement("div");
  root.className = "chart_axis_settings_title";
  const title = document.createElement("div");
  title.className = "chart_axis_settings_title_text";
  title.textContent = label;
  root.append(title);
  return root;
};

const createInput = ({
  className,
  disabled = false,
  fieldClassName,
  id,
  inputClassName,
  onChange,
  placeholder,
  value,
}: InputOptions & {
  readonly disabled?: boolean;
  readonly id: string;
  readonly onChange: (nextValue: string) => void;
  readonly placeholder?: string;
  readonly value?: string | number;
}): HTMLElement => {
  const wrapper = document.createElement("div");
  wrapper.className = getInputBoxWrapperClassName(className);
  wrapper.dataset.style = "inputbox";
  const field = document.createElement("div");
  field.className = getInputBoxFieldClassName({ fieldClassName });
  field.dataset.icon = "without";
  field.dataset.state = getInputBoxFieldState({ disabled });
  const input = document.createElement("input");
  input.id = id;
  input.value = String(value ?? "");
  input.disabled = disabled;
  input.placeholder = placeholder ?? "";
  input.autocomplete = "off";
  input.className = getInputBoxNativeClassName({ inputClassName });
  input.addEventListener("input", () => onChange(input.value));
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      input.blur();
    }
  });
  field.append(input);
  wrapper.append(field);
  return wrapper;
};

const createDropdown = ({
  className = "",
  id,
  onChange,
  options,
  value,
}: {
  readonly className?: string;
  readonly id?: string;
  readonly onChange: (next: string | number) => void;
  readonly options: Array<{ label: string; value: string | number }>;
  readonly value?: string | number;
}): HTMLSelectElement => {
  const select = document.createElement("select");
  if (id) {
    select.id = id;
  }
  select.className = `dropdown-field dropdown-field--sm ${className}`.trim();
  select.value = String(value ?? "");
  select.addEventListener("change", () => onChange(select.value));
  for (const option of options) {
    const item = document.createElement("option");
    item.value = String(option.value);
    item.textContent = option.label;
    select.append(item);
  }
  return select;
};

const createSwitch = (
  checked: boolean,
  onCheckedChange: (checked: boolean) => void,
): HTMLButtonElement => {
  const button = createBaseSwitch({
    checked,
  });
  button.addEventListener("click", () => onCheckedChange(!checked));
  return button;
};

const resetAxisSettings = (setAxis: (value: any) => void): void => {
  setAxis((prev: any) => ({
    ...prev,
    xMin: "",
    xMax: "",
    xTicks: "auto",
    xTickCount: 6,
    xStep: "",
    xTooltipDigits: "",
    yMin: "",
    yMax: "",
    yScale: "linear",
    yTicks: "auto",
    yTickCount: 6,
    yStep: "",
    yDecadeStep: 1,
    showGrid: true,
    showMajorTicks: true,
    showMinorTicks: true,
    minorTickCount: "",
    tickLabelFontSize: "",
    axisTitleFontSize: "",
    legendFontSize: "",
    originTickLabelOffset: "",
    originAxisTitleGap: "",
  }));
};

export default AxisSettingsPane;
