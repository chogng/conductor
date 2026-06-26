/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type { ICommandHandler } from "src/cs/platform/commands/common/commands";
import { IExplorerService, ExplorerViewId, type ExplorerSelectionKind } from "src/cs/workbench/contrib/files/browser/files";
import type { ExplorerViewPane } from "src/cs/workbench/contrib/files/browser/explorerViewlet";
import { IViewsService } from "src/cs/workbench/services/views/common/viewsService";
import { ISliceService } from "src/cs/workbench/services/slice/common/slice";
import type { TemplateSelection } from "src/cs/workbench/services/slice/common/templateSelection";

export const addFolderHandler: ICommandHandler = accessor => {
  withExplorerView(accessor, explorerView => explorerView.openFolderImport());
};

export const closeFolderHandler: ICommandHandler = accessor => {
  withExplorerView(accessor, explorerView => explorerView.closeFolder());
};

export const closeFileItemHandler: ICommandHandler<[unknown]> = (
  accessor,
  fileId,
) => {
  const normalizedFileId = normalizeCommandFileId(fileId);
  if (!normalizedFileId) {
    return;
  }

  withExplorerView(accessor, explorerView => explorerView.closeFile(normalizedFileId));
};

export const deleteFileItemHandler: ICommandHandler<[unknown]> = (
  accessor,
  fileId,
) => {
  const normalizedFileId = normalizeCommandFileId(fileId);
  if (!normalizedFileId) {
    return;
  }

  withExplorerView(accessor, explorerView => explorerView.deleteFile(normalizedFileId));
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

const normalizeCommandFileId = (fileId: unknown): string | null => {
  const normalized = String(fileId ?? "").trim();
  return normalized || null;
};

const withExplorerView = (
  accessor: Parameters<ICommandHandler>[0],
  callback: (explorerView: ExplorerViewPane) => void | Promise<void>,
): void => {
  void accessor.get(IViewsService).openView<ExplorerViewPane>(ExplorerViewId, false).then(explorerView => {
    if (!explorerView) {
      return;
    }

    void callback(explorerView);
  });
};

const isTemplateSelection = (value: unknown): value is TemplateSelection => {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  if (candidate.kind === "auto") {
    return true;
  }

  if (candidate.kind === "saved" && typeof candidate.templateId === "string" && candidate.templateId.trim().length > 0) {
    return true;
  }

  return candidate.kind === "inline" &&
    Boolean(candidate.template) &&
    typeof candidate.template === "object";
};
