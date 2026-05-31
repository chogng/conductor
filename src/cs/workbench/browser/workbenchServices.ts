import { mainWindow } from "src/cs/base/browser/window";
import { InstantiationService } from "src/cs/platform/instantiation/common/instantiationService";
import { ServiceCollection } from "src/cs/platform/instantiation/common/serviceCollection";
import { Registry } from "src/cs/platform/registry/common/platform";
import { Extensions, type IWorkbenchContributionsRegistry } from "src/cs/workbench/common/contributions";
import { IWorkbenchEnvironmentService } from "src/cs/workbench/services/environment/common/environmentService";
import { ILifecycleService, LifecyclePhase, type ILifecycleService as ILifecycleServiceType } from "src/cs/workbench/services/lifecycle/common/lifecycle";

export interface IStartedWorkbenchServices {
  readonly instantiationService: InstantiationService;
  readonly lifecycleService: ILifecycleServiceType;
}

let startedServices: IStartedWorkbenchServices | undefined;

export function startWorkbenchServices(): IStartedWorkbenchServices {
  if (startedServices) {
    return startedServices;
  }

  const serviceCollection = new ServiceCollection();
  const instantiationService = new InstantiationService(serviceCollection);

  const lifecycleService = instantiationService.invokeFunction<ILifecycleServiceType>(accessor => {
    accessor.get(IWorkbenchEnvironmentService);
    return accessor.get(ILifecycleService);
  });

  const contributionsRegistry = Registry.as<IWorkbenchContributionsRegistry>(Extensions.Workbench);
  instantiationService.invokeFunction(accessor => contributionsRegistry.start(accessor));

  lifecycleService.phase = LifecyclePhase.Ready;
  mainWindow.setTimeout(() => {
    lifecycleService.phase = LifecyclePhase.Restored;
  }, 0);
  mainWindow.setTimeout(() => {
    lifecycleService.phase = LifecyclePhase.Eventually;
  }, 3000);

  startedServices = { instantiationService, lifecycleService };
  return startedServices;
}
