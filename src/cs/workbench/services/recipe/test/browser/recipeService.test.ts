/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";
import { RecipeService } from "src/cs/workbench/services/recipe/browser/recipeService";

suite("workbench/services/recipe/test/browser/recipeService", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();

  test("exposes builtin recipe snapshot without evaluating raw tables", async () => {
    const service = store.add(new RecipeService());
    const snapshot = service.getSnapshot();

    assert.deepEqual(
      snapshot.recipes.map(recipe => recipe.id),
      [
        "builtin.iv.transfer.x-y-group",
        "builtin.iv.output.x-y-group",
        "builtin.iv.transfer",
        "builtin.iv.output",
        "builtin.capacitance.cf",
        "builtin.capacitance.cv",
        "builtin.currentTime.it",
      ],
    );
    assert.equal(snapshot.diagnostics.length, 0);
    assert.equal(snapshot.fingerprint.startsWith("recipe:"), true);

    const events: unknown[] = [];
    const disposable = store.add(service.onDidChangeRecipes(() => events.push(undefined)));
    await service.reload();

    assert.equal(service.getSnapshot().fingerprint, snapshot.fingerprint);
    assert.deepEqual(events, []);
    disposable.dispose();
  });
});
