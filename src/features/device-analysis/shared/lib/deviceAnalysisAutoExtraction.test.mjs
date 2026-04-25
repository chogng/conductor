import test from "node:test";
import assert from "node:assert/strict";
import {
  buildDeviceAnalysisAutoTemplateConfig,
  inferDeviceAnalysisAutoExtraction,
} from "./deviceAnalysisAutoExtraction.ts";

test("infers stripped CH1/CH2 output files into executable auto extraction plans", () => {
  const rows = [
    [
      "Repeat",
      "VAR2",
      "Point",
      "CH1 Voltage",
      "CH1 Current",
      "CH1 Resistance",
      "CH1 Time",
      "CH2 Voltage",
      "CH2 Current",
    ],
    ["1", "1", "1", "-3.0", "-1e-12", "", "", "-60", "1e-9"],
    ["1", "1", "2", "-2.0", "-1e-10", "", "", "-60", "1.1e-9"],
    ["1", "1", "3", "-1.0", "-1e-8", "", "", "-60", "1.2e-9"],
    ["1", "1", "4", "0.0", "-1e-7", "", "", "-60", "1.1e-9"],
    ["1", "2", "1", "-3.0", "-2e-12", "", "", "-40", "1e-9"],
    ["1", "2", "2", "-2.0", "-2e-10", "", "", "-40", "1.1e-9"],
    ["1", "2", "3", "-1.0", "-2e-8", "", "", "-40", "1.2e-9"],
    ["1", "2", "4", "0.0", "-2e-7", "", "", "-40", "1.1e-9"],
  ];

  const result = inferDeviceAnalysisAutoExtraction({
    fileName: "tran.csv",
    rows,
    totalRowCount: rows.length,
  });

  assert.equal(result.ok, true);
  assert.equal(result.plan.curveType, "output");
  assert.equal(result.plan.xCol, 3);
  assert.deepEqual(result.plan.yCols, [4]);
  assert.equal(result.plan.xPointsPerGroup, 4);
  assert.equal(result.plan.groups, 2);
  assert.equal(result.plan.legendStartColIndex, 7);
  assert.equal(result.plan.legendTarget, "group");

  const templateConfig = buildDeviceAnalysisAutoTemplateConfig(result.plan);
  assert.equal(templateConfig.xDataStart, "D2");
  assert.equal(templateConfig.xPointsPerGroup, "4");
  assert.deepEqual(templateConfig.yColumns, [4]);
  assert.equal(templateConfig.yLegendStart, "H2");
});

test("falls back to repeated X shape for grouped generic transfer files", () => {
  const rows = [
    ["SetupTitle", "Transfer_DB"],
    ["TestParameter", "Output.Graph.XAxis.Data", "Vg"],
    ["DataName", "Vg", "Id", "Ig", "Vd"],
    ["DataValue", "-2", "1e-12", "1e-13", "0.1"],
    ["DataValue", "-1", "1e-11", "1e-13", "0.1"],
    ["DataValue", "0", "1e-10", "1e-13", "0.1"],
    ["DataValue", "-2", "2e-12", "1e-13", "1.0"],
    ["DataValue", "-1", "2e-11", "1e-13", "1.0"],
    ["DataValue", "0", "2e-10", "1e-13", "1.0"],
  ];

  const result = inferDeviceAnalysisAutoExtraction({
    fileName: "transfer.csv",
    rows,
    totalRowCount: rows.length,
  });

  assert.equal(result.ok, true);
  assert.equal(result.plan.curveType, "transfer");
  assert.equal(result.plan.xCol, 1);
  assert.deepEqual(result.plan.yCols, [2]);
  assert.equal(result.plan.xPointsPerGroup, 3);
  assert.equal(result.plan.groups, 2);
  assert.equal(result.plan.legendStartColIndex, 4);
  assert.equal(result.plan.legendTarget, "group");
});

