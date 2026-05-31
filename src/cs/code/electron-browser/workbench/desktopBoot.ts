import { ipcRenderer } from "src/cs/base/parts/sandbox/electron-browser/globals";
import {
  DEFAULT_LANGUAGE,
  DEFAULT_THEME,
  installNavigationModeListeners,
  isLanguageCode,
  isThemeMode,
  resolveBootProfileEnabled,
  type BootLogger,
} from "src/cs/code/browser/workbench/boot";
import { workbenchBootstrapIpcChannels } from "src/cs/code/common/workbenchBootstrapIpc";
import { getWorkbenchEnvironment } from "src/cs/workbench/services/environment/browser/environmentService";

const DEFAULT_SIDEBAR_WIDTH = 280;
const MIN_SIDEBAR_WIDTH = 200;
const MAX_SIDEBAR_WIDTH = 600;
const SIDEBAR_STORAGE_KEY = "da-sidebar-width";

const resolveInitialSettings = () => {
  const settings = window.conductor?.context?.configuration?.()?.initialWorkbenchSettings;
  return settings && typeof settings === "object" && !Array.isArray(settings)
    ? settings
    : null;
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
    // Storage can be unavailable in unusual webviews; the default width is good enough for boot.
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
  const timing = entry as PerformanceNavigationTiming;

  const summary = [
    `type=${timing.type}`,
    `redirect=${Math.round(timing.redirectEnd - timing.redirectStart)}ms`,
    `dns=${Math.round(timing.domainLookupEnd - timing.domainLookupStart)}ms`,
    `connect=${Math.round(timing.connectEnd - timing.connectStart)}ms`,
    `request=${Math.round(timing.responseStart - timing.requestStart)}ms`,
    `response=${Math.round(timing.responseEnd - timing.responseStart)}ms`,
    `domInteractive=${Math.round(timing.domInteractive)}ms`,
    `domContentLoaded=${Math.round(timing.domContentLoadedEventEnd - timing.startTime)}ms`,
    `load=${Math.round(timing.loadEventEnd - timing.startTime)}ms`,
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
    .filter((entry): entry is PerformanceResourceTiming => entry instanceof PerformanceResourceTiming)
    .sort((a, b) => b.duration - a.duration)
    .slice(0, 8);

  for (const entry of resources) {
    const name = String(entry.name || "").replace(/^https?:\/\/[^/]+/i, "");
    console.info(
      `[boot][renderer] resource ${Math.round(entry.duration)}ms ${entry.initiatorType || "other"} ${name}`,
    );
  }
};

const createBootUiReadyMarker = (logBoot: BootLogger) =>
  (source = "unknown") => {
    logBoot("boot-ui:ready", `(source=${source})`);
    logNavigationTiming();
    logTopResources();
    Promise.resolve(ipcRenderer.invoke(workbenchBootstrapIpcChannels.uiReady, {
      source,
    })).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      logBoot("boot-window:show-failed", `(message=${message})`);
    });
  };

const installEarlyErrorLogging = (logBoot: BootLogger) => {
  window.addEventListener("error", (event) => {
    const message = event.error instanceof Error ? event.error.message : event.message;
    const stack =
      event.error instanceof Error ? String(event.error.stack ?? "").slice(0, 1200) : "";
    logBoot("window:error:early", `(message=${message || "unknown"} stack=${stack})`);
  });

  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    const message = reason instanceof Error ? reason.message : String(reason);
    const stack = reason instanceof Error ? String(reason.stack ?? "").slice(0, 1200) : "";
    logBoot(
      "window:unhandledrejection:early",
      `(message=${message || "unknown"} stack=${stack})`,
    );
  });
};

const logInitialRenderDiagnostics = (logBoot: BootLogger) => {
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
};

export const startDesktopWorkbenchBoot = (logBoot: BootLogger) => {
  installNavigationModeListeners();

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
  window.__CONDUCTOR_BOOT_PROFILE_ENABLED__ = resolveBootProfileEnabled(
    getWorkbenchEnvironment()?.isDesktop === true,
  );
  window.__CONDUCTOR_BOOT_LOG__ = logBoot;
  window.__CONDUCTOR_BOOT_MARK_UI_READY__ = createBootUiReadyMarker(logBoot);

  installEarlyErrorLogging(logBoot);
  applyBootSidebarWidth();

  logBoot("bootstrap:script-evaluated", `(settings=${initialSettings ? "yes" : "no"})`);
  logBoot("theme:applied", `(theme=${initialTheme})`);
  logBoot("language:resolved", `(language=${initialLanguage})`);
  logInitialRenderDiagnostics(logBoot);
};
