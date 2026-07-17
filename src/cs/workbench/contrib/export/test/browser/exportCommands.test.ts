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
import {
	EXPORT_ORIGIN_ZIP_COMMAND_ID,
	OPEN_IN_ORIGIN_COMMAND_ID,
	registerExportCommands,
	SHOW_EXPORT_COMMAND_ID,
} from "src/cs/workbench/contrib/export/browser/exportCommands";
import {
	ExportViewContainerId,
	IExportService,
} from "src/cs/workbench/services/export/common/export";
import { IViewsService } from "src/cs/workbench/services/views/common/viewsService";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";

suite("workbench/contrib/export/test/browser/exportCommands", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
	test("show export command opens chart export auxiliary view", () => {
		const registration = registerExportCommands();
		const calls: string[] = [];
		const accessor = createAccessor([
			[IViewsService, {
				openViewContainer: async (id: string) => {
					calls.push(`container:${id}`);
					return null;
				},
			}],
		]);

		try {
			CommandsRegistry.getCommand(SHOW_EXPORT_COMMAND_ID)?.handler(accessor);
			const commandPaletteIds = getCommandPaletteIds();

			assert.deepEqual(calls, [
				`container:${ExportViewContainerId}`,
			]);
			assert.ok(commandPaletteIds.has(SHOW_EXPORT_COMMAND_ID));
		} finally {
			registration.dispose();
		}
	});

	test("origin export commands delegate to export service", async () => {
		const registration = registerExportCommands();
		const calls: string[] = [];
		const accessor = createAccessor([
			[IExportService, {
				exportOriginZip: async () => {
					calls.push("exportOriginZip");
				},
				openInOrigin: async () => {
					calls.push("openInOrigin");
				},
			}],
		]);

		try {
			await CommandsRegistry.getCommand(OPEN_IN_ORIGIN_COMMAND_ID)?.handler(accessor);
			await CommandsRegistry.getCommand(EXPORT_ORIGIN_ZIP_COMMAND_ID)?.handler(accessor);
			const commandPaletteIds = getCommandPaletteIds();

			assert.deepEqual(calls, ["openInOrigin", "exportOriginZip"]);
			assert.ok(commandPaletteIds.has(OPEN_IN_ORIGIN_COMMAND_ID));
			assert.ok(commandPaletteIds.has(EXPORT_ORIGIN_ZIP_COMMAND_ID));
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

function getCommandPaletteIds(): Set<string> {
	return new Set(MenuRegistry.getMenuItems(MenuId.CommandPalette)
		.filter(isIMenuItem)
		.map(item => item.command.id));
}
