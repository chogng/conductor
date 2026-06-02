import { lxAdd, lxChevronDown, lxEdit } from "@chogng/lxicon";

import { createButton } from "src/cs/base/browser/ui/button/button";
import { createLxIcon } from "src/cs/base/browser/ui/lxicon/lxicon";
import {
  createMenuAction,
  createMenuButton,
  createMenuItemLabel,
  MenuButton,
} from "src/cs/base/browser/ui/menu/menu";
import { Separator, type IAction } from "src/cs/base/common/actions";
import {
  getInputFieldClassName,
  getInputFieldState,
  getInputNativeClassName,
} from "src/cs/base/browser/ui/input/input";
import {
  createSwitch as createBaseSwitch,
  updateSwitch,
} from "src/cs/base/browser/ui/switch/switch";
import { localize } from "src/cs/nls";
import type { TranslateFn } from "src/cs/platform/language/common/language";
import type { RawDataEntry } from "src/cs/workbench/common/deviceAnalysis/sharedTypes";
import {
  createEmptyTemplateConfig,
  cloneTemplateConfig,
  normalizeTemplateConfigRecord,
  toTemplateNameKey,
  type TemplateConfig,
} from "src/cs/workbench/contrib/template/common/templateManagerUtils";
import { getSession, defaultSessionModel } from "src/cs/workbench/contrib/session/useSession";
import { analysisStoreClient } from "src/cs/workbench/services/storage/electron-sandbox/analysisStoreClient";
import { Toast } from "src/cs/base/browser/ui/toast/toast";
import {
  validateTemplateForSave,
  validateTemplateForApply,
} from "src/cs/workbench/contrib/template/common/templateValidation";
import { AUTO_TEMPLATE_ID } from "src/cs/workbench/common/deviceAnalysis/autoExtraction";
import { downloadTemplateBundle } from "src/cs/workbench/contrib/template/browser/templateController";
import type {
  TableModel,
  TableSelection,
} from "src/cs/workbench/contrib/table/common/tableService";

export type TemplateElementOptions = {
  readonly t: TranslateFn;
  readonly importSessionElement?: HTMLElement | null;
  rawData?: RawDataEntry[];
  tableModel?: Pick<
    TableModel,
    | "clearHighlight"
    | "getSelection"
    | "highlightColumns"
    | "onDidChangeSelection"
  >;
  onTemplateApplied?: (config: Record<string, unknown>) => unknown;
  onTemplateAppliedIncremental?: (config: Record<string, unknown>) => unknown;
  analysisSettings?: Record<string, unknown> | null;
  onUpdateSettings?: (updates: Record<string, unknown>) => Promise<unknown> | unknown;
};

let cachedTemplates: any[] | null = null;
let templatesLoading = false;
let globalToast: Toast | null = null;
type PickFieldName = "xDataStart" | "xDataEnd" | "yLegendStart" | "yLegendCount";

const PICKABLE_TEMPLATE_FIELDS = new Set<string>([
  "xDataStart",
  "xDataEnd",
  "yLegendStart",
  "yLegendCount",
]);

const showToast = (message: string, type: "success" | "error" | "warning" | "info" = "success") => {
  if (!globalToast) {
    globalToast = new Toast();
  }
  globalToast.show({ message, type });
};

const createField = ({
  label,
  name,
  value,
  onInput,
}: {
  label: string;
  name: keyof TemplateConfig;
  value: string;
  onInput: (name: keyof TemplateConfig, value: string) => void;
}): HTMLElement => {
  const wrapper = document.createElement("label");
  wrapper.className = "template_field";

  const labelElement = document.createElement("span");
  labelElement.className = "template_field_label";
  labelElement.textContent = label;

  const input = document.createElement("input");
  input.className = `${getInputNativeClassName()} ${getInputFieldClassName({ fieldClassName: "template_field_input" })}`;
  input.dataset.state = getInputFieldState();
  input.name = String(name);
  input.value = value;
  input.autocomplete = "off";
  input.addEventListener("input", () => onInput(name, input.value));

  wrapper.append(labelElement, input);
  return wrapper;
};

const createToggleSwitch = (
  initialChecked: boolean,
  onCheckedChange: (checked: boolean) => void,
): HTMLButtonElement => {
  const button = createBaseSwitch({
    checked: initialChecked,
  });
  button.addEventListener("click", () => {
    const nextChecked = button.getAttribute("aria-checked") !== "true";
    updateSwitch(button, {
      checked: nextChecked,
    });
    onCheckedChange(nextChecked);
  });
  return button;
};

