/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { URI } from "src/cs/base/common/uri";
import type {
  FileWriteLockState,
  IFileService,
} from "src/cs/platform/files/common/files";
import { DiskFileSystemProvider } from "src/cs/platform/files/node/diskFileSystemProvider";
import {
  buildFileSourceIdentityKey,
  collectFolderImportFiles,
} from "src/cs/workbench/contrib/files/browser/fileImportExport";
import {
  resolveWorkspaceExternalChanges,
  WorkspaceLockedWorkbookChangeTracker,
  type WorkspaceFileEntry,
} from "src/cs/workbench/services/workspaces/common/externalChanges";

suite("workbench/contrib/workspaces/test/node/externalChanges.integration", () => {
  test("detects real xls, xlsx, and csv disk writes", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "conductor-external-changes-"));
    try {
      writeFixtures(root);
      const { filesService } = createDiskFileService();
      const folder = URI.file(root);
      const baseline = await collectFolderImportFiles(folder, filesService);
      const currentFiles = createWorkspaceEntries(baseline.files);

      fs.appendFileSync(path.join(root, "legacy.xls"), Buffer.from([4, 5]));
      fs.appendFileSync(path.join(root, "modern.xlsx"), Buffer.from([14, 15]));
      fs.appendFileSync(path.join(root, "data.csv"), "2,3\n", "utf8");

      const changed = await collectFolderImportFiles(folder, filesService);
      const changes = resolveWorkspaceExternalChanges({
        excludedSourcePaths: new Set<string>(),
        files: currentFiles,
        scannedFiles: changed.files,
      });

      assert.deepEqual(getChangedFileNames(changes.modified), [
        "data.csv",
        "legacy.xls",
        "modern.xlsx",
      ]);
    } finally {
      fs.rmSync(root, { force: true, recursive: true });
    }
  });

  test("ignores physical open mutations and detects later physical saves while locked", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "conductor-locked-saves-"));
    try {
      writeFixtures(root);
      const lockStates = new Map<string, FileWriteLockState>();
      const { filesService } = createDiskFileService(lockStates);
      const folder = URI.file(root);
      const baseline = await collectFolderImportFiles(folder, filesService);
      const currentFiles = createWorkspaceEntries(baseline.files);
      const tracker = new WorkspaceLockedWorkbookChangeTracker();
      lockStates.set("legacy.xls", "locked");
      lockStates.set("modern.xlsx", "locked");

      fs.appendFileSync(path.join(root, "legacy.xls"), Buffer.from([20]));
      fs.appendFileSync(path.join(root, "modern.xlsx"), Buffer.from([30]));
      const opened = await collectFolderImportFiles(folder, filesService);
      tracker.observe(currentFiles, opened.files);
      const openChanges = resolveWorkspaceExternalChanges({
        confirmedLockedWorkbookPaths: tracker.confirmedPaths,
        excludedSourcePaths: new Set<string>(),
        files: currentFiles,
        scannedFiles: opened.files,
      });
      assert.deepEqual(getChangedFileNames(openChanges.modified), []);

      fs.appendFileSync(path.join(root, "legacy.xls"), Buffer.from([21]));
      fs.appendFileSync(path.join(root, "modern.xlsx"), Buffer.from([31]));
      const saved = await collectFolderImportFiles(folder, filesService);
      tracker.observe(currentFiles, saved.files);
      const saveChanges = resolveWorkspaceExternalChanges({
        confirmedLockedWorkbookPaths: tracker.confirmedPaths,
        excludedSourcePaths: new Set<string>(),
        files: currentFiles,
        scannedFiles: saved.files,
      });

      assert.deepEqual(getChangedFileNames(saveChanges.modified), [
        "legacy.xls",
        "modern.xlsx",
      ]);
    } finally {
      fs.rmSync(root, { force: true, recursive: true });
    }
  });
});

function writeFixtures(root: string): void {
  fs.writeFileSync(path.join(root, "legacy.xls"), Buffer.from([0, 1, 2, 3]));
  fs.writeFileSync(path.join(root, "modern.xlsx"), Buffer.from([10, 11, 12, 13]));
  fs.writeFileSync(path.join(root, "data.csv"), "x,y\n0,1\n", "utf8");
}

function createDiskFileService(
  lockStates = new Map<string, FileWriteLockState>(),
): { readonly filesService: IFileService } {
  const provider = new DiskFileSystemProvider();
  const filesService = {
    getProvider: () => undefined,
    getWriteLockState: async (resource: URI): Promise<FileWriteLockState> =>
      lockStates.get(path.basename(resource.fsPath)) ?? provider.getWriteLockState(resource),
    readDir: (resource: URI) => provider.readDir(resource),
    readFile: (resource: URI) => provider.readFile(resource),
    stat: (resource: URI) => provider.stat(resource),
  } as unknown as IFileService;
  return { filesService };
}

function createWorkspaceEntries(
  files: Awaited<ReturnType<typeof collectFolderImportFiles>>["files"],
): WorkspaceFileEntry[] {
  return files.map(file => ({
    contentHash: file.contentHash,
    fileName: file.fileName,
    itemKey: buildFileSourceIdentityKey(
      file.fileName,
      file.size,
      file.lastModified,
      file.relativePath,
    ),
    relativePath: file.relativePath,
  }));
}

function getChangedFileNames(
  changes: readonly { readonly relativePath: string }[],
): string[] {
  return changes
    .map(change => change.relativePath.split("/").at(-1) ?? change.relativePath)
    .sort((first, second) => first.localeCompare(second));
}
