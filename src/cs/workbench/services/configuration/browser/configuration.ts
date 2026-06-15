/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { URI } from "src/cs/base/common/uri";
import {
	ConfigurationModel,
	parseConfigurationModel,
} from "src/cs/platform/configuration/common/configurationModels";
import { IFileService } from "src/cs/platform/files/common/files";

export class UserConfiguration {
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
			return ConfigurationModel.createEmptyModel();
		}

		const content = await this.fileService.readFile(this.settingsResource, { encoding: "utf8" });
		const raw = JSON.parse(content.value || "{}") as unknown;
		if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
			throw new Error(`User settings must be a JSON object: ${this.settingsResource.toString()}`);
		}

		return parseConfigurationModel(raw as Record<string, unknown>);
	}

	public async writeConfiguration(model: ConfigurationModel): Promise<void> {
		await this.fileService.writeFile(
			this.settingsResource,
			`${JSON.stringify(model.toRaw(), null, 2)}\n`,
		);
	}
}
