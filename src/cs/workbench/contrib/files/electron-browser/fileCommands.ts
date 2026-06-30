import { URI } from "src/cs/base/common/uri";
import type { ServicesAccessor } from "src/cs/platform/instantiation/common/instantiation";
import type { INativeHostService } from "src/cs/platform/native/common/native";
import { IExplorerService } from "src/cs/workbench/contrib/files/browser/files";
import {
  getExplorerFileResourceIdentity,
  getExplorerResourceIdentityKey,
  type ExplorerFileEntry,
  type ExplorerResourceIdentity,
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
  if (URI.isUri(target)) {
    return [target];
  }

  if (Array.isArray(target)) {
    return target.flatMap(candidate => URI.isUri(candidate) ? [candidate] : []);
  }

  const explorerService = accessor.get(IExplorerService);
  const paneInput = explorerService.getPaneInput();
  if (!paneInput) {
    return [];
  }

  const resourceIdentity = URI.isUri(target)
    ? { resource: target }
    : normalizeRevealResourceIdentity(target) ?? {
        resource: explorerService.getContext().selectedResource,
        sheetId: explorerService.getContext().selectedSheetId,
      };
  if (!resourceIdentity.resource) {
    return [];
  }

  const file = findExplorerFileEntryByResource(explorerService.files, resourceIdentity);
  const path = getRevealPath(file ?? undefined);
  return path ? [URI.file(path)] : [];
};

const normalizeRevealResourceIdentity = (identity: unknown): ExplorerResourceIdentity | null => {
  if (!identity || typeof identity !== "object" || !("resource" in identity)) {
    return null;
  }

  const resource = reviveOptionalUri((identity as { readonly resource?: unknown }).resource);
  if (!resource) {
    return null;
  }

  const sheetId = normalizeSheetId((identity as { readonly sheetId?: unknown }).sheetId);
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
  resourceIdentity: ExplorerResourceIdentity | null,
): ExplorerFileEntry | null => {
  const resourceKey = getExplorerResourceIdentityKey(resourceIdentity);
  if (!resourceKey) {
    return null;
  }

  return files.find(file =>
    getExplorerResourceIdentityKey(getExplorerFileResourceIdentity(file)) === resourceKey,
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
