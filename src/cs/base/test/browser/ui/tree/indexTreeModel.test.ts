/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { IndexTreeModel, type IndexTreeElement } from "../../../../browser/ui/tree/indexTreeModel.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../common/lifecycleTestUtils.js";

type TestNode = {
  readonly key: string;
  readonly label: string;
};

const element = (
  node: TestNode,
  children: readonly IndexTreeElement<TestNode>[] = [],
): IndexTreeElement<TestNode> => ({
  children,
  element: node,
  key: node.key,
});

const spliceSnapshot = (change: ReturnType<IndexTreeModel<TestNode>["update"]>) =>
  change.splices.map(splice => ({
    deleteCount: splice.deleteCount,
    keys: splice.elements.map(entry => entry.key),
    start: splice.start,
  }));

suite("base/test/browser/ui/tree/indexTreeModel", () => {
  ensureNoDisposablesAreLeakedInTestSuite();

  test("updates appended children with a local visible splice", () => {
    const alpha: TestNode = { key: "alpha", label: "Alpha" };
    const beta: TestNode = { key: "beta", label: "Beta" };
    const gamma: TestNode = { key: "gamma", label: "Gamma" };
    const model = new IndexTreeModel([
      element(alpha),
      element(beta),
    ]);

    const change = model.update([
      element(alpha),
      element(beta),
      element(gamma),
    ]);

    assert.deepEqual(spliceSnapshot(change), [{
      deleteCount: 0,
      keys: ["gamma"],
      start: 2,
    }]);
    assert.deepEqual(change.rerenderKeys, []);
  });

  test("splices root children by index location", () => {
    const alpha: TestNode = { key: "alpha", label: "Alpha" };
    const beta: TestNode = { key: "beta", label: "Beta" };
    const gamma: TestNode = { key: "gamma", label: "Gamma" };
    const model = new IndexTreeModel([
      element(alpha),
      element(beta),
    ]);

    const change = model.splice([2], 0, [
      element(gamma),
    ]);

    assert.deepEqual(spliceSnapshot(change), [{
      deleteCount: 0,
      keys: ["gamma"],
      start: 2,
    }]);
    assert.deepEqual(model.flatten().map(entry => entry.key), [
      "alpha",
      "beta",
      "gamma",
    ]);
  });

  test("rerenders same-key replacements through splice", () => {
    const alpha: TestNode = { key: "alpha", label: "Alpha" };
    const nextAlpha: TestNode = { key: "alpha", label: "Alpha updated" };
    const beta: TestNode = { key: "beta", label: "Beta" };
    const model = new IndexTreeModel([
      element(alpha),
      element(beta),
    ]);

    const change = model.splice([0], 1, [
      element(nextAlpha),
    ]);

    assert.deepEqual(spliceSnapshot(change), []);
    assert.deepEqual(change.rerenderKeys, ["alpha"]);
    assert.equal(model.getNode("alpha")?.element, nextAlpha);
  });

  test("splices collapsed node children without rendering descendants", () => {
    const root: TestNode = { key: "root", label: "Root" };
    const child: TestNode = { key: "child", label: "Child" };
    const model = new IndexTreeModel([
      element(root),
    ], ["root"]);

    const change = model.splice([0, 0], 0, [
      element(child),
    ]);

    assert.deepEqual(spliceSnapshot(change), []);
    assert.deepEqual(change.rerenderKeys, ["root"]);
    assert.deepEqual(model.flatten().map(entry => entry.key), ["root"]);
  });

  test("rerenders same-key element replacements without a visible splice", () => {
    const alpha: TestNode = { key: "alpha", label: "Alpha" };
    const nextAlpha: TestNode = { key: "alpha", label: "Alpha updated" };
    const beta: TestNode = { key: "beta", label: "Beta" };
    const model = new IndexTreeModel([
      element(alpha),
      element(beta),
    ]);

    const change = model.update([
      element(nextAlpha),
      element(beta),
    ]);

    assert.deepEqual(spliceSnapshot(change), []);
    assert.deepEqual(change.rerenderKeys, ["alpha"]);
  });

  test("collapses and expands visible descendants with local splices", () => {
    const root: TestNode = { key: "root", label: "Root" };
    const child: TestNode = { key: "child", label: "Child" };
    const sibling: TestNode = { key: "sibling", label: "Sibling" };
    const model = new IndexTreeModel([
      element(root, [
        element(child),
        element(sibling),
      ]),
    ]);

    const collapse = model.setCollapsed("root", true);
    const expand = model.setCollapsed("root", false);

    assert.deepEqual(spliceSnapshot(collapse), [{
      deleteCount: 2,
      keys: [],
      start: 1,
    }]);
    assert.deepEqual(collapse.rerenderKeys, ["root"]);
    assert.deepEqual(spliceSnapshot(expand), [{
      deleteCount: 0,
      keys: ["child", "sibling"],
      start: 1,
    }]);
    assert.deepEqual(expand.rerenderKeys, ["root"]);
  });
});
