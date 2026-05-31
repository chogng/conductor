import { lxArrowLeft } from "cogicon";
import {
  getButtonClassName,
  getButtonContentClassName,
} from "cs/base/browser/ui/button/button";
import {
  getCardClassName,
  getCardDataAttributes,
} from "cs/base/browser/ui/card/card";
import {
  getCogIconClassName,
  getCogIconMarkup,
  getCogIconStyle,
} from "src/cs/base/browser/ui/cogIcon/cogIcon";
import {
  getInputDataAttributes,
  getInputFieldClassName,
  getInputFieldState,
  getInputNativeClassName,
  getInputWrapperClassName,
} from "cs/base/browser/ui/input/input";
import {
  getSwitchClassName,
  getSwitchDataAttributes,
  getSwitchStyle,
} from "cs/base/browser/ui/switch/switch";
import type { TranslateFn } from "src/cs/platform/language/common/language";
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
  t: TranslateFn;
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
  t,
}: AxisSettingsPaneProps): HTMLElement => {
  const compactInputWidth = "w-[132px]";
  const compactInputFieldClass = "!h-8 !gap-0 border border-border px-2 py-1";
  const normalizedOriginPlotOptions = normalizeOriginPlotOptions(
    originOpenPlotOptions,
    DEFAULT_ORIGIN_PLOT_OPTIONS,
  );

  const card = createCard("h-full min-h-0 flex flex-col !pr-0");
  card.append(
    createHeader({ onClose, setAxis, t }),
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
        t,
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
  t,
}: {
  readonly onClose: () => void;
  readonly setAxis: (value: any) => void;
  readonly t: TranslateFn;
}): HTMLElement => {
  const root = document.createElement("div");
  root.className = "mb-3 pr-4";

  const row = document.createElement("div");
  row.className = "flex items-center justify-between gap-2";
  row.append(
    createIconButton({
      label: t("da_chart_plot_settings_title"),
      onClick: onClose,
    }),
    createTitle(t("da_chart_plot_settings_title")),
    createTextButton(t("da_chart_axis_reset"), () => resetAxisSettings(setAxis)),
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
  t,
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
  readonly t: TranslateFn;
  readonly xTooltipDigitsAuto: number;
  readonly yScaleWarning: string | null;
}): HTMLElement => {
  const root = document.createElement("div");
  root.className = "flex flex-col gap-3";
  const inputOptions = {
    className: `${analysisCompactInputWrapperClass} ${compactInputWidth}`,
    fieldClassName: compactInputFieldClass,
    inputClassName: analysisCompactInputClass,
  };

  root.append(
    createSection(t("da_chart_curve_settings_title"), [
      createRow(
        t("da_chart_curve_type_label"),
        createDropdown({
          id: "analysis-plot-type-select",
          value: String(normalizedOriginPlotOptions.type),
          options: [
            { value: "200", label: t("da_settings_origin_plot_type_200") },
            { value: "201", label: t("da_settings_origin_plot_type_201") },
            { value: "202", label: t("da_settings_origin_plot_type_202") },
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
        t("da_settings_origin_plot_line_width_label"),
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
    createSection(t("da_chart_axis_grid_lines"), [
      createRow(
        t("da_chart_axis_grid_lines"),
        createSwitch(axis?.showGrid !== false, (checked) =>
          setAxis((prev: any) => ({ ...prev, showGrid: checked })),
        ),
      ),
      createRow(
        t("da_chart_axis_major_ticks"),
        createSwitch(axis?.showMajorTicks !== false, (checked) =>
          setAxis((prev: any) => ({ ...prev, showMajorTicks: checked })),
        ),
      ),
      createRow(
        t("da_chart_axis_minor_ticks"),
        createSwitch(axis?.showMinorTicks !== false, (checked) =>
          setAxis((prev: any) => ({ ...prev, showMinorTicks: checked })),
        ),
      ),
    ]),
    createAxisSection({
      axis,
      inputOptions,
      label: t("da_chart_axis_x_title"),
      maxKey: "xMax",
      minKey: "xMin",
      setAxis,
      stepKey: "xStep",
      tickCountKey: "xTickCount",
      ticksKey: "xTicks",
      tooltipDigitsKey: "xTooltipDigits",
      tooltipDigitsPlaceholder: t("da_chart_axis_x_tooltip_digits_placeholder", {
        auto: xTooltipDigitsAuto,
      }),
      t,
    }),
    createAxisSection({
      axis,
      effectiveYScale,
      inputOptions,
      label: t("da_chart_axis_y_title"),
      maxKey: "yMax",
      minKey: "yMin",
      setAxis,
      stepKey: "yStep",
      tickCountKey: "yTickCount",
      ticksKey: "yTicks",
      unitLabel: plotYUnitLabel,
      t,
    }),
  );

  if (yScaleWarning) {
    const warning = document.createElement("div");
    warning.className = "border-t border-border/50 px-3 py-2 text-[11px] text-yellow-500";
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
  t,
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
  readonly t: TranslateFn;
}): HTMLElement =>
  createSection(label, [
    createRow(
      unitLabel ? `${t("da_chart_axis_min")} (${unitLabel})` : t("da_chart_axis_min"),
      createInput({
        id: `analysis-axis-${minKey}`,
        value: axis[minKey],
        placeholder: t("da_chart_axis_auto"),
        onChange: (nextValue) => setAxis((prev: any) => ({ ...prev, [minKey]: nextValue })),
        ...inputOptions,
      }),
    ),
    createRow(
      unitLabel ? `${t("da_chart_axis_max")} (${unitLabel})` : t("da_chart_axis_max"),
      createInput({
        id: `analysis-axis-${maxKey}`,
        value: axis[maxKey],
        placeholder: t("da_chart_axis_auto"),
        onChange: (nextValue) => setAxis((prev: any) => ({ ...prev, [maxKey]: nextValue })),
        ...inputOptions,
      }),
    ),
    createRow(
      t("da_chart_axis_ticks"),
      createDropdown({
        value: axis[ticksKey],
        options:
          effectiveYScale === "linear"
            ? [
                { value: "auto", label: t("da_chart_axis_auto") },
                { value: "nice", label: t("da_chart_axis_nice") },
                { value: "step", label: t("da_chart_axis_step") },
              ]
            : [
                { value: "auto", label: t("da_chart_axis_auto") },
                { value: "decades", label: t("da_chart_axis_decades") },
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
      t("da_chart_axis_count"),
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
      t("da_chart_axis_step"),
      createInput({
        id: `analysis-axis-${stepKey}`,
        value: axis[ticksKey] === "step" ? axis[stepKey] : "",
        disabled: axis[ticksKey] !== "step",
        placeholder: t("da_chart_axis_auto"),
        onChange: (nextValue) => setAxis((prev: any) => ({ ...prev, [stepKey]: nextValue })),
        ...inputOptions,
      }),
    ),
    ...(tooltipDigitsKey
      ? [
          createRow(
            t("da_chart_axis_x_tooltip_digits"),
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
  for (const [name, value] of Object.entries(
    getCardDataAttributes({
      cta: "Device analysis",
      ctaCopy: "axis settings",
      ctaPosition: "chart",
    }),
  )) {
    if (value !== undefined) {
      card.setAttribute(name, String(value));
    }
  }
  card.className = getCardClassName({ className, variant: "panel" });
  return card;
};

const createSection = (title: string, rows: HTMLElement[]): HTMLElement => {
  const section = document.createElement("div");
  section.className = "overflow-hidden rounded-md border border-border/60 bg-bg-surface";
  const header = document.createElement("div");
  header.className = "border-b border-border/50 px-3 py-2 text-xs font-semibold text-text-secondary";
  header.textContent = title;
  section.append(header, ...rows);
  return section;
};

const createRow = (label: string, control: HTMLElement): HTMLElement => {
  const row = document.createElement("div");
  row.className =
    "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-border/40 px-3 py-2 last:border-b-0";
  const text = document.createElement("div");
  text.className = "text-xs text-text-secondary";
  text.textContent = label;
  row.append(text, control);
  return row;
};

const createScrollArea = (content: HTMLElement): HTMLElement => {
  const root = document.createElement("div");
  root.className = "scrollArea flex-1 min-h-0";
  const viewport = document.createElement("div");
  viewport.className = "scrollAreaViewport pr-4";
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
    className: "h-8 w-8 rounded-full text-text-secondary hover:text-text-primary",
    size: "icon",
    variant: "icon",
  });
  button.title = label;
  button.setAttribute("aria-label", label);
  button.addEventListener("click", onClick);
  const content = document.createElement("span");
  content.className = getButtonContentClassName();
  const icon = document.createElement("span");
  icon.className = getCogIconClassName();
  Object.assign(icon.style, getCogIconStyle({ size: 16 }));
  icon.innerHTML = getCogIconMarkup(lxArrowLeft);
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
    className: "h-7 px-2 text-xs text-text-secondary hover:text-text-primary",
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
  root.className = "min-w-0 flex-1";
  const title = document.createElement("div");
  title.className = "truncate text-xs font-semibold text-text-primary";
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
  wrapper.className = getInputWrapperClassName(className);
  wrapper.dataset.style = "input";
  const field = document.createElement("div");
  field.className = getInputFieldClassName({ fieldClassName, size: "md" });
  field.dataset.icon = "without";
  field.dataset.state = getInputFieldState({ disabled });
  for (const [name, dataValue] of Object.entries(getInputDataAttributes({}))) {
    if (dataValue !== undefined) {
      field.setAttribute(name, String(dataValue));
    }
  }
  const input = document.createElement("input");
  input.id = id;
  input.value = String(value ?? "");
  input.disabled = disabled;
  input.placeholder = placeholder ?? "";
  input.autocomplete = "off";
  input.className = getInputNativeClassName({ inputClassName });
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
  const button = document.createElement("button");
  button.type = "button";
  button.role = "switch";
  button.setAttribute("aria-checked", String(checked));
  for (const [name, value] of Object.entries(
    getSwitchDataAttributes({ checked, size: "sm" }),
  )) {
    if (value !== undefined) {
      button.setAttribute(name, String(value));
    }
  }
  button.className = getSwitchClassName({});
  Object.assign(button.style, getSwitchStyle({ size: "sm" }));
  button.addEventListener("click", () => onCheckedChange(!checked));
  const thumb = document.createElement("span");
  thumb.className = "ui-switch__thumb";
  thumb.setAttribute("aria-hidden", "true");
  button.append(thumb);
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
