import test from "node:test";
import assert from "node:assert/strict";
import {
  buildDeviceAnalysisOriginExportsByMode,
  buildDeviceAnalysisOriginSelectionExport,
} from "./originSelectionExport.ts";

test("buildDeviceAnalysisOriginSelectionExport merges selected curves from multiple files into one worksheet payload", () => {
  const payload = buildDeviceAnalysisOriginSelectionExport(
    [
      {
        fileId: "file-a",
        fileName: "file_a.csv",
        xGroups: [[0, 1, 2]],
        series: [
          {
            id: "curve-a",
            groupIndex: 0,
            y: [10, 11, 12],
          },
        ],
      },
      {
        fileId: "file-b",
        fileName: "file_b.csv",
        xGroups: [[0, 0.5]],
        series: [
          {
            id: "curve-b",
            groupIndex: 0,
            y: [20, 21],
          },
        ],
      },
    ],
    {
      "file-a": ["curve-a"],
      "file-b": ["curve-b"],
    },
  );

  assert.ok(payload);
  assert.equal(payload.canvasCount, 2);
  assert.equal(payload.curveCount, 2);
  assert.deepEqual(payload.fileIds, ["file-a", "file-b"]);
  assert.equal(payload.xyPairCount, 2);
  assert.equal(payload.xyPairs, "((1,2),(3,4))");
  assert.equal(payload.xMin, 0);
  assert.equal(payload.xMax, 2);
  assert.equal(payload.yLinearMin, 10);
  assert.equal(payload.yLinearMax, 21);
  assert.match(payload.csvName, /merged_2files_2curves\.csv$/);

  const csvText = payload.csvText.replace(/^\uFEFF/, "");
  const rows = csvText.split(/\r?\n/);
  assert.equal(rows[0], "0,10,0,20");
  assert.equal(rows[1], "1,11,0.5,21");
  assert.equal(rows[2], "2,12,,");
});

test("buildDeviceAnalysisOriginSelectionExport defaults to all live series when no explicit selection is stored", () => {
  const payload = buildDeviceAnalysisOriginSelectionExport([
    {
      fileId: "file-a",
      fileName: "file_a.csv",
      xGroups: [[0, 1], [0, 1]],
      series: [
        {
          id: "curve-a",
          groupIndex: 0,
          y: [1, 2],
        },
        {
          id: "curve-b",
          groupIndex: 1,
          y: [3, 4],
        },
      ],
    },
  ]);

  assert.ok(payload);
  assert.equal(payload.canvasCount, 1);
  assert.equal(payload.curveCount, 2);
  assert.deepEqual(payload.fileIds, ["file-a"]);
  assert.equal(payload.xyPairs, "((1,2),(3,4))");
  assert.match(payload.csvName, /^file_a__selected_curves\.csv$/);
});

test("buildDeviceAnalysisOriginExportsByMode returns one worksheet per selected file in separate mode", () => {
  const payloads = buildDeviceAnalysisOriginExportsByMode(
    [
      {
        fileId: "file-a",
        fileName: "file_a.csv",
        xGroups: [[0, 1]],
        series: [
          {
            id: "curve-a",
            groupIndex: 0,
            y: [1, 2],
          },
        ],
      },
      {
        fileId: "file-b",
        fileName: "file_b.csv",
        xGroups: [[0, 1]],
        series: [
          {
            id: "curve-b",
            groupIndex: 0,
            y: [3, 4],
          },
        ],
      },
    ],
    undefined,
    "separate",
  );

  assert.equal(payloads.length, 2);
  assert.deepEqual(
    payloads.map((payload) => payload.fileIds),
    [["file-a"], ["file-b"]],
  );
  assert.match(payloads[0].csvName, /^file_a__selected_curves\.csv$/);
  assert.match(payloads[1].csvName, /^file_b__selected_curves\.csv$/);
});
