import { nativeTheme } from "electron";
const THEME_COLORS = {
    light: {
        backgroundColor: "#f5f4ef",
        foregroundColor: "#222222",
    },
    dark: {
        backgroundColor: "#0b0b0c",
        foregroundColor: "#f5f4ef",
    },
};
export const resolveThemeMode = (themeMode) => {
    return themeMode === "light" || themeMode === "dark" || themeMode === "system"
        ? themeMode
        : "system";
};
export const getThemeSnapshot = (themeMode) => {
    const normalizedThemeMode = resolveThemeMode(themeMode);
    const resolvedThemeMode = normalizedThemeMode === "system"
        ? nativeTheme.shouldUseDarkColors
            ? "dark"
            : "light"
        : normalizedThemeMode;
    const palette = THEME_COLORS[resolvedThemeMode];
    return {
        themeMode: normalizedThemeMode,
        resolvedThemeMode,
        backgroundColor: palette.backgroundColor,
        foregroundColor: palette.foregroundColor,
    };
};
