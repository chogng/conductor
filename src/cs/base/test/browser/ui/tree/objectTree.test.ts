import assert from "assert";

import { ObjectTree } from "../../../../browser/ui/tree/objectTree.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../common/lifecycleTestUtils.js";

type TestNode = {
  readonly children?: readonly TestNode[];
  readonly key: string;
  readonly label: string;
};

suite("base/test/browser/ui/tree/objectTree", () => {
  ensureNoDisposablesAreLeakedInTestSuite();

  test("does not rerender unchanged items when replacing children", () => {
    const host = document.createElement("div");
    document.body.append(host);

    const alpha: TestNode = { key: "alpha", label: "Alpha" };
    const beta: TestNode = { key: "beta", label: "Beta" };
    const renders: string[] = [];
    const tree = new ObjectTree<TestNode>(host, {
      delegate: {
        getHeight: () => 24,
      },
      getChildren: element => [...element.children ?? []],
      getKey: element => element.key,
      items: [alpha, beta],
      renderer: {
        renderElement: (node, _index, container) => {
          renders.push(`${node.element.key}:${node.element.label}`);
          container.textContent = node.element.label;
        },
      },
    });

    try {
      assert.deepEqual(renders, ["alpha:Alpha", "beta:Beta"]);

      renders.length = 0;
      tree.setChildren([alpha, beta]);
      assert.deepEqual(renders, []);

      const nextAlpha: TestNode = { key: "alpha", label: "Alpha updated" };
      tree.setChildren([nextAlpha, beta]);
      assert.deepEqual(renders, ["alpha:Alpha updated"]);
    } finally {
      tree.dispose();
      host.remove();
    }
  });
});
