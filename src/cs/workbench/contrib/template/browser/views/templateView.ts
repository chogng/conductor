/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import {
  createMenuAction,
  createMenuItemLabel,
} from "src/cs/base/browser/ui/menu/menu";
import { Separator, type IAction } from "src/cs/base/common/actions";
import { LxIcon } from "src/cs/base/common/lxicon";
import { localize } from "src/cs/nls";
import type { SessionFile } from "src/cs/workbench/services/session/common/sessionTypes";
import {
  createEmptyTemplateConfig,
  cloneTemplateConfig,
  normalizeTemplateConfigRecord,
  toTemplateNameKey,
  type TemplateConfig,
} from "src/cs/workbench/services/template/common/templateConfigUtils";
import { notificationService } from "src/cs/workbench/services/notification/common/notificationService";
import {
  validateTemplateForSave,
  validateTemplateForApply,
} from "src/cs/workbench/services/template/common/templateValidation";
import {
  AUTO_TEMPLATE_CONFIG_FIELD,
  AUTO_TEMPLATE_ID,
  isAutoTemplateId,
} from "src/cs/workbench/services/template/common/autoTemplate";
import type {
  ITemplateService,
  TemplateMode,
  TemplateRecord,
} from "src/cs/workbench/services/template/common/template";
import type { IContextMenuService } from "src/cs/platform/contextview/browser/contextView";
import type { TemplateImportController } from "src/cs/workbench/services/template/browser/templateImportController";
import type { TableModel, TableSelection } from "src/cs/workbench/services/table/common/table";
import { toColumnLabel } from "src/cs/workbench/services/template/common/templateCellRef";
import { TemplateApplyView } from "src/cs/workbench/contrib/template/browser/views/templateApplyView";
import {
  TemplateEditorView,
  type TemplatePickFieldName,
} from "src/cs/workbench/contrib/template/browser/views/templateEditorView";
import {
  areTableCellsEqual,
  areColumnIndexesEqual,
  normalizeColumnIndexes,
  resolveTemplateCellSelection,
  resolveTemplateCellSelectionUpdate,
  resolveTemplateColumnSelectionUpdate,
} from "src/cs/workbench/contrib/template/browser/templateSelection";

import "src/cs/workbench/contrib/template/browser/views/media/templateView.css";

export type TemplateViewOptions = {
  readonly contextMenuService: Pick<IContextMenuService, "showContextMenu">;
  readonly templateImportController: TemplateImportController;
  readonly templateService: ITemplateService;
  rawFiles?: SessionFile[];
  tableModel?: Pick<
    TableModel,
    | "clearHighlight"
    | "getSelection"
    | "onDidChangeSelection"
    | "setSelection"
  >;
  onTemplateApplied?: (config: Record<string, unknown>) => unknown;
  onTemplateAppliedIncremental?: (config: Record<string, unknown>) => unknown;
  conductorSettings?: Record<string, unknown> | null;
  onUpdateSettings?: (updates: Record<string, unknown>) => Promise<unknown> | unknown;
};

let cachedTemplates: TemplateRecord[] | null = null;
let templatesLoading = false;
type PickFieldName = TemplatePickFieldName;
const TEMPLATE_TOAST_ID = "template.notification";

const showToast = (message: string, type: "success" | "error" | "warning" | "info" = "success") => {
  notificationService.showToast({ id: TEMPLATE_TOAST_ID, message, type });
};

export type TemplateApplyStateInput = {
  readonly config: TemplateConfig;
  readonly selectedTemplateId: string | null;
  readonly stopOnErrorDraft: boolean | null;
  readonly templates: readonly TemplateRecord[] | null;
};

export const createTemplateApplyViewState = ({
  config,
  selectedTemplateId,
  stopOnErrorDraft,
  templates,
}: TemplateApplyStateInput) => {
  const effectiveConfig = stopOnErrorDraft === null
    ? config
    : {
        ...config,
        stopOnError: stopOnErrorDraft,
      };
  const isCustomTemplate = Boolean(
    selectedTemplateId && !isAutoTemplateId(selectedTemplateId),
  );
  const selectedTemplateLabel =
    !selectedTemplateId || isAutoTemplateId(selectedTemplateId)
      ? localize("template_auto_extraction", "Auto extraction")
      : templates?.find((template) => template.id === selectedTemplateId)?.name ||
        selectedTemplateId;

  return {
    canDeleteTemplate: isCustomTemplate,
    canExportTemplate: Boolean(effectiveConfig.name),
    selectedTemplateLabel,
    stopOnError: effectiveConfig.stopOnError,
  };
};

