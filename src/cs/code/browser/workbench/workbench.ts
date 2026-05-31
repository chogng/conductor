import "src/cs/workbench/services/lifecycle/browser/lifecycleService";

import { mainWindow } from "src/cs/base/browser/window";
import { InstantiationService } from "src/cs/platform/instantiation/common/instantiationService";
import { ServiceCollection } from "src/cs/platform/instantiation/common/serviceCollection";
import { Registry } from "src/cs/platform/registry/common/platform";
import { startBrowserWorkbenchBoot } from "src/cs/code/browser/workbench/browserBoot";
import {
  createBootLogger,
  getBootNowMs,
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

startWorkbench();
startBrowserWorkbenchBoot(logBoot, isBootProfileEnabled);
