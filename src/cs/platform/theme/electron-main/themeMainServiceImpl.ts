import electron from "electron";

import { Emitter } from "../../../base/common/event.js";
import { Disposable, toDisposable } from "../../../base/common/lifecycle.js";
import {
  IConfigurationService,
  type IConfigurationChangeEvent,
} from "../../configuration/common/configuration.js";
import {
  IThemeMainService,
  resolveThemeMode,
  type DesktopWindowAppearance,
  type DesktopWindowTheme,
  type ThemeMode,
  type ThemeSnapshot,
} from "./themeMainService.js";

const OPAQUE_WINDOW_SURFACE_LIGHT_BACKGROUND_COLOR = "#f9f9f9";
const OPAQUE_WINDOW_SURFACE_DARK_BACKGROUND_COLOR = "#000000";
const WORKBENCH_BACKGROUND_COLOR_PATTERN = /^#[0-9a-f]{6}$/i;

const THEME_COLORS = {
  light: {
    backgroundColor: "#f5f4ef",
    foregroundColor: "#222222",
  },
  dark: {
    backgroundColor: "#0b0b0c",
    foregroundColor: "#f5f4ef",
  },
} as const;

type NativeThemeLike = {
  shouldUseDarkColors: boolean;
  themeSource: ThemeMode;
  on(event: "updated", listener: () => void): void;
  removeListener(event: "updated", listener: () => void): void;
};

export class ThemeMainService extends Disposable implements IThemeMainService {
  public declare readonly _serviceBrand: undefined;

  private readonly onDidChangeColorSchemeEmitter =
    this._register(new Emitter<ThemeSnapshot>());
  public readonly onDidChangeColorScheme = this.onDidChangeColorSchemeEmitter.event;

  public constructor(
    private readonly defaultWorkbenchBackgroundColor: string,
    private readonly configurationService: IConfigurationService,
    private readonly nativeThemeService: NativeThemeLike = electron.nativeTheme,
  ) {
    super();

    this._register(this.configurationService.onDidChangeConfiguration(event => {
      if (this.affectsThemeConfiguration(event)) {
        this.syncNativeThemeSource();
        this.onDidChangeColorSchemeEmitter.fire(this.getThemeSnapshot());
      }
    }));
    this.nativeThemeService.on("updated", this.handleNativeThemeUpdated);
    this._register(toDisposable(() => {
      this.nativeThemeService.removeListener("updated", this.handleNativeThemeUpdated);
    }));
    this.syncNativeThemeSource();
  }

  public getWindowTheme(settings: unknown = this.getConfiguration()): DesktopWindowTheme {
    const themeMode = this.syncNativeThemeSource(settings);
    const snapshot = this.getThemeSnapshot(themeMode);
    return {
      backgroundColor: snapshot.backgroundColor,
      foregroundColor: snapshot.foregroundColor,
    };
  }

  public getWindowAppearance(settings: unknown = this.getConfiguration()): DesktopWindowAppearance {
    const configuration = asConfigurationRecord(settings);
    this.syncNativeThemeSource(configuration);
    return {
      backgroundColor: this.normalizeWorkbenchBackgroundColor(configuration.backgroundColor),
      opaqueSurfaceBackgroundColor: this.getOpaqueSurfaceBackgroundColor(),
      transparentChrome: configuration.transparentChrome === true,
    };
  }

  public getOpaqueSurfaceBackgroundColor(): string {
    return this.nativeThemeService.shouldUseDarkColors
      ? OPAQUE_WINDOW_SURFACE_DARK_BACKGROUND_COLOR
      : OPAQUE_WINDOW_SURFACE_LIGHT_BACKGROUND_COLOR;
  }

  public syncNativeThemeSource(settings: unknown = this.getConfiguration()): ThemeMode {
    const configuration = asConfigurationRecord(settings);
    const themeMode = resolveThemeMode(configuration.theme);
    if (this.nativeThemeService.themeSource !== themeMode) {
      this.nativeThemeService.themeSource = themeMode;
    }
    return themeMode;
  }

  private readonly handleNativeThemeUpdated = (): void => {
    this.onDidChangeColorSchemeEmitter.fire(this.getThemeSnapshot());
  };

  private getThemeSnapshot(themeMode: unknown = this.readThemeMode()): ThemeSnapshot {
    const normalizedThemeMode = resolveThemeMode(themeMode);
    const resolvedThemeMode =
      normalizedThemeMode === "system"
        ? this.nativeThemeService.shouldUseDarkColors
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
  }

  private getConfiguration(): Record<string, unknown> {
    return this.configurationService.getValue<Record<string, unknown>>() ?? {};
  }

  private readThemeMode(): ThemeMode {
    return resolveThemeMode(this.getConfiguration().theme);
  }

  private normalizeWorkbenchBackgroundColor(value: unknown): string {
    if (typeof value !== "string") {
      return this.defaultWorkbenchBackgroundColor;
    }

    const normalized = value.trim();
    return WORKBENCH_BACKGROUND_COLOR_PATTERN.test(normalized)
      ? normalized.toLowerCase()
      : this.defaultWorkbenchBackgroundColor;
  }

  private affectsThemeConfiguration(event: IConfigurationChangeEvent): boolean {
    return event.affectsConfiguration("theme")
      || event.affectsConfiguration("backgroundColor")
      || event.affectsConfiguration("transparentChrome");
  }
}

function asConfigurationRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}
