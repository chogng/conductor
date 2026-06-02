import { Emitter, type Event } from "src/cs/base/common/event";
import { localize } from "src/cs/nls";
import { Registry } from "src/cs/platform/registry/common/platform";

export const enum ConfigurationScope {
  APPLICATION = 1,
  MACHINE,
  APPLICATION_MACHINE,
  WINDOW,
  RESOURCE,
  LANGUAGE_OVERRIDABLE,
  MACHINE_OVERRIDABLE,
}

export interface IConfigurationPropertySchema {
  readonly type?: string | readonly string[];
  readonly default?: unknown;
  readonly description?: string;
  readonly markdownDescription?: string;
  readonly enum?: readonly unknown[];
  readonly enumDescriptions?: readonly string[];
  readonly items?: IConfigurationPropertySchema;
  readonly pattern?: string;
  readonly patternErrorMessage?: string;
  readonly scope?: ConfigurationScope;
  readonly tags?: readonly string[];
  readonly included?: boolean;
  readonly restricted?: boolean;
}

export interface IConfigurationNode {
  readonly id?: string;
  readonly order?: number;
  readonly title?: string;
  readonly type?: string;
  readonly scope?: ConfigurationScope;
  readonly properties?: Record<string, IConfigurationPropertySchema>;
}

export const applicationConfigurationNodeBase = Object.freeze<IConfigurationNode>({
  id: "application",
  order: 100,
  title: localize("applicationConfigurationTitle", "Application"),
  type: "object",
});

export const workbenchConfigurationNodeBase = Object.freeze<IConfigurationNode>({
  id: "workbench",
  order: 7,
  title: localize("workbenchConfigurationTitle", "Workbench"),
  type: "object",
});

export const securityConfigurationNodeBase = Object.freeze<IConfigurationNode>({
  id: "security",
  order: 7,
  scope: ConfigurationScope.APPLICATION,
  title: localize("securityConfigurationTitle", "Security"),
  type: "object",
});

export const problemsConfigurationNodeBase = Object.freeze<IConfigurationNode>({
  id: "problems",
  order: 101,
  title: localize("problemsConfigurationTitle", "Problems"),
  type: "object",
});

export const windowConfigurationNodeBase = Object.freeze<IConfigurationNode>({
  id: "window",
  order: 8,
  title: localize("windowConfigurationTitle", "Window"),
  type: "object",
});

export const Extensions = {
  ConfigurationMigration: "base.contributions.configuration.migration",
} as const;

export type ConfigurationValue = {
  readonly value: unknown | undefined;
};

export type ConfigurationKeyValuePairs = readonly (readonly [string, ConfigurationValue])[];

export type ConfigurationMigrationFn = (
  value: unknown,
  valueAccessor: (key: string) => unknown,
) => ConfigurationValue | ConfigurationKeyValuePairs | Promise<ConfigurationValue | ConfigurationKeyValuePairs>;

export type ConfigurationMigration = {
  readonly key: string;
  readonly migrateFn: ConfigurationMigrationFn;
};

export interface IConfigurationMigrationRegistry {
  readonly migrations: readonly ConfigurationMigration[];
  readonly onDidRegisterConfigurationMigration: Event<readonly ConfigurationMigration[]>;

  registerConfigurationMigrations(configurationMigrations: readonly ConfigurationMigration[]): void;
}

class ConfigurationMigrationRegistry implements IConfigurationMigrationRegistry {
  private readonly items: ConfigurationMigration[] = [];
  private readonly onDidRegisterConfigurationMigrationEmitter = new Emitter<readonly ConfigurationMigration[]>();

  public readonly onDidRegisterConfigurationMigration = this.onDidRegisterConfigurationMigrationEmitter.event;

  public get migrations(): readonly ConfigurationMigration[] {
    return this.items;
  }

  public registerConfigurationMigrations(configurationMigrations: readonly ConfigurationMigration[]): void {
    this.items.push(...configurationMigrations);
    this.onDidRegisterConfigurationMigrationEmitter.fire(configurationMigrations);
  }

  public dispose(): void {
    this.onDidRegisterConfigurationMigrationEmitter.dispose();
  }
}

Registry.add(Extensions.ConfigurationMigration, new ConfigurationMigrationRegistry());
