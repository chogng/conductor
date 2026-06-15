import {
  ConfigurationTarget,
  getConfigurationValue,
  type IConfigurationChange,
  type IConfigurationChangeEvent,
  type IConfigurationCompareResult,
  type IConfigurationData,
  type IConfigurationModel,
  type IConfigurationOverrides,
  type IConfigurationValue,
  type IInspectValue,
  type IOverrides,
  removeFromValueTree,
  toValuesTree,
} from "./configuration.js";
import { overrideIdentifiersFromKey } from "./configurationRegistry.js";

export class ConfigurationModel implements IConfigurationModel {
  public static createEmptyModel(): ConfigurationModel {
    return new ConfigurationModel({}, [], []);
  }

  public static from(model: IConfigurationModel): ConfigurationModel {
    return new ConfigurationModel(
      deepClone(model.contents),
      [...model.keys],
      model.overrides.map(cloneOverride),
      model.raw,
    );
  }

  private readonly overrideConfigurations = new Map<string, ConfigurationModel>();

  constructor(
    private readonly modelContents: Record<string, unknown>,
    private readonly modelKeys: string[],
    private readonly modelOverrides: IOverrides[],
    private readonly modelRaw?: readonly Record<string, unknown>[] | Record<string, unknown>,
  ) {}

  public get contents(): Record<string, unknown> {
    return this.modelContents;
  }

  public get keys(): string[] {
    return this.modelKeys;
  }

  public get overrides(): IOverrides[] {
    return this.modelOverrides;
  }

  public get raw(): readonly Record<string, unknown>[] | Record<string, unknown> | undefined {
    return this.modelRaw;
  }

  public isEmpty(): boolean {
    return this.keys.length === 0
      && Object.keys(this.contents).length === 0
      && this.overrides.length === 0;
  }

  public getValue<T>(section?: string): T | undefined {
    return getConfigurationValue<T>(this.contents, section);
  }

  public getOverrideValue<T>(section: string | undefined, overrideIdentifier: string): T | undefined {
    const contents = this.getContentsForOverrideIdentifier(overrideIdentifier);
    return contents ? getConfigurationValue<T>(contents, section) : undefined;
  }

  public getKeysForOverrideIdentifier(identifier: string): string[] {
    const keys: string[] = [];
    for (const override of this.overrides) {
      if (override.identifiers.includes(identifier)) {
        keys.push(...override.keys);
      }
    }

    return distinct(keys);
  }

  public getAllOverrideIdentifiers(): string[] {
    const identifiers: string[] = [];
    for (const override of this.overrides) {
      identifiers.push(...override.identifiers);
    }

    return distinct(identifiers);
  }

  public override(identifier: string): ConfigurationModel {
    const existing = this.overrideConfigurations.get(identifier);
    if (existing) {
      return existing;
    }

    const overrideContents = this.getContentsForOverrideIdentifier(identifier);
    if (!overrideContents || Object.keys(overrideContents).length === 0) {
      this.overrideConfigurations.set(identifier, this);
      return this;
    }

    const contents = deepClone(this.contents);
    mergeContents(contents, overrideContents);
    const model = new ConfigurationModel(contents, [...this.keys], this.overrides.map(cloneOverride));
    this.overrideConfigurations.set(identifier, model);
    return model;
  }

  public merge(...others: ConfigurationModel[]): ConfigurationModel {
    const contents = deepClone(this.contents);
    const keys = [...this.keys];
    const overrides = this.overrides.map(cloneOverride);

    for (const other of others) {
      mergeContents(contents, other.contents);
      for (const key of other.keys) {
        if (!keys.includes(key)) {
          keys.push(key);
        }
      }

      for (const otherOverride of other.overrides) {
        const existing = overrides.find(override =>
          arraysEqual(override.identifiers, otherOverride.identifiers));
        if (existing) {
          mergeContents(existing.contents, otherOverride.contents);
          const mergedKeys = distinct([...existing.keys, ...otherOverride.keys]);
          existing.keys.splice(0, existing.keys.length, ...mergedKeys);
        } else {
          overrides.push(cloneOverride(otherOverride));
        }
      }
    }

    return new ConfigurationModel(contents, keys, overrides);
  }

  public setValue(key: string, value: unknown): void {
    addToModel(this.contents, key, value);
    if (!this.keys.includes(key)) {
      this.keys.push(key);
    }
    this.overrideConfigurations.clear();
  }

