/* Origin 导出时的绘图/轴/命令设置 */

import { localize } from "src/cs/nls";

import { createInputBoxField } from "src/cs/base/browser/ui/inputbox/inputBox";
import Scrollbar from "src/cs/base/browser/ui/scrollbar/scrollbar";
import { createSwitch } from "src/cs/base/browser/ui/switch/switch";
import { DisposableStore, toDisposable } from "src/cs/base/common/lifecycle";
import { ViewPane } from "src/cs/workbench/browser/parts/views/viewPane";
import {
  DEFAULT_ORIGIN_PLOT_OPTIONS,
  normalizeOriginPlotOptions,
  type OriginPlotOptions,
} from "src/cs/workbench/contrib/origin/common/originPlotOptions";
import { OriginExportSettingsViewId } from "src/cs/workbench/contrib/origin/common/origin";
import {
  DEFAULT_PLOT_AXIS_SETTINGS,
  normalizePlotAxisSettings,
  type PlotAxisSettings,
} from "src/cs/workbench/contrib/plot/common/plotAxisSettings";

import "src/cs/workbench/contrib/origin/browser/media/exportSettingsView.css";
import "src/cs/workbench/browser/parts/views/media/views.css";

export type ExportSettingsViewOptions = {
  readonly axisSettings?: Partial<PlotAxisSettings> | Record<string, unknown>;
  readonly onAxisChange?: (updates: Record<string, unknown>) => void | Promise<void>;
  readonly onChange?: (updates: Partial<OriginPlotOptions>) => void | Promise<void>;
  readonly options?: OriginPlotOptions;
};

export class ExportSettingsView extends ViewPane {
  private readonly renderStore = new DisposableStore();
  private readonly scrollArea = new Scrollbar({
    className: "export_settings_view_scroll",
    viewportClassName: "export_settings_view_scroll_viewport",
  });

  constructor() {
    super({
      id: OriginExportSettingsViewId,
      title: localize("chart_curve_settings_title", "Origin Settings"),
      className: "auxiliarybar_view_pane export_settings_view",
      bodyClassName: "workbench-part-view-pane__body",
      headerVisible: false,
    });
    this.body.append(this.scrollArea.element);
  }

  public update({
    axisSettings,
    onAxisChange,
    onChange,
    options,
  }: ExportSettingsViewOptions): void {
    this.renderStore.clear();
    const normalizedOptions = normalizeOriginPlotOptions(
      options,
      DEFAULT_ORIGIN_PLOT_OPTIONS,
    );

    this.scrollArea.viewport.replaceChildren(createExportSettingsView({
      axisSettings: normalizePlotAxisSettings(axisSettings, DEFAULT_PLOT_AXIS_SETTINGS),
      onAxisChange,
      onChange,
      options: normalizedOptions,
      store: this.renderStore,
    }));
    queueMicrotask(() => this.scrollArea.layout());
  }

  public override dispose(): void {
    this.scrollArea.viewport.replaceChildren();
    this.renderStore.dispose();
    this.scrollArea.dispose();
    super.dispose();
  }
}

