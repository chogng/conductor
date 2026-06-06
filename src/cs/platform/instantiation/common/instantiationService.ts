import { DisposableStore, isDisposable, type IDisposable } from "src/cs/base/common/lifecycle";
import { SyncDescriptor } from "src/cs/platform/instantiation/common/descriptors";
import { registerSingletonServiceDescriptors } from "src/cs/platform/instantiation/common/extensions";
import {
  IInstantiationService,
  type ServiceIdentifier,
  type ServicesAccessor,
  _util,
} from "src/cs/platform/instantiation/common/instantiation";
import { ServiceCollection } from "src/cs/platform/instantiation/common/serviceCollection";

export class InstantiationService implements IInstantiationService, IDisposable {
  public declare readonly _serviceBrand: undefined;

  private readonly servicesToDispose = new Set<unknown>();
  private readonly children = new Set<InstantiationService>();
  private disposed = false;

  constructor(
    private readonly services = new ServiceCollection(),
    private readonly strict = false,
    private readonly parent?: InstantiationService,
  ) {
    if (!parent) {
      registerSingletonServiceDescriptors(this.services);
    }

    this.services.set(IInstantiationService, this);
  }

  public createChild(services: ServiceCollection, store?: DisposableStore): IInstantiationService {
    this.throwIfDisposed();

    const child = new InstantiationService(services, this.strict, this);
    this.children.add(child);
    store?.add(child);

    return child;
  }

  public invokeFunction<R, TS extends unknown[] = []>(fn: (accessor: ServicesAccessor, ...args: TS) => R, ...args: TS): R {
    this.throwIfDisposed();

    let isDone = false;
    const accessor: ServicesAccessor = {
      get: <T>(id: ServiceIdentifier<T>): T => {
        if (isDone) {
          throw new Error("Service accessor is only valid during invocation.");
        }

        return this.getOrCreateServiceInstance(id);
      },
    };

    try {
      return fn(accessor, ...args);
    }
    finally {
      isDone = true;
    }
  }

  public createInstance<T>(descriptor: SyncDescriptor<T>): T;
  public createInstance<T>(ctor: new (...args: any[]) => T, ...args: unknown[]): T;
  public createInstance<T>(ctorOrDescriptor: SyncDescriptor<T> | (new (...args: unknown[]) => T), ...args: unknown[]): T {
    this.throwIfDisposed();

    if (ctorOrDescriptor instanceof SyncDescriptor) {
      return this.createInstanceFromConstructor(ctorOrDescriptor.ctor, ctorOrDescriptor.staticArguments.concat(args));
    }

    return this.createInstanceFromConstructor(ctorOrDescriptor, args);
  }

  public dispose(): void {
    if (this.disposed) {
      return;
    }

    this.disposed = true;

    for (const child of this.children) {
      child.dispose();
    }
    this.children.clear();

    for (const service of this.servicesToDispose) {
      if (isDisposable(service)) {
        service.dispose();
      }
    }
    this.servicesToDispose.clear();
  }

  private createInstanceFromConstructor<T>(ctor: new (...args: unknown[]) => T, args: unknown[]): T {
    const serviceDependencies = _util.getServiceDependencies(ctor).sort((a, b) => a.index - b.index);
    const firstServiceArgPosition = serviceDependencies.length > 0 ? serviceDependencies[0].index : args.length;
    const staticArgs = args.slice(0, firstServiceArgPosition);

    while (staticArgs.length < firstServiceArgPosition) {
      staticArgs.push(undefined);
    }

    const serviceArgs = serviceDependencies.map(dependency => this.getOrCreateServiceInstance(dependency.id));
    return new ctor(...staticArgs, ...serviceArgs);
  }

  private getOrCreateServiceInstance<T>(id: ServiceIdentifier<T>): T {
    const entry = this.getServiceInstanceOrDescriptor(id);

    if (entry instanceof SyncDescriptor) {
      const instance = this.createInstance(entry);
      this.setCreatedServiceInstance(id, instance);
      this.servicesToDispose.add(instance);
      return instance;
    }

    if (!entry) {
      if (this.strict) {
        throw new Error(`Unknown service '${id}'.`);
      }

      return undefined as T;
    }

    return entry as T;
  }

  private getServiceInstanceOrDescriptor<T>(id: ServiceIdentifier<T>): T | SyncDescriptor<T> | undefined {
    const entry = this.services.get(id);

    if (entry || !this.parent) {
      return entry;
    }

    return this.parent.getServiceInstanceOrDescriptor(id);
  }

  private setCreatedServiceInstance<T>(id: ServiceIdentifier<T>, instance: T): void {
    if (this.services.get(id) instanceof SyncDescriptor) {
      this.services.set(id, instance);
      return;
    }

    if (this.parent) {
      this.parent.setCreatedServiceInstance(id, instance);
      return;
    }

    throw new Error(`Cannot cache unknown service '${id}'.`);
  }

  private throwIfDisposed(): void {
    if (this.disposed) {
      throw new Error("InstantiationService has been disposed.");
    }
  }
}
