import assert from "assert";

import { Sequence } from "../../common/sequence.ts";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";

suite("base/test/common/sequence", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();

  test("Sequence mutates elements and fires splice events", () => {
    const sequence = new Sequence<string>();
    const events: Array<{
      readonly deleteCount: number;
      readonly start: number;
      readonly toInsert: readonly string[];
    }> = [];
    const inserted = ["alpha", "beta"];
    store.add(sequence.onDidSplice(event => events.push(event)));

    sequence.splice(0, 0, inserted);
    sequence.splice(1, 1, ["gamma"]);

    assert.deepEqual(sequence.elements, ["alpha", "gamma"]);
    assert.deepEqual(events, [
      { start: 0, deleteCount: 0, toInsert: inserted },
      { start: 1, deleteCount: 1, toInsert: ["gamma"] },
    ]);
    assert.equal(events[0].toInsert, inserted);
  });
});
