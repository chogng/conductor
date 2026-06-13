import type { BrowserWindow, BrowserWindowConstructorOptions } from "electron";

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

const TransparentWindowBackground = "rgba(0, 0, 0, 0)";

type WindowControlsOverlayOptions = {
  readonly height?: number;
  readonly backgroundColor?: string;
  readonly foregroundColor?: string;
};

type DesktopWindowAppearance = {
  readonly backgroundColor?: string;
  readonly transparentChrome?: boolean;
};

type DesktopWindowMaterial = NonNullable<
  BrowserWindowConstructorOptions["backgroundMaterial"]
>;
type DesktopWindowVibrancy = NonNullable<Parameters<BrowserWindow["setVibrancy"]>[0]>;
type DesktopWindowVisualEffectState = NonNullable<
  BrowserWindowConstructorOptions["visualEffectState"]
>;

type DesktopWindowAppearanceStyle = {
  readonly backgroundMaterial?: DesktopWindowMaterial;
  readonly backgroundColor: string;
  readonly titleBarOverlayColor: string;
  readonly transparentChrome: boolean;
  readonly vibrancy?: DesktopWindowVibrancy;
  readonly visualEffectState?: DesktopWindowVisualEffectState;
};

type DesktopWindowTheme = {
  readonly backgroundColor: string;
  readonly foregroundColor: string;
};

type DefaultBrowserWindowOptions = {
  readonly appearance?: DesktopWindowAppearance | null;
  readonly icon?: string;
  readonly isDev: boolean;
  readonly preload: string;
  readonly theme: DesktopWindowTheme;
};

export class DesktopWindowMain {
  private readonly windowAppearanceStyles =
    new WeakMap<BrowserWindow, DesktopWindowAppearanceStyle>();

  constructor(
    private readonly defaultBackgroundColor: string,
  ) {}

  public createBrowserWindowOptions({
    appearance,
    icon,
    isDev,
    preload,
    theme,
  }: DefaultBrowserWindowOptions): BrowserWindowConstructorOptions {
    const hideNativeWindowsTitlebar = process.platform === "win32";
    const appearanceStyle = resolveDesktopWindowAppearanceStyle(
      appearance ?? null,
      theme.backgroundColor,
      process.platform,
    );

    return {
      width: DEFAULT_MAIN_WINDOW_SIZE.WIDTH,
      height: DEFAULT_MAIN_WINDOW_SIZE.HEIGHT,
      minWidth: WindowMinimumSize.WIDTH,
      minHeight: WindowMinimumSize.HEIGHT,
      icon,
      backgroundColor: appearanceStyle.backgroundColor,
      backgroundMaterial: appearanceStyle.backgroundMaterial,
      autoHideMenuBar: true,
      center: true,
      frame: !hideNativeWindowsTitlebar,
      show: false,
      titleBarOverlay: hideNativeWindowsTitlebar
        ? {
            color: appearanceStyle.titleBarOverlayColor,
            symbolColor: theme.foregroundColor,
            height: 38,
          }
        : undefined,
      titleBarStyle: hideNativeWindowsTitlebar ? "hidden" : undefined,
      vibrancy: appearanceStyle.vibrancy,
      visualEffectState: appearanceStyle.visualEffectState,
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
      readonly theme?: DesktopWindowTheme | null;
    },
  ): void {
    if (!win || win.isDestroyed()) return;

    const hasAppearance =
      Object.prototype.hasOwnProperty.call(options, "appearance");
    const appearanceStyle = hasAppearance
      ? resolveDesktopWindowAppearanceStyle(
          options.appearance ?? null,
          this.defaultBackgroundColor,
          process.platform,
        )
      : this.windowAppearanceStyles.get(win);
    const previousAppearanceStyle = this.windowAppearanceStyles.get(win);

    if (options.theme) {
      applyWindowTheme(win, options.theme, appearanceStyle);
    }

    if (hasAppearance && appearanceStyle) {
      this.windowAppearanceStyles.set(win, appearanceStyle);
      if (!isSameDesktopWindowAppearanceStyle(previousAppearanceStyle, appearanceStyle)) {
        applyDesktopAppearance(win, appearanceStyle, previousAppearanceStyle);
      }
    }
  }