const createExportSettingsView = ({
  axisSettings,
  onAxisChange,
  onChange,
  options,
  store,
}: {
  readonly axisSettings: PlotAxisSettings;
  readonly onAxisChange?: (updates: Record<string, unknown>) => void | Promise<void>;
  readonly onChange?: (updates: Partial<OriginPlotOptions>) => void | Promise<void>;
  readonly options: OriginPlotOptions;
  readonly store: DisposableStore;
}): HTMLElement => {
  const root = document.createElement("div");
  root.className = "export_settings_view_content";

  root.append(
    createSettingsGroup(localize("chart_curve_settings_title", "Origin Settings"), [
      createSettingsField({
        control: createPlotTypeSelect(options, onChange, store),
        label: localize("chart_curve_type_label", "Curve type"),
      }),
      createSettingsField({
        control: createLineWidthInput(options, onChange, store),
        label: localize("settings_origin_plot_line_width_label", "Line width"),
      }),
    ]),
    createSettingsGroup(localize("origin_export_settings_plot_title", "Plot Settings"), [
      createSettingsRow({
        control: createBooleanSwitch({
          checked: axisSettings.showGrid,
          onChange: (checked) => void onAxisChange?.({ showGrid: checked }),
          store,
        }),
        label: localize("chart_axis_grid_lines", "Grid lines"),
      }),
      createSettingsRow({
        control: createBooleanSwitch({
          checked: axisSettings.showMajorTicks,
          onChange: (checked) => void onAxisChange?.({ showMajorTicks: checked }),
          store,
        }),
        label: localize("chart_axis_major_ticks", "Major tick marks"),
      }),
      createSettingsRow({
        control: createBooleanSwitch({
          checked: axisSettings.showMinorTicks,
          onChange: (checked) => void onAxisChange?.({ showMinorTicks: checked }),
          store,
        }),
        label: localize("chart_axis_minor_ticks", "Minor ticks"),
      }),
      createSettingsField({
        control: createAxisTextInput({
          id: "export-settings-minor-tick-count",
          onChange: (value) => void onAxisChange?.({ minorTickCount: value }),
          placeholder: "1",
          store,
          value: axisSettings.minorTickCount,
        }),
        label: localize("chart_axis_minor_tick_count", "Minor tick count"),
      }),
      createSettingsField({
        control: createAxisTextInput({
          id: "export-settings-tick-label-font-size",
          onChange: (value) => void onAxisChange?.({ tickLabelFontSize: value }),
          placeholder: localize("chart_axis_auto", "auto"),
          store,
          value: axisSettings.tickLabelFontSize,
        }),
        label: localize("chart_tick_label_font_size", "Tick label size"),
      }),
      createSettingsField({
        control: createAxisTextInput({
          id: "export-settings-axis-title-font-size",
          onChange: (value) => void onAxisChange?.({ axisTitleFontSize: value }),
          placeholder: localize("chart_axis_auto", "auto"),
          store,
          value: axisSettings.axisTitleFontSize,
        }),
        label: localize("chart_axis_title_font_size", "Title size"),
      }),
      createSettingsField({
        control: createAxisTextInput({
          id: "export-settings-legend-font-size",
          onChange: (value) => void onAxisChange?.({ legendFontSize: value }),
          placeholder: localize("chart_axis_auto", "auto"),
          store,
          value: axisSettings.legendFontSize,
        }),
        label: localize("chart_legend_font_size", "Legend size"),
      }),
      createSettingsField({
        control: createAxisTextInput({
          id: "export-settings-tick-label-offset",
          onChange: (value) => void onAxisChange?.({ originTickLabelOffset: value }),
          placeholder: localize("chart_axis_auto", "auto"),
          store,
          value: axisSettings.originTickLabelOffset,
        }),
        label: localize("chart_axis_tick_label_offset", "Tick label offset"),
      }),
      createSettingsField({
        control: createAxisTextInput({
          id: "export-settings-axis-title-gap",
          onChange: (value) => void onAxisChange?.({ originAxisTitleGap: value }),
          placeholder: localize("chart_axis_auto", "auto"),
          store,
          value: axisSettings.originAxisTitleGap,
        }),
        label: localize("chart_axis_title_gap", "Title offset"),
      }),
    ]),
    createAxisSettingsGroup({
      axisSettings,
      label: localize("chart_axis_x_title", "X Axis"),
      maxKey: "xMax",
      minKey: "xMin",
      onAxisChange,
      stepKey: "xStep",
      tickCountKey: "xTickCount",
      ticksKey: "xTicks",
      store,
    }),
    createAxisSettingsGroup({
      axisSettings,
      label: localize("chart_axis_y_title", "Y Axis"),
      maxKey: "yMax",
      minKey: "yMin",
      onAxisChange,
      stepKey: "yStep",
      tickCountKey: "yTickCount",
      ticksKey: "yTicks",
      store,
    }),
    createSettingsGroup(localize("settings_origin_plot_title", "Default Plot Settings"), [
      createSettingsField({
        control: createTextInput({
          id: "export-settings-xy-pairs",
          onChange: (value) => {
            const normalized = normalizeOriginPlotOptions({ xyPairs: value }, options);
            void onChange?.({ xyPairs: normalized.xyPairs });
          },
          store,
          value: options.xyPairs,
        }),
        hint: localize("settings_origin_plot_xy_pairs_hint", "LabTalk expression, for example ((1,2)) or ((1,2),(3,4))."),
        label: localize("settings_origin_plot_xy_pairs_label", "XY pairs"),
      }),
      createSettingsField({
        control: createTextInput({
          id: "export-settings-command",
          onChange: (value) => {
            const normalized = normalizeOriginPlotOptions({ command: value }, options);
            void onChange?.({ command: normalized.command });
          },
          store,
          value: options.command,
        }),
        hint: localize("settings_origin_plot_command_hint", "Optional full LabTalk command. If set, it overrides plot type and XY pairs."),
        label: localize("settings_origin_plot_command_label", "Plot command override"),
      }),
      createSettingsField({
        control: createPostCommandsInput(options, onChange, store),
        hint: localize("settings_origin_plot_post_commands_hint", "One LabTalk command per line, executed after plotting."),
        label: localize("settings_origin_plot_post_commands_label", "Post-plot commands"),
      }),
    ]),
  );
  return root;
};

