import { createButton } from "src/cs/base/browser/ui/button/button";
import { createInputBoxField } from "src/cs/base/browser/ui/inputbox/inputBox";
import { addDisposableListener } from "src/cs/base/browser/dom";
import { createLxIcon } from "src/cs/base/browser/ui/lxicon/lxicon";
import { createSelectBox, type SelectBox } from "src/cs/base/browser/ui/selectBox/selectBox";
import { DisposableStore } from "src/cs/base/common/lifecycle";
import { LxIcon } from "src/cs/base/common/lxicon";
import type { IContextMenuService } from "src/cs/platform/contextview/browser/contextView";
import { localize } from "src/cs/nls";
import { X_UNIT_VALUES, Y_UNIT_VALUES } from "src/cs/workbench/contrib/plot/common/units";
import type { TemplateConfig } from "src/cs/workbench/contrib/template/common/templateManagerUtils";

export type TemplatePickFieldName =
  | "xDataStart"
  | "xDataEnd"
  | "xSegmentCount"
  | "xPointsPerGroup"
  | "yLegendStart"
  | "yLegendCount";

type TemplateStringFieldName = Exclude<
  {
    [K in keyof TemplateConfig]: TemplateConfig[K] extends string ? K : never;
  }[keyof TemplateConfig],
  "xSegmentationMode" | "xUnit" | "yLegendTarget" | "yUnit"
>;

type TemplateEditorInputName =
  | "name"
  | "xDataStart"
  | "xDataEnd"
  | "xSegmentCount"
  | "xPointsPerGroup"
  | "bottomTitle"
  | "leftTitle"
  | "yLegendStart"
  | "yLegendCount"
  | "yLegendStep"
  | "legendPrefix";

type TemplateSectionId = "x" | "y" | "optional";

export type TemplateEditorViewOptions = {
  readonly contextMenuService: Pick<IContextMenuService, "showContextMenu">;
  readonly onCancel: () => void;
  readonly onClearYColumns: () => void;
  readonly onPickFieldFocus: (field: TemplatePickFieldName | null) => void;
  readonly onSave: () => void;
  readonly onUpdateConfig: (updates: Partial<TemplateConfig>) => void;
};

export type TemplateEditorViewState = {
  readonly activePickField: TemplatePickFieldName | null;
  readonly config: TemplateConfig;
  readonly selectedYColumnLabels: readonly string[];
};

const PICKABLE_TEMPLATE_FIELDS: ReadonlySet<TemplateEditorInputName> = new Set([
  "xDataStart",
  "xDataEnd",
  "xSegmentCount",
  "xPointsPerGroup",
  "yLegendStart",
  "yLegendCount",
]);

const X_SEGMENTATION_OPTIONS: Array<{
  label: string;
  value: TemplateConfig["xSegmentationMode"];
}> = [
  { label: localize("template_x_mode_auto", "Auto"), value: "auto" },
  { label: localize("template_x_mode_points", "Point count"), value: "points" },
  { label: localize("template_x_mode_segments", "Segment count"), value: "segments" },
];

const Y_LEGEND_TARGET_OPTIONS: Array<{
  label: string;
  value: TemplateConfig["yLegendTarget"];
}> = [
  { label: localize("template_y_target_auto", "Auto"), value: "auto" },
  { label: localize("template_y_target_column", "Y column"), value: "yColumn" },
  { label: localize("template_y_target_group", "Group"), value: "group" },
];

const X_UNIT_OPTIONS: Array<{ label: string; value: TemplateConfig["xUnit"] }> = X_UNIT_VALUES.map((value) => ({
  label: value,
  value,
}));

const Y_UNIT_OPTIONS: Array<{ label: string; value: TemplateConfig["yUnit"] }> = Y_UNIT_VALUES.map((value) => ({
  label: value,
  value,
}));

export class TemplateEditorView {
  public readonly element: HTMLElement;
  private readonly disposables = new DisposableStore();
  private readonly inputs: Record<TemplateEditorInputName, HTMLInputElement>;
  private readonly xSegmentationMode: SelectField<TemplateConfig["xSegmentationMode"]>;
  private readonly xUnit: SelectField<TemplateConfig["xUnit"]>;
  private readonly yLegendTarget: SelectField<TemplateConfig["yLegendTarget"]>;
  private readonly yUnit: SelectField<TemplateConfig["yUnit"]>;
  private readonly yColumnsSummary: HTMLElement;
  private readonly yColumnsClearButton: HTMLButtonElement;
  private readonly focusInputValues = new Map<TemplateEditorInputName, string>();

