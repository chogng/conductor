/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "node:assert/strict";
import type { BrowserWindow } from "electron";

import { DesktopWindowMain } from "src/cs/platform/window/electron-main/window";

type WindowCall = readonly [string, unknown?];

suite("platform/window/electron-main/window", () => {
  test("keeps Windows material stable when disabling transparent chrome", () => {
    if (process.platform !== "win32") {
      return;
    }

    const win = createTestWindow();
    const windowMain = createDesktopWindowMain();

    windowMain.applyWindowStyle(win as unknown as BrowserWindow, {
      appearance: {
        backgroundColor: "#f3f4f6",
        transparentChrome: true,
      },
    });
    win.calls.length = 0;

    windowMain.applyWindowStyle(win as unknown as BrowserWindow, {
      appearance: {
        backgroundColor: "#f3f4f6",
        transparentChrome: false,
      },
    });

    assert.deepEqual(win.calls, [
      ["setTitleBarOverlay", {
        color: "#f3f4f6",
        height: undefined,
        symbolColor: undefined,
      }],
    ]);
  });

  test("keeps Windows material stable when enabling transparent chrome", () => {
    if (process.platform !== "win32") {
      return;
    }

    const win = createTestWindow();
    const windowMain = createDesktopWindowMain();

    windowMain.applyWindowStyle(win as unknown as BrowserWindow, {
      appearance: {
        backgroundColor: "#f3f4f6",
        transparentChrome: false,
      },
    });
    win.calls.length = 0;

    windowMain.applyWindowStyle(win as unknown as BrowserWindow, {
      appearance: {
        backgroundColor: "#f3f4f6",
        transparentChrome: true,
      },
    });

    assert.deepEqual(win.calls, [
      ["setTitleBarOverlay", {
        color: "rgba(0, 0, 0, 0)",
        height: undefined,
        symbolColor: undefined,
      }],
    ]);
  });

  test("keeps appearance overlay color when applying a theme", () => {
    if (process.platform !== "win32") {
      return;
    }

    const win = createTestWindow();
    const windowMain = createDesktopWindowMain();

    windowMain.applyWindowStyle(win as unknown as BrowserWindow, {
      appearance: {
        backgroundColor: "#abcdef",
        transparentChrome: false,
      },
    });
    win.calls.length = 0;

    windowMain.applyWindowStyle(win as unknown as BrowserWindow, {
      theme: {
        backgroundColor: "#111111",
        foregroundColor: "#eeeeee",
      },
    });

    assert.deepEqual(win.calls, [
      ["setBackgroundColor", "rgba(0, 0, 0, 0)"],
      ["setTitleBarOverlay", {
        color: "#abcdef",
        height: undefined,
        symbolColor: "#eeeeee",
      }],
    ]);
  });

  test("skips duplicate appearance application", () => {
    const win = createTestWindow();
    const windowMain = createDesktopWindowMain();

    windowMain.applyWindowStyle(win as unknown as BrowserWindow, {
      appearance: {
        backgroundColor: "#f3f4f6",
        transparentChrome: false,
      },
    });
    win.calls.length = 0;

    windowMain.applyWindowStyle(win as unknown as BrowserWindow, {
      appearance: {
        backgroundColor: "#f3f4f6",
        transparentChrome: false,
      },
    });

    assert.deepEqual(win.calls, []);
  });
});

const createTestWindow = (): {
  readonly calls: WindowCall[];
  readonly isDestroyed: () => boolean;
  readonly setBackgroundColor: (value: string) => void;
  readonly setBackgroundMaterial: (value: string) => void;
  readonly setTitleBarOverlay: (value: unknown) => void;
  readonly setVibrancy: (value: unknown) => void;
} => {
  const calls: WindowCall[] = [];

  return {
    calls,
    isDestroyed: () => false,
    setBackgroundColor: value => calls.push(["setBackgroundColor", value]),
    setBackgroundMaterial: value => calls.push(["setBackgroundMaterial", value]),
    setTitleBarOverlay: value => calls.push(["setTitleBarOverlay", value]),
    setVibrancy: value => calls.push(["setVibrancy", value]),
  };
};

const createDesktopWindowMain = (): DesktopWindowMain =>
  new DesktopWindowMain("#f3f4f6");
