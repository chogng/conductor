/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import {
  delta,
  distinct,
  equals,
  mapFilter,
  range,
  sortedDiff,
  top,
  topAsync,
} from "../../common/arrays.ts";
import { CancellationToken } from "../../common/cancellation.ts";
import { CancellationError } from "../../common/errors.ts";
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

  test("range returns ascending and descending numeric ranges", () => {
    assert.deepEqual(range(3), [0, 1, 2]);
    assert.deepEqual(range(2, 5), [2, 3, 4]);
    assert.deepEqual(range(5, 2), [5, 4, 3]);
  });

  test("sortedDiff returns merged splices for sorted arrays", () => {
    assert.deepEqual(
      sortedDiff([1, 2, 4, 6], [2, 3, 4, 5], (first, second) => first - second),
      [
        { start: 0, deleteCount: 1, toInsert: [] },
        { start: 2, deleteCount: 0, toInsert: [3] },
        { start: 3, deleteCount: 1, toInsert: [5] },
      ],
    );
  });

  test("delta returns removed and added values for sorted arrays", () => {
    assert.deepEqual(
      delta([1, 2, 4, 6], [2, 3, 4, 5], (first, second) => first - second),
      { removed: [1, 6], added: [3, 5] },
    );
  });

  test("top returns the first n sorted values without sorting the full array", () => {
    const compare = (first: number, second: number): number => first - second;

    assert.deepEqual(top([], compare, 1), []);
    assert.deepEqual(top([1], compare, 0), []);
    assert.deepEqual(top([1, 2], compare, 1), [1]);
    assert.deepEqual(top([2, 1], compare, 1), [1]);
    assert.deepEqual(top([1, 3, 2], compare, 2), [1, 2]);
    assert.deepEqual(top([3, 2, 1], compare, 3), [1, 2, 3]);
    assert.deepEqual(top([4, 6, 2, 7, 8, 3, 5, 1], compare, 3), [1, 2, 3]);
  });

  test("topAsync returns the first n sorted values across batches", async () => {
    const compare = (first: number, second: number): number => first - second;

    for (let batch = 1; batch <= 3; batch += 1) {
      assert.deepEqual(await topAsync([], compare, 1, batch), []);
      assert.deepEqual(await topAsync([1], compare, 0, batch), []);
      assert.deepEqual(await topAsync([1, 2], compare, 1, batch), [1]);
      assert.deepEqual(await topAsync([2, 1], compare, 1, batch), [1]);
      assert.deepEqual(await topAsync([1, 3, 2], compare, 2, batch), [1, 2]);
      assert.deepEqual(await topAsync([3, 2, 1], compare, 3, batch), [1, 2, 3]);
      assert.deepEqual(await topAsync([4, 6, 2, 7, 8, 3, 5, 1], compare, 3, batch), [1, 2, 3]);
    }
  });

  test("topAsync rejects with CancellationError when cancelled", async () => {
    await assert.rejects(
      topAsync([2, 1], (first, second) => first - second, 1, 1, CancellationToken.Cancelled),
      CancellationError,
    );
  });
});
