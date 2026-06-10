import { Emitter, type Event } from "src/cs/base/common/event";
import { Disposable } from "src/cs/base/common/lifecycle";
import {
  isLanguagePreference,
  type LanguagePreference,
} from "src/cs/platform/language/common/language";
import type { ThemeMode } from "src/cs/workbench/common/theme";
import {
  DEFAULT_ORIGIN_PLOT_OPTIONS,
  normalizeOriginPlotOptions,
  type OriginPlotOptions,
} from "src/cs/workbench/services/origin/common/originPlotOptions";
import type {
  IonIoffMethod,
  SsMethod,
} from "src/cs/workbench/services/parameters/common/parameters";
import { getSettings, updateSettings } from "src/cs/workbench/services/settings/browser/settingsStore";
import {
  getInitialSettingsSnapshot,
  toConductorSettings,
} from "src/cs/workbench/services/settings/browser/settingsShared";
import type { ConductorSettings } from "src/cs/workbench/services/settings/common/settings";

export type CoreSettingsControllerOptions = {
  applyAppearanceSettings: (settings: ConductorSettings | null) => void;
  language: LanguagePreference;
  setIonIoffMethod: (method: IonIoffMethod) => void;
  reloadWorkbench: () => void;
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
  setSsMethod: (method: SsMethod) => void;
  setSsShowFitLine: (enabled: boolean) => void;
};

export type CoreSettingsState = {
  conductorSettings: ConductorSettings | null;
  conductorSettingsLoaded: boolean;
  handleLanguageChange: (language: LanguagePreference) => Promise<void>;
  handleThemeChange: (theme: ThemeMode) => Promise<void>;
  updateConductorSettings: (
    updates: unknown,
  ) => Promise<ConductorSettings | null>;
  mergeConductorSettings: (nextSettings: ConductorSettings | null) => void;
  originOpenPlotOptions: OriginPlotOptions;
};

const emptyController = {
  handleLanguageChange: async () => {},
  handleThemeChange: async () => {},
  updateConductorSettings: async () => null,
  mergeConductorSettings: () => {},
};

export const createCoreSettingsState = (): CoreSettingsState => {
  const settings = getInitialSettingsSnapshot();

  return {
    conductorSettings: settings,
    conductorSettingsLoaded: Boolean(settings),
    handleLanguageChange: emptyController.handleLanguageChange,
    handleThemeChange: emptyController.handleThemeChange,
    updateConductorSettings: emptyController.updateConductorSettings,
    mergeConductorSettings: emptyController.mergeConductorSettings,
    originOpenPlotOptions: getOriginOpenPlotOptions(settings),
  };
};

const getOriginOpenPlotOptions = (
  settings: ConductorSettings | null,
): OriginPlotOptions =>
  normalizeOriginPlotOptions(
    {
      command: settings?.originPlotCommandDefault,
      postCommands: settings?.originPlotPostCommandsDefault,
      type: settings?.originPlotTypeDefault,
      lineWidth: settings?.originPlotLineWidthDefault,
      legendFontSize: settings?.originPlotLegendFontSizeDefault,
      xyPairs: settings?.originPlotXyPairsDefault,
    },
    DEFAULT_ORIGIN_PLOT_OPTIONS,
  );

export class CoreSettingsController extends Disposable {
  private readonly onDidChangeStateEmitter =
    this._register(new Emitter<CoreSettingsState>());

  public readonly onDidChangeState: Event<CoreSettingsState> =
    this.onDidChangeStateEmitter.event;

  private conductorSettings: ConductorSettings | null;
  private conductorSettingsLoaded: boolean;
  private isDisposed = false;
  private options: CoreSettingsControllerOptions;

  constructor(options: CoreSettingsControllerOptions) {
    super();

    this.options = options;
    this.conductorSettings = getInitialSettingsSnapshot();
    this.conductorSettingsLoaded = Boolean(this.conductorSettings);

    if (this.conductorSettings) {
      this.applySettings(this.conductorSettings);
    } else {
      void this.loadSettings();
    }
  }

  public override dispose(): void {
    this.isDisposed = true;
    super.dispose();
  }

  public update(options: CoreSettingsControllerOptions): void {
    this.options = options;
  }

  public getState(): CoreSettingsState {
    return {
      conductorSettings: this.conductorSettings,
      conductorSettingsLoaded: this.conductorSettingsLoaded,
      handleLanguageChange: this.handleLanguageChange,
      handleThemeChange: this.handleThemeChange,
      updateConductorSettings: this.updateConductorSettings,
      mergeConductorSettings: this.mergeConductorSettings,
      originOpenPlotOptions: getOriginOpenPlotOptions(this.conductorSettings),
    };
  }

  public readonly mergeConductorSettings = (
    nextSettings: ConductorSettings | null,
  ): void => {
    this.conductorSettings = nextSettings
      ? { ...(this.conductorSettings || {}), ...nextSettings }
      : this.conductorSettings ?? null;
    this.applySettings(this.conductorSettings);
    this.fireState();
  };

  public readonly updateConductorSettings = async (
    updates: unknown,
  ): Promise<ConductorSettings | null> => {
    const patch = updates && typeof updates === "object" ? updates : null;
    if (!patch) return null;

    const updated = toConductorSettings(await updateSettings(patch));
    this.mergeConductorSettings(updated);
    return updated;
  };

  public readonly handleLanguageChange = async (
    nextLanguage: LanguagePreference,
  ): Promise<void> => {
    if (!isLanguagePreference(nextLanguage)) return;
    if (this.options.language === nextLanguage) return;

    try {
      await this.updateConductorSettings({ language: nextLanguage });
      this.options.reloadWorkbench();
    } catch {
      // Keep UI responsive even if persistence fails.
    }
  };

  public readonly handleThemeChange = async (
    nextTheme: ThemeMode,
  ): Promise<void> => {
    if (nextTheme !== "system" && nextTheme !== "light" && nextTheme !== "dark") {
      return;
    }
    if (this.options.theme === nextTheme) return;

    this.options.setTheme(nextTheme);

    try {
      await this.updateConductorSettings({ theme: nextTheme });
    } catch {
      // Keep UI responsive even if persistence fails.
    }
  };

  private async loadSettings(): Promise<void> {
    this.conductorSettingsLoaded = false;
    this.fireState();

    try {
      const settings = toConductorSettings(await getSettings());
      if (this.isDisposed) return;

      this.conductorSettings = settings;
      this.applySettings(settings);
    } catch {
      // Ignore settings load failures; settings UI can still render defaults.
    } finally {
      if (!this.isDisposed) {
        this.conductorSettingsLoaded = true;
        this.fireState();
      }
    }
  }

  private applySettings(settings: ConductorSettings | null): void {
    const nextTheme = settings?.theme;
    if (nextTheme === "system" || nextTheme === "light" || nextTheme === "dark") {
      this.options.setTheme(nextTheme);
    }

    this.options.applyAppearanceSettings(settings);

    const ssMethodDefault = settings?.ssMethodDefault;
    if (ssMethodDefault === "auto" || ssMethodDefault === "manual") {
      this.options.setSsMethod(ssMethodDefault);
    }

    if (typeof settings?.ssShowFitLine === "boolean") {
      this.options.setSsShowFitLine(settings.ssShowFitLine);
    }
  }

  private fireState(): void {
    if (!this.isDisposed) {
      this.onDidChangeStateEmitter.fire(this.getState());
    }
  }
}
