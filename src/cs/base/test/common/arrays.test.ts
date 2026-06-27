/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { distinct, equals, mapFilter } from "../../common/arrays.ts";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";

suite("base/test/common/arrays", () => {
  ensureNoDisposablesAreLeakedInTestSuite();

  test("equals compares arrays in order", () => {
    assert.equal(equals([1, 2, 3], [1, 2, 3]), true);
    assert.equal(equals([1, 2, 3], [1, 3, 2]), false);
    assert.equal(equals([1], [1, 2]), false);
    assert.equal(equals(undefined, [1]), false);
    assert.equal(equals(undefined, undefined), true);
  });

  test("equals supports custom item comparison", () => {
    assert.equal(
      equals(
        [{ id: "a" }, { id: "b" }],
        [{ id: "a" }, { id: "b" }],
        (first, second) => first.id === second.id,
      ),
      true,
    );
    assert.equal(
      equals(
        [{ id: "a" }],
        [{ id: "b" }],
        (first, second) => first.id === second.id,
      ),
      false,
    );
  });

  test("distinct preserves first occurrence order", () => {
    assert.deepEqual(distinct(["a", "b", "a", "c", "b"]), ["a", "b", "c"]);
  });

  test("distinct supports key extraction", () => {
    assert.deepEqual(
      distinct([
        { id: "a", label: "first" },
        { id: "b", label: "second" },
        { id: "a", label: "duplicate" },
      ], value => value.id),
      [
        { id: "a", label: "first" },
        { id: "b", label: "second" },
      ],
    );
  });

  test("mapFilter maps and removes undefined values", () => {
    assert.deepEqual(
      mapFilter([1, 2, 3], value => value % 2 === 0 ? `value-${value}` : undefined),
      ["value-2"],
    );
  });
});