  constructor(
    private readonly options: TemplateEditorViewOptions,
    state: TemplateEditorViewState,
  ) {
    this.element = document.createElement("div");
    this.element.className = "template_editor_view template_view_content";

    const form = document.createElement("div");
    form.className = "template_form";

    const templateFields = this.createSection(
      form,
      null,
    );
    const xFields = this.createSection(
      form,
      localize("template_x_section", "X"),
      "x",
    );
    const yFields = this.createSection(
      form,
      localize("template_y_section", "Y"),
      "y",
    );
    const optionalFields = this.createSection(
      form,
      localize("template_optional_section", "Optional"),
      "optional",
    );

    const nameInput = this.createField(templateFields, localize("template_name", "Template name"), "name", {
      fullWidth: true,
    });
    const xDataStartInput = this.createField(xFields, localize("template_x_start", "Start"), "xDataStart", {
      placeholder: localize("template_cell_placeholder", "Click or enter a cell"),
    });
    const xDataEndInput = this.createField(xFields, localize("template_x_end", "End"), "xDataEnd", {
      placeholder: "End",
    });

    this.xSegmentationMode = this.createSelectField(
      xFields,
      localize("template_x_segmentation_mode", "Grouping"),
      X_SEGMENTATION_OPTIONS,
      state.config.xSegmentationMode,
      value => {
        this.options.onUpdateConfig({ xSegmentationMode: value });
        this.updateXSegmentationFields(value);
      },
    );
    const xSegmentCountInput = this.createField(xFields, localize("template_x_segment_count", "Segment count"), "xSegmentCount");
    const xPointsPerGroupInput = this.createField(xFields, localize("template_x_points_per_group", "Point count"), "xPointsPerGroup");

    const yColumnsField = document.createElement("div");
    yColumnsField.className = "template_selection_field";

    const yColumnsFieldLabel = document.createElement("span");
    yColumnsFieldLabel.className = "template_field_label";
    yColumnsFieldLabel.textContent = localize("template_y_columns", "Y columns");
    yColumnsField.append(yColumnsFieldLabel);

    const yColumnsContent = document.createElement("div");
    yColumnsContent.className = "template_selection_content";

    const yColumnsHeader = document.createElement("div");
    yColumnsHeader.className = "template_selection_header";

    const yColumnsLabel = document.createElement("span");
    yColumnsLabel.className = "template_selection_label";
    yColumnsLabel.textContent = localize("template_y_columns", "Y columns");

    this.yColumnsClearButton = document.createElement("button");
    this.yColumnsClearButton.type = "button";
    this.yColumnsClearButton.className = "template_selection_clear";
    this.yColumnsClearButton.textContent = localize("template_clear_y_columns", "Clear");
    this.disposables.add(addDisposableListener(this.yColumnsClearButton, "click", () => {
      this.options.onClearYColumns();
    }));

    yColumnsHeader.append(yColumnsLabel, this.yColumnsClearButton);

    this.yColumnsSummary = document.createElement("p");
    this.yColumnsSummary.className = "template_selection_summary";
    this.yColumnsSummary.setAttribute("aria-live", "polite");
    yColumnsContent.append(yColumnsHeader, this.yColumnsSummary);
    yColumnsField.append(yColumnsContent);
    yFields.append(yColumnsField);

    this.inputs = {
      name: nameInput,
      xDataStart: xDataStartInput,
      xDataEnd: xDataEndInput,
      xSegmentCount: xSegmentCountInput,
      xPointsPerGroup: xPointsPerGroupInput,
      bottomTitle: this.createField(optionalFields, localize("template_bottom_title", "X title"), "bottomTitle", {
        placeholder: "Vg",
      }),
      yLegendStart: this.createField(yFields, localize("template_y_legend_start", "Legend Start"), "yLegendStart", {
        placeholder: "B1",
      }),
      yLegendCount: this.createField(yFields, localize("template_y_legend_count", "Legend Count"), "yLegendCount"),
      yLegendStep: this.createField(yFields, localize("template_y_legend_step", "Legend Step"), "yLegendStep"),
      leftTitle: this.createField(optionalFields, localize("template_left_title", "Y title"), "leftTitle", {
        placeholder: "Id",
      }),
      legendPrefix: this.createField(yFields, localize("template_legend_prefix", "Legend prefix / Vd"), "legendPrefix", {
        placeholder: "Vd",
      }),
    };
    this.disposables.add(addDisposableListener(this.element, "focusin", (event) => {
      if (!(event.target instanceof HTMLInputElement)) {
        return;
      }

      this.handleInputFocus(event.target);
    }));

    this.xUnit = this.createSelectField(
      optionalFields,
      localize("template_x_unit", "X unit"),
      X_UNIT_OPTIONS,
      state.config.xUnit,
      value => {
        this.options.onUpdateConfig({ xUnit: value });
      },
    );

    this.yUnit = this.createSelectField(
      optionalFields,
      localize("template_y_unit", "Y unit"),
      Y_UNIT_OPTIONS,
      state.config.yUnit,
      value => {
        this.options.onUpdateConfig({ yUnit: value });
      },
    );

    this.yLegendTarget = this.createSelectField(
      yFields,
      localize("template_y_legend_target", "Legend target"),
      Y_LEGEND_TARGET_OPTIONS,
      state.config.yLegendTarget,
      value => {
        this.options.onUpdateConfig({ yLegendTarget: value });
      },
    );

    this.element.append(form);

    const spacer = document.createElement("div");
    spacer.className = "template_spacer";
    this.element.append(spacer);

    const saveActions = document.createElement("div");
    saveActions.className = "template_save_actions";

    const saveButton = createButton({
      label: localize("save_template", "Save template"),
      size: "md",
      variant: "primary",
    });
    saveButton.className = `${saveButton.className} template_button`;
    this.disposables.add(addDisposableListener(saveButton, "click", () => this.options.onSave()));

    const cancelButton = createButton({
      label: localize("cancel", "Cancel"),
      size: "md",
      variant: "secondary",
    });
    cancelButton.className = `${cancelButton.className} template_button`;
    this.disposables.add(addDisposableListener(cancelButton, "click", () => this.options.onCancel()));

    saveActions.append(saveButton, cancelButton);
    this.element.append(saveActions);

    this.update(state);
  }

