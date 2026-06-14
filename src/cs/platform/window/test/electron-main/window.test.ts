/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "node:assert/strict";
import type { BrowserWindow } from "electron";

import { DesktopWindowMain } from "src/cs/platform/window/electron-main/window";

type WindowCall = readonly [string, unknown?];

suite("platform/window/electron-main/window", () => {
  test("hides macOS native titlebar while preserving native window frame", () => {
    withPlatform("darwin", () => {
      const windowMain = createDesktopWindowMain();

      const options = windowMain.createBrowserWindowOptions({
        isDev: true,
        preload: "/preload.js",
        theme: {
          backgroundColor: "#f3f4f6",
          foregroundColor: "#222222",
        },
      });

      assert.deepEqual({
        frame: options.frame,
        titleBarOverlay: options.titleBarOverlay,
        titleBarStyle: options.titleBarStyle,
      }, {
        frame: true,
        titleBarOverlay: true,
        titleBarStyle: "hidden",
      });
    });
  });

  test("updates macOS window button position from titlebar height", () => {
    withPlatform("darwin", () => {
      const win = createTestWindow();
      const windowMain = createDesktopWindowMain();

      windowMain.updateWindowControls(win as unknown as BrowserWindow, {
        height: 38,
      });

      assert.equal(win.calls.length, 1);
      assert.equal(win.calls[0]?.[0], "setWindowButtonPosition");
      assert.ok(
        isWindowButtonPosition(win.calls[0]?.[1]),
        "expected macOS window button position",
      );
      assert.ok(
        (
          win.calls[0][1].x === 12 &&
          win.calls[0][1].y === 11
        ) || (
          win.calls[0][1].x === 13 &&
          win.calls[0][1].y === 12
        ),
      );
    });
  });

  test("hides Windows native titlebar and frame for window controls overlay", () => {
    withPlatform("win32", () => {
      const windowMain = createDesktopWindowMain();

      const options = windowMain.createBrowserWindowOptions({
        isDev: true,
        preload: "/preload.js",
        theme: {
          backgroundColor: "#f3f4f6",
          foregroundColor: "#222222",
        },
      });

      assert.deepEqual({
        frame: options.frame,
        titleBarOverlay: options.titleBarOverlay,
        titleBarStyle: options.titleBarStyle,
      }, {
        frame: false,
        titleBarOverlay: {
          color: "#f3f4f6",
          height: 38,
          symbolColor: "#222222",
        },
        titleBarStyle: "hidden",
      });
    });
  });

  test("keeps Linux native titlebar defaults", () => {
    withPlatform("linux", () => {
      const windowMain = createDesktopWindowMain();

      const options = windowMain.createBrowserWindowOptions({
        isDev: true,
        preload: "/preload.js",
        theme: {
          backgroundColor: "#f3f4f6",
          foregroundColor: "#222222",
        },
      });

      assert.deepEqual({
        frame: options.frame,
        titleBarOverlay: options.titleBarOverlay,
        titleBarStyle: options.titleBarStyle,
      }, {
        frame: true,
        titleBarOverlay: undefined,
        titleBarStyle: undefined,
      });
    });
  });

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
  readonly setWindowButtonPosition: (value: unknown) => void;
} => {
  const calls: WindowCall[] = [];

  return {
    calls,
    isDestroyed: () => false,
    setBackgroundColor: value => calls.push(["setBackgroundColor", value]),
    setBackgroundMaterial: value => calls.push(["setBackgroundMaterial", value]),
    setTitleBarOverlay: value => calls.push(["setTitleBarOverlay", value]),
    setVibrancy: value => calls.push(["setVibrancy", value]),
    setWindowButtonPosition: value => calls.push(["setWindowButtonPosition", value]),
  };
};

const createDesktopWindowMain = (): DesktopWindowMain =>
  new DesktopWindowMain("#f3f4f6");

const isWindowButtonPosition = (
  value: unknown,
): value is { readonly x: number; readonly y: number } =>
  value !== null &&
  typeof value === "object" &&
  "x" in value &&
  "y" in value &&
  typeof value.x === "number" &&
  typeof value.y === "number";

const withPlatform = (platform: NodeJS.Platform, callback: () => void): void => {
  const descriptor = Object.getOwnPropertyDescriptor(process, "platform");

  Object.defineProperty(process, "platform", {
    configurable: true,
    value: platform,
  });

  try {
    callback();
  } finally {
    if (descriptor) {
      Object.defineProperty(process, "platform", descriptor);
    }
  }
};