test("infers grouped transfer legend sweep from notes when bias column is absent", () => {
  const rows = [
    ["SetupTitle", "Transfer_DB"],
    ["TestParameter", "Output.Graph.XAxis.Data", "Vg"],
    [
      "AnalysisSetup",
      "Analysis.Setup.Vector.Graph.Notes",
      "[VAR1] Unit=SMU3:MP, Name=Vg, Direction=Double, Start=-1 V, Stop=4 V, Step=25 mV\t[VAR2] Unit=SMU2:MP, Name=Vd, Start=50 mV, Stop=1 V, Step=950 mV, No. of Steps=2",
    ],
    ["DataName", "Vg", "Id", "Ig"],
    ["DataValue", "-1", "1e-13", "1e-12"],
    ["DataValue", "0", "1e-12", "1e-12"],
    ["DataValue", "1", "1e-9", "1e-12"],
    ["DataValue", "-1", "2e-13", "1e-12"],
    ["DataValue", "0", "2e-12", "1e-12"],
    ["DataValue", "1", "2e-9", "1e-12"],
  ];

  const result = inferDeviceAnalysisAutoExtraction({
    fileName: "Transfer_DB [notes-only-bias].csv",
    rows,
    totalRowCount: rows.length,
  });

  assert.equal(result.ok, true);
  assert.equal(result.plan.curveType, "transfer");
  assert.equal(result.plan.xPointsPerGroup, 3);
  assert.equal(result.plan.groups, 2);
  assert.equal(result.plan.legendPrefix, "Vd");
  assert.equal(result.plan.legendStartColIndex, null);
  assert.equal(result.plan.legendStartValue, "0.05");
  assert.equal(result.plan.legendCount, 2);
  assert.ok(Math.abs(result.plan.legendStep - 0.95) < 1e-12);
  assert.equal(result.plan.legendTarget, "group");

  const templateConfig = buildDeviceAnalysisAutoTemplateConfig(result.plan);
  assert.equal(templateConfig.yLegendStart, "0.05");
  assert.equal(templateConfig.yLegendCount, "2");
  assert.equal(templateConfig.yLegendStep, "0.95");
});

test("infers transfer grouping from metadata rows when preview is truncated", () => {
  const rows = [
    ["SetupTitle", "Transfer_DB"],
    ["TestParameter", "Channel.VName", "Vg", "Vd", "Vs"],
    ["TestParameter", "Channel.Func", "VAR1", "VAR2", "CONST"],
    ["TestParameter", "Output.Graph.XAxis.Data", "Vg"],
    ["TestParameter", "Measurement.Secondary.Start", "0.05"],
    ["TestParameter", "Measurement.Secondary.Count", "2"],
    ["TestParameter", "Measurement.Secondary.Step", "0.95"],
    ["Dimension1", "402", "402", "402"],
    ["Dimension2", "2", "2", "2"],
    ["DataName", "Vg", "Id", "Ig"],
    ["DataValue", "-1", "1e-13", "1e-12"],
    ["DataValue", "-0.975", "2e-13", "1e-12"],
    ["DataValue", "-0.95", "3e-13", "1e-12"],
    ["DataValue", "-0.925", "4e-13", "1e-12"],
    ["DataValue", "-0.9", "5e-13", "1e-12"],
  ];

  const result = inferDeviceAnalysisAutoExtraction({
    fileName: "Transfer_DB [truncated-preview].csv",
    rows,
    totalRowCount: 814,
  });

  assert.equal(result.ok, true);
  assert.equal(result.plan.curveType, "transfer");
  assert.equal(result.plan.xPointsPerGroup, 402);
  assert.equal(result.plan.groups, 2);
  assert.equal(result.plan.legendPrefix, "Vd");
  assert.equal(result.plan.legendStartValue, "0.05");
  assert.equal(result.plan.legendCount, 2);
  assert.ok(Math.abs(result.plan.legendStep - 0.95) < 1e-12);
  assert.equal(result.plan.legendTarget, "group");
});

