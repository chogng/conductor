import assert from "assert";

import { StandardMouseEvent, StandardWheelEvent } from "../../browser/mouseEvent.ts";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";

suite("base/test/browser/mouseEvent", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  class FakeElement {}

  class FakeWheelEvent extends Event {
    public static readonly DOM_DELTA_PIXEL = 0;
    public static readonly DOM_DELTA_LINE = 1;
    public static readonly DOM_DELTA_PAGE = 2;

    constructor(
      type: string,
      public readonly deltaX: number,
      public readonly deltaY: number,
      public readonly deltaMode: number,
    ) {
      super(type, { cancelable: true });
    }
  }

  function withMouseGlobals<T>(callback: () => T): T {
    const originalHTMLElement = globalThis.HTMLElement;
    const originalWheelEvent = globalThis.WheelEvent;
    globalThis.HTMLElement = FakeElement as unknown as typeof HTMLElement;
    globalThis.WheelEvent = FakeWheelEvent as unknown as typeof WheelEvent;
    try {
      return callback();
    } finally {
      globalThis.HTMLElement = originalHTMLElement;
      globalThis.WheelEvent = originalWheelEvent;
    }
  }

  test("StandardMouseEvent normalizes mouse button, detail and coordinates", () => {
    withMouseGlobals(() => {
      const target = new FakeElement();
      const event = {
        altKey: true,
        button: 0,
        buttons: 1,
        clientX: 7,
        clientY: 8,
        ctrlKey: true,
        defaultPrevented: false,
        detail: 0,
        metaKey: false,
        pageX: 10,
        pageY: 20,
        shiftKey: false,
        target,
        type: "click",
        view: globalThis.window ?? null,
        preventDefault() {},
        stopPropagation() {},
      } as unknown as MouseEvent;

      const standardEvent = new StandardMouseEvent(globalThis.window, event);

      assert.equal(standardEvent.leftButton, true);
      assert.equal(standardEvent.middleButton, false);
      assert.equal(standardEvent.rightButton, false);
      assert.equal(standardEvent.buttons, 1);
      assert.equal(standardEvent.target, target);
      assert.equal(standardEvent.detail, 1);
      assert.equal(standardEvent.posx, 10);
      assert.equal(standardEvent.posy, 20);
      assert.equal(standardEvent.clientX, 7);
      assert.equal(standardEvent.clientY, 8);
      assert.equal(standardEvent.ctrlKey, true);
      assert.equal(standardEvent.altKey, true);
    });
  });

  test("StandardMouseEvent reports double click detail", () => {
    withMouseGlobals(() => {
      const event = {
        altKey: false,
        button: 2,
        buttons: 2,
        clientX: 0,
        clientY: 0,
        ctrlKey: false,
        defaultPrevented: false,
        detail: 1,
        metaKey: false,
        pageX: 0,
        pageY: 0,
        shiftKey: false,
        target: null,
        type: "dblclick",
        view: globalThis.window ?? null,
        preventDefault() {},
        stopPropagation() {},
      } as unknown as MouseEvent;

      const standardEvent = new StandardMouseEvent(globalThis.window, event);

      assert.equal(standardEvent.detail, 2);
      assert.equal(standardEvent.rightButton, true);
    });
  });

  test("StandardWheelEvent converts line and page deltas to pixels", () => {
    withMouseGlobals(() => {
      const lineEvent = new FakeWheelEvent("wheel", 2, -3, FakeWheelEvent.DOM_DELTA_LINE);
      const pageEvent = new FakeWheelEvent("wheel", 1, 2, FakeWheelEvent.DOM_DELTA_PAGE);

      assert.equal(new StandardWheelEvent(lineEvent as unknown as WheelEvent).deltaX, 80);
      assert.equal(new StandardWheelEvent(lineEvent as unknown as WheelEvent).deltaY, -120);
      assert.equal(new StandardWheelEvent(pageEvent as unknown as WheelEvent).deltaX, 800);
      assert.equal(new StandardWheelEvent(pageEvent as unknown as WheelEvent).deltaY, 1600);
    });
  });
});
