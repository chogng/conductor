import { Emitter } from "src/cs/base/common/event";
import { Disposable } from "src/cs/base/common/lifecycle";
import {
  ConfigurationTarget,
  IConfigurationService,
  isConfigurationOverrides,
  isConfigurationUpdateOverrides,
  type IConfigurationChangeEvent,
  type IConfigurationData,
  type IConfigurationOverrides,
  type IConfigurationUpdateOptions,
  type IConfigurationUpdateOverrides,
  type IConfigurationValue,
} from "src/cs/platform/configuration/common/configuration";
import {
  Configuration,
  ConfigurationChangeEvent,
  ConfigurationModel,
  parseConfigurationModel,
} from "src/cs/platform/configuration/common/configurationModels";
import {
  Extensions,
  type IConfigurationRegistry,
} from "src/cs/platform/configuration/common/configurationRegistry";
import { Registry } from "src/cs/platform/registry/common/platform";

export class ConfigurationService extends Disposable implements IConfigurationService {
  declare readonly _serviceBrand: undefined;

  protected readonly registry = Registry.as<IConfigurationRegistry>(Extensions.Configuration);
  protected configuration = this.createConfiguration();
  protected readonly onDidChangeConfigurationEmitter =
    this._register(new Emitter<IConfigurationChangeEvent>());

  public readonly onDidChangeConfiguration = this.onDidChangeConfigurationEmitter.event;

  constructor() {
    super();
    this._register(this.registry.onDidUpdateConfiguration(() => {
      const previous = Configuration.parse(this.configuration.toData());
      const defaults = this.createDefaultConfigurationModel();
      const change = this.configuration.compareAndUpdateDefaultConfiguration(defaults);
      if (change.keys.length || change.overrides.length) {
        this.onDidChangeConfigurationEmitter.fire(
          new ConfigurationChangeEvent(
            change,
            previous,
            this.configuration,
            ConfigurationTarget.DEFAULT,
          ),
        );
      }
    }));
  }

  public getConfigurationData(): IConfigurationData {
    return this.configuration.toData();
  }

  public getValue<T>(): T;
  public getValue<T>(section: string): T;
  public getValue<T>(overrides: IConfigurationOverrides): T;
  public getValue<T>(section: string, overrides: IConfigurationOverrides): T;
  public getValue<T>(arg1?: string | IConfigurationOverrides, arg2?: IConfigurationOverrides): T {
    const section = typeof arg1 === "string" ? arg1 : undefined;
    const overrides = isConfigurationOverrides(arg1)
      ? arg1
      : isConfigurationOverrides(arg2)
        ? arg2
        : {};
    return this.configuration.getValue<T>(section, overrides) as T;
  }

  public async updateValue(key: string, value: unknown): Promise<void>;
  public async updateValue(
    key: string,
    value: unknown,
    target: ConfigurationTarget,
  ): Promise<void>;
  public async updateValue(
    key: string,
    value: unknown,
    overrides: IConfigurationOverrides | IConfigurationUpdateOverrides,
  ): Promise<void>;
  public async updateValue(
    key: string,
    value: unknown,
    overrides: IConfigurationOverrides | IConfigurationUpdateOverrides,
    target: ConfigurationTarget,
    options?: IConfigurationUpdateOptions,
  ): Promise<void>;
  public async updateValue(
    key: string,
    value: unknown,
    arg3?: ConfigurationTarget | IConfigurationOverrides | IConfigurationUpdateOverrides,
    arg4?: ConfigurationTarget,
    _options?: IConfigurationUpdateOptions,
  ): Promise<void> {
    const target = typeof arg3 === "number" ? arg3 : arg4 ?? ConfigurationTarget.USER;
    const overrides = this.resolveUpdateOverrides(arg3);
    const previous = Configuration.parse(this.configuration.toData());
    const model = this.getModelForTarget(target).merge();

    if (overrides.overrideIdentifiers?.length) {
      this.updateOverrideValue(model, overrides.overrideIdentifiers, key, value);
    } else if (value === undefined) {
      model.removeValue(key);
    } else {
      model.setValue(key, value);
    }

    await this.writeConfigurationForTarget(target, model);

    const change = this.updateModelForTarget(target, model);
    if (change.keys.length || change.overrides.length) {
      this.fireDidChangeConfiguration(change, previous, target);
    }
  }

  public inspect<T>(
    key: string,
    overrides: IConfigurationOverrides = {},
  ): IConfigurationValue<Readonly<T>> {
    return this.configuration.inspect<Readonly<T>>(key, overrides);
  }

