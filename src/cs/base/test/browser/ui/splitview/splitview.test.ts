import assert from "assert";
import {
  normalizeSplitViewSizes,
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
});