const createSettingsGroup = (titleText: string, fields: HTMLElement[]): HTMLElement => {
  const group = document.createElement("section");
  group.className = "export_settings_view_group";
  const title = document.createElement("div");
  title.className = "export_settings_view_group_title";
  title.textContent = titleText;
  group.append(title, ...fields);
  return group;
};

const createSettingsField = ({
  control,
  hint,
  label: labelText,
}: {
  readonly control: HTMLElement;
  readonly hint?: string;
  readonly label: string;
}): HTMLElement => {
  const field = document.createElement("div");
  field.className = "export_settings_view_field";

  const label = document.createElement("label");
  label.className = "export_settings_view_label";
  label.textContent = labelText;
  const controlId = getSettingsControlId(control);
  if (controlId) {
    label.htmlFor = controlId;
  }

  if (hint && controlId) {
    const hintId = `${controlId}-hint`;
    control.setAttribute("aria-describedby", hintId);
    const nativeControl = getNativeControl(control);
    nativeControl?.setAttribute("aria-describedby", hintId);

    const hintElement = document.createElement("p");
    hintElement.id = hintId;
    hintElement.className = "export_settings_view_hint";
    hintElement.textContent = hint;
    field.append(label, control, hintElement);
    return field;
  }

  field.append(label, control);
  return field;
};

const createSettingsRow = ({
  control,
  label: labelText,
}: {
  readonly control: HTMLElement;
  readonly label: string;
}): HTMLElement => {
  const field = document.createElement("div");
  field.className = "export_settings_view_row";
  const label = document.createElement("div");
  label.className = "export_settings_view_label";
  label.textContent = labelText;
  field.append(label, control);
  return field;
};

const createAxisSettingsGroup = ({
  axisSettings,
  label,
  maxKey,
  minKey,
  onAxisChange,
  stepKey,
  tickCountKey,
  ticksKey,
  store,
}: {
  readonly axisSettings: PlotAxisSettings;
  readonly label: string;
  readonly maxKey: "xMax" | "yMax";
  readonly minKey: "xMin" | "yMin";
  readonly onAxisChange?: (updates: Record<string, unknown>) => void | Promise<void>;
  readonly stepKey: "xStep" | "yStep";
  readonly tickCountKey: "xTickCount" | "yTickCount";
  readonly ticksKey: "xTicks" | "yTicks";
  readonly store: DisposableStore;
}): HTMLElement => {
  const isY = ticksKey === "yTicks";
  return createSettingsGroup(label, [
    createSettingsField({
      control: createAxisTextInput({
        id: `export-settings-${minKey}`,
        onChange: (value) => void onAxisChange?.({ [minKey]: value }),
        placeholder: localize("chart_axis_auto", "auto"),
        store,
        value: axisSettings[minKey],
      }),
      label: localize("chart_axis_min", "min"),
    }),
    createSettingsField({
      control: createAxisTextInput({
        id: `export-settings-${maxKey}`,
        onChange: (value) => void onAxisChange?.({ [maxKey]: value }),
        placeholder: localize("chart_axis_auto", "auto"),
        store,
        value: axisSettings[maxKey],
      }),
      label: localize("chart_axis_max", "max"),
    }),
    createSettingsField({
      control: createAxisTickSelect({
        id: `export-settings-${ticksKey}`,
        isY,
        onChange: (value) => {
          const updates = {
            [ticksKey]: value,
            [tickCountKey]: value === "nice" ? axisSettings[tickCountKey] : "",
            [stepKey]: value === "step" ? axisSettings[stepKey] : "",
          };
          void onAxisChange?.(updates);
        },
        store,
        value: axisSettings[ticksKey],
      }),
      label: localize("chart_axis_ticks", "Major ticks"),
    }),
    createSettingsField({
      control: createAxisTextInput({
        disabled: axisSettings[ticksKey] !== "nice",
        id: `export-settings-${tickCountKey}`,
        onChange: (value) => void onAxisChange?.({ [tickCountKey]: value }),
        placeholder: "6",
        store,
        value: axisSettings[ticksKey] === "nice" ? axisSettings[tickCountKey] : "",
      }),
      label: localize("chart_axis_count", "Major tick count"),
    }),
    createSettingsField({
      control: createAxisTextInput({
        disabled: axisSettings[ticksKey] !== "step",
        id: `export-settings-${stepKey}`,
        onChange: (value) => void onAxisChange?.({ [stepKey]: value }),
        placeholder: localize("chart_axis_auto", "auto"),
        store,
        value: axisSettings[ticksKey] === "step" ? axisSettings[stepKey] : "",
      }),
      label: localize("chart_axis_step", "step"),
    }),
  ]);
};

