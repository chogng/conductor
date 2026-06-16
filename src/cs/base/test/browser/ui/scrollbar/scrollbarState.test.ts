import assert from "assert";

import {
  MIN_SCROLLBAR_THUMB_SIZE,
  ScrollbarState,
} from "../../../../browser/ui/scrollbar/scrollbarState.ts";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";

suite("base/test/browser/ui/scrollbar/scrollbarState", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("ScrollbarState hides metrics when content fits", () => {
    const state = new ScrollbarState();
    const changed = state.measure({
      clientHeight: 100,
      clientWidth: 100,
      scrollHeight: 100,
      scrollWidth: 100,
    }, "both");

    assert.equal(changed, false);
    assert.deepEqual(state.metrics, {
      showX: false,
      showY: false,
      xThumbSize: 0,
      yThumbSize: 0,
    });
  });

  test("ScrollbarState measures visible axes and minimum thumb sizes", () => {
    const state = new ScrollbarState();
    const changed = state.measure({
      clientHeight: 100,
      clientWidth: 200,
      scrollHeight: 1000,
      scrollWidth: 1000,
    }, "both");

    assert.equal(changed, true);
    assert.equal(state.metrics.showX, true);
    assert.equal(state.metrics.showY, true);
    assert.equal(state.metrics.xThumbSize, 40);
    assert.equal(state.metrics.yThumbSize, MIN_SCROLLBAR_THUMB_SIZE);
  });

  test("ScrollbarState respects axis filtering", () => {
    const state = new ScrollbarState();
    state.measure({
      clientHeight: 100,
      clientWidth: 100,
      scrollHeight: 1000,
      scrollWidth: 1000,
    }, "y");

    assert.equal(state.metrics.showX, false);
    assert.equal(state.metrics.showY, true);
  });

  test("ScrollbarState computes thumb offsets from scroll position", () => {
    const state = new ScrollbarState();
    const dimensions = {
      clientHeight: 100,
      clientWidth: 200,
      scrollHeight: 500,
      scrollWidth: 1000,
    };

    state.measure(dimensions, "both");

    assert.equal(state.getThumbOffset(dimensions, { scrollLeft: 400, scrollTop: 200 }, "x"), 80);
    assert.equal(state.getThumbOffset(dimensions, { scrollLeft: 400, scrollTop: 200 }, "y"), 38);
  });
});
