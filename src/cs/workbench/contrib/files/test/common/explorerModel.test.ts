/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import type { FileRecord } from "src/cs/workbench/services/session/common/sessionModel";

import {
  buildExplorerTree,
  createExplorerFilePresentationSignature,
  createExplorerTreeStructureSignature,
  createChartExplorerFiles,
  createChartExplorerFilesFromRecords,
  createRawExplorerFiles,
  getExplorerTreeFileKey,
  mergeExplorerSourceEntries,
  summarizeExplorerBadgeProjection,
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
    const itemKeyEntry = {
      itemKey: "source-item",
      fileName: "raw.csv",
      relativePath: "batch/raw.csv",
    };
    const fallbackEntry = {
      fileName: "raw.csv",
      relativePath: "batch/raw.csv",
    };

    assert.equal(getExplorerTreeFileKey(emptyFileIdEntry), "");
    assert.equal(buildExplorerTree([emptyFileIdEntry])[0]?.children?.[0]?.key, "");
    assert.equal(getExplorerTreeFileKey(itemKeyEntry), "source-item");
    assert.equal(buildExplorerTree([itemKeyEntry])[0]?.children?.[0]?.key, "source-item");
    assert.equal(getExplorerTreeFileKey(fallbackEntry), "file:batch/raw.csv");
    assert.equal(buildExplorerTree([fallbackEntry])[0]?.children?.[0]?.key, "file:batch/raw.csv");
  });

  test("summarizeExplorerBadgeProjection ignores chart-only metadata", () => {
    const tableSummary = summarizeExplorerBadgeProjection([
      {
        badgeState: {
          confidence: "confirmed",
          kind: "ready",
          label: "transfer",
          source: "assessment",
        },
        fileId: "file-a",
        fileName: "A.csv",
      },
      {
        badgeState: {
          kind: "unknown",
          source: "assessment",
        },
        fileId: "file-b",
        fileName: "B.csv",
      },
    ]);
    const chartSummary = summarizeExplorerBadgeProjection([
      {
        badgeState: {
          confidence: "confirmed",
          kind: "ready",
          label: "transfer",
          source: "assessment",
        },
        chartMessage: "Ready",
        chartState: "ready",
        fileId: "file-a",
        fileName: "Processed A.csv",
        hasChartData: true,
      },
      {
        badgeState: {
          kind: "unknown",
          source: "assessment",
        },
        chartState: "none",
        fileId: "file-b",
        fileName: "Processed B.csv",
        hasChartData: false,
      },
    ]);

    assert.equal(tableSummary.signature, chartSummary.signature);
    assert.deepEqual(
      {
        assessmentBadgeCount: tableSummary.assessmentBadgeCount,
        failedSourceCount: tableSummary.failedSourceCount,
        fastBadgeCount: tableSummary.fastBadgeCount,
        loadingSourceCount: tableSummary.loadingSourceCount,
        pendingBadgeCount: tableSummary.pendingBadgeCount,
        totalFileCount: tableSummary.totalFileCount,
      },
      {
        assessmentBadgeCount: chartSummary.assessmentBadgeCount,
        failedSourceCount: chartSummary.failedSourceCount,
        fastBadgeCount: chartSummary.fastBadgeCount,
        loadingSourceCount: chartSummary.loadingSourceCount,
        pendingBadgeCount: chartSummary.pendingBadgeCount,
        totalFileCount: chartSummary.totalFileCount,
      },
    );

    const skippedSummary = summarizeExplorerBadgeProjection([
      {
        badgeState: {
          confidence: "confirmed",
          kind: "ready",
          label: "transfer",
          source: "assessment",
        },
        fileId: "file-a",
        fileName: "A.csv",
      },
      {
        badgeState: {
          kind: "error",
          message: "Skipped",
        },
        chartState: "skipped",
        fileId: "file-b",
        fileName: "B.csv",
      },
    ]);
    assert.notEqual(tableSummary.signature, skippedSummary.signature);
    assert.equal(skippedSummary.assessmentBadgeCount, 1);
  });

  test("createExplorerFilePresentationSignature ignores chart-only metadata", () => {
    const options = {
      badgeColorSignature: "output:green",
      isEditing: false,
      templateLabel: "Auto extraction",
      templateSelectionId: "auto",
    };
    const file = {
      badgeState: {
        confidence: "confirmed",
        kind: "ready",
        label: "output",
        source: "assessment",
      },
      curveType: "output",
      curveTypeBadgeLabel: "output",
      curveTypeConfidence: "high",
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

    assert.notEqual(
      createExplorerFilePresentationSignature(file, options),
      createExplorerFilePresentationSignature({
        ...file,
        badgeState: {
          kind: "error",
          message: "Skipped",
        },
        chartMessage: "Skipped",
        chartState: "skipped",
        hasChartData: false,
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
  });

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
          curveTypeNeedsReview: false,
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
          badgeState: {
            confidence: "confirmed",
            kind: "ready",
            label: "output",
            source: "assessment",
          },
          curveType: "output (vd)",
          curveTypeBadgeLabel: "output",
          curveTypeConfidence: "medium",
          curveTypeNeedsReview: false,
          curveTypeReasons: ["Shape evidence matches output-style Id-Vd behavior."],
          fileVersion: undefined,
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
        chartState: "ready",
        file: undefined,
        fileId: "raw-1",
        fileName: "processed.csv",
        hasChartData: true,
        itemKey: "raw-key",
        normalizedCsvPath: undefined,
        relativePath: "batch/raw.csv",
        sourceKey: "source-key",
        sourcePath: "C:/data/raw.csv",
        badgeState: {
          confidence: "confirmed",
          kind: "ready",
          label: "mixed",
          source: "assessment",
        },
        curveType: "iv",
        curveTypeBadgeLabel: "iv",
        curveTypeConfidence: "high",
        curveTypeNeedsReview: undefined,
        curveTypeReasons: undefined,
        fileVersion: undefined,
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
          curveTypeNeedsReview: true,
        },
      ],
    );

    assert.deepEqual(files, [
      {
        chartState: "ready",
        file: undefined,
        fileId: "raw-1",
        fileName: "canonical.csv",
        hasChartData: true,
        itemKey: "source-item",
        normalizedCsvPath: "C:/normalized/raw.csv",
        relativePath: "batch/canonical.csv",
        sourceKey: "source-key",
        sourcePath: "C:/canonical/raw.csv",
        badgeState: {
          confidence: "confirmed",
          kind: "ready",
          label: "transfer",
          source: "assessment",
        },
        curveType: "transfer",
        curveTypeBadgeLabel: "transfer",
        curveTypeConfidence: "low",
        curveTypeNeedsReview: true,
        curveTypeReasons: undefined,
        fileVersion: undefined,
      },
    ]);
  });

  test("createChartExplorerFilesFromRecords projects assessment-only canonical files", () => {
    const files = createChartExplorerFilesFromRecords(
      {
        "raw-1": createFileRecord("raw-1", {
          hasAssessmentBlock: true,
          hasChartData: false,
        }),
      },
      ["raw-1"],
    );

    assert.deepEqual(files.map(file => ({
      badgeState: file.badgeState,
      chartState: file.chartState,
      curveType: file.curveType,
      curveTypeBadgeLabel: file.curveTypeBadgeLabel,
      hasChartData: file.hasChartData,
    })), [
      {
        badgeState: {
          confidence: "confirmed",
          kind: "ready",
          label: "output",
          source: "assessment",
        },
        chartState: "ready",
        curveType: "output",
        curveTypeBadgeLabel: "output",
        hasChartData: true,
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
          curveTypeNeedsReview: undefined,
          curveTypeReasons: undefined,
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
  options: {
    readonly hasAssessmentBlock?: boolean;
    readonly hasChartData?: boolean;
  } = {},
): FileRecord => {
  const hasChartData = options.hasChartData ?? true;
  const hasAssessmentBlock = options.hasAssessmentBlock ?? false;
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
    measurementBlockOrder: hasAssessmentBlock ? ["block-1"] : [],
    measurementBlocksById: hasAssessmentBlock
      ? {
        "block-1": {
          columnCount: 2,
          columns: { columns: [] },
          diagnosticCodes: [],
          family: "iv",
          fileId,
          id: "block-1",
          ivMode: "output",
          label: "output (vd)",
          rawTableId: fileId,
          rowCount: 2,
          source: {
            fullRange: {
              startCol: 0,
              endCol: 1,
              startRow: 0,
              endRow: 1,
            },
          },
        },
      }
      : {},
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
  };
};
