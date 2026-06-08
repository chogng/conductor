import assert from "assert";

import type { FileRecord } from "src/cs/workbench/services/session/common/sessionModel";

import {
  createChartExplorerFiles,
  createChartExplorerFilesFromRecords,
} from "./explorerInput.ts";

suite("workbench/contrib/files/common/explorerInput", () => {
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
        curveType: "iv",
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
        curveType: "iv",
        curveTypeConfidence: "high",
        curveTypeNeedsTemplate: true,
        curveTypeReasons: ["matched template"],
      },
    ]);
  });

  test("createChartExplorerFilesFromRecords skips raw-only canonical files", () => {
    assert.deepEqual(
      createChartExplorerFilesFromRecords(
        {
          "raw-only": createFileRecord("raw-only", { hasAnalysisData: false }),
        },
        ["raw-only"],
      ),
      [],
    );
  });
});

const createFileRecord = (
  fileId: string,
  options: { readonly hasAnalysisData?: boolean } = {},
): FileRecord => {
  const hasAnalysisData = options.hasAnalysisData ?? true;
  return {
    assessment: {
      baseFamily: "iv",
      baseFamilyConfidence: "high",
      baseFamilyReasons: ["matched template"],
    },
    baseCandidateOrder: [],
    baseCandidatesById: {},
    curvesByKey: {},
    id: fileId,
    metricsByKey: {},
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
    seriesById: hasAnalysisData
      ? {
        "series-1": {
          fileId,
          groupIndex: 0,
          id: "series-1",
          y: [1],
        },
      }
      : {},
    seriesOrder: hasAnalysisData ? ["series-1"] : [],
    xGroups: hasAnalysisData ? [[0]] : [],
  };
};
