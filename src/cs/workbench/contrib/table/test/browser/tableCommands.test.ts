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
import { registerTableCommands } from "src/cs/workbench/contrib/table/browser/tableCommands";
import { TableCommandId } from "src/cs/workbench/services/table/common/table";

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
});

function getCommandPaletteIds(): Set<string> {
	return new Set(MenuRegistry.getMenuItems(MenuId.CommandPalette)
		.filter(isIMenuItem)
		.map(item => item.command.id));
}
