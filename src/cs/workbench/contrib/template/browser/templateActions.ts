/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { localize } from "src/cs/nls";
import { Action2, registerAction2 } from "src/cs/platform/actions/common/actions";
import { IFileDialogService } from "src/cs/platform/dialogs/common/dialogs";
import { IFileService } from "src/cs/platform/files/common/files";
import type { ServicesAccessor } from "src/cs/platform/instantiation/common/instantiation";
import { IPathService } from "src/cs/workbench/services/path/common/pathService";
import {
  INotificationService,
  Severity,
} from "src/cs/workbench/services/notification/common/notificationService";
import {
  downloadTemplateBundle,
  TemplateImportController,
} from "src/cs/workbench/contrib/template/browser/templateImportExport";
import {
  isAutoTemplateId,
} from "src/cs/workbench/services/template/common/autoTemplate";
import {
  cloneTemplateApplyConfig,
  normalizeTemplateApplyConfigRecord,
  toTemplateNameKey,
} from "src/cs/workbench/services/template/common/templateApplyConfigUtils";
import {
  TemplateCommandId,
} from "src/cs/workbench/contrib/template/browser/templateIds";
import type { TemplateApplyPresetRecord } from "src/cs/workbench/services/template/common/template";
import {
  createTemplateFromApplyPresetRecord,
} from "src/cs/workbench/services/template/common/templateApplyPresetAdapter";
import {
  validateTemplateForSave,
} from "src/cs/workbench/services/template/common/templateValidation";
import {
  IUserTemplateService,
  type IUserTemplateService as IUserTemplateServiceType,
} from "src/cs/workbench/services/userTemplate/common/userTemplate";
import {
  createTemplateApplyPresetRecordFromUserTemplate,
} from "src/cs/workbench/contrib/template/browser/templateUserTemplateAdapter";
import {
  runSliceWithTemplateHandler,
} from "src/cs/workbench/contrib/slice/browser/sliceCommands";
import {
  ITemplateViewStateService,
  type ITemplateViewStateService as ITemplateViewStateServiceType,
} from "src/cs/workbench/contrib/template/browser/templateViewStateService";

export function registerTemplateActions(): void {
  registerAction2(SelectTemplateAction);
  registerAction2(CreateTemplateAction);
  registerAction2(DeleteTemplateAction);
  registerAction2(ImportTemplateAction);
  registerAction2(EditTemplateAction);
  registerAction2(ExportTemplateAction);
  registerAction2(ApplyTemplateAction);
  registerAction2(ApplyTemplateIncrementalAction);
  registerAction2(SetTemplateStopOnErrorAction);
}

export class SelectTemplateAction extends Action2 {
  public constructor() {
    super({
      id: TemplateCommandId.selectTemplate,
      title: localize("template.commands.selectTemplate", "Select Template"),
      metadata: {
        description: localize("template.commands.selectTemplate.description", "Select a template for extraction."),
      },
    });
  }

  public run(accessor: ServicesAccessor, template?: unknown): void {
    accessor.get(ITemplateViewStateService).selectTemplate(normalizeTemplateActionTarget(template));
  }
}

export class CreateTemplateAction extends Action2 {
  public constructor() {
    super({
      category: localize("template.commands.category", "Template"),
      f1: true,
      id: TemplateCommandId.createTemplate,
      title: localize("template.commands.createTemplate", "Create Template"),
      metadata: {
        description: localize("template.commands.createTemplate.description", "Create a new template draft."),
      },
    });
  }

  public run(accessor: ServicesAccessor, template?: unknown): void {
    accessor.get(ITemplateViewStateService).createTemplateDraft(normalizeTemplateActionTarget(template));
  }
}

export class DeleteTemplateAction extends Action2 {
  public constructor() {
    super({
      category: localize("template.commands.category", "Template"),
      f1: true,
      id: TemplateCommandId.deleteTemplate,
      title: localize("template.commands.deleteTemplate", "Delete Template"),
      metadata: {
        description: localize("template.commands.deleteTemplate.description", "Delete the selected template."),
      },
    });
  }

  public run(accessor: ServicesAccessor, template?: unknown): void {
    void deleteTemplate(accessor, template);
  }
}

export class ImportTemplateAction extends Action2 {
  public constructor() {
    super({
      category: localize("template.commands.category", "Template"),
      f1: true,
      id: TemplateCommandId.importTemplate,
      title: localize("template.commands.importTemplate", "Import Template"),
      metadata: {
        description: localize("template.commands.importTemplate.description", "Import a template from a JSON bundle."),
      },
    });
  }

  public run(accessor: ServicesAccessor): void {
    void importTemplate(accessor);
  }
}

export class EditTemplateAction extends Action2 {
  public constructor() {
    super({
      category: localize("template.commands.category", "Template"),
      f1: true,
      id: TemplateCommandId.editTemplate,
      title: localize("template.commands.editTemplate", "Edit Template"),
      metadata: {
        description: localize("template.commands.editTemplate.description", "Open a saved template in the template editor."),
      },
    });
  }