test("infers a fixed legend for single-curve Trans_Br metadata", () => {
  const rows = [
    ["SetupTitle", "Trans_Br"],
    ["TestParameter", "Channel.VName", "Vg", "Vd", "Vs"],
    ["TestParameter", "Channel.Func", "VAR1", "VAR2", "CONST"],
    ["TestParameter", "Measurement.Secondary.Start", "0.05"],
    ["TestParameter", "Measurement.Secondary.Count", "1"],
    ["TestParameter", "Measurement.Secondary.Step", "0.2"],
    ["TestParameter", "Output.Graph.XAxis.Data", "Vg"],
    ["TestParameter", "Output.Graph.YAxis.Data", "Ig", "Ig", "Id"],
    ["DataName", "Vg", "Id", "Ig"],
    ["DataValue", "0", "1e-12", "1e-13"],
    ["DataValue", "0.033", "2e-12", "1e-13"],
    ["DataValue", "0.066", "3e-12", "1e-13"],
  ];

  const result = inferDeviceAnalysisAutoExtraction({
    fileName: "Trans_Br [sample, Vbr=4.6V].csv",
    rows,
    totalRowCount: rows.length,
  });

  assert.equal(result.ok, true);
  assert.equal(result.plan.curveType, "transfer");
  assert.deepEqual(result.plan.yCols, [3]);
  assert.equal(result.plan.leftTitle, "Ig");
  assert.equal(result.plan.xPointsPerGroup, 3);
  assert.equal(result.plan.groups, 1);
  assert.equal(result.plan.legendPrefix, "Vd");
  assert.equal(result.plan.legendStartColIndex, null);
  assert.equal(result.plan.legendStartValue, "0.05");
  assert.equal(result.plan.legendCount, 1);
  assert.equal(result.plan.legendStep, null);
  assert.equal(result.plan.legendTarget, "yColumn");

  const templateConfig = buildDeviceAnalysisAutoTemplateConfig(result.plan);
  assert.equal(templateConfig.yLegendStart, "0.05");
  assert.equal(templateConfig.yLegendCount, "1");
  assert.equal(templateConfig.yLegendStep, "");
  assert.equal(templateConfig.yLegendTarget, "yColumn");
});

test("infers adjacent XY pairs with equivalent X traces into shared-X multi-series extraction", () => {
  const rows = [
    [
      "drain TotalCurrent(IdVg_n938_des) X",
      "drain TotalCurrent(IdVg_n938_des) Y",
      "drain TotalCurrent(IdVg_n944_des) X",
      "drain TotalCurrent(IdVg_n944_des) Y",
      "drain TotalCurrent(IdVg_n950_des) X",
      "drain TotalCurrent(IdVg_n950_des) Y",
    ],
    ["-0.5", "2e-23", "-0.5", "3e-22", "-0.5", "4e-21"],
    ["0.0", "1e-15", "0.0", "2e-14", "0.0", "3e-13"],
    ["0.5", "8e-8", "0.5", "7e-7", "0.5", "3e-6"],
    ["1.0", "2e-5", "1.0", "2.4e-5", "1.0", "2.8e-5"],
  ];

  const result = inferDeviceAnalysisAutoExtraction({
    fileName: "30020 SLVT IVlin.csv",
    rows,
    totalRowCount: rows.length,
  });

  assert.equal(result.ok, true);
  assert.equal(result.plan.curveType, "output");
  assert.equal(result.plan.xAxisRole, "vd");
  assert.equal(result.plan.xCol, 0);
  assert.deepEqual(result.plan.yCols, [1, 3, 5]);
  assert.equal(result.plan.legendTarget, "yColumn");
  assert.equal(result.plan.legendStartColIndex, 1);
  assert.equal(result.plan.legendStartRowIndex, 0);
  assert.equal(result.plan.legendCount, 3);
  assert.equal(result.plan.legendStep, 2);

  const templateConfig = buildDeviceAnalysisAutoTemplateConfig(result.plan);
  assert.equal(templateConfig.xDataStart, "A2");
  assert.deepEqual(templateConfig.yColumns, [1, 3, 5]);
  assert.equal(templateConfig.yLegendStart, "B1");
  assert.equal(templateConfig.yLegendCount, "3");
  assert.equal(templateConfig.yLegendStep, "2");
  assert.equal(templateConfig.yLegendTarget, "yColumn");
});

