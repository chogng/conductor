import { localize } from "src/cs/nls";

import { createInputBoxField } from "src/cs/base/browser/ui/inputbox/inputBox";
import { Disposable, DisposableStore, toDisposable } from "src/cs/base/common/lifecycle";
import {
  DEFAULT_ORIGIN_PLOT_OPTIONS,
  normalizeOriginPlotOptions,
  type OriginPlotOptions,
} from "src/cs/workbench/contrib/origin/common/originPlotOptions";

import "src/cs/workbench/contrib/origin/browser/media/plotSettingsView.css";

export type PlotSettingsViewOptions = {
  readonly onChange?: (updates: Partial<OriginPlotOptions>) => void | Promise<void>;
  readonly options?: OriginPlotOptions;
};

export class PlotSettingsView extends Disposable {
  public readonly element = document.createElement("div");
  private readonly renderStore = this._register(new DisposableStore());

  constructor() {
    super();
    this.element.className = "plot_settings";
  }

  public update({
    onChange,
    options,
  }: PlotSettingsViewOptions): void {
    this.renderStore.clear();
    const normalizedOptions = normalizeOriginPlotOptions(
      options,
      DEFAULT_ORIGIN_PLOT_OPTIONS,
    );

    this.element.replaceChildren(createPlotSettingsView({
      onChange,
      options: normalizedOptions,
      store: this.renderStore,
    }));
  }

  public override dispose(): void {
    this.element.replaceChildren();
    super.dispose();
  }
}

const createPlotSettingsView = ({
  onChange,
  options,
  store,
}: {
  readonly onChange?: (updates: Partial<OriginPlotOptions>) => void | Promise<void>;
  readonly options: OriginPlotOptions;
  readonly store: DisposableStore;
}): HTMLElement => {
  const root = document.createElement("div");
  root.className = "plot_settings_content";

  root.append(
    createSettingsGroup(localize("da_chart_curve_settings_title", "Curve Settings"), [
      createSettingsField({
        control: createPlotTypeSelect(options, onChange, store),
        label: localize("da_chart_curve_type_label", "Curve type"),
      }),
      createSettingsField({
        control: createLineWidthInput(options, onChange, store),
        label: localize("da_settings_origin_plot_line_width_label", "Line width"),
      }),
    ]),
    createSettingsGroup(localize("da_settings_origin_plot_title", "Default Plot Settings"), [
      createSettingsField({
        control: createTextInput({
          id: "plot-settings-xy-pairs",
          onChange: (value) => {
            const normalized = normalizeOriginPlotOptions({ xyPairs: value }, options);
            void onChange?.({ xyPairs: normalized.xyPairs });
          },
          store,
          value: options.xyPairs,
        }),
        hint: localize("da_settings_origin_plot_xy_pairs_hint", "LabTalk expression, for example ((1,2)) or ((1,2),(3,4))."),
        label: localize("da_settings_origin_plot_xy_pairs_label", "XY pairs"),
      }),
      createSettingsField({
        control: createTextInput({
          id: "plot-settings-command",
          onChange: (value) => {
            const normalized = normalizeOriginPlotOptions({ command: value }, options);
            void onChange?.({ command: normalized.command });
          },
          store,
          value: options.command,
        }),
        hint: localize("da_settings_origin_plot_command_hint", "Optional full LabTalk command. If set, it overrides plot type and XY pairs."),
        label: localize("da_settings_origin_plot_command_label", "Plot command override"),
      }),
      createSettingsField({
        control: createPostCommandsInput(options, onChange, store),
        hint: localize("da_settings_origin_plot_post_commands_hint", "One LabTalk command per line, executed after plotting."),
        label: localize("da_settings_origin_plot_post_commands_label", "Post-plot commands"),
      }),
    ]),
  );
  return root;
};

const createSettingsGroup = (titleText: string, fields: HTMLElement[]): HTMLElement => {
  const group = document.createElement("section");
  group.className = "plot_settings_group";
  const title = document.createElement("div");
  title.className = "plot_settings_group_title";
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
  field.className = "plot_settings_field";

  const label = document.createElement("label");
  label.className = "plot_settings_label";
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
    hintElement.className = "plot_settings_hint";
    hintElement.textContent = hint;
    field.append(label, control, hintElement);
    return field;
  }

  field.append(label, control);
  return field;
};

const createPlotTypeSelect = (
  options: OriginPlotOptions,
  onChange: PlotSettingsViewOptions["onChange"],
  store: DisposableStore,
): HTMLSelectElement => {
  const select = document.createElement("select");
  select.id = "plot-settings-type";
  select.className = "dropdown-field dropdown-field--sm plot_settings_control";
  select.value = String(options.type);
  for (const option of [
    { value: "200", label: localize("da_settings_origin_plot_type_200", "Line") },
    { value: "201", label: localize("da_settings_origin_plot_type_201", "Scatter") },
    { value: "202", label: localize("da_settings_origin_plot_type_202", "Line + Symbol") },
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

const createLineWidthInput = (
  options: OriginPlotOptions,
  onChange: PlotSettingsViewOptions["onChange"],
  store: DisposableStore,
): HTMLElement => {
  const input = document.createElement("input");
  input.id = "plot-settings-line-width";
  input.type = "number";
  input.min = "0.5";
  input.max = "20";
  input.step = "0.5";
  input.value = String(options.lineWidth);
  const wrapper = createInputBoxField({
    className: "plot_settings_control",
    fieldClassName: "plot_settings_input_field",
    input,
    inputClassName: "plot_settings_input",
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
    className: "plot_settings_control",
    fieldClassName: "plot_settings_input_field",
    input,
    inputClassName: "plot_settings_input",
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
  onChange: PlotSettingsViewOptions["onChange"],
  store: DisposableStore,
): HTMLTextAreaElement => {
  const textarea = document.createElement("textarea");
  textarea.id = "plot-settings-post-commands";
  textarea.className = "plot_settings_textarea";
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

export default PlotSettingsView;
