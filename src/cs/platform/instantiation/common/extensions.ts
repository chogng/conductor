import { SyncDescriptor } from "src/cs/platform/instantiation/common/descriptors";
import type { BrandedService, ServiceIdentifier } from "src/cs/platform/instantiation/common/instantiation";
import { ServiceCollection } from "src/cs/platform/instantiation/common/serviceCollection";

const singletonServiceDescriptors: Array<[ServiceIdentifier<unknown>, SyncDescriptor<unknown>]> = [];

export const enum InstantiationType {
  Eager = 0,
  Delayed = 1,
}

export function registerSingleton<T, Services extends BrandedService[]>(id: ServiceIdentifier<T>, ctor: new (...services: Services) => T, supportsDelayedInstantiation: InstantiationType): void;
export function registerSingleton<T, Services extends BrandedService[]>(id: ServiceIdentifier<T>, descriptor: SyncDescriptor<T>): void;
export function registerSingleton<T, Services extends BrandedService[]>(
  id: ServiceIdentifier<T>,
  ctorOrDescriptor: (new (...services: Services) => T) | SyncDescriptor<T>,
  supportsDelayedInstantiation?: boolean | InstantiationType,
): void {
  const descriptor = ctorOrDescriptor instanceof SyncDescriptor
    ? ctorOrDescriptor
    : new SyncDescriptor<T>(ctorOrDescriptor as new (...args: any[]) => T, [], Boolean(supportsDelayedInstantiation));

  singletonServiceDescriptors.push([id as ServiceIdentifier<unknown>, descriptor as SyncDescriptor<unknown>]);
}

export function getSingletonServiceDescriptors(): Array<[ServiceIdentifier<unknown>, SyncDescriptor<unknown>]> {
  return [...singletonServiceDescriptors];
}

export function registerSingletonServiceDescriptors(services: ServiceCollection): void {
  for (const [id, descriptor] of singletonServiceDescriptors) {
    if (!services.has(id)) {
      services.set(id, descriptor);
    }
  }
}
