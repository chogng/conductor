/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { localize } from "src/cs/nls";
import { CommandsRegistry } from "src/cs/platform/commands/common/commands";
import type { IDisposable } from "src/cs/base/common/lifecycle";
import { isLanguagePreference } from "src/cs/base/common/platform";
import { ILocaleService } from "src/cs/workbench/services/localization/common/locale";

export const SET_LANGUAGE_COMMAND_ID = "workbench.action.setLanguage";

export const registerLocalizationCommands = (): IDisposable =>
	CommandsRegistry.registerCommand({
		id: SET_LANGUAGE_COMMAND_ID,
		handler: async (accessor, language: unknown): Promise<void> => {
			if (!isLanguagePreference(language)) {
				return;
			}

			await accessor.get(ILocaleService).setLocale(language);
		},
		metadata: {
			description: localize("workbench.commands.setLanguage", "Set the workbench display language"),
		},
	});
