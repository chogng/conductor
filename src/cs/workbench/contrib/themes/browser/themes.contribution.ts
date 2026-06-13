/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from "src/cs/base/common/lifecycle";
import { isThemeMode } from "src/cs/workbench/common/theme";
import {
	registerWorkbenchContribution2,
	WorkbenchPhase,
	type IWorkbenchContribution,
} from "src/cs/workbench/common/contributions";
import {
	ISettingsService,
	type ISettingsService as ISettingsServiceType,
} from "src/cs/workbench/services/settings/common/settings";
import {
	IWorkbenchThemeService,
	type IWorkbenchThemeService as IWorkbenchThemeServiceType,
} from "src/cs/workbench/services/themes/common/themeService";
import { registerThemesCommands } from "src/cs/workbench/contrib/themes/browser/themesCommands";
import "src/cs/workbench/services/themes/browser/themeService";

export const ThemesContributionId = "workbench.contrib.themes";

export class ThemesSettingsContribution extends Disposable implements IWorkbenchContribution {
	constructor(
		@ISettingsService private readonly settingsService: ISettingsServiceType,
		@IWorkbenchThemeService private readonly themeService: IWorkbenchThemeServiceType,
	) {
		super();

		this._register(registerThemesCommands());
		this.applySettings();
		this.themeService.start();
		this._register(this.settingsService.onDidChangeConductorSettings(() => this.applySettings()));
	}

	private applySettings(): void {
		const settings = this.settingsService.getConductorSettings();
		if (isThemeMode(settings?.theme)) {
			this.themeService.setTheme(settings.theme);
		}
		this.themeService.applyAppearance(settings);
	}
}

registerWorkbenchContribution2(
	ThemesContributionId,
	ThemesSettingsContribution,
	WorkbenchPhase.BlockStartup,
);
