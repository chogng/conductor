import assert from "node:assert/strict";
import test from "node:test";

import { Emitter, Event } from "../../common/event.ts";
import { DisposableStore } from "../../common/lifecycle.ts";

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

  Event.once(emitter.event)(value => values.push(value));
  emitter.fire(1);
  emitter.fire(2);

  assert.deepEqual(values, [1]);
});

test("Event.map, filter and any compose events", () => {
  const numbers = new Emitter<number>();
  const words = new Emitter<string>();
  const mapped: string[] = [];
  const anyValues: string[] = [];

  Event.map(Event.filter(numbers.event, value => value > 1), value => `n${value}`)(value => mapped.push(value));
  Event.any(Event.map(numbers.event, value => String(value)), words.event)(value => anyValues.push(value));

  numbers.fire(1);
  numbers.fire(2);
  words.fire("word");

  assert.deepEqual(mapped, ["n2"]);
  assert.deepEqual(anyValues, ["1", "2", "word"]);
});

test("Event subscriptions can be collected in a DisposableStore", () => {
  const emitter = new Emitter<number>();
  const store = new DisposableStore();
  const values: number[] = [];

  emitter.event(value => values.push(value), undefined, store);
  emitter.fire(1);
  store.dispose();
  emitter.fire(2);

  assert.deepEqual(values, [1]);
});
