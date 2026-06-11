import type { BrowserWindow, BrowserWindowConstructorOptions } from "electron";

import {
  getThemeSnapshot,
  type ThemeSnapshot,
} from "../../theme/electron-main/themeMainService.js";

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

export type WindowControlsOverlayOptions = {
  readonly height?: number;
  readonly backgroundColor?: string;
  readonly foregroundColor?: string;
};

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

export const getCurrentBootThemeSnapshot = (
  themeMode: unknown,
): ThemeSnapshot => {
  return getThemeSnapshot(themeMode);
};

export const applyWindowThemeSnapshot = (
  win: BrowserWindow | null | undefined,
  snapshot: ThemeSnapshot | null | undefined,
) => {
  if (!win || win.isDestroyed() || !snapshot) return;
  if (typeof snapshot.backgroundColor === "string") {
    win.setBackgroundColor(snapshot.backgroundColor);
  }
  updateWindowControlsOverlay(win, {
    backgroundColor: snapshot.backgroundColor,
    foregroundColor: snapshot.foregroundColor,
  });
};

export const updateWindowControlsOverlay = (
  win: BrowserWindow | null | undefined,
  options: WindowControlsOverlayOptions,
): void => {
  if (process.platform !== "win32" || !win || win.isDestroyed()) {
    return;
  }

  win.setTitleBarOverlay({
    color: normalizeColorOption(options.backgroundColor),
    symbolColor: normalizeColorOption(options.foregroundColor),
    height: normalizeHeightOption(options.height),
  });
};

const normalizeColorOption = (value: string | undefined): string | undefined => {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
};

const normalizeHeightOption = (value: number | undefined): number | undefined => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }

  return Math.max(0, Math.round(value));
};
