import assert from "assert";

import { DebounceEmitter, Emitter, Event, EventBufferer } from "../../common/event.ts";
import { DisposableStore } from "../../common/lifecycle.ts";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";

suite("base/test/common/event", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  test("Emitter fires listeners and removes them through the returned disposable", () => {
    const emitter = new Emitter<number>();
    const values: number[] = [];
    const disposable = emitter.event(value => values.push(value));

    emitter.fire(1);
    disposable.dispose();
    emitter.fire(2);

    assert.deepEqual(values, [1]);
  });

  test("Emitter reports first and last listener lifecycle hooks", () => {
    const hooks: string[] = [];
    const emitter = new Emitter<void>({
      onWillAddFirstListener: () => hooks.push("will-add-first"),
      onDidAddFirstListener: () => hooks.push("did-add-first"),
      onDidAddListener: () => hooks.push("did-add"),
      onWillRemoveListener: () => hooks.push("will-remove"),
      onDidRemoveLastListener: () => hooks.push("did-remove-last"),
    });

    const first = emitter.event(() => {});
    const second = emitter.event(() => {});
    first.dispose();
    second.dispose();

    assert.deepEqual(hooks, [
      "will-add-first",
      "did-add-first",
      "did-add",
      "did-add",
      "will-remove",
      "will-remove",
      "did-remove-last",
    ]);
  });

  test("Event.once only forwards the first event", () => {
    const emitter = new Emitter<number>();
    const values: number[] = [];

    store.add(Event.once(emitter.event)(value => values.push(value)));
    emitter.fire(1);
    emitter.fire(2);

    assert.deepEqual(values, [1]);
  });

  test("Event.map, filter and any compose events", () => {
    const numbers = new Emitter<number>();
    const words = new Emitter<string>();
    const mapped: string[] = [];
    const anyValues: string[] = [];

    store.add(Event.map(Event.filter(numbers.event, value => value > 1), value => `n${value}`)(value => mapped.push(value)));
    store.add(Event.any(Event.map(numbers.event, value => String(value)), words.event)(value => anyValues.push(value)));

    numbers.fire(1);
    numbers.fire(2);
    words.fire("word");

    assert.deepEqual(mapped, ["n2"]);
    assert.deepEqual(anyValues, ["1", "2", "word"]);
  });

  test("Event subscriptions can be collected in a DisposableStore", () => {
    const emitter = new Emitter<number>();
    const listenerStore = store.add(new DisposableStore());
    const values: number[] = [];

    emitter.event(value => values.push(value), undefined, listenerStore);
    emitter.fire(1);
    listenerStore.dispose();
    emitter.fire(2);

    assert.deepEqual(values, [1]);
  });

  test("EventBufferer delays events until buffered work completes", () => {
    const emitter = new Emitter<number>();
    const bufferer = new EventBufferer();
    const values: number[] = [];

    store.add(bufferer.wrapEvent(emitter.event)(value => values.push(value)));

    bufferer.bufferEvents(() => {
      emitter.fire(1);
      emitter.fire(2);
      assert.deepEqual(values, []);
    });

    assert.deepEqual(values, [1, 2]);
  });

  test("EventBufferer can reduce buffered events", () => {
    const emitter = new Emitter<number>();
    const bufferer = new EventBufferer();
    const values: number[] = [];

    store.add(bufferer.wrapEvent(
      emitter.event,
      (last, value) => (last ?? 0) + value,
      0,
    )(value => values.push(value)));

    bufferer.bufferEvents(() => {
      emitter.fire(1);
      emitter.fire(2);
      emitter.fire(3);
      assert.deepEqual(values, []);
    });

    assert.deepEqual(values, [6]);
  });

  test("DebounceEmitter merges events after the delay", async () => {
    const emitter = store.add(new DebounceEmitter<number>({
      delay: 0,
      merge: events => events.reduce((sum, event) => sum + event, 0),
    }));
    const values: number[] = [];

    store.add(emitter.event(value => values.push(value)));

    emitter.fire(1);
    emitter.fire(2);
    assert.deepEqual(values, []);

    await timeout(0);

    assert.deepEqual(values, [3]);
  });
});

const timeout = (ms: number): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, ms));
