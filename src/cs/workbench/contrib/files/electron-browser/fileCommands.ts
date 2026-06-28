import { URI } from "src/cs/base/common/uri";
import type { ServicesAccessor } from "src/cs/platform/instantiation/common/instantiation";
import type { INativeHostService } from "src/cs/platform/native/common/native";
import { IExplorerService, type ExplorerResourceTarget } from "src/cs/workbench/contrib/files/browser/files";
import {
  getExplorerFileResourceIdentity,
  getExplorerResourceIdentityKey,
  type ExplorerFileEntry,
} from "src/cs/workbench/contrib/files/common/explorerModel";

export const revealResourcesInOS = (
  resources: readonly URI[],
  nativeHostService: INativeHostService,
): Promise<void> => {
  const revealPromises: Promise<void>[] = [];

  for (const resource of resources) {
    if (resource.scheme !== "file") {
      continue;
    }

    revealPromises.push(nativeHostService.showItemInFolder(resource.fsPath));
  }

  return Promise.all(revealPromises).then(() => undefined);
};

export const resolveRevealResources = (
  accessor: ServicesAccessor,
  target?: unknown,
): readonly URI[] => {
  if (target instanceof URI) {
    return [target];
  }

  if (Array.isArray(target)) {
    return target.flatMap(candidate => candidate instanceof URI ? [candidate] : []);
  }

  const explorerService = accessor.get(IExplorerService);
  const paneInput = explorerService.getPaneInput();
  if (!paneInput) {
    return [];
  }

  const resourceTarget = target instanceof URI
    ? { resource: target }
    : normalizeRevealResourceTarget(target) ?? {
        resource: explorerService.getContext().selectedResource,
        sheetId: explorerService.getContext().selectedSheetId,
      };
  if (!resourceTarget.resource) {
    return [];
  }

  const file = findExplorerFileEntryByResource(paneInput.files, resourceTarget);
  const path = getRevealPath(file);
  return path ? [URI.file(path)] : [];
};

const normalizeRevealResourceTarget = (target: unknown): ExplorerResourceTarget | null => {
  if (!target || typeof target !== "object" || !("resource" in target)) {
    return null;
  }

  const resource = reviveOptionalUri((target as { readonly resource?: unknown }).resource);
  if (!resource) {
    return null;
  }

  const sheetId = normalizeSheetId((target as { readonly sheetId?: unknown }).sheetId);
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

const normalizeSheetId = (value: unknown): string | null => {
  const normalized = String(value ?? "").trim();
  return normalized || null;
};

const getRevealPath = (file: ExplorerFileEntry | undefined): string | null => {
  const sourcePath = String(file?.sourcePath ?? "").trim();
  if (sourcePath) {
    return sourcePath;
  }

  const normalizedCsvPath = String(file?.normalizedCsvPath ?? "").trim();
  return normalizedCsvPath || null;
};
