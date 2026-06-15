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
import type { ServicesAccessor } from "src/cs/platform/instantiation/common/instantiation";
import { registerTableCommands, setActiveTableZoomController } from "src/cs/workbench/contrib/table/browser/tableCommands";
import { TableCommandId } from "src/cs/workbench/contrib/table/common/table";

suite("workbench/contrib/table/test/browser/tableCommands", () => {
	test("table commands are command palette actions", () => {
		const registration = registerTableCommands();

		try {
			const commandPaletteIds = getCommandPaletteIds();
			for (const commandId of Object.values(TableCommandId)) {
				assert.ok(CommandsRegistry.getCommand(commandId), commandId);
				assert.ok(commandPaletteIds.has(commandId), commandId);
			}
		} finally {
			registration.dispose();
		}
	});

	test("zoom commands dispatch to the active table zoom controller", async () => {
		const registration = registerTableCommands();
		const calls: string[] = [];
		const zoomControllerRegistration = setActiveTableZoomController({
			resetZoom: () => calls.push("resetZoom") > 0,
			zoomIn: () => calls.push("zoomIn") > 0,
			zoomOut: () => calls.push("zoomOut") > 0,
		});
		const accessor = {
			get: () => {
				throw new Error("zoom commands must not resolve ITableService");
			},
		} as unknown as ServicesAccessor;

		try {
			assert.equal(await CommandsRegistry.getCommand(TableCommandId.zoomIn)?.handler(accessor), true);
			assert.equal(await CommandsRegistry.getCommand(TableCommandId.zoomOut)?.handler(accessor), true);
			assert.equal(await CommandsRegistry.getCommand(TableCommandId.resetZoom)?.handler(accessor), true);
			assert.deepEqual(calls, ["zoomIn", "zoomOut", "resetZoom"]);
		} finally {
			zoomControllerRegistration.dispose();
			registration.dispose();
		}
	});
});

function getCommandPaletteIds(): Set<string> {
	return new Set(MenuRegistry.getMenuItems(MenuId.CommandPalette)
		.filter(isIMenuItem)
		.map(item => item.command.id));
}
