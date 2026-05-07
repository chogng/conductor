// @ts-nocheck
import {
  installSplashContribution,
  removeSplashContribution,
} from "../../../workbench/contrib/splash/electron-sandbox/splash.contribution";

const DEFAULT_LANGUAGE = "zh";
const DEFAULT_THEME = "system";
const DEFAULT_SIDEBAR_WIDTH = 280;
const MIN_SIDEBAR_WIDTH = 200;
const MAX_SIDEBAR_WIDTH = 600;
const SIDEBAR_STORAGE_KEY = "da-sidebar-width";
const startMs =
  typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();

const logBoot = (stage, extra = "") => {
  const nowMs =
    typeof performance !== "undefined" && typeof performance.now === "function"
      ? performance.now()
      : Date.now();
  const elapsedMs = Math.round(nowMs - startMs);
  const suffix = extra ? ` ${extra}` : "";
  console.info(`[boot][renderer] +${elapsedMs}ms ${stage}${suffix}`);
};

installSplashContribution();

const isLanguageCode = (value) => value === "en" || value === "zh";

const isThemeMode = (value) =>
  value === "light" || value === "dark" || value === "system";

const resolveBootProfileEnabled = () => {
  if (window.desktopMeta && window.desktopMeta.isDesktop === true) {
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
    // Ignore query parsing failures.
  }

  try {
    return window.localStorage?.getItem("conductor.bootProfile") === "1";
  } catch {
    return false;
  }
};

const applyBootSidebarWidth = () => {
  let width = DEFAULT_SIDEBAR_WIDTH;

  try {
    const raw = window.localStorage?.getItem(SIDEBAR_STORAGE_KEY);
    const parsed = Number.parseInt(String(raw ?? ""), 10);
    if (
      Number.isFinite(parsed) &&
      parsed >= MIN_SIDEBAR_WIDTH &&
      parsed <= MAX_SIDEBAR_WIDTH
    ) {
      width = parsed;
    }
  } catch {
    // Ignore storage failures.
  }

  document.documentElement.style.setProperty("--boot-sidebar-width", `${width}px`);
};

const logNavigationTiming = () => {
  if (
    typeof performance === "undefined" ||
    typeof performance.getEntriesByType !== "function"
  ) {
    return;
  }

  const entry = performance.getEntriesByType("navigation")[0];
  if (!entry || !("redirectEnd" in entry)) return;

  const summary = [
    `type=${entry.type}`,
    `redirect=${Math.round(entry.redirectEnd - entry.redirectStart)}ms`,
    `dns=${Math.round(entry.domainLookupEnd - entry.domainLookupStart)}ms`,
    `connect=${Math.round(entry.connectEnd - entry.connectStart)}ms`,
    `request=${Math.round(entry.responseStart - entry.requestStart)}ms`,
    `response=${Math.round(entry.responseEnd - entry.responseStart)}ms`,
    `domInteractive=${Math.round(entry.domInteractive)}ms`,
    `domContentLoaded=${Math.round(entry.domContentLoadedEventEnd - entry.startTime)}ms`,
    `load=${Math.round(entry.loadEventEnd - entry.startTime)}ms`,
  ].join(" ");

  console.info(`[boot][renderer] nav ${summary}`);
};

const logTopResources = () => {
  if (
    typeof performance === "undefined" ||
    typeof performance.getEntriesByType !== "function"
  ) {
    return;
  }

  const resources = performance
    .getEntriesByType("resource")
    .filter((entry) => entry instanceof PerformanceResourceTiming)
    .sort((a, b) => b.duration - a.duration)
    .slice(0, 8);

  for (const entry of resources) {
    const name = String(entry.name || "").replace(/^https?:\/\/[^/]+/i, "");
    console.info(
      `[boot][renderer] resource ${Math.round(entry.duration)}ms ${entry.initiatorType || "other"} ${name}`,
    );
  }
};

const markBootUiReady = (source = "unknown") => {
  removeSplashContribution();
  logBoot("boot-ui:ready", `(source=${source})`);
  logNavigationTiming();
  logTopResources();
  if (!window.desktopBoot || typeof window.desktopBoot.markUiReady !== "function") {
    return;
  }

  Promise.resolve(window.desktopBoot.markUiReady(source)).catch((error) => {
    const message = error && error.message ? error.message : String(error);
    logBoot("boot-window:show-failed", `(message=${message})`);
  });
};

const resolveInitialSettings = () => {
  const settings = window.desktopBootstrap?.initialDeviceAnalysisSettings;
  return settings && typeof settings === "object" && !Array.isArray(settings)
    ? settings
    : null;
};

if (!window.__CONDUCTOR_NAV_MODE_INIT__) {
  window.__CONDUCTOR_NAV_MODE_INIT__ = true;

  const root = document.documentElement;
  const setMode = (mode) => {
    if (!root) return;
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
}

const initialSettings = resolveInitialSettings();
const initialLanguage = isLanguageCode(initialSettings?.language)
  ? initialSettings.language
  : DEFAULT_LANGUAGE;
const initialTheme = isThemeMode(initialSettings?.theme)
  ? initialSettings.theme
  : DEFAULT_THEME;

window.__CONDUCTOR_INITIAL_DEVICE_ANALYSIS_SETTINGS__ = initialSettings;
window.__CONDUCTOR_INITIAL_LANGUAGE__ = initialLanguage;
window.__CONDUCTOR_INITIAL_THEME__ = initialTheme;
window.__CONDUCTOR_BOOT_PROFILE_ENABLED__ = resolveBootProfileEnabled();
window.__CONDUCTOR_BOOT_LOG__ = logBoot;
window.__CONDUCTOR_BOOT_MARK_UI_READY__ = markBootUiReady;

window.addEventListener("error", (event) => {
  const message = event.error && event.error.message ? event.error.message : event.message;
  const stack =
    event.error && event.error.stack ? String(event.error.stack).slice(0, 1200) : "";
  logBoot("window:error:early", `(message=${message || "unknown"} stack=${stack})`);
});

window.addEventListener("unhandledrejection", (event) => {
  const reason = event.reason;
  const message = reason && reason.message ? reason.message : String(reason);
  const stack = reason && reason.stack ? String(reason.stack).slice(0, 1200) : "";
  logBoot(
    "window:unhandledrejection:early",
    `(message=${message || "unknown"} stack=${stack})`,
  );
});

applyBootSidebarWidth();

logBoot("bootstrap:script-evaluated", `(settings=${initialSettings ? "yes" : "no"})`);
logBoot("theme:applied", `(theme=${initialTheme})`);
logBoot("language:resolved", `(language=${initialLanguage})`);

window.requestAnimationFrame(() => {
  const root = document.getElementById("root");
  logBoot(
    "raf:1",
    `(rootChildren=${root?.childElementCount ?? 0} textLength=${(root?.textContent ?? "").length})`,
  );
});

window.requestAnimationFrame(() => {
  const root = document.getElementById("root");
  const rect = root?.getBoundingClientRect();
  logBoot(
    "raf:2",
    `(rootChildren=${root?.childElementCount ?? 0} textLength=${(root?.textContent ?? "").length} rootRect=${Math.round(rect?.width ?? 0)}x${Math.round(rect?.height ?? 0)})`,
  );
});

window.setTimeout(() => {
  const root = document.getElementById("root");
  const rect = root?.getBoundingClientRect();
  logBoot(
    "timeout:1000",
    `(rootChildren=${root?.childElementCount ?? 0} textLength=${(root?.textContent ?? "").length} rootRect=${Math.round(rect?.width ?? 0)}x${Math.round(rect?.height ?? 0)})`,
  );
}, 1000);