  public setOverrideValue(
    overrideIdentifiers: readonly string[],
    key: string,
    value: unknown,
  ): void {
    const override = this.getOrCreateOverride(overrideIdentifiers);
    addToModel(override.contents, key, value);
    if (!override.keys.includes(key)) {
      override.keys.push(key);
    }
    this.overrideConfigurations.clear();
  }

  public removeValue(key: string): void {
    removeFromValueTree(this.contents, key);
    const index = this.keys.indexOf(key);
    if (index !== -1) {
      this.keys.splice(index, 1);
    }
    this.overrideConfigurations.clear();
  }

  public removeOverrideValue(overrideIdentifiers: readonly string[], key: string): void {
    const override = this.overrides.find(item =>
      arraysEqual(item.identifiers, overrideIdentifiers));
    if (!override) {
      return;
    }

    removeFromValueTree(override.contents, key);
    const keyIndex = override.keys.indexOf(key);
    if (keyIndex !== -1) {
      override.keys.splice(keyIndex, 1);
    }

    if (override.keys.length === 0) {
      const overrideIndex = this.overrides.indexOf(override);
      this.overrides.splice(overrideIndex, 1);
    }

    this.overrideConfigurations.clear();
  }


  public toJSON(): IConfigurationModel {
    return {
      contents: this.contents,
      keys: this.keys,
      overrides: this.overrides,
      raw: this.raw,
    };
  }

  public toRaw(): Record<string, unknown> {
    const raw: Record<string, unknown> = {};

    for (const key of this.keys) {
      raw[key] = this.getValue(key);
    }

    for (const override of this.overrides) {
      const overrideRaw: Record<string, unknown> = {};
      const overrideModel = new ConfigurationModel(
        override.contents,
        [...override.keys],
        [],
      );

      for (const key of override.keys) {
        overrideRaw[key] = overrideModel.getValue(key);
      }

      raw[`[${override.identifiers.join(",")}]`] = overrideRaw;
    }

    return raw;
  }

  private getContentsForOverrideIdentifier(identifier: string): Record<string, unknown> | undefined {
    let contents: Record<string, unknown> | undefined;
    let identifierOnlyContents: Record<string, unknown> | undefined;

    for (const override of this.overrides) {
      if (!override.identifiers.includes(identifier)) {
        continue;
      }

      if (override.identifiers.length === 1) {
        identifierOnlyContents = override.contents;
        continue;
      }

      contents ??= {};
      mergeContents(contents, override.contents);
    }

    if (identifierOnlyContents) {
      contents ??= {};
      mergeContents(contents, identifierOnlyContents);
    }

    return contents;
  }

  private getOrCreateOverride(overrideIdentifiers: readonly string[]): IOverrides {
    const existing = this.overrides.find(override =>
      arraysEqual(override.identifiers, overrideIdentifiers));
    if (existing) {
      return existing;
    }

    const override: IOverrides = {
      identifiers: [...overrideIdentifiers],
      keys: [],
      contents: {},
    };
    this.overrides.push(override);
    return override;
  }
}

export class ConfigurationModelParser {
  private model = ConfigurationModel.createEmptyModel();

  public get configurationModel(): ConfigurationModel {
    return this.model;
  }

  public parseRaw(raw: Record<string, unknown>): void {
    const contents: Record<string, unknown> = {};
    const properties: Record<string, unknown> = {};
    const overrides: IOverrides[] = [];

    for (const [key, value] of Object.entries(raw)) {
      const overrideIdentifiers = overrideIdentifiersFromKey(key);
      if (overrideIdentifiers.length) {
        if (isRecord(value)) {
          overrides.push(this.parseOverride(overrideIdentifiers, value));
        }
        continue;
      }

      properties[key] = value;
    }

    mergeContents(contents, toValuesTree(properties, () => undefined));
    this.model = new ConfigurationModel(contents, Object.keys(properties), overrides, raw);
  }

  private parseOverride(
    identifiers: readonly string[],
    raw: Record<string, unknown>,
  ): IOverrides {
    const contents = toValuesTree(raw, () => undefined);
    return {
      identifiers: [...identifiers],
      keys: Object.keys(raw),
      contents,
    };
  }
}

export class Configuration {
  constructor(
    private defaultConfiguration: ConfigurationModel,
    private applicationConfiguration: ConfigurationModel,
    private localUserConfiguration: ConfigurationModel,
    private remoteUserConfiguration: ConfigurationModel,
    private workspaceConfiguration: ConfigurationModel,
    private memoryConfiguration: ConfigurationModel,
  ) {}

