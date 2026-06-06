/* Origin 导出时的绘图/轴/命令设置 */

import { localize } from "src/cs/nls";

import { createInputBoxField } from "src/cs/base/browser/ui/inputbox/inputBox";
import { createLxIcon } from "src/cs/base/browser/ui/lxicon/lxicon";
import { createSelectBox } from "src/cs/base/browser/ui/selecbox/selectBox";
import Scrollbar from "src/cs/base/browser/ui/scrollbar/scrollbar";
import { createSwitch } from "src/cs/base/browser/ui/switch/switch";
import { DisposableStore, toDisposable } from "src/cs/base/common/lifecycle";
import { LxIcon } from "src/cs/base/common/lxicon";
import type { IContextMenuService } from "src/cs/platform/contextview/browser/contextView";
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

import "src/cs/workbench/contrib/origin/browser/media/originSettingsViewPane.css";
import "src/cs/workbench/browser/parts/views/media/views.css";

export type OriginSettingsViewPaneOptions = {
  readonly axisSettings?: Partial<PlotAxisSettings> | Record<string, unknown>;
  readonly contextMenuService: Pick<IContextMenuService, "showContextMenu" | "hideContextMenu">;
  readonly onAxisChange?: (updates: Record<string, unknown>) => void | Promise<void>;
  readonly onChange?: (updates: Partial<OriginPlotOptions>) => void | Promise<void>;
  readonly options?: OriginPlotOptions;
};

export class OriginSettingsViewPane extends ViewPane {
  private readonly collapsedSectionIds = new Set<string>(["origin-advanced-plot-settings"]);
  private readonly renderStore = new DisposableStore();
  private readonly pane = document.createElement("div");
  private readonly scrollArea = new Scrollbar({
    className: "origin_settings_scroll",
    viewportClassName: "origin_settings_scroll_viewport",
  });

  constructor() {
    super({
      id: OriginExportSettingsViewId,
      title: localize("chart_curve_settings_title", "Origin Settings"),
      className: "auxiliarybar_view_pane origin_settings_view_pane",
      bodyClassName: "workbench-part-view-pane__body",
      headerVisible: false,
    });
    this.pane.className = "origin_settings_pane";
    this.pane.append(this.scrollArea.element);
    this.body.append(this.pane);
  }

  public update({
    axisSettings,
    onAxisChange,
    onChange,
    options,
  }: OriginSettingsViewPaneOptions): void {
    this.renderStore.clear();
    const normalizedOptions = normalizeOriginPlotOptions(
      options,
      DEFAULT_ORIGIN_PLOT_OPTIONS,
    );

    const view = document.createElement("div");
    view.className = "origin_settings_view";
    view.append(createOriginSettingsView({
      axisSettings: normalizePlotAxisSettings(axisSettings, DEFAULT_PLOT_AXIS_SETTINGS),
      isSectionCollapsed: id => this.collapsedSectionIds.has(id),
      onAxisChange,
      onChange,
      onSectionToggle: (id, collapsed) => {
        if (collapsed) {
          this.collapsedSectionIds.add(id);
        } else {
          this.collapsedSectionIds.delete(id);
        }
        this.scrollArea.layout();
      },
      options: normalizedOptions,
      store: this.renderStore,
    }));
    this.scrollArea.viewport.replaceChildren(view);
    queueMicrotask(() => this.scrollArea.layout());
  }

  public override dispose(): void {
    this.scrollArea.viewport.replaceChildren();
    this.renderStore.dispose();
    this.scrollArea.dispose();
    this.pane.remove();
    super.dispose();
  }
}

const createOriginSettingsView = ({
  axisSettings,
  isSectionCollapsed,
  onAxisChange,
  onChange,
  onSectionToggle,
  options,
  store,
}: {
  readonly axisSettings: PlotAxisSettings;
  readonly isSectionCollapsed: (id: string) => boolean;
  readonly onAxisChange?: (updates: Record<string, unknown>) => void | Promise<void>;
  readonly onChange?: (updates: Partial<OriginPlotOptions>) => void | Promise<void>;
  readonly onSectionToggle: (id: string, collapsed: boolean) => void;
  readonly options: OriginPlotOptions;
  readonly store: DisposableStore;
}): HTMLElement => {
  const root = document.createElement("div");
  root.className = "origin_settings_view_content";

  root.append(
    createSettingsSection({
      fields: [
        createSettingsField({
          control: createPlotTypeSelect(options, onChange, store),
          label: localize("chart_curve_type_label", "Curve type"),
        }),
        createSettingsField({
          control: createLineWidthInput(options, onChange, store),
          label: localize("settings_origin_plot_line_width_label", "Line width"),
        }),
      ],
      collapsed: isSectionCollapsed("origin-settings"),
      id: "origin-settings",
      onToggle: onSectionToggle,
      store,
      title: localize("chart_curve_settings_title", "Origin Settings"),
    }),
    createSettingsSection({
      fields: [
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
      ],
      collapsed: isSectionCollapsed("origin-plot-settings"),
      id: "origin-plot-settings",
      onToggle: onSectionToggle,
      store,
      title: localize("origin_export_settings_plot_title", "Plot Settings"),
    }),
    createAxisSettingsGroup({
      axisSettings,
      label: localize("chart_axis_x_title", "X Axis"),
      maxKey: "xMax",
      minKey: "xMin",
      onAxisChange,
      isCollapsed: isSectionCollapsed("origin-x-axis"),
      onToggle: onSectionToggle,
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
      isCollapsed: isSectionCollapsed("origin-y-axis"),
      onToggle: onSectionToggle,
      stepKey: "yStep",
      tickCountKey: "yTickCount",
      ticksKey: "yTicks",
      store,
    }),
    createSettingsSection({
      collapsed: isSectionCollapsed("origin-advanced-plot-settings"),
      fields: [
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
      ],
      id: "origin-advanced-plot-settings",
      onToggle: onSectionToggle,
      store,
      title: localize("settings_origin_plot_advanced_title", "Advanced Plot Settings"),
    }),
  );
  return root;
};

