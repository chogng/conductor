import type { Event } from "../../../base/common/event.js";
import { LinkedList } from "../../../base/common/linkedList.js";
import {
  DisposableStore,
  isDisposable,
  toDisposable,
  type IDisposable,
} from "../../../base/common/lifecycle.js";
import { SyncDescriptor } from "./descriptors.js";
import { registerSingletonServiceDescriptors } from "./extensions.js";
import {
  IInstantiationService,
  type ServiceIdentifier,
  type ServicesAccessor,
  _util,
} from "./instantiation.js";
import { ServiceCollection } from "./serviceCollection.js";

type EarlyServiceEventListener = {
  disposable?: IDisposable;
  listener: Parameters<Event<unknown>>;
};

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
    this.parent?.children.delete(this);

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
      const owner = this.getServiceOwner(id);
      const instance = owner.createServiceInstance(entry);
      owner.setCreatedServiceInstance(id, instance);
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

  private getServiceOwner<T>(id: ServiceIdentifier<T>): InstantiationService {
    if (this.services.get(id) instanceof SyncDescriptor) {
      return this;
    }

    if (this.parent) {
      return this.parent.getServiceOwner(id);
    }

    throw new Error(`Cannot create unknown service '${id}'.`);
  }

  private createServiceInstance<T>(descriptor: SyncDescriptor<T>): T {
    if (descriptor.supportsDelayedInstantiation) {
      return this.createDelayedServiceInstance(descriptor);
    }

    const instance = this.createInstance(descriptor);
    this.servicesToDispose.add(instance);
    return instance;
  }

  private createDelayedServiceInstance<T>(descriptor: SyncDescriptor<T>): T {
    const child = new InstantiationService(undefined, this.strict, this);
    const earlyListeners = new Map<string, LinkedList<EarlyServiceEventListener>>();
    const boundProperties = Object.create(null) as Record<PropertyKey, unknown>;
    let initialized = false;
    let instance: T | undefined;
    let error: unknown;

    const getInstance = (): T => {
      if (!initialized) {
        initialized = true;
        try {
          instance = child.createInstanceFromConstructor(
            descriptor.ctor,
            descriptor.staticArguments,
          );
          this.servicesToDispose.add(instance);
          this.replayEarlyServiceEventListeners(instance, earlyListeners);
        } catch (caughtError) {
          error = caughtError;
          earlyListeners.clear();
        }
      }

      if (error) {
        throw error;
      }

      return instance!;
    };

    return new Proxy(Object.create(null), {
      get: (_target, key: PropertyKey): unknown => {
        if (!initialized && isEventPropertyKey(key)) {
          return createEarlyServiceEvent(
            key,
            () => initialized,
            getInstance,
            earlyListeners,
          );
        }

        if (key in boundProperties) {
          return boundProperties[key];
        }

        const value = (getInstance() as Record<PropertyKey, unknown>)[key];
        if (typeof value !== "function") {
          return value;
        }

        const boundValue = value.bind(instance);
        boundProperties[key] = boundValue;
        return boundValue;
      },
      getPrototypeOf: () => descriptor.ctor.prototype,
      set: (_target, key: PropertyKey, value: unknown): boolean => {
        (getInstance() as Record<PropertyKey, unknown>)[key] = value;
        return true;
      },
    }) as T;
  }

  private replayEarlyServiceEventListeners<T>(
    instance: T,
    earlyListeners: Map<string, LinkedList<EarlyServiceEventListener>>,
  ): void {
    const service = instance as Record<string, unknown>;
    for (const [key, listeners] of earlyListeners) {
      const event = service[key];
      if (typeof event !== "function") {
        continue;
      }

      for (const listener of listeners) {
        listener.disposable = (event as Event<unknown>).apply(instance, listener.listener);
      }
    }

    earlyListeners.clear();
  }

  private throwIfDisposed(): void {
    if (this.disposed) {
      throw new Error("InstantiationService has been disposed.");
    }
  }
}

const isEventPropertyKey = (key: PropertyKey): key is string =>
  typeof key === "string" &&
  (key.startsWith("onDid") || key.startsWith("onWill"));

const createEarlyServiceEvent = (
  key: string,
  isInitialized: () => boolean,
  getInstance: () => unknown,
  earlyListeners: Map<string, LinkedList<EarlyServiceEventListener>>,
): Event<unknown> => {
  let listeners = earlyListeners.get(key);
  if (!listeners) {
    listeners = new LinkedList<EarlyServiceEventListener>();
    earlyListeners.set(key, listeners);
  }

  return (listener, thisArgs, disposables) => {
    if (isInitialized()) {
      const instance = getInstance() as Record<string, unknown>;
      const event = instance[key];
      if (typeof event === "function") {
        return (event as Event<unknown>)(listener, thisArgs, disposables);
      }
    }

    const entry: EarlyServiceEventListener = {
      listener: [listener, thisArgs, disposables],
    };
    const remove = listeners.push(entry);
    const disposable = toDisposable(() => {
      remove();
      entry.disposable?.dispose();
    });

    if (disposables) {
      if (Array.isArray(disposables)) {
        disposables.push(disposable);
      } else {
        disposables.add(disposable);
      }
    }

    return disposable;
  };
};
