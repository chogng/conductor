import { nativeTheme } from "electron";

export type ThemeMode = "light" | "dark" | "system";

export type ThemeSnapshot = {
  themeMode: ThemeMode;
  resolvedThemeMode: Exclude<ThemeMode, "system">;
  backgroundColor: string;
  foregroundColor: string;
};

const BOOT_THEME_COLORS = {
  light: {
    backgroundColor: "#f5f4ef",
    foregroundColor: "#222222",
  },
  dark: {
    backgroundColor: "#0b0b0c",
    foregroundColor: "#f5f4ef",
  },
} as const;

export const resolveBootThemeMode = (themeMode: unknown): ThemeMode => {
  return themeMode === "light" || themeMode === "dark" || themeMode === "system"
    ? themeMode
    : "system";
};

export const getThemeSnapshot = (themeMode: unknown): ThemeSnapshot => {
  const normalizedThemeMode = resolveBootThemeMode(themeMode);
  const resolvedThemeMode =
    normalizedThemeMode === "system"
      ? nativeTheme.shouldUseDarkColors
        ? "dark"
        : "light"
      : normalizedThemeMode;
  const palette = BOOT_THEME_COLORS[resolvedThemeMode];

  return {
    themeMode: normalizedThemeMode,
    resolvedThemeMode,
    backgroundColor: palette.backgroundColor,
    foregroundColor: palette.foregroundColor,
  };
};