  public static parse(data: IConfigurationData): Configuration {
    return new Configuration(
      ConfigurationModel.from(data.defaults),
      ConfigurationModel.from(data.application),
      ConfigurationModel.from(data.userLocal),
      ConfigurationModel.from(data.userRemote),
      ConfigurationModel.from(data.workspace),
      ConfigurationModel.from(data.memory ?? ConfigurationModel.createEmptyModel()),
    );
  }

  public getValue<T>(section: string | undefined, overrides: IConfigurationOverrides = {}): T | undefined {
    return this.getConsolidatedConfigurationModel(overrides).getValue<T>(section);
  }

  public inspect<T>(key: string, overrides: IConfigurationOverrides = {}): IConfigurationValue<T> {
    const overrideIdentifier = overrides.overrideIdentifier ?? undefined;
    const defaultConfiguration = this.defaultConfigurationFor(overrideIdentifier);
    const applicationConfiguration = this.applicationConfigurationFor(overrideIdentifier);
    const userConfiguration = this.userConfigurationFor(overrideIdentifier);
    const workspaceConfiguration = this.workspaceConfigurationFor(overrideIdentifier);
    const memoryConfiguration = this.memoryConfigurationFor(overrideIdentifier);
    const consolidated = defaultConfiguration
      .merge(applicationConfiguration, userConfiguration, workspaceConfiguration, memoryConfiguration);
    const overrideIdentifiers = this.getOverrideIdentifiers(key, consolidated);

    return {
      defaultValue: defaultConfiguration.getValue<T>(key),
      applicationValue: applicationConfiguration.getValue<T>(key),
      userValue: userConfiguration.getValue<T>(key),
      userLocalValue: this.localUserConfigurationFor(overrideIdentifier).getValue<T>(key),
      userRemoteValue: this.remoteUserConfigurationFor(overrideIdentifier).getValue<T>(key),
      workspaceValue: workspaceConfiguration.getValue<T>(key),
      memoryValue: memoryConfiguration.getValue<T>(key),
      value: consolidated.getValue<T>(key),
      default: this.inspectModel<T>(defaultConfiguration, key, overrideIdentifier),
      application: this.inspectModel<T>(applicationConfiguration, key, overrideIdentifier),
      user: this.inspectModel<T>(userConfiguration, key, overrideIdentifier),
      userLocal: this.inspectModel<T>(this.localUserConfiguration, key, overrideIdentifier),
      userRemote: this.inspectModel<T>(this.remoteUserConfiguration, key, overrideIdentifier),
      workspace: this.inspectModel<T>(this.workspaceConfiguration, key, overrideIdentifier),
      memory: this.inspectModel<T>(this.memoryConfiguration, key, overrideIdentifier),
      overrideIdentifiers,
    };
  }

  public updateValue(key: string, value: unknown): IConfigurationChange {
    const previous = this.memoryConfiguration;
    const next = previous.merge();

    if (value === undefined) {
      next.removeValue(key);
    } else {
      next.setValue(key, value);
    }

    return this.compareAndUpdateMemoryConfiguration(next);
  }

  public keys(): {
    default: string[];
    user: string[];
    workspace: string[];
    workspaceFolder: string[];
    memory: string[];
  } {
    return {
      default: [...this.defaultConfiguration.keys],
      user: [...this.userConfiguration.keys],
      workspace: [...this.workspaceConfiguration.keys],
      workspaceFolder: [],
      memory: [...this.memoryConfiguration.keys],
    };
  }

  public toData(): IConfigurationData {
    return {
      defaults: this.defaultConfiguration.toJSON(),
      application: this.applicationConfiguration.toJSON(),
      userLocal: this.localUserConfiguration.toJSON(),
      userRemote: this.remoteUserConfiguration.toJSON(),
      workspace: this.workspaceConfiguration.toJSON(),
      folders: [],
      memory: this.memoryConfiguration.toJSON(),
    };
  }

  public compareAndUpdateDefaultConfiguration(defaults: ConfigurationModel): IConfigurationChange {
    const change = compare(this.defaultConfiguration, defaults);
    this.defaultConfiguration = defaults;
    return compareResultToChange(change);
  }

  public compareAndUpdateApplicationConfiguration(application: ConfigurationModel): IConfigurationChange {
    const change = compare(this.applicationConfiguration, application);
    this.applicationConfiguration = application;
    return compareResultToChange(change);
  }

