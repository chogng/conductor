import assert from "assert";

import { Scrollable, ScrollState, SmoothScrollingOperation } from "../../common/scrollable.ts";
import { toDisposable } from "../../common/lifecycle.ts";

suite("base/test/common/scrollable", () => {
  const VIEWPORT_HEIGHT = 800;
  const ANIMATION_DURATION = 125;
  const LINE_HEIGHT = 20;

  function tickAt(operation: SmoothScrollingOperation, now: number) {
    const originalNow = Date.now;
    Date.now = () => now;
    try {
      return operation.tick();
    } finally {
      Date.now = originalNow;
    }
  }

  function visibleLinesAt(operation: SmoothScrollingOperation, now: number): [number, number] {
    const scrollTop = tickAt(operation, now).scrollTop;
    const scrollBottom = scrollTop + VIEWPORT_HEIGHT;

    return [
      Math.floor(scrollTop / LINE_HEIGHT),
      Math.ceil(scrollBottom / LINE_HEIGHT),
    ];
  }

  function simulateSmoothScroll(from: number, to: number): [number, number][] {
    const operation = new SmoothScrollingOperation(
      { scrollLeft: 0, scrollTop: from, width: 0, height: VIEWPORT_HEIGHT },
      { scrollLeft: 0, scrollTop: to, width: 0, height: VIEWPORT_HEIGHT },
      -10,
      ANIMATION_DURATION + 10,
    );

    return [0, 25, 50, 75, 100, 125].map(now => visibleLinesAt(operation, now));
  }

  test("ScrollState clamps invalid dimensions and positions", () => {
    const state = new ScrollState(true, -1.7, 100.9, 90.8, 10.2, 50.5, 100.9);

    assert.equal(state.width, 0);
    assert.equal(state.scrollWidth, 100);
    assert.equal(state.scrollLeft, 90);
    assert.equal(state.height, 10);
    assert.equal(state.scrollHeight, 50);
    assert.equal(state.scrollTop, 40);
    assert.equal(state.rawScrollLeft, 90);
    assert.equal(state.rawScrollTop, 100);
  });

  test("ScrollState creates change events with old and new values", () => {
    const previous = new ScrollState(false, 10, 100, 0, 20, 200, 0);
    const next = previous.withScrollPosition({ scrollLeft: 5, scrollTop: 10 });
    const event = next.createScrollEvent(previous, false);

    assert.equal(event.oldScrollLeft, 0);
    assert.equal(event.scrollLeft, 5);
    assert.equal(event.scrollLeftChanged, true);
    assert.equal(event.oldScrollTop, 0);
    assert.equal(event.scrollTop, 10);
    assert.equal(event.scrollTopChanged, true);
    assert.equal(event.widthChanged, false);
  });

  test("Scrollable emits events for dimension and position changes", () => {
    const events: Array<{ left: number; top: number; widthChanged: boolean }> = [];
    const scrollable = new Scrollable({
      forceIntegerValues: true,
      smoothScrollDuration: 0,
      scheduleAtNextAnimationFrame: () => toDisposable(() => {}),
    });

    scrollable.onScroll(event => events.push({
      left: event.scrollLeft,
      top: event.scrollTop,
      widthChanged: event.widthChanged,
    }));

    scrollable.setScrollDimensions({ width: 10, scrollWidth: 100, height: 10, scrollHeight: 100 }, false);
    scrollable.setScrollPositionNow({ scrollLeft: 90, scrollTop: 120 });
    scrollable.setScrollPositionNow({ scrollLeft: 90, scrollTop: 120 });

    assert.deepEqual(events, [
      { left: 0, top: 0, widthChanged: true },
      { left: 90, top: 90, widthChanged: false },
    ]);
    const validated = scrollable.validateScrollPosition({ scrollLeft: 200, scrollTop: -5 });
    assert.equal(validated.scrollLeft, 90);
    assert.equal(validated.scrollTop, 0);
  });

  test("Scrollable uses immediate scrolling when smooth duration is zero", () => {
    let scheduled = false;
    const scrollable = new Scrollable({
      forceIntegerValues: true,
      smoothScrollDuration: 0,
      scheduleAtNextAnimationFrame: () => {
        scheduled = true;
        return toDisposable(() => {});
      },
    });

    scrollable.setScrollDimensions({ width: 10, scrollWidth: 100, height: 10, scrollHeight: 100 }, false);
    scrollable.setScrollPositionSmooth({ scrollLeft: 40, scrollTop: 50 });

    assert.equal(scheduled, false);
    assert.equal(scrollable.hasPendingScrollAnimation(), false);
    const position = scrollable.getCurrentScrollPosition();
    assert.equal(position.scrollLeft, 40);
    assert.equal(position.scrollTop, 50);

    const dimensions = scrollable.getScrollDimensions();
    assert.equal(dimensions.width, 10);
    assert.equal(dimensions.scrollWidth, 100);
    assert.equal(dimensions.height, 10);
    assert.equal(dimensions.scrollHeight, 100);
  });

  test("SmoothScrollingOperation eases ordinary scroll distances", () => {
    assert.deepEqual(simulateSmoothScroll(0, 500), [
      [5, 46],
      [14, 55],
      [20, 61],
      [23, 64],
      [24, 65],
      [25, 65],
    ]);
  });

  test("SmoothScrollingOperation composes large scroll distances", () => {
    assert.deepEqual(simulateSmoothScroll(0, 10000), [
      [16, 57],
      [29, 70],
      [482, 523],
      [494, 535],
      [499, 540],
      [500, 540],
    ]);
  });
});
