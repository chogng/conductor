import { SyncDescriptor } from "src/cs/platform/instantiation/common/descriptors";
import type { ServiceIdentifier } from "src/cs/platform/instantiation/common/instantiation";

export class ServiceCollection {
  private readonly entries = new Map<ServiceIdentifier<unknown>, unknown>();

  constructor(...entries: Array<[ServiceIdentifier<unknown>, unknown]>) {
    for (const [id, service] of entries) {
      this.set(id, service);
    }
  }

  public set<T>(id: ServiceIdentifier<T>, instanceOrDescriptor: T | SyncDescriptor<T>): T | SyncDescriptor<T> | undefined {
    const result = this.entries.get(id) as T | SyncDescriptor<T> | undefined;
    this.entries.set(id, instanceOrDescriptor);
    return result;
  }

  public has(id: ServiceIdentifier<unknown>): boolean {
    return this.entries.has(id);
  }

  public get<T>(id: ServiceIdentifier<T>): T | SyncDescriptor<T> | undefined {
    return this.entries.get(id) as T | SyncDescriptor<T> | undefined;
  }
}
