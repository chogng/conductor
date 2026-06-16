/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { resolveInitialSearchX } from "src/cs/workbench/contrib/search/browser/searchView";

suite("workbench/contrib/search/test/browser/searchView", () => {
  test("defaults the X input to zero when the plot domain crosses zero", () => {
    assert.equal(resolveInitialSearchX([-3, 2.99998]), 0);
    assert.equal(resolveInitialSearchX([-3, 3]), 0);
    assert.equal(resolveInitialSearchX([1, 3]), 2);
  });
});
