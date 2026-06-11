import type { BrowserWindow } from "electron";
import {
  getThemeSnapshot,
  type ThemeSnapshot,
} from "../../theme/electron-main/themeMainService.js";

export type WindowControlsOverlayOptions = {
  readonly height?: number;
  readonly backgroundColor?: string;
  readonly foregroundColor?: string;
};

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
