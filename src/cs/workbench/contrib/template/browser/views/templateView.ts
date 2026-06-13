/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import {
  createMenuAction,
  createMenuItemLabel,
  type MenuItemAction,
} from "src/cs/base/browser/ui/menu/menu";
import { createLxIcon } from "src/cs/base/browser/ui/lxicon/lxicon";
import { Separator, type IAction } from "src/cs/base/common/actions";
import { LxIcon, type LxIconDefinition } from "src/cs/base/common/lxicon";
import { localize } from "src/cs/nls";
import type { ICommandService } from "src/cs/platform/commands/common/commands";
import type { SessionFile } from "src/cs/workbench/services/session/common/sessionTypes";
import {
  createEmptyTemplateConfig,
  cloneTemplateConfig,
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
import { TemplateCommandId } from "src/cs/workbench/services/template/common/template";
import type {
  ITemplateApplyWorkflowService,
  ITemplateService,
  TemplateMode,
  TemplateRecord,
} from "src/cs/workbench/services/template/common/template";
import type { IContextMenuService } from "src/cs/platform/contextview/browser/contextView";
import type { ITableService, TableSelection } from "src/cs/workbench/services/table/common/table";
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
  readonly commandService: Pick<ICommandService, "executeCommand">;
  readonly contextMenuService: Pick<IContextMenuService, "showContextMenu">;
  readonly templateApplyWorkflowService: Pick<
    ITemplateApplyWorkflowService,
    | "applyTemplate"
    | "applyTemplateIncremental"
  >;
  readonly templateService: ITemplateService;
  readonly rawFiles?: SessionFile[];
  readonly tableService?: Pick<
    ITableService,
    | "clearHighlight"
    | "getSelection"
    | "onDidChangeSelection"
    | "select"
  >;
};

let cachedTemplates: TemplateRecord[] | null = null;
let templatesLoading = false;
let cachedTemplatesVersion = -1;
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
      ? localize("template.autoExtraction", "Auto extraction")
      : templates?.find((template) => template.id === selectedTemplateId)?.name ||
        selectedTemplateId;

  return {
    canDeleteTemplate: isCustomTemplate,
    selectedTemplateLabel,
    stopOnError: effectiveConfig.stopOnError,
  };
};

export class TemplateView {
  public readonly element: HTMLElement;
  public readonly configElement: HTMLElement;
  private props: TemplateViewOptions;
  private activePickField: PickFieldName | null = null;
  private disposeTableSelectionListener: (() => void) | null = null;
  private lastTableSelection: TableSelection | null = null;
  private tableService: TemplateViewOptions["tableService"] | null = null;
  private mode: "select" | "save" | null = null;
  private stopOnErrorDraft: boolean | null = null;
  private applyView: TemplateApplyView | null = null;
  private editorView: TemplateEditorView | null = null;
  private stopOnErrorDraftSource: TemplateConfig | null = null;

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
    this.bindTableSelection(props.tableService);

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
    this.tableService?.clearHighlight();
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

  private bindTableSelection(tableService: TemplateViewOptions["tableService"]): void {
    if (this.tableService === tableService) {
      return;
    }

    this.disposeTableSelectionListener?.();
    this.disposeTableSelectionListener = null;
    this.tableService?.clearHighlight();
    this.lastTableSelection = null;
    this.tableService = tableService ?? null;

    if (!tableService) {
      return;
    }

    this.lastTableSelection = tableService.getSelection();
    const disposable = tableService.onDidChangeSelection((selection) => {
      const previous = this.lastTableSelection;
      this.lastTableSelection = selection;

      if (!areColumnIndexesEqual(previous?.selectedColumns, selection.selectedColumns)) {
        this.updateTemplateFormState(resolveTemplateColumnSelectionUpdate(selection));
      }

      if (!areTableCellsEqual(previous?.activeCell, selection.activeCell)) {
        this.updateTemplateFormState(resolveTemplateCellSelectionUpdate(selection.activeCell, this.activePickField));
      }
    });
    this.disposeTableSelectionListener = () => disposable.dispose();
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
    const selection = this.tableService?.getSelection();
    if (!selection || areColumnIndexesEqual(selection.selectedColumns, columns)) {
      return;
    }

    this.tableService?.select({
      kind: "columns",
      columns,
    });
  }