const createPlotTypeSelect = (
  options: OriginPlotOptions,
  onChange: ExportSettingsViewOptions["onChange"],
  store: DisposableStore,
): HTMLSelectElement => {
  const select = document.createElement("select");
  select.id = "export-settings-type";
  select.className = "dropdown-field dropdown-field--sm export_settings_view_control";
  select.value = String(options.type);
  for (const option of [
    { value: "200", label: localize("settings_origin_plot_type_200", "Line") },
    { value: "201", label: localize("settings_origin_plot_type_201", "Scatter") },
    { value: "202", label: localize("settings_origin_plot_type_202", "Line + Symbol") },
  ]) {
    const item = document.createElement("option");
    item.value = option.value;
    item.textContent = option.label;
    select.append(item);
  }
  const listener = () => {
    const normalized = normalizeOriginPlotOptions(
      { type: select.value },
      options,
    );
    void onChange?.({ type: normalized.type });
  };
  select.addEventListener("change", listener);
  store.add(toDisposable(() => select.removeEventListener("change", listener)));
  return select;
};

const createAxisTickSelect = ({
  id,
  isY,
  onChange,
  store,
  value,
}: {
  readonly id: string;
  readonly isY: boolean;
  readonly onChange: (value: PlotAxisSettings["xTicks"] | PlotAxisSettings["yTicks"]) => void;
  readonly store: DisposableStore;
  readonly value: PlotAxisSettings["xTicks"] | PlotAxisSettings["yTicks"];
}): HTMLSelectElement => {
  const select = document.createElement("select");
  select.id = id;
  select.className = "dropdown-field dropdown-field--sm export_settings_view_control";
  select.value = String(value);
  const options = isY
    ? [
        { value: "auto", label: localize("chart_axis_auto", "auto") },
        { value: "nice", label: localize("chart_axis_nice", "nice") },
        { value: "step", label: localize("chart_axis_step", "step") },
        { value: "decades", label: localize("chart_axis_decades", "decades") },
      ]
    : [
        { value: "auto", label: localize("chart_axis_auto", "auto") },
        { value: "nice", label: localize("chart_axis_nice", "nice") },
        { value: "step", label: localize("chart_axis_step", "step") },
      ];
  for (const option of options) {
    const item = document.createElement("option");
    item.value = option.value;
    item.textContent = option.label;
    select.append(item);
  }
  const listener = () => onChange(select.value as PlotAxisSettings["xTicks"]);
  select.addEventListener("change", listener);
  store.add(toDisposable(() => select.removeEventListener("change", listener)));
  return select;
};

const createLineWidthInput = (
  options: OriginPlotOptions,
  onChange: ExportSettingsViewOptions["onChange"],
  store: DisposableStore,
): HTMLElement => {
  const input = document.createElement("input");
  input.id = "export-settings-line-width";
  input.type = "number";
  input.min = "0.5";
  input.max = "20";
  input.step = "0.5";
  input.value = String(options.lineWidth);
  const wrapper = createInputBoxField({
    className: "export_settings_view_control",
    fieldClassName: "export_settings_view_input_field",
    input,
    inputClassName: "export_settings_view_input",
  }).element;
  const listener = () => {
    const normalized = normalizeOriginPlotOptions(
      { lineWidth: input.value },
      options,
    );
    input.value = String(normalized.lineWidth);
    void onChange?.({ lineWidth: normalized.lineWidth });
  };
  input.addEventListener("change", listener);
  store.add(toDisposable(() => input.removeEventListener("change", listener)));
  return wrapper;
};

