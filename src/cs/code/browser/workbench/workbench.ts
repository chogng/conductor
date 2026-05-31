import "src/cs/workbench/services/lifecycle/browser/lifecycleService";

import { mainWindow } from "src/cs/base/browser/window";
import { InstantiationService } from "src/cs/platform/instantiation/common/instantiationService";
import { ServiceCollection } from "src/cs/platform/instantiation/common/serviceCollection";
import { Registry } from "src/cs/platform/registry/common/platform";
import {
  createBootLogger,
  DEFAULT_LANGUAGE,
  DEFAULT_THEME,
  getBootNowMs,
  installNavigationModeListeners,
  type BootLogger,
  resolveBootProfileEnabled,
} from "src/cs/code/browser/workbench/boot";
import {
  Extensions,
  type IWorkbenchContributionsRegistry,
} from "src/cs/workbench/common/contributions";
import {
  ILifecycleService,
  LifecyclePhase,
  type ILifecycleService as ILifecycleServiceType,
} from "src/cs/workbench/services/lifecycle/common/lifecycle";

function startBrowserWorkbenchBoot(
  logBoot: BootLogger,
  isBootProfileEnabled: boolean,
): void {
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
}

function startWorkbench(): void {
  const serviceCollection = new ServiceCollection();
  const instantiationService = new InstantiationService(serviceCollection);
  const lifecycleService = instantiationService.invokeFunction<ILifecycleServiceType>(
    accessor => accessor.get(ILifecycleService),
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
const logBoot = createBootLogger("browser", startMs, () => isBootProfileEnabled);

startBrowserWorkbenchBoot(logBoot, isBootProfileEnabled);
startWorkbench();
