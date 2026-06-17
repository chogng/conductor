/*---------------------------------------------------------------------------------------------
 * Copyright (c) Conductor Studio. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import assert from "assert";

import {
	isIMenuItem,
	MenuId,
	MenuRegistry,
} from "src/cs/platform/actions/common/actions";
import { CommandsRegistry } from "src/cs/platform/commands/common/commands";
import type { ServicesAccessor, ServiceIdentifier } from "src/cs/platform/instantiation/common/instantiation";
import { registerThemesCommands } from "src/cs/workbench/contrib/themes/browser/themesCommands";
import {
	ISettingsService,
	type ConductorSettings,
	type ISettingsService as ISettingsServiceType,
} from "src/cs/workbench/services/settings/common/settings";
import {
	DEFAULT_WORKBENCH_BACKGROUND_COLOR,
	ThemeCommandId,
} from "src/cs/workbench/services/themes/common/themeService";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";

suite("workbench/contrib/themes/test/browser/themesCommands", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
	test("theme command palette actions persist theme settings", async () => {
		const registration = registerThemesCommands();
		const calls: unknown[] = [];
		const accessor = createAccessor([
			[ISettingsService, createSettingsService({
				updateSettings: async update => {
					calls.push(["update", update]);
					return null;
				},
			})],
		]);

		try {
			await CommandsRegistry.getCommand(ThemeCommandId.setLightTheme)?.handler(accessor);
			await CommandsRegistry.getCommand(ThemeCommandId.setDarkTheme)?.handler(accessor);
			await CommandsRegistry.getCommand(ThemeCommandId.setSystemTheme)?.handler(accessor);
			const commandPaletteIds = getCommandPaletteIds();

			assert.deepStrictEqual(calls, [
				["update", { theme: "light" }],
				["update", { theme: "dark" }],
				["update", { theme: "system" }],
			]);
			assert.ok(commandPaletteIds.has(ThemeCommandId.setLightTheme));
			assert.ok(commandPaletteIds.has(ThemeCommandId.setDarkTheme));
			assert.ok(commandPaletteIds.has(ThemeCommandId.setSystemTheme));
		} finally {
			registration.dispose();
		}
	});

	test("parameterized theme commands persist normalized updates", async () => {
		const registration = registerThemesCommands();
		const updates: unknown[] = [];
		const accessor = createAccessor([
			[ISettingsService, createSettingsService({
				updateSettings: async update => {
					updates.push(update);
					return null;
				},
			})],
		]);

		try {
			await CommandsRegistry.getCommand(ThemeCommandId.setTheme)?.handler(accessor, "dark");
			await CommandsRegistry.getCommand(ThemeCommandId.setTheme)?.handler(accessor, "invalid");
			await CommandsRegistry.getCommand(ThemeCommandId.setWorkbenchBackground)?.handler(accessor, " #ABCDEF ");
			await CommandsRegistry.getCommand(ThemeCommandId.setTransparentChrome)?.handler(accessor, true);

			assert.deepStrictEqual(updates, [
				{ theme: "dark" },
				{ backgroundColor: "#abcdef" },
				{ transparentChrome: true },
			]);
		} finally {
			registration.dispose();
		}
	});

	test("appearance actions persist background and translucent sidebar settings", async () => {
		const registration = registerThemesCommands();
		const updates: unknown[] = [];
		const accessor = createAccessor([
			[ISettingsService, createSettingsService({
				getConductorSettings: () => ({ transparentChrome: true }),
				updateSettings: async update => {
					updates.push(update);
					return null;
				},
			})],
		]);

		try {
			await CommandsRegistry.getCommand(ThemeCommandId.resetWorkbenchBackground)?.handler(accessor);
			await CommandsRegistry.getCommand(ThemeCommandId.toggleTransparentChrome)?.handler(accessor);
			const commandPaletteIds = getCommandPaletteIds();

			assert.deepStrictEqual(updates, [
				{ backgroundColor: DEFAULT_WORKBENCH_BACKGROUND_COLOR },
				{ transparentChrome: false },
			]);
			assert.ok(commandPaletteIds.has(ThemeCommandId.resetWorkbenchBackground));
			assert.ok(commandPaletteIds.has(ThemeCommandId.toggleTransparentChrome));
		} finally {
			registration.dispose();
		}
	});
});

function createAccessor(
	services: readonly (readonly [ServiceIdentifier<unknown>, unknown])[],
): ServicesAccessor {
	const values = new Map<ServiceIdentifier<unknown>, unknown>(services);
	return {
		get: <T>(id: ServiceIdentifier<T>): T =>
			values.get(id as ServiceIdentifier<unknown>) as T,
	};
}

function createSettingsService(
	overrides: Partial<ISettingsServiceType>,
): ISettingsServiceType {
	return {
		_serviceBrand: undefined,
		canCheckOriginHealth: () => false,
		canManageOrigin: () => false,
		canRunOriginCleanup: () => false,
		checkOriginHealth: async () => ({}),
		chooseOriginExePath: async () => "",
		errorMessage: error => String(error),
		formatOriginError: error => String(error),
		getConductorSettings: () => null,
		getOriginExePath: async () => "",
		getOriginSettingsViewInput: () => ({}),
		getSettingsViewInput: () => null,
		mergeConductorSettings: () => undefined,
		onDidChangeConductorSettings: () => ({ dispose: () => undefined }),
		onDidChangeNumericDisplayMode: () => ({ dispose: () => undefined }),
		onDidChangeOriginSettingsViewInput: () => ({ dispose: () => undefined }),
		onDidChangeSettingsViewInput: () => ({ dispose: () => undefined }),
		runOriginCleanup: async () => ({ removedTotal: 0 }),
		update: () => undefined,
		updateOriginPlotOptions: async () => null,
		updatePlotAxisSettings: async () => null,
		updateSettings: async () => null,
		...overrides,
	};
}

function getCommandPaletteIds(): Set<string> {
	return new Set(MenuRegistry.getMenuItems(MenuId.CommandPalette)
		.filter(isIMenuItem)
		.map(item => item.command.id));
}
