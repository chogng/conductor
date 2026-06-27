/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import {
  createWorkspaceSourcePathKey,
  type WorkspaceExternalChange,
  type WorkspaceExternalChanges,
} from "src/cs/workbench/services/workspaces/common/workspaces";

export type WorkspaceFileEntry = {
  readonly fileId?: string;
  readonly fileName?: string;
  readonly itemKey?: string;
  readonly lastModified?: number;
  readonly relativePath?: string | null;
  readonly size?: number;
};

export type WorkspaceScannedFile = {
  readonly canUseNativePath?: boolean;
  readonly fileName: string;
  readonly kind?: string;
  readonly lastModified: number;
  readonly loadFile?: () => Promise<unknown>;
  readonly relativePath?: string | null;
  readonly resource?: unknown;
  readonly size: number;
};

type WorkspaceSourceSnapshot = {
  readonly relativePath: string;
  readonly identityKey: string | null;
};

export const resolveWorkspaceExternalChanges = ({
  excludedSourcePaths,
  files,
  scannedFiles,
}: {
  readonly excludedSourcePaths: ReadonlySet<string>;
  readonly files: readonly WorkspaceFileEntry[];
  readonly scannedFiles: readonly WorkspaceScannedFile[];
}): WorkspaceExternalChanges => {
  const currentByPath = new Map<string, WorkspaceSourceSnapshot>();
  for (const file of files) {
    const relativePath = createWorkspaceSourcePathKey(file.relativePath);
    if (!relativePath) {
      continue;
    }

    currentByPath.set(relativePath, {
      relativePath,
      identityKey: typeof file.itemKey === "string" && file.itemKey.trim()
        ? file.itemKey
        : null,
    });
  }

  const scannedByPath = new Map<string, WorkspaceSourceSnapshot>();
  for (const file of scannedFiles) {
    const relativePath = createWorkspaceSourcePathKey(file.relativePath);
    if (!relativePath) {
      continue;
    }

    scannedByPath.set(relativePath, {
      relativePath,
      identityKey: buildWorkspaceFileIdentityKey(
        file.fileName,
        file.size,
        file.lastModified,
        file.relativePath,
      ) || null,
    });
  }

  const added: WorkspaceExternalChange[] = [];
  const modified: WorkspaceExternalChange[] = [];
  const deleted: WorkspaceExternalChange[] = [];

  for (const scanned of scannedByPath.values()) {
    const current = currentByPath.get(scanned.relativePath);
    if (!current) {
      if (!excludedSourcePaths.has(scanned.relativePath)) {
        added.push({
          kind: "added",
          relativePath: scanned.relativePath,
          identityKey: scanned.identityKey,
        });
      }
      continue;
    }

    if (
      current.identityKey &&
      scanned.identityKey &&
      current.identityKey !== scanned.identityKey
    ) {
      modified.push({
        kind: "modified",
        relativePath: scanned.relativePath,
        identityKey: scanned.identityKey,
      });
    }
  }

  for (const current of currentByPath.values()) {
    if (!scannedByPath.has(current.relativePath)) {
      deleted.push({
        kind: "deleted",
        relativePath: current.relativePath,
        identityKey: current.identityKey,
      });
    }
  }

  return { added, modified, deleted };
};

export const buildWorkspaceFileIdentityKey = (
  fileName: unknown,
  size: unknown,
  lastModified: unknown,
  relativePath?: string | null,
): string => {
  const name = String(fileName ?? "").trim();
  if (!name) {
    return "";
  }

  const path = relativePath?.trim();
  return `${path || name}::${Number(size) || 0}::${Number(lastModified) || 0}`;
};

export type FileEntry = WorkspaceFileEntry;
export type FolderImportFileSource = WorkspaceScannedFile;
export const buildFileSourceIdentityKey = buildWorkspaceFileIdentityKey;
