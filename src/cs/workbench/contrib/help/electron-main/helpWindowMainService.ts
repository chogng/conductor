import path from "node:path";

import { BrowserWindow, shell, type BrowserWindowConstructorOptions } from "electron";

import type { ThemeSnapshot } from "../../../../platform/theme/electron-main/themeMainService.js";
import { defaultBrowserWindowOptions } from "../../../../platform/windows/electron-main/windows.js";
import {
  normalizeHelpWindowKind,
  type HelpWindowKind,
} from "../common/helpWindow.js";

type HelpWindowAppearance = {
  readonly backgroundColor?: string;
  readonly transparentChrome?: boolean;
};

export type HelpWindowMainServiceOptions = {
  readonly desktopRuntimeDir: string;
  readonly getAppRootPath: () => string;
  readonly getAppearance: () => HelpWindowAppearance;
  readonly getThemeSnapshot: () => ThemeSnapshot;
  readonly iconPath?: string;
  readonly isDev: boolean;
  readonly loadBaseUrl: string;
  readonly applyAppearance: (
    win: BrowserWindow | null | undefined,
    appearance: HelpWindowAppearance,
  ) => void;
  readonly applyTheme: (
    win: BrowserWindow | null | undefined,
    themeSnapshot: ThemeSnapshot,
  ) => void;
};

const HELP_WINDOW_BOUNDS = {
  width: 820,
  height: 680,
  minWidth: 620,
  minHeight: 480,
};

export class HelpWindowMainService {
  private readonly windows = new Map<HelpWindowKind, BrowserWindow>();

  constructor(private readonly options: HelpWindowMainServiceOptions) {}

  public open(kind: unknown): void {
    const normalizedKind = normalizeHelpWindowKind(kind);
    const existing = this.windows.get(normalizedKind);
    if (existing && !existing.isDestroyed()) {
      this.reveal(existing);
      return;
    }

    const win = this.createWindow(normalizedKind);
    this.windows.set(normalizedKind, win);
    this.loadWindow(win, normalizedKind);
  }

  public applyTheme(themeSnapshot: ThemeSnapshot): void {
    for (const win of this.windows.values()) {
      this.options.applyTheme(win, themeSnapshot);
      this.options.applyAppearance(win, this.options.getAppearance());
    }
  }

  public dispose(): void {
    for (const win of this.windows.values()) {
      if (!win.isDestroyed()) {
        win.destroy();
      }
    }
    this.windows.clear();
  }

  private createWindow(kind: HelpWindowKind): BrowserWindow {
    const themeSnapshot = this.options.getThemeSnapshot();
    const preload = path.join(this.options.desktopRuntimeDir, "preload.js");
    const baseOptions = defaultBrowserWindowOptions({
      icon: this.options.iconPath,
      isDev: this.options.isDev,
      preload,
      themeSnapshot,
    });
    const options: BrowserWindowConstructorOptions = {
      ...baseOptions,
      width: HELP_WINDOW_BOUNDS.width,
      height: HELP_WINDOW_BOUNDS.height,
      minWidth: HELP_WINDOW_BOUNDS.minWidth,
      minHeight: HELP_WINDOW_BOUNDS.minHeight,
      title: this.getWindowTitle(kind),
    };
    const win = new BrowserWindow(options);

    if (process.platform !== "darwin") {
      win.removeMenu();
      win.setAutoHideMenuBar(true);
      win.setMenuBarVisibility(false);
    }

    win.webContents.setWindowOpenHandler(({ url }) => {
      void shell.openExternal(url);
      return { action: "deny" };
    });

    win.once("ready-to-show", () => this.reveal(win));
    win.on("closed", () => {
      if (this.windows.get(kind) === win) {
        this.windows.delete(kind);
      }
    });
    this.options.applyTheme(win, themeSnapshot);
    this.options.applyAppearance(win, this.options.getAppearance());
    return win;
  }

  private loadWindow(win: BrowserWindow, kind: HelpWindowKind): void {
    if (this.options.isDev) {
      const url = new URL("/src/cs/workbench/contrib/help/browser/helpWindow.html", this.options.loadBaseUrl);
      url.searchParams.set("kind", kind);
      void win.loadURL(url.toString());
      return;
    }

    void win.loadFile(
      path.join(
        this.options.getAppRootPath(),
        "dist",
        "src",
        "cs",
        "workbench",
        "contrib",
        "help",
        "browser",
        "helpWindow.html",
      ),
      {
        query: { kind },
      },
    );
  }

  private reveal(win: BrowserWindow): void {
    if (win.isDestroyed()) {
      return;
    }

    if (win.isMinimized()) {
      win.restore();
    }
    if (!win.isVisible()) {
      win.show();
    }
    win.focus();
  }

  private getWindowTitle(kind: HelpWindowKind): string {
    return kind === "guide"
      ? "Conductor Studio User Guide"
      : "Conductor Studio Update Log";
  }
}
