import { createButton } from "src/cs/base/browser/ui/button/button";
import { createInputBoxField } from "src/cs/base/browser/ui/inputbox/inputBox";
import { localize } from "src/cs/nls";
import type { TemplateConfig } from "src/cs/workbench/contrib/template/common/templateManagerUtils";

export type TemplatePickFieldName = "xDataStart" | "xDataEnd" | "yLegendStart" | "yLegendCount";

type TemplateStringFieldName = Exclude<
  {
    [K in keyof TemplateConfig]: TemplateConfig[K] extends string ? K : never;
  }[keyof TemplateConfig],
  "xSegmentationMode" | "yLegendTarget"
>;

type TemplateEditorInputName =
  | "name"
  | "xDataStart"
  | "xDataEnd"
  | "xSegmentCount"
  | "xPointsPerGroup"
  | "xUnit"
  | "bottomTitle"
  | "leftTitle"
  | "yLegendStart"
  | "yLegendCount"
  | "yLegendStep"
  | "yUnit"
  | "legendPrefix"
  | "fileNameVgKeywords"
  | "fileNameVdKeywords";

export type TemplateEditorViewOptions = {
  readonly onCancel: () => void;
  readonly onPickFieldFocus: (field: TemplatePickFieldName | null) => void;
  readonly onSave: () => void;
  readonly onUpdateConfig: (updates: Partial<TemplateConfig>) => void;
};

export type TemplateEditorViewState = {
  readonly config: TemplateConfig;
  readonly selectedYColumnLabels: readonly string[];
};

const PICKABLE_TEMPLATE_FIELDS = new Set<string>([
  "xDataStart",
  "xDataEnd",
  "yLegendStart",
  "yLegendCount",
]);

export class TemplateEditorView {
  public readonly element: HTMLElement;
  private readonly inputs: Record<TemplateEditorInputName, HTMLInputElement>;
  private readonly xSegmentationMode: HTMLSelectElement;
  private readonly yLegendTarget: HTMLSelectElement;
  private readonly yColumnsSummary: HTMLElement;

  constructor(
    private readonly options: TemplateEditorViewOptions,
    state: TemplateEditorViewState,
  ) {
    this.element = document.createElement("div");
    this.element.className = "template_config_panel_content";

    const form = document.createElement("div");
    form.className = "template_form";

    const fields = this.createSection(
      form,
      localize("template_identity_section", "Template"),
    );

    this.inputs = {
      name: this.createField(fields, localize("template_name", "Template name"), "name"),
      xDataStart: this.createField(fields, localize("template_x_start", "X Start"), "xDataStart", {
        placeholder: "A2",
      }),
      xDataEnd: this.createField(fields, localize("template_x_end", "X End"), "xDataEnd", {
        placeholder: "End",
      }),
      xSegmentCount: this.createField(fields, localize("template_x_segment_count", "X segment count"), "xSegmentCount"),
      xPointsPerGroup: this.createField(fields, localize("template_x_points_per_group", "Points per group"), "xPointsPerGroup"),
      xUnit: this.createField(fields, localize("template_x_unit", "X unit"), "xUnit", {
        placeholder: "V",
      }),
      bottomTitle: this.createField(fields, localize("template_bottom_title", "X title / Vg"), "bottomTitle", {
        placeholder: "Vg",
      }),
      leftTitle: this.createField(fields, localize("template_left_title", "Y title"), "leftTitle", {
        placeholder: "Id",
      }),
      yLegendStart: this.createField(fields, localize("template_y_legend_start", "Legend Start"), "yLegendStart", {
        placeholder: "B1",
      }),
      yLegendCount: this.createField(fields, localize("template_y_legend_count", "Legend Count"), "yLegendCount"),
      yLegendStep: this.createField(fields, localize("template_y_legend_step", "Legend Step"), "yLegendStep"),
      yUnit: this.createField(fields, localize("template_y_unit", "Y unit"), "yUnit", {
        placeholder: "A",
      }),
      legendPrefix: this.createField(fields, localize("template_legend_prefix", "Legend prefix / Vd"), "legendPrefix", {
        placeholder: "Vd",
      }),
      fileNameVgKeywords: this.createField(fields, localize("template_filename_vg", "File-name Vg keywords"), "fileNameVgKeywords"),
      fileNameVdKeywords: this.createField(fields, localize("template_filename_vd", "File-name Vd keywords"), "fileNameVdKeywords"),
    };

    this.xSegmentationMode = this.createSelectField(fields, localize("template_x_segmentation_mode", "X grouping"), "xSegmentationMode", [
      { label: localize("template_x_mode_auto", "Auto"), value: "auto" },
      { label: localize("template_x_mode_points", "By point count"), value: "points" },
      { label: localize("template_x_mode_segments", "By segment count"), value: "segments" },
    ]);
    this.yLegendTarget = this.createSelectField(fields, localize("template_y_legend_target", "Legend target"), "yLegendTarget", [
      { label: localize("template_y_target_auto", "Auto"), value: "auto" },
      { label: localize("template_y_target_column", "Y column"), value: "yColumn" },
      { label: localize("template_y_target_group", "Group"), value: "group" },
    ]);

    this.yColumnsSummary = document.createElement("p");
    this.yColumnsSummary.className = "template_selection_summary";
    this.yColumnsSummary.setAttribute("aria-live", "polite");
    fields.append(this.yColumnsSummary);

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
    saveButton.addEventListener("click", () => this.options.onSave());

    const cancelButton = createButton({
      label: localize("cancel", "Cancel"),
      size: "md",
      variant: "secondary",
    });
    cancelButton.className = `${cancelButton.className} template_button`;
    cancelButton.addEventListener("click", () => this.options.onCancel());

    saveActions.append(saveButton, cancelButton);
    this.element.append(saveActions);

    this.update(state);
  }

