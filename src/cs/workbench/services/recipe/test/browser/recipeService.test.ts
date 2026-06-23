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

    assert.equal(snapshot.recipes.length, 5);
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
