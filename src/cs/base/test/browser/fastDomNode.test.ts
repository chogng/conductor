import assert from "assert";

import { createFastDomNode } from "../../browser/fastDomNode.ts";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";

suite("base/test/browser/fastDomNode", () => {
  ensureNoDisposablesAreLeakedInTestSuite();

  test("normalizes numeric style values to pixels", () => {
    const domNode = document.createElement("div");
    const node = createFastDomNode(domNode);

    node.setWidth(12);
    node.setHeight("50%");
    node.setTop(3);
    node.setLeft("auto");

    assert.equal(domNode.style.width, "12px");
    assert.equal(domNode.style.height, "50%");
    assert.equal(domNode.style.top, "3px");
    assert.equal(domNode.style.left, "auto");
  });

  test("keeps class, attribute, and child helpers in sync with the DOM node", () => {
    const domNode = document.createElement("div");
    const childDomNode = document.createElement("div");
    const node = createFastDomNode(domNode);
    const child = createFastDomNode(childDomNode);

    node.setClassName("root");
    node.toggleClassName("active", true);
    node.setAttribute("data-state", "ready");
    node.appendChild(child);

    assert.equal(domNode.className, "root active");
    assert.equal(domNode.getAttribute("data-state"), "ready");
    assert.equal(domNode.firstChild, childDomNode);

    node.removeAttribute("data-state");
    node.removeChild(child);

    assert.equal(domNode.hasAttribute("data-state"), false);
    assert.equal(domNode.firstChild, null);
  });
});
