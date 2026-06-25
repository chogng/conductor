/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";
import { createReviewEvidenceSignature } from "src/cs/workbench/services/review/common/review";
import {
  TABLE_MODEL_RULE_VERSION,
  type TableModelRecord,
} from "src/cs/workbench/services/tableModel/common/tableModel";
import { createEmptyRawTableStructure } from "src/cs/workbench/services/tableModel/common/rawTableStructure";

suite("workbench/services/review/test/common/review", () => {
  ensureNoDisposablesAreLeakedInTestSuite();

  test("includes URI-backed table model versions in evidence signatures", () => {
    const baseSignature = createReviewEvidenceSignature(createTableModelRecord());
    const uriSignature = createReviewEvidenceSignature({
      ...createTableModelRecord(),
      sourceModelVersion: 6,
      sourceUri: "file:///workspace/data/source.csv",
      sourceVersion: 5,
    });

    assert.notEqual(baseSignature, uriSignature);
    assert.deepEqual(JSON.parse(uriSignature).sourceModel, {
      modelVersion: 6,
      sourceUri: "file:///workspace/data/source.csv",
      sourceVersion: 5,
    });
  });
});

const createTableModelRecord = (): TableModelRecord => ({
  blocks: [],
  columnProfiles: [],
  createdAt: 1,
  diagnostics: [],
  fileId: "file-a",
  groups: [],
  layoutCandidates: [],
  rawTableId: "table-a",
  schemaProfileVersion: 0,
  semanticCandidates: [],
  sourceRawTableVersion: 4,
  structure: createEmptyRawTableStructure(),
  tableModelRuleVersion: TABLE_MODEL_RULE_VERSION,
});
