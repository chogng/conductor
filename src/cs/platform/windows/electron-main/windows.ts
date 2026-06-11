import type { BrowserWindowConstructorOptions } from "electron";

import type { ThemeSnapshot } from "../../theme/electron-main/themeMainService.js";

const MAIN_WINDOW_BOUNDS = {
  width: 1440,
  height: 920,
  minWidth: 1080,
  minHeight: 700,
};

export interface IDefaultBrowserWindowOptions {
  readonly icon?: string;
  readonly isDev: boolean;
  readonly preload: string;
  readonly themeSnapshot: ThemeSnapshot;
}

export function defaultBrowserWindowOptions({
  icon,
  isDev,
  preload,
  themeSnapshot,
}: IDefaultBrowserWindowOptions): BrowserWindowConstructorOptions {
  const hideNativeWindowsTitlebar = process.platform === "win32";

  return {
    width: MAIN_WINDOW_BOUNDS.width,
    height: MAIN_WINDOW_BOUNDS.height,
    minWidth: MAIN_WINDOW_BOUNDS.minWidth,
    minHeight: MAIN_WINDOW_BOUNDS.minHeight,
    icon,
    backgroundColor: themeSnapshot.backgroundColor,
    autoHideMenuBar: true,
    center: true,
    frame: !hideNativeWindowsTitlebar,
    show: false,
    titleBarOverlay: hideNativeWindowsTitlebar
      ? {
          color: themeSnapshot.backgroundColor,
          symbolColor: themeSnapshot.foregroundColor,
          height: 38,
        }
      : undefined,
    titleBarStyle: hideNativeWindowsTitlebar ? "hidden" : undefined,
    webPreferences: {
      preload,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      ...(isDev
        ? null
        : { v8CacheOptions: "bypassHeatCheckAndEagerCompile" }),
    },
  };
}
