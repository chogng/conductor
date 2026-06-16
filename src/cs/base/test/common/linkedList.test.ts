import assert from "assert";

import { LinkedList } from "../../common/linkedList.ts";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";

suite("base/test/common/linkedList", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  function assertElements<E>(list: LinkedList<E>, elements: E[]): void {
    assert.equal(list.size, elements.length);
    assert.deepEqual([...list], elements);
  }

  test("LinkedList preserves push and unshift order", () => {
    const list = new LinkedList<number>();

    list.push(1);
    list.push(2);
    list.unshift(0);

    assert.equal(list.isEmpty(), false);
    assertElements(list, [0, 1, 2]);
  });

  test("LinkedList removers detach head, middle and tail once", () => {
    const list = new LinkedList<number>();
    const removeHead = list.push(1);
    const removeMiddle = list.push(2);
    const removeTail = list.push(3);

    removeMiddle();
    assertElements(list, [1, 3]);

    removeHead();
    removeHead();
    assertElements(list, [3]);

    removeTail();
    assert.equal(list.isEmpty(), true);
    assertElements(list, []);
  });

  test("LinkedList shift, pop, peek and clear update size", () => {
    const list = new LinkedList<string>();

    assert.equal(list.shift(), undefined);
    assert.equal(list.pop(), undefined);

    list.push("a");
    list.push("b");
    assert.equal(list.peek(), "b");
    assert.equal(list.shift(), "a");
    assert.equal(list.pop(), "b");
    assert.equal(list.size, 0);

    list.unshift("x");
    list.unshift("y");
    list.clear();
    assert.equal(list.isEmpty(), true);
    assertElements(list, []);
  });
});
