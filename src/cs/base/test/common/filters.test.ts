import assert from "assert";

import { matchesFuzzy2, matchesPrefix } from "../../common/filters.ts";

suite("base/test/common/filters", () => {
  test("matchesPrefix matches case-insensitive prefixes", () => {
    assert.deepEqual(matchesPrefix("alp", "Alpha"), [{ start: 0, end: 3 }]);
    assert.equal(matchesPrefix("bet", "Alpha"), null);
  });

  test("matchesFuzzy2 matches ordered characters", () => {
    assert.deepEqual(matchesFuzzy2("gm", "gamma"), [
      { start: 0, end: 1 },
      { start: 2, end: 3 },
    ]);
    assert.equal(matchesFuzzy2("zx", "gamma"), null);
  });
});
