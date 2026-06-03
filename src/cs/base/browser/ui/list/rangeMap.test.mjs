import assert from "node:assert/strict";
import test from "node:test";

import { RangeMap } from "./rangeMap.ts";

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
