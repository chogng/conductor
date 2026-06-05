import assert from "assert";

import { RangeMap } from "../../../../browser/ui/list/rangeMap.ts";

suite("base/test/browser/ui/list/rangeMap", () => {
  test("RangeMap maps positions and indexes across equal-size groups", () => {
    const map = new RangeMap();
    map.splice(0, 0, [{ size: 28 }, { size: 28 }, { size: 28 }]);

    assert.equal(map.count, 3);
    assert.equal(map.size, 84);
    assert.equal(map.positionAt(0), 0);
    assert.equal(map.positionAt(2), 56);
    assert.equal(map.indexAt(0), 0);
    assert.equal(map.indexAt(27), 0);
    assert.equal(map.indexAt(28), 1);
    assert.equal(map.indexAfter(28), 2);
  });

  test("RangeMap keeps positions correct after mixed-size splice", () => {
    const map = new RangeMap();
    map.splice(0, 0, [
      { size: 20 },
      { size: 20 },
      { size: 20 },
      { size: 20 },
    ]);
    map.splice(1, 2, [{ size: 30 }]);

    assert.equal(map.count, 3);
    assert.equal(map.size, 70);
    assert.equal(map.positionAt(0), 0);
    assert.equal(map.positionAt(1), 20);
    assert.equal(map.positionAt(2), 50);
    assert.equal(map.indexAt(49), 1);
    assert.equal(map.indexAt(50), 2);
  });

  test("RangeMap returns boundary values for empty and out-of-range positions", () => {
    const map = new RangeMap();

    assert.equal(map.count, 0);
    assert.equal(map.size, 0);
    assert.equal(map.indexAt(-1), -1);
    assert.equal(map.indexAt(0), 0);
    assert.equal(map.indexAfter(0), 0);
    assert.equal(map.positionAt(-1), -1);
    assert.equal(map.positionAt(0), -1);
  });

  test("RangeMap preserves following item positions after deletes and inserts", () => {
    const map = new RangeMap();
    map.splice(0, 0, [
      { size: 5 },
      { size: 5 },
      { size: 10 },
      { size: 10 },
      { size: 20 },
    ]);

    map.splice(1, 2, [{ size: 30 }, { size: 40 }]);

    assert.equal(map.count, 5);
    assert.equal(map.size, 105);
    assert.equal(map.positionAt(0), 0);
    assert.equal(map.positionAt(1), 5);
    assert.equal(map.positionAt(2), 35);
    assert.equal(map.positionAt(3), 75);
    assert.equal(map.positionAt(4), 85);
    assert.equal(map.indexAt(74), 2);
    assert.equal(map.indexAt(75), 3);
  });
});