  public update(state: TemplateEditorViewState): void {
    const config = state.config;
    const values: Record<keyof typeof this.inputs, string> = {
      name: config.name,
      xDataStart: config.xDataStart,
      xDataEnd: getTemplateInputValue("xDataEnd", config.xDataEnd),
      xSegmentCount: config.xSegmentCount,
      xPointsPerGroup: config.xPointsPerGroup,
      bottomTitle: config.bottomTitle,
      leftTitle: config.leftTitle,
      yLegendStart: config.yLegendStart,
      yLegendCount: config.yLegendCount,
      yLegendStep: config.yLegendStep,
      legendPrefix: config.legendPrefix,
    };

    for (const [key, input] of Object.entries(this.inputs) as Array<[keyof typeof this.inputs, HTMLInputElement]>) {
      if (input.value !== values[key]) {
        input.value = values[key];
      }
      this.setPickFieldActive(input, key === state.activePickField);
    }

    this.updateDropdownField(this.xSegmentationMode, {
      value: config.xSegmentationMode,
      options: X_SEGMENTATION_OPTIONS,
    });
    this.updateDropdownField(this.xUnit, {
      value: config.xUnit,
      options: X_UNIT_OPTIONS,
    });
    this.updateXSegmentationFields(config.xSegmentationMode);
    this.updateDropdownField(this.yLegendTarget, {
      value: config.yLegendTarget,
      options: Y_LEGEND_TARGET_OPTIONS,
    });
    this.updateDropdownField(this.yUnit, {
      value: config.yUnit,
      options: Y_UNIT_OPTIONS,
    });
    const hasYColumns = state.selectedYColumnLabels.length > 0;
    this.yColumnsClearButton.hidden = !hasYColumns;
    this.yColumnsSummary.textContent = hasYColumns
      ? localize("template_selected_y_columns", "Columns following X range: {columns}", {
          columns: state.selectedYColumnLabels.join(", "),
        })
      : localize("template_no_y_columns", "Select preview columns that follow the X range.");
  }

  public dispose(): void {
    this.disposables.dispose();
    this.element.replaceChildren();
    this.element.remove();
  }

