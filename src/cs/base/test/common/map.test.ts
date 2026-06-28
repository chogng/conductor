import assert from "assert";

import { LinkedMap, LRUCache, MRUCache, ResourceMap, ResourceSet, Touch } from "../../common/map.ts";
import { extUriIgnorePathCase } from "../../common/resources.ts";
import { URI } from "../../common/uri.ts";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";

suite("base/test/common/map", () => {
  ensureNoDisposablesAreLeakedInTestSuite();

  test("LinkedMap preserves insertion order", () => {
    const map = new LinkedMap<string, string>();

    map.set("a", "alpha");
    map.set("b", "bravo");

    assert.deepEqual([...map.keys()], ["a", "b"]);
    assert.deepEqual([...map.values()], ["alpha", "bravo"]);
    assert.equal(map.first, "alpha");
    assert.equal(map.last, "bravo");
  });

  test("LinkedMap touches entries as old or new", () => {
    const map = new LinkedMap<string, string>();
    map.set("a", "alpha");
    map.set("b", "bravo");
    map.set("c", "charlie");

    map.set("b", "bravo", Touch.AsOld);
    assert.deepEqual([...map.keys()], ["b", "a", "c"]);

    map.get("a", Touch.AsNew);
    assert.deepEqual([...map.keys()], ["b", "c", "a"]);
  });

  test("LinkedMap rejects mutation during iteration", () => {
    const map = new LinkedMap<string, string>();
    map.set("a", "alpha");
    map.set("b", "bravo");

    const keys = map.keys();
    map.get("a", Touch.AsNew);

    assert.throws(() => keys.next(), /modified during iteration/);
  });

  test("LRUCache trims the oldest entries and touch on get", () => {
    const cache = new LRUCache<number, number>(3);

    cache.set(1, 1);
    cache.set(2, 2);
    cache.set(3, 3);
    assert.equal(cache.get(1), 1);

    cache.set(4, 4);

    assert.deepEqual([...cache.keys()], [3, 1, 4]);
    assert.equal(cache.has(2), false);
    assert.equal(cache.peek(3), 3);
    assert.deepEqual([...cache.keys()], [3, 1, 4]);
  });

  test("MRUCache trims the newest entries", () => {
    const cache = new MRUCache<number, number>(3);

    cache.set(1, 1);
    cache.set(2, 2);
    cache.set(3, 3);
    cache.get(2);
    cache.set(4, 4);

    assert.deepEqual([...cache.keys()], [1, 3, 4]);
    assert.equal(cache.has(2), false);
  });

  test("ResourceMap uses URI string identity by default", () => {
    const map = new ResourceMap<number>();
    const first = URI.file("/workspace/Data.csv");
    const second = URI.file("/workspace/data.csv");

    map.set(first, 1);
    map.set(second, 2);

    assert.equal(map.size, 2);
    assert.equal(map.get(first), 1);
    assert.equal(map.get(second), 2);
    assert.deepEqual([...map.values()], [1, 2]);
  });

  test("ResourceMap accepts caller-owned URI comparison keys", () => {
    const map = new ResourceMap<number>(resource => extUriIgnorePathCase.getComparisonKey(resource));
    const first = URI.file("/workspace/Data.csv");
    const second = URI.file("/workspace/data.csv");

    map.set(first, 1);
    map.set(second, 2);

    assert.equal(map.size, 1);
    assert.equal(map.get(first), 2);
    assert.equal(map.get(second), 2);
    assert.equal([...map.keys()][0], second);
  });

  test("ResourceSet deduplicates with caller-owned URI comparison keys", () => {
    const first = URI.file("/workspace/Data.csv");
    const second = URI.file("/workspace/data.csv");
    const set = new ResourceSet([first, second], resource => extUriIgnorePathCase.getComparisonKey(resource));

    assert.equal(set.size, 1);
    assert.equal(set.has(first), true);
    assert.equal(set.has(second), true);
    assert.equal([...set][0], second);
  });
});
