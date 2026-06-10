/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { localize } from "src/cs/nls";
import {
  CommandsRegistry,
  type ICommandHandler,
} from "src/cs/platform/commands/common/commands";
import {
  ADD_FOLDER_ACTION_ID,
  REMOVE_FILE_ITEM_COMMAND_ID,
  REMOVE_FOLDER_ACTION_ID,
  RENAME_FILE_ITEM_COMMAND_ID,
  SET_FILE_TEMPLATE_COMMAND_ID,
  SLICE_FILE_WITH_TEMPLATE_COMMAND_ID,
  TOGGLE_THUMBNAIL_VIEW_ACTION_ID,
} from "src/cs/workbench/contrib/files/common/files";
import { notificationService } from "src/cs/workbench/services/notification/common/notificationService";
import { IExplorerService } from "src/cs/workbench/services/explorer/common/explorer";
import { ITemplateService } from "src/cs/workbench/services/template/common/template";
import type { TemplateSelection } from "src/cs/workbench/services/template/common/templateSelection";

export const showCreateFolderUnsupported = (): void => {
  notificationService.showToast({
    id: "files.createFolderUnsupported",
    message: localize(
      "files.createFolderUnsupported",
      "The current import list does not support creating empty folders yet.",
    ),
    type: "info",
  });
};

export const toggleThumbnailViewHandler: ICommandHandler = async (accessor) => {
  accessor.get(IExplorerService).toggleViewLayout();
};

CommandsRegistry.registerCommand({
  id: TOGGLE_THUMBNAIL_VIEW_ACTION_ID,
  handler: toggleThumbnailViewHandler,
});

export const addFolderHandler: ICommandHandler = accessor => {
  accessor.get(IExplorerService).requestFolderImport();
};

CommandsRegistry.registerCommand({
  id: ADD_FOLDER_ACTION_ID,
  handler: addFolderHandler,
});

export const removeFolderHandler: ICommandHandler = accessor => {
  accessor.get(IExplorerService).requestSelectedFolderRemoval();
};

CommandsRegistry.registerCommand({
  id: REMOVE_FOLDER_ACTION_ID,
  handler: removeFolderHandler,
});

export const removeFileItemHandler: ICommandHandler<[unknown]> = (
  accessor,
  fileId,
) => {
  const normalizedFileId = normalizeCommandFileId(fileId);
  if (!normalizedFileId) {
    return;
  }

  accessor.get(IExplorerService).requestFileRemoval(normalizedFileId);
};

CommandsRegistry.registerCommand({
  id: REMOVE_FILE_ITEM_COMMAND_ID,
  handler: removeFileItemHandler,
});

export const renameFileItemHandler: ICommandHandler<[unknown]> = (
  _accessor,
  fileId,
) => {
  if (!normalizeCommandFileId(fileId)) {
    return;
  }

  notificationService.showToast({
    id: "files.renameUnsupported",
    message: localize(
      "files.renameUnsupported",
      "Renaming imported files is not available yet.",
    ),
    type: "info",
  });
};

CommandsRegistry.registerCommand({
  id: RENAME_FILE_ITEM_COMMAND_ID,
  handler: renameFileItemHandler,
});

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

CommandsRegistry.registerCommand({
  id: SET_FILE_TEMPLATE_COMMAND_ID,
  handler: setFileTemplateHandler,
});

export const sliceFileWithTemplateHandler: ICommandHandler<[unknown, unknown]> = (
  _accessor,
  fileId,
  selection,
) => {
  if (!normalizeCommandFileId(fileId) || !isTemplateSelection(selection)) {
    return;
  }

  notificationService.showToast({
    id: "files.sliceWithTemplateUnsupported",
    message: localize(
      "files.sliceWithTemplateUnsupported",
      "Slicing imported files with a template is not available yet.",
    ),
    type: "info",
  });
};

CommandsRegistry.registerCommand({
  id: SLICE_FILE_WITH_TEMPLATE_COMMAND_ID,
  handler: sliceFileWithTemplateHandler,
});

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