  private createSection(
    container: HTMLElement,
    title: string | null,
    sectionId?: TemplateSectionId,
  ): HTMLElement {
    const section = document.createElement("section");
    section.className = "template_form_section";

    const fields = document.createElement("div");
    fields.className = "template_form_grid";

    if (title && sectionId) {
      const formSection = this.disposables.add(new TemplateFormSection({
        collapsed: sectionId === "optional",
        id: `template_form_${sectionId}`,
        title,
      }));
      container.append(formSection.element);
      return formSection.body;
    } else if (title) {
      const heading = document.createElement("h3");
      heading.className = "template_form_section_title";
      heading.textContent = title;
      section.append(heading);
    }
    section.append(fields);
    container.append(section);
    return fields;
  }

  private createField(
    container: HTMLElement,
    label: string,
    name: TemplateEditorInputName,
    options: {
      fullWidth?: boolean;
      placeholder?: string;
    } = {},
  ): HTMLInputElement {
    const inputId = getTemplateFieldId(name);
    const field = createField({
      id: inputId,
      label,
      name,
      placeholder: options.placeholder,
      value: "",
    });
    const isPickableField = PICKABLE_TEMPLATE_FIELDS.has(name);
    const input = field.querySelector("input") as HTMLInputElement;
    this.disposables.add(addDisposableListener(input, "input", () => {
      const shouldRestoreFocus = document.activeElement === input;
      const selectionStart = input.selectionStart;
      const selectionEnd = input.selectionEnd;
      this.options.onUpdateConfig({ [name]: input.value });
      if (shouldRestoreFocus && document.activeElement !== input) {
        input.focus();
        if (selectionStart !== null && selectionEnd !== null) {
          input.setSelectionRange(selectionStart, selectionEnd);
        }
      }
    }));
    this.disposables.add(addDisposableListener(input, "keydown", (event) => {
      if (event.isComposing) {
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        event.stopPropagation();
        this.acceptInput(input, name, isPickableField);
      } else if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        this.cancelInput(input, name, isPickableField);
      }
    }));
    if (options.fullWidth) {
      field.className = `${field.className} template_field--full`;
    }
    container.append(field);
    return input;
  }

  private handleInputFocus(input: HTMLInputElement): void {
    const entry = (Object.entries(this.inputs) as Array<[TemplateEditorInputName, HTMLInputElement]>)
      .find(([, candidate]) => candidate === input);
    if (!entry) {
      return;
    }

    const [name] = entry;
    this.focusInputValues.set(name, input.value);
    this.options.onPickFieldFocus(
      PICKABLE_TEMPLATE_FIELDS.has(name) ? name as TemplatePickFieldName : null,
    );
  }

  private acceptInput(input: HTMLInputElement, name: TemplateEditorInputName, isPickableField: boolean): void {
    this.focusInputValues.delete(name);
    input.blur();
    if (isPickableField) {
      this.options.onPickFieldFocus(null);
    }
  }

  private cancelInput(input: HTMLInputElement, name: TemplateEditorInputName, isPickableField: boolean): void {
    const previousValue = this.focusInputValues.get(name) ?? "";
    this.focusInputValues.delete(name);
    if (input.value !== previousValue) {
      input.value = previousValue;
      this.options.onUpdateConfig({ [name]: previousValue });
    }
    input.blur();
    if (isPickableField) {
      this.options.onPickFieldFocus(null);
    }
  }

  private createSelectField<T extends string>(
    container: HTMLElement,
    label: string,
    options: Array<{ label: string; value: T }>,
    value: T,
    onSelect: (value: T) => void,
  ): SelectField<T> {
    const fieldId = `template_editor_${labelToId(label)}`;
    const labelId = `${fieldId}_label`;
    const wrapper = document.createElement("div");
    wrapper.className = "template_field";

    const labelElement = document.createElement("span");
    labelElement.id = labelId;
    labelElement.className = "template_field_label";
    labelElement.textContent = label;
    wrapper.append(labelElement);

    const field: SelectField<T> = {
      ariaLabel: label,
      id: fieldId,
      labelId,
      onSelect,
      select: createSelectBox({
        ariaLabel: label,
        ariaLabelledBy: labelId,
        className: "template_form_selectbox",
        id: fieldId,
        onDidSelect: onSelect,
        options,
        dropdownClassName: "template_form_selectbox_surface",
        value,
      }),
    };
    this.disposables.add(field.select);
    wrapper.append(field.select.domNode);
    container.append(wrapper);
    this.updateDropdownField(field, { options, value });
    return field;
  }

  private updateDropdownField<T extends string>(
    field: SelectField<T>,
    {
      options,
      value,
    }: {
      value: T;
      options: Array<{ label: string; value: T }>;
    },
  ): void {
    field.select.update({
      ariaLabel: field.ariaLabel,
      ariaLabelledBy: field.labelId,
      className: "template_form_selectbox",
      id: field.id,
      onDidSelect: field.onSelect,
      options,
      dropdownClassName: "template_form_selectbox_surface",
      value,
    });
  }

  private updateXSegmentationFields(mode: TemplateConfig["xSegmentationMode"]): void {
    this.setFieldHidden(this.inputs.xSegmentCount, mode !== "segments");
    this.setFieldHidden(this.inputs.xPointsPerGroup, mode !== "points");
  }

  private setFieldHidden(input: HTMLInputElement, hidden: boolean): void {
    const field = input.closest(".template_field") as HTMLElement | null;
    if (!field) return;

    field.classList.toggle("template_field--hidden", hidden);
    field.setAttribute("aria-hidden", hidden ? "true" : "false");
    input.disabled = hidden;
  }

  private setPickFieldActive(input: HTMLInputElement, active: boolean): void {
    const field = input.closest(".inputbox_field") as HTMLElement | null;
    if (!field) return;

    field.dataset.picking = active ? "true" : "false";
  }
}

