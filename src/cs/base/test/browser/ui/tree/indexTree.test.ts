/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import { ListView } from "../../../../browser/ui/list/listView.js";
import { IndexTree, type IndexTreeElement } from "../../../../browser/ui/tree/indexTree.js";
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

suite("base/test/browser/ui/tree/indexTree", () => {
  ensureNoDisposablesAreLeakedInTestSuite();

  test("splices inserted elements without resetting list props", () => {
    const originalSetProps = ListView.prototype.setProps;
    const originalSplice = ListView.prototype.splice;
    let setPropsCount = 0;
    const splices: Array<{
      readonly deleteCount: number;
      readonly insertCount: number;
      readonly start: number;
    }> = [];

    ListView.prototype.setProps = function <T>(
      this: ListView<T>,
      options: Parameters<ListView<T>["setProps"]>[0],
    ): void {
      setPropsCount += 1;
      originalSetProps.call(this, options);
    } as typeof ListView.prototype.setProps;
    ListView.prototype.splice = function <T>(
      this: ListView<T>,
      start: number,
      deleteCount: number,
      elements: readonly T[] = [],
    ): T[] {
      splices.push({
        deleteCount,
        insertCount: elements.length,
        start,
      });
      return originalSplice.call(this, start, deleteCount, elements);
    } as typeof ListView.prototype.splice;

    const host = document.createElement("div");
    document.body.append(host);

    const alpha: TestNode = { key: "alpha", label: "Alpha" };
    const beta: TestNode = { key: "beta", label: "Beta" };
    const gamma: TestNode = { key: "gamma", label: "Gamma" };
    const renders: string[] = [];
    const tree = new IndexTree<TestNode>(host, {
      delegate: {
        getHeight: () => 24,
      },
      items: [
        element(alpha),
        element(beta),
      ],
      renderer: {
        renderElement: (node, _index, container) => {
          renders.push(`${node.element.key}:${node.element.label}`);
          container.textContent = node.element.label;
        },
      },
    });

    try {
      setPropsCount = 0;
      splices.length = 0;
      renders.length = 0;

      tree.splice([2], 0, [
        element(gamma),
      ]);

      assert.equal(setPropsCount, 0);
      assert.deepEqual(splices, [{
        deleteCount: 0,
        insertCount: 1,
        start: 2,
      }]);
      assert.deepEqual(renders, ["gamma:Gamma"]);
    } finally {
      tree.dispose();
      host.remove();
      ListView.prototype.setProps = originalSetProps;
      ListView.prototype.splice = originalSplice;
    }
  });
});
