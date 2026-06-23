/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";
import type { AssessmentEvidence } from "src/cs/workbench/services/assessment/common/assessmentEvidence";
import { evaluateTemplateRule } from "src/cs/workbench/services/assessment/common/templateRuleEvaluator";
import { createEmptyRawTableStructure } from "src/cs/workbench/services/assessment/common/rawTableStructure";
import type {
  MeasurementBlockRecord,
  MeasurementColumnRef,
} from "src/cs/workbench/services/assessment/common/measurement";
import { builtinTemplateRules } from "src/cs/workbench/services/templateRule/common/builtinTemplateRules.generated";

suite("workbench/services/assessment/test/common/templateRuleEvaluator", () => {
  ensureNoDisposablesAreLeakedInTestSuite();

  test("matches builtin IV transfer rule against assessment block evidence", () => {
    const rule = builtinTemplateRules.find(candidate => candidate.id === "builtin.iv.transfer");
    assert.ok(rule);

    const evaluation = evaluateTemplateRule(rule, createEvidence({
      family: "iv",
      ivMode: "transfer",
      columns: [{
        rawCol: 0,
        headerText: "Vg",
        role: "vg",
        unit: "V",
      }, {
        rawCol: 1,
        headerText: "Id",
        role: "id",
        unit: "A",
      }],
    }));

    assert.equal(evaluation.matched, true);
    assert.deepEqual(evaluation.matches.map(match => match.blockId), ["block-a"]);
    assert.deepEqual(evaluation.matches[0]?.captures, {
      x: {
        kind: "columns",
        columns: [0],
        unit: "V",
      },
      y: {
        kind: "columns",
        columns: [1],
        unit: "A",
      },
    });
  });

  test("rejects a rule when required canonical units are missing", () => {
    const rule = builtinTemplateRules.find(candidate => candidate.id === "builtin.iv.transfer");
    assert.ok(rule);

    const evaluation = evaluateTemplateRule(rule, createEvidence({
      family: "iv",
      ivMode: "transfer",
      columns: [{
        rawCol: 0,
        headerText: "Vg",
        role: "vg",
        unit: "V",
      }, {
        rawCol: 1,
        headerText: "Id",
        role: "id",
        unit: "mA",
      }],
    }));

    assert.equal(evaluation.matched, false);
    assert.deepEqual(evaluation.diagnosticCodes, ["templateRule.columnRoleMismatch"]);
  });
});

const createEvidence = ({
  columns,
  family,
  ivMode,
}: {
  readonly columns: readonly MeasurementColumnRef[];
  readonly family: MeasurementBlockRecord["family"];
  readonly ivMode?: MeasurementBlockRecord["ivMode"];
}): AssessmentEvidence => ({
  structure: {
    ...createEmptyRawTableStructure(),
    fingerprint: "schema-a",
  },
  columnProfiles: [],
  layoutCandidates: [{
    id: "layout-a",
    layoutKind: "simpleXY",
    confidence: 0.9,
    bindings: [{
      xCol: 0,
      yCols: [1],
    }],
    reasons: [],
  }],
  semanticCandidates: [],
  blocks: [{
    id: "block-a",
    fileId: "file-a",
    rawTableId: "table-a",
    label: "Block A",
    family,
    ivMode,
    source: {
      fullRange: {
        startRow: 0,
        endRow: 1,
        startCol: 0,
        endCol: 1,
      },
    },
    columns: {
      columns,
    },
    rowCount: 2,
    columnCount: 2,
    confidence: 0.95,
    diagnosticCodes: [],
  }],
  sourceMetadata: {
    fileId: "file-a",
    rawTableId: "table-a",
    fileName: "transfer.csv",
    rowCount: 2,
    columnCount: 2,
    sourceRawTableVersion: 1,
  },
});
