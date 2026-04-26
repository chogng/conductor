import SettingsPanel from "./SettingsPanel";
import { useDeviceAnalysisSettings } from "./useDeviceAnalysisSettings";
import type { LanguageCode } from "../../../context/language";
import type { ThemeMode } from "../../../context/theme";
import type { LooseTranslateFn } from "../shared/lib/translateTypes";
import type { DeviceAnalysisSettings } from "./deviceAnalysisSettingsShared";

type SettingsPanelContainerProps = {
  appUpdateSettings: {
    currentVersion?: string | null;
    isAvailable: boolean;
    onCheckForUpdates: () => boolean | Promise<boolean>;
  };
  deviceAnalysisSettings: DeviceAnalysisSettings | null;
  deviceAnalysisSettingsLoaded: boolean;
  handleLanguageChange: (language: LanguageCode) => Promise<void> | void;
  handleThemeChange: (theme: ThemeMode) => Promise<void> | void;
  handleUpdateDeviceAnalysisSettings: (
    updates: unknown,
  ) => Promise<DeviceAnalysisSettings | null>;
  isWindowsDesktopShell: boolean;
  language: LanguageCode;
  mergeDeviceAnalysisSettings: (
    nextSettings: DeviceAnalysisSettings | null,
  ) => void;
  onboardingSettings: {
    onOpenGuide: () => void;
  };
  t: LooseTranslateFn;
  theme: ThemeMode;
};

const SettingsPanelContainer = ({
  appUpdateSettings,
  deviceAnalysisSettings,
  deviceAnalysisSettingsLoaded,
  handleLanguageChange,
  handleThemeChange,
  handleUpdateDeviceAnalysisSettings,
  isWindowsDesktopShell,
  language,
  mergeDeviceAnalysisSettings,
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
    useDeviceAnalysisSettings({
    deviceAnalysisSettings,
    deviceAnalysisSettingsLoaded,
    handleUpdateDeviceAnalysisSettings,
    isWindowsDesktopShell,
    mergeDeviceAnalysisSettings,
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
