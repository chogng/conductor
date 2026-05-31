import type { LanguageCode } from "src/cs/platform/language/common/language";
import type { LooseTranslateFn } from "src/cs/workbench/common/deviceAnalysis/translateTypes";
import type { ThemeMode } from "src/cs/workbench/common/theme";
import {
  SettingsController,
  type SettingsControllerOptions,
} from "src/cs/workbench/contrib/settings/browser/settingsController";
import { BrowserSettingsService } from "src/cs/workbench/contrib/settings/browser/settingsService";
import type { AnalysisSettings } from "src/cs/workbench/contrib/settings/settingsShared";
import type {
  AppUpdateSettings,
  OnboardingSettings,
} from "src/cs/workbench/contrib/settings/settingsViewTypes";

export type SettingsViewPaneProps = {
  appUpdateSettings: AppUpdateSettings;
  analysisSettings: AnalysisSettings | null;
  analysisSettingsLoaded: boolean;
  handleLanguageChange: (language: LanguageCode) => Promise<void> | void;
  handleThemeChange: (theme: ThemeMode) => Promise<void> | void;
  handleUpdateAnalysisSettings: (
    updates: unknown,
  ) => Promise<AnalysisSettings | null>;
  isWindowsDesktopShell: boolean;
  language: LanguageCode;
  mergeAnalysisSettings: (nextSettings: AnalysisSettings | null) => void;
  onboardingSettings: OnboardingSettings;
  t: LooseTranslateFn;
  theme: ThemeMode;
};

export class SettingsViewPane {
  public readonly element: HTMLDivElement;
  private readonly controller: SettingsController;

  constructor(options: SettingsViewPaneProps) {
    this.element = document.createElement("div");
    this.controller = new SettingsController(
      this.element,
      toControllerOptions(options),
      new BrowserSettingsService(),
    );
  }

  public update(options: SettingsViewPaneProps): void {
    this.controller.update(toControllerOptions(options));
  }

  public dispose(): void {
    this.controller.dispose();
  }
}

const toControllerOptions = ({
  appUpdateSettings,
  analysisSettings,
  analysisSettingsLoaded,
  handleLanguageChange,
  handleThemeChange,
  handleUpdateAnalysisSettings,
  isWindowsDesktopShell,
  language,
  mergeAnalysisSettings,
  onboardingSettings,
  t,
  theme,
}: SettingsViewPaneProps): SettingsControllerOptions => ({
  appUpdateSettings,
  analysisSettings,
  analysisSettingsLoaded,
  handleLanguageChange,
  handleThemeChange,
  handleUpdateAnalysisSettings,
  isWindowsDesktopShell,
  language,
  mergeAnalysisSettings,
  onboardingSettings,
  theme,
  t,
});
