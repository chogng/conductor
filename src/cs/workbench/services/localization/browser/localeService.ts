/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import {
	isLanguagePreference,
	language,
	type LanguagePreference,
} from "src/cs/base/common/platform";
import { InstantiationType, registerSingleton } from "src/cs/platform/instantiation/common/extensions";
import type { BrandedService } from "src/cs/platform/instantiation/common/instantiation";
import { ILanguagePackService } from "src/cs/platform/languagePacks/common/languagePacks";
import { INativeHostService, type INativeHostService as INativeHostServiceType } from "src/cs/platform/native/common/native";
import { ISettingsService, type ISettingsService as ISettingsServiceType } from "src/cs/workbench/services/settings/common/settings";
import {
	IActiveLanguagePackService,
	ILocaleService,
} from "src/cs/workbench/services/localization/common/locale";

export class BrowserLocaleService implements ILocaleService {
	public declare readonly _serviceBrand: undefined;

	public constructor(
		@ISettingsService private readonly settingsService: ISettingsServiceType,
		@INativeHostService private readonly nativeHostService: INativeHostServiceType | undefined,
	) {}

	public async setLocale(language: LanguagePreference, skipReload = false): Promise<void> {
		if (!isLanguagePreference(language)) {
			return;
		}

		const currentLanguage = this.settingsService.getSettingsViewInput()?.language;
		if (currentLanguage === language) {
			return;
		}

		await this.settingsService.updateSettings({ language });
		if (!skipReload) {
			await this.reloadWorkbench();
		}
	}

	public clearLocalePreference(): Promise<void> {
		return this.setLocale("system");
	}

	private async reloadWorkbench(): Promise<void> {
		if (this.nativeHostService) {
			await this.nativeHostService.reloadWindow().catch(() => undefined);
			return;
		}

		window.location.reload();
	}
}

class BrowserActiveLanguagePackService implements IActiveLanguagePackService {
	public declare readonly _serviceBrand: undefined;

	public constructor(
		@ILanguagePackService private readonly languagePackService: ILanguagePackService,
	) {}

	public async getExtensionIdProvidingCurrentLocale(): Promise<string | undefined> {
		const currentLanguage = language.toLowerCase();
		const installedLanguages = await this.languagePackService.getInstalledLanguages();
		return installedLanguages.find(candidate =>
			candidate.id.toLowerCase() === currentLanguage
		)?.extensionId;
	}
}

registerSingleton(
	ILocaleService,
	BrowserLocaleService as unknown as new (...services: BrandedService[]) => ILocaleService,
	InstantiationType.Delayed,
);
registerSingleton(
	IActiveLanguagePackService,
	BrowserActiveLanguagePackService,
	InstantiationType.Delayed,
);
