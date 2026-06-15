/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { URI } from "src/cs/base/common/uri";
import { Event, type Event as EventType } from "src/cs/base/common/event";
import { IConfigurationService } from "src/cs/platform/configuration/common/configuration";
import { ConfigurationScope } from "src/cs/platform/configuration/common/configurationRegistry";
import { refineServiceDecorator } from "src/cs/platform/instantiation/common/instantiation";

export const FOLDER_CONFIG_FOLDER_NAME = ".vscode";
export const FOLDER_SETTINGS_NAME = "settings";
export const FOLDER_SETTINGS_PATH = `${FOLDER_CONFIG_FOLDER_NAME}/${FOLDER_SETTINGS_NAME}.json`;

export const defaultSettingsSchemaId = "vscode://schemas/settings/default";
export const userSettingsSchemaId = "vscode://schemas/settings/user";
export const profileSettingsSchemaId = "vscode://schemas/settings/profile";
export const machineSettingsSchemaId = "vscode://schemas/settings/machine";
export const workspaceSettingsSchemaId = "vscode://schemas/settings/workspace";
export const folderSettingsSchemaId = "vscode://schemas/settings/folder";
export const launchSchemaId = "vscode://schemas/launch";
export const tasksSchemaId = "vscode://schemas/tasks";
export const mcpSchemaId = "vscode://schemas/mcp";

export const APPLICATION_SCOPES = [
	ConfigurationScope.APPLICATION,
	ConfigurationScope.APPLICATION_MACHINE,
];
export const PROFILE_SCOPES = [
	ConfigurationScope.MACHINE,
	ConfigurationScope.WINDOW,
	ConfigurationScope.RESOURCE,
	ConfigurationScope.LANGUAGE_OVERRIDABLE,
	ConfigurationScope.MACHINE_OVERRIDABLE,
];
export const LOCAL_MACHINE_PROFILE_SCOPES = [
	ConfigurationScope.WINDOW,
	ConfigurationScope.RESOURCE,
	ConfigurationScope.LANGUAGE_OVERRIDABLE,
];
export const LOCAL_MACHINE_SCOPES = [
	ConfigurationScope.APPLICATION,
	...LOCAL_MACHINE_PROFILE_SCOPES,
];
export const REMOTE_MACHINE_SCOPES = [
	ConfigurationScope.MACHINE,
	ConfigurationScope.APPLICATION_MACHINE,
	ConfigurationScope.WINDOW,
	ConfigurationScope.RESOURCE,
	ConfigurationScope.LANGUAGE_OVERRIDABLE,
	ConfigurationScope.MACHINE_OVERRIDABLE,
];
export const WORKSPACE_SCOPES = [
	ConfigurationScope.WINDOW,
	ConfigurationScope.RESOURCE,
	ConfigurationScope.LANGUAGE_OVERRIDABLE,
	ConfigurationScope.MACHINE_OVERRIDABLE,
];
export const FOLDER_SCOPES = [
	ConfigurationScope.RESOURCE,
	ConfigurationScope.LANGUAGE_OVERRIDABLE,
	ConfigurationScope.MACHINE_OVERRIDABLE,
];

export const TASKS_CONFIGURATION_KEY = "tasks";
export const LAUNCH_CONFIGURATION_KEY = "launch";
export const MCP_CONFIGURATION_KEY = "mcp";

export const WORKSPACE_STANDALONE_CONFIGURATIONS: Record<string, string> = Object.create(null);
WORKSPACE_STANDALONE_CONFIGURATIONS[TASKS_CONFIGURATION_KEY] =
	`${FOLDER_CONFIG_FOLDER_NAME}/${TASKS_CONFIGURATION_KEY}.json`;
WORKSPACE_STANDALONE_CONFIGURATIONS[LAUNCH_CONFIGURATION_KEY] =
	`${FOLDER_CONFIG_FOLDER_NAME}/${LAUNCH_CONFIGURATION_KEY}.json`;
WORKSPACE_STANDALONE_CONFIGURATIONS[MCP_CONFIGURATION_KEY] =
	`${FOLDER_CONFIG_FOLDER_NAME}/${MCP_CONFIGURATION_KEY}.json`;

export const USER_STANDALONE_CONFIGURATIONS: Record<string, string> = Object.create(null);
USER_STANDALONE_CONFIGURATIONS[TASKS_CONFIGURATION_KEY] = `${TASKS_CONFIGURATION_KEY}.json`;
USER_STANDALONE_CONFIGURATIONS[MCP_CONFIGURATION_KEY] = `${MCP_CONFIGURATION_KEY}.json`;

export type ConfigurationKey = {
	readonly type: "defaults" | "user" | "workspaces" | "folder";
	readonly key: string;
};

export interface IConfigurationCache {
	needsCaching(resource: URI): boolean;
	read(key: ConfigurationKey): Promise<string>;
	write(key: ConfigurationKey, content: string): Promise<void>;
	remove(key: ConfigurationKey): Promise<void>;
}

export type RestrictedSettings = {
	readonly default: readonly string[];
	readonly application?: readonly string[];
	readonly userLocal?: readonly string[];
	readonly userRemote?: readonly string[];
	readonly workspace?: readonly string[];
	readonly workspaceFolder?: ReadonlyMap<string, readonly string[]>;
};

export const IWorkbenchConfigurationService =
	refineServiceDecorator<IConfigurationService, IWorkbenchConfigurationService>(
		IConfigurationService,
	);

export interface IWorkbenchConfigurationService extends IConfigurationService {
	readonly restrictedSettings: RestrictedSettings;
	readonly onDidChangeRestrictedSettings: EventType<RestrictedSettings>;

	whenRemoteConfigurationLoaded(): Promise<void>;
	initialize(arg: unknown): Promise<void>;
	isSettingAppliedForAllProfiles(setting: string): boolean;
}

export const NO_RESTRICTED_SETTINGS: RestrictedSettings = {
	default: [],
};

export const onDidChangeRestrictedSettingsNone =
	Event.None as EventType<RestrictedSettings>;

export const TASKS_DEFAULT = "{\n\t\"version\": \"2.0.0\",\n\t\"tasks\": []\n}";

export const APPLY_ALL_PROFILES_SETTING = "workbench.settings.applyToAllProfiles";
