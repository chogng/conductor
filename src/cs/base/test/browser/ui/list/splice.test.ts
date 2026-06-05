import assert from "assert";

import {
  CombinedSpliceable,
  type ISpliceable,
} from "../../../../browser/ui/list/splice.ts";

suite("base/test/browser/ui/list/splice", () => {
  test("CombinedSpliceable forwards splice operations to every target", () => {
    const calls: Array<{ start: number; deleteCount: number; elements: string[] }> = [];
    const first: ISpliceable<string> = {
      splice: (start, deleteCount, elements) => {
        calls.push({ start, deleteCount, elements });
      },
    };
    const second: ISpliceable<string> = {
      splice: (start, deleteCount, elements) => {
        calls.push({ start, deleteCount, elements });
      },
    };
    const elements = ["a", "b"];

    new CombinedSpliceable([first, second]).splice(1, 2, elements);

    assert.deepEqual(calls, [
      { start: 1, deleteCount: 2, elements },
      { start: 1, deleteCount: 2, elements },
    ]);
    assert.equal(calls[0].elements, elements);
    assert.equal(calls[1].elements, elements);
  });
});
