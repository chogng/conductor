import type { Event } from "../../../base/common/event.js";
import { createDecorator } from "../../instantiation/common/instantiation.js";

export const IThemeMainService = createDecorator<IThemeMainService>("themeMainService");

export type ThemeMode = "light" | "dark" | "system";

export type ThemeSnapshot = {
  themeMode: ThemeMode;
  resolvedThemeMode: Exclude<ThemeMode, "system">;
  backgroundColor: string;
  foregroundColor: string;
};

export type DesktopWindowTheme = {
  readonly backgroundColor: string;
  readonly foregroundColor: string;
};

export type DesktopWindowAppearance = {
  readonly backgroundColor?: string;
  readonly opaqueSurfaceBackgroundColor?: string;
  readonly transparentChrome?: boolean;
};

export interface IThemeMainService {
  readonly _serviceBrand: undefined;
  readonly onDidChangeColorScheme: Event<ThemeSnapshot>;

  getWindowTheme(settings?: unknown): DesktopWindowTheme;
  getWindowAppearance(settings?: unknown): DesktopWindowAppearance;
  getOpaqueSurfaceBackgroundColor(): string;
  syncNativeThemeSource(settings?: unknown): ThemeMode;
}

export const resolveThemeMode = (themeMode: unknown): ThemeMode => {
  return themeMode === "light" || themeMode === "dark" || themeMode === "system"
    ? themeMode
    : "system";
};
