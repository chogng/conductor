/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from "src/cs/base/common/lifecycle";
import {
	language,
	SUPPORTED_LANGUAGES,
	type LanguageCode,
} from "src/cs/base/common/platform";
import type { URI } from "src/cs/base/common/uri";
import { createDecorator } from "src/cs/platform/instantiation/common/instantiation";
import type { QuickPickItem } from "src/cs/platform/quickinput/common/quickInput";

export const ILanguagePackService =
	createDecorator<ILanguagePackService>("languagePackService");

export interface ILanguagePackItem extends QuickPickItem {
	readonly extensionId?: string;
}

export interface ILanguagePackService {
	readonly _serviceBrand: undefined;

	getAvailableLanguages(): Promise<ILanguagePackItem[]>;
	getInstalledLanguages(): Promise<ILanguagePackItem[]>;
	getBuiltInExtensionTranslationsUri(
		id: string,
		language: string,
	): Promise<URI | undefined>;
}

const BUILT_IN_LANGUAGE_NAMES: Record<LanguageCode, string> = {
	en: "English",
	zh: "Chinese",
};

export abstract class LanguagePackBaseService
	extends Disposable
	implements ILanguagePackService
{
	public declare readonly _serviceBrand: undefined;

	public async getAvailableLanguages(): Promise<ILanguagePackItem[]> {
		return this.getBuiltInLanguageItems();
	}

	public async getInstalledLanguages(): Promise<ILanguagePackItem[]> {
		return this.getBuiltInLanguageItems();
	}

	public async getBuiltInExtensionTranslationsUri(
		_id: string,
		_language: string,
	): Promise<URI | undefined> {
		return undefined;
	}

	protected getBuiltInLanguageItems(): ILanguagePackItem[] {
		return SUPPORTED_LANGUAGES.map(locale =>
			this.createQuickPickItem(locale, BUILT_IN_LANGUAGE_NAMES[locale]),
		);
	}

	protected createQuickPickItem(
		locale: string,
		languageName?: string,
	): ILanguagePackItem {
		const label = languageName ?? locale;
		let description: string | undefined;
		if (label !== locale) {
			description = `(${locale})`;
		}

		if (locale.toLowerCase() === language.toLowerCase()) {
			description ??= "";
			description += " (Current)";
		}

		return {
			id: locale,
			label,
			description,
		};
	}
}