const importTemplates = async (payload: any, t: TranslateFn, session: any) => {
  let entry = payload;
  if (payload && payload.source === "conductor") {
    entry = payload;
  }
  
  const draft = normalizeTemplateConfigRecord(entry);
  if (!draft.name) {
    showToast(localize("da_template_import_invalid_format", "Invalid template file format."), "warning");
    return;
  }

  if (cachedTemplates) {
    const nameKey = toTemplateNameKey(draft.name);
    const conflict = cachedTemplates.some((t: any) => toTemplateNameKey(t.name) === nameKey);
    if (conflict) {
      let suffix = 1;
      let newName = `${draft.name}(${suffix})`;
      while (cachedTemplates.some((t: any) => toTemplateNameKey(t.name) === toTemplateNameKey(newName))) {
        suffix++;
        newName = `${draft.name}(${suffix})`;
      }
      const confirmMessage = localize(
        "da_template_import_conflict",
        "Template \"{name}\" already exists.\nOK: import as \"{newName}\".\nCancel: overwrite the existing template.",
        { name: draft.name, newName },
      );
      const shouldRename = typeof window !== "undefined" && typeof window.confirm === "function" ? window.confirm(confirmMessage) : true;
      if (shouldRename) {
        draft.name = newName;
      } else {
        const confTemplate = cachedTemplates.find((t: any) => toTemplateNameKey(t.name) === nameKey);
        if (confTemplate && confTemplate.id) {
          try {
            await analysisStoreClient.deleteDeviceAnalysisTemplate(confTemplate.id);
          } catch (err) {
            // Ignore delete conflict errors or proceed
          }
        }
      }
    }
  }

  const validation = validateTemplateForSave(draft, t as any);
  if (!validation.ok || !validation.normalized) {
    showToast(validation.message || localize("da_template_invalid_configuration", "Invalid configuration"), "warning");
    return;
  }

  try {
    const savedRaw = await analysisStoreClient.createDeviceAnalysisTemplate({
      ...validation.normalized,
      name: draft.name,
    });
    const saved = savedRaw as any;
    if (cachedTemplates) {
      cachedTemplates = [saved, ...cachedTemplates.filter((t: any) => t.id !== saved.id && toTemplateNameKey(t.name) !== toTemplateNameKey(saved.name))];
    } else {
      cachedTemplates = [saved];
    }
    
    session.setSelectedTemplateId(saved.id);
    session.setTemplateConfig(cloneTemplateConfig(saved));
    showToast(localize("da_template_imported", "Template imported"), "success");
    defaultSessionModel.emitChange();
  } catch (err) {
    showToast(localize("da_template_import_failed", "Failed to import template: {error}", { error: String(err) }), "error");
  }
};

const exportTemplate = (config: TemplateConfig) => {
  if (!config.name) {
    showToast(localize("da_template_export_requires_selection", "Please select a template to export."), "warning");
    return;
  }
  const payload = {
    version: 1,
    source: "conductor",
    ...config,
  };
  downloadTemplateBundle(payload);
};

const normalizeColumnIndexes = (columns: readonly number[] | undefined): number[] =>
  Array.from(new Set(
    (Array.isArray(columns) ? columns : [])
      .map((column) => Math.floor(Number(column)))
      .filter((column) => Number.isInteger(column) && column >= 0),
  )).sort((a, b) => a - b);

const areNumberArraysEqual = (
  first: readonly number[] | undefined,
  second: readonly number[] | undefined,
): boolean => {
  const normalizedFirst = normalizeColumnIndexes(first);
  const normalizedSecond = normalizeColumnIndexes(second);
  if (normalizedFirst.length !== normalizedSecond.length) {
    return false;
  }

  return normalizedFirst.every((value, index) => value === normalizedSecond[index]);
};

const toCellLabel = (rowIndex: number, colIndex: number): string =>
  `${toColumnLabel(colIndex)}${Math.max(0, Math.floor(Number(rowIndex) || 0)) + 1}`;

const toColumnLabel = (colIndex: number): string => {
  let value = Math.max(0, Math.floor(Number(colIndex) || 0)) + 1;
  let label = "";
  while (value > 0) {
    const remainder = (value - 1) % 26;
    label = String.fromCharCode(65 + remainder) + label;
    value = Math.floor((value - 1) / 26);
  }
  return label;
};

