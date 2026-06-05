import assert from "assert";

import {
  AnchorAlignment,
  AnchorAxisAlignment,
  AnchorPosition,
  anchoredLayout,
  clamp,
  layout,
  layout2d,
  LayoutAnchorMode,
  LayoutAnchorPosition,
  rectFromBounds,
  rectFromDomRect,
} from "../../common/layout.ts";

suite("base/test/common/layout", () => {
  test("clamp and rect helpers normalize geometry", () => {
    assert.equal(clamp(5, 0, 3), 3);
    assert.deepEqual(rectFromBounds(10, 20, 15, 35), { left: 10, top: 20, width: 5, height: 15 });
    assert.deepEqual(rectFromBounds(10, 20, 5, 15), { left: 10, top: 20, width: 0, height: 0 });
    assert.deepEqual(rectFromDomRect({ left: 1, top: 2, width: 3, height: 4 }), {
      left: 1,
      top: 2,
      width: 3,
      height: 4,
    });
  });

  test("layout positions before or flips when space requires it", () => {
    assert.deepEqual(
      layout(100, 20, { offset: 10, size: 10, position: LayoutAnchorPosition.Before }),
      { position: 20, result: "ok" },
    );
    assert.deepEqual(
      layout(100, 40, { offset: 70, size: 10, position: LayoutAnchorPosition.Before }),
      { position: 30, result: "flipped" },
    );
    assert.deepEqual(
      layout(30, 50, { offset: 10, size: 10, position: LayoutAnchorPosition.Before }),
      { position: 0, result: "overlap" },
    );
  });

  test("layout2d flips vertical placement and preserves alignment metadata", () => {
    const result = layout2d(
      { left: 0, top: 0, width: 100, height: 100 },
      { width: 30, height: 30 },
      { left: 10, top: 80, width: 10, height: 10 },
      { anchorAlignment: AnchorAlignment.LEFT, anchorPosition: AnchorPosition.BELOW },
    );

    assert.equal(result.top, 50);
    assert.equal(result.left, 10);
    assert.equal(result.anchorPosition, AnchorPosition.ABOVE);
    assert.equal(result.anchorAlignment, AnchorAlignment.LEFT);
  });

  test("layout2d supports horizontal anchors", () => {
    const result = layout2d(
      { left: 0, top: 0, width: 100, height: 100 },
      { width: 30, height: 20 },
      { left: 80, top: 10, width: 10, height: 10 },
      {
        anchorAxisAlignment: AnchorAxisAlignment.HORIZONTAL,
        anchorPosition: AnchorPosition.RIGHT,
        anchorAlignment: AnchorAlignment.CENTER,
      },
    );

    assert.equal(result.left, 50);
    assert.equal(result.anchorPosition, AnchorPosition.LEFT);
  });

  test("anchoredLayout opens on preferred side or flips when needed", () => {
    assert.deepEqual(
      anchoredLayout({
        viewport: { left: 0, top: 0, width: 100, height: 100 },
        anchor: { left: 10, top: 10, width: 20, height: 10 },
        view: { width: 40, height: 30 },
        gap: 5,
        padding: 4,
      }),
      { top: 25, left: 10, width: 40, maxWidth: 92, side: "bottom" },
    );

    assert.deepEqual(
      anchoredLayout({
        viewport: { left: 0, top: 0, width: 100, height: 100 },
        anchor: { left: 80, top: 10, width: 10, height: 10 },
        view: { width: 30, height: 20 },
        side: "right",
        gap: 5,
        padding: 4,
      }),
      { top: 10, left: 45, width: 30, maxWidth: 92, side: "left" },
    );
  });

  test("layout ALIGN mode uses anchor offset as the after boundary", () => {
    assert.deepEqual(
      layout(100, 20, {
        offset: 70,
        size: 10,
        position: LayoutAnchorPosition.Before,
        mode: LayoutAnchorMode.ALIGN,
      }),
      { position: 70, result: "ok" },
    );
  });
});
