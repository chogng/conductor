/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { AssessmentService } from "src/cs/workbench/services/assessment/browser/assessmentService";

suite("workbench/services/assessment/test/browser/assessmentService", () => {
  test("assesses import rows through the service owner", async () => {
    const service = new AssessmentService();
    const result = await service.assessImportRows("transfer.csv", [
      ["SetupTitle", "Transfer_DB"],
      ["TestParameter", "Channel.VName", "Vg", "Vd", "Vs"],
      ["TestParameter", "Channel.Func", "VAR1", "VAR2", "CONST"],
      ["TestParameter", "Output.Graph.XAxis.Data", "Vg"],
      ["DataName", "Vg", "Id", "Ig"],
      ["DataValue", "-1", "-2.63E-12", "-2.05E-12"],
    ]);

    assert.equal(result.curveFamily, "iv");
    assert.equal(result.curveType, "transfer (vg)");
    assert.equal(result.curveTypeConfidence, "high");
    assert.equal(result.curveTypeNeedsTemplate, false);
    assert.equal(result.ivMode, "transfer");
    assert.equal(result.xAxisRole, "vg");
  });

  test("wraps raw table assessment records with source version", async () => {
    const service = new AssessmentService();
    const result = await service.assessRawTable({
      fileId: "file-a",
      rawTableId: "raw-a",
      sourceRawTableVersion: 3,
      fileName: "transfer.csv",
      rows: [
        ["DataName", "Vg", "Id"],
        ["DataValue", "-1", "-2.63E-12"],
      ],
    });

    assert.equal(result.fileId, "file-a");
    assert.equal(result.rawTableId, "raw-a");
    assert.equal(result.sourceRawTableVersion, 3);
    assert.equal(result.blocks.length, 1);
    assert.equal(result.blocks[0].fileId, "file-a");
    assert.equal(result.blocks[0].family, "iv");
    assert.equal(result.blocks[0].ivMode, "transfer");
    assert.equal(result.blocks[0].confidence, 0.9);
  });
});