export const createTemplateElement = (options: TemplateElementOptions): HTMLElement =>
  new TemplateManagerView(options).element;

export class TemplateManagerView {
  public readonly element: HTMLElement;
  public readonly sidebarElement: HTMLElement;
  private readonly left = document.createElement("div");
  private props: TemplateElementOptions;
  private activePickField: PickFieldName | null = null;
  private disposeTableSelectionListener: (() => void) | null = null;
  private tableModel: TemplateElementOptions["tableModel"] | null = null;
  private mode: "select" | "save" | null = null;
  private toggleDraft: Pick<TemplateConfig, "stopOnError" | "fileNameMatchCaseSensitive"> | null = null;
  private selectRefs: {
    root: HTMLElement;
    menuButton: MenuButton;
    deleteButton: HTMLButtonElement;
    exportButton: HTMLButtonElement;
    stopSwitch: HTMLButtonElement;
    matchCaseSwitch: HTMLButtonElement;
    autoCard: HTMLElement;
  } | null = null;
  private saveRefs: {
    root: HTMLElement;
    inputs: Record<"name" | "xDataStart" | "xDataEnd" | "yLegendStart" | "yLegendCount", HTMLInputElement>;
    meta: HTMLElement;
  } | null = null;

  constructor(props: TemplateElementOptions) {
    this.props = props;
    this.element = document.createElement("div");
    this.element.className = "template_manager";
    this.sidebarElement = this.left;

    this.left.className = "template_config_panel";

    this.update(props);
  }

  private get session() {
    return getSession();
  }

  public update(props: TemplateElementOptions): void {
    this.props = props;
    this.bindTableSelection(props.tableModel);

    this.ensureTemplatesLoaded();
    this.syncToggleDraft();
    this.syncTableHighlight();

    const nextMode = this.session.templateMode;
    if (this.mode !== nextMode) {
      this.mode = nextMode;
      if (nextMode === "select") {
        this.activePickField = null;
      }
      this.left.replaceChildren(nextMode === "select" ? this.getSelectRoot() : this.getSaveRoot());
    }

    if (nextMode === "select") {
      this.updateSelectContent();
      return;
    }

    this.updateSaveContent();
  }

  public dispose(): void {
    this.disposeTableSelectionListener?.();
    this.disposeTableSelectionListener = null;
    this.tableModel?.clearHighlight();
    this.selectRefs?.menuButton.dispose();
    this.selectRefs = null;
    this.saveRefs = null;
    this.element.replaceChildren();
    this.element.remove();
  }

  private getEffectiveTemplateConfig(): TemplateConfig {
    const config = this.session.templateConfig;
    if (!this.toggleDraft) {
      return config;
    }

    return {
      ...config,
      stopOnError: this.toggleDraft.stopOnError,
      fileNameMatchCaseSensitive: this.toggleDraft.fileNameMatchCaseSensitive,
    };
  }

  private bindTableSelection(tableModel: TemplateElementOptions["tableModel"]): void {
    if (this.tableModel === tableModel) {
      return;
    }

    this.disposeTableSelectionListener?.();
    this.disposeTableSelectionListener = null;
    this.tableModel?.clearHighlight();
    this.tableModel = tableModel ?? null;

    if (!tableModel) {
      return;
    }

    this.disposeTableSelectionListener = tableModel.onDidChangeSelection((selection) => {
      this.applyTableSelection(selection);
    });
    this.applyTableSelection(tableModel.getSelection());
  }

  private applyTableSelection(selection: TableSelection): void {
    const columns = normalizeColumnIndexes(selection.selectedColumns);
    if (columns.length > 0) {
      this.updateTemplateConfig({ yColumns: columns });
    }

    const activeCell = selection.activeCell;
    if (!activeCell || !this.activePickField) {
      return;
    }

    this.updateTemplateConfig({
      [this.activePickField]: toCellLabel(activeCell.rowIndex, activeCell.colIndex),
    });
  }