  public run(accessor: ServicesAccessor, template: unknown): void {
    const templateViewStateService = accessor.get(ITemplateViewStateService);
    const target = normalizeTemplateActionTarget(template)
      ?? createCurrentTemplateActionTarget(templateViewStateService);
    if (!target) {
      return;
    }

    templateViewStateService.editTemplate(target);
  }
}

export class ExportTemplateAction extends Action2 {
  public constructor() {
    super({
      category: localize("template.commands.category", "Template"),
      f1: true,
      id: TemplateCommandId.exportTemplate,
      title: localize("template.commands.exportTemplate", "Export Template"),
      metadata: {
        description: localize("template.commands.exportTemplate.description", "Export a template as a JSON bundle."),
      },
    });
  }

  public run(accessor: ServicesAccessor, template?: unknown): void {
    const templateViewStateService = accessor.get(ITemplateViewStateService);
    const target = normalizeTemplateActionTarget(template)
      ?? createCurrentTemplateActionTarget(templateViewStateService);
    const exported = exportTemplateBundle(target);
    if (!exported) {
      accessor.get(INotificationService).notify({
        id: "template.notification",
        message: localize("template.export.requiresSelection", "Please select a template to export."),
        severity: Severity.Warning,
      });
    }
  }
}

export class ApplyTemplateAction extends Action2 {
  public constructor() {
    super({
      id: TemplateCommandId.applyTemplate,
      title: localize("template.commands.applyTemplate", "Apply Template to All"),
      metadata: {
        description: localize("template.commands.applyTemplate.description", "Apply the selected template to all files."),
      },
    });
  }

  public run(accessor: ServicesAccessor): void {
    applyTemplate(accessor, false);
  }
}

export class ApplyTemplateIncrementalAction extends Action2 {
  public constructor() {
    super({
      id: TemplateCommandId.applyTemplateIncremental,
      title: localize("template.commands.applyTemplateIncremental", "Apply Template to New Files"),
      metadata: {
        description: localize("template.commands.applyTemplateIncremental.description", "Apply the selected template to new files."),
      },
    });
  }

  public run(accessor: ServicesAccessor): void {
    applyTemplate(accessor, true);
  }
}

export class SetTemplateStopOnErrorAction extends Action2 {
  public constructor() {
    super({
      id: TemplateCommandId.setStopOnError,
      title: localize("template.commands.setStopOnError", "Set Template Stop on Error"),
      metadata: {
        description: localize("template.commands.setStopOnError.description", "Set whether template application stops at the first invalid item."),
      },
    });
  }

  public run(accessor: ServicesAccessor, value?: unknown): void {
    const templateViewStateService = accessor.get(ITemplateViewStateService);
    const current = templateViewStateService.getState().formState.stopOnError;
    const stopOnError = typeof value === "boolean" ? value : !current;
    templateViewStateService.setFormState(previous => ({
      ...previous,
      stopOnError,
    }));
  }
}

function normalizeTemplateActionTarget(value: unknown): TemplateApplyPresetRecord | null {
  return value && typeof value === "object"
    ? value as TemplateApplyPresetRecord
    : null;
}

function applyTemplate(accessor: ServicesAccessor, incremental: boolean): void {
  runSliceWithTemplateHandler(accessor, { incremental });
}

async function deleteTemplate(accessor: ServicesAccessor, template: unknown): Promise<void> {
  const userTemplateService = accessor.get(IUserTemplateService);
  const templateViewStateService = accessor.get(ITemplateViewStateService);
  const notificationService = accessor.get(INotificationService);
  const target = normalizeTemplateActionTarget(template)
    ?? createCurrentTemplateActionTarget(templateViewStateService);
  const templateId = getTemplateActionTargetId(target);
  if (!templateId) {
    return;
  }

  const confirmMsg = localize("template.delete.confirm", "Delete template \"{name}\"?", {
    name: target?.name || templateId,
  });
  if (typeof window !== "undefined" && typeof window.confirm === "function" && !window.confirm(confirmMsg)) {
    return;
  }

  try {
    await userTemplateService.deleteTemplate(templateId);
    templateViewStateService.selectTemplate({
      stopOnError: target?.stopOnError,
    });
    notificationService.notify({
      id: "template.notification",
      message: localize("template.delete.success", "Template deleted"),
      presentation: { type: "success" },
      severity: Severity.Info,
    });
  } catch (err) {
    notificationService.notify({
      id: "template.notification",
      message: localize("template.delete.failed", "Failed to delete template: {error}", { error: String(err) }),
      severity: Severity.Error,
    });
  }
}

