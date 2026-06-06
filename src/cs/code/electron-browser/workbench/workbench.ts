import { ipcRenderer } from "src/cs/base/parts/sandbox/electron-browser/globals";
import { mainWindow } from "src/cs/base/browser/window";
import {
  isLanguagePreference,
  resolveLanguageCode,
  type LanguageCode,
} from "src/cs/platform/language/common/language";
import { createNLSConfiguration, setNLSConfiguration } from "src/cs/nls";
import { InstantiationService } from "src/cs/platform/instantiation/common/instantiationService";
import { ServiceCollection } from "src/cs/platform/instantiation/common/serviceCollection";
import { Registry } from "src/cs/platform/registry/common/platform";
import { setBaseLayerHoverDelegate } from "src/cs/base/browser/ui/hover/hoverDelegate";
import { IHoverService } from "src/cs/platform/hover/browser/hoverService";
import { workbenchBootstrapIpcChannels } from "src/cs/base/parts/sandbox/common/sandboxTypes";
import {
  Extensions,
  type IWorkbenchContributionsRegistry,
} from "src/cs/workbench/common/contributions";
import type { ThemeMode } from "src/cs/workbench/common/theme";
import { IWorkbenchEnvironmentService } from "src/cs/workbench/services/environment/common/environmentService";
import {
  ILifecycleService,
  LifecyclePhase,
  type ILifecycleService as ILifecycleServiceType,
} from "src/cs/workbench/services/lifecycle/common/lifecycle";
import { startWorkbenchThemeContribution } from "src/cs/workbench/services/themes/browser/theme.contribution";
import {
  applyWorkbenchAppearance,
  normalizeWorkbenchAppearance,
} from "src/cs/workbench/browser/appearance";
import { installWindowDeveloperKeybindings } from "src/cs/workbench/browser/actions/windowActions";
import { getStorageKey, StorageScope } from "src/cs/platform/storage/common/storage";
import { WorkbenchLayoutStorageKeys } from "src/cs/workbench/services/layout/browser/layoutConstants";

declare global {
  interface Window {
    __CONDUCTOR_BOOT_LOG__?: (stage: string, extra?: string) => void;
    __CONDUCTOR_BOOT_MARK_UI_READY__?: (source?: string) => void;
    __CONDUCTOR_BOOT_PROFILE_ENABLED__?: boolean;
    __CONDUCTOR_INITIAL_ANALYSIS_SETTINGS__?: Record<string, unknown> | null;
    __CONDUCTOR_INITIAL_LANGUAGE__?: LanguageCode;
    __CONDUCTOR_INITIAL_THEME__?: ThemeMode;
    __CONDUCTOR_NAV_MODE_INIT__?: boolean;
  }
}

type BootLogger = (stage: string, extra?: string) => void;

const DEFAULT_THEME: ThemeMode = "system";
const DEFAULT_SIDEBAR_WIDTH = 300;
const MIN_SIDEBAR_WIDTH = 170;
const MAX_SIDEBAR_WIDTH = Number.POSITIVE_INFINITY;
const SIDEBAR_STORAGE_KEY = getStorageKey(
  WorkbenchLayoutStorageKeys.sidebarWidth,
  StorageScope.PROFILE,
);

const getBootNowMs = () =>
  typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();

const createBootLogger = (
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

const isThemeMode = (value: unknown): value is ThemeMode =>
  value === "light" || value === "dark" || value === "system";

const resolveBootProfileEnabled = () => {
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

const installNavigationModeListeners = () => {
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
    if (window.__CONDUCTOR_BOOT_PROFILE_ENABLED__) {
      logNavigationTiming();
      logTopResources();
    }
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

const prepareWorkbench = (logBoot: BootLogger, isBootProfileEnabled: boolean) => {
  installNavigationModeListeners();
  installWindowDeveloperKeybindings();

  const initialSettings = resolveInitialSettings();
  const languagePreference = isLanguagePreference(initialSettings?.language)
    ? initialSettings.language
    : "system";
  const initialLanguage = resolveLanguageCode(
    languagePreference,
    navigator.language,
  );
  const initialTheme = isThemeMode(initialSettings?.theme)
    ? initialSettings.theme
    : DEFAULT_THEME;

  window.__CONDUCTOR_INITIAL_ANALYSIS_SETTINGS__ = initialSettings;
  applyWorkbenchAppearance(normalizeWorkbenchAppearance(initialSettings));
  window.__CONDUCTOR_INITIAL_LANGUAGE__ = initialLanguage;
  setNLSConfiguration(createNLSConfiguration(initialLanguage));
  document.documentElement.setAttribute(
    "lang",
    initialLanguage === "zh" ? "zh-CN" : "en",
  );
  window.__CONDUCTOR_INITIAL_THEME__ = initialTheme;
  window.__CONDUCTOR_BOOT_PROFILE_ENABLED__ = isBootProfileEnabled;
  window.__CONDUCTOR_BOOT_LOG__ = logBoot;
  window.__CONDUCTOR_BOOT_MARK_UI_READY__ = createBootUiReadyMarker(logBoot);

  installEarlyErrorLogging(logBoot);
  applyBootSidebarWidth();

  logBoot("bootstrap:script-evaluated", `(settings=${initialSettings ? "yes" : "no"})`);
  logBoot("theme:applied", `(theme=${initialTheme})`);
  logBoot(
    "language:resolved",
    `(language=${initialLanguage} preference=${languagePreference})`,
  );
  logInitialRenderDiagnostics(logBoot);
};

function startWorkbench(): void {
  const serviceCollection = new ServiceCollection();
  const instantiationService = new InstantiationService(serviceCollection);
  const lifecycleService = instantiationService.invokeFunction<ILifecycleServiceType>(
    accessor => {
      accessor.get(IWorkbenchEnvironmentService);
      setBaseLayerHoverDelegate(accessor.get(IHoverService));
      return accessor.get(ILifecycleService);
    },
  );

  const contributionsRegistry =
    Registry.as<IWorkbenchContributionsRegistry>(Extensions.Workbench);
  instantiationService.invokeFunction(accessor => contributionsRegistry.start(accessor));

  lifecycleService.phase = LifecyclePhase.Ready;
  mainWindow.setTimeout(() => {
    lifecycleService.phase = LifecyclePhase.Restored;
  }, 0);
  mainWindow.setTimeout(() => {
    lifecycleService.phase = LifecyclePhase.Eventually;
  }, 3000);
}

const startMs = getBootNowMs();
const isBootProfileEnabled = resolveBootProfileEnabled();
const logBoot = createBootLogger("renderer", startMs, () => isBootProfileEnabled);

const bootstrapWorkbench = async (): Promise<void> => {
  prepareWorkbench(logBoot, isBootProfileEnabled);
  await import("src/cs/workbench/workbench.desktop.main.ts");
  startWorkbench();
  startWorkbenchThemeContribution();
};

void bootstrapWorkbench();