  public update(state: TemplateEditorViewState): void {
    const config = state.config;
    const values: Record<keyof typeof this.inputs, string> = {
      name: config.name,
      xDataStart: config.xDataStart,
      xDataEnd: config.xDataEnd,
      xSegmentCount: config.xSegmentCount,
      xPointsPerGroup: config.xPointsPerGroup,
      xUnit: config.xUnit,
      bottomTitle: config.bottomTitle,
      leftTitle: config.leftTitle,
      yLegendStart: config.yLegendStart,
      yLegendCount: config.yLegendCount,
      yLegendStep: config.yLegendStep,
      yUnit: config.yUnit,
      legendPrefix: config.legendPrefix,
      fileNameVgKeywords: config.fileNameVgKeywords,
      fileNameVdKeywords: config.fileNameVdKeywords,
    };

    for (const [key, input] of Object.entries(this.inputs) as Array<[keyof typeof this.inputs, HTMLInputElement]>) {
      if (input.value !== values[key]) {
        input.value = values[key];
      }
    }

    this.xSegmentationMode.value = config.xSegmentationMode;
    this.yLegendTarget.value = config.yLegendTarget;
    this.yColumnsSummary.textContent = state.selectedYColumnLabels.length > 0
      ? localize("template_selected_y_columns", "Y Data columns: {columns}", {
          columns: state.selectedYColumnLabels.join(", "),
        })
      : localize("template_no_y_columns", "Y Data columns: select columns in the preview table.");
  }

  public dispose(): void {
    this.element.replaceChildren();
    this.element.remove();
  }

  private createSection(container: HTMLElement, title: string): HTMLElement {
    const section = document.createElement("section");
    section.className = "template_form_section";

    const heading = document.createElement("h3");
    heading.className = "template_form_section_title";
    heading.textContent = title;

    const fields = document.createElement("div");
    fields.className = "template_form_grid";

    section.append(heading, fields);
    container.append(section);
    return fields;
  }

  private createField(
    container: HTMLElement,
    label: string,
    name: TemplateEditorInputName,
    options: {
      placeholder?: string;
    } = {},
  ): HTMLInputElement {
    const field = createField({
      label,
      name,
      placeholder: options.placeholder,
      value: "",
      onInput: (_fieldName, value) => {
        this.options.onUpdateConfig({ [name]: value });
      },
    });
    container.append(field);
    const input = field.querySelector("input") as HTMLInputElement;
    input.addEventListener("focus", () => {
      this.options.onPickFieldFocus(
        PICKABLE_TEMPLATE_FIELDS.has(name) ? name as TemplatePickFieldName : null,
      );
    });
    return input;
  }

  private createSelectField<T extends TemplateConfig["xSegmentationMode"] | TemplateConfig["yLegendTarget"]>(
    container: HTMLElement,
    label: string,
    name: "xSegmentationMode" | "yLegendTarget",
    options: Array<{ label: string; value: T }>,
  ): HTMLSelectElement {
    const wrapper = document.createElement("label");
    wrapper.className = "template_field";

    const labelElement = document.createElement("span");
    labelElement.className = "template_field_label";
    labelElement.textContent = label;

    const select = document.createElement("select");
    select.className = "template_select_native";
    select.name = name;
    select.setAttribute("aria-label", label);

    for (const option of options) {
      const optionElement = document.createElement("option");
      optionElement.value = option.value;
      optionElement.textContent = option.label;
      select.append(optionElement);
    }

    select.addEventListener("change", () => {
      if (name === "xSegmentationMode") {
        this.options.onUpdateConfig({
          xSegmentationMode: select.value as TemplateConfig["xSegmentationMode"],
        });
        return;
      }

      this.options.onUpdateConfig({
        yLegendTarget: select.value as TemplateConfig["yLegendTarget"],
      });
    });

    wrapper.append(labelElement, select);
    container.append(wrapper);
    return select;
  }
}

const createField = ({
  label,
  name,
  placeholder,
  value,
  onInput,
}: {
  label: string;
  name: TemplateStringFieldName;
  placeholder?: string;
  value: string;
  onInput: (name: TemplateStringFieldName, value: string) => void;
}): HTMLElement => {
  const wrapper = document.createElement("label");
  wrapper.className = "template_field";

  const labelElement = document.createElement("span");
  labelElement.className = "template_field_label";
  labelElement.textContent = label;

  const inputField = createInputBoxField({
    name: String(name),
    placeholder,
    value,
  });
  const input = inputField.input;
  input.addEventListener("input", () => onInput(name, input.value));

  wrapper.append(labelElement, inputField.element);
  return wrapper;
};
