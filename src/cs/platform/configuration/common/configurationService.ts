import { Emitter } from "../../../base/common/event.js";
import { RunOnceScheduler } from "../../../base/common/async.js";
import { isObjectRecord } from "../../../base/common/json.js";
import { parse as parseJsonc } from "../../../base/common/jsonc.js";
import { Disposable } from "../../../base/common/lifecycle.js";
import { isEqual as isEqualResource } from "../../../base/common/resources.js";
import type { URI } from "../../../base/common/uri.js";
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
} from "./configuration.js";
import {
  Configuration,
  ConfigurationChangeEvent,
  ConfigurationModel,
  parseConfigurationModel,
} from "./configurationModels.js";
import {
  Extensions,
  type IConfigurationRegistry,
  type IRegisteredConfigurationPropertySchema,
} from "./configurationRegistry.js";
import type { IFileChange, IFileService } from "../../files/common/files.js";
import { Registry } from "../../registry/common/platform.js";

export class ConfigurationService extends Disposable implements IConfigurationService {
  declare readonly _serviceBrand: undefined;

  protected readonly registry = Registry.as<IConfigurationRegistry>(Extensions.Configuration);
  protected configuration = this.createConfiguration();
  protected readonly onDidChangeConfigurationEmitter =
    this._register(new Emitter<IConfigurationChangeEvent>());
  private readonly reloadUserConfigurationScheduler?: RunOnceScheduler;
  private initializePromise: Promise<void> | undefined;
  private hasLoadedUserConfiguration = false;
  private isWritingUserConfiguration = false;
  private userConfigurationParseError: unknown = null;

  public readonly onDidChangeConfiguration = this.onDidChangeConfigurationEmitter.event;

