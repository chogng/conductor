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
import { registerExportCommands } from "src/cs/workbench/contrib/export/browser/exportCommands";
import { ExportCommandId, IExportService } from "src/cs/workbench/services/export/common/export";
import { IWorkbenchLayoutService } from "src/cs/workbench/services/layout/browser/layoutService";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";

suite("workbench/contrib/export/test/browser/exportCommands", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
	test("show export command opens chart export auxiliary view", () => {
		const registration = registerExportCommands();
		const calls: string[] = [];
		const accessor = createAccessor([
			[IWorkbenchLayoutService, {
				navigateToView: (view: string) => calls.push(`view:${view}`),
				selectAuxiliaryBarView: (view: string) => calls.push(`aux:${view}`),
			}],
		]);

		try {
			CommandsRegistry.getCommand(ExportCommandId.showExport)?.handler(accessor);
			const commandPaletteIds = getCommandPaletteIds();

			assert.deepEqual(calls, ["view:chart", "aux:export"]);
			assert.ok(commandPaletteIds.has(ExportCommandId.showExport));
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
			await CommandsRegistry.getCommand(ExportCommandId.openInOrigin)?.handler(accessor);
			await CommandsRegistry.getCommand(ExportCommandId.exportOriginZip)?.handler(accessor);
			const commandPaletteIds = getCommandPaletteIds();

			assert.deepEqual(calls, ["openInOrigin", "exportOriginZip"]);
			assert.ok(commandPaletteIds.has(ExportCommandId.openInOrigin));
			assert.ok(commandPaletteIds.has(ExportCommandId.exportOriginZip));
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