  public compareAndUpdateLocalUserConfiguration(user: ConfigurationModel): IConfigurationChange {
    const change = compare(this.localUserConfiguration, user);
    this.localUserConfiguration = user;
    return compareResultToChange(change);
  }

  public compareAndUpdateRemoteUserConfiguration(user: ConfigurationModel): IConfigurationChange {
    const change = compare(this.remoteUserConfiguration, user);
    this.remoteUserConfiguration = user;
    return compareResultToChange(change);
  }

  public compareAndUpdateWorkspaceConfiguration(workspace: ConfigurationModel): IConfigurationChange {
    const change = compare(this.workspaceConfiguration, workspace);
    this.workspaceConfiguration = workspace;
    return compareResultToChange(change);
  }

  public compareAndUpdateMemoryConfiguration(memory: ConfigurationModel): IConfigurationChange {
    const change = compare(this.memoryConfiguration, memory);
    this.memoryConfiguration = memory;
    return compareResultToChange(change);
  }

  private getConsolidatedConfigurationModel(overrides: IConfigurationOverrides): ConfigurationModel {
    const overrideIdentifier = overrides.overrideIdentifier ?? undefined;
    return this.defaultConfigurationFor(overrideIdentifier)
      .merge(
        this.applicationConfigurationFor(overrideIdentifier),
        this.userConfigurationFor(overrideIdentifier),
        this.workspaceConfigurationFor(overrideIdentifier),
        this.memoryConfigurationFor(overrideIdentifier),
      );
  }

  private inspectModel<T>(
    model: ConfigurationModel,
    key: string,
    overrideIdentifier: string | undefined,
  ): IInspectValue<T> {
    return {
      value: model.getValue<T>(key),
      override: overrideIdentifier
        ? model.getOverrideValue<T>(key, overrideIdentifier)
        : undefined,
      overrides: this.getOverrideValues<T>(key, model),
    };
  }

  private getOverrideValues<T>(key: string, model: ConfigurationModel) {
    const values: Array<{ readonly identifiers: readonly string[]; readonly value: T }> = [];
    for (const override of model.overrides) {
      const value = new ConfigurationModel(
        override.contents,
        [...override.keys],
        [],
      ).getValue<T>(key);

      if (value !== undefined) {
        values.push({ identifiers: override.identifiers, value });
      }
    }

    return values.length ? values : undefined;
  }

  private getOverrideIdentifiers(key: string, model: ConfigurationModel): string[] | undefined {
    const identifiers = model
      .getAllOverrideIdentifiers()
      .filter(identifier => model.getOverrideValue(key, identifier) !== undefined);
    return identifiers.length ? identifiers : undefined;
  }

  private get userConfiguration(): ConfigurationModel {
    return this.localUserConfiguration.merge(this.remoteUserConfiguration);
  }

  private defaultConfigurationFor(identifier: string | undefined): ConfigurationModel {
    return identifier ? this.defaultConfiguration.override(identifier) : this.defaultConfiguration;
  }

  private applicationConfigurationFor(identifier: string | undefined): ConfigurationModel {
    return identifier ? this.applicationConfiguration.override(identifier) : this.applicationConfiguration;
  }

  private localUserConfigurationFor(identifier: string | undefined): ConfigurationModel {
    return identifier ? this.localUserConfiguration.override(identifier) : this.localUserConfiguration;
  }

  private remoteUserConfigurationFor(identifier: string | undefined): ConfigurationModel {
    return identifier ? this.remoteUserConfiguration.override(identifier) : this.remoteUserConfiguration;
  }

  private userConfigurationFor(identifier: string | undefined): ConfigurationModel {
    return identifier ? this.userConfiguration.override(identifier) : this.userConfiguration;
  }

  private workspaceConfigurationFor(identifier: string | undefined): ConfigurationModel {
    return identifier ? this.workspaceConfiguration.override(identifier) : this.workspaceConfiguration;
  }

  private memoryConfigurationFor(identifier: string | undefined): ConfigurationModel {
    return identifier ? this.memoryConfiguration.override(identifier) : this.memoryConfiguration;
  }
}

export class ConfigurationChangeEvent implements IConfigurationChangeEvent {
  public readonly affectedKeys = new Set<string>();
  public source: ConfigurationTarget;

  constructor(
    public readonly change: IConfigurationChange,
    private readonly previous: Configuration,
    private readonly current: Configuration,
    source: ConfigurationTarget,
  ) {
    this.source = source;
    for (const key of change.keys) {
      this.affectedKeys.add(key);
    }
    for (const [, keys] of change.overrides) {
      for (const key of keys) {
        this.affectedKeys.add(key);
      }
    }
  }

