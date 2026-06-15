import { mainWindow } from "src/cs/base/browser/window";
import { DisposableStore } from "src/cs/base/common/lifecycle";
import { InstantiationService } from "src/cs/platform/instantiation/common/instantiationService";
import { ServiceCollection } from "src/cs/platform/instantiation/common/serviceCollection";
import { Registry } from "src/cs/platform/registry/common/platform";
import { IFileService } from "src/cs/platform/files/common/files";
import { HTMLFileSystemProvider } from "src/cs/platform/files/browser/htmlFileSystemProvider";
import { setBaseLayerHoverDelegate } from "src/cs/base/browser/ui/hover/hoverDelegate";
import { IHoverService } from "src/cs/platform/hover/browser/hoverService";
import {
  resolveLanguageCode,
  type LanguageCode,
} from "src/cs/base/common/platform";
import { createNLSConfiguration, setNLSConfiguration } from "src/cs/nls";
import type { ThemeMode } from "src/cs/workbench/common/theme";
import {
  Extensions,
  type IWorkbenchContributionsRegistry,
} from "src/cs/workbench/common/contributions";
import {
  ILifecycleService,
  LifecyclePhase,
  type ILifecycleService as ILifecycleServiceType,
} from "src/cs/workbench/services/lifecycle/common/lifecycle";
import { normalizeWorkbenchAppearance } from "src/cs/workbench/services/themes/common/themeService";
import {
  applyWorkbenchAppearance,
} from "src/cs/workbench/services/themes/browser/themeService";

declare global {
  interface Window {
    __CONDUCTOR_BOOT_LOG__?: (stage: string, extra?: string) => void;
    __CONDUCTOR_BOOT_MARK_UI_READY__?: (source?: string) => void;
    __CONDUCTOR_BOOT_PROFILE_ENABLED__?: boolean;
    __CONDUCTOR_INITIAL_LANGUAGE__?: LanguageCode;
    __CONDUCTOR_INITIAL_THEME__?: ThemeMode;
    __CONDUCTOR_NAV_MODE_INIT__?: boolean;
  }
}

const DEFAULT_THEME: ThemeMode = "system";

type BootLogger = (stage: string, extra?: string) => void;

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

function startBrowserWorkbenchBoot(
  logBoot: BootLogger,
  isBootProfileEnabled: boolean,
): void {
  const initialLanguage = resolveLanguageCode("system", navigator.language);
  window.__CONDUCTOR_INITIAL_LANGUAGE__ = initialLanguage;
  applyWorkbenchAppearance(normalizeWorkbenchAppearance(null));
  setNLSConfiguration(createNLSConfiguration(initialLanguage));
  document.documentElement.setAttribute(
    "lang",
    initialLanguage === "zh" ? "zh-CN" : "en",
  );
  window.__CONDUCTOR_INITIAL_THEME__ = DEFAULT_THEME;
  window.__CONDUCTOR_BOOT_PROFILE_ENABLED__ = isBootProfileEnabled;
  window.__CONDUCTOR_BOOT_LOG__ = logBoot;
  window.__CONDUCTOR_BOOT_MARK_UI_READY__ = (source = "browser") => {
    logBoot("boot-ui:ready", `(source=${source})`);
  };

  installNavigationModeListeners();

  logBoot("bootstrap:script-evaluated");
  logBoot("language:resolved", `(language=${initialLanguage} preference=system)`);
  logBoot("theme:applied", `(theme=${DEFAULT_THEME})`);
}

function startWorkbench(): void {
  const serviceCollection = new ServiceCollection();
  const instantiationService = new InstantiationService(serviceCollection);
  const fileSystemProviderStore = new DisposableStore();
  const lifecycleService = instantiationService.invokeFunction<ILifecycleServiceType>(
    accessor => accessor.get(ILifecycleService),
  );
  fileSystemProviderStore.add(lifecycleService.onDidShutdown(() => fileSystemProviderStore.dispose()));
  instantiationService.invokeFunction(accessor => {
    setBaseLayerHoverDelegate(accessor.get(IHoverService));
    const filesService = accessor.get(IFileService);
    fileSystemProviderStore.add(
      filesService.registerProvider("file", fileSystemProviderStore.add(new HTMLFileSystemProvider())),
    );
  });

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
const logBoot = createBootLogger("browser", startMs, () => isBootProfileEnabled);

const bootstrapWorkbench = async (): Promise<void> => {
  startBrowserWorkbenchBoot(logBoot, isBootProfileEnabled);
  await import("src/cs/workbench/workbench.web.main.ts");
  startWorkbench();
};

void bootstrapWorkbench();
