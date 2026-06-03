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
} from "src/cs/workbench/contrib/origin/common/originPlotOptions";
import type {
  IonIoffMethod,
  SsMethod,
} from "src/cs/workbench/contrib/session/browser/sessionContext";
import { getSettings, updateSettings } from "src/cs/workbench/contrib/settings/settingsService";
import {
  getInitialSettingsSnapshot,
  toAnalysisSettings,
  type AnalysisSettings,
} from "src/cs/workbench/contrib/settings/settingsShared";
import {
  normalizeWorkbenchAppearance,
  type WorkbenchAppearance,
} from "src/cs/workbench/browser/appearance";

export type CoreSettingsControllerOptions = {
  language: LanguagePreference;
  setAppearance: (appearance: WorkbenchAppearance) => void;
  setIonIoffMethod: (method: IonIoffMethod) => void;
  setLanguage: (language: LanguagePreference) => void;
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
  setGmDiagnosticsEnabled: (enabled: boolean) => void;
  setSsDiagnosticsEnabled: (enabled: boolean) => void;
  setVthDiagnosticsEnabled: (enabled: boolean) => void;
  setSsMethod: (method: SsMethod) => void;
  setSsShowFitLine: (enabled: boolean) => void;
};

export type CoreSettingsState = {
  analysisSettings: AnalysisSettings | null;
  analysisSettingsLoaded: boolean;
  handleLanguageChange: (language: LanguagePreference) => Promise<void>;
  handleThemeChange: (theme: ThemeMode) => Promise<void>;
  handleUpdateAnalysisSettings: (
    updates: unknown,
  ) => Promise<AnalysisSettings | null>;
  mergeAnalysisSettings: (nextSettings: AnalysisSettings | null) => void;
  originOpenPlotOptions: OriginPlotOptions;
};

const emptyController = {
  handleLanguageChange: async () => {},
  handleThemeChange: async () => {},
  handleUpdateAnalysisSettings: async () => null,
  mergeAnalysisSettings: () => {},
};

export const createCoreSettingsState = (): CoreSettingsState => {
  const settings = getInitialSettingsSnapshot();

  return {
    analysisSettings: settings,
    analysisSettingsLoaded: Boolean(settings),
    handleLanguageChange: emptyController.handleLanguageChange,
    handleThemeChange: emptyController.handleThemeChange,
    handleUpdateAnalysisSettings: emptyController.handleUpdateAnalysisSettings,
    mergeAnalysisSettings: emptyController.mergeAnalysisSettings,
    originOpenPlotOptions: getOriginOpenPlotOptions(settings),
  };
};

const getOriginOpenPlotOptions = (
  settings: AnalysisSettings | null,
): OriginPlotOptions =>
  normalizeOriginPlotOptions(
    {
      command: settings?.originPlotCommandDefault,
      postCommands: settings?.originPlotPostCommandsDefault,
      type: settings?.originPlotTypeDefault,
      lineWidth: settings?.originPlotLineWidthDefault,
      xyPairs: settings?.originPlotXyPairsDefault,
    },
    DEFAULT_ORIGIN_PLOT_OPTIONS,
  );

export class CoreSettingsController extends Disposable {
  private readonly onDidChangeStateEmitter =
    this._register(new Emitter<CoreSettingsState>());

  public readonly onDidChangeState: Event<CoreSettingsState> =
    this.onDidChangeStateEmitter.event;

  private analysisSettings: AnalysisSettings | null;
  private analysisSettingsLoaded: boolean;
  private isDisposed = false;
  private options: CoreSettingsControllerOptions;

  constructor(options: CoreSettingsControllerOptions) {
    super();

    this.options = options;
    this.analysisSettings = getInitialSettingsSnapshot();
    this.analysisSettingsLoaded = Boolean(this.analysisSettings);

    if (this.analysisSettings) {
      this.applySettings(this.analysisSettings);
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
      analysisSettings: this.analysisSettings,
      analysisSettingsLoaded: this.analysisSettingsLoaded,
      handleLanguageChange: this.handleLanguageChange,
      handleThemeChange: this.handleThemeChange,
      handleUpdateAnalysisSettings: this.handleUpdateAnalysisSettings,
      mergeAnalysisSettings: this.mergeAnalysisSettings,
      originOpenPlotOptions: getOriginOpenPlotOptions(this.analysisSettings),
    };
  }

  public readonly mergeAnalysisSettings = (
    nextSettings: AnalysisSettings | null,
  ): void => {
    this.analysisSettings = nextSettings
      ? { ...(this.analysisSettings || {}), ...nextSettings }
      : this.analysisSettings ?? null;
    this.applySettings(this.analysisSettings);
    this.fireState();
  };

  public readonly handleUpdateAnalysisSettings = async (
    updates: unknown,
  ): Promise<AnalysisSettings | null> => {
    const patch = updates && typeof updates === "object" ? updates : null;
    if (!patch) return null;

    const updated = toAnalysisSettings(await updateSettings(patch));
    this.mergeAnalysisSettings(updated);
    return updated;
  };

  public readonly handleLanguageChange = async (
    nextLanguage: LanguagePreference,
  ): Promise<void> => {
    if (!isLanguagePreference(nextLanguage)) return;
    if (this.options.language === nextLanguage) return;

    this.options.setLanguage(nextLanguage);

    try {
      await this.handleUpdateAnalysisSettings({ language: nextLanguage });
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
      await this.handleUpdateAnalysisSettings({ theme: nextTheme });
    } catch {
      // Keep UI responsive even if persistence fails.
    }
  };

  private async loadSettings(): Promise<void> {
    this.analysisSettingsLoaded = false;
    this.fireState();

    try {
      const settings = toAnalysisSettings(await getSettings());
      if (this.isDisposed) return;

      this.analysisSettings = settings;
      this.applySettings(settings);
    } catch {
      // Ignore settings load failures; settings UI can still render defaults.
    } finally {
      if (!this.isDisposed) {
        this.analysisSettingsLoaded = true;
        this.fireState();
      }
    }
  }

  private applySettings(settings: AnalysisSettings | null): void {
    const nextLanguage = settings?.language;
    if (isLanguagePreference(nextLanguage)) {
      this.options.setLanguage(nextLanguage);
    }

    const nextTheme = settings?.theme;
    if (nextTheme === "system" || nextTheme === "light" || nextTheme === "dark") {
      this.options.setTheme(nextTheme);
    }

    this.options.setAppearance(normalizeWorkbenchAppearance(settings));

    const ssMethodDefault = settings?.ssMethodDefault;
    if (ssMethodDefault === "auto" || ssMethodDefault === "manual") {
      this.options.setSsMethod(ssMethodDefault);
    }

    if (typeof settings?.ssDiagnosticsEnabled === "boolean") {
      this.options.setSsDiagnosticsEnabled(settings.ssDiagnosticsEnabled);
    }

    if (typeof settings?.vthDiagnosticsEnabled === "boolean") {
      this.options.setVthDiagnosticsEnabled(settings.vthDiagnosticsEnabled);
    }

    if (typeof settings?.gmDiagnosticsEnabled === "boolean") {
      this.options.setGmDiagnosticsEnabled(settings.gmDiagnosticsEnabled);
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
