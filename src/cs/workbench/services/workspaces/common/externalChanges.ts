/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import {
  buildFileSourceIdentityKey,
  type FileEntry,
  type FolderImportFileSource,
} from "src/cs/workbench/services/files/common/files";
import {
  createWorkspaceSourcePathKey,
  type WorkspaceExternalChange,
  type WorkspaceExternalChanges,
} from "src/cs/workbench/services/workspaces/common/workspaces";

type WorkspaceSourceSnapshot = {
  readonly relativePath: string;
  readonly sourceKey: string | null;
};

export const resolveWorkspaceExternalChanges = ({
  excludedSourcePaths,
  files,
  scannedFiles,
}: {
  readonly excludedSourcePaths: ReadonlySet<string>;
  readonly files: readonly FileEntry[];
  readonly scannedFiles: readonly FolderImportFileSource[];
}): WorkspaceExternalChanges => {
  const currentByPath = new Map<string, WorkspaceSourceSnapshot>();
  for (const file of files) {
    const relativePath = createWorkspaceSourcePathKey(file.relativePath);
    if (!relativePath) {
      continue;
    }

    currentByPath.set(relativePath, {
      relativePath,
      sourceKey: typeof file.sourceKey === "string" && file.sourceKey.trim()
        ? file.sourceKey
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
      sourceKey: buildFileSourceIdentityKey(
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
          sourceKey: scanned.sourceKey,
        });
      }
      continue;
    }

    if (
      current.sourceKey &&
      scanned.sourceKey &&
      current.sourceKey !== scanned.sourceKey
    ) {
      modified.push({
        kind: "modified",
        relativePath: scanned.relativePath,
        sourceKey: scanned.sourceKey,
      });
    }
  }

  for (const current of currentByPath.values()) {
    if (!scannedByPath.has(current.relativePath)) {
      deleted.push({
        kind: "deleted",
        relativePath: current.relativePath,
        sourceKey: current.sourceKey,
      });
    }
  }

  return { added, modified, deleted };
};
