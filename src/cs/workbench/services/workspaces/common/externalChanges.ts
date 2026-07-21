/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import {
  createWorkspaceSourcePathKey,
  type WorkspaceExternalChange,
  type WorkspaceExternalChanges,
} from "src/cs/workbench/services/workspaces/common/workspaces";

export type WorkspaceFileEntry = {
  readonly contentHash?: string | null;
  readonly fileId?: string;
  readonly fileName?: string;
  readonly itemKey?: string;
  readonly lastModified?: number;
  readonly relativePath?: string | null;
  readonly size?: number;
};

export type WorkspaceScannedFile = {
  readonly canUseNativePath?: boolean;
  readonly contentHash?: string | null;
  readonly fileName: string;
  readonly kind?: string;
  readonly lastModified: number;
  readonly loadFile?: () => Promise<unknown>;
  readonly relativePath?: string | null;
  readonly resource?: unknown;
  readonly size: number;
  readonly writeLockState?: "locked" | "unlocked" | "unknown";
};

export function isWorkspaceTransientSourcePath(value: unknown): boolean {
  const fileName = String(value ?? "")
    .replaceAll("\\", "/")
    .split("/")
    .at(-1)
    ?.trim()
    .toLowerCase();
  if (!fileName) {
    return false;
  }

  return fileName.startsWith("~$") ||
    (fileName.startsWith(".~lock.") && fileName.endsWith("#"));
}

type WorkspaceSourceSnapshot = {
  readonly relativePath: string;
  readonly contentHash: string | null;
  readonly identityKey: string | null;
  readonly requiresContentHash: boolean;
  readonly writeLockState: "locked" | "unlocked" | "unknown";
};

export class WorkspaceLockedWorkbookChangeTracker {
  private readonly lockedHashes = new Map<string, string>();
  private readonly confirmed = new Set<string>();

  public get confirmedPaths(): ReadonlySet<string> {
    return this.confirmed;
  }

  public observe(
    files: readonly WorkspaceFileEntry[],
    scannedFiles: readonly WorkspaceScannedFile[],
  ): void {
    const currentHashes = new Map<string, string>();
    for (const file of files) {
      const relativePath = createWorkspaceSourcePathKey(file.relativePath);
      const contentHash = normalizeContentHash(file.contentHash);
      if (relativePath && contentHash) {
        currentHashes.set(relativePath, contentHash);
      }
    }

    const scannedPaths = new Set<string>();
    for (const file of scannedFiles) {
      const relativePath = createWorkspaceSourcePathKey(file.relativePath);
      if (!relativePath) {
        continue;
      }
      scannedPaths.add(relativePath);

      const contentHash = normalizeContentHash(file.contentHash);
      if (file.writeLockState !== "locked" || !contentHash) {
        this.clear([relativePath]);
        continue;
      }

      if (currentHashes.get(relativePath) === contentHash) {
        this.clear([relativePath]);
        continue;
      }

      const previousHash = this.lockedHashes.get(relativePath);
      if (previousHash && previousHash !== contentHash) {
        this.confirmed.add(relativePath);
      }
      this.lockedHashes.set(relativePath, contentHash);
    }

    for (const relativePath of this.lockedHashes.keys()) {
      if (!scannedPaths.has(relativePath)) {
        this.clear([relativePath]);
      }
    }
  }

  public clear(relativePaths?: readonly string[]): void {
    if (!relativePaths) {
      this.lockedHashes.clear();
      this.confirmed.clear();
      return;
    }

    for (const relativePath of relativePaths) {
      this.lockedHashes.delete(relativePath);
      this.confirmed.delete(relativePath);
    }
  }
}

export const resolveWorkspaceExternalChanges = ({
  confirmedLockedWorkbookPaths = new Set<string>(),
  excludedSourcePaths,
  files,
  scannedFiles,
}: {
  readonly confirmedLockedWorkbookPaths?: ReadonlySet<string>;
  readonly excludedSourcePaths: ReadonlySet<string>;
  readonly files: readonly WorkspaceFileEntry[];
  readonly scannedFiles: readonly WorkspaceScannedFile[];
}): WorkspaceExternalChanges => {
  const currentByPath = new Map<string, WorkspaceSourceSnapshot>();
  for (const file of files) {
    const relativePath = createWorkspaceSourcePathKey(file.relativePath);
    if (!relativePath || isWorkspaceTransientSourcePath(relativePath)) {
      continue;
    }

    currentByPath.set(relativePath, {
      relativePath,
      contentHash: normalizeContentHash(file.contentHash),
      identityKey: typeof file.itemKey === "string" && file.itemKey.trim()
        ? file.itemKey
        : null,
      requiresContentHash: isWorkspaceWorkbookSourcePath(file.fileName ?? relativePath),
      writeLockState: "unknown",
    });
  }

  const scannedByPath = new Map<string, WorkspaceSourceSnapshot>();
  for (const file of scannedFiles) {
    const relativePath = createWorkspaceSourcePathKey(file.relativePath);
    if (!relativePath || isWorkspaceTransientSourcePath(relativePath)) {
      continue;
    }

    scannedByPath.set(relativePath, {
      relativePath,
      contentHash: normalizeContentHash(file.contentHash),
      identityKey: buildWorkspaceFileIdentityKey(
        file.fileName,
        file.size,
        file.lastModified,
        file.relativePath,
      ) || null,
      requiresContentHash: isWorkspaceWorkbookSourcePath(file.fileName),
      writeLockState: file.writeLockState ?? "unknown",
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

    // The first byte change while Office owns the write lock is its open-time mutation.
    // A later locked change is confirmed by the workflow, while unlocked changes can
    // be compared directly.
    const changed = current.requiresContentHash || scanned.requiresContentHash
      ? Boolean(
        current.contentHash &&
        scanned.contentHash &&
        current.contentHash !== scanned.contentHash &&
        (
          scanned.writeLockState !== "locked" ||
          confirmedLockedWorkbookPaths.has(scanned.relativePath)
        ),
      )
      : Boolean(
        current.identityKey &&
        scanned.identityKey &&
        current.identityKey !== scanned.identityKey,
      );
    if (changed) {
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

function isWorkspaceWorkbookSourcePath(value: unknown): boolean {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized.endsWith(".xls") || normalized.endsWith(".xlsx");
}

function normalizeContentHash(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

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
