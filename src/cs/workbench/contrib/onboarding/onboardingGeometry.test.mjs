import test from "node:test";
import assert from "node:assert/strict";
import {
  areHighlightRectsEqual,
  clamp,
  computeCardPosition,
  getInteractionBlockerRects,
  getShadowOutsets,
} from "./onboardingGeometry.ts";

test("clamp keeps values within bounds", () => {
  assert.equal(clamp(-1, 0, 10), 0);
  assert.equal(clamp(4, 0, 10), 4);
  assert.equal(clamp(12, 0, 10), 10);
});

test("getShadowOutsets expands for positive and negative offsets", () => {
  assert.deepEqual(
    getShadowOutsets("4px 6px 10px 2px rgba(0, 0, 0, 0.2)"),
    {
      top: 6,
      right: 16,
      bottom: 18,
      left: 8,
    },
  );
  assert.deepEqual(getShadowOutsets("inset 0 0 8px black"), {
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  });
});

test("computeCardPosition falls back below target when top lacks space", () => {
  globalThis.window = {
    innerHeight: 500,
    innerWidth: 800,
  };

  assert.deepEqual(
    computeCardPosition(
      { top: 50, left: 200, width: 80, height: 40 },
      "top",
      { width: 300, height: 120 },
    ),
    {
      left: 90,
      top: 106,
      width: 300,
    },
  );

  delete globalThis.window;
});

test("getInteractionBlockerRects leaves passthrough target cells open", () => {
  const blockers = getInteractionBlockerRects(100, 100, [
    { top: 40, left: 40, width: 20, height: 20 },
  ]);

  assert.equal(blockers.length, 8);
  assert.equal(
    blockers.some(
      (rect) =>
        rect.left === 40 &&
        rect.top === 40 &&
        rect.width === 20 &&
        rect.height === 20,
    ),
    false,
  );
});

test("areHighlightRectsEqual tolerates tiny layout drift", () => {
  assert.equal(
    areHighlightRectsEqual(
      [{ top: 1, left: 2, width: 3, height: 4, radius: 5 }],
      [{ top: 1.1, left: 2.1, width: 3.1, height: 4.1, radius: 5.1 }],
    ),
    true,
  );
});