  constructor(
    private readonly userSettingsResource?: URI,
    private readonly userSettingsFileService?: IFileService,
  ) {
    super();
    if (this.userSettingsResource && this.userSettingsFileService) {
      this.reloadUserConfigurationScheduler = this._register(new RunOnceScheduler(() => {
        void this.reloadConfiguration().catch(error => {
          console.error("Failed to reload user settings.", error);
        });
      }, 50));
      this._register(this.userSettingsFileService.watch(this.userSettingsResource));
      this._register(this.userSettingsFileService.onDidFilesChange(changes => {
        if (!this.affectsUserSettingsResource(changes)) {
          return;
        }

        if (this.isWritingUserConfiguration) {
          return;
        }

        this.reloadUserConfigurationScheduler?.schedule();
      }));
    }

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

  public async initialize(_arg?: unknown): Promise<void> {
    this.initializePromise ??= this.reloadConfiguration().catch(error => {
      this.initializePromise = undefined;
      throw error;
    });
    await this.initializePromise;
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
    this.validateWritableTarget(key, target);
    const overrides = this.resolveUpdateOverrides(arg3);
    const validatedValue = this.validateAndNormalizeUpdateValue(key, value, overrides);
    const previous = Configuration.parse(this.configuration.toData());
    const model = this.getModelForTarget(target).merge();

    if (overrides.overrideIdentifiers?.length) {
      this.updateOverrideValue(model, overrides.overrideIdentifiers, key, validatedValue);
    } else if (validatedValue === undefined) {
      model.removeValue(key);
    } else {
      model.setValue(key, validatedValue);
    }

    await this.writeConfigurationForTarget(target, model);

    const change = this.updateModelForTarget(target, model);
    if (change.keys.length || change.overrides.length) {
      this.fireDidChangeConfiguration(change, previous, target);
    }
  }

  public async updateUserConfiguration(raw: Record<string, unknown>): Promise<void> {
    const previous = Configuration.parse(this.configuration.toData());
    const model = parseConfigurationModel(raw);
    this.validateConfigurationModel(model);

    await this.writeConfigurationForTarget(ConfigurationTarget.USER, model);

    const change = this.updateModelForTarget(ConfigurationTarget.USER, model);
    if (change.keys.length || change.overrides.length) {
      this.fireDidChangeConfiguration(change, previous, ConfigurationTarget.USER);
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

    const userConfiguration = await this.readUserConfiguration();
    const userChange = this.updateModelForTarget(ConfigurationTarget.USER_LOCAL, userConfiguration);
    if (userChange.keys.length || userChange.overrides.length) {
      this.fireDidChangeConfiguration(userChange, previous, ConfigurationTarget.USER);
    }
    this.hasLoadedUserConfiguration = true;
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
      return {
        resource: value.resource,
        overrideIdentifiers: this.normalizeOverrideIdentifiers(value.overrideIdentifiers),
      };
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
    target: ConfigurationTarget,
    model: ConfigurationModel,
  ): Promise<void> {
    if (
      (target !== ConfigurationTarget.USER && target !== ConfigurationTarget.USER_LOCAL)
      || !this.userSettingsResource
      || !this.userSettingsFileService
    ) {
      return;
    }

    const wasWriting = this.isWritingUserConfiguration;
    this.isWritingUserConfiguration = true;
    try {
      await this.userSettingsFileService.writeFile(
        this.userSettingsResource,
        `${JSON.stringify(model.toRaw(), null, 2)}\n`,
      );
    } finally {
      this.isWritingUserConfiguration = wasWriting;
    }
  }

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

  private affectsUserSettingsResource(changes: readonly IFileChange[]): boolean {
    if (!this.userSettingsResource) {
      return false;
    }

    return changes.some(change => isEqualResource(change.resource, this.userSettingsResource));
  }

  private validateWritableTarget(key: string, target: ConfigurationTarget): void {
    if (target === ConfigurationTarget.USER || target === ConfigurationTarget.USER_LOCAL) {
      return;
    }

    throw new Error(`Unable to write ${key} to target ${target}.`);
  }

  private validateAndNormalizeUpdateValue(
    key: string,
    value: unknown,
    overrides: IConfigurationUpdateOverrides,
  ): unknown {
    this.validateConfigurationValue(key, value);
    const inspect = this.inspect(key, {
      resource: overrides.resource,
      overrideIdentifier: overrides.overrideIdentifiers?.[0],
    });

    return this.configurationValuesEqual(value, inspect.defaultValue)
      ? undefined
      : value;
  }

  private validateConfigurationModel(model: ConfigurationModel): void {
    for (const key of model.keys) {
      this.validateConfigurationValue(key, model.getValue(key));
    }

    for (const override of model.overrides) {
      const overrideModel = new ConfigurationModel(
        override.contents,
        [...override.keys],
        [],
      );
      for (const key of override.keys) {
        this.validateConfigurationValue(key, overrideModel.getValue(key));
      }
    }
  }

  private validateConfigurationValue(key: string, value: unknown): void {
    if (value === undefined) {
      return;
    }

    const schema = this.registry.getConfigurationProperties()[key];
    if (!schema) {
      return;
    }

    if (schema.enum?.length && !schema.enum.some(item => this.configurationValuesEqual(item, value))) {
      throw new Error(`Invalid value for configuration '${key}'.`);
    }

    if (schema.type && !this.matchesConfigurationSchemaType(value, schema)) {
      throw new Error(`Invalid type for configuration '${key}'.`);
    }
  }

  private matchesConfigurationSchemaType(
    value: unknown,
    schema: IRegisteredConfigurationPropertySchema,
  ): boolean {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    return types.some(type => {
      switch (type) {
        case "array":
          return Array.isArray(value);
        case "boolean":
          return typeof value === "boolean";
        case "integer":
          return Number.isInteger(value);
        case "null":
          return value === null;
        case "number":
          return typeof value === "number" && Number.isFinite(value);
        case "object":
          return isObjectRecord(value);
        case "string":
          return typeof value === "string";
        default:
          return false;
      }
    });
  }

  private normalizeOverrideIdentifiers(
    overrideIdentifiers: readonly string[] | null | undefined,
  ): string[] | undefined {
    if (!overrideIdentifiers?.length) {
      return undefined;
    }

    const normalized: string[] = [];
    for (const identifier of overrideIdentifiers) {
      if (!normalized.includes(identifier)) {
        normalized.push(identifier);
      }
    }

    return normalized.length ? normalized : undefined;
  }

  private configurationValuesEqual(left: unknown, right: unknown): boolean {
    if (Object.is(left, right)) {
      return true;
    }

    if (Array.isArray(left) && Array.isArray(right)) {
      return left.length === right.length
        && left.every((value, index) => this.configurationValuesEqual(value, right[index]));
    }

    if (isObjectRecord(left) && isObjectRecord(right)) {
      const leftKeys = Object.keys(left);
      const rightKeys = Object.keys(right);
      return leftKeys.length === rightKeys.length
        && leftKeys.every(key => this.configurationValuesEqual(left[key], right[key]));
    }

    return false;
  }

  private getLastValidUserConfiguration(): ConfigurationModel {
    return this.hasLoadedUserConfiguration
      ? ConfigurationModel.from(this.configuration.toData().userLocal)
      : ConfigurationModel.createEmptyModel();
  }

  private recordUserConfigurationParseError(error: unknown): void {
    this.userConfigurationParseError = error;
    console.error("Failed to parse user settings; keeping the last valid configuration.", error);
  }

  protected getUserConfigurationParseError(): unknown {
    return this.userConfigurationParseError;
  }

  private async readUserConfiguration(): Promise<ConfigurationModel> {
    if (!this.userSettingsResource || !this.userSettingsFileService) {
      return ConfigurationModel.createEmptyModel();
    }

    if (!await this.userSettingsFileService.exists(this.userSettingsResource)) {
      this.userConfigurationParseError = null;
      return ConfigurationModel.createEmptyModel();
    }

    try {
      const content = await this.userSettingsFileService.readFile(this.userSettingsResource);
      const raw = parseJsonc(new TextDecoder().decode(content.value) || "{}");
      if (!isObjectRecord(raw)) {
        throw new Error(`User settings must be a JSON object: ${this.userSettingsResource.toString()}`);
      }

      const model = parseConfigurationModel(raw);
      this.validateConfigurationModel(model);
      this.userConfigurationParseError = null;
      return model;
    } catch (error) {
      this.recordUserConfigurationParseError(error);
      return this.getLastValidUserConfiguration();
    }
  }
}
