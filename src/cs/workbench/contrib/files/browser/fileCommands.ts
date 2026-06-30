/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type { ICommandHandler } from "src/cs/platform/commands/common/commands";
import { URI } from "src/cs/base/common/uri";
import {
  IExplorerService,
  ExplorerViewId,
} from "src/cs/workbench/contrib/files/browser/files";
import type { ExplorerViewPane } from "src/cs/workbench/contrib/files/browser/explorerViewlet";
import { IViewsService } from "src/cs/workbench/services/views/common/viewsService";
import { ISliceService } from "src/cs/workbench/services/slice/common/slice";
import type { TemplateSelection } from "src/cs/workbench/services/slice/common/templateSelection";
import {
  getExplorerFileResourceIdentity,
  getExplorerResourceIdentityKey,
  type ExplorerFileEntry,
  type ExplorerResourceIdentity,
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
  const resourceIdentity = resolveCommandExplorerResourceIdentity(accessor, target);
  if (!resourceIdentity) {
    return;
  }

  withExplorerView(accessor, explorerView => explorerView.closeFile(resourceIdentity));
};

export const deleteFileItemHandler: ICommandHandler<[unknown]> = (
  accessor,
  target,
) => {
  const resourceIdentity = resolveCommandExplorerResourceIdentity(accessor, target);
  if (!resourceIdentity) {
    return;
  }

  withExplorerView(accessor, explorerView => explorerView.deleteFile(resourceIdentity));
};

export const renameFileItemHandler: ICommandHandler<[unknown]> = (
  accessor,
  target,
) => {
  const resourceIdentity = resolveCommandExplorerResourceIdentity(accessor, target);
  if (!resourceIdentity) {
    return;
  }

  const explorerService = accessor.get(IExplorerService);
  explorerService.select(resourceIdentity.resource, "force", resourceIdentity.sheetId ?? null);
  explorerService.setEditable({
    resource: resourceIdentity,
    isEditing: true,
  });
};

export const setFileTemplateHandler: ICommandHandler<[unknown, unknown]> = (
  accessor,
  target,
  selection,
) => {
  const resourceIdentity = normalizeCommandResourceIdentity(target);
  if (!resourceIdentity || !isTemplateSelection(selection)) {
    return;
  }

  const sliceService = accessor.get(ISliceService);
  sliceService.setTemplateSelection(resourceIdentity.resource, resourceIdentity.sheetId ?? null, selection);
};

const normalizeCommandString = (value: unknown): string | null => {
  if (typeof value !== "string" && typeof value !== "number") {
    return null;
  }

  const normalized = String(value ?? "").trim();
  return normalized || null;
};

const resolveCommandExplorerResourceIdentity = (
  accessor: Parameters<ICommandHandler>[0],
  target: unknown,
): ExplorerResourceIdentity | null => {
  if (target !== undefined) {
    return normalizeCommandResourceIdentity(target);
  }

  const explorerService = accessor.get(IExplorerService);
  const paneInput = explorerService.getPaneInput();
  if (!paneInput) {
    return null;
  }

  const file = findExplorerFileEntryByResource(explorerService.files, {
    resource: paneInput.selectedResource,
    sheetId: paneInput.selectedSheetId ?? null,
  });
  return getExplorerFileResourceIdentity(file);
};

const normalizeCommandResourceIdentity = (identity: unknown): ExplorerResourceIdentity | null => {
  if (!identity || typeof identity !== "object" || !("resource" in identity)) {
    return null;
  }

  const resource = reviveOptionalUri((identity as { readonly resource?: unknown }).resource);
  if (!resource) {
    return null;
  }

  const sheetId = normalizeCommandString((identity as { readonly sheetId?: unknown }).sheetId);
  return {
    resource,
    ...(sheetId ? { sheetId } : {}),
  };
};

const reviveOptionalUri = (value: unknown): URI | null => {
  if (URI.isUri(value)) {
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
  resourceIdentity:
    | { readonly resource?: URI | null; readonly sheetId?: string | null }
    | null
    | undefined,
): ExplorerFileEntry | null => {
  const resourceKey = getExplorerResourceIdentityKey(resourceIdentity);
  if (!resourceKey) {
    return null;
  }

  return files.find(file =>
    getExplorerResourceIdentityKey(getExplorerFileResourceIdentity(file)) === resourceKey,
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
