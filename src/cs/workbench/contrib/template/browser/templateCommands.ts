/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { localize } from "src/cs/nls";
import { DisposableStore, type IDisposable } from "src/cs/base/common/lifecycle";
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
  TemplateExportController,
  TemplateImportController,
} from "src/cs/workbench/contrib/template/browser/templateImportExport";
import {
  isAutoTemplateId,
} from "src/cs/workbench/services/slice/common/templateSelection";
import {
  APPLY_TEMPLATE_COMMAND_ID,
  APPLY_TEMPLATE_INCREMENTAL_COMMAND_ID,
  CREATE_TEMPLATE_COMMAND_ID,
  DELETE_TEMPLATE_COMMAND_ID,
  EDIT_TEMPLATE_COMMAND_ID,
  EXPORT_TEMPLATE_COMMAND_ID,
  IMPORT_TEMPLATE_COMMAND_ID,
  SELECT_TEMPLATE_COMMAND_ID,
  SET_TEMPLATE_STOP_ON_ERROR_COMMAND_ID,
} from "src/cs/workbench/contrib/template/common/template";
import type { TemplateEditorRecord } from "src/cs/workbench/services/template/common/template";
import {
  IUserTemplateImportExportService,
  IUserTemplateService,
} from "src/cs/workbench/services/userTemplate/common/userTemplate";
import {
  createTemplateEditorRecordFromUserTemplate,
} from "src/cs/workbench/contrib/template/browser/templateUserTemplateAdapter";
import {
  runSliceWithTemplateHandler,
} from "src/cs/workbench/contrib/slice/browser/sliceCommands";
import {
  ITemplateViewStateService,
  type ITemplateViewStateService as ITemplateViewStateServiceType,
} from "src/cs/workbench/contrib/template/browser/templateViewStateService";

export function registerTemplateCommands(): IDisposable {
  const disposables = new DisposableStore();

  disposables.add(registerAction2(SelectTemplateAction));
  disposables.add(registerAction2(CreateTemplateAction));
  disposables.add(registerAction2(DeleteTemplateAction));
  disposables.add(registerAction2(ImportTemplateAction));
  disposables.add(registerAction2(EditTemplateAction));
  disposables.add(registerAction2(ExportTemplateAction));
  disposables.add(registerAction2(ApplyTemplateAction));
  disposables.add(registerAction2(ApplyTemplateIncrementalAction));
  disposables.add(registerAction2(SetTemplateStopOnErrorAction));

  return disposables;
}

export class SelectTemplateAction extends Action2 {
  public constructor() {
    super({
      id: SELECT_TEMPLATE_COMMAND_ID,
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
      id: CREATE_TEMPLATE_COMMAND_ID,
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
      id: DELETE_TEMPLATE_COMMAND_ID,
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
      id: IMPORT_TEMPLATE_COMMAND_ID,
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
      id: EDIT_TEMPLATE_COMMAND_ID,
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
      id: EXPORT_TEMPLATE_COMMAND_ID,
      title: localize("template.commands.exportTemplate", "Export Template"),
      metadata: {
        description: localize("template.commands.exportTemplate.description", "Export a template as a JSON bundle."),
      },
    });
  }

  public run(accessor: ServicesAccessor, template?: unknown): void {
    void exportTemplate(accessor, template);
  }
}