  private updateTemplateConfig(updates: Partial<TemplateConfig>): void {
    const current = this.getEffectiveTemplateConfig();
    let changed = false;
    const next: TemplateConfig = {
      ...current,
      ...updates,
    };

    if (Array.isArray(updates.yColumns)) {
      changed = !areNumberArraysEqual(current.yColumns, updates.yColumns);
      next.yColumns = updates.yColumns;
    }

    for (const [key, value] of Object.entries(updates)) {
      if (key === "yColumns") {
        continue;
      }
      if (current[key as keyof TemplateConfig] !== value) {
        changed = true;
      }
    }

    if (!changed) {
      return;
    }

    this.toggleDraft = {
      stopOnError: next.stopOnError,
      fileNameMatchCaseSensitive: next.fileNameMatchCaseSensitive,
    };
    this.session.setTemplateConfig(next);
    defaultSessionModel.emitChange();
  }

  private syncTableHighlight(): void {
    const columns = normalizeColumnIndexes(this.getEffectiveTemplateConfig().yColumns);
    if (columns.length > 0) {
      this.tableModel?.highlightColumns(columns);
      return;
    }

    this.tableModel?.clearHighlight();
  }

  private syncToggleDraft(): void {
    const config = this.session.templateConfig;
    if (!this.toggleDraft) {
      this.toggleDraft = {
        stopOnError: config.stopOnError,
        fileNameMatchCaseSensitive: config.fileNameMatchCaseSensitive,
      };
      return;
    }

    if (this.mode !== "select") {
      this.toggleDraft = {
        stopOnError: config.stopOnError,
        fileNameMatchCaseSensitive: config.fileNameMatchCaseSensitive,
      };
    }
  }

  private ensureTemplatesLoaded(): void {
    if (cachedTemplates !== null || templatesLoading) {
      return;
    }

    templatesLoading = true;
    analysisStoreClient.getDeviceAnalysisTemplates()
      .then((remote) => {
        cachedTemplates = Array.isArray(remote) ? remote : [];
        templatesLoading = false;
        defaultSessionModel.emitChange();
      })
      .catch((err) => {
        templatesLoading = false;
        showToast(
          localize("da_loadTemplatesFailed", "Failed to load templates: {error}", {
            error: err instanceof Error ? err.message : String(err),
          }),
          "error",
        );
      });
  }

  private getSelectRoot(): HTMLElement {
    if (!this.selectRefs) {
      this.selectRefs = this.createSelectContent();
    }

    return this.selectRefs.root;
  }

  private getSaveRoot(): HTMLElement {
    if (!this.saveRefs) {
      this.saveRefs = this.createSaveContent();
    }

    return this.saveRefs.root;
  }