test("infers one shared X column with multiple Y current columns", () => {
  const rows = [
    ["Vd", "Id @ Vg=0.5", "Id @ Vg=1.0", "Id @ Vg=1.5"],
    ["0.0", "1e-9", "2e-9", "3e-9"],
    ["0.5", "1e-6", "2e-6", "3e-6"],
    ["1.0", "2e-5", "2.5e-5", "3.2e-5"],
  ];

  const result = inferDeviceAnalysisAutoExtraction({
    fileName: "output_multi_y.csv",
    rows,
    totalRowCount: rows.length,
  });

  assert.equal(result.ok, true);
  assert.equal(result.plan.curveType, "output");
  assert.equal(result.plan.xAxisRole, "vd");
  assert.equal(result.plan.xCol, 0);
  assert.deepEqual(result.plan.yCols, [1, 2, 3]);
  assert.equal(result.plan.legendTarget, "yColumn");
  assert.equal(result.plan.legendStartColIndex, 1);
  assert.equal(result.plan.legendStartRowIndex, 0);
  assert.equal(result.plan.legendCount, 3);
  assert.equal(result.plan.legendStep, 1);
});

test("returns a failure result when auto extraction cannot infer columns", () => {
  const result = inferDeviceAnalysisAutoExtraction({
    fileName: "unknown.csv",
    rows: [
      ["A", "B", "C"],
      ["foo", "bar", "baz"],
    ],
    totalRowCount: 2,
  });

  assert.equal(result.ok, false);
  assert.match(result.message, /unable to infer|no rows/i);
});

test("infers a cv two-column layout into an executable auto extraction plan", () => {
  const rows = [
    ["{c_v_ext}", "2026-01-08-21-55-45"],
    ["{(C_V_C_V_EXT)Cp_vp@ vn=0.0}", "vn=0.00000"],
    ["vp", "Cp"],
    ["-7", "5.91849e-12"],
    ["-6.9", "6.96301e-12"],
    ["-6.8", "7.24286e-12"],
    ["-6.7", "6.74907e-12"],
  ];

  const result = inferDeviceAnalysisAutoExtraction({
    fileName: "#CV-60um-5,10kHz_2026-01-09-10-09-59.xls",
    rows,
    totalRowCount: rows.length,
  });

  assert.equal(result.ok, true);
  assert.equal(result.plan.curveType, "cv");
  assert.equal(result.plan.xAxisRole, null);
  assert.equal(result.plan.xCol, 0);
  assert.deepEqual(result.plan.yCols, [1]);
  assert.equal(result.plan.bottomTitle, "vp");
  assert.equal(result.plan.leftTitle, "Cp");
  assert.equal(result.plan.xUnit, "V");
  assert.equal(result.plan.yUnit, "F");
});

test("infers a cf two-column layout into an executable auto extraction plan", () => {
  const rows = [
    ["{c_freq_ext}", "2026-01-09-11-07-05"],
    ["{(C_freq_ext_C_Freq_EXT)Cp_freq@ vn=1.0}", "vn=1.00000"],
    ["freq", "Cp(vp=0.00000)"],
    ["1000", "1.48524e-12"],
    ["11000", "1.34488e-12"],
    ["21000", "1.33745e-12"],
    ["31000", "1.33642e-12"],
  ];

  const result = inferDeviceAnalysisAutoExtraction({
    fileName: "#CF-10um-10_2026-01-09-11-09-36.xls",
    rows,
    totalRowCount: rows.length,
  });

  assert.equal(result.ok, true);
  assert.equal(result.plan.curveType, "cf");
  assert.equal(result.plan.xAxisRole, null);
  assert.equal(result.plan.xCol, 0);
  assert.deepEqual(result.plan.yCols, [1]);
  assert.equal(result.plan.bottomTitle, "freq");
  assert.equal(result.plan.leftTitle, "Cp(vp=0.00000)");
  assert.equal(result.plan.xUnit, "Hz");
  assert.equal(result.plan.yUnit, "F");
});

