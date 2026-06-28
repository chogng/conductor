/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { URI } from "../../../../../base/common/uri.ts";
import {
  buildFileSourceIdentityKey,
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
});

function createScannedFile(
  relativePath: string,
  size: number,
  lastModified: number,
): FolderImportFileSource {
  const fileName = relativePath.split("/").at(-1) ?? relativePath;
  return {
    canUseNativePath: true,
    fileName,
    kind: "path",
    lastModified,
    loadFile: async () => new File([""], fileName, { lastModified }),
    relativePath,
    resource: URI.file(`/data/${relativePath}`),
    size,
  };
}

function createFileEntry(source: FolderImportFileSource): FileEntry {
  const relativePath = source.relativePath ?? source.fileName;
  return {
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
