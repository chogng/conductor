import test from "node:test";
import assert from "node:assert/strict";
import { buildDeviceAnalysisSsMetricsCsv } from "./deviceAnalysisExport.ts";
import {
  buildDeviceAnalysisOriginExportPlan,
  buildDeviceAnalysisOriginExportsByMode,
  buildDeviceAnalysisOriginSelectionExport,
  isDeviceAnalysisOriginExportMode,
} from "./originSelectionExport.ts";
import {
  buildOriginAxisSpacingCommands,
  buildOriginAxisTitleCommands,
} from "./originAxisCommands.ts";

test("buildDeviceAnalysisSsMetricsCsv does not compute SS for output curves", () => {
  const csv = buildDeviceAnalysisSsMetricsCsv({
    processedData: [
      {
        fileId: "output-file",
        fileName: "output.csv",
        curveType: "output",
        supportsSs: false,
        xAxisRole: "vd",
        xGroups: [[0, 0.5, 1, 1.5, 2]],
        series: [
          {
            id: "curve-output",
            name: "Vg=1",
            groupIndex: 0,
            y: [1e-12, 1e-10, 1e-8, 1e-6, 1e-4],
          },
        ],
      },
    ],
    ssMethod: "auto",
  });

  const rows = csv.split(/\r?\n/);
  const headers = rows[0].split(",");
  const values = rows[1].split(",");
  const byHeader = Object.fromEntries(headers.map((header, index) => [header, values[index]]));

  assert.equal(byHeader.ss, "");
  assert.equal(byHeader.ss_ok, "false");
  assert.equal(byHeader.ss_reason, "not_transfer_curve");
});

test("buildOriginAxisSpacingCommands emits LabTalk spacing commands only for provided values", () => {
  assert.deepEqual(buildOriginAxisSpacingCommands(null), []);
  assert.deepEqual(
    buildOriginAxisSpacingCommands({
      originTickLabelOffset: "45",
      originAxisTitleGap: "80",
    }),
    [
      "layer.x.label.offsetV=45; layer.y.label.offsetH=45; system.tick.gapAxTitle=80",
    ],
  );
});

test("buildOriginAxisTitleCommands emits explicit Origin axis title commands", () => {
  assert.deepEqual(buildOriginAxisTitleCommands(null), []);
  assert.deepEqual(
    buildOriginAxisTitleCommands({
      xAxisTitle: 'Vd (V)',
      yAxisTitle: 'Ig "test" (A)',
      axisTitleFontSize: "22",
    }),
    [
      'label -xb "Vd (V)";',
      'label -yl "Ig \\"test\\" (A)";',
      "xb.fsize=22;",
      "yl.fsize=22;",
    ],
  );
});

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
  assert.equal(payload.csvName, "2files_2curves.csv");
  assert.equal(payload.xAxisTitle, "X");
  assert.equal(payload.yAxisTitle, "Y");

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

test("buildDeviceAnalysisOriginSelectionExport prefers caller-provided legend labels across export payloads", () => {
  const payload = buildDeviceAnalysisOriginSelectionExport(
    [
      {
        fileId: "file-a",
        fileName: "file_a.csv",
        xLabel: "Vg (V)",
        xGroups: [[0, 1]],
        series: [
          {
            id: "curve-a",
            legendValue: "Vg=1",
            groupIndex: 0,
            y: [3, 4],
          },
        ],
        yLabel: "Id (A)",
      },
    ],
    undefined,
    () => 1,
    () => 1,
    () => "A",
    (file, series, index) => {
      assert.equal(file?.fileId, "file-a");
      assert.equal(series?.id, "curve-a");
      assert.equal(index, 0);
      return "Edited Legend";
    },
    (file, axis) => {
      assert.equal(file?.fileId, "file-a");
      return axis === "x" ? "Gate Voltage (V)" : "Drain Current (A)";
    },
  );

  assert.ok(payload);
  assert.deepEqual(payload.curveLabels, ["Edited Legend"]);
  assert.equal(payload.xAxisTitle, "Gate Voltage");
  assert.equal(payload.yAxisTitle, "Drain Current");
  assert.deepEqual(payload.yColumnLongNames, ["Y"]);
});

test("buildDeviceAnalysisOriginExportPlan scales exported X/Y data to the active display units", () => {
  const plan = buildDeviceAnalysisOriginExportPlan(
    [
      {
        fileId: "file-a",
        fileName: "file_a.csv",
        xGroups: [[0, 1]],
        series: [
          {
            id: "curve-a",
            groupIndex: 0,
            y: [0.00001, 0.00002],
          },
        ],
      },
    ],
    undefined,
    "merged",
    () => "linear",
    () => 1e3,
    () => 1e3,
  );

  assert.equal(plan.payloads.length, 1);
  const payload = plan.payloads[0];
  assert.equal(payload.xMin, 0);
  assert.equal(payload.xMax, 1000);
  assert.equal(payload.yLinearMin, 0.01);
  assert.equal(payload.yLinearMax, 0.02);
  const csvText = payload.csvText.replace(/^\uFEFF/, "");
  const rows = csvText.split(/\r?\n/);
  assert.equal(rows[0], "0,0.01");
  assert.equal(rows[1], "1000,0.02");
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

test("buildDeviceAnalysisOriginExportPlan downgrades mixed merged exports into workbook sheets grouped by y scale", () => {
  const plan = buildDeviceAnalysisOriginExportPlan(
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
      {
        fileId: "file-c",
        fileName: "file_c.csv",
        xGroups: [[0, 1]],
        series: [
          {
            id: "curve-c",
            groupIndex: 0,
            y: [5, 6],
          },
        ],
      },
    ],
    undefined,
    "merged",
    (file) => (String(file?.fileId ?? "") === "file-b" ? "log" : "linear"),
  );

  assert.equal(plan.mode, "workbookSheets");
  assert.equal(plan.mixedYScales, true);
  assert.equal(plan.totalCanvasCount, 3);
  assert.equal(plan.totalCurveCount, 3);
  assert.equal(plan.payloads.length, 2);
  assert.deepEqual(
    plan.payloads.map((payload) => payload.yScaleMode),
    ["linear", "log"],
  );
  assert.deepEqual(
    plan.payloads.map((payload) => payload.fileIds),
    [["file-a", "file-c"], ["file-b"]],
  );
  assert.equal(plan.payloads[0].workbookName, plan.payloads[1].workbookName);
  assert.match(plan.payloads[0].sheetName, /Linear$/);
  assert.match(plan.payloads[1].sheetName, /Log$/);
});
