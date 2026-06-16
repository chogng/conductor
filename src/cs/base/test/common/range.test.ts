import assert from "assert";

import { Range } from "../../common/range.ts";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";

suite("base/test/common/range", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("Range intersects and reports empty intersections", () => {
    assert.deepEqual(Range.intersect({ start: 1, end: 5 }, { start: 3, end: 8 }), { start: 3, end: 5 });
    assert.deepEqual(Range.intersect({ start: 1, end: 3 }, { start: 3, end: 8 }), { start: 0, end: 0 });
    assert.equal(Range.intersects({ start: 1, end: 3 }, { start: 3, end: 8 }), false);
    assert.equal(Range.isEmpty({ start: 4, end: 4 }), true);
  });

  test("Range.relativeComplement returns the parts outside another range", () => {
    assert.deepEqual(
      Range.relativeComplement({ start: 1, end: 10 }, { start: 3, end: 7 }),
      [{ start: 1, end: 3 }, { start: 7, end: 10 }],
    );
    assert.deepEqual(
      Range.relativeComplement({ start: 1, end: 10 }, { start: 0, end: 4 }),
      [{ start: 4, end: 10 }],
    );
    assert.deepEqual(Range.relativeComplement({ start: 1, end: 10 }, { start: 1, end: 10 }), []);
  });
});