  public affectsConfiguration(configuration: string, overrides?: IConfigurationOverrides): boolean {
    if (!this.affectsKey(configuration)) {
      return false;
    }

    if (!overrides) {
      return true;
    }

    return !equals(
      this.previous.getValue(configuration, overrides),
      this.current.getValue(configuration, overrides),
    );
  }

  private affectsKey(configuration: string): boolean {
    for (const key of this.affectedKeys) {
      if (key === configuration || key.startsWith(`${configuration}.`)) {
        return true;
      }
    }

    return false;
  }
}

export function parseConfigurationModel(raw: Record<string, unknown>): ConfigurationModel {
  const parser = new ConfigurationModelParser();
  parser.parseRaw(raw);
  return parser.configurationModel;
}

export function compare(
  from: ConfigurationModel | undefined,
  to: ConfigurationModel | undefined,
): IConfigurationCompareResult {
  const added = to ? (from ? to.keys.filter(key => !from.keys.includes(key)) : [...to.keys]) : [];
  const removed = from ? (to ? from.keys.filter(key => !to.keys.includes(key)) : [...from.keys]) : [];
  const updated: string[] = [];

  if (from && to) {
    for (const key of from.keys) {
      if (to.keys.includes(key)
        && !equals(from.getValue(key), to.getValue(key))) {
        updated.push(key);
      }
    }
  }

  return {
    added,
    removed,
    updated,
    overrides: compareOverrides(from, to),
  };
}

export function modelFromRaw(raw: Record<string, unknown>): ConfigurationModel {
  return parseConfigurationModel(raw);
}

function compareOverrides(
  from: ConfigurationModel | undefined,
  to: ConfigurationModel | undefined,
): Array<readonly [string, readonly string[]]> {
  const overrides: Array<readonly [string, readonly string[]]> = [];
  const fromIdentifiers = from?.getAllOverrideIdentifiers() ?? [];
  const toIdentifiers = to?.getAllOverrideIdentifiers() ?? [];

  for (const identifier of toIdentifiers) {
    if (!fromIdentifiers.includes(identifier)) {
      overrides.push([identifier, to?.getKeysForOverrideIdentifier(identifier) ?? []]);
    }
  }

  for (const identifier of fromIdentifiers) {
    if (!toIdentifiers.includes(identifier)) {
      overrides.push([identifier, from?.getKeysForOverrideIdentifier(identifier) ?? []]);
    }
  }

  for (const identifier of fromIdentifiers) {
    if (!toIdentifiers.includes(identifier) || !from || !to) {
      continue;
    }

    const result = compare(from.override(identifier), to.override(identifier));
    const keys = [...result.added, ...result.removed, ...result.updated];
    if (keys.length) {
      overrides.push([identifier, keys]);
    }
  }

  return overrides;
}

function compareResultToChange(result: IConfigurationCompareResult): IConfigurationChange {
  return {
    keys: [...result.added, ...result.removed, ...result.updated],
    overrides: result.overrides,
  };
}

function addToModel(contents: Record<string, unknown>, key: string, value: unknown): void {
  const tree = toValuesTree({ [key]: value }, () => undefined);
  mergeContents(contents, tree);
}

function mergeContents(source: Record<string, unknown>, target: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(target)) {
    const existing = source[key];
    if (isRecord(existing) && isRecord(value)) {
      mergeContents(existing, value);
      continue;
    }

    source[key] = deepClone(value);
  }
}

function cloneOverride(override: IOverrides): IOverrides {
  return {
    identifiers: [...override.identifiers],
    keys: [...override.keys],
    contents: deepClone(override.contents),
  };
}

function distinct(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function arraysEqual(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function deepClone<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map(item => deepClone(item)) as T;
  }

  if (isRecord(value)) {
    const clone: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value)) {
      clone[key] = deepClone(child);
    }
    return clone as T;
  }

  return value;
}

function equals(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) {
    return true;
  }

  if (Array.isArray(left) && Array.isArray(right)) {
    return left.length === right.length
      && left.every((value, index) => equals(value, right[index]));
  }

  if (isRecord(left) && isRecord(right)) {
    const leftKeys = Object.keys(left);
    const rightKeys = Object.keys(right);
    return leftKeys.length === rightKeys.length
      && leftKeys.every(key => equals(left[key], right[key]));
  }

  return false;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