test("infers shared-X adjacent XY capacitance pairs without treating X columns as Y series", () => {
  const rows = [
    [
      "c(g:g)(CV_n256_ac_des) X",
      "c(g:g)(CV_n256_ac_des) Y",
      "c(g:g)(CV_n350_ac_des) X",
      "c(g:g)(CV_n350_ac_des) Y",
      "c(g:g)(CV_n356_ac_des) X",
      "c(g:g)(CV_n356_ac_des) Y",
      "c(g:g)(CV_n362_ac_des) X",
      "c(g:g)(CV_n362_ac_des) Y",
      "c(g:g)(CV_n368_ac_des) X",
      "c(g:g)(CV_n368_ac_des) Y",
    ],
    ["-0.5", "9.8493571e-16", "-0.5", "9.8777813e-16", "-0.5", "9.9085634e-16", "-0.5", "9.9417108e-16", "-0.5", "9.9767852e-16"],
    ["-0.49", "9.8525372e-16", "-0.49", "9.8812868e-16", "-0.49", "9.9124231e-16", "-0.49", "9.9458988e-16", "-0.49", "9.9812284e-16"],
    ["-0.48", "9.8557594e-16", "-0.48", "9.8848412e-16", "-0.48", "9.9163325e-16", "-0.48", "9.9501303e-16", "-0.48", "9.9857063e-16"],
  ];

  const result = inferDeviceAnalysisAutoExtraction({
    fileName: "300Cgg.csv",
    rows,
    totalRowCount: rows.length,
  });

  assert.equal(result.ok, true);
  assert.equal(result.plan.curveType, "cv");
  assert.equal(result.plan.xCol, 0);
  assert.deepEqual(result.plan.yCols, [1, 3, 5, 7, 9]);
  assert.equal(result.plan.legendTarget, "yColumn");
  assert.equal(result.plan.legendStartColIndex, 1);
  assert.equal(result.plan.legendStartRowIndex, 0);
  assert.equal(result.plan.legendCount, 5);
  assert.equal(result.plan.leftTitle, "c(g:g)(CV_n368_ac_des) Y");
  assert.equal(result.plan.yUnit, "F");
});

test("infers a pv fastiv layout into an executable auto extraction plan", () => {
  const rows = [
    ["{i_v_fastiv_ivt-D150}", "2026-01-15-16-20-41", "", "{i_v_fastiv_ivt-D150}", "2026-01-15-16-20-41", ""],
    ["{(_FastIV(IVT))vp,in_Time@ vn; vp}", "wave", "", "", "{(original__FastIV(IVT))vp,in_Time@ vn; vp}", "wave"],
    ["vp", "`vp", "ipt", "Time", "vp", "in"],
    ["-0.0071", "0.0002", "3.6e-7", "1e-7", "-0.0071", "-3.6e-7"],
    ["-0.0048", "0.0010", "9.4e-7", "2e-7", "-0.0048", "-9.4e-7"],
    ["0.0068", "0.0131", "1.8e-5", "1.2e-6", "0.0068", "-1.8e-5"],
  ];

  const result = inferDeviceAnalysisAutoExtraction({
    fileName: "W-AOHZOAO-W-380C-PV-D100-WAKE UP_2026-01-15-16-25-29.xls",
    rows,
    totalRowCount: rows.length,
  });

  assert.equal(result.ok, true);
  assert.equal(result.plan.curveType, "pv");
  assert.equal(result.plan.xCol, 4);
  assert.deepEqual(result.plan.yCols, [5]);
  assert.equal(result.plan.bottomTitle, "vp");
  assert.equal(result.plan.leftTitle, "in");
  assert.equal(result.plan.xUnit, "V");
  assert.equal(result.plan.yUnit, "A");
});
