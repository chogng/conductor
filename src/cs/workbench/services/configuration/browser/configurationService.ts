/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import {
	IWorkbenchConfigurationService,
	NO_RESTRICTED_SETTINGS,
	onDidChangeRestrictedSettingsNone,
	type RestrictedSettings,
} from "src/cs/workbench/services/configuration/common/configuration";
import { ConfigurationService } from "src/cs/platform/configuration/common/configurationService";
import { InstantiationType, registerSingleton } from "src/cs/platform/instantiation/common/extensions";

export class BrowserConfigurationService extends ConfigurationService implements IWorkbenchConfigurationService {
	public readonly restrictedSettings: RestrictedSettings = NO_RESTRICTED_SETTINGS;
	public readonly onDidChangeRestrictedSettings = onDidChangeRestrictedSettingsNone;

	public constructor() {
		super();
	}

	public async whenRemoteConfigurationLoaded(): Promise<void> {
		await this.initialize(undefined);
	}

	public override async initialize(_arg?: unknown): Promise<void> {
		await super.initialize();
	}

	public isSettingAppliedForAllProfiles(_setting: string): boolean {
		return false;
	}
}

registerSingleton(IWorkbenchConfigurationService, BrowserConfigurationService, InstantiationType.Delayed);
