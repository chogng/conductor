import assert from "assert";

import { ObjectTreeModel } from "../../../../browser/ui/tree/objectTreeModel.ts";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";

type TestNode = {
  readonly children?: readonly TestNode[];
  readonly key: string;
};

suite("base/test/browser/ui/tree/objectTreeModel", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("flatten does not visit descendants of collapsed nodes", () => {
    const visited: string[] = [];
    const root = {
      key: "root",
      children: [
        {
          key: "child",
          children: [{ key: "grandchild" }],
        },
      ],
    };
    const model = new ObjectTreeModel<TestNode>({
      collapsedKeys: ["root"],
      getChildren: element => {
        visited.push(element.key);
        return [...element.children ?? []];
      },
      getKey: element => element.key,
      items: [root],
    });

    assert.deepEqual(model.flatten(), [
      {
        depth: 0,
        expandable: true,
        item: root,
        key: "root",
      },
    ]);
    assert.deepEqual(visited, ["root"]);
  });

  test("getVisibleDescendants respects nested collapsed state", () => {
    const child = {
      key: "child",
      children: [{ key: "grandchild" }],
    };
    const sibling = { key: "sibling" };
    const root = {
      key: "root",
      children: [child, sibling],
    };
    const model = new ObjectTreeModel<TestNode>({
      collapsedKeys: ["child"],
      getChildren: element => [...element.children ?? []],
      getKey: element => element.key,
      items: [root],
    });

    assert.deepEqual(model.getVisibleDescendants(root, 0), [
      {
        depth: 1,
        expandable: true,
        item: child,
        key: "child",
      },
      {
        depth: 1,
        expandable: false,
        item: sibling,
        key: "sibling",
      },
    ]);
  });
});
