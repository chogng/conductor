import assert from "assert";
import {
  SplitView,
  normalizeSplitViewSizes,
  type SplitViewPane,
  type SplitViewPaneLayout,
} from "src/cs/base/browser/ui/splitview/splitview";

suite("base/browser/ui/splitview", () => {
  test("normalizes container resize proportionally", () => {
    const panes: readonly SplitViewPaneLayout[] = [
      { minSize: 170, size: 300 },
      { minSize: 220 },
      { minSize: 170, size: 300 },
    ];

    assert.deepEqual(
      normalizeSplitViewSizes(panes, [300, 400, 300], 800, 1000),
      [240, 320, 240],
    );
  });

  test("respects pane minimums while applying proportional container resize", () => {
    const panes: readonly SplitViewPaneLayout[] = [
      { minSize: 170, size: 300 },
      { minSize: 220 },
      { minSize: 170, size: 300 },
    ];

    assert.deepEqual(
      normalizeSplitViewSizes(panes, [300, 400, 300], 500, 1000),
      [170, 220, 170],
    );
  });

  test("keeps current pane sizes across same-size updates", () => {
    const panes: readonly SplitViewPaneLayout[] = [
      { minSize: 170, size: 300 },
      { minSize: 220 },
      { minSize: 170, size: 300 },
    ];

    assert.deepEqual(
      normalizeSplitViewSizes(panes, [240, 320, 240], 800, 800),
      [240, 320, 240],
    );
  });

  test("preserves preferred pane sizes before the split view is mounted", () => {
    const panes: readonly SplitViewPane[] = [
      { id: "sidebar", minSize: 170, size: 300 },
      { id: "main", minSize: 220 },
      { id: "auxiliarybar", minSize: 170, size: 300 },
    ];
    const splitView = new SplitView({
      orientation: "horizontal",
      panes,
    });

    assert.equal(
      splitView.element.querySelector<HTMLElement>(".ui-split-view__grid")?.style.gridTemplateColumns,
      "300px 220px 300px",
    );

    Object.defineProperty(splitView.element, "clientWidth", {
      configurable: true,
      value: 1200,
    });
    splitView.update({
      orientation: "horizontal",
      panes,
    });

    assert.equal(
      splitView.element.querySelector<HTMLElement>(".ui-split-view__grid")?.style.gridTemplateColumns,
      "300px 600px 300px",
    );

    splitView.dispose();
  });

  test("keeps pane sizes with their ids when panes are hidden and restored", () => {
    const panes: readonly SplitViewPane[] = [
      { id: "sidebar", minSize: 170, size: 300 },
      { id: "main", minSize: 220 },
      { id: "auxiliarybar", minSize: 170, size: 300 },
    ];
    const splitView = new SplitView({
      orientation: "horizontal",
      panes,
    });
    Object.defineProperty(splitView.element, "clientWidth", {
      configurable: true,
      value: 1200,
    });
    splitView.update({
      orientation: "horizontal",
      panes,
    });

    splitView.update({
      orientation: "horizontal",
      panes: panes.slice(1),
    });

    splitView.update({
      orientation: "horizontal",
      panes,
    });

    assert.equal(
      splitView.element.querySelector<HTMLElement>(".ui-split-view__grid")?.style.gridTemplateColumns,
      "300px 600px 300px",
    );

    splitView.dispose();
  });
});
