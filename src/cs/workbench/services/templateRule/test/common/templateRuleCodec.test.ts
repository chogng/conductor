/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";
import { builtinTemplateRules } from "src/cs/workbench/services/templateRule/common/builtinTemplateRules.generated";
import {
  createTemplateRuleSnapshot,
  normalizeTemplateDerivationRules,
} from "src/cs/workbench/services/templateRule/common/templateRuleCodec";

suite("workbench/services/templateRule/test/common/templateRuleCodec", () => {
  ensureNoDisposablesAreLeakedInTestSuite();

  test("normalizes builtin derivation rules into a fingerprinted snapshot", () => {
    const snapshot = createTemplateRuleSnapshot(builtinTemplateRules, "builtin");

    assert.equal(snapshot.version, 1);
    assert.equal(snapshot.diagnostics.length, 0);
    assert.deepEqual(snapshot.rules.map(rule => rule.id), [
      "builtin.iv.transfer",
      "builtin.iv.output",
      "builtin.capacitance.cf",
      "builtin.capacitance.cv",
      "builtin.currentTime.it",
    ]);
    assert.equal(snapshot.rules.every(rule => rule.source === "builtin"), true);
    assert.equal(snapshot.fingerprint.startsWith("rule:"), true);
  });

  test("rejects unknown predicates and capture references", () => {
    const result = normalizeTemplateDerivationRules([{
      schemaVersion: 1,
      id: "workspace.invalid",
      version: 1,
      priority: 1,
      enabled: true,
      match: {
        all: [{
          kind: "mystery",
        }],
      },
      emit: {
        name: {
          kind: "literal",
          value: "Invalid",
        },
        blocks: {
          source: "eachMatchedBlock",
          rowRange: "block.dataRange",
          x: {
            columns: {
              kind: "capturedColumns",
              capture: "missing",
            },
          },
          y: {
            columns: {
              kind: "literalColumns",
              columns: [1],
            },
          },
          segmentation: {
            kind: "auto",
          },
          legend: {
            target: "auto",
          },
        },
      },
    }], "workspace");

    assert.deepEqual(result.rules, []);
    assert.deepEqual(result.diagnostics.map(diagnostic => diagnostic.code), [
      "templateRule.unknownPredicate",
      "templateRule.unknownCapture",
    ]);
  });
});
