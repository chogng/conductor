/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { URI } from "../../../../../base/common/uri.ts";
import {
  buildFileSourceIdentityKey,
  isWorkspaceTransientSourcePath,
  WorkspaceLockedWorkbookChangeTracker,
  type FileEntry,
} from "../../../../../workbench/services/workspaces/common/externalChanges.ts";
import type { FolderImportFileSource } from "../../../../../workbench/services/workspaces/common/externalChanges.ts";
import { resolveWorkspaceExternalChanges } from "../../../../../workbench/services/workspaces/common/externalChanges.ts";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";

suite("workbench/contrib/workspaces/test/browser/externalChanges", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("detects external additions, modifications, and deletions", () => {
    const unchanged = createScannedFile("root/unchanged.csv", 10, 1);
    const modified = createScannedFile("root/modified.csv", 20, 2);
    const added = createScannedFile("root/added.csv", 30, 3);
    const files: FileEntry[] = [
      createFileEntry(unchanged),
      createFileEntry(createScannedFile("root/modified.csv", 20, 1)),
      createFileEntry(createScannedFile("root/deleted.csv", 40, 1)),
    ];

    const changes = resolveWorkspaceExternalChanges({
      excludedSourcePaths: new Set<string>(),
      files,
      scannedFiles: [unchanged, modified, added],
    });

    assert.deepEqual(changes.added.map(change => change.relativePath), ["root/added.csv"]);
    assert.deepEqual(changes.modified.map(change => change.relativePath), ["root/modified.csv"]);
    assert.deepEqual(changes.deleted.map(change => change.relativePath), ["root/deleted.csv"]);
  });

  test("does not report excluded external additions", () => {
    const added = createScannedFile("root/removed-by-user.csv", 30, 3);

    const changes = resolveWorkspaceExternalChanges({
      excludedSourcePaths: new Set<string>(["root/removed-by-user.csv"]),
      files: [],
      scannedFiles: [added],
    });

    assert.equal(changes.added.length, 0);
    assert.equal(changes.modified.length, 0);
    assert.equal(changes.deleted.length, 0);
  });

  test("ignores transient office source files", () => {
    const currentLock = createScannedFile("root/~$open.xlsx", 10, 1);
    const scannedLock = createScannedFile("root/.~lock.open.xlsx#", 20, 2);

    const changes = resolveWorkspaceExternalChanges({
      excludedSourcePaths: new Set<string>(),
      files: [createFileEntry(currentLock)],
      scannedFiles: [scannedLock],
    });

    assert.deepEqual(changes, {
      added: [],
      modified: [],
      deleted: [],
    });
    assert.equal(isWorkspaceTransientSourcePath("root/~$OPEN.XLSX"), true);
    assert.equal(isWorkspaceTransientSourcePath("root/.~lock.open.xlsx#"), true);
    assert.equal(isWorkspaceTransientSourcePath("root/open.xlsx"), false);
  });

  test("uses workbook content hashes instead of timestamp identity", () => {
    const original = createScannedFile("root/open.xls", 10, 1, "sha256:same");
    const timestampOnlyChange = createScannedFile("root/open.xls", 10, 2, "sha256:same", "locked");
    const temporarilyUnreadable = createScannedFile("root/open.xls", 10, 2, undefined, "locked");
    const legacyBaseline = createScannedFile("root/open.xls", 10, 1);
    const contentChange = createScannedFile("root/open.xls", 10, 2, "sha256:changed");
    const openMutation = createScannedFile("root/open.xls", 10, 2, "sha256:open", "locked");

    const unchanged = resolveWorkspaceExternalChanges({
      excludedSourcePaths: new Set<string>(),
      files: [createFileEntry(original)],
      scannedFiles: [timestampOnlyChange],
    });
    const modified = resolveWorkspaceExternalChanges({
      excludedSourcePaths: new Set<string>(),
      files: [createFileEntry(original)],
      scannedFiles: [contentChange],
    });
    const unreadable = resolveWorkspaceExternalChanges({
      excludedSourcePaths: new Set<string>(),
      files: [createFileEntry(original)],
      scannedFiles: [temporarilyUnreadable],
    });
    const missingBaseline = resolveWorkspaceExternalChanges({
      excludedSourcePaths: new Set<string>(),
      files: [createFileEntry(legacyBaseline)],
      scannedFiles: [timestampOnlyChange],
    });
    const ignoredOpenMutation = resolveWorkspaceExternalChanges({
      excludedSourcePaths: new Set<string>(),
      files: [createFileEntry(original)],
      scannedFiles: [openMutation],
    });
    const confirmedLockedSave = resolveWorkspaceExternalChanges({
      confirmedLockedWorkbookPaths: new Set(["root/open.xls"]),
      excludedSourcePaths: new Set<string>(),
      files: [createFileEntry(original)],
      scannedFiles: [openMutation],
    });

    assert.equal(unchanged.modified.length, 0);
    assert.equal(unreadable.modified.length, 0);
    assert.equal(missingBaseline.modified.length, 0);
    assert.equal(ignoredOpenMutation.modified.length, 0);
    assert.deepEqual(
      confirmedLockedSave.modified.map(change => change.relativePath),
      ["root/open.xls"],
    );
    assert.deepEqual(modified.modified.map(change => change.relativePath), ["root/open.xls"]);
  });

  test("tracks xls and xlsx saves independently after their locked open mutations", () => {
    const legacyPath = "root/legacy.xls";
    const modernPath = "root/modern.xlsx";
    const legacyOriginal = createScannedFile(legacyPath, 10, 1, "sha256:legacy-original");
    const modernOriginal = createScannedFile(modernPath, 20, 1, "sha256:modern-original");
    const legacyOpened = createScannedFile(legacyPath, 10, 2, "sha256:legacy-opened", "locked");
    const modernOpened = createScannedFile(modernPath, 20, 2, "sha256:modern-opened", "locked");
    const modernSaved = createScannedFile(modernPath, 21, 3, "sha256:modern-saved", "locked");
    const tracker = new WorkspaceLockedWorkbookChangeTracker();
    const currentFiles = [createFileEntry(legacyOriginal), createFileEntry(modernOriginal)];

    tracker.observe(currentFiles, [legacyOpened, modernOpened]);
    tracker.observe(currentFiles, [legacyOpened, modernOpened]);
    assert.deepEqual([...tracker.confirmedPaths], []);

    tracker.observe(currentFiles, [legacyOpened, modernSaved]);
    assert.deepEqual([...tracker.confirmedPaths], [modernPath]);

    const changes = resolveWorkspaceExternalChanges({
      confirmedLockedWorkbookPaths: tracker.confirmedPaths,
      excludedSourcePaths: new Set<string>(),
      files: currentFiles,
      scannedFiles: [legacyOpened, modernSaved],
    });
    assert.deepEqual(changes.modified.map(change => change.relativePath), [modernPath]);

    tracker.observe(currentFiles, [
      createScannedFile(legacyPath, 10, 1, "sha256:legacy-original", "unlocked"),
      modernSaved,
    ]);
    assert.equal(tracker.confirmedPaths.has(legacyPath), false);

    tracker.clear([modernPath]);
    assert.deepEqual([...tracker.confirmedPaths], []);
  });

  test("keeps csv modification detection independent from workbook lock tracking", () => {
    const original = createScannedFile("root/data.csv", 10, 1);
    const modified = createScannedFile("root/data.csv", 10, 2);
    const tracker = new WorkspaceLockedWorkbookChangeTracker();

    tracker.observe([createFileEntry(original)], [modified]);
    const changes = resolveWorkspaceExternalChanges({
      confirmedLockedWorkbookPaths: tracker.confirmedPaths,
      excludedSourcePaths: new Set<string>(),
      files: [createFileEntry(original)],
      scannedFiles: [modified],
    });

    assert.deepEqual(changes.modified.map(change => change.relativePath), ["root/data.csv"]);
    assert.deepEqual([...tracker.confirmedPaths], []);
  });
});

function createScannedFile(
  relativePath: string,
  size: number,
  lastModified: number,
  contentHash?: string,
  writeLockState?: "locked" | "unlocked" | "unknown",
): FolderImportFileSource {
  const fileName = relativePath.split("/").at(-1) ?? relativePath;
  return {
    canUseNativePath: true,
    contentHash,
    fileName,
    kind: "path",
    lastModified,
    loadFile: async () => new File([""], fileName, { lastModified }),
    relativePath,
    resource: URI.file(`/data/${relativePath}`),
    size,
    writeLockState,
  };
}

function createFileEntry(source: FolderImportFileSource): FileEntry {
  const relativePath = source.relativePath ?? source.fileName;
  return {
    contentHash: source.contentHash,
    fileId: relativePath,
    fileName: source.fileName,
    itemKey: buildFileSourceIdentityKey(
      source.fileName,
      source.size,
      source.lastModified,
      relativePath,
    ) || undefined,
    relativePath,
  };
}
