/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";
import { TABLE_FACTS_RULE_VERSION, type RawTableFactsRecord } from "src/cs/workbench/services/tableFacts/common/tableFacts";
import { createRawTableFactsFromLegacyTableFacts } from "src/cs/workbench/services/tableFacts/common/legacyTableFactsAdapter";
import { createEmptyRawTableStructure } from "src/cs/workbench/services/tableFacts/common/rawTableStructure";

suite("workbench/services/tableFacts/test/common/tableFactsLegacyAdapter", () => {
  ensureNoDisposablesAreLeakedInTestSuite();

  test("adapts legacy tableFacts records into raw table facts only", () => {
    const tableFacts = createRawTableFactsFromLegacyTableFacts(createLegacyTableFacts());
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

type LegacyTableFactsRecord = RawTableFactsRecord & {
  readonly recipeFingerprint?: unknown;
  readonly reviewedTemplate?: unknown;
  readonly selectedTemplate?: unknown;
  readonly templateCandidates?: unknown;
};

const createLegacyTableFacts = (): RawTableFactsRecord => ({
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
  recipeFingerprint: "recipe:legacy",
  reviewedTemplate: { id: "reviewed-template" },
  selectedTemplate: { id: "selected-template" },
  templateCandidates: [{ id: "candidate" }],
} as LegacyTableFactsRecord);
