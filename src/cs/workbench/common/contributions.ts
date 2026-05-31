import { Disposable, DisposableStore, isDisposable } from "src/cs/base/common/lifecycle";
import type { IInstantiationService, ServicesAccessor } from "src/cs/platform/instantiation/common/instantiation";
import { IInstantiationService as IInstantiationServiceId } from "src/cs/platform/instantiation/common/instantiation";
import { Registry } from "src/cs/platform/registry/common/platform";
import { ILifecycleService, LifecyclePhase, type ILifecycleService as ILifecycleServiceType } from "src/cs/workbench/services/lifecycle/common/lifecycle";

export interface IWorkbenchContribution {}

export namespace Extensions {
  export const Workbench = "workbench.contributions.kind";
}

export const enum WorkbenchPhase {
  BlockStartup = LifecyclePhase.Starting,
  BlockRestore = LifecyclePhase.Ready,
  AfterRestored = LifecyclePhase.Restored,
  Eventually = LifecyclePhase.Eventually,
}

export interface ILazyWorkbenchContributionInstantiation {
  readonly lazy: true;
}

export type WorkbenchContributionInstantiation = WorkbenchPhase | ILazyWorkbenchContributionInstantiation;

interface IWorkbenchContributionRegistration {
  readonly id: string | undefined;
  readonly ctor: new (...args: unknown[]) => IWorkbenchContribution;
}

export interface IWorkbenchContributionsRegistry {
  readonly whenRestored: Promise<void>;
  readonly timings: Map<LifecyclePhase, Array<[string, number]>>;
  registerWorkbenchContribution(ctor: new (...args: unknown[]) => IWorkbenchContribution, phase: LifecyclePhase.Restored | LifecyclePhase.Eventually): void;
  registerWorkbenchContribution2(id: string | undefined, ctor: new (...args: unknown[]) => IWorkbenchContribution, instantiation: WorkbenchContributionInstantiation): void;
  getWorkbenchContribution<T extends IWorkbenchContribution>(id: string): T;
  start(accessor: ServicesAccessor): void;
}

function toLifecyclePhase(instantiation: WorkbenchPhase): LifecyclePhase {
  return instantiation as unknown as LifecyclePhase;
}

class WorkbenchContributionsRegistry extends Disposable implements IWorkbenchContributionsRegistry {
  public static readonly INSTANCE = new WorkbenchContributionsRegistry();

  private instantiationService: IInstantiationService | undefined;
  private lifecycleService: ILifecycleServiceType | undefined;
  private readonly contributionsByPhase = new Map<LifecyclePhase, IWorkbenchContributionRegistration[]>();
  private readonly contributionsById = new Map<string, IWorkbenchContributionRegistration>();
  private readonly instancesById = new Map<string, IWorkbenchContribution>();
  private readonly instanceDisposables = this._register(new DisposableStore());
  private readonly timingsByPhase = new Map<LifecyclePhase, Array<[string, number]>>();
  private restoredResolve: (() => void) | undefined;

  public readonly whenRestored = new Promise<void>(resolve => {
    this.restoredResolve = resolve;
  });

  public get timings(): Map<LifecyclePhase, Array<[string, number]>> {
    return this.timingsByPhase;
  }

  public registerWorkbenchContribution(ctor: new (...args: unknown[]) => IWorkbenchContribution, phase: LifecyclePhase.Restored | LifecyclePhase.Eventually): void {
    this.registerWorkbenchContribution2(undefined, ctor, phase as unknown as WorkbenchPhase);
  }

  public registerWorkbenchContribution2(id: string | undefined, ctor: new (...args: unknown[]) => IWorkbenchContribution, instantiation: WorkbenchContributionInstantiation): void {
    const contribution: IWorkbenchContributionRegistration = { id, ctor };

    if (typeof id === "string") {
      if (this.contributionsById.has(id) || this.instancesById.has(id)) {
        console.error(`Workbench contribution '${id}' is already registered.`);
        return;
      }

      this.contributionsById.set(id, contribution);
    }

    if (typeof instantiation !== "number") {
      return;
    }

    const phase = toLifecyclePhase(instantiation);

    if (this.instantiationService && this.lifecycleService && this.lifecycleService.phase >= phase) {
      this.safeCreateContribution(contribution, phase);
      return;
    }

    const registrations = this.contributionsByPhase.get(phase) ?? [];
    registrations.push(contribution);
    this.contributionsByPhase.set(phase, registrations);
  }

