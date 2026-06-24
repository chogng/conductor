/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";
import { ASSESSMENT_RULE_VERSION, type RawTableAssessmentRecord } from "src/cs/workbench/services/assessment/common/assessment";
import { createRawTableFactsFromLegacyAssessment } from "src/cs/workbench/services/assessment/common/legacyAssessmentAdapter";
import { createEmptyRawTableStructure } from "src/cs/workbench/services/tableFacts/common/rawTableStructure";

suite("workbench/services/assessment/test/common/assessmentEvidence", () => {
  ensureNoDisposablesAreLeakedInTestSuite();

  test("adapts legacy assessment records into raw table facts only", () => {
    const tableFacts = createRawTableFactsFromLegacyAssessment(createLegacyAssessment());
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

type LegacyAssessmentRecord = RawTableAssessmentRecord & {
  readonly recipeFingerprint?: unknown;
  readonly reviewedTemplate?: unknown;
  readonly selectedTemplate?: unknown;
  readonly templateCandidates?: unknown;
};

const createLegacyAssessment = (): RawTableAssessmentRecord => ({
  assessmentRuleVersion: ASSESSMENT_RULE_VERSION,
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
} as LegacyAssessmentRecord);
