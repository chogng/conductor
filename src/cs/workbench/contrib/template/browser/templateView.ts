import {
  createMenuAction,
  createMenuItemLabel,
} from "src/cs/base/browser/ui/menu/menu";
import { Separator, type IAction } from "src/cs/base/common/actions";
import {
  lxAdd,
  lxDownload,
  lxEdit,
} from "src/cs/base/common/lxicon";
import { localize } from "src/cs/nls";
import type { SessionFile } from "src/cs/workbench/contrib/session/common/sessionTypes";
import {
  createEmptyTemplateConfig,
  cloneTemplateConfig,
  normalizeTemplateConfigRecord,
  toTemplateNameKey,
  type TemplateConfig,
} from "src/cs/workbench/contrib/template/common/templateManagerUtils";
import { getSession, defaultSessionModel } from "src/cs/workbench/contrib/session/browser/useSession";
import { notificationService } from "src/cs/workbench/services/notification/common/notificationService";
import {
  validateTemplateForSave,
  validateTemplateForApply,
} from "src/cs/workbench/contrib/template/common/templateValidation";
import {
  AUTO_TEMPLATE_CONFIG_FIELD,
  AUTO_TEMPLATE_ID,
  isAutoTemplateId,
} from "src/cs/workbench/contrib/template/common/autoTemplate";
import type {
  ITemplateService,
  TemplateRecord,
} from "src/cs/workbench/contrib/template/common/template";
import type { IContextMenuService } from "src/cs/platform/contextview/browser/contextView";
import type { TemplateImportController } from "src/cs/workbench/contrib/template/browser/templateImportController";
import type {
  TableModel,
  TableSelection,
} from "src/cs/workbench/contrib/table/common/tableService";
import { TemplateApplyView } from "src/cs/workbench/contrib/template/browser/templateApplyView";
import {
  TemplateEditorView,
  type TemplatePickFieldName,
} from "src/cs/workbench/contrib/template/browser/templateEditorView";

