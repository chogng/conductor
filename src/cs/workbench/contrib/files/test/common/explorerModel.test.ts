/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import {
  buildExplorerTree,
  createExplorerFilePresentationSignature,
  createExplorerTreeStructureSignature,
  getExplorerFileSourceIdentityKey,
  getExplorerTreeFileKey,
} from "src/cs/workbench/contrib/files/common/explorerModel";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";
import { URI } from "src/cs/base/common/uri";

suite("workbench/contrib/files/common/explorerModel", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("getExplorerTreeFileKey matches buildExplorerTree file key rules", () => {
    const emptyFileIdEntry = {
      fileId: "",
      itemKey: "source-item",
      fileName: "raw.csv",
      relativePath: "batch/raw.csv",
      resource: URI.file("/workspace/raw.csv"),
    };
    const fileIdItemKeyEntry = {
      fileId: "file-a",
      fileName: "raw.csv",
      relativePath: "batch/raw.csv",
      itemKey: "item-key",
      resource: URI.file("/workspace/raw.csv"),
    };
    const itemKeyEntry = {
      itemKey: "source-item",
      fileName: "raw.csv",
      relativePath: "batch/raw.csv",
      resource: URI.file("/workspace/raw.csv"),
    };
    const fallbackEntry = {
      fileName: "raw.csv",
      relativePath: "batch/raw.csv",
      resource: URI.file("/workspace/raw.csv"),
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
      resource: URI.file("/workspace/A.csv"),
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
        resource: URI.file("/workspace/folder/A.csv"),
      },
      {
        fileId: "file-b",
        fileName: "B.csv",
        itemKey: "raw:b",
        relativePath: "folder/B.csv",
        resource: URI.file("/workspace/folder/B.csv"),
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

  test("getExplorerFileSourceIdentityKey scopes resource identity by sheet id", () => {
    const resource = URI.file("C:/data/raw.csv");

    assert.notEqual(
      getExplorerFileSourceIdentityKey({
        fileId: "file-a",
        fileName: "raw.csv",
        resource,
        sheetId: "file-a",
      }),
      getExplorerFileSourceIdentityKey({
        fileId: "file-b",
        fileName: "raw.csv",
        resource,
      }),
    );
  });

  test("getExplorerFileSourceIdentityKey keeps real sheet targets separate", () => {
    const resource = URI.file("C:/data/workbook.xlsx");

    assert.notEqual(
      getExplorerFileSourceIdentityKey({
        fileId: "workbook",
        fileName: "workbook.xlsx",
        resource,
        sheetId: "sheet-a",
      }),
      getExplorerFileSourceIdentityKey({
        fileId: "workbook",
        fileName: "workbook.xlsx",
        resource,
        sheetId: "sheet-b",
      }),
    );
  });

  test("buildExplorerTree nests related files by configured patterns", () => {
    const tree = buildExplorerTree(
      [
        {
          fileId: "parent",
          fileName: "device.csv",
          relativePath: "batch/device.csv",
          resource: URI.file("/workspace/batch/device.csv"),
        },
        {
          fileId: "child",
          fileName: "device.meta.csv",
          relativePath: "batch/device.meta.csv",
          resource: URI.file("/workspace/batch/device.meta.csv"),
        },
        {
          fileId: "other-dir-child",
          fileName: "device.meta.csv",
          relativePath: "other/device.meta.csv",
          resource: URI.file("/workspace/other/device.meta.csv"),
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
