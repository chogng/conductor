import { Emitter, type Event } from "src/cs/base/common/event";
import type { IJSONSchema } from "src/cs/base/common/jsonSchema";
import { Registry } from "src/cs/platform/registry/common/platform";

export const Extensions = {
  Configuration: "base.contributions.configuration",
} as const;

export const OVERRIDE_PROPERTY_REGEX = /^\[([^\]]+)\]$/;

export const enum ConfigurationScope {
  APPLICATION = 1,
  MACHINE,
  APPLICATION_MACHINE,
  WINDOW,
  RESOURCE,
  LANGUAGE_OVERRIDABLE,
  MACHINE_OVERRIDABLE,
}

export interface IConfigurationPropertySchema extends IJSONSchema {
  readonly scope?: ConfigurationScope;
  readonly restricted?: boolean;
  readonly included?: boolean;
  readonly tags?: readonly string[];
  readonly ignoreSync?: boolean;
  readonly disallowSyncIgnore?: boolean;
  readonly disallowConfigurationDefault?: boolean;
  readonly enumItemLabels?: readonly string[];
  readonly keywords?: readonly string[];
  readonly order?: number;
}

export interface IRegisteredConfigurationPropertySchema extends IConfigurationPropertySchema {
  readonly defaultDefaultValue?: unknown;
  readonly source?: IConfigurationNode;
}

export interface IConfigurationNode {
  readonly id?: string;
  readonly order?: number;
  readonly title?: string;
  readonly type?: string;
  readonly scope?: ConfigurationScope;
  readonly properties?: Record<string, IConfigurationPropertySchema>;
}

export interface IConfigurationRegistry {
  readonly onDidSchemaChange: Event<void>;
  readonly onDidUpdateConfiguration: Event<ReadonlySet<string>>;

  registerConfiguration(configuration: IConfigurationNode): IConfigurationNode;
  registerConfigurations(configurations: readonly IConfigurationNode[]): void;
  deregisterConfigurations(configurations: readonly IConfigurationNode[]): void;
  getConfigurations(): readonly IConfigurationNode[];
  getConfigurationProperties(): Record<string, IRegisteredConfigurationPropertySchema>;
}

export function overrideIdentifiersFromKey(key: string): string[] {
  const match = OVERRIDE_PROPERTY_REGEX.exec(key);
  if (!match) {
    return [];
  }

  return match[1]
    .split(",")
    .map(identifier => identifier.trim())
    .filter(Boolean);
}

export function keyFromOverrideIdentifiers(overrideIdentifiers: readonly string[]): string {
  return `[${overrideIdentifiers.join(",")}]`;
}

class ConfigurationRegistry implements IConfigurationRegistry {
  private readonly configurations: IConfigurationNode[] = [];
  private readonly properties = new Map<string, IRegisteredConfigurationPropertySchema>();
  private readonly onDidSchemaChangeEmitter = new Emitter<void>();
  private readonly onDidUpdateConfigurationEmitter = new Emitter<ReadonlySet<string>>();

  public readonly onDidSchemaChange = this.onDidSchemaChangeEmitter.event;
  public readonly onDidUpdateConfiguration = this.onDidUpdateConfigurationEmitter.event;

  public registerConfiguration(configuration: IConfigurationNode): IConfigurationNode {
    this.validateConfiguration(configuration);
    this.configurations.push(configuration);
    const updatedKeys = this.registerProperties(configuration);
    this.fireUpdatedConfiguration(updatedKeys);
    return configuration;
  }

  public registerConfigurations(configurations: readonly IConfigurationNode[]): void {
    const updatedKeys = new Set<string>();

    for (const configuration of configurations) {
      this.validateConfiguration(configuration);
      this.configurations.push(configuration);
      for (const key of this.registerProperties(configuration)) {
        updatedKeys.add(key);
      }
    }

    this.fireUpdatedConfiguration(updatedKeys);
  }

  public deregisterConfigurations(configurations: readonly IConfigurationNode[]): void {
    const updatedKeys = new Set<string>();

    for (const configuration of configurations) {
      const index = this.configurations.indexOf(configuration);
      if (index !== -1) {
        this.configurations.splice(index, 1);
      }

      for (const key of Object.keys(configuration.properties ?? {})) {
        if (this.properties.get(key)?.source === configuration) {
          this.properties.delete(key);
          updatedKeys.add(key);
        }
      }
    }

    this.fireUpdatedConfiguration(updatedKeys);
  }

  public getConfigurations(): readonly IConfigurationNode[] {
    return this.configurations.slice();
  }

  public getConfigurationProperties(): Record<string, IRegisteredConfigurationPropertySchema> {
    const result: Record<string, IRegisteredConfigurationPropertySchema> = Object.create(null);

    for (const [key, value] of this.properties) {
      result[key] = value;
    }

    return result;
  }

  public dispose(): void {
    this.onDidSchemaChangeEmitter.dispose();
    this.onDidUpdateConfigurationEmitter.dispose();
    this.configurations.length = 0;
    this.properties.clear();
  }

  private registerProperties(configuration: IConfigurationNode): Set<string> {
    const updatedKeys = new Set<string>();

    for (const [key, property] of Object.entries(configuration.properties ?? {})) {
      if (property.included === false) {
        continue;
      }

      if (this.properties.has(key)) {
        throw new Error(`Configuration '${key}' is already registered.`);
      }

      this.properties.set(key, {
        ...property,
        defaultDefaultValue: property.default,
        source: configuration,
      });
      updatedKeys.add(key);
    }

    return updatedKeys;
  }

  private validateConfiguration(configuration: IConfigurationNode): void {
    if (!configuration || typeof configuration !== "object") {
      throw new Error("Configuration node must be an object.");
    }

    if (configuration.properties === undefined) {
      return;
    }

    for (const [key, property] of Object.entries(configuration.properties)) {
      if (!key) {
        throw new Error("Configuration property key must be a non-empty string.");
      }

      if (!property || typeof property !== "object") {
        throw new Error(`Configuration '${key}' schema must be an object.`);
      }
    }
  }

  private fireUpdatedConfiguration(updatedKeys: Set<string>): void {
    if (updatedKeys.size === 0) {
      return;
    }

    this.onDidSchemaChangeEmitter.fire();
    this.onDidUpdateConfigurationEmitter.fire(updatedKeys);
  }
}

Registry.add(Extensions.Configuration, new ConfigurationRegistry());