const importTemplates = async (
  payload: unknown,
  templateService: ITemplateService,
) => {
  const entry = payload && typeof payload === "object"
    ? payload as Record<string, unknown>
    : {};
  
  const draft = normalizeTemplateConfigRecord(entry);
  if (!draft.name) {
    showToast(localize("template_import_invalid_format", "Invalid template file format."), "warning");
    return;
  }

  if (cachedTemplates) {
    const nameKey = toTemplateNameKey(draft.name);
    const conflict = cachedTemplates.some((template) => toTemplateNameKey(template.name) === nameKey);
    if (conflict) {
      let suffix = 1;
      let newName = `${draft.name}(${suffix})`;
      while (cachedTemplates.some((template) => toTemplateNameKey(template.name) === toTemplateNameKey(newName))) {
        suffix++;
        newName = `${draft.name}(${suffix})`;
      }
      const confirmMessage = localize(
        "template_import_conflict",
        "Template \"{name}\" already exists.\nOK: import as \"{newName}\".\nCancel: overwrite the existing template.",
        { name: draft.name, newName },
      );
      const shouldRename = typeof window !== "undefined" && typeof window.confirm === "function" ? window.confirm(confirmMessage) : true;
      if (shouldRename) {
        draft.name = newName;
      } else {
        const confTemplate = cachedTemplates.find((template) => toTemplateNameKey(template.name) === nameKey);
        if (confTemplate && confTemplate.id) {
          try {
            await templateService.deleteTemplate(confTemplate.id);
          } catch {
            // Best effort: import can still overwrite by name in storage.
          }
        }
      }
    }
  }

  const validation = validateTemplateForSave(draft);
  if (!validation.ok || !validation.normalized) {
    showToast(validation.message || localize("template_invalid_configuration", "Invalid configuration"), "warning");
    return;
  }

  try {
    const saved = await templateService.saveTemplate({
      ...validation.normalized,
      name: draft.name,
    });
    if (cachedTemplates) {
      cachedTemplates = [saved, ...cachedTemplates.filter((template) => template.id !== saved.id && toTemplateNameKey(template.name) !== toTemplateNameKey(saved.name))];
    } else {
      cachedTemplates = [saved];
    }
    
    templateService.updateState({
      selectedTemplateId: typeof saved.id === "string" ? saved.id : null,
      formState: cloneTemplateConfig(saved),
    });
    showToast(localize("template_imported", "Template imported"), "success");
  } catch (err) {
    showToast(localize("template_import_failed", "Failed to import template: {error}", { error: String(err) }), "error");
  }
};

const exportTemplate = (config: TemplateConfig, templateService: ITemplateService) => {
  if (!config.name) {
    showToast(localize("template_export_requires_selection", "Please select a template to export."), "warning");
    return;
  }
  const payload = {
    version: 1,
    source: "conductor",
    ...config,
  };
  templateService.downloadTemplateBundle(payload);
};

export class TemplateView {
  public readonly element: HTMLElement;
  public readonly configElement: HTMLElement;
  private props: TemplateViewOptions;
  private activePickField: PickFieldName | null = null;
  private disposeTableSelectionListener: (() => void) | null = null;
  private lastTableSelection: TableSelection | null = null;
  private tableModel: TemplateViewOptions["tableModel"] | null = null;
  private mode: "select" | "save" | null = null;
  private stopOnErrorDraft: boolean | null = null;
  private applyView: TemplateApplyView | null = null;
  private editorView: TemplateEditorView | null = null;

  constructor(props: TemplateViewOptions) {
    this.props = props;
    this.element = document.createElement("div");
    this.element.className = "template_view template_view--main";

    this.configElement = document.createElement("div");
    this.configElement.className = "template_view template_view--config";

    this.update(props);
  }

