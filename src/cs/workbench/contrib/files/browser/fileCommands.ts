/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type { ICommandHandler } from "src/cs/platform/commands/common/commands";
import { URI } from "src/cs/base/common/uri";
import {
  IExplorerService,
  ExplorerViewId,
  type ExplorerResourceTarget,
  type ExplorerSelectionKind,
} from "src/cs/workbench/contrib/files/browser/files";
import type { ExplorerViewPane } from "src/cs/workbench/contrib/files/browser/explorerViewlet";
import { IViewsService } from "src/cs/workbench/services/views/common/viewsService";
import { ISliceService } from "src/cs/workbench/services/slice/common/slice";
import type { TemplateSelection } from "src/cs/workbench/services/slice/common/templateSelection";
import {
  getExplorerFileResourceIdentity,
  getExplorerResourceIdentityKey,
  type ExplorerFileEntry,
} from "src/cs/workbench/contrib/files/common/explorerModel";

export const addFolderHandler: ICommandHandler = accessor => {
  withExplorerView(accessor, explorerView => explorerView.openFolderImport());
};

export const closeFolderHandler: ICommandHandler = accessor => {
  withExplorerView(accessor, explorerView => explorerView.closeFolder());
};

export const closeFileItemHandler: ICommandHandler<[unknown]> = (
  accessor,
  target,
) => {
  const resourceTarget = resolveCommandExplorerResourceTarget(accessor, target);
  if (!resourceTarget) {
    return;
  }

  withExplorerView(accessor, explorerView => explorerView.closeFile(resourceTarget));
};

export const deleteFileItemHandler: ICommandHandler<[unknown]> = (
  accessor,
  target,
) => {
  const resourceTarget = resolveCommandExplorerResourceTarget(accessor, target);
  if (!resourceTarget) {
    return;
  }

  withExplorerView(accessor, explorerView => explorerView.deleteFile(resourceTarget));
};

export const renameFileItemHandler: ICommandHandler<[unknown]> = (
  accessor,
  target,
) => {
  const resourceTarget = resolveCommandExplorerResourceTarget(accessor, target);
  if (!resourceTarget) {
    return;
  }

  const explorerService = accessor.get(IExplorerService);
  const paneInput = explorerService.getPaneInput();
  const kind: ExplorerSelectionKind = paneInput?.selectionKind ?? "table";
  const resource = {
    kind,
    resource: resourceTarget.resource,
    sheetId: resourceTarget.sheetId ?? null,
  };
  explorerService.select(resource, "force");
  explorerService.setEditable({
    resource,
    isEditing: true,
  });
};

export const setFileTemplateHandler: ICommandHandler<[unknown, unknown]> = (
  accessor,
  target,
  selection,
) => {
  const resourceTarget = target instanceof URI
    ? { resource: target }
    : normalizeCommandResourceTarget(target);
  if (!resourceTarget?.resource || !isTemplateSelection(selection)) {
    return;
  }

  const sliceService = accessor.get(ISliceService);
  sliceService.setTemplateSelection({
    resource: resourceTarget.resource,
    sheetId: resourceTarget.sheetId ?? null,
  }, selection);
};

const normalizeCommandString = (value: unknown): string | null => {
  if (typeof value !== "string" && typeof value !== "number") {
    return null;
  }

  const normalized = String(value ?? "").trim();
  return normalized || null;
};

const resolveCommandExplorerResourceTarget = (
  accessor: Parameters<ICommandHandler>[0],
  target: unknown,
): ExplorerResourceTarget | null => {
  if (target instanceof URI) {
    return { resource: target };
  }

  const directTarget = normalizeCommandResourceTarget(target);
  if (directTarget) {
    return directTarget;
  }

  const paneInput = accessor.get(IExplorerService).getPaneInput();
  if (!paneInput) {
    return null;
  }

  const file = findExplorerFileEntryByResource(paneInput.files, {
    resource: paneInput.selectedResource,
    sheetId: paneInput.selectedSheetId ?? null,
  });
  return getExplorerFileResourceIdentity(file);
};

const normalizeCommandResourceTarget = (target: unknown): ExplorerResourceTarget | null => {
  if (!target || typeof target !== "object" || !("resource" in target)) {
    return null;
  }

  const resource = reviveOptionalUri((target as { readonly resource?: unknown }).resource);
  if (!resource) {
    return null;
  }

  const sheetId = normalizeCommandString((target as { readonly sheetId?: unknown }).sheetId);
  return {
    resource,
    ...(sheetId ? { sheetId } : {}),
  };
};

const reviveOptionalUri = (value: unknown): URI | null => {
  if (value instanceof URI) {
    return value;
  }

  if (typeof value === "string") {
    const raw = value.trim();
    if (!raw) {
      return null;
    }

    try {
      return URI.revive(raw);
    } catch {
      return null;
    }
  }

  if (
    value &&
    typeof value === "object" &&
    typeof (value as { readonly scheme?: unknown }).scheme === "string" &&
    typeof (value as { readonly path?: unknown }).path === "string"
  ) {
    return URI.revive(value as Parameters<typeof URI.revive>[0]);
  }

  return null;
};

const findExplorerFileEntryByResource = (
  files: readonly ExplorerFileEntry[],
  target: ExplorerResourceTarget | null,
): ExplorerFileEntry | null => {
  const targetKey = getExplorerResourceIdentityKey(target);
  if (!targetKey) {
    return null;
  }

  return files.find(file =>
    getExplorerResourceIdentityKey(getExplorerFileResourceIdentity(file)) === targetKey,
  ) ?? null;
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
