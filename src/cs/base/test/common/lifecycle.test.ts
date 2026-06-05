import assert from "assert";

import {
  combinedDisposable,
  Disposable,
  DisposableStore,
  isDisposable,
  MutableDisposable,
  toDisposable,
} from "../../common/lifecycle.ts";

suite("base/test/common/lifecycle", () => {
  test("DisposableStore disposes added items and immediately disposes late additions", () => {
    const disposed: string[] = [];
    const store = new DisposableStore();

    store.add(toDisposable(() => disposed.push("first")));
    store.add(toDisposable(() => disposed.push("second")));

    store.dispose();
    assert.deepEqual(disposed, ["first", "second"]);
    assert.equal(store.isDisposed, true);

    store.add(toDisposable(() => disposed.push("late")));
    assert.deepEqual(disposed, ["first", "second", "late"]);
  });

  test("DisposableStore clear disposes current entries without closing the store", () => {
    const disposed: string[] = [];
    const store = new DisposableStore();

    store.add(toDisposable(() => disposed.push("first")));
    store.clear();
    store.add(toDisposable(() => disposed.push("second")));
    store.dispose();

    assert.deepEqual(disposed, ["first", "second"]);
  });

  test("MutableDisposable disposes replaced and late values", () => {
    const disposed: string[] = [];
    const first = toDisposable(() => disposed.push("first"));
    const second = toDisposable(() => disposed.push("second"));
    const late = toDisposable(() => disposed.push("late"));
    const mutable = new MutableDisposable();

    mutable.current = first;
    mutable.current = second;
    assert.deepEqual(disposed, ["first"]);
    assert.equal(mutable.current, second);

    mutable.dispose();
    mutable.current = late;

    assert.deepEqual(disposed, ["first", "second", "late"]);
    assert.equal(mutable.current, undefined);
  });

  test("combinedDisposable and isDisposable handle disposable-like values", () => {
    const disposed: string[] = [];
    const disposable = combinedDisposable(
      toDisposable(() => disposed.push("first")),
      undefined,
      toDisposable(() => disposed.push("second")),
    );

    assert.equal(isDisposable(disposable), true);
    assert.equal(isDisposable({ dispose: "nope" }), false);

    disposable.dispose();
    assert.deepEqual(disposed, ["first", "second"]);
  });

  test("Disposable registers owned resources", () => {
    class Owner extends Disposable {
      public addResource() {
        return this._register(toDisposable(() => disposed.push("resource")));
      }
    }

    const disposed: string[] = [];
    const owner = new Owner();

    owner.addResource();
    owner.dispose();

    assert.deepEqual(disposed, ["resource"]);
  });
});
