/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import type { LanguagePreference } from "src/cs/base/common/platform";
import { createDecorator } from "src/cs/platform/instantiation/common/instantiation";

export const ILocaleService = createDecorator<ILocaleService>("localizationService");

export interface ILocaleService {
	readonly _serviceBrand: undefined;

	setLocale(language: LanguagePreference, skipReload?: boolean): Promise<void>;
	clearLocalePreference(): Promise<void>;
}

export const IActiveLanguagePackService =
	createDecorator<IActiveLanguagePackService>("activeLanguageService");

export interface IActiveLanguagePackService {
	readonly _serviceBrand: undefined;

	getExtensionIdProvidingCurrentLocale(): Promise<string | undefined>;
}