  public async reloadConfiguration(): Promise<void> {
    const previous = Configuration.parse(this.configuration.toData());
    const next = this.createConfiguration();
    const change = this.configuration.compareAndUpdateDefaultConfiguration(
      ConfigurationModel.from(next.toData().defaults),
    );

    if (change.keys.length || change.overrides.length) {
      this.fireDidChangeConfiguration(change, previous, ConfigurationTarget.DEFAULT);
    }
  }

  public keys(): {
    default: readonly string[];
    user: readonly string[];
    workspace: readonly string[];
    workspaceFolder: readonly string[];
    memory?: readonly string[];
  } {
    return this.configuration.keys();
  }

  protected createConfiguration(): Configuration {
    return new Configuration(
      this.createDefaultConfigurationModel(),
      ConfigurationModel.createEmptyModel(),
      ConfigurationModel.createEmptyModel(),
      ConfigurationModel.createEmptyModel(),
      ConfigurationModel.createEmptyModel(),
      ConfigurationModel.createEmptyModel(),
    );
  }

  protected createDefaultConfigurationModel(): ConfigurationModel {
    const properties = this.registry.getConfigurationProperties();
    const defaults: Record<string, unknown> = {};

    for (const [key, property] of Object.entries(properties)) {
      if ("default" in property) {
        defaults[key] = property.default;
      }
    }

    return parseConfigurationModel(defaults);
  }

  protected resolveUpdateOverrides(
    value: ConfigurationTarget | IConfigurationOverrides | IConfigurationUpdateOverrides | undefined,
  ): IConfigurationUpdateOverrides {
    if (isConfigurationUpdateOverrides(value)) {
      return value;
    }

    if (isConfigurationOverrides(value)) {
      return {
        resource: value.resource,
        overrideIdentifiers: value.overrideIdentifier ? [value.overrideIdentifier] : undefined,
      };
    }

    return {};
  }

  protected getModelForTarget(target: ConfigurationTarget): ConfigurationModel {
    const data = this.configuration.toData();
    switch (target) {
      case ConfigurationTarget.APPLICATION:
        return ConfigurationModel.from(data.application);
      case ConfigurationTarget.USER:
      case ConfigurationTarget.USER_LOCAL:
        return ConfigurationModel.from(data.userLocal);
      case ConfigurationTarget.USER_REMOTE:
        return ConfigurationModel.from(data.userRemote);
      case ConfigurationTarget.WORKSPACE:
        return ConfigurationModel.from(data.workspace);
      case ConfigurationTarget.MEMORY:
        return ConfigurationModel.from(data.memory ?? ConfigurationModel.createEmptyModel());
      case ConfigurationTarget.DEFAULT:
      case ConfigurationTarget.WORKSPACE_FOLDER:
        throw new Error(`Configuration target ${target} is not writable.`);
    }
  }

  protected updateModelForTarget(target: ConfigurationTarget, model: ConfigurationModel) {
    switch (target) {
      case ConfigurationTarget.APPLICATION:
        return this.configuration.compareAndUpdateApplicationConfiguration(model);
      case ConfigurationTarget.USER:
      case ConfigurationTarget.USER_LOCAL:
        return this.configuration.compareAndUpdateLocalUserConfiguration(model);
      case ConfigurationTarget.USER_REMOTE:
        return this.configuration.compareAndUpdateRemoteUserConfiguration(model);
      case ConfigurationTarget.WORKSPACE:
        return this.configuration.compareAndUpdateWorkspaceConfiguration(model);
      case ConfigurationTarget.MEMORY:
        return this.configuration.compareAndUpdateMemoryConfiguration(model);
      case ConfigurationTarget.DEFAULT:
      case ConfigurationTarget.WORKSPACE_FOLDER:
        throw new Error(`Configuration target ${target} is not writable.`);
    }
  }

  protected async writeConfigurationForTarget(
    _target: ConfigurationTarget,
    _model: ConfigurationModel,
  ): Promise<void> {}

  protected fireDidChangeConfiguration(
    change: { readonly keys: readonly string[]; readonly overrides: readonly (readonly [string, readonly string[]])[] },
    previous: Configuration,
    source: ConfigurationTarget,
  ): void {
    this.onDidChangeConfigurationEmitter.fire(
      new ConfigurationChangeEvent(change, previous, this.configuration, source),
    );
  }

  private updateOverrideValue(
    model: ConfigurationModel,
    overrideIdentifiers: readonly string[],
    key: string,
    value: unknown,
  ): void {
    if (value === undefined) {
      model.removeOverrideValue(overrideIdentifiers, key);
    } else {
      model.setOverrideValue(overrideIdentifiers, key, value);
    }
  }
}