const createSettingsSection = ({
  collapsed = false,
  fields,
  id,
  onToggle,
  store,
  title: titleText,
}: {
  readonly collapsed?: boolean;
  readonly fields: HTMLElement[];
  readonly id: string;
  readonly onToggle: (id: string, collapsed: boolean) => void;
  readonly store: DisposableStore;
  readonly title: string;
}): HTMLElement => {
  const group = document.createElement("section");
  group.className = "export_settings_view_group export_settings_view_section";
  group.dataset.collapsed = String(collapsed);

  const header = document.createElement("button");
  header.type = "button";
  header.className = "export_settings_view_section_header";
  header.setAttribute("aria-controls", `${id}_body`);
  header.setAttribute("aria-expanded", String(!collapsed));

  const twisty = document.createElement("span");
  twisty.className = "export_settings_view_section_twisty";
  twisty.setAttribute("aria-hidden", "true");
  twisty.append(createLxIcon({ icon: LxIcon.chevronRight, size: 14 }));

  const title = document.createElement("span");
  title.className = "export_settings_view_group_title";
  title.textContent = titleText;

  const body = document.createElement("div");
  body.id = `${id}_body`;
  body.className = "export_settings_view_section_body";
  body.hidden = collapsed;
  body.append(...fields);

  const setCollapsed = (nextCollapsed: boolean): void => {
    group.dataset.collapsed = String(nextCollapsed);
    header.setAttribute("aria-expanded", String(!nextCollapsed));
    body.hidden = nextCollapsed;
    onToggle(id, nextCollapsed);
  };
  const listener = () => setCollapsed(group.dataset.collapsed !== "true");
  header.addEventListener("click", listener);
  store.add(toDisposable(() => header.removeEventListener("click", listener)));

  header.append(twisty, title);
  group.append(header, body);
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
  field.className = hint ? "export_settings_view_field export_settings_view_field_with_hint" : "export_settings_view_field";

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
  isCollapsed,
  label,
  maxKey,
  minKey,
  onAxisChange,
  onToggle,
  stepKey,
  tickCountKey,
  ticksKey,
  store,
}: {
  readonly axisSettings: PlotAxisSettings;
  readonly isCollapsed: boolean;
  readonly label: string;
  readonly maxKey: "xMax" | "yMax";
  readonly minKey: "xMin" | "yMin";
  readonly onAxisChange?: (updates: Record<string, unknown>) => void | Promise<void>;
  readonly onToggle: (id: string, collapsed: boolean) => void;
  readonly stepKey: "xStep" | "yStep";
  readonly tickCountKey: "xTickCount" | "yTickCount";
  readonly ticksKey: "xTicks" | "yTicks";
  readonly store: DisposableStore;
}): HTMLElement => {
  const isY = ticksKey === "yTicks";
  return createSettingsSection({
    collapsed: isCollapsed,
    fields: [
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
    ],
    id: isY ? "origin-y-axis" : "origin-x-axis",
    onToggle,
    store,
    title: label,
  });
};

const createPlotTypeSelect = (
  options: OriginPlotOptions,
  onChange: OriginSettingsViewPaneOptions["onChange"],
  store: DisposableStore,
): HTMLElement =>
  createSettingsDropdown({
    id: "export-settings-type",
    options: [
      { value: "200", label: localize("settings_origin_plot_type_200", "Line") },
      { value: "201", label: localize("settings_origin_plot_type_201", "Scatter") },
      { value: "202", label: localize("settings_origin_plot_type_202", "Line + Symbol") },
    ],
    onSelect: value => {
      const normalized = normalizeOriginPlotOptions({ type: value }, options);
      void onChange?.({ type: normalized.type });
    },
    store,
    value: String(options.type),
  });

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
}): HTMLElement => {
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
  return createSettingsDropdown({
    id,
    options,
    onSelect: next => onChange(next as PlotAxisSettings["xTicks"]),
    store,
    value,
  });
};

const createSettingsDropdown = <T extends string>({
  id,
  onSelect,
  options,
  store,
  value,
}: {
  readonly id: string;
  readonly onSelect: (value: T) => void;
  readonly options: Array<{ label: string; value: T }>;
  readonly store: DisposableStore;
  readonly value: T;
}): HTMLElement => {
  const select = createSelectBox({
    className: "export_settings_view_control origin_settings_dropdown",
    id,
    onDidSelect: onSelect,
    options,
    surfaceClassName: "origin_settings_dropdown_surface",
    value,
  });
  store.add(select);
  return select.domNode;
};

const createLineWidthInput = (
  options: OriginPlotOptions,
  onChange: OriginSettingsViewPaneOptions["onChange"],
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
  onChange: OriginSettingsViewPaneOptions["onChange"],
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

export default OriginSettingsViewPane;
