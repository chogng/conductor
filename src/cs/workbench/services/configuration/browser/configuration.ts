/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { isObjectRecord } from "src/cs/base/common/json";
import { parse as parseJsonc } from "src/cs/base/common/jsonc";
import { URI } from "src/cs/base/common/uri";
import {
	ConfigurationModel,
	parseConfigurationModel,
} from "src/cs/platform/configuration/common/configurationModels";
import { IFileService } from "src/cs/platform/files/common/files";

export class UserConfiguration {
	private lastValidConfiguration = ConfigurationModel.createEmptyModel();

	public constructor(
		private readonly settingsResource: URI,
		private readonly fileService: IFileService,
	) {}

	public async initialize(): Promise<ConfigurationModel> {
		return this.loadConfiguration();
	}

	public async reload(): Promise<ConfigurationModel> {
		return this.loadConfiguration();
	}

	public async loadConfiguration(): Promise<ConfigurationModel> {
		if (!await this.fileService.exists(this.settingsResource)) {
			this.lastValidConfiguration = ConfigurationModel.createEmptyModel();
			return this.lastValidConfiguration;
		}

		try {
			const content = await this.fileService.readFile(this.settingsResource);
			const raw = parseJsonc(new TextDecoder().decode(content.value) || "{}");
			if (!isObjectRecord(raw)) {
				throw new Error(`User settings must be a JSON object: ${this.settingsResource.toString()}`);
			}

			this.lastValidConfiguration = parseConfigurationModel(raw);
			return this.lastValidConfiguration;
		} catch (error) {
			console.error("Failed to parse user settings; keeping the last valid renderer configuration.", error);
			return this.lastValidConfiguration;
		}
	}

	public async writeConfiguration(model: ConfigurationModel): Promise<void> {
		await this.fileService.writeFile(
			this.settingsResource,
			`${JSON.stringify(model.toRaw(), null, 2)}\n`,
		);
	}
}
