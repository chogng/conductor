import type { LanguagePreference } from "src/cs/platform/language/common/language";
import type { ThemeMode } from "src/cs/workbench/common/theme";
import { localize } from "src/cs/nls";
import { ViewPane } from "src/cs/workbench/browser/parts/views/viewPane";
import { SettingsViewId } from "src/cs/workbench/contrib/settings/common/settings";
import {
  SettingsController,
  type SettingsControllerOptions,
} from "src/cs/workbench/contrib/settings/browser/settingsController";
import { BrowserSettingsService } from "src/cs/workbench/contrib/settings/browser/settingsService";
import type { AnalysisSettings } from "src/cs/workbench/contrib/settings/settingsShared";
import type {
  AppUpdateSettings,
} from "src/cs/workbench/contrib/settings/settingsViewTypes";

export type SettingsViewPaneProps = {
  appUpdateSettings: AppUpdateSettings;
  analysisSettings: AnalysisSettings | null;
  analysisSettingsLoaded: boolean;
  handleLanguageChange: (language: LanguagePreference) => Promise<void> | void;
  handleThemeChange: (theme: ThemeMode) => Promise<void> | void;
  handleUpdateAnalysisSettings: (
    updates: unknown,
  ) => Promise<AnalysisSettings | null>;
  isWindowsDesktopShell: boolean;
  language: LanguagePreference;
  mergeAnalysisSettings: (nextSettings: AnalysisSettings | null) => void;
  theme: ThemeMode;
};

export class SettingsViewPane extends ViewPane {
  private readonly controller: SettingsController;

  constructor(options: SettingsViewPaneProps) {
    super({
      id: SettingsViewId,
      title: localize("settings.title", "Settings"),
      className: "settings-view-pane",
      bodyClassName: "workbench-part-view-pane__body",
      headerVisible: false,
    });
    this.controller = new SettingsController(
      this.body,
      toControllerOptions(options),
      new BrowserSettingsService(),
    );
  }

  public update(options: SettingsViewPaneProps): void {
    this.controller.update(toControllerOptions(options));
  }

  public dispose(): void {
    this.controller.dispose();
    super.dispose();
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
  theme,
});
