import type { LanguageCode } from "src/cs/platform/language/common/language";
import type { ThemeMode } from "src/cs/workbench/common/theme";

declare global {
  interface Window {
    __CONDUCTOR_BOOT_LOG__?: (stage: string, extra?: string) => void;
    __CONDUCTOR_BOOT_MARK_UI_READY__?: (source?: string) => void;
    __CONDUCTOR_BOOT_PROFILE_ENABLED__?: boolean;
    __CONDUCTOR_INITIAL_DEVICE_ANALYSIS_SETTINGS__?: Record<string, unknown> | null;
    __CONDUCTOR_INITIAL_LANGUAGE__?: LanguageCode;
    __CONDUCTOR_INITIAL_THEME__?: ThemeMode;
    __CONDUCTOR_NAV_MODE_INIT__?: boolean;
  }
}

export const DEFAULT_LANGUAGE: LanguageCode = "zh";
export const DEFAULT_THEME: ThemeMode = "system";

export type BootLogger = (stage: string, extra?: string) => void;

export const getBootNowMs = () =>
  typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();

export const createBootLogger = (
  label: string,
  startMs: number,
  shouldLog: () => boolean = () => true,
): BootLogger =>
  (stage: string, extra = "") => {
    if (!shouldLog()) return;

    const elapsedMs = Math.round(getBootNowMs() - startMs);
    const suffix = extra ? ` ${extra}` : "";
    console.info(`[boot][${label}] +${elapsedMs}ms ${stage}${suffix}`);
  };

export const resolveBootProfileEnabled = (forceEnabled = false) => {
  if (forceEnabled) {
    return true;
  }

  try {
    const params = new URLSearchParams(window.location.search);
    const searchValue = params.get("bootProfile");
    if (searchValue === "1" || searchValue === "true") {
      window.localStorage?.setItem("conductor.bootProfile", "1");
      return true;
    }
    if (searchValue === "0" || searchValue === "false") {
      window.localStorage?.removeItem("conductor.bootProfile");
      return false;
    }
  } catch {
    // Boot profiling is optional; query/storage failures should not block startup.
  }

  try {
    return window.localStorage?.getItem("conductor.bootProfile") === "1";
  } catch {
    return false;
  }
};

export const installNavigationModeListeners = () => {
  if (window.__CONDUCTOR_NAV_MODE_INIT__) {
    return;
  }

  window.__CONDUCTOR_NAV_MODE_INIT__ = true;

  const root = document.documentElement;
  const setMode = (mode: "keyboard" | "pointer") => {
    root.dataset.nav = mode;
  };

  window.addEventListener(
    "keydown",
    (event) => {
      if (event.key === "Tab") setMode("keyboard");
    },
    true,
  );

  window.addEventListener(
    "pointerdown",
    () => {
      setMode("pointer");
    },
    true,
  );
};

export const isLanguageCode = (value: unknown): value is LanguageCode =>
  value === "en" || value === "zh";

export const isThemeMode = (value: unknown): value is ThemeMode =>
  value === "light" || value === "dark" || value === "system";