export type TemplateElementOptions = {
  readonly contextMenuService: Pick<IContextMenuService, "showContextMenu">;
  readonly importSessionElement?: HTMLElement | null;
  readonly templateImportController: TemplateImportController;
  readonly templateService: ITemplateService;
  sourceFiles?: SessionFile[];
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

let cachedTemplates: TemplateRecord[] | null = null;
let templatesLoading = false;
type PickFieldName = TemplatePickFieldName;
const TEMPLATE_TOAST_ID = "template.notification";

const showToast = (message: string, type: "success" | "error" | "warning" | "info" = "success") => {
  notificationService.showToast({ id: TEMPLATE_TOAST_ID, message, type });
};

const importTemplates = async (
  payload: unknown,
  session: ReturnType<typeof getSession>,
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
        "da_template_import_conflict",
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
    
    session.setSelectedTemplateId(typeof saved.id === "string" ? saved.id : null);
    session.setTemplateConfig(cloneTemplateConfig(saved));
    showToast(localize("template_imported", "Template imported"), "success");
    defaultSessionModel.emitChange();
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
  private applyView: TemplateApplyView | null = null;
  private editorView: TemplateEditorView | null = null;

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
      this.left.replaceChildren(nextMode === "select" ? this.getApplyView().element : this.getEditorView().element);
    }

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
    this.props.templateService.getTemplates()
      .then((remote) => {
        cachedTemplates = remote;
        templatesLoading = false;
        defaultSessionModel.emitChange();
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
        onExportTemplate: () => exportTemplate(this.session.templateConfig, this.props.templateService),
        onMatchCaseChange: (checked) => this.updateApplyOptions({ fileNameMatchCaseSensitive: checked }),
        onStopOnErrorChange: (checked) => this.updateApplyOptions({ stopOnError: checked }),
      }, this.getApplyViewState());
    }

    return this.applyView;
  }

  private updateApplyView(): void {
    this.applyView?.update(this.getApplyViewState());
  }

  private getApplyViewState() {
    const config = this.getEffectiveTemplateConfig();
    const isCustomTemplate = Boolean(
      this.session.selectedTemplateId && !isAutoTemplateId(this.session.selectedTemplateId),
    );
    return {
      canDeleteTemplate: isCustomTemplate,
      canExportTemplate: Boolean(config.name),
      fileNameMatchCaseSensitive: config.fileNameMatchCaseSensitive,
      selectedTemplateLabel: this.getSelectedTemplateLabel(),
      stopOnError: config.stopOnError,
    };
  }

  private getEditorView(): TemplateEditorView {
    if (!this.editorView) {
      this.editorView = new TemplateEditorView({
        contextMenuService: this.props.contextMenuService,
        onCancel: () => this.cancelSaveMode(),
        onPickFieldFocus: (field) => {
          this.activePickField = field;
        },
        onSave: () => {
          void this.handleSaveTemplate();
        },
        onUpdateConfig: (updates) => this.updateTemplateConfig(updates),
      }, this.getEditorViewState());
    }

    return this.editorView;
  }

  private updateEditorView(): void {
    this.editorView?.update(this.getEditorViewState());
  }

  private getEditorViewState() {
    const config = this.getEffectiveTemplateConfig();
    return {
      config,
      selectedYColumnLabels: normalizeColumnIndexes(config.yColumns).map((column) => toColumnLabel(column)),
    };
  }

  private updateApplyOptions(updates: Partial<Pick<TemplateConfig, "stopOnError" | "fileNameMatchCaseSensitive">>): void {
    const config = this.getEffectiveTemplateConfig();
    this.toggleDraft = {
      stopOnError: updates.stopOnError ?? config.stopOnError,
      fileNameMatchCaseSensitive: updates.fileNameMatchCaseSensitive ?? config.fileNameMatchCaseSensitive,
    };
    defaultSessionModel.emitChange();
  }

  private async deleteSelectedTemplate(): Promise<void> {
    const { selectedTemplateId, templateConfig } = this.session;
    if (!selectedTemplateId) {
      return;
    }

    const confirmMsg = localize("template_delete_confirm", "Delete template \"{name}\"?", { name: templateConfig.name });
    if (typeof window !== "undefined" && typeof window.confirm === "function" && !window.confirm(confirmMsg)) {
      return;
    }

    try {
      await this.props.templateService.deleteTemplate(selectedTemplateId);
      if (cachedTemplates) {
        cachedTemplates = cachedTemplates.filter((template) => template.id !== selectedTemplateId);
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
      showToast(localize("template_deleted", "Template deleted"), "success");
      defaultSessionModel.emitChange();
    } catch (err) {
      showToast(localize("template_delete_failed", "Failed to delete template: {error}", { error: String(err) }), "error");
    }
  }

  private getSelectedTemplateLabel(): string {
    if (!this.session.selectedTemplateId || isAutoTemplateId(this.session.selectedTemplateId)) {
      return localize("template_auto_extraction", "Auto extraction");
    }

    const found = cachedTemplates?.find((template) => template.id === this.session.selectedTemplateId);
    return found?.name || this.session.selectedTemplateId;
  }

  private createTemplateActions(): IAction[] {
    const selectedTemplateId = this.session.selectedTemplateId;
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
          icon: lxEdit,
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
        label: localize("template_create_new", "新建模板..."),
        className: "template_picker_menu_create",
        left: createMenuItemLabel(localize("template_create_new", "新建模板..."), lxAdd),
        run: () => this.createTemplateDraft(),
        tabIndex: 0,
      }),
      createMenuAction({
        id: "template.import",
        label: localize("template_import_btn", "Import templates"),
        left: createMenuItemLabel(localize("template_import_btn", "Import templates"), lxDownload),
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
        (payload) => importTemplates(payload, this.session, this.props.templateService),
      );
    } catch (err) {
      showToast(localize("template_import_failed", "Failed to import template: {error}", { error: String(err) }), "error");
    }
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

  private editTemplate(template: TemplateRecord): void {
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
    if (isAutoTemplateId(templateId)) {
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
      const found = cachedTemplates?.find((template) => template.id === templateId);
      if (found) {
        this.session.setSelectedTemplateId(typeof found.id === "string" ? found.id : null);
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
    const config = this.getEffectiveTemplateConfig();
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

      this.session.setSelectedTemplateId(typeof saved.id === "string" ? saved.id : null);
      this.session.setTemplateConfig(cloneTemplateConfig(saved));
      this.toggleDraft = {
        stopOnError: Boolean(saved.stopOnError),
        fileNameMatchCaseSensitive: Boolean(saved.fileNameMatchCaseSensitive),
      };
      this.session.setTemplateMode("select");
      showToast(localize("template_saved", "Template saved"), "success");
      defaultSessionModel.emitChange();
    } catch (err) {
      showToast(localize("template_save_failed", "Failed to save template: {error}", { error: String(err) }), "error");
    }
  }

  private cancelSaveMode(): void {
    const config = this.getEffectiveTemplateConfig();
    this.session.setTemplateMode("select");
    if (
      this.session.selectedTemplateId &&
      !isAutoTemplateId(this.session.selectedTemplateId) &&
      cachedTemplates
    ) {
      const found = cachedTemplates.find((template) => template.id === this.session.selectedTemplateId);
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

const TemplateManager = (options: TemplateElementOptions): HTMLElement =>
  createTemplateElement(options);

export default TemplateManager;