type SelectField<T extends string> = {
  ariaLabel: string;
  id: string;
  labelId: string;
  onSelect: (value: T) => void;
  select: SelectBox<T>;
};

class TemplateFormSection {
  public readonly body: HTMLElement;
  public readonly element: HTMLElement;
  private readonly button: HTMLButtonElement;
  private readonly disposables = new DisposableStore();
  private collapsed: boolean;

  constructor({
    collapsed,
    id,
    title,
  }: {
    readonly collapsed: boolean;
    readonly id: string;
    readonly title: string;
  }) {
    this.collapsed = collapsed;
    this.element = document.createElement("section");
    this.element.className = "template_form_section template_form_collapsible";
    this.element.dataset.collapsed = String(collapsed);

    this.button = document.createElement("button");
    this.button.type = "button";
    this.button.className = "template_form_section_header";
    this.button.setAttribute("aria-controls", `${id}_body`);
    this.button.setAttribute("aria-expanded", String(!collapsed));

    const icon = document.createElement("span");
    icon.className = "template_form_section_twisty";
    icon.setAttribute("aria-hidden", "true");
    icon.append(createLxIcon({ icon: LxIcon.chevronRight, size: 14 }));

    const label = document.createElement("span");
    label.className = "template_form_section_title";
    label.textContent = title;

    this.body = document.createElement("div");
    this.body.id = `${id}_body`;
    this.body.className = "template_form_grid";
    this.body.hidden = collapsed;

    this.disposables.add(addDisposableListener(this.button, "click", () => {
      this.setCollapsed(!this.collapsed);
    }));

    this.button.append(icon, label);
    this.element.append(this.button, this.body);
  }

  private setCollapsed(collapsed: boolean): void {
    this.collapsed = collapsed;
    this.element.dataset.collapsed = String(collapsed);
    this.button.setAttribute("aria-expanded", String(!collapsed));
    this.body.hidden = collapsed;
  }

  public dispose(): void {
    this.disposables.dispose();
    this.element.replaceChildren();
    this.element.remove();
  }
}

const createField = ({
  id,
  label,
  name,
  placeholder,
  value,
}: {
  id: string;
  label: string;
  name: TemplateStringFieldName;
  placeholder?: string;
  value: string;
}): HTMLElement => {
  const wrapper = document.createElement("div");
  wrapper.className = "template_field";

  const labelElement = document.createElement("span");
  const labelId = `${id}_label`;
  labelElement.id = labelId;
  labelElement.className = "template_field_label";
  labelElement.textContent = label;

  const inputField = createInputBoxField({
    ariaLabelledBy: labelId,
    id,
    name: String(name),
    placeholder,
    value,
  });

  wrapper.append(labelElement, inputField.element);
  return wrapper;
};

const getTemplateFieldId = (name: string): string => `template_editor_${name}`;

const getTemplateInputValue = (
  name: TemplateEditorInputName,
  value: string,
): string =>
  name === "xDataEnd" && value.trim().toLowerCase() === "end"
    ? ""
    : value;

const labelToId = (value: string): string => value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
