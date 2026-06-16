/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import type { FileRecord } from "src/cs/workbench/services/session/common/sessionModel";

import {
  buildExplorerTree,
  createChartExplorerFiles,
  createChartExplorerFilesFromRecords,
  createRawExplorerFiles,
  mergeExplorerSourceEntries,
} from "src/cs/workbench/contrib/files/common/explorerModel";

suite("workbench/contrib/files/common/explorerModel", () => {
  test("createRawExplorerFiles projects consumed assessment labels", () => {
    assert.deepEqual(
      createRawExplorerFiles([
        {
          fileId: "raw-1",
          fileName: "raw.csv",
          itemKey: "raw-key",
          relativePath: "batch/raw.csv",
          sourceKey: "source-key",
          sourcePath: "C:/data/raw.csv",
          curveType: "output (vd)",
          curveTypeConfidence: "medium",
          curveTypeNeedsTemplate: false,
          curveTypeReasons: ["Shape evidence matches output-style Id-Vd behavior."],
          xAxisRole: "vd",
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
          sourceKey: "source-key",
          sourcePath: "C:/data/raw.csv",
          badgeState: { kind: "ready" },
          curveType: "output (vd)",
          curveTypeBadgeLabel: "output",
          curveTypeConfidence: "medium",
          curveTypeNeedsTemplate: false,
          curveTypeReasons: ["Shape evidence matches output-style Id-Vd behavior."],
        },
      ],
    );
  });

  test("createChartExplorerFiles projects processed files with source paths", () => {
    const files = createChartExplorerFiles(
      [
        {
          fileId: "raw-1",
          fileName: "raw.csv",
          itemKey: "raw-key",
          relativePath: "batch/raw.csv",
          sourceKey: "source-key",
          sourcePath: "C:/data/raw.csv",
          curveType: "unknown",
          curveTypeConfidence: "low",
        },
      ],
      [
        {
          fileId: "raw-1",
          fileName: "processed.csv",
          curveType: "iv",
          curveTypeConfidence: "high",
        },
      ],
    );

    assert.deepEqual(files, [
      {
        file: undefined,
        fileId: "raw-1",
        fileName: "processed.csv",
        itemKey: "raw-key",
        normalizedCsvPath: undefined,
        relativePath: "batch/raw.csv",
        sourceKey: "source-key",
        sourcePath: "C:/data/raw.csv",
        badgeState: { kind: "ready" },
        curveType: "iv",
        curveTypeBadgeLabel: "iv",
        curveTypeConfidence: "high",
        curveTypeNeedsTemplate: undefined,
        curveTypeReasons: undefined,
      },
    ]);
  });

  test("createChartExplorerFiles only includes processed files with ids", () => {
    assert.deepEqual(
      createChartExplorerFiles(
        [{ fileId: "raw-only", fileName: "raw.csv" }],
        [{ fileName: "missing-id.csv" }],
      ),
      [],
    );
  });

  test("createChartExplorerFilesFromRecords projects canonical files", () => {
    const files = createChartExplorerFilesFromRecords(
      {
        "raw-1": createFileRecord("raw-1"),
      },
      ["raw-1"],
      [
        {
          fileId: "raw-1",
          fileName: "raw.csv",
          itemKey: "source-item",
          sourceKey: "source-key",
          sourcePath: "C:/source/raw.csv",
          curveType: "unknown",
          curveTypeConfidence: "low",
          curveTypeNeedsTemplate: true,
        },
      ],
    );

    assert.deepEqual(files, [
      {
        file: undefined,
        fileId: "raw-1",
        fileName: "canonical.csv",
        itemKey: "source-item",
        normalizedCsvPath: "C:/normalized/raw.csv",
        relativePath: "batch/canonical.csv",
        sourceKey: "source-key",
        sourcePath: "C:/canonical/raw.csv",
        badgeState: { kind: "ready" },
        curveType: "transfer",
        curveTypeBadgeLabel: "transfer",
        curveTypeConfidence: "low",
        curveTypeNeedsTemplate: true,
        curveTypeReasons: undefined,
      },
    ]);
  });

  test("createChartExplorerFilesFromRecords skips raw-only canonical files", () => {
    assert.deepEqual(
      createChartExplorerFilesFromRecords(
        {
          "raw-only": createFileRecord("raw-only", { hasChartData: false }),
        },
        ["raw-only"],
      ),
      [],
    );
  });

  test("createRawExplorerFiles projects pending badge state before assessment", () => {
    assert.deepEqual(
      createRawExplorerFiles([
        {
          fileId: "raw-1",
          fileName: "raw.csv",
          relativePath: "batch/raw.csv",
          sourceKey: "source-key",
          sourceVersion: 1,
        },
      ]),
      [
        {
          file: undefined,
          fileId: "raw-1",
          fileName: "raw.csv",
          itemKey: undefined,
          normalizedCsvPath: undefined,
          relativePath: "batch/raw.csv",
          sourceKey: "source-key",
          sourcePath: undefined,
          badgeState: { kind: "pending" },
          curveType: null,
          curveTypeBadgeLabel: null,
          curveTypeConfidence: undefined,
          curveTypeNeedsTemplate: undefined,
          curveTypeReasons: undefined,
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
            sourceKey: "source-ready",
          },
        ],
        pendingSourceEntries: [
          {
            fileName: "ready.csv",
            sourceKey: "source-ready",
            sourceStatus: "preparing",
          },
          {
            fileName: "later.csv",
            sourceKey: "source-later",
            sourceStatus: "pending",
          },
        ],
      }),
      [
        {
          fileId: "file-1",
          fileName: "ready.csv",
          sourceKey: "source-ready",
        },
        {
          fileName: "later.csv",
          sourceKey: "source-later",
          sourceStatus: "pending",
        },
      ],
    );
  });

  test("mergeExplorerSourceEntries replaces by source order and prefers committed files", () => {
    assert.deepEqual(
      mergeExplorerSourceEntries({
        files: [
          {
            fileId: "old",
            fileName: "old.csv",
            sourceKey: "source-old",
          },
          {
            fileId: "ready",
            fileName: "ready.csv",
            sourceKey: "source-ready",
          },
        ],
        pendingSourceEntries: [
          {
            fileName: "ready.csv",
            sourceKey: "source-ready",
            sourceStatus: "preparing",
          },
          {
            fileName: "later.csv",
            sourceKey: "source-later",
            sourceStatus: "pending",
          },
        ],
        replaceSourceKeys: ["source-ready", "source-later"],
      }),
      [
        {
          fileId: "ready",
          fileName: "ready.csv",
          sourceKey: "source-ready",
        },
        {
          fileName: "later.csv",
          sourceKey: "source-later",
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

const createFileRecord = (
  fileId: string,
  options: { readonly hasChartData?: boolean } = {},
): FileRecord => {
  const hasChartData = options.hasChartData ?? true;
  return {
    assessmentsByRawTableId: {},
    curvesByKey: hasChartData
      ? {
        "base:iv:transfer:series-1": {
          curveFamily: "iv",
          curveGeneration: "base",
          fileId,
          ivMode: "transfer",
          lineage: {
            baseFamily: "iv",
            baseSeries: { fileId, seriesId: "series-1" },
            curveGeneration: "base",
            ivMode: "transfer",
          },
          points: [{ x: 0, y: 1 }],
          seriesId: "series-1",
          signature: "base-signature",
        },
      }
      : {},
    id: fileId,
    kind: "csv",
    measurementBlockOrder: [],
    measurementBlocksById: {},
    metricsByKey: {},
    name: "canonical.csv",
    raw: {
      fileId,
      fileName: "canonical.csv",
      filePath: "C:/canonical/raw.csv",
      normalizedCsvPath: "C:/normalized/raw.csv",
      rawKey: "record-key",
      relativePath: "batch/canonical.csv",
      tableOrder: [],
      tablesById: {},
    },
    rawTableVersionsById: {},
    seriesById: hasChartData
      ? {
        "series-1": {
          fileId,
          groupIndex: 0,
          id: "series-1",
          y: [1],
        },
      }
      : {},
    seriesOrder: hasChartData ? ["series-1"] : [],
    templateRunsById: {},
  };
};
