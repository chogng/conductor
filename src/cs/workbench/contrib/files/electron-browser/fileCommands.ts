import { URI } from "src/cs/base/common/uri";
import type { ServicesAccessor } from "src/cs/platform/instantiation/common/instantiation";
import type { INativeHostService } from "src/cs/platform/native/common/native";
import { IExplorerService } from "src/cs/workbench/contrib/files/browser/files";
import type { ExplorerFileEntry } from "src/cs/workbench/contrib/files/common/explorerModel";

export const revealResourcesInOS = (
  resources: readonly URI[],
  nativeHostService: INativeHostService,
): void => {
  for (const resource of resources) {
    if (resource.scheme !== "file") {
      continue;
    }

    nativeHostService.showItemInFolder(resource.fsPath);
  }
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

  const fileId = normalizeRevealFileId(target)
    ?? explorerService.getContext().selectedRawFileId
    ?? explorerService.getContext().selectedProcessedFileId;
  if (!fileId) {
    return [];
  }

  const file = paneInput.files.find(candidate => candidate.fileId === fileId);
  const path = getRevealPath(file);
  return path ? [URI.file(path)] : [];
};

const normalizeRevealFileId = (target: unknown): string | null => {
  const normalized = typeof target === "string" ? target.trim() : "";
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
