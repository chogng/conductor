/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";
import { builtinRecipes } from "src/cs/workbench/services/recipe/common/builtinRecipes.generated";
import {
  createRecipeSnapshot,
  normalizeRecipes,
} from "src/cs/workbench/services/recipe/common/recipeCodec";

suite("workbench/services/recipe/test/common/recipeCodec", () => {
  ensureNoDisposablesAreLeakedInTestSuite();

  test("normalizes builtin derivation recipes into a fingerprinted snapshot", () => {
    const snapshot = createRecipeSnapshot(builtinRecipes);

    assert.equal(snapshot.version, 1);
    assert.equal(snapshot.diagnostics.length, 0);
    assert.deepEqual(snapshot.recipes.map(recipe => recipe.id), [
      "builtin.iv.transfer",
      "builtin.iv.output",
      "builtin.capacitance.cf",
      "builtin.capacitance.cv",
      "builtin.currentTime.it",
    ]);
    assert.equal(snapshot.fingerprint.startsWith("recipe:"), true);
  });

  test("rejects unknown predicates and capture references", () => {
    const result = normalizeRecipes([{
      id: "workspace.invalid",
      version: 1,
      priority: 1,
      selector: {
        all: [{
          kind: "mystery",
        }],
      },
      projection: {
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
    }]);

    assert.deepEqual(result.recipes, []);
    assert.deepEqual(result.diagnostics.map(diagnostic => diagnostic.code), [
      "recipe.unknownPredicate",
      "recipe.unknownCapture",
    ]);
  });
});
