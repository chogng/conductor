import SettingsPanel from "./SettingsPanel";
import { useSettings } from "./useSettings";
import type { LanguageCode } from "../../../context/language";
import type { ThemeMode } from "../../../context/theme";
import type { LooseTranslateFn } from "../shared/lib/translateTypes";
import type { AnalysisSettings } from "./settingsShared";

type SettingsPanelContainerProps = {
  appUpdateSettings: {
    currentVersion?: string | null;
    isAvailable: boolean;
    onCheckForUpdates: () => boolean | Promise<boolean>;
  };
  analysisSettings: AnalysisSettings | null;
  analysisSettingsLoaded: boolean;
  handleLanguageChange: (language: LanguageCode) => Promise<void> | void;
  handleThemeChange: (theme: ThemeMode) => Promise<void> | void;
  handleUpdateAnalysisSettings: (
    updates: unknown,
  ) => Promise<AnalysisSettings | null>;
  isWindowsDesktopShell: boolean;
  language: LanguageCode;
  mergeAnalysisSettings: (
    nextSettings: AnalysisSettings | null,
  ) => void;
  onboardingSettings: {
    onOpenGuide: () => void;
  };
  t: LooseTranslateFn;
  theme: ThemeMode;
};

const SettingsPanelContainer = ({
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
}: SettingsPanelContainerProps) => {
  const {
    analysisDefaultSettings,
    fileNameMatchingSettings,
    originSettings,
    storageSettings,
    windowCloseSettings,
  } =
    useSettings({
    analysisSettings,
    analysisSettingsLoaded,
    handleUpdateAnalysisSettings,
    isWindowsDesktopShell,
    mergeAnalysisSettings,
    t,
  });

  return (
    <SettingsPanel
      appUpdateSettings={appUpdateSettings}
      analysisDefaultSettings={analysisDefaultSettings}
      fileNameMatchingSettings={fileNameMatchingSettings}
      language={language}
      onLanguageChange={handleLanguageChange}
      onboardingSettings={onboardingSettings}
      theme={theme}
      onThemeChange={handleThemeChange}
      originSettings={originSettings}
      storageSettings={storageSettings}
      windowCloseSettings={windowCloseSettings}
      t={t}
    />
  );
};

export default SettingsPanelContainer;
