import { createButton } from "src/cs/base/browser/ui/button/button";
import { createInputBoxField } from "src/cs/base/browser/ui/inputbox/inputBoxField";
import { addDisposableListener } from "src/cs/base/browser/dom";
import { createLxIcon } from "src/cs/base/browser/ui/lxicon/lxicon";
import { createSelectBox, type SelectBox } from "src/cs/base/browser/ui/selectBox/selectBox";
import { DisposableStore } from "src/cs/base/common/lifecycle";
import { LxIcon } from "src/cs/base/common/lxicon";
import type { IContextMenuService } from "src/cs/platform/contextview/browser/contextView";
import { localize } from "src/cs/nls";
import { X_UNIT_VALUES, Y_UNIT_VALUES } from "src/cs/workbench/services/plot/common/units";
import type { TemplateEditorConfig } from "src/cs/workbench/services/template/common/templateEditorConfig";
import { toColumnLabel } from "src/cs/workbench/services/template/common/templateCellRef";
import {
  formatTemplateXRangeLabel,
  getTemplateXRangeColumns,
  getTemplateXRangeFormFields,
  normalizeTemplateXRange,
  normalizeTemplateXRanges,
  type TemplateXRange,
} from "src/cs/workbench/services/template/common/templateXRange";
import { normalizeColumnIndexes } from "src/cs/workbench/services/template/common/templateXYBinding";

export type TemplatePickFieldName =
  | "xDataStart"
  | "xDataEnd"
  | "xSegmentCount"
  | "xPointsPerGroup"
  | "yLegendStart"
  | "yLegendCount";

export type TemplateColumnPickTarget = "xRanges" | "yColumns";

type TemplateStringFieldName = Exclude<
  {
    [K in keyof TemplateEditorConfig]: TemplateEditorConfig[K] extends string ? K : never;
  }[keyof TemplateEditorConfig],
  "xSegmentationMode" | "xUnit" | "yLegendTarget" | "yUnit"
>;

type TemplateEditorInputName =
  | "name"
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
  readonly onColumnPickTargetChange: (target: TemplateColumnPickTarget) => void;
  readonly onPickFieldFocus: (field: TemplatePickFieldName | null) => void;
  readonly onSave: () => void;
  readonly onUpdateConfig: (updates: Partial<TemplateEditorConfig>) => void;
};

export type TemplateEditorViewState = {
  readonly activePickField: TemplatePickFieldName | null;
  readonly activeColumnPickTarget: TemplateColumnPickTarget;
  readonly config: TemplateEditorConfig;
  readonly selectedXRangeLabels: readonly string[];
  readonly selectedYColumnLabels: readonly string[];
};

const PICKABLE_TEMPLATE_FIELDS: ReadonlySet<TemplateEditorInputName> = new Set([
  "xSegmentCount",
  "xPointsPerGroup",
  "yLegendStart",
  "yLegendCount",
]);

const X_SEGMENTATION_OPTIONS: Array<{
  label: string;
  value: TemplateEditorConfig["xSegmentationMode"];
}> = [
  { label: localize("template.xMode.auto", "Auto"), value: "auto" },
  { label: localize("template.xMode.points", "Point count"), value: "points" },
  { label: localize("template.xMode.segments", "Segment count"), value: "segments" },
];

const Y_LEGEND_TARGET_OPTIONS: Array<{
  label: string;
  value: TemplateEditorConfig["yLegendTarget"];
}> = [
  { label: localize("template.yTarget.auto", "Auto"), value: "auto" },
  { label: localize("template.yTarget.column", "Y column"), value: "yColumn" },
  { label: localize("template.yTarget.group", "Group"), value: "group" },
];

const X_UNIT_OPTIONS: Array<{ label: string; value: TemplateEditorConfig["xUnit"] }> = X_UNIT_VALUES.map((value) => ({
  label: value,
  value,
}));

const Y_UNIT_OPTIONS: Array<{ label: string; value: TemplateEditorConfig["yUnit"] }> = Y_UNIT_VALUES.map((value) => ({
  label: value,
  value,
}));

export class TemplateEditorView {
  public readonly element: HTMLElement;
  private readonly disposables = new DisposableStore();
  private readonly inputs: Record<TemplateEditorInputName, HTMLInputElement>;
  private readonly xSegmentationMode: SelectField<TemplateEditorConfig["xSegmentationMode"]>;
  private readonly xUnit: SelectField<TemplateEditorConfig["xUnit"]>;
  private readonly yLegendTarget: SelectField<TemplateEditorConfig["yLegendTarget"]>;
  private readonly yUnit: SelectField<TemplateEditorConfig["yUnit"]>;
  private readonly xRangeInput: TemplateChipInput;
  private readonly yColumnsInput: TemplateChipInput;
  private readonly focusInputValues = new Map<TemplateEditorInputName, string>();
  private currentState: TemplateEditorViewState;