  private readTemplateMode(): TemplateMode {
    return this.props.templateService.getState().mode;
  }

  private readSelectedTemplateId(): string | null {
    return this.props.templateService.getState().selectedTemplateId;
  }

  private readTemplateFormState(): TemplateConfig {
    return this.props.templateService.getState().formState;
  }

  public update(props: TemplateViewOptions): void {
    this.props = props;
    this.bindTableSelection(props.tableModel);

    this.ensureTemplatesLoaded();
    this.syncStopOnErrorDraft();

    const nextMode = this.readTemplateMode();
    if (this.mode !== nextMode) {
      this.mode = nextMode;
      if (nextMode === "select") {
        this.activePickField = null;
        this.syncTableActiveCell();
      }
      this.configElement.replaceChildren(nextMode === "select" ? this.getApplyView().element : this.getEditorView().element);
    }
    this.syncTableSelectionState();

    if (nextMode === "select") {
      this.updateApplyView();
      return;
    }

    this.updateEditorView();
  }

  public dispose(): void {
    this.disposeTableSelectionListener?.();
    this.disposeTableSelectionListener = null;
    this.tableModel?.clearHighlight();
    this.applyView?.dispose();
    this.editorView?.dispose();
    this.applyView = null;
    this.editorView = null;
    this.configElement.replaceChildren();
    this.configElement.remove();
    this.element.replaceChildren();
    this.element.remove();
  }

  private getEffectiveTemplateFormState(): TemplateConfig {
    const config = this.readTemplateFormState();
    if (this.stopOnErrorDraft === null) {
      return config;
    }

    return {
      ...config,
      stopOnError: this.stopOnErrorDraft,
    };
  }

  private bindTableSelection(tableModel: TemplateViewOptions["tableModel"]): void {
    if (this.tableModel === tableModel) {
      return;
    }

    this.disposeTableSelectionListener?.();
    this.disposeTableSelectionListener = null;
    this.tableModel?.clearHighlight();
    this.lastTableSelection = null;
    this.tableModel = tableModel ?? null;

    if (!tableModel) {
      return;
    }

    this.lastTableSelection = tableModel.getSelection();
    this.disposeTableSelectionListener = tableModel.onDidChangeSelection((selection) => {
      const previous = this.lastTableSelection;
      this.lastTableSelection = selection;

      if (!areColumnIndexesEqual(previous?.selectedColumns, selection.selectedColumns)) {
        this.updateTemplateFormState(resolveTemplateColumnSelectionUpdate(selection));
      }

      if (!areTableCellsEqual(previous?.activeCell, selection.activeCell)) {
        this.updateTemplateFormState(resolveTemplateCellSelectionUpdate(selection.activeCell, this.activePickField));
      }
    });
  }

