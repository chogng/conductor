import { jsx } from "react/jsx-runtime";
import { useLayoutEffect, useRef } from "react";
import type { LanguageCode } from "src/cs/platform/language/common/language";
import type { LooseTranslateFn } from "src/cs/workbench/common/deviceAnalysis/translateTypes";
import type { ThemeMode } from "src/cs/workbench/common/theme";
import type {
  AppUpdateSettings,
  OnboardingSettings,
} from "src/cs/workbench/contrib/settings/settingsViewTypes";
import type { AnalysisSettings } from "src/cs/workbench/contrib/settings/settingsShared";
import { SettingsController, type SettingsControllerOptions } from "src/cs/workbench/contrib/settings/browser/settingsController";
import { BrowserSettingsService } from "src/cs/workbench/contrib/settings/browser/settingsService";

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
  mergeAnalysisSettings: (
    nextSettings: AnalysisSettings | null,
  ) => void;
  onboardingSettings: OnboardingSettings;
  t: LooseTranslateFn;
  theme: ThemeMode;
};

const SettingsViewPane = ({
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
}: SettingsViewPaneProps) => {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const controllerRef = useRef<SettingsController | null>(null);
  const controllerOptions: SettingsControllerOptions = {
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
  };

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return undefined;
    }

    const service = new BrowserSettingsService();
    const controller = new SettingsController(host, controllerOptions, service);
    controllerRef.current = controller;
    return () => {
      controllerRef.current = null;
      controller.dispose();
    };
  }, []);

  useLayoutEffect(() => {
    controllerRef.current?.update(controllerOptions);
  });

  return jsx("div", {
    ref: hostRef,
  });
};

export default SettingsViewPane;
