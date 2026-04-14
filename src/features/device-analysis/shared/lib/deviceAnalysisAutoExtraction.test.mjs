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
