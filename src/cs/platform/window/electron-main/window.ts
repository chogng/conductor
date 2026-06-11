import type { BrowserWindow, BrowserWindowConstructorOptions } from "electron";

import {
  getThemeSnapshot,
  type ThemeSnapshot,
} from "../../theme/electron-main/themeMainService.js";
import {
  NativeWindowCommand,
  type NativeWindowCommandId,
} from "../common/window.js";

const WindowMinimumSize = {
  WIDTH: 1080,
  HEIGHT: 700,
} as const;

const DEFAULT_MAIN_WINDOW_SIZE = {
  WIDTH: 1440,
  HEIGHT: 920,
} as const;

type WindowControlsOverlayOptions = {
  readonly height?: number;
  readonly backgroundColor?: string;
  readonly foregroundColor?: string;
};

type DesktopWindowAppearance = {
  readonly backgroundColor?: string;
  readonly transparentChrome?: boolean;
};

type DefaultBrowserWindowOptions = {
  readonly icon?: string;
  readonly isDev: boolean;
  readonly preload: string;
  readonly themeSnapshot: ThemeSnapshot;
};

export class DesktopWindowMain {
  constructor(
    private readonly defaultBackgroundColor: string,
  ) {}

  public getThemeSnapshot(themeMode: unknown): ThemeSnapshot {
    return getThemeSnapshot(themeMode);
  }

  public createBrowserWindowOptions({
    icon,
    isDev,
    preload,
    themeSnapshot,
  }: DefaultBrowserWindowOptions): BrowserWindowConstructorOptions {
    const hideNativeWindowsTitlebar = process.platform === "win32";

    return {
      width: DEFAULT_MAIN_WINDOW_SIZE.WIDTH,
      height: DEFAULT_MAIN_WINDOW_SIZE.HEIGHT,
      minWidth: WindowMinimumSize.WIDTH,
      minHeight: WindowMinimumSize.HEIGHT,
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

  public applyWindowStyle(
    win: BrowserWindow | null | undefined,
    options: {
      readonly appearance?: DesktopWindowAppearance | null;
      readonly themeSnapshot?: ThemeSnapshot | null;
    },
  ): void {
    if (!win || win.isDestroyed()) return;

    if (options.themeSnapshot) {
      applyThemeSnapshot(win, options.themeSnapshot);
    }

    if (options.appearance) {
      applyDesktopAppearance(win, options.appearance, this.defaultBackgroundColor);
    }
  }

  public updateWindowControls(
    win: BrowserWindow | null | undefined,
    options: WindowControlsOverlayOptions,
  ): void {
    updateWindowControlsOverlay(win, options);
  }

  public runCommand(
    win: BrowserWindow | null | undefined,
    command: NativeWindowCommandId,
    options: {
      readonly minimizeToTray?: (win: BrowserWindow) => void;
      readonly onDidMinimize?: (win: BrowserWindow) => void;
      readonly quit?: () => void;
      readonly shouldMinimizeToTrayOnClose?: () => boolean;
    } = {},
  ): void {
    if (!win || win.isDestroyed()) return;

    if (command === NativeWindowCommand.toggleDevTools) {
      if (win.webContents.isDevToolsOpened()) {
        win.webContents.closeDevTools();
        return;
      }
      win.webContents.openDevTools({ mode: "detach" });
      return;
    }

    if (command === NativeWindowCommand.reloadWindow) {
      win.webContents.reload();
      return;
    }

    if (command === NativeWindowCommand.minimizeWindow) {
      win.minimize();
      options.onDidMinimize?.(win);
      return;
    }

    if (command === NativeWindowCommand.maximizeWindow) {
      win.maximize();
      return;
    }

    if (command === NativeWindowCommand.unmaximizeWindow) {
      win.unmaximize();
      return;
    }

    if (command === NativeWindowCommand.closeWindow) {
      if (options.shouldMinimizeToTrayOnClose?.() === true) {
        options.minimizeToTray?.(win);
        return;
      }

      options.quit?.();
    }
  }
}

function applyThemeSnapshot(
  win: BrowserWindow,
  snapshot: ThemeSnapshot,
): void {
  if (typeof snapshot.backgroundColor === "string") {
    win.setBackgroundColor(snapshot.backgroundColor);
  }
  updateWindowControlsOverlay(win, {
    backgroundColor: snapshot.backgroundColor,
    foregroundColor: snapshot.foregroundColor,
  });
}

function updateWindowControlsOverlay(
  win: BrowserWindow | null | undefined,
  options: WindowControlsOverlayOptions,
): void {
  if (process.platform !== "win32" || !win || win.isDestroyed()) {
    return;
  }

  win.setTitleBarOverlay({
    color: normalizeColorOption(options.backgroundColor),
    symbolColor: normalizeColorOption(options.foregroundColor),
    height: normalizeHeightOption(options.height),
  });
}

function applyDesktopAppearance(
  win: BrowserWindow,
  appearance: DesktopWindowAppearance,
  defaultBackgroundColor: string,
): void {
  const backgroundColor = normalizeColorOption(appearance.backgroundColor)
    ?? defaultBackgroundColor;
  const transparentChrome = appearance.transparentChrome === true;
  const canSetMaterial =
    process.platform === "win32" &&
    typeof win.setBackgroundMaterial === "function";

  if (canSetMaterial) {
    try {
      win.setBackgroundMaterial(transparentChrome ? "mica" : "none");
    } catch {
      // Native material is best-effort; CSS transparency remains available.
    }
  }

  win.setBackgroundColor(transparentChrome ? "#00000000" : backgroundColor);
}

function normalizeColorOption(value: string | undefined): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function normalizeHeightOption(value: number | undefined): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }

  return Math.max(0, Math.round(value));
}
