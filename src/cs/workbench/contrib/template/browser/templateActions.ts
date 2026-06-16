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
import { TemplateImportController } from "src/cs/workbench/services/template/browser/templateImportController";
import { isAutoTemplateId } from "src/cs/workbench/services/template/common/autoTemplate";
import {
  cloneTemplateConfig,
  normalizeTemplateConfigRecord,
  toTemplateNameKey,
} from "src/cs/workbench/services/template/common/templateConfigUtils";
import {
  ITemplateService,
  TemplateCommandId,
  type TemplateRecord,
} from "src/cs/workbench/services/template/common/template";
import { validateTemplateForSave } from "src/cs/workbench/services/template/common/templateValidation";

export function registerTemplateActions(): void {
  registerAction2(SelectTemplateAction);
  registerAction2(CreateTemplateAction);
  registerAction2(DeleteTemplateAction);
  registerAction2(ImportTemplateAction);
  registerAction2(EditTemplateAction);
  registerAction2(ExportTemplateAction);
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
    const templateService = accessor.get(ITemplateService);
    templateService.selectTemplate(normalizeTemplateActionTarget(template));
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
    accessor.get(ITemplateService).createTemplateDraft(normalizeTemplateActionTarget(template));
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
    const templateService = accessor.get(ITemplateService);
    const target = normalizeTemplateActionTarget(template)
      ?? createCurrentTemplateActionTarget(templateService);
    if (!target) {
      return;
    }

    templateService.editTemplate(target);
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
    const templateService = accessor.get(ITemplateService);
    const target = normalizeTemplateActionTarget(template);
    const exported = templateService.exportTemplate(target ?? undefined);
    if (!exported) {
      accessor.get(INotificationService).notify({
        id: "template.notification",
        message: localize("template.export.requiresSelection", "Please select a template to export."),
        severity: Severity.Warning,
      });
    }
  }
}

function normalizeTemplateActionTarget(value: unknown): TemplateRecord | null {
  return value && typeof value === "object"
    ? value as TemplateRecord
    : null;
}

async function deleteTemplate(accessor: ServicesAccessor, template: unknown): Promise<void> {
  const templateService = accessor.get(ITemplateService);
  const notificationService = accessor.get(INotificationService);
  const target = normalizeTemplateActionTarget(template)
    ?? createCurrentTemplateActionTarget(templateService);
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
    await templateService.deleteTemplate(templateId);
    templateService.selectTemplate({
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
  const templateService = accessor.get(ITemplateService);
  const notificationService = accessor.get(INotificationService);
  const controller = new TemplateImportController(
    accessor.get(IFileDialogService),
    accessor.get(IFileService),
    accessor.get(IPathService),
  );

  try {
    await controller.importTemplateFromDialog(async (payload) => {
      await importTemplatePayload(payload, templateService, notificationService);
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
  templateService: ITemplateService,
  notificationService: INotificationService,
): Promise<void> {
  const entry = payload && typeof payload === "object"
    ? payload as Record<string, unknown>
    : {};
  const draft = normalizeTemplateConfigRecord(entry);
  if (!draft.name) {
    notificationService.notify({
      id: "template.notification",
      message: localize("template.import.invalidFormat", "Invalid template file format."),
      severity: Severity.Warning,
    });
    return;
  }

  const templates = await templateService.getTemplates();
  const nameKey = toTemplateNameKey(draft.name);
  const conflict = templates.find((template) => toTemplateNameKey(template.name) === nameKey);
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
      await templateService.deleteTemplate(String(conflict.id));
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

  const saved = await templateService.saveTemplate({
    ...validation.normalized,
    name: draft.name,
  });
  templateService.selectTemplate({
    ...cloneTemplateConfig(saved),
    id: saved.id,
  });
  notificationService.notify({
    id: "template.notification",
    message: localize("template.import.success", "Template imported"),
    presentation: { type: "success" },
    severity: Severity.Info,
  });
}

function createCurrentTemplateActionTarget(templateService: ITemplateService): TemplateRecord | null {
  const state = templateService.getState();
  if (!state.selectedTemplateId || isAutoTemplateId(state.selectedTemplateId)) {
    return null;
  }

  return {
    ...state.formState,
    id: state.selectedTemplateId,
  };
}

function getTemplateActionTargetId(template: TemplateRecord | null): string | null {
  const templateId = String(template?.id ?? "").trim();
  return templateId && !isAutoTemplateId(templateId) ? templateId : null;
}
