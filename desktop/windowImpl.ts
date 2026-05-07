import type { BrowserWindow } from "electron";
import {
  getThemeSnapshot,
  type ThemeSnapshot,
} from "../src/cs/platform/theme/electron-main/themeMainService.js";

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
};