  private createSelectContent() {
    const root = document.createElement("div");
    root.className = "template_config_panel_content";

    const dropdownRow = document.createElement("div");
    dropdownRow.className = "template_select_field";

    const dropdownLabel = document.createElement("span");
    dropdownLabel.className = "template_field_label";
    dropdownLabel.textContent = localize("da_template_select_label", "Select template");
    dropdownRow.append(dropdownLabel);

    const selectContainer = document.createElement("div");
    selectContainer.className = "template_button_row template_select_actions";

    const menuButton = createMenuButton({
      label: "",
      items: () => this.createTemplateActions(),
      menuClassName: "template_select_menu",
      surfaceClassName: "template_select_menu_surface",
      triggerIcon: () => createLxIcon({ icon: lxChevronDown, size: 14 }),
    });
    selectContainer.append(menuButton.domNode);

    const deleteButton = createButton({
      label: localize("da_delete_template", "Delete template"),
      size: "sm",
      variant: "secondary",
    });
    deleteButton.className = `${deleteButton.className} template_button`;
    deleteButton.addEventListener("click", async () => {
      const { selectedTemplateId, templateConfig } = this.session;
      if (!selectedTemplateId) {
        return;
      }

      const confirmMsg = localize("da_template_delete_confirm", "Delete template \"{name}\"?", { name: templateConfig.name });
      if (typeof window !== "undefined" && typeof window.confirm === "function" && !window.confirm(confirmMsg)) {
        return;
      }

      try {
        await analysisStoreClient.deleteDeviceAnalysisTemplate(selectedTemplateId);
        if (cachedTemplates) {
          cachedTemplates = cachedTemplates.filter((template: any) => template.id !== selectedTemplateId);
        }
        const config = this.getEffectiveTemplateConfig();
        this.session.setSelectedTemplateId(AUTO_TEMPLATE_ID);
        this.session.setTemplateConfig(createEmptyTemplateConfig({
          stopOnError: templateConfig.stopOnError,
          fileNameMatchCaseSensitive: templateConfig.fileNameMatchCaseSensitive,
        }));
        this.toggleDraft = {
          stopOnError: config.stopOnError,
          fileNameMatchCaseSensitive: config.fileNameMatchCaseSensitive,
        };
        showToast(localize("da_template_deleted", "Template deleted"), "success");
        defaultSessionModel.emitChange();
      } catch (err) {
        showToast(localize("da_template_delete_failed", "Failed to delete template: {error}", { error: String(err) }), "error");
      }
    });
    selectContainer.append(deleteButton);

    dropdownRow.append(selectContainer);
    root.append(dropdownRow);

    const applyActions = document.createElement("div");
    applyActions.className = "template_apply_actions";

    const applyAllBtn = createButton({
      label: localize("da_apply_template", "Apply Template"),
      size: "md",
      variant: "primary",
    });
    applyAllBtn.className = `${applyAllBtn.className} template_button`;
    applyAllBtn.addEventListener("click", () => this.applyTemplate(false));

    const applyNewBtn = createButton({
      label: localize("da_apply_new_files", "Apply New Files"),
      size: "md",
      variant: "secondary",
    });
    applyNewBtn.className = `${applyNewBtn.className} template_button`;
    applyNewBtn.addEventListener("click", () => this.applyTemplate(true));

    applyActions.append(applyAllBtn, applyNewBtn);
    root.append(applyActions);

    const importExportRow = document.createElement("div");
    importExportRow.className = "template_button_row template_button_row--inset";

    const importBtn = createButton({
      label: localize("da_template_import_btn", "Import templates"),
      size: "sm",
      variant: "secondary",
    });
    importBtn.className = `${importBtn.className} template_button`;

    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = ".json";
    fileInput.style.display = "none";
    fileInput.addEventListener("change", async () => {
      const file = fileInput.files?.[0];
      if (!file) {
        return;
      }

      try {
        const raw = await file.text();
        const payload = JSON.parse(raw);
        await importTemplates(payload, this.props.t, this.session);
      } catch (err) {
        showToast(localize("da_template_import_failed", "Failed to import template: {error}", { error: String(err) }), "error");
      }
    });
    importBtn.addEventListener("click", () => fileInput.click());

    const exportButton = createButton({
      label: localize("da_template_export_btn", "Export templates"),
      size: "sm",
      variant: "secondary",
    });
    exportButton.className = `${exportButton.className} template_button`;
    exportButton.addEventListener("click", () => {
      exportTemplate(this.session.templateConfig);
    });

    importExportRow.append(importBtn, exportButton, fileInput);
    root.append(importExportRow);

    const divider = document.createElement("div");
    divider.className = "template_divider";
    root.append(divider);

    const togglesRow = document.createElement("div");
    togglesRow.className = "template_toggle_rows";

    const stopSwitch = this.createSelectToggleRow(
      togglesRow,
      localize("da_template_stop_on_error", "Stop at first invalid item"),
      (checked) => {
        const config = this.getEffectiveTemplateConfig();
        this.toggleDraft = {
          stopOnError: checked,
          fileNameMatchCaseSensitive: config.fileNameMatchCaseSensitive,
        };
      },
    );

    const matchCaseSwitch = this.createSelectToggleRow(
      togglesRow,
      localize("da_template_match_case", "Match field case"),
      (checked) => {
        const config = this.getEffectiveTemplateConfig();
        this.toggleDraft = {
          stopOnError: config.stopOnError,
          fileNameMatchCaseSensitive: checked,
        };
      },
    );

    root.append(togglesRow);

    const autoCard = document.createElement("div");
    autoCard.className = "template_auto_card";

    const autoTitle = document.createElement("h3");
    autoTitle.className = "template_auto_card_title";
    autoTitle.textContent = localize("da_auto_extract_title", "Smart auto extraction");

    const autoDesc = document.createElement("p");
    autoDesc.className = "template_auto_card_description";
    autoDesc.textContent = localize("da_auto_extract_desc", "The system analyzes imported file formats and extracts variables and related parameters automatically. Suitable for standard IV/CV data formats.");

    autoCard.append(autoTitle, autoDesc);
    root.append(autoCard);

    const spacer = document.createElement("div");
    spacer.className = "template_spacer";
    root.append(spacer);

    return {
      root,
      menuButton,
      deleteButton,
      exportButton,
      stopSwitch,
      matchCaseSwitch,
      autoCard,
    };
  }

