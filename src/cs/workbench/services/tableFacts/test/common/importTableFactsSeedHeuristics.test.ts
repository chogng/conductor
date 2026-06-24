/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";
import {
  createImportTableFactsSeedHeuristic,
  extractImportTableFactsSeedMetadata,
} from "../../common/importTableFactsSeedHeuristics.ts";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";

suite("workbench/services/tableFacts/test/common/importTableFactsSeedHeuristics", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("classifies standard transfer metadata with high confidence", () => {
    const metadata = extractImportTableFactsSeedMetadata([
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

    const result = createImportTableFactsSeedHeuristic({
      fileName: "Transfer_DB [sample].csv",
      metadata,
    });

    assert.equal(result.curveType, "transfer");
    assert.equal(result.xAxisRole, "vg");
    assert.equal(result.confidence, "high");
    assert.equal(result.needsReview, false);
  });

  test("classifies standard output metadata with high confidence", () => {
    const metadata = extractImportTableFactsSeedMetadata([
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

    const result = createImportTableFactsSeedHeuristic({
      fileName: "Output [sample].csv",
      metadata,
    });

    assert.equal(result.curveType, "output");
    assert.equal(result.xAxisRole, "vd");
    assert.equal(result.confidence, "high");
  });

  test("treats Trans_Br files as transfer when metadata says Vg", () => {
    const metadata = extractImportTableFactsSeedMetadata([
      ["SetupTitle", "Trans_Br"],
      ["TestParameter", "Output.Graph.XAxis.Data", "Vg"],
      [
        "AnalysisSetup",
        "Analysis.Setup.Vector.Graph.Notes",
        "[VAR1] Unit=SMU3:MP, Name=Vg, Direction=Single\t[VAR2] Unit=SMU2:MP, Name=Vd, Start=50 mV",
      ],
      ["DataName", "Vg", "Id", "Ig"],
    ]);

    const result = createImportTableFactsSeedHeuristic({
      fileName: "Trans_Br [sample].csv",
      metadata,
    });

    assert.equal(result.curveType, "transfer");
    assert.equal(result.xAxisRole, "vg");
    assert.equal(result.confidence, "high");
  });

  test("accepts single-swept transfer files that only declare VAR1", () => {
    const metadata = extractImportTableFactsSeedMetadata([
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

    const result = createImportTableFactsSeedHeuristic({
      fileName: "Transfer1-3.csv",
      metadata,
    });

    assert.equal(result.curveType, "transfer");
    assert.equal(result.xAxisRole, "vg");
    assert.equal(result.confidence, "high");
  });

  test("keeps stripped CH1/CH2 sweeps unknown without extra hints", () => {
    const metadata = extractImportTableFactsSeedMetadata([
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

    const result = createImportTableFactsSeedHeuristic({
      fileName: "sample.csv",
      metadata,
    });

    assert.equal(result.curveType, "unknown");
    assert.equal(result.xAxisRole, null);
    assert.equal(result.confidence, "low");
    assert.equal(result.needsReview, true);
    assert.match(result.reasons.join(" "), /CH1\/CH2 sweep columns/i);
  });

  test("infers output from stripped sweeps when current dynamics contradict transfer filename hints", () => {
    const metadata = extractImportTableFactsSeedMetadata([
      [
        "Repeat",
        "VAR2",
        "Point",
        "CH1 Voltage",
        "CH1 Current",
        "CH2 Voltage",
        "CH2 Current",
      ],
      ["1", "1", "1", "-3.00000E+000", "-1.0E-12", "-60.00000E+000", "1.0E-9"],
      ["1", "1", "2", "-2.00000E+000", "-1.0E-10", "-60.00000E+000", "1.1E-9"],
      ["1", "1", "3", "-1.00000E+000", "-1.0E-8", "-60.00000E+000", "1.2E-9"],
      ["1", "1", "4", "0.00000E+000", "-1.0E-7", "-60.00000E+000", "1.1E-9"],
    ]);

    const result = createImportTableFactsSeedHeuristic({
      fileName: "tran.csv",
      metadata,
    });

    assert.equal(result.curveType, "output");
    assert.equal(result.xAxisRole, "vd");
    assert.equal(result.confidence, "medium");
    assert.equal(result.needsReview, false);
    assert.match(result.reasons.join(" "), /output-like Id-Vd/i);
  });

  test("infers transfer from stripped sweeps when the fixed channel carries the drain-current response", () => {
    const metadata = extractImportTableFactsSeedMetadata([
      [
        "Repeat",
        "VAR2",
        "Point",
        "CH1 Voltage",
        "CH1 Current",
        "CH2 Voltage",
        "CH2 Current",
      ],
      ["1", "1", "1", "-6.00000E+001", "1.0E-10", "2.00000E+000", "1.0E-12"],
      ["1", "1", "2", "-3.00000E+001", "1.1E-10", "2.00000E+000", "1.0E-9"],
      ["1", "1", "3", "0.00000E+000", "9.0E-11", "2.00000E+000", "1.0E-7"],
      ["1", "1", "4", "3.00000E+001", "1.2E-10", "2.00000E+000", "1.0E-5"],
      ["1", "1", "5", "6.00000E+001", "1.0E-10", "2.00000E+000", "1.0E-4"],
    ]);

    const result = createImportTableFactsSeedHeuristic({
      fileName: "sample.csv",
      metadata,
    });

    assert.equal(result.curveType, "transfer");
    assert.equal(result.xAxisRole, "vg");
    assert.equal(result.confidence, "medium");
    assert.equal(result.needsReview, false);
    assert.match(result.reasons.join(" "), /transfer-like Vg response/i);
  });

  test("uses filename plus stripped sweep shape as a low-confidence output hint", () => {
    const metadata = extractImportTableFactsSeedMetadata([
      [
        "Repeat",
        "VAR2",
        "Point",
        "CH1 Voltage",
        "CH1 Current",
        "CH2 Voltage",
        "CH2 Current",
      ],
      ["1", "1", "1", "5.00000E-001", "1.0E-9", "0.00000E+000", "1.1E-9"],
      ["1", "1", "2", "5.00000E-001", "1.1E-9", "1.00000E+000", "1.2E-9"],
      ["1", "1", "3", "5.00000E-001", "1.2E-9", "2.00000E+000", "1.3E-9"],
    ]);

    const result = createImportTableFactsSeedHeuristic({
      fileName: "out.csv",
      metadata,
    });

    assert.equal(result.curveType, "output");
    assert.equal(result.xAxisRole, "vd");
    assert.equal(result.confidence, "low");
    assert.equal(result.needsReview, true);
    assert.match(result.reasons.join(" "), /CH2 Voltage sweeping/i);
  });

  test("keeps stripped CH1/CH2 sweeps unknown when both channels vary", () => {
    const metadata = extractImportTableFactsSeedMetadata([
      [
        "Repeat",
        "VAR2",
        "Point",
        "CH1 Voltage",
        "CH1 Current",
        "CH2 Voltage",
        "CH2 Current",
      ],
      ["1", "1", "1", "0.00000E+000", "1.0E-9", "0.00000E+000", "1.1E-9"],
      ["1", "1", "2", "1.00000E+000", "1.2E-9", "1.00000E+000", "1.3E-9"],
      ["1", "1", "3", "2.00000E+000", "1.4E-9", "2.00000E+000", "1.5E-9"],
    ]);

    const result = createImportTableFactsSeedHeuristic({
      fileName: "tran.csv",
      metadata,
    });

    assert.equal(result.curveType, "unknown");
    assert.equal(result.xAxisRole, null);
    assert.equal(result.confidence, "low");
    assert.equal(result.needsReview, true);
    assert.match(result.reasons.join(" "), /CH1\/CH2 sweep columns/i);
  });

  test("returns unknown when strong metadata conflicts", () => {
    const metadata = extractImportTableFactsSeedMetadata([
      ["SetupTitle", "Transfer_DB"],
      ["TestParameter", "Output.Graph.XAxis.Data", "Vg"],
      ["DataName", "Vd", "Id", "Ig"],
    ]);

    const result = createImportTableFactsSeedHeuristic({
      fileName: "conflict.csv",
      metadata,
    });

    assert.equal(result.curveType, "unknown");
    assert.equal(result.confidence, "low");
    assert.equal(result.needsReview, true);
    assert.match(result.reasons[0], /disagree/i);
  });

  test("classifies Cp-V files as cv without review", () => {
    const result = createImportTableFactsSeedHeuristic({
      fileName: "#CV-60um-5,10kHz_2026-01-09-10-09-59.xls",
      metadata: extractImportTableFactsSeedMetadata([
        ["{c_v_ext}", "2026-01-08-21-55-45"],
        ["{(C_V_C_V_EXT)Cp_vp@ vn=0.0}", "vn=0.00000"],
        ["vp", "Cp"],
      ]),
      xAxisLabel: "vp",
    });

    assert.equal(result.curveType, "cv");
    assert.equal(result.xAxisRole, null);
    assert.equal(result.confidence, "medium");
    assert.equal(result.needsReview, false);
    assert.match(result.reasons.join(" "), /capacitance-voltage/i);
  });

  test("does not treat a CSV extension as capacitance evidence", () => {
    const result = createImportTableFactsSeedHeuristic({
      fileName: "3_1.csv",
      metadata: extractImportTableFactsSeedMetadata([
        ["CH1 Voltage", "CH1 Current", "CH1 Resistance"],
        ["-3.00000E+000", "-3.70327E-009", "810.09486E+006"],
      ]),
    });

    assert.equal(result.curveType, "unknown");
    assert.equal(result.xAxisRole, null);
    assert.equal(result.confidence, "low");
    assert.equal(result.needsReview, true);
  });

  test("keeps explicit Cs-voltage headers classified as cv", () => {
    const result = createImportTableFactsSeedHeuristic({
      fileName: "sample.csv",
      metadata: extractImportTableFactsSeedMetadata([
        ["Voltage", "Cs"],
        ["0", "1e-12"],
      ]),
    });

    assert.equal(result.curveType, "cv");
    assert.equal(result.xAxisRole, null);
    assert.equal(result.confidence, "medium");
    assert.equal(result.needsReview, false);
  });

  test("classifies Cp-freq files as cf without review", () => {
    const result = createImportTableFactsSeedHeuristic({
      fileName: "#CF-10um-10_2026-01-09-11-09-36.xls",
      metadata: extractImportTableFactsSeedMetadata([
        ["{c_freq_ext}", "2026-01-09-11-07-05"],
        ["{(C_freq_ext_C_Freq_EXT)Cp_freq@ vn=1.0}", "vn=1.00000"],
        ["freq", "Cp(vp=0.00000)"],
      ]),
      xAxisLabel: "freq",
    });

    assert.equal(result.curveType, "cf");
    assert.equal(result.xAxisRole, null);
    assert.equal(result.confidence, "medium");
    assert.equal(result.needsReview, false);
    assert.match(result.reasons.join(" "), /capacitance-frequency/i);
  });

  test("classifies FastIV pulse-voltage files as pv without review", () => {
    const result = createImportTableFactsSeedHeuristic({
      fileName: "W-AOHZOAO-W-380C-PV-D100-WAKE UP_2026-01-15-16-25-29.xls",
      metadata: extractImportTableFactsSeedMetadata([
        ["{i_v_fastiv_ivt-D150}", "2026-01-15-16-20-41"],
        ["vp", "`vp", "ipt", "Time", "vp", "in"],
      ]),
    });

    assert.equal(result.curveType, "pv");
    assert.equal(result.xAxisRole, null);
    assert.equal(result.needsReview, false);
    assert.match(result.reasons.join(" "), /pulse-voltage|fastiv/i);
  });

  test("uses x-axis label hints when metadata is absent", () => {
    const result = createImportTableFactsSeedHeuristic({
      fileName: "sample.csv",
      xAxisLabelHint: "Drain Voltage (V)",
    });

    assert.equal(result.curveType, "output");
    assert.equal(result.xAxisRole, "vd");
    assert.equal(result.xAxisRoleSource, "hint");
    assert.equal(result.confidence, "low");
    assert.equal(result.needsReview, true);
    assert.match(result.reasons.join(" "), /x-axis label hint suggests Vd/i);
  });

  test("extractImportTableFactsSeedMetadata keeps stripped sweep stats to the first VAR2 segment", () => {
    const metadata = extractImportTableFactsSeedMetadata([
      [
        "Repeat",
        "VAR2",
        "Point",
        "CH1 Voltage",
        "CH1 Current",
        "CH2 Voltage",
        "CH2 Current",
      ],
      ["1", "1", "1", "0", "1e-12", "2", "1e-9"],
      ["1", "1", "2", "1", "1e-10", "2", "1e-9"],
      ["1", "1", "3", "2", "1e-8", "2", "1e-9"],
      ["1", "2", "1", "0", "1e-3", "50", "1e-3"],
      ["1", "2", "2", "0", "1e-3", "60", "1e-3"],
    ]);

    assert.equal(metadata.isStrippedChannelSweep, true);
    assert.equal(metadata.strippedSweepVoltageAxis, "ch1");
    assert.equal(metadata.strippedFixedVoltageMagnitude, 2);
    assert.equal(metadata.strippedSweepVoltageSpan, 2);
  });
});
