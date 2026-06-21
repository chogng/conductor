import assert from "assert";

import {
  MIN_SCROLLBAR_THUMB_SIZE,
  ScrollbarState,
} from "../../../../browser/ui/scrollbar/scrollbarState.ts";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";

suite("base/test/browser/ui/scrollbar/scrollbarState", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("ScrollbarState reports no scrollbar when content fits", () => {
    const state = new ScrollbarState();
    state.update({
      enabled: true,
      scrollPosition: 0,
      scrollSize: 100,
      visibleSize: 100,
    });

    assert.deepStrictEqual({
      desiredFromDelta: state.getDesiredScrollPositionFromDelta(20),
      desiredFromOffset: state.getDesiredScrollPositionFromOffset(50),
      needed: state.isNeeded(),
      thumbOffset: state.getThumbOffset(),
      thumbSize: state.getThumbSize(),
    }, {
      desiredFromDelta: 0,
      desiredFromOffset: 0,
      needed: false,
      thumbOffset: 0,
      thumbSize: 0,
    });
  });

  test("ScrollbarState computes thumb size and offset", () => {
    const state = new ScrollbarState();
    state.update({
      enabled: true,
      scrollPosition: 400,
      scrollSize: 1000,
      visibleSize: 200,
    });

    assert.deepStrictEqual({
      needed: state.isNeeded(),
      thumbOffset: state.getThumbOffset(),
      thumbSize: state.getThumbSize(),
    }, {
      needed: true,
      thumbOffset: 80,
      thumbSize: 40,
    });
  });

  test("ScrollbarState enforces minimum thumb size", () => {
    const state = new ScrollbarState();
    state.update({
      enabled: true,
      scrollPosition: 200,
      scrollSize: 500,
      visibleSize: 100,
    });

    assert.deepStrictEqual({
      thumbOffset: state.getThumbOffset(),
      thumbSize: state.getThumbSize(),
    }, {
      thumbOffset: 38,
      thumbSize: MIN_SCROLLBAR_THUMB_SIZE,
    });
  });

  test("ScrollbarState computes desired scroll positions", () => {
    const state = new ScrollbarState();
    state.update({
      enabled: true,
      scrollPosition: 100,
      scrollSize: 500,
      visibleSize: 100,
    });

    assert.deepStrictEqual({
      fromDelta: state.getDesiredScrollPositionFromDelta(38),
      fromOffset: state.getDesiredScrollPositionFromOffset(50),
    }, {
      fromDelta: 300,
      fromOffset: 200,
    });
  });
});
