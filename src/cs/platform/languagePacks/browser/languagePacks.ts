/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { InstantiationType, registerSingleton } from "src/cs/platform/instantiation/common/extensions";
import { ILanguagePackService, LanguagePackBaseService } from "src/cs/platform/languagePacks/common/languagePacks";

export class WebLanguagePacksService extends LanguagePackBaseService {}

registerSingleton(
	ILanguagePackService,
	WebLanguagePacksService,
	InstantiationType.Delayed,
);