const createAxisTextInput = ({
  disabled = false,
  id,
  onChange,
  placeholder,
  store,
  value,
}: {
  readonly disabled?: boolean;
  readonly id: string;
  readonly onChange: (value: string) => void;
  readonly placeholder?: string;
  readonly store: DisposableStore;
  readonly value: string | number;
}): HTMLElement => {
  const input = document.createElement("input");
  input.id = id;
  input.disabled = disabled;
  input.placeholder = placeholder ?? "";
  input.type = "text";
  input.value = String(value ?? "");
  const wrapper = createInputBoxField({
    className: "export_settings_view_control",
    fieldClassName: "export_settings_view_input_field",
    input,
    inputClassName: "export_settings_view_input",
  }).element;
  let lastValue = input.value.trim();
  const commit = () => {
    const nextValue = input.value.trim();
    if (nextValue === lastValue) {
      return;
    }
    lastValue = nextValue;
    input.value = nextValue;
    onChange(nextValue);
  };
  const blurListener = () => commit();
  const keydownListener = (event: KeyboardEvent) => {
    if (event.key === "Enter") {
      event.preventDefault();
      input.blur();
    }
  };
  input.addEventListener("blur", blurListener);
  input.addEventListener("keydown", keydownListener);
  store.add(toDisposable(() => input.removeEventListener("blur", blurListener)));
  store.add(toDisposable(() => input.removeEventListener("keydown", keydownListener)));
  return wrapper;
};

const createBooleanSwitch = ({
  checked,
  onChange,
  store,
}: {
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
  readonly store: DisposableStore;
}): HTMLButtonElement => {
  const button = createSwitch({ checked });
  const listener = () => onChange(!checked);
  button.addEventListener("click", listener);
  store.add(toDisposable(() => button.removeEventListener("click", listener)));
  return button;
};

const createTextInput = ({
  id,
  onChange,
  store,
  value,
}: {
  readonly id: string;
  readonly onChange: (value: string) => void;
  readonly store: DisposableStore;
  readonly value: string;
}): HTMLElement => {
  const input = document.createElement("input");
  input.id = id;
  input.value = value;
  input.type = "text";
  const wrapper = createInputBoxField({
    className: "export_settings_view_control",
    fieldClassName: "export_settings_view_input_field",
    input,
    inputClassName: "export_settings_view_input",
  }).element;
  let lastValue = value;
  const commit = () => {
    const nextValue = input.value.trim();
    if (nextValue === lastValue) {
      return;
    }
    lastValue = nextValue;
    input.value = nextValue;
    onChange(nextValue);
  };
  const blurListener = () => commit();
  const keydownListener = (event: KeyboardEvent) => {
    if (event.key === "Enter") {
      event.preventDefault();
      input.blur();
    }
  };
  input.addEventListener("blur", blurListener);
  input.addEventListener("keydown", keydownListener);
  store.add(toDisposable(() => input.removeEventListener("blur", blurListener)));
  store.add(toDisposable(() => input.removeEventListener("keydown", keydownListener)));
  return wrapper;
};

const createPostCommandsInput = (
  options: OriginPlotOptions,
  onChange: ExportSettingsViewOptions["onChange"],
  store: DisposableStore,
): HTMLTextAreaElement => {
  const textarea = document.createElement("textarea");
  textarea.id = "export-settings-post-commands";
  textarea.className = "export_settings_view_textarea";
  textarea.value = options.postCommands.join("\n");
  let lastValue = textarea.value.trim();
  const listener = () => {
    const nextValue = textarea.value.trim();
    if (nextValue === lastValue) {
      return;
    }
    lastValue = nextValue;
    textarea.value = nextValue;
    const normalized = normalizeOriginPlotOptions(
      { postCommands: nextValue },
      options,
    );
    void onChange?.({ postCommands: normalized.postCommands });
  };
  textarea.addEventListener("blur", listener);
  store.add(toDisposable(() => textarea.removeEventListener("blur", listener)));
  return textarea;
};

const getSettingsControlId = (control: HTMLElement): string => {
  if (control.id) {
    return control.id;
  }
  return getNativeControl(control)?.id ?? "";
};

const getNativeControl = (
  control: HTMLElement,
): HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null => {
  if (
    control instanceof HTMLInputElement ||
    control instanceof HTMLSelectElement ||
    control instanceof HTMLTextAreaElement
  ) {
    return control;
  }

  const element = control.querySelector("input, select, textarea");
  if (
    element instanceof HTMLInputElement ||
    element instanceof HTMLSelectElement ||
    element instanceof HTMLTextAreaElement
  ) {
    return element;
  }
  return null;
};

export default ExportSettingsView;