  private updateTemplateFormState(updates: Partial<TemplateConfig>): void {
    const current = this.getEffectiveTemplateFormState();
    let changed = false;
    const next: TemplateConfig = {
      ...current,
      ...updates,
    };

    if (Array.isArray(updates.yColumns)) {
      changed = !areColumnIndexesEqual(current.yColumns, updates.yColumns);
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

    this.stopOnErrorDraft = next.stopOnError;
    this.props.templateService.setFormState(next);
    this.syncTableSelectionState();
    this.updateEditorView();
  }

  private syncTableSelectionState(): void {
    const columns = normalizeColumnIndexes(this.getEffectiveTemplateFormState().yColumns);
    this.syncTableSelectedColumns(columns);
    this.syncTableActiveCell();
  }

  private syncTableSelectedColumns(columns: readonly number[]): void {
    const selection = this.tableModel?.getSelection();
    if (!selection || areColumnIndexesEqual(selection.selectedColumns, columns)) {
      return;
    }

    this.tableModel?.setSelection({
      ...selection,
      selectedColumns: columns,
    });
  }

  private syncTableActiveCell(options: { clearInvalid?: boolean } = {}): void {
    const tableModel = this.tableModel;
    if (!tableModel) {
      return;
    }

    const selection = tableModel.getSelection();
    const activeCell = resolveTemplateCellSelection(
      this.getEffectiveTemplateFormState(),
      this.activePickField,
      selection.activeCell,
    );

    if (!activeCell) {
      tableModel.clearHighlight();
      if (options.clearInvalid && selection.activeCell) {
        tableModel.setSelection({
          ...selection,
          activeCell: null,
        });
      }
      return;
    }

    if (areTableCellsEqual(selection.activeCell, activeCell)) {
      return;
    }

    tableModel.setSelection({
      ...selection,
      activeCell,
    });
  }

  private syncStopOnErrorDraft(): void {
    const config = this.readTemplateFormState();
    if (this.stopOnErrorDraft === null) {
      this.stopOnErrorDraft = config.stopOnError;
      return;
    }

    if (this.mode !== "select") {
      this.stopOnErrorDraft = config.stopOnError;
    }
  }

  private ensureTemplatesLoaded(): void {
    if (cachedTemplates !== null || templatesLoading) {
      return;
    }

    templatesLoading = true;
    this.props.templateService.getTemplates()
      .then((remote) => {
        cachedTemplates = remote;
        templatesLoading = false;
        this.updateApplyView();
        this.updateEditorView();
      })
      .catch((err) => {
        templatesLoading = false;
        showToast(
          localize("loadTemplatesFailed", "Failed to load templates: {error}", {
            error: err instanceof Error ? err.message : String(err),
          }),
          "error",
        );
      });
  }

  private getApplyView(): TemplateApplyView {
    if (!this.applyView) {
      this.applyView = new TemplateApplyView({
        contextMenuService: this.props.contextMenuService,
        createTemplateActions: () => this.createTemplateActions(),
        onApplyTemplate: (incremental) => this.applyTemplate(incremental),
        onDeleteTemplate: () => {
          void this.deleteSelectedTemplate();
        },
        onExportTemplate: () => exportTemplate(this.readTemplateFormState(), this.props.templateService),
        onStopOnErrorChange: (checked) => this.updateApplyOptions({ stopOnError: checked }),
      }, this.getApplyViewState());
    }

    return this.applyView;
  }

  private updateApplyView(): void {
    this.applyView?.update(this.getApplyViewState());
  }

  private getApplyViewState() {
    return createTemplateApplyViewState({
      config: this.readTemplateFormState(),
      selectedTemplateId: this.readSelectedTemplateId(),
      stopOnErrorDraft: this.stopOnErrorDraft,
      templates: cachedTemplates,
    });
  }

  private getEditorView(): TemplateEditorView {
    if (!this.editorView) {
      this.editorView = new TemplateEditorView({
        contextMenuService: this.props.contextMenuService,
        onCancel: () => this.cancelSaveMode(),
        onClearYColumns: () => this.clearYColumns(),
        onPickFieldFocus: (field) => {
          this.activePickField = field;
          this.syncTableActiveCell({ clearInvalid: Boolean(field) });
          this.updateEditorView();
        },
        onSave: () => {
          void this.handleSaveTemplate();
        },
        onUpdateConfig: (updates) => this.updateTemplateFormState(updates),
      }, this.getEditorViewState());
    }

    return this.editorView;
  }

  private updateEditorView(): void {
    this.editorView?.update(this.getEditorViewState());
  }

  private clearYColumns(): void {
    this.updateTemplateFormState({ yColumns: [] });
    const selection = this.tableModel?.getSelection();
    if (!selection || !selection.selectedColumns?.length) {
      return;
    }

    this.tableModel?.setSelection({
      ...selection,
      selectedColumns: [],
    });
  }

  private getEditorViewState() {
    const config = this.getEffectiveTemplateFormState();
    return {
      activePickField: this.activePickField,
      config,
      selectedYColumnLabels: normalizeColumnIndexes(config.yColumns).map((column) => toColumnLabel(column)),
    };
  }

  private updateApplyOptions(updates: Partial<Pick<TemplateConfig, "stopOnError">>): void {
    const config = this.getEffectiveTemplateFormState();
    this.stopOnErrorDraft = updates.stopOnError ?? config.stopOnError;
    this.updateApplyView();
    this.updateEditorView();
  }

  private async deleteSelectedTemplate(): Promise<void> {
    const selectedTemplateId = this.readSelectedTemplateId();
    const templateFormState = this.readTemplateFormState();
    if (!selectedTemplateId) {
      return;
    }

    const confirmMsg = localize("template_delete_confirm", "Delete template \"{name}\"?", { name: templateFormState.name });
    if (typeof window !== "undefined" && typeof window.confirm === "function" && !window.confirm(confirmMsg)) {
      return;
    }

    try {
      await this.props.templateService.deleteTemplate(selectedTemplateId);
      if (cachedTemplates) {
        cachedTemplates = cachedTemplates.filter((template) => template.id !== selectedTemplateId);
      }
      const config = this.getEffectiveTemplateFormState();
      this.stopOnErrorDraft = config.stopOnError;
      this.props.templateService.updateState({
        selectedTemplateId: AUTO_TEMPLATE_ID,
        formState: createEmptyTemplateConfig({
          stopOnError: templateFormState.stopOnError,
        }),
      });
      showToast(localize("template_deleted", "Template deleted"), "success");
    } catch (err) {
      showToast(localize("template_delete_failed", "Failed to delete template: {error}", { error: String(err) }), "error");
    }
  }

  private createTemplateActions(): IAction[] {
    const selectedTemplateId = this.readSelectedTemplateId();
    const actions: IAction[] = [
      createMenuAction({
        checked: isAutoTemplateId(selectedTemplateId || AUTO_TEMPLATE_ID),
        id: "template.select.auto",
        label: localize("template_auto_extraction", "Auto extraction"),
        left: createMenuItemLabel(localize("template_auto_extraction", "Auto extraction")),
        run: () => this.selectTemplate(AUTO_TEMPLATE_ID),
        selected: isAutoTemplateId(selectedTemplateId || AUTO_TEMPLATE_ID),
        tabIndex: 0,
        value: AUTO_TEMPLATE_ID,
      }),
    ];

    const templates = cachedTemplates ?? [];
    for (const template of templates) {
      const templateId = String(template.id ?? "");
      if (!templateId) {
        continue;
      }

      actions.push(createMenuAction({
        checked: selectedTemplateId === templateId,
        id: `template.select.${templateId}`,
        label: template.name || templateId,
        left: createMenuItemLabel(template.name || templateId),
        run: () => this.selectTemplate(templateId),
        rightAction: {
          icon: LxIcon.edit,
          label: localize("template_edit", "Edit template"),
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
        label: localize("template_create_new", "New Template..."),
        className: "template_picker_menu_create",
        left: createMenuItemLabel(localize("template_create_new", "New Template..."), LxIcon.add),
        run: () => this.createTemplateDraft(),
        tabIndex: 0,
      }),
      createMenuAction({
        id: "template.import",
        label: localize("template_import_btn", "Import templates"),
        left: createMenuItemLabel(localize("template_import_btn", "Import templates"), LxIcon.download),
        run: () => this.promptTemplateImport(),
        tabIndex: 0,
      }),
    );

    return actions;
  }

  private promptTemplateImport(): void {
    void this.importTemplateFromDialog();
  }

  private async importTemplateFromDialog(): Promise<void> {
    try {
      await this.props.templateImportController.importTemplateFromDialog(
        (payload) => importTemplates(
          payload,
          this.props.templateService,
        ),
      );
    } catch (err) {
      showToast(localize("template_import_failed", "Failed to import template: {error}", { error: String(err) }), "error");
    }
  }

  private createTemplateDraft(): void {
    const config = this.getEffectiveTemplateFormState();
    this.stopOnErrorDraft = config.stopOnError;
    this.props.templateService.updateState({
      selectedTemplateId: null,
      formState: createEmptyTemplateConfig({
        stopOnError: config.stopOnError,
      }),
      mode: "save",
    });
  }

  private editTemplate(template: TemplateRecord): void {
    const templateId = String(template.id ?? "");
    if (!templateId) {
      return;
    }

    this.stopOnErrorDraft = Boolean(template.stopOnError);
    this.props.templateService.updateState({
      selectedTemplateId: templateId,
      formState: cloneTemplateConfig(template),
      mode: "save",
    });
  }

  private selectTemplate(templateId: string): void {
    const config = this.getEffectiveTemplateFormState();
    if (isAutoTemplateId(templateId)) {
      this.stopOnErrorDraft = config.stopOnError;
      this.props.templateService.updateState({
        selectedTemplateId: AUTO_TEMPLATE_ID,
        formState: createEmptyTemplateConfig({
          stopOnError: config.stopOnError,
        }),
      });
    } else {
      const found = cachedTemplates?.find((template) => template.id === templateId);
      if (found) {
        this.stopOnErrorDraft = Boolean(found.stopOnError);
        this.props.templateService.updateState({
          selectedTemplateId: typeof found.id === "string" ? found.id : null,
          formState: cloneTemplateConfig(found),
        });
      }
    }
  }

  private applyTemplate(incremental: boolean): void {
    const config = this.getEffectiveTemplateFormState();
    const selectedTemplateId = this.readSelectedTemplateId();
    if (!selectedTemplateId || isAutoTemplateId(selectedTemplateId)) {
      if (incremental) {
        this.props.onTemplateAppliedIncremental?.({ ...config, [AUTO_TEMPLATE_CONFIG_FIELD]: true });
      } else {
        this.props.onTemplateApplied?.({ ...config, [AUTO_TEMPLATE_CONFIG_FIELD]: true });
      }
      return;
    }

    const validation = validateTemplateForApply(config);
    if (!validation.ok || !validation.normalized) {
      showToast(validation.message || localize("template_invalid_configuration", "Invalid configuration"), "warning");
      return;
    }

    if (incremental) {
      this.props.onTemplateAppliedIncremental?.({ ...validation.normalized });
    } else {
      this.props.onTemplateApplied?.({ ...validation.normalized });
    }
  }

  private async handleSaveTemplate(): Promise<void> {
    const config = this.getEffectiveTemplateFormState();
    const name = config.name.trim();
    if (!name) {
      showToast(localize("template_name_required", "Please enter a template name."), "warning");
      return;
    }

    const validation = validateTemplateForSave(config);
    if (!validation.ok || !validation.normalized) {
      showToast(validation.message || localize("template_invalid_configuration", "Invalid configuration"), "warning");
      return;
    }

    try {
      const persistedTemplate = {
        ...validation.normalized,
        name,
      };
      const saved = await this.props.templateService.saveTemplate({
        ...persistedTemplate,
      });

      if (cachedTemplates) {
        cachedTemplates = [saved, ...cachedTemplates.filter((template) => template.id !== saved.id && toTemplateNameKey(template.name) !== toTemplateNameKey(saved.name))];
      } else {
        cachedTemplates = [saved];
      }

      this.stopOnErrorDraft = Boolean(saved.stopOnError);
      this.props.templateService.updateState({
        selectedTemplateId: typeof saved.id === "string" ? saved.id : null,
        formState: cloneTemplateConfig(saved),
        mode: "select",
      });
      showToast(localize("template_saved", "Template saved"), "success");
    } catch (err) {
      showToast(localize("template_save_failed", "Failed to save template: {error}", { error: String(err) }), "error");
    }
  }

  private cancelSaveMode(): void {
    const config = this.getEffectiveTemplateFormState();
    const selectedTemplateId = this.readSelectedTemplateId();
    if (
      selectedTemplateId &&
      !isAutoTemplateId(selectedTemplateId) &&
      cachedTemplates
    ) {
      const found = cachedTemplates.find((template) => template.id === selectedTemplateId);
      if (found) {
        this.stopOnErrorDraft = Boolean(found.stopOnError);
        this.props.templateService.updateState({
          mode: "select",
          formState: cloneTemplateConfig(found),
        });
        return;
      }
    }

    this.stopOnErrorDraft = config.stopOnError;
    this.props.templateService.updateState({
      mode: "select",
      formState: createEmptyTemplateConfig({
        stopOnError: config.stopOnError,
      }),
    });
  }
}

