import type { DisposableStore } from "../../../base/common/lifecycle.js";
import type { SyncDescriptor0 } from "./descriptors.js";
import type { ServiceCollection } from "./serviceCollection.js";

export namespace _util {
  export const serviceIds = new Map<string, ServiceIdentifier<unknown>>();

  export const DI_TARGET = "$di$target";
  export const DI_DEPENDENCIES = "$di$dependencies";

  export interface DITargetObject extends Function {
    [DI_TARGET]: Function;
    [DI_DEPENDENCIES]: Array<{ id: ServiceIdentifier<unknown>; index: number }>;
  }

  export function getServiceDependencies(ctor: Function): Array<{ id: ServiceIdentifier<unknown>; index: number }> {
    return (ctor as DITargetObject)[DI_DEPENDENCIES] ?? [];
  }
}

export type BrandedService = { _serviceBrand: undefined };

export interface ServicesAccessor {
  get<T>(id: ServiceIdentifier<T>): T;
}

export const IInstantiationService = createDecorator<IInstantiationService>("instantiationService");

export interface IInstantiationService {
  readonly _serviceBrand: undefined;

  createInstance<T>(descriptor: SyncDescriptor0<T>): T;
  createInstance<T>(ctor: new (...args: any[]) => T, ...args: unknown[]): T;
  invokeFunction<R, TS extends unknown[] = []>(fn: (accessor: ServicesAccessor, ...args: TS) => R, ...args: TS): R;
  createChild(services: ServiceCollection, store?: DisposableStore): IInstantiationService;
  dispose(): void;
}

export interface ServiceIdentifier<T> {
  (...args: unknown[]): void;
  type: T;
}

function storeServiceDependency(id: ServiceIdentifier<unknown>, target: Function, index: number): void {
  const diTarget = target as _util.DITargetObject;

  if (diTarget[_util.DI_TARGET] === target) {
    diTarget[_util.DI_DEPENDENCIES].push({ id, index });
    return;
  }

  diTarget[_util.DI_DEPENDENCIES] = [{ id, index }];
  diTarget[_util.DI_TARGET] = target;
}

export function createDecorator<T>(serviceId: string): ServiceIdentifier<T> {
  const existing = _util.serviceIds.get(serviceId);
  if (existing) {
    return existing as ServiceIdentifier<T>;
  }

  const id = function (target: Function, _key: string, index: number) {
    if (arguments.length !== 3) {
      throw new Error("@IServiceName-decorator can only be used to decorate a parameter");
    }

    storeServiceDependency(id, target, index);
  } as ServiceIdentifier<T>;

  id.toString = () => serviceId;
  _util.serviceIds.set(serviceId, id as ServiceIdentifier<unknown>);

  return id;
}

export function refineServiceDecorator<T1, T extends T1>(serviceIdentifier: ServiceIdentifier<T1>): ServiceIdentifier<T> {
  return serviceIdentifier as unknown as ServiceIdentifier<T>;
}