  public getWorkbenchContribution<T extends IWorkbenchContribution>(id: string): T {
    const existing = this.instancesById.get(id);
    if (existing) {
      return existing as T;
    }

    const registration = this.contributionsById.get(id);
    if (!registration) {
      throw new Error(`Workbench contribution '${id}' is unknown.`);
    }

    this.safeCreateContribution(registration, this.lifecycleService?.phase ?? LifecyclePhase.Starting);

    const instance = this.instancesById.get(id);
    if (!instance) {
      throw new Error(`Workbench contribution '${id}' failed to instantiate.`);
    }

    return instance as T;
  }

  public start(accessor: ServicesAccessor): void {
    this.instantiationService = accessor.get(IInstantiationServiceId);
    this.lifecycleService = accessor.get(ILifecycleService);

    this._register(this.lifecycleService.onDidShutdown(() => this.instanceDisposables.clear()));

    for (const phase of [LifecyclePhase.Starting, LifecyclePhase.Ready, LifecyclePhase.Restored, LifecyclePhase.Eventually]) {
      this.instantiateByPhase(phase);
    }
  }

  private instantiateByPhase(phase: LifecyclePhase): void {
    const lifecycleService = this.lifecycleService;
    if (!lifecycleService) {
      return;
    }

    if (lifecycleService.phase >= phase) {
      this.doInstantiateByPhase(phase);
      return;
    }

    lifecycleService.when(phase).then(() => this.doInstantiateByPhase(phase));
  }

  private doInstantiateByPhase(phase: LifecyclePhase): void {
    const contributions = this.contributionsByPhase.get(phase);
    if (!contributions) {
      if (phase === LifecyclePhase.Restored) {
        this.restoredResolve?.();
      }
      return;
    }

    this.contributionsByPhase.delete(phase);

    for (const contribution of contributions) {
      this.safeCreateContribution(contribution, phase);
    }

    if (phase === LifecyclePhase.Restored) {
      this.restoredResolve?.();
    }
  }

  private safeCreateContribution(contribution: IWorkbenchContributionRegistration, phase: LifecyclePhase): void {
    if (typeof contribution.id === "string" && this.instancesById.has(contribution.id)) {
      return;
    }

    if (!this.instantiationService) {
      throw new Error("Workbench contributions registry has not been started.");
    }

    const startTime = Date.now();

    try {
      const instance = this.instantiationService.createInstance(contribution.ctor);
      if (typeof contribution.id === "string") {
        this.instancesById.set(contribution.id, instance);
        this.contributionsById.delete(contribution.id);
      }

      if (isDisposable(instance)) {
        this.instanceDisposables.add(instance);
      }
    }
    catch (error) {
      console.error(`Unable to create workbench contribution '${contribution.id ?? contribution.ctor.name}'.`, error);
    }
    finally {
      if (typeof contribution.id === "string") {
        const timings = this.timingsByPhase.get(phase) ?? [];
        timings.push([contribution.id, Date.now() - startTime]);
        this.timingsByPhase.set(phase, timings);
      }
    }
  }
}

export const registerWorkbenchContribution2 = WorkbenchContributionsRegistry.INSTANCE.registerWorkbenchContribution2.bind(WorkbenchContributionsRegistry.INSTANCE) as {
  (id: string, ctor: new (...args: unknown[]) => IWorkbenchContribution, instantiation: WorkbenchContributionInstantiation): void;
};

export const getWorkbenchContribution = WorkbenchContributionsRegistry.INSTANCE.getWorkbenchContribution.bind(WorkbenchContributionsRegistry.INSTANCE);

Registry.add(Extensions.Workbench, WorkbenchContributionsRegistry.INSTANCE);