export class ApplyTemplateAction extends Action2 {
  public constructor() {
    super({
      id: APPLY_TEMPLATE_COMMAND_ID,
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
      id: APPLY_TEMPLATE_INCREMENTAL_COMMAND_ID,
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
      id: SET_TEMPLATE_STOP_ON_ERROR_COMMAND_ID,
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

function normalizeTemplateActionTarget(value: unknown): TemplateEditorRecord | null {
  return value && typeof value === "object"
    ? value as TemplateEditorRecord
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
  const userTemplateImportExportService = accessor.get(IUserTemplateImportExportService);
  const templateViewStateService = accessor.get(ITemplateViewStateService);
  const notificationService = accessor.get(INotificationService);
  const controller = new TemplateImportController(
    accessor.get(IFileDialogService),
    accessor.get(IFileService),
    accessor.get(IPathService),
  );

  try {
    await controller.importTemplateFromDialog(async (payload) => {
      await importTemplatePayload(payload, userTemplateImportExportService, templateViewStateService, notificationService);
    });
  } catch (err) {
    notificationService.notify({
      id: "template.notification",
      message: localize("template.import.failed", "Failed to import template: {error}", { error: String(err) }),
      severity: Severity.Error,
    });
  }
}

async function exportTemplate(accessor: ServicesAccessor, template: unknown): Promise<void> {
  const userTemplateImportExportService = accessor.get(IUserTemplateImportExportService);
  const templateViewStateService = accessor.get(ITemplateViewStateService);
  const notificationService = accessor.get(INotificationService);
  const target = normalizeTemplateActionTarget(template)
    ?? createCurrentTemplateActionTarget(templateViewStateService);
  const templateId = getTemplateActionTargetId(target);
  if (!templateId) {
    notificationService.notify({
      id: "template.notification",
      message: localize("template.export.requiresSelection", "Please select a saved template to export."),
      severity: Severity.Warning,
    });
    return;
  }

  const payload = userTemplateImportExportService.exportTemplates([templateId]);
  const userTemplate = payload.templates[0];
  if (!userTemplate) {
    notificationService.notify({
      id: "template.notification",
      message: localize("template.export.notFound", "The selected template could not be found."),
      severity: Severity.Warning,
    });
    return;
  }

  const controller = new TemplateExportController(
    accessor.get(IFileDialogService),
    accessor.get(IFileService),
    accessor.get(IPathService),
  );

  try {
    const result = await controller.exportTemplateToDialog(payload, {
      templateName: userTemplate.name,
    });
    if (result.kind === "canceled") {
      return;
    }

    notificationService.notify({
      id: "template.notification",
      message: localize("template.export.success", "Template exported"),
      presentation: { type: "success" },
      severity: Severity.Info,
    });
  } catch (err) {
    notificationService.notify({
      id: "template.notification",
      message: localize("template.export.failed", "Failed to export template: {error}", { error: String(err) }),
      severity: Severity.Error,
    });
  }
}

async function importTemplatePayload(
  payload: unknown,
  userTemplateImportExportService: IUserTemplateImportExportService,
  templateViewStateService: ITemplateViewStateServiceType,
  notificationService: INotificationService,
): Promise<void> {
  const result = await userTemplateImportExportService.importTemplatesFromPayload(payload);
  if (!result) {
    notificationService.notify({
      id: "template.notification",
      message: localize("template.import.invalidFormat", "Invalid template file format."),
      severity: Severity.Warning,
    });
    return;
  }

  const savedUserTemplate = result.imported[0];
  if (!savedUserTemplate) {
    notificationService.notify({
      id: "template.notification",
      message: result.skipped.length
        ? localize("template.import.noneImported", "No templates were imported.")
        : localize("template.import.invalidFormat", "Invalid template file format."),
      severity: Severity.Warning,
    });
    return;
  }

  const saved = createTemplateEditorRecordFromUserTemplate(savedUserTemplate);
  templateViewStateService.selectTemplate(saved);
  notificationService.notify({
    id: "template.notification",
    message: localize("template.import.success", "Template imported"),
    presentation: { type: "success" },
    severity: Severity.Info,
  });
}

function createCurrentTemplateActionTarget(templateViewStateService: ITemplateViewStateServiceType): TemplateEditorRecord | null {
  const state = templateViewStateService.getState();
  if (!state.selectedTemplateId || isAutoTemplateId(state.selectedTemplateId)) {
    return null;
  }

  return {
    ...state.formState,
    id: state.selectedTemplateId,
  };
}

function getTemplateActionTargetId(template: TemplateEditorRecord | null): string | null {
  const templateId = String(template?.id ?? "").trim();
  return templateId && !isAutoTemplateId(templateId) ? templateId : null;
}
