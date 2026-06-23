/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import {
	ConfigurationTarget,
	type IConfigurationOverrides,
	type IConfigurationValue,
} from "src/cs/platform/configuration/common/configuration";
import {
	Configuration,
	ConfigurationModel,
} from "src/cs/platform/configuration/common/configurationModels";
import {
	ConfigurationChannelClient,
	CONFIGURATION_CHANNEL_NAME,
} from "src/cs/platform/configuration/common/configurationIpc";
import { ConfigurationService } from "src/cs/platform/configuration/common/configurationService";
import { getUserSettingsResource } from "src/cs/platform/environment/common/environmentService";
import { IFileService } from "src/cs/platform/files/common/files";
import { InstantiationType, registerSingleton } from "src/cs/platform/instantiation/common/extensions";
import { IMainProcessService } from "src/cs/platform/ipc/common/mainProcessService";
import { INativeHostService } from "src/cs/platform/native/common/native";
import { UserConfiguration } from "src/cs/workbench/services/configuration/browser/configuration";
import {
	IWorkbenchConfigurationService,
	NO_RESTRICTED_SETTINGS,
	onDidChangeRestrictedSettingsNone,
	type RestrictedSettings,
} from "src/cs/workbench/services/configuration/common/configuration";

export class ElectronBrowserConfigurationService extends ConfigurationService implements IWorkbenchConfigurationService {
	public readonly restrictedSettings: RestrictedSettings = NO_RESTRICTED_SETTINGS;
	public readonly onDidChangeRestrictedSettings = onDidChangeRestrictedSettingsNone;

	private readonly configurationChannelClient: ConfigurationChannelClient;
	private readonly userConfiguration: Promise<UserConfiguration>;

	public constructor(
		@IFileService private readonly fileService: IFileService,
		@INativeHostService private readonly nativeHostService: INativeHostService,
		@IMainProcessService mainProcessService: IMainProcessService,
	) {
		super();

		this.configurationChannelClient = new ConfigurationChannelClient(
			mainProcessService.getChannel(CONFIGURATION_CHANNEL_NAME),
		);
		this.userConfiguration = this.createUserConfiguration();
		void this.reloadConfiguration().catch(error => {
			console.error("Failed to load user settings.", error);
		});
	}

	public override async reloadConfiguration(): Promise<void> {
		await super.reloadConfiguration();

		const previous = Configuration.parse(this.configuration.toData());
		const userConfiguration = await this.userConfiguration;
		const model = await userConfiguration.reload();
		const change = this.updateModelForTarget(ConfigurationTarget.USER_LOCAL, model);

		if (change.keys.length || change.overrides.length) {
			this.fireDidChangeConfiguration(change, previous, ConfigurationTarget.USER);
		}
	}

	public override inspect<T>(
		key: string,
		overrides: IConfigurationOverrides = {},
	): IConfigurationValue<Readonly<T>> {
		return super.inspect<T>(key, overrides);
	}

	protected override async writeConfigurationForTarget(
		target: ConfigurationTarget,
		model: ConfigurationModel,
	): Promise<void> {
		if (target !== ConfigurationTarget.USER && target !== ConfigurationTarget.USER_LOCAL) {
			return;
		}

		await this.configurationChannelClient.updateUserConfiguration(model.toRaw());
	}

	public async whenRemoteConfigurationLoaded(): Promise<void> {}

	public override async initialize(_arg?: unknown): Promise<void> {}

	public isSettingAppliedForAllProfiles(_setting: string): boolean {
		return false;
	}

	private async createUserConfiguration(): Promise<UserConfiguration> {
		const environment = await this.nativeHostService.getEnvironment();
		return new UserConfiguration(
			getUserSettingsResource(environment.userDataPath ?? ""),
			this.fileService,
		);
	}
}

registerSingleton(
	IWorkbenchConfigurationService,
	ElectronBrowserConfigurationService,
	InstantiationType.Delayed,
);
