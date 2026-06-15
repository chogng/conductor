import { isDisposable } from "../../../base/common/lifecycle.js";

export interface IRegistry {
  add(id: string, data: object): void;
  knows(id: string): boolean;
  as<T>(id: string): T;
}

class RegistryImpl implements IRegistry {
  private readonly data = new Map<string, object>();

  public add(id: string, data: object): void {
    if (typeof id !== "string" || id.length === 0) {
      throw new Error("Registry id must be a non-empty string.");
    }

    if (!data || typeof data !== "object") {
      throw new Error(`Registry contribution '${id}' must be an object.`);
    }

    if (this.data.has(id)) {
      throw new Error(`There is already a registry contribution with id '${id}'.`);
    }

    this.data.set(id, data);
  }

  public knows(id: string): boolean {
    return this.data.has(id);
  }

  public as<T>(id: string): T {
    return (this.data.get(id) ?? null) as T;
  }

  public dispose(): void {
    for (const value of this.data.values()) {
      if (isDisposable(value)) {
        value.dispose();
      }
    }

    this.data.clear();
  }
}

export const Registry: IRegistry = new RegistryImpl();
