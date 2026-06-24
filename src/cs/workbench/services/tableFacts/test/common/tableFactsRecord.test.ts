/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";
import { createRawTableFactsFromRecord, TABLE_FACTS_RULE_VERSION, type RawTableFactsRecord } from "src/cs/workbench/services/tableFacts/common/tableFacts";
import { createEmptyRawTableStructure } from "src/cs/workbench/services/tableFacts/common/rawTableStructure";

suite("workbench/services/tableFacts/test/common/tableFactsRecord", () => {
  ensureNoDisposablesAreLeakedInTestSuite();

  test("drops retired review/template fields from raw table facts", () => {
    const tableFacts = createRawTableFactsFromRecord(createTableFactsRecordWithRetiredFields());
    const context = tableFacts as Record<string, unknown>;

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

type RawTableFactsRecordWithRetiredFields = RawTableFactsRecord & {
  readonly recipeFingerprint?: unknown;
  readonly reviewedTemplate?: unknown;
  readonly selectedTemplate?: unknown;
  readonly templateCandidates?: unknown;
};

const createTableFactsRecordWithRetiredFields = (): RawTableFactsRecord => ({
  tableFactsRuleVersion: TABLE_FACTS_RULE_VERSION,
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
} as RawTableFactsRecordWithRetiredFields);
