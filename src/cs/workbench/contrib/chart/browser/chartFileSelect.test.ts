import assert from "assert";

import type { FileRecord } from "src/cs/workbench/services/session/common/sessionModel";
import type { AnalysisPanelProps } from "src/cs/workbench/contrib/chart/browser/analysisPanel";

import {
  createChartFileOptionsFromRecords,
  resolveActiveChartFileOption,
  resolveChartFileOptions,
} from "./chartFileSelect.ts";

suite("workbench/contrib/chart/browser/chartFileSelect", () => {
  test("createChartFileOptionsFromRecords projects canonical files in order", () => {
    assert.deepEqual(
      createChartFileOptionsFromRecords(
        {
          "file-a": createFileRecord("file-a"),
          "file-b": createFileRecord("file-b"),
          "raw-only": createFileRecord("raw-only", false),
        },
        ["file-b", "file-a", "raw-only"],
      ),
      [
        {
          fileId: "file-b",
          fileName: "file-b.csv",
        },
        {
          fileId: "file-a",
          fileName: "file-a.csv",
        },
      ],
    );
  });

  test("resolveChartFileOptions returns canonical options", () => {
    assert.deepEqual(
      resolveChartFileOptions({
        chartFileOptions: [{ fileId: "record-file", fileName: "record.csv" }],
      } as AnalysisPanelProps),
      [{ fileId: "record-file", fileName: "record.csv" }],
    );
  });

  test("resolveChartFileOptions returns empty options without canonical input", () => {
    assert.deepEqual(
      resolveChartFileOptions({} as AnalysisPanelProps),
      [],
    );
  });

  test("resolveActiveChartFileOption falls back to first option", () => {
    assert.deepEqual(
      resolveActiveChartFileOption({
        activeFileId: "missing",
        chartFileOptions: [
          { fileId: "file-a", fileName: "file-a.csv" },
          { fileId: "file-b", fileName: "file-b.csv" },
        ],
      } as AnalysisPanelProps),
      { fileId: "file-a", fileName: "file-a.csv" },
    );
  });
});

const createFileRecord = (
  fileId: string,
  hasAnalysisData = true,
): FileRecord => ({
  assessment: {
    baseFamily: hasAnalysisData ? "iv" : null,
  },
  baseCandidateOrder: [],
  baseCandidatesById: {},
  curvesByKey: {},
  id: fileId,
  metricsByKey: {},
  raw: {
    fileId,
    fileName: `${fileId}.csv`,
    tableOrder: [],
    tablesById: {},
  },
  seriesById: hasAnalysisData
    ? {
      "series-a": {
        fileId,
        groupIndex: 0,
        id: "series-a",
        y: [1],
      },
    }
    : {},
  seriesOrder: hasAnalysisData ? ["series-a"] : [],
  xGroups: hasAnalysisData ? [[0]] : [],
});