  private syncTableActiveCell(options: { clearInvalid?: boolean } = {}): void {
    const tableService = this.tableService;
    if (!tableService) {
      return;
    }

    const selection = tableService.getSelection();
    const activeCell = resolveTemplateCellSelection(
      this.getEffectiveTemplateFormState(),
      this.activePickField,
      selection.activeCell,
    );

    if (!activeCell) {
      tableService.clearHighlight();
      if (options.clearInvalid && selection.activeCell) {
        tableService.select({
          kind: "cell",
          cell: null,
        });
      }
      return;
    }

    if (areTableCellsEqual(selection.activeCell, activeCell)) {
      return;
    }

    tableService.select({
      kind: "cell",
      cell: activeCell,
    });
  }

  private syncStopOnErrorDraft(): void {
    const config = this.readTemplateFormState();
    if (this.stopOnErrorDraftSource !== config || this.readTemplateMode() !== "select") {
      this.stopOnErrorDraft = config.stopOnError;
      this.stopOnErrorDraftSource = config;
      return;
    }
  }

  private ensureTemplatesLoaded(): void {
    const templateListVersion = this.props.templateService.getState().templateListVersion;
    if ((cachedTemplates !== null && cachedTemplatesVersion === templateListVersion) || templatesLoading) {
      return;
    }

    templatesLoading = true;
    this.props.templateService.getTemplates()
      .then((remote) => {
        cachedTemplates = remote;
        cachedTemplatesVersion = templateListVersion;
        templatesLoading = false;
        this.updateApplyView();
        this.updateEditorView();
      })
      .catch((err) => {
        templatesLoading = false;
        showToast(
          localize("template.loadFailed", "Failed to load templates: {error}", {
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
    const selection = this.tableService?.getSelection();
    if (!selection || !selection.selectedColumns?.length) {
      return;
    }

    this.tableService?.select({
      kind: "columns",
      columns: [],
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
    const templateFormState = this.getEffectiveTemplateFormState();
    if (!selectedTemplateId || isAutoTemplateId(selectedTemplateId)) {
      return;
    }

    await this.props.commandService.executeCommand(TemplateCommandId.deleteTemplate, {
      ...templateFormState,
      id: selectedTemplateId,
    });
  }

  private createTemplateActions(): IAction[] {
    const selectedTemplateId = this.readSelectedTemplateId();
    const actions: IAction[] = [
      createMenuAction({
        id: "template.select.auto",
        label: localize("template.autoExtraction", "Auto extraction"),
        left: createMenuItemLabel(localize("template.autoExtraction", "Auto extraction")),
        run: () => this.selectTemplate(null),
        right: isAutoTemplateId(selectedTemplateId || AUTO_TEMPLATE_ID) ? createTemplateMenuIcon(LxIcon.check) : undefined,
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
        id: `template.select.${templateId}`,
        label: template.name || templateId,
        left: createMenuItemLabel(template.name || templateId),
        run: () => this.selectTemplate(template),
        rightActions: this.createTemplateItemActions(template),
        selected: selectedTemplateId === templateId,
        tabIndex: 0,
        value: templateId,
      }));
    }

    actions.push(
      new Separator(),
      createMenuAction({
        id: "template.create",
        label: localize("template.createNew", "New Template..."),
        className: "template_picker_menu_create",
        left: createMenuItemLabel(localize("template.createNew", "New Template...")),
        right: createTemplateMenuIcon(LxIcon.add),
        run: () => this.createTemplateDraft(),
        tabIndex: 0,
      }),
      createMenuAction({
        id: "template.import",
        label: localize("template.import.button", "Import templates"),
        left: createMenuItemLabel(localize("template.import.button", "Import templates")),
        right: createTemplateMenuIcon(LxIcon.download),
        run: () => {
          void this.props.commandService.executeCommand(TemplateCommandId.importTemplate);
        },
        tabIndex: 0,
      }),
    );

    return actions;
  }

  private createTemplateDraft(): void {
    const config = this.getEffectiveTemplateFormState();
    this.stopOnErrorDraft = config.stopOnError;
    void this.props.commandService.executeCommand(TemplateCommandId.createTemplate, {
      stopOnError: config.stopOnError,
    });
  }

  private createTemplateItemActions(template: TemplateRecord): MenuItemAction[] {
    const templateId = String(template.id ?? "");
    return [
      {
        id: `${TemplateCommandId.editTemplate}.${templateId || "template"}`,
        icon: LxIcon.edit,
        label: localize("template.edit", "Edit template"),
        onClick: () => this.editTemplate(template),
      },
      {
        id: `${TemplateCommandId.exportTemplate}.${templateId || "template"}`,
        icon: LxIcon.download,
        label: localize("template.export.button", "Export templates"),
        onClick: () => this.exportTemplate(template),
      },
    ];
  }

  private editTemplate(template: TemplateRecord): void {
    this.stopOnErrorDraft = Boolean(template.stopOnError);
    void this.props.commandService.executeCommand(TemplateCommandId.editTemplate, template);
  }

  private exportTemplate(template: TemplateRecord | TemplateConfig): void {
    void this.props.commandService.executeCommand(TemplateCommandId.exportTemplate, template);
  }

  private selectTemplate(template: TemplateRecord | null): void {
    const config = this.getEffectiveTemplateFormState();
    if (!template) {
      this.stopOnErrorDraft = config.stopOnError;
      void this.props.commandService.executeCommand(TemplateCommandId.selectTemplate, {
        stopOnError: config.stopOnError,
      });
    } else {
      this.stopOnErrorDraft = Boolean(template.stopOnError);
      void this.props.commandService.executeCommand(TemplateCommandId.selectTemplate, template);
    }
  }

  private applyTemplate(incremental: boolean): void {
    const config = this.getEffectiveTemplateFormState();
    const selectedTemplateId = this.readSelectedTemplateId();
    if (!selectedTemplateId || isAutoTemplateId(selectedTemplateId)) {
      if (incremental) {
        this.props.templateApplyWorkflowService.applyTemplateIncremental({
          ...config,
          [AUTO_TEMPLATE_CONFIG_FIELD]: true,
        });
      } else {
        this.props.templateApplyWorkflowService.applyTemplate({
          ...config,
          [AUTO_TEMPLATE_CONFIG_FIELD]: true,
        });
      }
      return;
    }

    const validation = validateTemplateForApply(config);
    if (!validation.ok || !validation.normalized) {
      showToast(validation.message || localize("template.invalidConfiguration", "Invalid configuration"), "warning");
      return;
    }

    if (incremental) {
      this.props.templateApplyWorkflowService.applyTemplateIncremental({
        ...validation.normalized,
      });
    } else {
      this.props.templateApplyWorkflowService.applyTemplate({
        ...validation.normalized,
      });
    }
  }

  private async handleSaveTemplate(): Promise<void> {
    const config = this.getEffectiveTemplateFormState();
    const name = config.name.trim();
    if (!name) {
      showToast(localize("template.validation.nameRequired", "Please enter a template name."), "warning");
      return;
    }

    const validation = validateTemplateForSave(config);
    if (!validation.ok || !validation.normalized) {
      showToast(validation.message || localize("template.invalidConfiguration", "Invalid configuration"), "warning");
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

      this.stopOnErrorDraft = Boolean(saved.stopOnError);
      this.props.templateService.updateState({
        selectedTemplateId: typeof saved.id === "string" ? saved.id : null,
        formState: cloneTemplateConfig(saved),
        mode: "select",
      });
      showToast(localize("template.save.success", "Template saved"), "success");
    } catch (err) {
      showToast(localize("template.save.failed", "Failed to save template: {error}", { error: String(err) }), "error");
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

function createTemplateMenuIcon(icon: LxIconDefinition): HTMLSpanElement {
  const wrapper = document.createElement("span");
  wrapper.className = "ui-menu__item-icon";
  wrapper.setAttribute("aria-hidden", "true");
  wrapper.append(createLxIcon({ icon, size: 14 }));
  return wrapper;
}
