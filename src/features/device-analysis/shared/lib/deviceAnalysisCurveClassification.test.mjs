import test from "node:test";
import assert from "node:assert/strict";
import {
  classifyDeviceAnalysisCurve,
  extractDeviceAnalysisCurveMetadata,
} from "./deviceAnalysisCurveClassification.ts";

test("classifies standard transfer metadata with high confidence", () => {
  const metadata = extractDeviceAnalysisCurveMetadata([
    ["SetupTitle", "Transfer_DB"],
    ["TestParameter", "Channel.VName", "Vg", "Vd", "Vs"],
    ["TestParameter", "Channel.Func", "VAR1", "VAR2", "CONST"],
    ["TestParameter", "Output.Graph.XAxis.Data", "Vg"],
    [
      "AnalysisSetup",
      "Analysis.Setup.Vector.Graph.Notes",
      "[VAR1] Unit=SMU3:MP, Name=Vg, Start=-1 V\t[VAR2] Unit=SMU2:MP, Name=Vd, Start=50 mV",
    ],
    ["DataName", "Vg", "Id", "Ig"],
  ]);

  const result = classifyDeviceAnalysisCurve({
    fileName: "Transfer_DB [sample].csv",
    metadata,
  });

  assert.equal(result.curveType, "transfer");
  assert.equal(result.xAxisRole, "vg");
  assert.equal(result.confidence, "high");
  assert.equal(result.needsTemplate, false);
});

test("classifies standard output metadata with high confidence", () => {
  const metadata = extractDeviceAnalysisCurveMetadata([
    ["SetupTitle", "Output"],
    ["TestParameter", "Channel.VName", "Vg", "Vd", "Vs"],
    ["TestParameter", "Channel.Func", "VAR2", "VAR1", "CONST"],
    ["TestParameter", "Output.Graph.XAxis.Data", "Vd"],
    [
      "AnalysisSetup",
      "Analysis.Setup.Vector.Graph.Notes",
      "[VAR1] Unit=SMU2:MP, Name=Vd, Start=0 V\t[VAR2] Unit=SMU3:MP, Name=Vg, Start=0 V",
    ],
    ["DataName", "Vd", "Ig", "Id"],
  ]);

  const result = classifyDeviceAnalysisCurve({
    fileName: "Output [sample].csv",
    metadata,
  });

  assert.equal(result.curveType, "output");
  assert.equal(result.xAxisRole, "vd");
  assert.equal(result.confidence, "high");
});

test("treats Trans_Br files as transfer when metadata says Vg", () => {
  const metadata = extractDeviceAnalysisCurveMetadata([
    ["SetupTitle", "Trans_Br"],
    ["TestParameter", "Output.Graph.XAxis.Data", "Vg"],
    [
      "AnalysisSetup",
      "Analysis.Setup.Vector.Graph.Notes",
      "[VAR1] Unit=SMU3:MP, Name=Vg, Direction=Single\t[VAR2] Unit=SMU2:MP, Name=Vd, Start=50 mV",
    ],
    ["DataName", "Vg", "Id", "Ig"],
  ]);

  const result = classifyDeviceAnalysisCurve({
    fileName: "Trans_Br [sample].csv",
    metadata,
  });

  assert.equal(result.curveType, "transfer");
  assert.equal(result.xAxisRole, "vg");
  assert.equal(result.confidence, "high");
});

test("accepts single-swept transfer files that only declare VAR1", () => {
  const metadata = extractDeviceAnalysisCurveMetadata([
    ["SetupTitle", "Transfer1-3"],
    ["TestParameter", "Channel.VName", "Vg", "Vs", "Vd"],
    ["TestParameter", "Channel.Func", "VAR1", "CONST", "CONST"],
    ["TestParameter", "Output.Graph.XAxis.Data", "Vg"],
    [
      "AnalysisSetup",
      "Analysis.Setup.Vector.Graph.Notes",
      "[VAR1] Unit=SMU1:MP, Name=Vg, Direction=Single\t[CONSTANTS] Unit=SMU2:MP, Name=Vd, Source=1.5 V",
    ],
    ["DataName", "Vg", "Id", "gm"],
  ]);

  const result = classifyDeviceAnalysisCurve({
    fileName: "Transfer1-3.csv",
    metadata,
  });

  assert.equal(result.curveType, "transfer");
  assert.equal(result.xAxisRole, "vg");
  assert.equal(result.confidence, "high");
});

test("downgrades stripped CH1/CH2 sweeps to unknown", () => {
  const metadata = extractDeviceAnalysisCurveMetadata([
    [
      "Repeat",
      "VAR2",
      "Point",
      "CH1 Voltage",
      "CH1 Current",
      "CH2 Voltage",
      "CH2 Current",
    ],
    ["1", "1", "1", "-3.00000E+000", "-3.7E-9", "-60.00000E+000", "1.3E-9"],
  ]);

  const result = classifyDeviceAnalysisCurve({
    fileName: "tran.csv",
    metadata,
  });

  assert.equal(result.curveType, "unknown");
  assert.equal(result.xAxisRole, null);
  assert.equal(result.confidence, "low");
  assert.equal(result.needsTemplate, true);
  assert.match(result.reasons.join(" "), /CH1\/CH2 sweep columns/i);
});

test("returns unknown when strong metadata conflicts", () => {
  const metadata = extractDeviceAnalysisCurveMetadata([
    ["SetupTitle", "Transfer_DB"],
    ["TestParameter", "Output.Graph.XAxis.Data", "Vg"],
    ["DataName", "Vd", "Id", "Ig"],
  ]);

  const result = classifyDeviceAnalysisCurve({
    fileName: "conflict.csv",
    metadata,
  });

  assert.equal(result.curveType, "unknown");
  assert.equal(result.confidence, "low");
  assert.equal(result.needsTemplate, true);
  assert.match(result.reasons[0], /disagree/i);
});
