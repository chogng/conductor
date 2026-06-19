import assert from "assert";

import {
  addDisposableListener,
  clearNode,
  EventType,
  replaceChildrenIfChanged,
} from "../../browser/dom.ts";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";

suite("base/test/browser/dom", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("addDisposableListener removes the listener when disposed", () => {
    const target = new EventTarget();
    let calls = 0;
    const disposable = addDisposableListener(target, EventType.CLICK, () => {
      calls++;
    });

    target.dispatchEvent(new Event(EventType.CLICK));
    disposable.dispose();
    target.dispatchEvent(new Event(EventType.CLICK));

    assert.equal(calls, 1);
  });

  test("clearNode removes children until the node is empty", () => {
    const removed: string[] = [];
    const children: Array<{ remove: () => void }> = [];
    const first = {
      remove: () => {
        removed.push("first");
        children.shift();
      },
    };
    const second = {
      remove: () => {
        removed.push("second");
        children.shift();
      },
    };
    children.push(first, second);
    const node = {
      get firstChild() {
        return children[0] ?? null;
      },
    };

    clearNode(node as unknown as HTMLElement);

    assert.deepEqual(removed, ["first", "second"]);
  });

  test("replaceChildrenIfChanged preserves identical child nodes", () => {
    const parent = document.createElement("div");
    const child = document.createElement("span");
    parent.appendChild(child);
    const originalReplaceChildren = parent.replaceChildren.bind(parent);
    let replaceCalls = 0;
    parent.replaceChildren = (...children) => {
      replaceCalls++;
      originalReplaceChildren(...children);
    };

    replaceChildrenIfChanged(parent, child);

    assert.equal(replaceCalls, 0);
    assert.equal(parent.firstChild, child);

    const nextChild = document.createElement("strong");
    replaceChildrenIfChanged(parent, nextChild);

    assert.equal(replaceCalls, 1);
    assert.equal(parent.firstChild, nextChild);
  });
});
