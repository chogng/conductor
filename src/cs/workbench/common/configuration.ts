import { Emitter, type Event } from "src/cs/base/common/event";
import { localize } from "src/cs/nls";
import {
  ConfigurationScope,
  type IConfigurationNode,
} from "src/cs/platform/configuration/common/configurationRegistry";
import { Registry } from "src/cs/platform/registry/common/platform";

export { ConfigurationScope, type IConfigurationNode };

export const applicationConfigurationNodeBase = Object.freeze<IConfigurationNode>({
  id: "application",
  order: 100,
  title: localize("configuration.application.title", "Application"),
  type: "object",
});

export const workbenchConfigurationNodeBase = Object.freeze<IConfigurationNode>({
  id: "workbench",
  order: 7,
  title: localize("configuration.workbench.title", "Workbench"),
  type: "object",
});

export const securityConfigurationNodeBase = Object.freeze<IConfigurationNode>({
  id: "security",
  order: 7,
  scope: ConfigurationScope.APPLICATION,
  title: localize("configuration.security.title", "Security"),
  type: "object",
});

export const problemsConfigurationNodeBase = Object.freeze<IConfigurationNode>({
  id: "problems",
  order: 101,
  title: localize("configuration.problems.title", "Problems"),
  type: "object",
});

export const windowConfigurationNodeBase = Object.freeze<IConfigurationNode>({
  id: "window",
  order: 8,
  title: localize("configuration.window.title", "Window"),
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