  private createSelectToggleRow(
    container: HTMLElement,
    labelText: string,
    onToggle: (checked: boolean) => void,
  ): HTMLButtonElement {
    const row = document.createElement("div");
    row.className = "template_toggle_row";
    const title = document.createElement("div");
    title.className = "template_toggle_title";
    const label = document.createElement("p");
    label.className = "template_toggle_label";
    label.textContent = labelText;
    title.append(label);
    const control = document.createElement("div");
    control.className = "template_toggle_control";
    const toggle = createToggleSwitch(false, onToggle);
    control.append(toggle);
    row.append(title, control);
    container.append(row);
    return toggle;
  }

  private updateSelectContent(): void {
    const refs = this.selectRefs;
    if (!refs) {
      return;
    }

    refs.menuButton.update({
      label: this.getSelectedTemplateLabel(),
      items: () => this.createTemplateActions(),
      menuClassName: "template_select_menu",
      surfaceClassName: "template_select_menu_surface",
      triggerIcon: () => createLxIcon({ icon: lxChevronDown, size: 14 }),
    });

    const isCustomTemplate = Boolean(this.session.selectedTemplateId && this.session.selectedTemplateId !== AUTO_TEMPLATE_ID);
    refs.deleteButton.style.display = isCustomTemplate ? "" : "none";
    const config = this.getEffectiveTemplateConfig();
    refs.exportButton.disabled = !config.name;

    updateSwitch(refs.stopSwitch, {
      checked: config.stopOnError,
    });
    updateSwitch(refs.matchCaseSwitch, {
      checked: config.fileNameMatchCaseSensitive,
    });

    refs.autoCard.style.display = isCustomTemplate ? "none" : "";
  }

  private createSaveContent() {
    const root = document.createElement("div");
    root.className = "template_config_panel_content";

    const form = document.createElement("div");
    form.className = "template_form template_form--save";

    const inputs = {
      name: this.createSaveField(form, localize("da_template_name", "Template name"), "name"),
      xDataStart: this.createSaveField(form, localize("da_template_x_start", "X Start"), "xDataStart"),
      xDataEnd: this.createSaveField(form, localize("da_template_x_end", "X End"), "xDataEnd"),
      yLegendStart: this.createSaveField(form, localize("da_template_y_legend_start", "Legend Start"), "yLegendStart"),
      yLegendCount: this.createSaveField(form, localize("da_template_y_legend_count", "Legend Count"), "yLegendCount"),
    };

    const meta = document.createElement("p");
    meta.className = "template_meta";
    form.append(meta);
    root.append(form);

    const spacer = document.createElement("div");
    spacer.className = "template_spacer";
    root.append(spacer);

    const saveActions = document.createElement("div");
    saveActions.className = "template_save_actions";

    const saveBtn = createButton({
      label: localize("da_save_template", "Save template"),
      size: "md",
      variant: "primary",
    });
    saveBtn.className = `${saveBtn.className} template_save_button`;
    saveBtn.addEventListener("click", () => {
      void this.handleSaveTemplate();
    });

    const cancelBtn = createButton({
      label: localize("da_cancel", "Cancel"),
      size: "md",
      variant: "secondary",
    });
    cancelBtn.className = `${cancelBtn.className} template_save_button template_save_button--secondary`;
    cancelBtn.addEventListener("click", () => {
      this.cancelSaveMode();
    });

    saveActions.append(saveBtn, cancelBtn);
    root.append(saveActions);

    return {
      root,
      inputs,
      meta,
    };
  }

  private createSaveField(
    container: HTMLElement,
    label: string,
    name: "name" | "xDataStart" | "xDataEnd" | "yLegendStart" | "yLegendCount",
  ): HTMLInputElement {
    const field = createField({
      label,
      name,
      value: "",
      onInput: (_fieldName, value) => {
        this.session.setTemplateConfig({
          ...this.session.templateConfig,
          [name]: value,
        });
      },
    });
    container.append(field);
    const input = field.querySelector("input") as HTMLInputElement;
    input.addEventListener("focus", () => {
      this.activePickField = PICKABLE_TEMPLATE_FIELDS.has(name)
        ? name as PickFieldName
        : null;
    });
    return input;
  }