  constructor(
    private readonly options: TemplateEditorViewOptions,
    state: TemplateEditorViewState,
  ) {
    this.currentState = state;
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
      localize("template.sections.dataSelection", "Data selection"),
      "x",
    );
    const yFields = this.createSection(
      form,
      localize("template.sections.legend", "Legend"),
      "y",
    );
    const optionalFields = this.createSection(
      form,
      localize("template.sections.optional", "Optional"),
      "optional",
    );

    const nameInput = this.createField(templateFields, localize("template.fields.name", "Template name"), "name", {
      fullWidth: true,
    });
    const saveActions = document.createElement("div");
    saveActions.className = "template_save_actions";

    const saveButton = createButton({
      label: localize("template.save.label", "Save template"),
      size: "md",
      variant: "primary",
    });
    saveButton.className = `${saveButton.className} template_button`;
    this.disposables.add(addDisposableListener(saveButton, "click", () => this.options.onSave()));

    const cancelButton = createButton({
      label: localize("common.cancel", "Cancel"),
      size: "md",
      variant: "secondary",
    });
    cancelButton.className = `${cancelButton.className} template_button`;
    this.disposables.add(addDisposableListener(cancelButton, "click", () => this.options.onCancel()));

    saveActions.append(saveButton, cancelButton);
    templateFields.append(saveActions);

    this.xRangeInput = this.disposables.add(new TemplateChipInput({
      label: localize("template.fields.x", "X"),
      placeholder: localize("template.fields.xRangePlaceholder", "Drop or enter a range"),
      onCommitText: text => this.commitXRangeText(text),
      onFocus: () => this.focusSelectionTarget("xRanges"),
      onRemove: index => this.updateXRanges(removeAt(this.currentState.config.xRanges, index)),
      onReorder: (fromIndex, toIndex) => this.updateXRanges(moveItem(this.currentState.config.xRanges, fromIndex, toIndex)),
    }));
    xFields.append(this.xRangeInput.element);

    this.xSegmentationMode = this.createSelectField(
      xFields,
      localize("template.fields.xSegmentationMode", "Grouping"),
      X_SEGMENTATION_OPTIONS,
      state.config.xSegmentationMode,
      value => {
        this.options.onUpdateConfig({ xSegmentationMode: value });
        this.updateXSegmentationFields(value);
      },
    );

    this.yColumnsInput = this.disposables.add(new TemplateChipInput({
      label: localize("template.fields.yColumns", "Y columns"),
      placeholder: localize("template.fields.yColumnPlaceholder", "Column B"),
      onCommitText: text => this.commitYColumnText(text),
      onFocus: () => this.focusSelectionTarget("yColumns"),
      onRemove: index => this.updateYColumns(removeAt(this.currentState.config.yColumns, index)),
      onReorder: (fromIndex, toIndex) => this.updateYColumns(moveItem(this.currentState.config.yColumns, fromIndex, toIndex)),
    }));
    xFields.append(this.yColumnsInput.element);

    const xSegmentCountInput = this.createField(xFields, localize("template.fields.xSegmentCount", "Segment count"), "xSegmentCount");
    const xPointsPerGroupInput = this.createField(xFields, localize("template.fields.xPointsPerGroup", "Point count"), "xPointsPerGroup");