  public updateWindowControls(
    win: BrowserWindow | null | undefined,
    options: WindowControlsOverlayOptions,
  ): void {
    updateWindowControlsOverlay(
      win,
      withAppearanceWindowControlsOverlay(
        options,
        win ? this.windowAppearanceStyles.get(win) : undefined,
      ),
    );
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

function applyWindowTheme(
  win: BrowserWindow,
  theme: DesktopWindowTheme,
  appearanceStyle?: DesktopWindowAppearanceStyle,
): void {
  const backgroundColor =
    appearanceStyle?.backgroundColor ?? theme.backgroundColor;
  if (typeof backgroundColor === "string") {
    win.setBackgroundColor(backgroundColor);
  }
  updateWindowControlsOverlay(
    win,
    {
      backgroundColor: appearanceStyle?.titleBarOverlayColor ?? theme.backgroundColor,
      foregroundColor: theme.foregroundColor,
    },
  );
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
  style: DesktopWindowAppearanceStyle,
  previousStyle?: DesktopWindowAppearanceStyle,
): void {
  if (shouldPaintBackgroundBeforeNativeMaterial(previousStyle, style)) {
    applyDesktopWindowBackground(win, style, previousStyle);
    applyDesktopNativeMaterial(win, style, previousStyle);
    return;
  }

  applyDesktopNativeMaterial(win, style, previousStyle);
  applyDesktopWindowBackground(win, style, previousStyle);
}

function shouldPaintBackgroundBeforeNativeMaterial(
  previousStyle: DesktopWindowAppearanceStyle | undefined,
  style: DesktopWindowAppearanceStyle,
): boolean {
  // If native transparency is being removed, repaint the opaque layer first so
  // DWM/AppKit never exposes the clear window background during the transition.
  return previousStyle?.transparentChrome === true
    && style.transparentChrome !== true
    && (
      previousStyle?.backgroundMaterial !== style.backgroundMaterial
      || previousStyle?.vibrancy !== style.vibrancy
    );
}

function applyDesktopNativeMaterial(
  win: BrowserWindow,
  style: DesktopWindowAppearanceStyle,
  previousStyle?: DesktopWindowAppearanceStyle,
): void {
  if (
    process.platform === "win32"
    && previousStyle?.backgroundMaterial !== style.backgroundMaterial
    && typeof win.setBackgroundMaterial === "function"
  ) {
    try {
      win.setBackgroundMaterial(style.backgroundMaterial ?? "none");
    } catch {
      // Native material is best-effort; CSS transparency remains available.
    }
  }

  if (
    process.platform === "darwin"
    && previousStyle?.vibrancy !== style.vibrancy
    && typeof win.setVibrancy === "function"
  ) {
    win.setVibrancy(style.vibrancy ?? null);
  }
}

function applyDesktopWindowBackground(
  win: BrowserWindow,
  style: DesktopWindowAppearanceStyle,
  previousStyle?: DesktopWindowAppearanceStyle,
): void {
  if (previousStyle?.backgroundColor !== style.backgroundColor) {
    win.setBackgroundColor(style.backgroundColor);
  }
  if (previousStyle?.titleBarOverlayColor !== style.titleBarOverlayColor) {
    updateWindowControlsOverlay(win, {
      backgroundColor: style.titleBarOverlayColor,
    });
  }
}

function withAppearanceWindowControlsOverlay(
  options: WindowControlsOverlayOptions,
  style: DesktopWindowAppearanceStyle | undefined,
): WindowControlsOverlayOptions {
  if (style?.transparentChrome !== true) {
    return options;
  }

  return {
    ...options,
    backgroundColor: style.titleBarOverlayColor,
  };
}

function resolveDesktopWindowAppearanceStyle(
  appearance: DesktopWindowAppearance | null,
  defaultBackgroundColor: string,
  platform: NodeJS.Platform,
): DesktopWindowAppearanceStyle {
  const backgroundColor = normalizeColorOption(appearance?.backgroundColor)
    ?? defaultBackgroundColor;
  const transparentChrome = appearance?.transparentChrome === true;

  if (platform === "win32") {
    return resolveWin32DesktopWindowAppearanceStyle(backgroundColor, transparentChrome);
  }

  if (!transparentChrome) {
    return {
      backgroundColor,
      titleBarOverlayColor: backgroundColor,
      transparentChrome: false,
    };
  }

  if (platform === "darwin") {
    return {
      backgroundColor: TransparentWindowBackground,
      titleBarOverlayColor: backgroundColor,
      transparentChrome: true,
      vibrancy: "sidebar",
      visualEffectState: "followWindow",
    };
  }

  return {
    backgroundColor,
    titleBarOverlayColor: backgroundColor,
    transparentChrome: false,
  };
}

function resolveWin32DesktopWindowAppearanceStyle(
  backgroundColor: string,
  transparentChrome: boolean,
): DesktopWindowAppearanceStyle {
  // Keep the Windows backdrop material stable. Runtime toggles of
  // setBackgroundMaterial cause a full native repaint, so transparency is
  // controlled by renderer CSS and the titlebar overlay instead.
  return {
    backgroundMaterial: "mica",
    backgroundColor: TransparentWindowBackground,
    titleBarOverlayColor: transparentChrome
      ? TransparentWindowBackground
      : backgroundColor,
    transparentChrome,
  };
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

function isSameDesktopWindowAppearanceStyle(
  current: DesktopWindowAppearanceStyle | undefined,
  next: DesktopWindowAppearanceStyle,
): boolean {
  return Boolean(current)
    && current?.backgroundMaterial === next.backgroundMaterial
    && current?.backgroundColor === next.backgroundColor
    && current?.titleBarOverlayColor === next.titleBarOverlayColor
    && current?.transparentChrome === next.transparentChrome
    && current?.vibrancy === next.vibrancy
    && current?.visualEffectState === next.visualEffectState;
}
