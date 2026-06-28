import assert from "assert";

import {
  addDisposableListener,
  clearNode,
  EventType,
  registerWindow,
  replaceChildrenIfChanged,
} from "../../browser/dom.ts";
import { asCssValueWithDefault } from "../../browser/cssValue.ts";
import { createStyleSheet } from "../../browser/domStylesheets.ts";
import { DisposableStore } from "src/cs/base/common/lifecycle";
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

  test("asCssValueWithDefault fills missing variable fallbacks", () => {
    assert.equal(asCssValueWithDefault("red", "blue"), "red");
    assert.equal(asCssValueWithDefault(undefined, "blue"), "blue");
    assert.equal(asCssValueWithDefault("var(--my-var)", "blue"), "var(--my-var, blue)");
    assert.equal(asCssValueWithDefault("var(--my-var, red)", "blue"), "var(--my-var, red)");
    assert.equal(
      asCssValueWithDefault("var(--my-var, var(--my-var2))", "blue"),
      "var(--my-var, var(--my-var2, blue))",
    );
  });

  test("registerWindow clones global stylesheets", () => {
    const iframe = document.createElement("iframe");
    const styleStore = new DisposableStore();
    let registration = { dispose() {} };

    document.body.append(iframe);

    try {
      const stylesheet = createStyleSheet(undefined, style => {
        style.textContent = ".global-style-test { color: red; }";
      }, styleStore);
      assert.equal(stylesheet.textContent, ".global-style-test { color: red; }");

      const targetWindow = iframe.contentWindow;
      assert.ok(targetWindow);
      registration = registerWindow(targetWindow);

      const clonedStylesheet = targetWindow.document.head.querySelector("style");
      assert.equal(clonedStylesheet?.textContent, ".global-style-test { color: red; }");
    } finally {
      registration.dispose();
      styleStore.dispose();
      iframe.remove();
    }
  });
});
