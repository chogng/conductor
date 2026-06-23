import { Emitter, type Event } from "../../../base/common/event.js";
import { URI } from "../../../base/common/uri.js";
import { createDecorator } from "../../instantiation/common/instantiation.js";

export const IConfigurationService =
  createDecorator<IConfigurationService>("configurationService");

export interface IConfigurationOverrides {
  readonly overrideIdentifier?: string | null;
  readonly resource?: URI | null;
}

export type IConfigurationUpdateOverrides =
  Omit<IConfigurationOverrides, "overrideIdentifier"> & {
    readonly overrideIdentifiers?: readonly string[] | null;
  };

export const enum ConfigurationTarget {
  APPLICATION = 1,
  USER,
  USER_LOCAL,
  USER_REMOTE,
  WORKSPACE,
  WORKSPACE_FOLDER,
  DEFAULT,
  MEMORY,
}

export interface IConfigurationChange {
  readonly keys: readonly string[];
  readonly overrides: readonly (readonly [string, readonly string[]])[];
}

export interface IConfigurationChangeEvent {
  readonly source: ConfigurationTarget;
  readonly affectedKeys: ReadonlySet<string>;
  readonly change: IConfigurationChange;

  affectsConfiguration(configuration: string, overrides?: IConfigurationOverrides): boolean;
}

export interface IInspectValue<T> {
  readonly value?: T;
  readonly override?: T;
  readonly overrides?: readonly { readonly identifiers: readonly string[]; readonly value: T }[];
}

export interface IConfigurationValue<T> {
  readonly defaultValue?: T;
  readonly applicationValue?: T;
  readonly userValue?: T;
  readonly userLocalValue?: T;
  readonly userRemoteValue?: T;
  readonly workspaceValue?: T;
  readonly workspaceFolderValue?: T;
  readonly memoryValue?: T;
  readonly value?: T;

  readonly default?: IInspectValue<T>;
  readonly application?: IInspectValue<T>;
  readonly user?: IInspectValue<T>;
  readonly userLocal?: IInspectValue<T>;
  readonly userRemote?: IInspectValue<T>;
  readonly workspace?: IInspectValue<T>;
  readonly workspaceFolder?: IInspectValue<T>;
  readonly memory?: IInspectValue<T>;

  readonly overrideIdentifiers?: readonly string[];
}

export interface IConfigurationUpdateOptions {
  readonly donotNotifyError?: boolean;
  readonly handleDirtyFile?: "save" | "revert";
}

export interface IConfigurationModel {
  readonly contents: Record<string, unknown>;
  readonly keys: readonly string[];
  readonly overrides: readonly IOverrides[];
  readonly raw?: readonly Record<string, unknown>[] | Record<string, unknown>;
}

export interface IOverrides {
  keys: string[];
  readonly contents: Record<string, unknown>;
  readonly identifiers: string[];
}

export interface IConfigurationData {
  readonly defaults: IConfigurationModel;
  readonly application: IConfigurationModel;
  readonly userLocal: IConfigurationModel;
  readonly userRemote: IConfigurationModel;
  readonly workspace: IConfigurationModel;
  readonly folders: readonly (readonly [unknown, IConfigurationModel])[];
  readonly memory?: IConfigurationModel;
}

export interface IConfigurationCompareResult {
  readonly added: readonly string[];
  readonly removed: readonly string[];
  readonly updated: readonly string[];
  readonly overrides: readonly (readonly [string, readonly string[]])[];
}

export interface IConfigurationService {
  readonly _serviceBrand: undefined;
  readonly onDidChangeConfiguration: Event<IConfigurationChangeEvent>;

  getConfigurationData(): IConfigurationData | null;

  getValue<T>(): T;
  getValue<T>(section: string): T;
  getValue<T>(overrides: IConfigurationOverrides): T;
  getValue<T>(section: string, overrides: IConfigurationOverrides): T;

  updateValue(key: string, value: unknown): Promise<void>;
  updateValue(key: string, value: unknown, target: ConfigurationTarget): Promise<void>;
  updateValue(
    key: string,
    value: unknown,
    overrides: IConfigurationOverrides | IConfigurationUpdateOverrides,
  ): Promise<void>;
  updateValue(
    key: string,
    value: unknown,
    overrides: IConfigurationOverrides | IConfigurationUpdateOverrides,
    target: ConfigurationTarget,
    options?: IConfigurationUpdateOptions,
  ): Promise<void>;
  updateUserConfiguration(raw: Record<string, unknown>): Promise<void>;

