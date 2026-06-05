import assert from "assert";

import { Iterable } from "../../common/iterator.ts";

suite("base/test/common/iterator", () => {
  test("Iterable helpers wrap, map, filter and flatten values", () => {
    const values = Iterable.wrap(1);
    const result = Iterable.flatMap(
      Iterable.map(Iterable.filter(values, value => value > 0), value => value + 1),
      value => [value, value * 10],
    );

    assert.deepEqual([...result], [2, 20]);
  });

  test("Iterable helpers inspect values without consuming arrays unexpectedly", () => {
    const values = [1, 2, 3];

    assert.equal(Iterable.is(values), true);
    assert.equal(Iterable.isEmpty(values), false);
    assert.equal(Iterable.first(values), 1);
    assert.equal(Iterable.some(values, value => value === 2), true);
    assert.equal(Iterable.every(values, value => value > 0), true);
    assert.equal(Iterable.find(values, value => value > 2), 3);
    assert.equal(Iterable.length(values), 3);
  });

  test("Iterable concat, reverse, reduce and slice follow array-like order", () => {
    assert.deepEqual([...Iterable.concat([1, 2], 3, Iterable.reverse([4, 5]))], [1, 2, 3, 5, 4]);
    assert.equal(Iterable.reduce([1, 2, 3], (sum, value) => sum + value, 0), 6);
    assert.deepEqual([...Iterable.slice([1, 2, 3, 4], -3, -1)], [2, 3]);
  });

  test("Iterable.consume returns consumed values and a remainder iterator", () => {
    const [consumed, remainder] = Iterable.consume([1, 2, 3], 2);

    assert.deepEqual(consumed, [1, 2]);
    assert.deepEqual([...remainder], [3]);

    const [none, original] = Iterable.consume([4, 5], 0);
    assert.deepEqual(none, []);
    assert.deepEqual([...original], [4, 5]);
  });

  test("Iterable async helpers collect async iterables", async () => {
    async function* values() {
      yield [1, 2];
      yield [3];
    }

    assert.deepEqual(await Iterable.asyncToArrayFlat(values()), [1, 2, 3]);
  });
});
