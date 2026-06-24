/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type { ICommandHandler } from "src/cs/platform/commands/common/commands";
import { IExplorerService, IExplorerWorkflowService, type ExplorerSelectionKind } from "src/cs/workbench/contrib/files/browser/files";
import { ISliceService } from "src/cs/workbench/services/slice/common/slice";
import type { TemplateSelection } from "src/cs/workbench/services/slice/common/templateSelection";

export const addFolderHandler: ICommandHandler = accessor => {
  accessor.get(IExplorerWorkflowService).openFolderImport();
};

export const closeFolderHandler: ICommandHandler = accessor => {
  accessor.get(IExplorerWorkflowService).closeFolder();
};

export const closeFileItemHandler: ICommandHandler<[unknown]> = (
  accessor,
  fileId,
) => {
  const normalizedFileId = normalizeCommandFileId(fileId);
  if (!normalizedFileId) {
    return;
  }

  accessor.get(IExplorerWorkflowService).closeFile(normalizedFileId);
};

export const deleteFileItemHandler: ICommandHandler<[unknown]> = (
  accessor,
  fileId,
) => {
  const normalizedFileId = normalizeCommandFileId(fileId);
  if (!normalizedFileId) {
    return;
  }

  accessor.get(IExplorerWorkflowService).deleteFile(normalizedFileId);
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

  const sliceService = accessor.get(ISliceService);
  sliceService.setTemplateSelection(normalizedFileId, selection);
};

export const sliceFileWithTemplateHandler: ICommandHandler<[unknown]> = (
  accessor,
  fileId,
) => {
  const normalizedFileId = normalizeCommandFileId(fileId);
  if (!normalizedFileId) {
    return;
  }

  accessor.get(IExplorerWorkflowService).sliceFileWithTemplate(normalizedFileId);
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

  if (
    (candidate.kind === "saved" || candidate.kind === "template") &&
    typeof candidate.templateId === "string" &&
    candidate.templateId.trim().length > 0
  ) {
    return true;
  }

  return candidate.kind === "inline" &&
    Boolean(candidate.template) &&
    typeof candidate.template === "object";
};
