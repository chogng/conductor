import "../../../workbench/contrib/splash/electron-sandbox/splash.contribution";
import "src/cs/platform/contextkey/browser/contextKeyService";
import "src/cs/workbench/services/contextmenu/electron-browser/contextmenuService";
import { InstantiationService } from "src/cs/platform/instantiation/common/instantiationService";
import { ServiceCollection } from "src/cs/platform/instantiation/common/serviceCollection";
import { Registry } from "src/cs/platform/registry/common/platform";
import { Extensions, type IWorkbenchContributionsRegistry } from "src/cs/workbench/common/contributions";
import { ILifecycleService, LifecyclePhase, LifecycleService } from "src/cs/workbench/services/lifecycle/common/lifecycle";
import type { LanguageCode } from "src/cs/platform/language/common/language";
import type { ThemeMode } from "src/cs/workbench/common/theme";

declare global {
  interface Window {
    desktopBootstrap?: {
      initialDeviceAnalysisSettings?: Record<string, unknown> | null;
      [key: string]: unknown;
    };
    desktopMeta?: {
      isDesktop?: boolean;
      platform?: string;
      isPackaged?: boolean;
      appVersion?: string | null;
      [key: string]: unknown;
    };
    __CONDUCTOR_BOOT_LOG__?: (stage: string, extra?: string) => void;
    __CONDUCTOR_BOOT_MARK_UI_READY__?: (source?: string) => void;
    __CONDUCTOR_BOOT_PROFILE_ENABLED__?: boolean;
    __CONDUCTOR_INITIAL_DEVICE_ANALYSIS_SETTINGS__?: Record<string, unknown> | null;
    __CONDUCTOR_INITIAL_LANGUAGE__?: LanguageCode;
    __CONDUCTOR_INITIAL_THEME__?: ThemeMode;
    __CONDUCTOR_NAV_MODE_INIT__?: boolean;
  }
}

const DEFAULT_LANGUAGE: LanguageCode = "zh";
const DEFAULT_THEME: ThemeMode = "system";
const DEFAULT_SIDEBAR_WIDTH = 280;
const MIN_SIDEBAR_WIDTH = 200;
const MAX_SIDEBAR_WIDTH = 600;
const SIDEBAR_STORAGE_KEY = "da-sidebar-width";
const startMs = typeof performance !== "undefined" && typeof performance.now === "function"
  ? performance.now()
  : Date.now();

const getBootNowMs = () =>
  typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();

const logBoot = (stage: string, extra = "") => {
  const elapsedMs = Math.round(getBootNowMs() - startMs);
  const suffix = extra ? ` ${extra}` : "";
  console.info(`[boot][renderer] +${elapsedMs}ms ${stage}${suffix}`);
};

const lifecycleService = new LifecycleService();
const serviceCollection = new ServiceCollection([ILifecycleService, lifecycleService]);
const instantiationService = new InstantiationService(serviceCollection);

const contributionsRegistry = Registry.as<IWorkbenchContributionsRegistry>(Extensions.Workbench);
instantiationService.invokeFunction(accessor => contributionsRegistry.start(accessor));
lifecycleService.setPhase(LifecyclePhase.Ready);
window.setTimeout(() => lifecycleService.setPhase(LifecyclePhase.Restored), 0);
window.setTimeout(() => lifecycleService.setPhase(LifecyclePhase.Eventually), 3000);

const isLanguageCode = (value: unknown): value is LanguageCode =>
  value === "en" || value === "zh";

const isThemeMode = (value: unknown): value is ThemeMode =>
  value === "light" || value === "dark" || value === "system";

const resolveBootProfileEnabled = () => {
  if (window.desktopMeta?.isDesktop === true) {
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
    // Query/local storage failures should not block desktop startup.
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

// Main process keeps the window hidden during boot; this callback releases that gate.
const markBootUiReady = (source = "unknown") => {
  lifecycleService.shutdown();
  logBoot("boot-ui:ready", `(source=${source})`);
  logNavigationTiming();
  logTopResources();
  if (typeof window.desktopBoot?.markUiReady !== "function") {
    return;
  }

  Promise.resolve(window.desktopBoot.markUiReady(source)).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
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
