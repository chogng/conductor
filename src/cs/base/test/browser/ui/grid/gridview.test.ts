import assert from "assert";
import { GridView } from "src/cs/base/browser/ui/grid/gridview";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";

suite("base/browser/ui/grid/gridview", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("updates item order and removes stale items", () => {
    const first = document.createElement("div");
    const second = document.createElement("div");
    const third = document.createElement("div");
    const grid = new GridView({
      items: [
        { element: first, location: [0] },
        { element: second, location: [1] },
      ],
      sizes: [200, 300],
    });

    grid.update({
      items: [
        { element: second, location: [0] },
        { element: third, location: [1] },
      ],
      sizes: [250, 250],
    });

    assert.deepEqual([...grid.element.children], [second, third]);
    assert.equal(first.parentElement, null);
    assert.equal(second.dataset.location, "0");
    assert.equal(third.dataset.location, "1");
  });

  test("keeps stable item nodes in place when order is unchanged", async () => {
    const first = document.createElement("div");
    const second = document.createElement("div");
    const grid = new GridView({
      items: [
        { element: first, location: [0] },
        { element: second, location: [1] },
      ],
      sizes: [200, 300],
    });

    const records: MutationRecord[] = [];
    const observer = new MutationObserver((mutations) => {
      records.push(...mutations);
    });
    observer.observe(grid.element, { childList: true });

    grid.update({
      items: [
        { element: first, location: [0] },
        { element: second, location: [1] },
      ],
      sizes: [250, 250],
    });
    await Promise.resolve();
    observer.disconnect();

    assert.deepEqual(records, []);
    assert.deepEqual([...grid.element.children], [first, second]);
  });

  test("lays out horizontal and vertical templates", () => {
    const first = document.createElement("div");
    const second = document.createElement("div");
    const grid = new GridView({
      items: [
        { element: first, location: [0] },
        { element: second, location: [1] },
      ],
      orientation: "horizontal",
      sizes: [120, 180],
    });

    assert.equal(grid.element.style.gridTemplateColumns, "120px 180px");

    grid.layout({
      orientation: "vertical",
      sizes: [40, 60],
    });

    assert.equal(grid.element.style.gridTemplateRows, "40px 60px");
  });
});