    this.inputs = {
      name: nameInput,
      xSegmentCount: xSegmentCountInput,
      xPointsPerGroup: xPointsPerGroupInput,
      bottomTitle: this.createField(optionalFields, localize("template.fields.bottomTitle", "X title"), "bottomTitle", {
        placeholder: "Vg",
      }),
      yLegendStart: this.createField(yFields, localize("template.fields.yLegendStart", "Legend Start"), "yLegendStart", {
        placeholder: "B1",
      }),
      yLegendCount: this.createField(yFields, localize("template.fields.yLegendCount", "Legend Count"), "yLegendCount"),
      yLegendStep: this.createField(yFields, localize("template.fields.yLegendStep", "Legend Step"), "yLegendStep"),
      leftTitle: this.createField(optionalFields, localize("template.fields.leftTitle", "Y title"), "leftTitle", {
        placeholder: "Id",
      }),
      legendPrefix: this.createField(yFields, localize("template.fields.legendPrefix", "Legend prefix / Vd"), "legendPrefix", {
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
      localize("template.fields.xUnit", "X unit"),
      X_UNIT_OPTIONS,
      state.config.xUnit,
      value => {
        this.options.onUpdateConfig({ xUnit: value });
      },
    );

    this.yUnit = this.createSelectField(
      optionalFields,
      localize("template.fields.yUnit", "Y unit"),
      Y_UNIT_OPTIONS,
      state.config.yUnit,
      value => {
        this.options.onUpdateConfig({ yUnit: value });
      },
    );

    this.yLegendTarget = this.createSelectField(
      yFields,
      localize("template.fields.yLegendTarget", "Legend target"),
      Y_LEGEND_TARGET_OPTIONS,
      state.config.yLegendTarget,
      value => {
        this.options.onUpdateConfig({ yLegendTarget: value });
      },
    );

    this.element.append(form);

    this.update(state);
  }

  public update(state: TemplateEditorViewState): void {
    this.currentState = state;
    const config = state.config;
    const values: Record<keyof typeof this.inputs, string> = {
      name: config.name,
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
    this.xRangeInput.update({
      active: state.activeColumnPickTarget === "xRanges",
      tokens: state.selectedXRangeLabels.map((label, index) => ({
        id: `x-${index}-${label}`,
        label,
      })),
    });
    this.yColumnsInput.update({
      active: state.activeColumnPickTarget === "yColumns",
      tokens: state.selectedYColumnLabels.map((label, index) => ({
        id: `y-${index}-${label}`,
        label,
      })),
    });
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

  private focusSelectionTarget(target: TemplateColumnPickTarget): void {
    this.options.onPickFieldFocus(null);
    this.options.onColumnPickTargetChange(target);
  }

  private commitXRangeText(text: string): boolean {
    const xRange = normalizeTemplateXRange(text);
    if (!xRange) {
      return false;
    }

    this.updateXRanges([...this.currentState.config.xRanges, xRange]);
    return true;
  }

  private commitYColumnText(text: string): boolean {
    const columns = parseYColumnInput(text);
    if (!columns.length) {
      return false;
    }

    this.updateYColumns([...this.currentState.config.yColumns, ...columns]);
    return true;
  }

  private updateXRanges(ranges: readonly TemplateXRange[]): void {
    const xRanges = normalizeTemplateXRanges(ranges);
    this.options.onUpdateConfig({
      ...getTemplateXRangeFormFields(xRanges),
      xColumns: getTemplateXRangeColumns(xRanges),
      xRanges,
    });
  }

  private updateYColumns(columns: readonly unknown[]): void {
    this.options.onUpdateConfig({
      yColumns: normalizeColumnIndexes(columns),
    });
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

  private updateXSegmentationFields(mode: TemplateEditorConfig["xSegmentationMode"]): void {
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

type TemplateChipToken = {
  readonly id: string;
  readonly label: string;
};

class TemplateChipInput {
  public readonly element: HTMLElement;
  private readonly disposables = new DisposableStore();
  private readonly input: HTMLInputElement;
  private readonly surface: HTMLElement;
  private readonly tokenDisposables = this.disposables.add(new DisposableStore());
  private readonly tokensElement: HTMLElement;
  private dragIndex: number | null = null;
  private tokenCount = 0;

  constructor(
    private readonly options: {
      readonly label: string;
      readonly placeholder: string;
      readonly onCommitText: (text: string) => boolean;
      readonly onFocus: () => void;
      readonly onRemove: (index: number) => void;
      readonly onReorder: (fromIndex: number, toIndex: number) => void;
    },
  ) {
    this.element = document.createElement("div");
    this.element.className = "template_chip_field";

    const labelElement = document.createElement("span");
    labelElement.className = "template_field_label";
    labelElement.textContent = options.label;

    const content = document.createElement("div");
    content.className = "template_chip_content";

    this.surface = document.createElement("div");
    this.surface.className = "template_chip_surface";
    this.surface.dataset.hasTokens = "false";
    this.surface.tabIndex = -1;

    this.tokensElement = document.createElement("div");
    this.tokensElement.className = "template_chip_tokens";

    this.input = document.createElement("input");
    this.input.className = "template_chip_text_input";
    this.input.placeholder = options.placeholder;
    this.input.type = "text";
    this.input.setAttribute("aria-label", options.label);

    this.surface.append(this.tokensElement, this.input);
    content.append(this.surface);
    this.element.append(labelElement, content);

    this.disposables.add(addDisposableListener(this.surface, "click", () => {
      this.revealInput();
      this.input.focus();
    }));
    this.disposables.add(addDisposableListener(this.input, "focus", () => {
      this.revealInput();
      this.options.onFocus();
    }));
    this.disposables.add(addDisposableListener(this.input, "keydown", event => {
      if (event.isComposing) {
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        event.stopPropagation();
        this.commitInput();
      } else if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        this.input.value = "";
        this.input.dataset.invalid = "false";
        this.input.blur();
      } else if (event.key === "Backspace" && !this.input.value && this.tokenCount > 0) {
        event.preventDefault();
        this.options.onRemove(this.tokenCount - 1);
      }
    }));
    this.disposables.add(addDisposableListener(this.input, "blur", () => {
      this.commitInput();
      this.syncInputVisibility();
    }));
  }

  public update({
    active,
    tokens,
  }: {
    readonly active: boolean;
    readonly tokens: readonly TemplateChipToken[];
  }): void {
    this.element.dataset.picking = active ? "true" : "false";
    this.tokenCount = tokens.length;
    this.surface.dataset.hasTokens = tokens.length > 0 ? "true" : "false";
    this.tokenDisposables.clear();
    this.tokensElement.replaceChildren(...tokens.map((token, index) => this.createToken(token, index)));
    this.syncInputVisibility();
  }

  private createToken(token: TemplateChipToken, index: number): HTMLElement {
    const chip = document.createElement("span");
    chip.className = "template_chip_token";
    chip.draggable = true;
    chip.dataset.index = String(index);

    const label = document.createElement("span");
    label.className = "template_chip_label";
    label.textContent = token.label;

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "template_chip_remove";
    removeButton.setAttribute("aria-label", localize("template.fields.removeChip", "Remove {label}", {
      label: token.label,
    }));
    removeButton.append(createLxIcon({ icon: LxIcon.close, size: 12 }));

    chip.append(label, removeButton);
    this.tokenDisposables.add(addDisposableListener(removeButton, "click", event => {
      event.preventDefault();
      event.stopPropagation();
      this.options.onRemove(index);
      this.revealInput();
      this.input.focus();
    }));
    this.tokenDisposables.add(addDisposableListener(chip, "dragstart", event => {
      this.dragIndex = index;
      event.dataTransfer?.setData("text/plain", token.id);
      event.dataTransfer?.setDragImage(chip, 8, 8);
      chip.dataset.dragging = "true";
    }));
    this.tokenDisposables.add(addDisposableListener(chip, "dragover", event => {
      if (this.dragIndex === null || this.dragIndex === index) {
        return;
      }
      event.preventDefault();
      chip.dataset.dropTarget = "true";
    }));
    this.tokenDisposables.add(addDisposableListener(chip, "dragleave", () => {
      chip.dataset.dropTarget = "false";
    }));
    this.tokenDisposables.add(addDisposableListener(chip, "drop", event => {
      event.preventDefault();
      chip.dataset.dropTarget = "false";
      if (this.dragIndex !== null && this.dragIndex !== index) {
        this.options.onReorder(this.dragIndex, index);
      }
      this.dragIndex = null;
    }));
    this.tokenDisposables.add(addDisposableListener(chip, "dragend", () => {
      this.dragIndex = null;
      chip.dataset.dragging = "false";
      chip.dataset.dropTarget = "false";
    }));

    return chip;
  }

  private revealInput(): void {
    this.input.hidden = false;
    this.input.placeholder = this.tokenCount > 0 ? "" : this.options.placeholder;
  }

  private syncInputVisibility(): void {
    const hasTokens = this.tokenCount > 0;
    this.input.placeholder = hasTokens ? "" : this.options.placeholder;
    this.input.hidden = hasTokens && !this.input.value && document.activeElement !== this.input;
  }

  private commitInput(): void {
    const text = this.input.value.trim();
    if (!text) {
      this.input.dataset.invalid = "false";
      return;
    }

    if (!this.options.onCommitText(text)) {
      this.input.dataset.invalid = "true";
      return;
    }

    this.input.value = "";
    this.input.dataset.invalid = "false";
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

const labelToId = (value: string): string => value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

const parseYColumnInput = (text: string): number[] =>
  normalizeColumnIndexes(
    text
      .split(/[,\s;，、]+/g)
      .map(value => parseColumnLabel(value)),
  );

const parseColumnLabel = (value: string): number | null => {
  const label = value.trim().replace(/列$/u, "").toUpperCase();
  if (!/^[A-Z]+$/.test(label)) {
    return null;
  }

  let column = 0;
  for (const char of label) {
    column = column * 26 + (char.charCodeAt(0) - 64);
  }
  return column - 1;
};

const removeAt = <T>(items: readonly T[], index: number): T[] =>
  items.filter((_, currentIndex) => currentIndex !== index);

const moveItem = <T>(items: readonly T[], fromIndex: number, toIndex: number): T[] => {
  if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= items.length || toIndex >= items.length) {
    return [...items];
  }

  const next = [...items];
  const [item] = next.splice(fromIndex, 1);
  if (item !== undefined) {
    next.splice(toIndex, 0, item);
  }
  return next;
};

export const formatTemplateYColumnLabel = (columnIndex: number): string =>
  localize("template.fields.yColumnChip", "Column {column}", {
    column: toColumnLabel(columnIndex),
  });
