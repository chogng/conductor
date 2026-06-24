/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";
import { ASSESSMENT_RULE_VERSION, type RawTableAssessmentRecord } from "src/cs/workbench/services/assessment/common/assessment";
import { createRawTableEvidenceFromLegacyAssessment } from "src/cs/workbench/services/assessment/common/legacyAssessmentAdapter";
import { createEmptyRawTableStructure } from "src/cs/workbench/services/assessment/common/rawTableStructure";

suite("workbench/services/assessment/test/common/assessmentEvidence", () => {
  ensureNoDisposablesAreLeakedInTestSuite();

  test("adapts legacy assessment records into raw table evidence only", () => {
    const evidence = createRawTableEvidenceFromLegacyAssessment(createAssessment());
    const context = evidence as Record<string, unknown>;

    assert.equal(context.decision, undefined);
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

const createAssessment = (): RawTableAssessmentRecord => ({
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
  decision: {
    state: "reviewRequired",
    autoApplyAllowed: false,
    confidence: 0.4,
    reasons: ["assessment.reviewRequired"],
  },
  diagnostics: [],
  createdAt: 1,
});