  private updateSaveContent(): void {
    const refs = this.saveRefs;
    if (!refs) {
      return;
    }

    const config = this.getEffectiveTemplateConfig();
    const values: Record<keyof typeof refs.inputs, string> = {
      name: config.name,
      xDataStart: config.xDataStart,
      xDataEnd: config.xDataEnd,
      yLegendStart: config.yLegendStart,
      yLegendCount: config.yLegendCount,
    };

    for (const [key, input] of Object.entries(refs.inputs) as Array<[keyof typeof refs.inputs, HTMLInputElement]>) {
      if (input.value !== values[key]) {
        input.value = values[key];
      }
    }

    refs.meta.textContent = localize("da_template_file_count", "{count} file(s) imported", { count: this.props.rawData?.length ?? 0 });
  }

  private getSelectedTemplateLabel(): string {
    if (!this.session.selectedTemplateId || this.session.selectedTemplateId === AUTO_TEMPLATE_ID) {
      return localize("da_template_auto_extraction", "Auto extraction");
    }

    const found = cachedTemplates?.find((template: any) => template.id === this.session.selectedTemplateId);
    return found?.name || this.session.selectedTemplateId;
  }

  private createTemplateActions(): IAction[] {
    const selectedTemplateId = this.session.selectedTemplateId;
    const actions: IAction[] = [
      createMenuAction({
        id: "template.select.auto",
        label: localize("da_template_auto_extraction", "Auto extraction"),
        left: createMenuItemLabel(localize("da_template_auto_extraction", "Auto extraction")),
        run: () => this.selectTemplate(AUTO_TEMPLATE_ID),
        selected: (selectedTemplateId || AUTO_TEMPLATE_ID) === AUTO_TEMPLATE_ID,
        tabIndex: 0,
        value: AUTO_TEMPLATE_ID,
      }),
    ];

    const templates = cachedTemplates ?? [];
    if (templates.length > 0) {
      actions.push(new Separator());
    }

    for (const template of templates) {
      const templateId = String(template.id ?? "");
      if (!templateId) {
        continue;
      }

      actions.push(createMenuAction({
        id: `template.select.${templateId}`,
        label: template.name || templateId,
        left: createMenuItemLabel(template.name || templateId),
        run: () => this.selectTemplate(templateId),
        rightAction: {
          icon: () => createLxIcon({ icon: lxEdit, size: 14 }),
          label: localize("da_template_edit", "Edit template"),
          onClick: () => this.editTemplate(template),
        },
        selected: selectedTemplateId === templateId,
        tabIndex: 0,
        value: templateId,
      }));
    }

    actions.push(
      new Separator(),
      createMenuAction({
        id: "template.create",
        label: localize("da_template_create_new", "Create new template..."),
        className: "template_select_menu_create",
        left: createMenuItemLabel(
          localize("da_template_create_new", "Create new template..."),
          () => createLxIcon({ icon: lxAdd, size: 14 }),
        ),
        run: () => this.createTemplateDraft(),
        tabIndex: 0,
      }),
    );

    return actions;
  }

  private createTemplateDraft(): void {
    const config = this.getEffectiveTemplateConfig();
    this.session.setSelectedTemplateId(null);
    this.session.setTemplateConfig(createEmptyTemplateConfig({
      stopOnError: config.stopOnError,
      fileNameMatchCaseSensitive: config.fileNameMatchCaseSensitive,
    }));
    this.toggleDraft = {
      stopOnError: config.stopOnError,
      fileNameMatchCaseSensitive: config.fileNameMatchCaseSensitive,
    };
    this.session.setTemplateMode("save");
    defaultSessionModel.emitChange();
  }

  private editTemplate(template: Partial<TemplateConfig> & { readonly id?: string }): void {
    const templateId = String(template.id ?? "");
    if (!templateId) {
      return;
    }

    this.session.setSelectedTemplateId(templateId);
    this.session.setTemplateConfig(cloneTemplateConfig(template));
    this.toggleDraft = {
      stopOnError: Boolean(template.stopOnError),
      fileNameMatchCaseSensitive: Boolean(template.fileNameMatchCaseSensitive),
    };
    this.session.setTemplateMode("save");
    defaultSessionModel.emitChange();
  }