async function importTemplate(accessor: ServicesAccessor): Promise<void> {
  const userTemplateService = accessor.get(IUserTemplateService);
  const templateViewStateService = accessor.get(ITemplateViewStateService);
  const notificationService = accessor.get(INotificationService);
  const controller = new TemplateImportController(
    accessor.get(IFileDialogService),
    accessor.get(IFileService),
    accessor.get(IPathService),
  );

  try {
    await controller.importTemplateFromDialog(async (payload) => {
      await importTemplatePayload(payload, userTemplateService, templateViewStateService, notificationService);
    });
  } catch (err) {
    notificationService.notify({
      id: "template.notification",
      message: localize("template.import.failed", "Failed to import template: {error}", { error: String(err) }),
      severity: Severity.Error,
    });
  }
}

async function importTemplatePayload(
  payload: unknown,
  userTemplateService: IUserTemplateServiceType,
  templateViewStateService: ITemplateViewStateServiceType,
  notificationService: INotificationService,
): Promise<void> {
  const entry = payload && typeof payload === "object"
    ? payload as Record<string, unknown>
    : {};
  const draft = normalizeTemplateApplyConfigRecord(entry);
  if (!draft.name) {
    notificationService.notify({
      id: "template.notification",
      message: localize("template.import.invalidFormat", "Invalid template file format."),
      severity: Severity.Warning,
    });
    return;
  }

  const templates = await userTemplateService.refreshTemplates();
  const nameKey = toTemplateNameKey(draft.name);
  const conflict = templates.find((template) => toTemplateNameKey(template.name) === nameKey);
  let overwriteTemplateId: string | undefined;
  if (conflict) {
    let suffix = 1;
    let newName = `${draft.name}(${suffix})`;
    while (templates.some((template) => toTemplateNameKey(template.name) === toTemplateNameKey(newName))) {
      suffix++;
      newName = `${draft.name}(${suffix})`;
    }

    const confirmMessage = localize(
      "template.import.conflict",
      "Template \"{name}\" already exists.\nOK: import as \"{newName}\".\nCancel: overwrite the existing template.",
      { name: draft.name, newName },
    );
    const shouldRename = typeof window !== "undefined" && typeof window.confirm === "function"
      ? window.confirm(confirmMessage)
      : true;
    if (shouldRename) {
      draft.name = newName;
    } else if (conflict.id) {
      const templateId = String(conflict.id).trim();
      if (templateId) {
        overwriteTemplateId = templateId;
      }
    }
  }

  const validation = validateTemplateForSave(draft);
  if (!validation.ok || !validation.normalized) {
    notificationService.notify({
      id: "template.notification",
      message: validation.message || localize("template.invalidConfiguration", "Invalid configuration"),
      severity: Severity.Warning,
    });
    return;
  }

  const template = createTemplateFromApplyPresetRecord({
    ...validation.normalized,
    ...(overwriteTemplateId ? { id: overwriteTemplateId } : {}),
    name: draft.name,
  });
  if (!template) {
    notificationService.notify({
      id: "template.notification",
      message: localize("template.invalidConfiguration", "Invalid configuration"),
      severity: Severity.Warning,
    });
    return;
  }

  const result = await userTemplateService.importTemplates({
    overwrite: Boolean(overwriteTemplateId),
    templates: [{
      ...(overwriteTemplateId ? { id: overwriteTemplateId } : {}),
      name: draft.name,
      source: "imported",
      template,
    }],
  });
  const savedUserTemplate = result.imported[0];
  if (!savedUserTemplate) {
    notificationService.notify({
      id: "template.notification",
      message: localize("template.import.invalidFormat", "Invalid template file format."),
      severity: Severity.Warning,
    });
    return;
  }

  const saved = createTemplateApplyPresetRecordFromUserTemplate(savedUserTemplate);
  templateViewStateService.selectTemplate({
    ...cloneTemplateApplyConfig(saved),
    id: saved.id,
  });
  notificationService.notify({
    id: "template.notification",
    message: localize("template.import.success", "Template imported"),
    presentation: { type: "success" },
    severity: Severity.Info,
  });
}

function createCurrentTemplateActionTarget(templateViewStateService: ITemplateViewStateServiceType): TemplateApplyPresetRecord | null {
  const state = templateViewStateService.getState();
  if (!state.selectedTemplateId || isAutoTemplateId(state.selectedTemplateId)) {
    return null;
  }

  return {
    ...state.formState,
    id: state.selectedTemplateId,
  };
}

function exportTemplateBundle(template: TemplateApplyPresetRecord | null): string | null {
  if (!template?.name) {
    return null;
  }

  return downloadTemplateBundle({
    version: 1,
    source: "conductor",
    ...cloneTemplateApplyConfig(template),
  });
}

function getTemplateActionTargetId(template: TemplateApplyPresetRecord | null): string | null {
  const templateId = String(template?.id ?? "").trim();
  return templateId && !isAutoTemplateId(templateId) ? templateId : null;
}
