/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";
import { TableModel, TABLE_MODEL_RULE_VERSION, type TableModelRecord } from "src/cs/workbench/services/tableModel/common/tableModel";
import { createEmptyRawTableStructure } from "src/cs/workbench/services/tableModel/common/rawTableStructure";

suite("workbench/services/tableModel/test/common/tableModelRecord", () => {
  ensureNoDisposablesAreLeakedInTestSuite();

  test("drops retired review/template fields from TableModel", () => {
    const tableModel = TableModel.fromRecord(createTableModelRecordWithRetiredFields());
    const context = tableModel as Record<string, unknown>;

    assert.equal(context.recipeFingerprint, undefined);
    assert.equal(context.templateCandidates, undefined);
    assert.equal(context.selectedTemplate, undefined);
    assert.equal(context.reviewedTemplate, undefined);
    assert.deepEqual(Object.keys(context).sort(), [
      "blocks",
      "columnProfiles",
      "layoutCandidates",
      "semanticCandidates",
      "sourceMetadata",
      "structure",
    ]);
  });
});

type TableModelRecordWithRetiredFields = TableModelRecord & {
  readonly recipeFingerprint?: unknown;
  readonly reviewedTemplate?: unknown;
  readonly selectedTemplate?: unknown;
  readonly templateCandidates?: unknown;
};

const createTableModelRecordWithRetiredFields = (): TableModelRecord => ({
  tableModelRuleVersion: TABLE_MODEL_RULE_VERSION,
  schemaProfileVersion: 0,
  fileId: "file-a",
  rawTableId: "table-a",
  sourceRawTableVersion: 1,
  structure: createEmptyRawTableStructure(),
  columnProfiles: [],
  layoutCandidates: [],
  semanticCandidates: [],
  groups: [],
  blocks: [],
  diagnostics: [],
  createdAt: 1,
  recipeFingerprint: "recipe:retired-field",
  reviewedTemplate: { id: "reviewed-template" },
  selectedTemplate: { id: "selected-template" },
  templateCandidates: [{ id: "candidate" }],
} as TableModelRecordWithRetiredFields);