  private selectTemplate(templateId: string): void {
    const config = this.getEffectiveTemplateConfig();
    if (templateId === AUTO_TEMPLATE_ID) {
      this.session.setSelectedTemplateId(AUTO_TEMPLATE_ID);
      this.session.setTemplateConfig(createEmptyTemplateConfig({
        stopOnError: config.stopOnError,
        fileNameMatchCaseSensitive: config.fileNameMatchCaseSensitive,
      }));
      this.toggleDraft = {
        stopOnError: config.stopOnError,
        fileNameMatchCaseSensitive: config.fileNameMatchCaseSensitive,
      };
    } else {
      const found = cachedTemplates?.find((template: any) => template.id === templateId);
      if (found) {
        this.session.setSelectedTemplateId(found.id);
        this.session.setTemplateConfig(cloneTemplateConfig(found));
        this.toggleDraft = {
          stopOnError: Boolean(found.stopOnError),
          fileNameMatchCaseSensitive: Boolean(found.fileNameMatchCaseSensitive),
        };
      }
    }
    defaultSessionModel.emitChange();
  }

  private applyTemplate(incremental: boolean): void {
    const config = this.getEffectiveTemplateConfig();
    const selectedTemplateId = this.session.selectedTemplateId;
    if (selectedTemplateId === AUTO_TEMPLATE_ID || !selectedTemplateId) {
      if (incremental) {
        this.props.onTemplateAppliedIncremental?.({ ...config, autoExtractionMode: true });
      } else {
        this.props.onTemplateApplied?.({ ...config, autoExtractionMode: true });
      }
      return;
    }

    const validation = validateTemplateForApply(config, this.props.t as any);
    if (!validation.ok || !validation.normalized) {
      showToast(validation.message || localize("da_template_invalid_configuration", "Invalid configuration"), "warning");
      return;
    }

    if (incremental) {
      this.props.onTemplateAppliedIncremental?.({ ...validation.normalized });
    } else {
      this.props.onTemplateApplied?.({ ...validation.normalized });
    }
  }

  private async handleSaveTemplate(): Promise<void> {
    const config = this.getEffectiveTemplateConfig();
    const name = config.name.trim();
    if (!name) {
      showToast(localize("da_template_name_required", "Please enter a template name."), "warning");
      return;
    }

    const validation = validateTemplateForSave(config, this.props.t as any);
    if (!validation.ok || !validation.normalized) {
      showToast(validation.message || localize("da_template_invalid_configuration", "Invalid configuration"), "warning");
      return;
    }

    try {
      const persistedTemplate = {
        ...validation.normalized,
        name,
      };
      const savedRaw = await analysisStoreClient.createDeviceAnalysisTemplate({
        ...persistedTemplate,
      });
      const saved = savedRaw as any;

      if (cachedTemplates) {
        cachedTemplates = [saved, ...cachedTemplates.filter((template: any) => template.id !== saved.id && toTemplateNameKey(template.name) !== toTemplateNameKey(saved.name))];
      } else {
        cachedTemplates = [saved];
      }

      this.session.setSelectedTemplateId(saved.id);
      this.session.setTemplateConfig(cloneTemplateConfig(saved));
      this.toggleDraft = {
        stopOnError: saved.stopOnError,
        fileNameMatchCaseSensitive: saved.fileNameMatchCaseSensitive,
      };
      this.session.setTemplateMode("select");
      showToast(localize("da_template_saved", "Template saved"), "success");
      defaultSessionModel.emitChange();
    } catch (err) {
      showToast(localize("da_template_save_failed", "Failed to save template: {error}", { error: String(err) }), "error");
    }
  }

  private cancelSaveMode(): void {
    const config = this.getEffectiveTemplateConfig();
    this.session.setTemplateMode("select");
    if (this.session.selectedTemplateId && this.session.selectedTemplateId !== AUTO_TEMPLATE_ID && cachedTemplates) {
      const found = cachedTemplates.find((template: any) => template.id === this.session.selectedTemplateId);
      if (found) {
        this.session.setTemplateConfig(cloneTemplateConfig(found));
        this.toggleDraft = {
          stopOnError: Boolean(found.stopOnError),
          fileNameMatchCaseSensitive: Boolean(found.fileNameMatchCaseSensitive),
        };
      }
    } else {
      this.session.setTemplateConfig(createEmptyTemplateConfig({
        stopOnError: config.stopOnError,
        fileNameMatchCaseSensitive: config.fileNameMatchCaseSensitive,
      }));
      this.toggleDraft = {
        stopOnError: config.stopOnError,
        fileNameMatchCaseSensitive: config.fileNameMatchCaseSensitive,
      };
    }
    defaultSessionModel.emitChange();
  }
}

const TemplateManager = (options: TemplateElementOptions): any =>
  createTemplateElement(options);

export default TemplateManager;