  inspect<T>(key: string, overrides?: IConfigurationOverrides): IConfigurationValue<Readonly<T>>;

  reloadConfiguration(target?: ConfigurationTarget): Promise<void>;

  keys(): {
    default: readonly string[];
    user: readonly string[];
    workspace: readonly string[];
    workspaceFolder: readonly string[];
    memory?: readonly string[];
  };
}

export function isConfigurationOverrides(value: unknown): value is IConfigurationOverrides {
  if (!isObject(value)) {
    return false;
  }

  const overrideIdentifier = value["overrideIdentifier"];
  const resource = value["resource"];

  return (overrideIdentifier === undefined
    || overrideIdentifier === null
    || typeof overrideIdentifier === "string")
    && (resource === undefined || resource === null || resource instanceof URI);
}

export function isConfigurationUpdateOverrides(
  value: unknown,
): value is IConfigurationUpdateOverrides {
  if (!isObject(value) || "overrideIdentifier" in value) {
    return false;
  }

  const overrideIdentifiers = value["overrideIdentifiers"];
  const resource = value["resource"];

  return (overrideIdentifiers === undefined
    || overrideIdentifiers === null
    || isStringArray(overrideIdentifiers))
    && (resource === undefined || resource === null || resource instanceof URI);
}

export function ConfigurationTargetToString(target: ConfigurationTarget): string {
  switch (target) {
    case ConfigurationTarget.APPLICATION:
      return "APPLICATION";
    case ConfigurationTarget.USER:
      return "USER";
    case ConfigurationTarget.USER_LOCAL:
      return "USER_LOCAL";
    case ConfigurationTarget.USER_REMOTE:
      return "USER_REMOTE";
    case ConfigurationTarget.WORKSPACE:
      return "WORKSPACE";
    case ConfigurationTarget.WORKSPACE_FOLDER:
      return "WORKSPACE_FOLDER";
    case ConfigurationTarget.DEFAULT:
      return "DEFAULT";
    case ConfigurationTarget.MEMORY:
      return "MEMORY";
  }
}

export function getConfigValueInTarget<T>(
  configValue: IConfigurationValue<T>,
  target: ConfigurationTarget,
): T | undefined {
  switch (target) {
    case ConfigurationTarget.APPLICATION:
      return configValue.applicationValue;
    case ConfigurationTarget.USER:
      return configValue.userValue;
    case ConfigurationTarget.USER_LOCAL:
      return configValue.userLocalValue;
    case ConfigurationTarget.USER_REMOTE:
      return configValue.userRemoteValue;
    case ConfigurationTarget.WORKSPACE:
      return configValue.workspaceValue;
    case ConfigurationTarget.WORKSPACE_FOLDER:
      return configValue.workspaceFolderValue;
    case ConfigurationTarget.DEFAULT:
      return configValue.defaultValue;
    case ConfigurationTarget.MEMORY:
      return configValue.memoryValue;
  }
}

export function isConfigured<T>(
  configValue: IConfigurationValue<T>,
): configValue is IConfigurationValue<T> & { readonly value: T } {
  return configValue.applicationValue !== undefined
    || configValue.userValue !== undefined
    || configValue.userLocalValue !== undefined
    || configValue.userRemoteValue !== undefined
    || configValue.workspaceValue !== undefined
    || configValue.workspaceFolderValue !== undefined
    || configValue.memoryValue !== undefined;
}

export function toValuesTree(
  properties: Record<string, unknown>,
  conflictReporter: (message: string) => void,
): Record<string, unknown> {
  const root: Record<string, unknown> = Object.create(null);

  for (const key in properties) {
    addToValueTree(root, key, properties[key], conflictReporter);
  }

  return root;
}

export function getConfigurationValue<T>(
  contents: Record<string, unknown>,
  section: string | undefined,
): T | undefined {
  if (!section) {
    return contents as T;
  }

  let current: unknown = contents;
  for (const segment of section.split(".")) {
    if (!isObject(current)) {
      return undefined;
    }

    current = current[segment];
  }

  return current as T | undefined;
}

