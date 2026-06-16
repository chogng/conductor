/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { localize } from "src/cs/nls";
import type { ICommandHandler } from "src/cs/platform/commands/common/commands";
import { IExplorerService, IExplorerWorkflowService, type ExplorerSelectionKind } from "src/cs/workbench/contrib/files/browser/files";
import {
  INotificationService,
  Severity,
} from "src/cs/workbench/services/notification/common/notificationService";
import { ITemplateService } from "src/cs/workbench/services/template/common/template";
import type { TemplateSelection } from "src/cs/workbench/services/template/common/templateSelection";

export const addFolderHandler: ICommandHandler = accessor => {
  accessor.get(IExplorerWorkflowService).openFolderImport();
};

export const closeFolderHandler: ICommandHandler = accessor => {
  accessor.get(IExplorerWorkflowService).closeFolder();
};

export const removeFileItemHandler: ICommandHandler<[unknown]> = (
  accessor,
  fileId,
) => {
  const normalizedFileId = normalizeCommandFileId(fileId);
  if (!normalizedFileId) {
    return;
  }

  accessor.get(IExplorerWorkflowService).removeFile(normalizedFileId);
};

export const renameFileItemHandler: ICommandHandler<[unknown]> = (
  accessor,
  fileId,
) => {
  const normalizedFileId = normalizeCommandFileId(fileId);
  if (!normalizedFileId) {
    return;
  }

  const explorerService = accessor.get(IExplorerService);
  const paneInput = explorerService.getPaneInput();
  const kind: ExplorerSelectionKind = paneInput?.selectionKind ?? "table";
  const resource = {
    kind,
    fileId: normalizedFileId,
  };
  explorerService.select(resource, "force");
  explorerService.setEditable({
    resource,
    isEditing: true,
  });
};

export const setFileTemplateHandler: ICommandHandler<[unknown, unknown]> = (
  accessor,
  fileId,
  selection,
) => {
  const normalizedFileId = normalizeCommandFileId(fileId);
  if (!normalizedFileId || !isTemplateSelection(selection)) {
    return;
  }

  const templateService = accessor.get(ITemplateService);
  templateService.setSelectionsByFileId(previous => ({
    ...previous,
    [normalizedFileId]: selection,
  }));
};

export const sliceFileWithTemplateHandler: ICommandHandler<[unknown, unknown]> = (
  accessor,
  fileId,
  selection,
) => {
  if (!normalizeCommandFileId(fileId) || !isTemplateSelection(selection)) {
    return;
  }

  accessor.get(INotificationService).notify({
    id: "files.sliceWithTemplateUnsupported",
    message: localize(
      "files.sliceWithTemplateUnsupported",
      "Slicing imported files with a template is not available yet.",
    ),
    severity: Severity.Info,
  });
};

const normalizeCommandFileId = (fileId: unknown): string | null => {
  const normalized = String(fileId ?? "").trim();
  return normalized || null;
};

const isTemplateSelection = (value: unknown): value is TemplateSelection => {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  if (candidate.kind === "auto") {
    return true;
  }

  return candidate.kind === "template" &&
    typeof candidate.templateId === "string" &&
    candidate.templateId.trim().length > 0;
};
