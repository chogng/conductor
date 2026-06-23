/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { Lazy } from "../../common/lazy.ts";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";

suite("base/test/common/lazy", () => {
  ensureNoDisposablesAreLeakedInTestSuite();

  test("evaluates once and exposes raw value after resolution", () => {
    let calls = 0;
    const lazy = new Lazy(() => {
      calls++;
      return "resolved";
    });

    assert.equal(lazy.hasValue, false);
    assert.equal(lazy.rawValue, undefined);
    assert.equal(lazy.value, "resolved");
    assert.equal(lazy.value, "resolved");
    assert.equal(lazy.rawValue, "resolved");
    assert.equal(lazy.hasValue, true);
    assert.equal(calls, 1);
  });

  test("caches and rethrows evaluation errors", () => {
    let calls = 0;
    const expectedError = new Error("boom");
    const lazy = new Lazy(() => {
      calls++;
      throw expectedError;
    });

    assert.throws(() => lazy.value, error => error === expectedError);
    assert.throws(() => lazy.value, error => error === expectedError);
    assert.equal(lazy.hasValue, true);
    assert.equal(calls, 1);
  });

  test("rejects recursive value reads during initialization", () => {
    let lazy!: Lazy<number>;
    lazy = new Lazy(() => lazy.value);

    assert.throws(
      () => lazy.value,
      /Cannot read the value of a lazy that is being initialized/,
    );
  });
});
