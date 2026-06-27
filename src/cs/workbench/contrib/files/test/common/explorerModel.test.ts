/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import {
  buildExplorerTree,
  createExplorerFilePresentationSignature,
  createExplorerTreeStructureSignature,
  createRawExplorerFiles,
  getExplorerTreeFileKey,
  mergeExplorerSourceEntries,
} from "src/cs/workbench/contrib/files/common/explorerModel";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";

suite("workbench/contrib/files/common/explorerModel", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("getExplorerTreeFileKey matches buildExplorerTree file key rules", () => {
    const emptyFileIdEntry = {
      fileId: "",
      itemKey: "source-item",
      fileName: "raw.csv",
      relativePath: "batch/raw.csv",
    };
    const fileIdItemKeyEntry = {
      fileId: "file-a",
      fileName: "raw.csv",
      relativePath: "batch/raw.csv",
      itemKey: "item-key",
    };
    const itemKeyEntry = {
      itemKey: "source-item",
      fileName: "raw.csv",
      relativePath: "batch/raw.csv",
    };
    const fallbackEntry = {
      fileName: "raw.csv",
      relativePath: "batch/raw.csv",
    };

    assert.equal(getExplorerTreeFileKey(emptyFileIdEntry), "source-item");
    assert.equal(buildExplorerTree([emptyFileIdEntry])[0]?.children?.[0]?.key, "source-item");
    assert.equal(getExplorerTreeFileKey(itemKeyEntry), "source-item");
    assert.equal(buildExplorerTree([itemKeyEntry])[0]?.children?.[0]?.key, "source-item");
    assert.equal(getExplorerTreeFileKey(fileIdItemKeyEntry), "item-key");
    assert.equal(buildExplorerTree([fileIdItemKeyEntry])[0]?.children?.[0]?.key, "item-key");
    assert.equal(getExplorerTreeFileKey(fallbackEntry), "file:batch/raw.csv");
    assert.equal(buildExplorerTree([fallbackEntry])[0]?.children?.[0]?.key, "file:batch/raw.csv");
  });

  test("createExplorerFilePresentationSignature ignores chart-only metadata", () => {
    const options = {
      badgeColorSignature: "output:green",
      isEditing: false,
      templateLabel: "Recommended template",
      templateSelectionId: "auto",
    };
    const file = {
      fileId: "file-a",
      fileName: "A.csv",
    } as const;

    assert.equal(
      createExplorerFilePresentationSignature(file, options),
      createExplorerFilePresentationSignature({
        ...file,
        chartMessage: "Ready",
        chartState: "ready",
        hasChartData: true,
      }, options),
    );
  });

  test("createExplorerTreeStructureSignature ignores chart-only metadata", () => {
    const files = [
      {
        fileId: "file-a",
        fileName: "A.csv",
        itemKey: "raw:a",
        relativePath: "folder/A.csv",
      },
      {
        fileId: "file-b",
        fileName: "B.csv",
        itemKey: "raw:b",
        relativePath: "folder/B.csv",
      },
    ];

    assert.equal(
      createExplorerTreeStructureSignature(files),
      createExplorerTreeStructureSignature(files.map(file => ({
        ...file,
        chartMessage: "Ready",
        chartState: "ready",
        hasChartData: true,
      }))),
    );

    assert.notEqual(
      createExplorerTreeStructureSignature(files),
      createExplorerTreeStructureSignature([
        files[0],
        {
          ...files[1],
          relativePath: "renamed/B.csv",
        },
      ]),
    );

    assert.notEqual(
      createExplorerTreeStructureSignature(files),
      createExplorerTreeStructureSignature([
        files[0],
        {
          ...files[1],
          itemKey: "raw:b-next",
        },
      ]),
    );
  });

  test("createRawExplorerFiles projects source identity fields", () => {
    assert.deepEqual(
      createRawExplorerFiles([
        {
          fileId: "raw-1",
          fileName: "raw.csv",
          itemKey: "raw-key",
          relativePath: "batch/raw.csv",
          tableKey: "item-key",
          sourcePath: "C:/data/raw.csv",
        },
      ]),
      [
        {
          file: undefined,
          fileId: "raw-1",
          fileName: "raw.csv",
          itemKey: "raw-key",
          normalizedCsvPath: undefined,
          relativePath: "batch/raw.csv",
          sourcePath: "C:/data/raw.csv",
          fileVersion: undefined,
        },
      ],
    );
  });

  test("createRawExplorerFiles projects table identity for multi-sheet rows", () => {
    assert.deepEqual(
      createRawExplorerFiles([
        {
          fileId: "workbook",
          fileName: "Workbook.xlsx",
          sheetId: "sheet-b",
          sheetName: "Sweep B",
          sourcePath: "C:/data/Workbook.xlsx",
          tableKey: "table-key-b",
        },
      ]),
      [
        {
          file: undefined,
          fileId: "workbook",
          fileName: "Workbook.xlsx",
          itemKey: "table-key-b",
          normalizedCsvPath: undefined,
          relativePath: null,
          sheetId: "sheet-b",
          sheetName: "Sweep B",
          sourcePath: "C:/data/Workbook.xlsx",
          fileVersion: undefined,
        },
      ],
    );
  });

  test("createRawExplorerFiles omits legacy badge state", () => {
    assert.deepEqual(
      createRawExplorerFiles([
        {
          fileId: "raw-1",
          fileName: "raw.csv",
          relativePath: "batch/raw.csv",
          itemKey: "item-key",
          sourceVersion: 1,
        },
      ]),
      [
        {
          file: undefined,
          fileId: "raw-1",
          fileName: "raw.csv",
          normalizedCsvPath: undefined,
          relativePath: "batch/raw.csv",
          itemKey: "item-key",
          sourcePath: undefined,
          fileVersion: 1,
        },
      ],
    );
  });

  test("mergeExplorerSourceEntries appends only unresolved pending sources", () => {
    assert.deepEqual(
      mergeExplorerSourceEntries({
        files: [
          {
            fileId: "file-1",
            fileName: "ready.csv",
            itemKey: "source-ready",
          },
        ],
        pendingSourceEntries: [
          {
            fileName: "ready.csv",
            itemKey: "source-ready",
            sourceStatus: "preparing",
          },
          {
            fileName: "later.csv",
            itemKey: "source-later",
            sourceStatus: "pending",
          },
        ],
      }),
      [
        {
          fileId: "file-1",
          fileName: "ready.csv",
          itemKey: "source-ready",
        },
        {
          fileName: "later.csv",
          itemKey: "source-later",
          sourceStatus: "pending",
        },
      ],
    );
  });

  test("mergeExplorerSourceEntries replaces by item order and prefers committed files", () => {
    assert.deepEqual(
      mergeExplorerSourceEntries({
        files: [
          {
            fileId: "old",
            fileName: "old.csv",
            itemKey: "source-old",
          },
          {
            fileId: "ready",
            fileName: "ready.csv",
            itemKey: "source-ready",
          },
        ],
        pendingSourceEntries: [
          {
            fileName: "ready.csv",
            itemKey: "source-ready",
            sourceStatus: "preparing",
          },
          {
            fileName: "later.csv",
            itemKey: "source-later",
            sourceStatus: "pending",
          },
        ],
        replaceItemKeys: ["source-ready", "source-later"],
      }),
      [
        {
          fileId: "ready",
          fileName: "ready.csv",
          itemKey: "source-ready",
        },
        {
          fileName: "later.csv",
          itemKey: "source-later",
          sourceStatus: "pending",
        },
      ],
    );
  });

  test("buildExplorerTree nests related files by configured patterns", () => {
    const tree = buildExplorerTree(
      [
        {
          fileId: "parent",
          fileName: "device.csv",
          relativePath: "batch/device.csv",
        },
        {
          fileId: "child",
          fileName: "device.meta.csv",
          relativePath: "batch/device.meta.csv",
        },
        {
          fileId: "other-dir-child",
          fileName: "device.meta.csv",
          relativePath: "other/device.meta.csv",
        },
      ],
      {
        fileNestingPatterns: [["*.csv", ["$(basename).meta.csv"]]],
      },
    );

    assert.deepEqual(tree.map(node => node.name), ["batch", "other"]);
    const batch = tree[0];
    assert.equal(batch.kind, "folder");
    assert.deepEqual(batch.children?.map(node => node.name), ["device.csv"]);
    assert.deepEqual(batch.children?.[0].children?.map(node => node.name), [
      "device.meta.csv",
    ]);

    const other = tree[1];
    assert.deepEqual(other.children?.map(node => node.name), ["device.meta.csv"]);
  });
});
