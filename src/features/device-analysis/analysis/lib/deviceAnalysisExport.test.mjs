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
  buildOriginXAxisRangeCommandsFromDisplayRange,
  buildOriginYAxisRangeCommandsFromDisplayRange,
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

test("buildDeviceAnalysisSsMetricsCsv reuses cached Rust SS auto fits", () => {
  const csv = buildDeviceAnalysisSsMetricsCsv({
    processedData: [
      {
        fileId: "transfer-file",
        fileName: "transfer.csv",
        curveType: "transfer",
        supportsSs: true,
        xAxisRole: "vg",
        xGroups: [[0, 1, 2]],
        series: [
          {
            id: "curve-transfer",
            name: "Vd=1",
            groupIndex: 0,
            y: [NaN, NaN, NaN],
          },
        ],
        analysisCache: {
          version: 2,
          series: {
            "curve-transfer": {
              ssFitAuto: {
                strict: {
                  ok: true,
                  ss: 77,
                  x1: 0.25,
                  x2: 1.25,
                  r2: 0.999,
                  decadeSpan: 1.4,
                  n: 12,
                  reason: "ok",
                },
              },
            },
          },
        },
      },
    ],
    ssMethod: "auto",
  });

  const rows = csv.split(/\r?\n/);
  const headers = rows[0].split(",");
  const values = rows[1].split(",");
  const byHeader = Object.fromEntries(headers.map((header, index) => [header, values[index]]));

  assert.equal(byHeader.ss, "77");
  assert.equal(byHeader.ss_ok, "true");
  assert.equal(byHeader.ss_x1, "0.25");
  assert.equal(byHeader.ss_x2, "1.25");
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

test("display-range Origin axis commands keep manual scale limits", () => {
  assert.deepEqual(
    buildOriginYAxisRangeCommandsFromDisplayRange("log", {
      min: 1e-12,
      max: 1e-6,
    }),
    ["layer.y.from=1e-12", "layer.y.to=1e-6", "layer.y.rescale=0"],
  );
  assert.deepEqual(
    buildOriginXAxisRangeCommandsFromDisplayRange({
      min: -1,
      max: 1,
    }),
    ["layer.x.from=-1", "layer.x.to=1", "layer.x.rescale=0"],
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

test("buildDeviceAnalysisOriginSelectionExport shares X within each source file only", () => {
  const payload = buildDeviceAnalysisOriginSelectionExport([
    {
      fileId: "file-a",
      fileName: "file_a.csv",
      xLabel: "Vg",
      xUnit: "V",
      xGroups: [[0, 1, 2], [0, 1, 2]],
      series: [
        { id: "curve-a1", legendValue: "Vd=0.05", groupIndex: 0, y: [1, 2, 3] },
        { id: "curve-a2", legendValue: "Vd=1", groupIndex: 1, y: [4, 5, 6] },
      ],
    },
    {
      fileId: "file-b",
      fileName: "file_b.csv",
      xLabel: "Vg",
      xUnit: "V",
      xGroups: [[0, 1, 2], [0, 1, 2]],
      series: [
        { id: "curve-b1", legendValue: "Vd=0.05", groupIndex: 0, y: [7, 8, 9] },
        { id: "curve-b2", legendValue: "Vd=1", groupIndex: 1, y: [10, 11, 12] },
      ],
    },
  ]);

  assert.ok(payload);
  assert.equal(payload.columnLayout, "grouped-x");
  assert.equal(payload.xyPairs, "((1,2),(1,3),(4,5),(4,6))");
  assert.deepEqual(payload.columnDesignations, ["x", "y", "y", "x", "y", "y"]);
  assert.deepEqual(payload.columnLongNames, ["Vg", "Vd=0.05", "Vd=1", "Vg", "Vd=0.05", "Vd=1"]);
  assert.deepEqual(payload.columnUnits, ["V", "", "", "V", "", ""]);
  assert.deepEqual(payload.xColumnLongNames, ["Vg", "Vg"]);
  const rows = payload.csvText.replace(/^\uFEFF/, "").split(/\r?\n/);
  assert.equal(rows[0], "0,1,4,0,7,10");
  assert.equal(rows[1], "1,2,5,1,8,11");
  assert.equal(rows[2], "2,3,6,2,9,12");
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
  assert.equal(payload.columnLayout, "shared-x");
  assert.equal(payload.curveCount, 2);
  assert.deepEqual(payload.fileIds, ["file-a"]);
  assert.equal(payload.xyPairs, "((1,2),(1,3))");
  assert.deepEqual(payload.curveLabels, ["Drain A", "Vg=1"]);
  assert.deepEqual(payload.xColumnLongNames, ["X"]);
  assert.deepEqual(payload.xColumnUnits, [""]);
  assert.match(payload.csvName, /^file_a__selected_curves\.csv$/);
  const csvText = payload.csvText.replace(/^\uFEFF/, "");
  const rows = csvText.split(/\r?\n/);
  assert.equal(rows[0], "0,1,3");
  assert.equal(rows[1], "1,2,4");
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
  assert.equal(payload.xAxisTitle, "Gate Voltage (V)");
  assert.equal(payload.yAxisTitle, "Drain Current (A)");
  assert.deepEqual(payload.yColumnLongNames, ["Drain Current"]);
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
    () => "mA",
  );

  assert.equal(plan.payloads.length, 1);
  const payload = plan.payloads[0];
  assert.equal(payload.xMin, 0);
  assert.equal(payload.xMax, 1000);
  assert.equal(payload.yLinearMin, 0.01);
  assert.equal(payload.yLinearMax, 0.02);
  assert.equal(payload.yAxisTitle, "Y (mA)");
  assert.deepEqual(payload.yColumnUnits, ["mA"]);
  const csvText = payload.csvText.replace(/^\uFEFF/, "");
  const rows = csvText.split(/\r?\n/);
  assert.equal(rows[0], "0,0.01");
  assert.equal(rows[1], "1000,0.02");
});

test("buildDeviceAnalysisOriginExportPlan exports absolute current for log all-I Origin plots", () => {
  const plan = buildDeviceAnalysisOriginExportPlan(
    [
      {
        fileId: "pmos-file",
        fileName: "pmos.csv",
        xGroups: [[0, 1, 2]],
        series: [
          {
            id: "curve-pmos",
            groupIndex: 0,
            y: [-1e-9, -2e-8, -3e-7],
          },
        ],
      },
    ],
    undefined,
    "merged",
    () => "log",
    () => 1,
    () => 1,
    () => "A",
    undefined,
    undefined,
    (file, y) => (String(file?.fileId ?? "") === "pmos-file" ? Math.abs(y) : y),
  );

  assert.equal(plan.payloads.length, 1);
  const payload = plan.payloads[0];
  assert.equal(payload.yScaleMode, "log");
  assert.equal(payload.yPositiveMin, 1e-9);
  assert.equal(payload.yPositiveMax, 3e-7);
  const csvText = payload.csvText.replace(/^\uFEFF/, "");
  const rows = csvText.split(/\r?\n/);
  assert.equal(rows[0], "0,1e-9");
  assert.equal(rows[1], "1,2e-8");
  assert.equal(rows[2], "2,3e-7");
});

test("buildDeviceAnalysisOriginExportPlan includes selected derived Origin export content", () => {
  const plan = buildDeviceAnalysisOriginExportPlan(
    [
      {
        fileId: "transfer-a",
        fileName: "transfer_a.csv",
        curveType: "transfer",
        xAxisRole: "vg",
        xGroups: [[0, 1, 2, 3, 4, 5, 6, 7, 8, 9]],
        series: [
          {
            id: "curve-a",
            groupIndex: 0,
            y: [1e-11, 2e-11, 5e-11, 1e-10, 3e-10, 1e-9, 3e-8, 2e-7, 1e-6, 3e-6],
          },
        ],
        yUnit: "A",
      },
      {
        fileId: "output-a",
        fileName: "output_a.csv",
        curveType: "output",
        xAxisRole: "vd",
        xGroups: [[0, 1, 2, 3, 4]],
        series: [
          {
            id: "curve-b",
            groupIndex: 0,
            y: [0, 1e-6, 3e-6, 6e-6, 1e-5],
          },
        ],
        yUnit: "A",
      },
    ],
    undefined,
    "merged",
    () => "linear",
    () => 1,
    () => 1,
    () => "A",
    undefined,
    undefined,
    undefined,
    ["iv", "metrics", "gm", "gds", "ss", "vth"],
  );

  assert.equal(plan.mode, "workbookSheets");
  assert.ok(plan.payloads.some((payload) => /__selected_curves\.csv$/.test(payload.csvName)));
  assert.equal(plan.payloads.filter((payload) => /__metrics\.csv$/.test(payload.csvName)).length, 2);
  assert.ok(plan.payloads.some((payload) => /__gm__selected_curves\.csv$/.test(payload.csvName)));
  assert.ok(plan.payloads.some((payload) => /__gds__selected_curves\.csv$/.test(payload.csvName)));
  assert.ok(plan.payloads.some((payload) => /__SS__selected_curves\.csv$/.test(payload.csvName)));
  assert.ok(plan.payloads.some((payload) => /__Vth__selected_curves\.csv$/.test(payload.csvName)));
  assert.deepEqual(
    plan.payloads.map((payload) => payload.sheetName),
    ["IV_Trans", "IV_Output", "Metrics 1", "Metrics 2", "gm", "gds", "SS", "Vth"],
  );
  assert.deepEqual(
    plan.payloads.map((payload) => payload.sheetShortName),
    ["IVTrans", "IVOutput", "Metrics1", "Metrics2", "gm", "gds", "SS", "Vth"],
  );
  assert.deepEqual(
    Array.from(new Set(plan.payloads.map((payload) => payload.workbookName))),
    ["Device Analysis 2 files"],
  );
  const gdsPayload = plan.payloads.find((payload) => /__gds__selected_curves\.csv$/.test(payload.csvName));
  assert.ok(gdsPayload);
  assert.deepEqual(gdsPayload.yColumnLongNames, ["Curve 1"]);
  const metricsPayloads = plan.payloads.filter((payload) => /__metrics\.csv$/.test(payload.csvName));
  assert.equal(metricsPayloads.every((payload) => payload.skipPlot === true), true);
  assert.equal(metricsPayloads.every((payload) => payload.skipAxisCommands === true), true);
  assert.deepEqual(metricsPayloads[0].xColumnLongNames.slice(0, 4), [
    "series",
    "gm_max_abs",
    "x_at_gm_max_abs",
    "vth",
  ]);
  assert.deepEqual(metricsPayloads[1].xColumnLongNames, [
    "series",
    "gds_max_abs",
    "x_at_gds_max_abs",
  ]);
  assert.equal(metricsPayloads[1].xColumnLongNames.includes("vth"), false);
  assert.equal(metricsPayloads[0].xColumnComments[0], "transfer_a.csv");
  assert.equal(metricsPayloads[1].xColumnComments[0], "output_a.csv");
  assert.equal(metricsPayloads[0].csvText.includes("transfer_a.csv"), false);
  assert.equal(metricsPayloads[1].csvText.includes("output_a.csv"), false);
  assert.equal(metricsPayloads[0].csvText.includes("file_name,series,gm_max_abs"), false);
});

test("buildDeviceAnalysisOriginExportPlan uses grouped IV naming consistently", () => {
  const file = {
    fileId: "transfer-single",
    fileName: "Transfer_DB__TLM_1.csv",
    curveType: "transfer",
    xAxisRole: "vg",
    xGroups: [[0, 1, 2]],
    series: [{ id: "curve-single", groupIndex: 0, y: [1e-12, 1e-10, 1e-8] }],
    yUnit: "A",
  };
  const ivOnly = buildDeviceAnalysisOriginExportPlan(
    [file],
    undefined,
    "merged",
    () => "log",
    () => 1,
    () => 1,
    () => "A",
    undefined,
    undefined,
    undefined,
    ["iv"],
  );
  const ivWithMetrics = buildDeviceAnalysisOriginExportPlan(
    [file],
    undefined,
    "merged",
    () => "log",
    () => 1,
    () => 1,
    () => "A",
    undefined,
    undefined,
    undefined,
    ["iv", "metrics"],
  );

  assert.equal(ivOnly.payloads.length, 1);
  assert.equal(ivWithMetrics.payloads.length, 2);
  assert.equal(ivWithMetrics.payloads[0].workbookName, ivOnly.payloads[0].workbookName);
  assert.equal(ivWithMetrics.payloads[0].sheetName, ivOnly.payloads[0].sheetName);
  assert.equal(ivWithMetrics.payloads[0].workbookName, "Device Analysis");
  assert.equal(ivWithMetrics.payloads[0].sheetName, "IV_Trans");
  assert.equal(ivWithMetrics.payloads[0].sheetShortName, "IVTrans");
});

test("buildDeviceAnalysisOriginExportPlan reuses cached Rust metrics", () => {
  const plan = buildDeviceAnalysisOriginExportPlan(
    [
      {
        fileId: "transfer-cache",
        fileName: "transfer_cache.csv",
        curveType: "transfer",
        xAxisRole: "vg",
        xGroups: [[0, 1, 2]],
        series: [
          {
            id: "curve-cache",
            groupIndex: 0,
            y: [NaN, NaN, NaN],
          },
        ],
        analysisCache: {
          version: 2,
          series: {
            "curve-cache": {
              gm: [{ x: 1.5, y: -42 }],
              ssFitAuto: {
                strict: {
                  ok: true,
                  ss: 88,
                  x1: 0.4,
                  x2: 1.4,
                  r2: 0.998,
                  decadeSpan: 1.2,
                  n: 10,
                  reason: "ok",
                },
              },
              baseCurrent: {
                candidateWindows: [{ key: "minCurrent" }, { key: "maxCurrent" }],
                ion: 5e-6,
                ioff: 1e-9,
                ionIoff: 5000,
                xAtIon: 2,
                xAtIoff: 0,
              },
            },
          },
        },
      },
    ],
    undefined,
    "merged",
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    ["metrics"],
  );

  const payload = plan.payloads.find((item) => /__metrics\.csv$/.test(item.csvName));
  assert.ok(payload);
  const values = payload.csvText.replace(/^\uFEFF/, "").trim().split(",");
  const byHeader = Object.fromEntries(
    payload.xColumnLongNames.map((header, index) => [header, values[index]]),
  );

  assert.equal(byHeader.gm_max_abs, "42");
  assert.equal(byHeader.x_at_gm_max_abs, "1.5");
  assert.equal(byHeader.ss, "88");
  assert.equal(byHeader.ss_x1, "0.4");
  assert.equal(byHeader.ss_x2, "1.4");
  assert.equal(byHeader.ion, "0.000005");
  assert.equal(byHeader.ioff, "1e-9");
  assert.equal(byHeader.ion_ioff, "5000");
});

test("buildDeviceAnalysisOriginExportPlan exports SS as absolute current for Origin log plots", () => {
  const plan = buildDeviceAnalysisOriginExportPlan(
    [
      {
        fileId: "transfer-negative-ss",
        fileName: "transfer_negative_ss.csv",
        curveType: "transfer",
        xAxisRole: "vg",
        xGroups: [[-1, 0, 1]],
        series: [
          {
            id: "curve-negative",
            groupIndex: 0,
            y: [-1e-9, -2e-8, -3e-7],
          },
        ],
        yUnit: "A",
      },
    ],
    undefined,
    "merged",
    () => "linear",
    () => 1,
    () => 1,
    () => "A",
    undefined,
    undefined,
    undefined,
    ["ss"],
  );

  const payload = plan.payloads.find((item) => /__SS__selected_curves\.csv$/.test(item.csvName));
  assert.ok(payload);
  assert.equal(payload.yAxisTitle, "|I| (A)");
  assert.equal(payload.yPositiveMin, 1e-9);
  assert.equal(payload.yPositiveMax, 3e-7);
  assert.equal(payload.skipDisplayRange, true);
  assert.equal(payload.csvText.replace(/^\uFEFF/, "").trim(), "-1,1e-9\r\n0,2e-8\r\n1,3e-7");
});

test("buildDeviceAnalysisOriginExportPlan exports Vth as sqrt absolute current", () => {
  const plan = buildDeviceAnalysisOriginExportPlan(
    [
      {
        fileId: "transfer-negative-vth",
        fileName: "transfer_negative_vth.csv",
        curveType: "transfer",
        xAxisRole: "vg",
        xGroups: [[-1, 0, 1]],
        series: [
          {
            id: "curve-negative",
            groupIndex: 0,
            y: [-1e-10, -4e-10, -9e-10],
          },
        ],
        yUnit: "A",
      },
    ],
    undefined,
    "merged",
    () => "linear",
    () => 1,
    () => 1,
    () => "A",
    undefined,
    undefined,
    undefined,
    ["vth"],
  );

  const payload = plan.payloads.find((item) => /__Vth__selected_curves\.csv$/.test(item.csvName));
  assert.ok(payload);
  assert.equal(payload.yAxisTitle, "sqrt(|I|)");
  assert.equal(payload.yLinearMin, Math.sqrt(1e-10));
  assert.equal(payload.yLinearMax, Math.sqrt(9e-10));
  assert.equal(payload.skipDisplayRange, true);
});

test("buildDeviceAnalysisOriginExportPlan splits mixed IV transfer and output sheets", () => {
  const plan = buildDeviceAnalysisOriginExportPlan(
    [
      {
        fileId: "transfer-a",
        fileName: "transfer_a.csv",
        curveType: "transfer",
        xAxisRole: "vg",
        xGroups: [[0, 1, 2]],
        series: [{ id: "curve-a", groupIndex: 0, y: [1e-12, 1e-10, 1e-8] }],
        yUnit: "A",
      },
      {
        fileId: "output-a",
        fileName: "output_a.csv",
        curveType: "output",
        xAxisRole: "vd",
        xGroups: [[0, 1, 2]],
        series: [{ id: "curve-b", groupIndex: 0, y: [0, 1e-6, 2e-6] }],
        yUnit: "A",
      },
    ],
    undefined,
    "merged",
    () => "linear",
    () => 1,
    () => 1,
    () => "A",
    undefined,
    undefined,
    undefined,
    ["iv"],
  );

  assert.equal(plan.mode, "workbookSheets");
  assert.deepEqual(
    plan.payloads.map((payload) => payload.sheetName),
    ["IV_Trans", "IV_Output"],
  );
  assert.deepEqual(
    plan.payloads.map((payload) => payload.sheetShortName),
    ["IVTrans", "IVOutput"],
  );
});

test("buildDeviceAnalysisOriginExportPlan exports Vth metrics when transfer fit is available", () => {
  const plan = buildDeviceAnalysisOriginExportPlan(
    [
      {
        fileId: "transfer-vth",
        fileName: "transfer_vth.csv",
        curveType: "transfer",
        xAxisRole: "vg",
        xGroups: [[-2, -1, 0, 1, 2, 3, 4]],
        series: [
          {
            id: "curve-vth",
            groupIndex: 0,
            y: [9e-12, 4e-12, 1e-12, 1e-11, 1e-10, 4e-10, 9e-10],
          },
        ],
        yUnit: "A",
      },
    ],
    undefined,
    "merged",
    () => "linear",
    () => 1,
    () => 1,
    () => "A",
    undefined,
    undefined,
    undefined,
    ["metrics"],
  );

  const metricsPayload = plan.payloads.find((payload) => /__metrics\.csv$/.test(payload.csvName));
  assert.ok(metricsPayload);
  const vthIndex = metricsPayload.xColumnLongNames.indexOf("vth");
  assert.ok(vthIndex >= 0);
  const row = metricsPayload.csvText.replace(/^\uFEFF/, "").trim().split(",");
  assert.equal(Number.isFinite(Number(row[vthIndex])), true);
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