export function addToValueTree(
  root: Record<string, unknown>,
  key: string,
  value: unknown,
  conflictReporter: (message: string) => void,
): void {
  const segments = key.split(".");
  const last = segments.pop();

  if (!last) {
    conflictReporter(`Ignoring empty configuration key.`);
    return;
  }

  let current = root;
  for (const segment of segments) {
    const existing = current[segment];
    if (existing === undefined) {
      const next: Record<string, unknown> = Object.create(null);
      current[segment] = next;
      current = next;
      continue;
    }

    if (!isObject(existing) || Array.isArray(existing)) {
      conflictReporter(`Ignoring configuration '${key}' because '${segment}' is already a value.`);
      return;
    }

    current = existing;
  }

  if (isObject(current[last])) {
    conflictReporter(`Ignoring configuration '${key}' because it is already an object.`);
    return;
  }

  current[last] = value;
}

export function removeFromValueTree(
  root: Record<string, unknown>,
  key: string,
): void {
  const segments = key.split(".");
  const last = segments.pop();

  if (!last) {
    return;
  }

  const stack: Array<{ parent: Record<string, unknown>; key: string }> = [];
  let current = root;
  for (const segment of segments) {
    const next = current[segment];
    if (!isObject(next) || Array.isArray(next)) {
      return;
    }

    stack.push({ parent: current, key: segment });
    current = next;
  }

  delete current[last];

  for (let index = stack.length - 1; index >= 0; index--) {
    const { parent, key: segment } = stack[index];
    const value = parent[segment];
    if (isObject(value) && Object.keys(value).length === 0) {
      delete parent[segment];
    }
  }
}

export function createConfigurationChangeEvent(
  keys: Iterable<string>,
  source: ConfigurationTarget,
): IConfigurationChangeEvent {
  const affectedKeys = new Set(keys);
  return {
    source,
    affectedKeys,
    change: {
      keys: Array.from(affectedKeys),
      overrides: [],
    },
    affectsConfiguration(configuration: string): boolean {
      for (const key of affectedKeys) {
        if (key === configuration || key.startsWith(`${configuration}.`)) {
          return true;
        }
      }

      return false;
    },
  };
}

export abstract class AbstractConfigurationService implements IConfigurationService {
  declare readonly _serviceBrand: undefined;

  private readonly onDidChangeConfigurationEmitter =
    new Emitter<IConfigurationChangeEvent>();

  public readonly onDidChangeConfiguration = this.onDidChangeConfigurationEmitter.event;

  protected fireDidChangeConfiguration(
    keys: Iterable<string>,
    source: ConfigurationTarget,
  ): void {
    this.onDidChangeConfigurationEmitter.fire(
      createConfigurationChangeEvent(keys, source),
    );
  }

  public dispose(): void {
    this.onDidChangeConfigurationEmitter.dispose();
  }

  public abstract getConfigurationData(): IConfigurationData | null;

  public abstract getValue<T>(): T;
  public abstract getValue<T>(section: string): T;
  public abstract getValue<T>(overrides: IConfigurationOverrides): T;
  public abstract getValue<T>(section: string, overrides: IConfigurationOverrides): T;

  public abstract updateValue(key: string, value: unknown): Promise<void>;
  public abstract updateValue(
    key: string,
    value: unknown,
    target: ConfigurationTarget,
  ): Promise<void>;
  public abstract updateValue(
    key: string,
    value: unknown,
    overrides: IConfigurationOverrides | IConfigurationUpdateOverrides,
  ): Promise<void>;
  public abstract updateValue(
    key: string,
    value: unknown,
    overrides: IConfigurationOverrides | IConfigurationUpdateOverrides,
    target: ConfigurationTarget,
    options?: IConfigurationUpdateOptions,
  ): Promise<void>;
  public abstract updateUserConfiguration(raw: Record<string, unknown>): Promise<void>;

  public abstract inspect<T>(
    key: string,
    overrides?: IConfigurationOverrides,
  ): IConfigurationValue<Readonly<T>>;

  public abstract reloadConfiguration(target?: ConfigurationTarget): Promise<void>;

  public abstract keys(): {
    default: readonly string[];
    user: readonly string[];
    workspace: readonly string[];
    workspaceFolder: readonly string[];
    memory?: readonly string[];
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every(item => typeof item === "string");
}
