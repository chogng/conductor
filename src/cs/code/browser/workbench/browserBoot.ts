import {
  DEFAULT_LANGUAGE,
  DEFAULT_THEME,
  installNavigationModeListeners,
  type BootLogger,
} from "src/cs/code/browser/workbench/boot";

export const startBrowserWorkbenchBoot = (
  logBoot: BootLogger,
  isBootProfileEnabled: boolean,
) => {
  // Browser workbench defaults are intentionally local and lightweight.
  // Desktop-specific initial settings are provided by code/electron-browser/workbench.
  window.__CONDUCTOR_INITIAL_LANGUAGE__ = DEFAULT_LANGUAGE;
  window.__CONDUCTOR_INITIAL_THEME__ = DEFAULT_THEME;
  window.__CONDUCTOR_BOOT_PROFILE_ENABLED__ = isBootProfileEnabled;
  window.__CONDUCTOR_BOOT_LOG__ = logBoot;
  window.__CONDUCTOR_BOOT_MARK_UI_READY__ = (source = "browser") => {
    logBoot("boot-ui:ready", `(source=${source})`);
  };

  installNavigationModeListeners();

  logBoot("bootstrap:script-evaluated");
  logBoot("language:resolved", `(language=${DEFAULT_LANGUAGE})`);
  logBoot("theme:applied", `(theme=${DEFAULT_THEME})`);
};
