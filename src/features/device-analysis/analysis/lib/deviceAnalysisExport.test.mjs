import test from "node:test";
import assert from "node:assert/strict";
import {
  buildDeviceAnalysisOriginExportsByMode,
  buildDeviceAnalysisOriginSelectionExport,
  isDeviceAnalysisOriginExportMode,
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
            legendValue: "Vg=0",
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
            legendValue: "Vg=0.5",
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
  assert.deepEqual(payload.curveLabels, ["Vg=0", "Vg=0.5"]);
  assert.equal(payload.xMin, 0);
  assert.equal(payload.xMax, 2);
  assert.equal(payload.yLinearMin, 10);
  assert.equal(payload.yLinearMax, 21);
  assert.equal(payload.workbookName, payload.sheetName);
  assert.equal(payload.importMode, "new-book");
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
          name: "Drain_A",
          groupIndex: 0,
          y: [1, 2],
        },
        {
          id: "curve-b",
          legendValue: "Vg=1",
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
  assert.deepEqual(payload.curveLabels, ["Drain A", "Vg=1"]);
  assert.match(payload.csvName, /^file_a__selected_curves\.csv$/);
});

test("isDeviceAnalysisOriginExportMode accepts workbookBooks as a valid export mode", () => {
  assert.equal(isDeviceAnalysisOriginExportMode("workbookBooks"), true);
});

test("buildDeviceAnalysisOriginExportsByMode returns one workbook payload per selected file in workbookBooks mode", () => {
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
    "workbookBooks",
  );

  assert.equal(payloads.length, 2);
  assert.deepEqual(
    payloads.map((payload) => payload.fileIds),
    [["file-a"], ["file-b"]],
  );
  assert.match(payloads[0].csvName, /^file_a__selected_curves\.csv$/);
  assert.match(payloads[1].csvName, /^file_b__selected_curves\.csv$/);
  assert.deepEqual(
    payloads.map((payload) => payload.curveLabels),
    [["Curve 1"], ["Curve 1"]],
  );
  assert.deepEqual(
    payloads.map((payload) => payload.workbookName),
    ["file a", "file b"],
  );
});

test("buildDeviceAnalysisOriginExportsByMode returns one worksheet payload per selected file in separate mode", () => {
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
  assert.deepEqual(
    payloads.map((payload) => payload.curveLabels),
    [["Curve 1"], ["Curve 1"]],
  );
  assert.deepEqual(
    payloads.map((payload) => payload.workbookName),
    ["file a", "file b"],
  );
});

test("buildDeviceAnalysisOriginExportsByMode returns one workbook with multiple worksheets in workbookSheets mode", () => {
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
    "workbookSheets",
  );

  assert.equal(payloads.length, 2);
  assert.equal(payloads[0].workbookName, payloads[1].workbookName);
  assert.deepEqual(
    payloads.map((payload) => payload.sheetName),
    ["file a", "file b"],
  );
});

test("buildDeviceAnalysisOriginSelectionExport disambiguates duplicate curve labels with canvas labels", () => {
  const payload = buildDeviceAnalysisOriginSelectionExport([
    {
      fileId: "file-a",
      fileName: "file_a.csv",
      xGroups: [[0, 1]],
      series: [
        {
          id: "curve-a",
          legendValue: "Vg=0",
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
          legendValue: "Vg=0",
          groupIndex: 0,
          y: [3, 4],
        },
      ],
    },
  ]);

  assert.ok(payload);
  assert.deepEqual(payload.curveLabels, ["file a | Vg=0", "file b | Vg=0"]);
});
