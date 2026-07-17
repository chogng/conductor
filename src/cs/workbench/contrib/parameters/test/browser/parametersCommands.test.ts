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
	registerParametersCommands,
	SHOW_PARAMETERS_COMMAND_ID,
} from "src/cs/workbench/contrib/parameters/browser/parametersCommands";
import { ParametersViewContainerId } from "src/cs/workbench/services/parameters/common/parameters";
import { IViewsService } from "src/cs/workbench/services/views/common/viewsService";
import { ensureNoDisposablesAreLeakedInTestSuite } from "src/cs/base/test/common/lifecycleTestUtils";

suite("workbench/contrib/parameters/test/browser/parametersCommands", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
	test("show parameters command opens chart parameters auxiliary view", () => {
		const registration = registerParametersCommands();
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
			CommandsRegistry.getCommand(SHOW_PARAMETERS_COMMAND_ID)?.handler(accessor);
			const commandPaletteIds = getCommandPaletteIds();

			assert.deepEqual(calls, [
				`container:${ParametersViewContainerId}`,
			]);
			assert.ok(commandPaletteIds.has(SHOW_PARAMETERS_COMMAND_ID));
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
