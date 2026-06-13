/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore, type IDisposable } from "src/cs/base/common/lifecycle";
import { localize } from "src/cs/nls";
import { Action2, registerAction2 } from "src/cs/platform/actions/common/actions";
import { CommandsRegistry } from "src/cs/platform/commands/common/commands";
import type { ServicesAccessor } from "src/cs/platform/instantiation/common/instantiation";
import { isThemeMode } from "src/cs/workbench/common/theme";
import {
	ISettingsService,
	type ConductorSettings,
} from "src/cs/workbench/services/settings/common/settings";
import {
	DEFAULT_WORKBENCH_BACKGROUND_COLOR,
	normalizeWorkbenchBackgroundColor,
	ThemeCommandId,
} from "src/cs/workbench/services/themes/common/themeService";

export const registerThemesCommands = (): IDisposable => {
	const disposables = new DisposableStore();

	disposables.add(CommandsRegistry.registerCommand({
		id: ThemeCommandId.setTheme,
		metadata: {
			description: localize("themes.commands.setTheme.description", "Set the workbench theme mode."),
			args: [{
				name: "theme",
				description: localize("themes.commands.setTheme.argTheme", "Theme mode: light, dark, or system."),
			}],
		},
		handler: (accessor, theme: unknown): Promise<void> =>
			setTheme(accessor, theme),
	}));
	disposables.add(CommandsRegistry.registerCommand({
		id: ThemeCommandId.setWorkbenchBackground,
		metadata: {
			description: localize("themes.commands.setWorkbenchBackground.description", "Set the workbench page background color."),
			args: [{
				name: "backgroundColor",
				description: localize("themes.commands.setWorkbenchBackground.argBackgroundColor", "Hex background color in #rrggbb format."),
			}],
		},
		handler: (accessor, backgroundColor: unknown): Promise<void> =>
			setWorkbenchBackground(accessor, backgroundColor),
	}));
	disposables.add(CommandsRegistry.registerCommand({
		id: ThemeCommandId.setTransparentChrome,
		metadata: {
			description: localize("themes.commands.setTransparentChrome.description", "Set whether the translucent sidebar is enabled."),
			args: [{
				name: "enabled",
				description: localize("themes.commands.setTransparentChrome.argEnabled", "Whether translucent sidebar chrome is enabled."),
			}],
		},
		handler: (accessor, enabled: unknown): Promise<void> =>
			setTransparentChrome(accessor, enabled),
	}));

	disposables.add(registerAction2(class SetLightThemeAction extends Action2 {
		public constructor() {
			super({
				category: localize("themes.commands.category", "Themes"),
				f1: true,
				id: ThemeCommandId.setLightTheme,
				title: localize("themes.commands.setLightTheme", "Set Light Theme"),
				metadata: {
					description: localize("themes.commands.setLightTheme.description", "Set the workbench theme mode to light."),
				},
			});
		}

		public run(accessor: ServicesAccessor): Promise<void> {
			return setTheme(accessor, "light");
		}
	}));
	disposables.add(registerAction2(class SetDarkThemeAction extends Action2 {
		public constructor() {
			super({
				category: localize("themes.commands.category", "Themes"),
				f1: true,
				id: ThemeCommandId.setDarkTheme,
				title: localize("themes.commands.setDarkTheme", "Set Dark Theme"),
				metadata: {
					description: localize("themes.commands.setDarkTheme.description", "Set the workbench theme mode to dark."),
				},
			});
		}

		public run(accessor: ServicesAccessor): Promise<void> {
			return setTheme(accessor, "dark");
		}
	}));
	disposables.add(registerAction2(class SetSystemThemeAction extends Action2 {
		public constructor() {
			super({
				category: localize("themes.commands.category", "Themes"),
				f1: true,
				id: ThemeCommandId.setSystemTheme,
				title: localize("themes.commands.setSystemTheme", "Set System Theme"),
				metadata: {
					description: localize("themes.commands.setSystemTheme.description", "Set the workbench theme mode to follow the system."),
				},
			});
		}

		public run(accessor: ServicesAccessor): Promise<void> {
			return setTheme(accessor, "system");
		}
	}));
	disposables.add(registerAction2(class ResetWorkbenchBackgroundAction extends Action2 {
		public constructor() {
			super({
				category: localize("themes.commands.category", "Themes"),
				f1: true,
				id: ThemeCommandId.resetWorkbenchBackground,
				title: localize("themes.commands.resetWorkbenchBackground", "Reset Workbench Background"),
				metadata: {
					description: localize("themes.commands.resetWorkbenchBackground.description", "Reset the workbench page background color."),
				},
			});
		}

		public run(accessor: ServicesAccessor): Promise<void> {
			return setWorkbenchBackground(accessor, DEFAULT_WORKBENCH_BACKGROUND_COLOR);
		}
	}));
	disposables.add(registerAction2(class ToggleTransparentChromeAction extends Action2 {
		public constructor() {
			super({
				category: localize("themes.commands.category", "Themes"),
				f1: true,
				id: ThemeCommandId.toggleTransparentChrome,
				title: localize("themes.commands.toggleTransparentChrome", "Toggle Translucent Sidebar"),
				metadata: {
					description: localize("themes.commands.toggleTransparentChrome.description", "Toggle translucent sidebar chrome."),
				},
			});
		}

		public run(accessor: ServicesAccessor): Promise<void> {
			const settingsService = accessor.get(ISettingsService);
			return settingsService.updateSettings({
				transparentChrome: !getTransparentChrome(settingsService.getConductorSettings()),
			}).then(() => undefined);
		}
	}));

	return disposables;
};

const setTheme = async (
	accessor: ServicesAccessor,
	theme: unknown,
): Promise<void> => {
	if (!isThemeMode(theme)) {
		return;
	}

	await accessor.get(ISettingsService).setTheme(theme);
};

const setWorkbenchBackground = async (
	accessor: ServicesAccessor,
	backgroundColor: unknown,
): Promise<void> => {
	await accessor.get(ISettingsService).updateSettings({
		backgroundColor: normalizeWorkbenchBackgroundColor(backgroundColor),
	});
};

const setTransparentChrome = async (
	accessor: ServicesAccessor,
	enabled: unknown,
): Promise<void> => {
	await accessor.get(ISettingsService).updateSettings({
		transparentChrome: enabled === true,
	});
};

const getTransparentChrome = (
	settings: ConductorSettings | null,
): boolean => settings?.transparentChrome === true;
